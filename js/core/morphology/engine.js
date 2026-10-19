import { record, hasOwn, safeName, createLanguageFeatureProfile } from '../features.js';
import { createLexicon } from '../lexicon.js';
import { createMorphFeatureRegistry, flattenMorphFeatures } from './features.js';
import { executeOperations, validateOperations } from './operations.js';

const ID=/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/u;
const MAX_SLOTS=256,MAX_LEXEMES=30000,MAX_ANALYSES=64,MAX_COMPILED_FORMS=300000;
const clone=structuredClone;
const RUNTIME_PARADIGMS=new WeakMap();
const key=features=>JSON.stringify(Object.entries(features).sort(([a],[b])=>a.localeCompare(b)));
const matches=(pattern,query)=>Object.entries(pattern).every(([k,v])=>query[k]===v);
const safeText=text=>typeof text==='string' && text.length>0 && text.length<128 && !/[<>\x00-\x1f]/u.test(text);
function freezeRuntimeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRuntimeValue(child);
  return Object.freeze(value);
}

/** Return immutable parser-only forms without crossing the public clone boundary. */
export function getMorphologyRuntimeView(provider,lexemeId) {
  return RUNTIME_PARADIGMS.get(provider)?.get(lexemeId) ?? null;
}

/**
 * Finite, validated paradigm interpreter. A bounded inverse form index supplies
 * all lexeme/feature readings, including homography. It is not an HFST compiler.
 */
