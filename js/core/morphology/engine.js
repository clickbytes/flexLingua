import { record, hasOwn, safeName } from '../features.js';
import { createLexicon } from '../lexicon.js';
import { createMorphFeatureRegistry, flattenMorphFeatures } from './features.js';
import { executeOperations, validateOperations } from './operations.js';

const ID=/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/u;
const MAX_SLOTS=256,MAX_LEXEMES=30000,MAX_ANALYSES=64,MAX_COMPILED_FORMS=300000;
const clone=structuredClone;
const key=features=>JSON.stringify(Object.entries(features).sort(([a],[b])=>a.localeCompare(b)));
const matches=(pattern,query)=>Object.entries(pattern).every(([k,v])=>query[k]===v);
const safeText=text=>typeof text==='string' && text.length>0 && text.length<128 && !/[<>\x00-\x1f]/u.test(text);

/**
 * Finite, validated paradigm interpreter. A bounded inverse form index supplies
 * all lexeme/feature readings, including homography. It is not an HFST compiler.
 */
export function createMorphology(spec, dictionary, featureSpec, {core}={}) {
  if (!record(spec) || spec.version!=='1.11' || !safeName(spec.language) ||
      !record(spec.paradigms) || !Array.isArray(spec.bindings) ||
      spec.bindings.length>MAX_LEXEMES || dictionary.language!==spec.language) {
    throw new Error('Invalid morphology package or language mismatch.');
  }
  const registry=createMorphFeatureRegistry(featureSpec);
  const lexical=createLexicon(dictionary,{strict:dictionary.lexicalModel==='1.01'});
  if (core) lexical.validateCore(core);
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
  const bindings=new Map(),inverse=new Map();
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
    const forms=[];
    const overrideModes=new Map();
    for(const override of item.overrides||[]){
      if(!record(override.when))throw new Error('Malformed morphology override.');
      const cell=key(override.when),previous=overrideModes.get(cell)||[];
      if ((['replace','block'].includes(override.mode) && previous.length) ||
        previous.some(mode=>['replace','block'].includes(mode))) {
        throw new Error(`Conflicting morphology override for ${item.lexemeId}.`);
      }
      overrideModes.set(cell,[...previous,override.mode]);
    }
    for (const [featuresKey,slot] of paradigm.slots){
      const form=executeOperations({stem:item.stems.base,stems:item.stems,steps:slot.steps});
      let variants=[{text:form.text,source:'rule',trace:form.trace}];
      for(const override of item.overrides||[]){
        if(!record(override)||!record(override.when)||
            !['replace','addVariant','block'].includes(override.mode)||
            !Array.isArray(override.forms)||override.forms.length>8||
            (override.mode==='block'&&override.forms.length)||
            override.forms.some(x=>!safeText(x.text)))throw new Error(`Invalid form override for ${item.lexemeId}`);
        registry.supports(override.when);
        if(!paradigm.slots.has(key(override.when)))throw new Error('Override targets nonexistent paradigm cell.');
        if(key(override.when)!==featuresKey)continue;
        const injected=override.forms.map(x=>({text:x.text,source:'exception',trace:[{op:'override',mode:override.mode}],variant:x.variant||'standard'}));
        if(override.mode==='block')variants=[];
        if(override.mode==='replace')variants=injected;
        if(override.mode==='addVariant')variants=[...variants,...injected];
      }
      const seen=new Set();
      for(const variant of variants){
        if(seen.has(variant.text))continue;
        seen.add(variant.text);
        const entry={lexemeId:item.lexemeId,lemma:lex.lemma,text:variant.text,features:clone(slot.features),
          path:slot.path?.join('.')||null,source:variant.source,trace:variant.trace,
          variant:variant.variant||'standard',coreRefs:lex.senses.map(s=>clone(s.coreRef)),paradigmId:item.paradigmId,
          provenance};
        if(++compiledCount>MAX_COMPILED_FORMS)throw new Error('Morphology compilation exceeds form limit.');
        forms.push(entry);
        const normalized=entry.text.toLocaleLowerCase(spec.language).normalize('NFC');
        if(!inverse.has(normalized))inverse.set(normalized,[]);
        inverse.get(normalized).push(entry);
      }
    }
    bindings.set(item.lexemeId,Object.freeze({lexeme:lex,paradigmId:item.paradigmId,forms}));
  }
  const output=entry=>clone(entry);
  return Object.freeze({language:spec.language,version:'1.11',registry,
    lexicon:lexical,paradigms:resolved,
    has:lexemeId=>bindings.has(lexemeId),
    generate({lexemeId,features={},exact=true}){
      const binding=bindings.get(lexemeId);
      if(!binding)throw new Error(`Unsupported morphology lexeme: ${lexemeId}`);
      const query=flattenMorphFeatures(features,registry);
      const matchesForm=binding.forms.filter(form=>
        matches(query,form.features)&&(exact?Object.keys(query).length===Object.keys(form.features).length:true));
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
    describe(){return {language:spec.language,lexemes:bindings.size,paradigms:resolved.size,
      forms:[...bindings.values()].reduce((sum,b)=>sum+b.forms.length,0),featuresVersion:registry.version};}
  });
}

/** Compatibility bridge: fill the legacy grammar form tables from productive paradigms.
 * Existing source forms serve as an independent oracle and are not edited here.
 */
export function materializeInflections(dictionary,morph,{assertLegacy=false}={}) {
  if(dictionary.language!==morph.language)throw new Error('Inflection language mismatch.');
  const result=clone(dictionary);
  for(const group of ['nouns','verbs'])for(const lexeme of result[group]||[]){
    if(!morph.has(lexeme.id))continue;
    const generated=morph.paradigm({lexemeId:lexeme.id});
    const legacy=lexeme.forms||{};
    const forms={};
    for(const form of generated){
      if(!form.path)continue;
      const path=form.path.split('.');
      let slot=forms;
      for(const part of path.slice(0,-1))slot=slot[part]??=(Object.create(null));
      const leaf=path.at(-1);
      // Adapter currently accepts one surface for a slot; alternate forms stay in morph API.
      if(slot[leaf]===undefined)slot[leaf]=form.text;
      if(assertLegacy){
        const old=path.reduce((obj,p)=>obj?.[p],legacy);
        if(typeof old==='string'&&old!==form.text)throw new Error(`Legacy form discrepancy for ${lexeme.id}/${form.path}: ${old} != ${form.text}`);
      }
    }
    // Preserve explicit forms in cells not yet covered by productive morphology.
    const merge=(old,next)=>{
      const merged=clone(old||{});
      for(const [k,v] of Object.entries(next))merged[k]=record(v)?merge(merged[k],v):v;
      return merged;
    };
    // When auditing compatibility, retain every source cell and use generated
    // morphology only to fill gaps. Without the audit flag, generated forms may
    // replace legacy values for an explicit migration.
    lexeme.forms=assertLegacy?merge(forms,legacy):merge(legacy,forms);
  }
  for(const lexeme of result.adjectives||[]) {
    if(!morph.has(lexeme.id))continue;
    const candidates=morph.paradigm({lexemeId:lexeme.id}).map(form=>({text:form.text,when:form.features}));
    if(assertLegacy){
      for(const original of lexeme.forms||[]){
        if(!candidates.some(candidate=>candidate.text===original.text&&
          Object.entries(original.when||{}).every(([key,value])=>candidate.when[key]===value))) {
          throw new Error(`Legacy adjective form discrepancy for ${lexeme.id}/${original.text}.`);
        }
      }
    }
    lexeme.forms=candidates;
  }
  return result;
}