export function createMorphology(spec, dictionary, featureSpec, options={}) {
  const {core,lexicon:sharedLexicon}=options;
  if (!record(spec) || !record(dictionary) || !record(featureSpec) ||
      spec.version!=='1.11' || !safeName(spec.language) ||
      !record(spec.paradigms) || !Array.isArray(spec.bindings) ||
      spec.bindings.length>MAX_LEXEMES || dictionary.language!==spec.language) {
    throw new Error('Invalid morphology package or language mismatch.');
  }
  const rawProfile=options.featureProfile===undefined?spec.featureProfile:options.featureProfile;
  const featureProfile=rawProfile===undefined?undefined:
    createLanguageFeatureProfile(rawProfile,{language:spec.language});
  const registry=createMorphFeatureRegistry(featureSpec,featureProfile);
  const lexical=sharedLexicon ?? createLexicon(dictionary,{strict:dictionary.lexicalModel==='1.01'});
  if (sharedLexicon && (sharedLexicon.dictionary !== dictionary ||
      sharedLexicon.language !== spec.language)) {
    throw new Error('Shared morphology lexicon does not match its dictionary.');
  }
  if (core && !sharedLexicon) lexical.validateCore(core);
  const resolved=new Map(),states=new Map();
  const resolve=id=>{
    if(resolved.has(id))return resolved.get(id);
    if(!ID.test(id)||!hasOwn(spec.paradigms,id))throw new Error(`Unknown morphology paradigm: ${id}`);
    if(states.get(id)===1)throw new Error(`Cyclic morphology paradigm inheritance: ${id}`);
    states.set(id,1);
    const source=spec.paradigms[id];
    if (!record(source)|| !['NOUN','VERB','ADJ'].includes(source.pos) ||
        !Array.isArray(source.slots)||source.slots.length>MAX_SLOTS)throw new Error(`Invalid paradigm ${id}`);
    const parent=source.extends?resolve(source.extends):null;
    if(parent && parent.pos!==source.pos)throw new Error('Paradigm POS inheritance conflict.');
    const slots=new Map(parent?.slots||[]);
    for(const slot of source.slots){
      if (!record(slot)||!record(slot.features)||!Array.isArray(slot.steps)||
          (slot.path!==undefined && (!Array.isArray(slot.path)||slot.path.some(v=>!safeName(v)))) ||
          !Object.keys(slot.features).length)throw new Error(`Invalid paradigm slot in ${id}.`);
      registry.supports(slot.features);
      validateOperations(slot.steps);
      slots.set(key(slot.features),clone(slot));
    }
    if(!slots.size||slots.size>MAX_SLOTS)throw new Error('Invalid inherited paradigm slot count.');
    const paradigm={id,pos:source.pos,slots};resolved.set(id,paradigm);states.set(id,2);return paradigm;
  };
  for(const id of Object.keys(spec.paradigms))resolve(id);
  const bindings=new Map(),inverse=new Map(),runtimeViews=new Map();
  let compiledCount=0;
  const provenance=record(spec.provenance)?clone(spec.provenance):{};
  for(const item of spec.bindings){
    if(!record(item)||!ID.test(item.lexemeId||'')||bindings.has(item.lexemeId)||
        !ID.test(item.paradigmId||'')||!record(item.stems)||
        typeof item.stems.base!=='string'||!item.stems.base||
        !Array.isArray(item.overrides||[]))throw new Error(`Invalid morphology binding: ${item?.lexemeId}`);
    const lex=lexical.get(item.lexemeId),paradigm=resolve(item.paradigmId);
    if(!lex)throw new Error(`Morphology lexeme lacks canonical CORE mapping: ${item.lexemeId}`);
    const canonicalPos={nouns:'NOUN',verbs:'VERB',adjectives:'ADJ'}[lex.category];
    if(canonicalPos!==paradigm.pos)throw new Error(`Morphology POS mismatch: ${item.lexemeId}`);
    for(const stem of Object.values(item.stems))if(!safeText(stem))throw new Error('Invalid morphology stem.');
    const forms=[],formsByCell=new Map(),featuresByCell=new Map();
    const coreRefs=freezeRuntimeValue(lex.senses.map(s=>clone(s.coreRef)));
    const overrides=item.overrides||[];
    const blockedCells=new Set();
    const overridesByCell=new Map();
    const overrideModes=new Map();
    for(const override of overrides){
      if(!record(override)||!record(override.when)||
          !['replace','addVariant','block'].includes(override.mode)||
          !Array.isArray(override.forms)||override.forms.length>8||
          (override.mode==='block'&&override.forms.length)||
          override.forms.some(x=>!safeText(x.text)))throw new Error(`Invalid form override for ${item.lexemeId}`);
      registry.supports(override.when);
      const cell=key(override.when),previous=overrideModes.get(cell)||[];
      if ((['replace','block'].includes(override.mode) && previous.length) ||
        previous.some(mode=>['replace','block'].includes(mode))) {
        throw new Error(`Conflicting morphology override for ${item.lexemeId}.`);
      }
      previous.push(override.mode);
      overrideModes.set(cell,previous);
      if(!paradigm.slots.has(cell))throw new Error('Override targets nonexistent paradigm cell.');
      if(!overridesByCell.has(cell))overridesByCell.set(cell,[]);
      overridesByCell.get(cell).push(override);
      if(override.mode==='block')blockedCells.add(cell);
    }
    for (const [featuresKey,slot] of paradigm.slots){
      const cellFeatures=Object.freeze(clone(slot.features));
      featuresByCell.set(featuresKey,cellFeatures);
      const cellOverrides=overridesByCell.get(featuresKey)||[];
      // Exceptions take precedence over generation: a blocked cell never uses
      // its rule, a full replace cannot need it, and addVariant still requires
      // the rule to produce the base form.
      if(cellOverrides.some(override=>override.mode==='block'))continue;
      let variants=[];
      if(cellOverrides.length && cellOverrides.every(override=>override.mode==='replace')) {
        variants=cellOverrides.flatMap(override=>override.forms.map(x=>
          ({text:x.text,source:'exception',trace:[{op:'override',mode:override.mode}],variant:x.variant||'standard'})));
      } else {
        const form=executeOperations({stem:item.stems.base,stems:item.stems,steps:slot.steps});
        variants=[{text:form.text,source:'rule',trace:form.trace}];
        for(const override of cellOverrides){
          const injected=override.forms.map(x=>({text:x.text,source:'exception',trace:[{op:'override',mode:override.mode}],variant:x.variant||'standard'}));
          if(override.mode==='addVariant')variants=[...variants,...injected];
        }
      }
      const seen=new Set();
      for(const variant of variants){
        if(seen.has(variant.text))continue;
        seen.add(variant.text);
        const entry={lexemeId:item.lexemeId,lemma:lex.lemma,text:variant.text,features:cellFeatures,
          path:slot.path?.join('.')||null,source:variant.source,trace:variant.trace,
          variant:variant.variant||'standard',coreRefs,paradigmId:item.paradigmId,
          provenance};
        if(++compiledCount>MAX_COMPILED_FORMS)throw new Error('Morphology compilation exceeds form limit.');
        forms.push(entry);
        if(!formsByCell.has(featuresKey))formsByCell.set(featuresKey,[]);
        formsByCell.get(featuresKey).push(entry);
        const normalized=entry.text.toLocaleLowerCase(spec.language).normalize('NFC');
        if(!inverse.has(normalized))inverse.set(normalized,[]);
        inverse.get(normalized).push(entry);
      }
    }
    const cells=[...paradigm.slots].map(([featuresKey,slot])=>({
      features:featuresByCell.get(featuresKey),path:slot.path?.join('.')||null,
      blocked:blockedCells.has(featuresKey)
    }));
    const runtimeForms=Object.freeze(forms.map(form=>Object.freeze({
      lexemeId:form.lexemeId,text:form.text,features:form.features,
      path:form.path,source:form.source,variant:form.variant,
      coreRefs:form.coreRefs
    })));
    const runtimeCells=Object.freeze(cells.map(cell=>Object.freeze({
      features:cell.features,path:cell.path,blocked:cell.blocked
    })));
    runtimeViews.set(item.lexemeId,Object.freeze({forms:runtimeForms,cells:runtimeCells,
      supported:forms.length>0}));
    bindings.set(item.lexemeId,Object.freeze({lexeme:lex,paradigmId:item.paradigmId,
      forms,formsByCell,cells}));
  }
  const output=entry=>clone(entry);
  const provider=Object.freeze({language:spec.language,version:'1.11',
    registry,
    ...(featureProfile?{featureProfile}:{}),
    lexicon:lexical,paradigms:resolved,
    has:lexemeId=>bindings.has(lexemeId),
    availability({lexemeId,features={},exact=true}={}){
      const binding=bindings.get(lexemeId);
      if(!binding)return {supported:false,reason:'unknown_lexeme'};
      let query;
      try{query=flattenMorphFeatures(features,registry);}
      catch(error){return {supported:false,reason:error?.code||'invalid_feature_value'};}
      const found=exact?binding.formsByCell.has(key(query)):
        binding.forms.some(form=>matches(query,form.features));
      return found?{supported:true,reason:null}:
        {supported:false,reason:'missing_or_blocked_cell'};
    },
    generate({lexemeId,features={},exact=true}){
      const binding=bindings.get(lexemeId);
      if(!binding)throw new Error(`Unsupported morphology lexeme: ${lexemeId}`);
      const query=flattenMorphFeatures(features,registry);
      const matchesForm=exact?(binding.formsByCell.get(key(query))||[]):binding.forms.filter(form=>
        matches(query,form.features));
      if(!matchesForm.length){
        const error=new Error(`Missing or blocked morphology cell for ${lexemeId}.`);
        error.code='MORPHOLOGY_CELL_UNAVAILABLE';
        error.status='unsupported';
        throw error;
      }
      return matchesForm.map(output);
    },
    analyze({text}){
      if(!safeText(text))throw new Error('Invalid morphology surface form.');
      const normalized=text.toLocaleLowerCase(spec.language).normalize('NFC');
      const readings=inverse.get(normalized)||[];
      if(readings.length>MAX_ANALYSES)throw new Error('Excessive morphology ambiguity.');
      return readings.map(output);
    },
    paradigm({lexemeId}){
      if(!bindings.has(lexemeId))throw new Error(`Unknown morphology lexeme: ${lexemeId}`);
      return bindings.get(lexemeId).forms.map(output);
    },
    cells({lexemeId}){
      if(!bindings.has(lexemeId))throw new Error(`Unknown morphology lexeme: ${lexemeId}`);
      return bindings.get(lexemeId).cells.map(output);
    },
    describe(){return {language:spec.language,lexemes:bindings.size,paradigms:resolved.size,
      forms:compiledCount,featuresVersion:registry.version,
      ...(featureProfile?{featureProfile}: {})};}
  });
  RUNTIME_PARADIGMS.set(provider,runtimeViews);
  return provider;
}
