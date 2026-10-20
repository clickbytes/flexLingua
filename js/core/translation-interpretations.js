import {meaningKey, translationErrorStatus, withUncertainties} from './translation-result.js';
import {EngineError} from './errors.js';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const vector = score => [score.assumptions ?? Infinity, -score.contextRules,
  -score.ontologyLinks, -score.lexicalPreference];
function compareScore(left, right) {
  const a = vector(left), b = vector(right);
  for (let index = 0; index < a.length; index++) {
    const order = compare(a[index], b[index]);
    if (order) return order;
  }
  return 0;
}

function realizationAssumptions(baseLosses, rowLosses, explicit) {
  const unique=new Map();
  const add=(item,source)=>{
    const assumption={path:item.path,feature:item.feature,
      reason:item.reason??item.cause};
    unique.set(JSON.stringify([assumption.path,assumption.feature,assumption.reason]),
      {...assumption,source});
  };
  for(const assumption of explicit)add(assumption,'LanguagePlugin.realization.assumptions');
  for(const loss of baseLosses)if(loss.status==='ambiguous')
    add(loss,'LanguagePlugin.informationLoss');
  for(const loss of rowLosses)if(loss.status==='ambiguous')
    add(loss,'LanguagePlugin.realization');
  return [...unique.entries()].sort(([left],[right])=>compare(left,right)).map(([,item])=>item);
}

function contextEvidence(meaning, context, ontology) {
  const evidence = [];
  let senseMeaning = meaning;
  while (['question','scope','modality'].includes(senseMeaning?.type)) {
    senseMeaning = senseMeaning.type === 'question' ? senseMeaning.proposition : senseMeaning.operand;
  }
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const [role, ref] of Object.entries(node.roles ?? {})) {
      const rolePath = `${path}/roles/${role}`;
      if (node === senseMeaning && ref.concept && context.senses?.[role] === ref.concept) {
        evidence.push({ruleId:'context.explicit-sense', path:`${rolePath}/concept`,
          concept:ref.concept, source:`request.context.senses.${role}`});
      }
      for (const topic of [...new Set(context.topics ?? [])].sort()) {
        if (!ref.concept || !ontology.relatedToTopic(ref.concept, topic)) continue;
        let link;
        if (ontology.isA(ref.concept, topic) || ontology.isA(topic, ref.concept)) {
          link = {relation:'is_a', target:topic};
        } else {
          for (const relation of Object.keys(ontology.relationTypes).sort()) {
            const target = ontology.relationTargets(ref.concept, relation).sort()
              .find(target => ontology.isA(topic, target) || ontology.isA(target, topic));
            if (target) { link = {relation, target}; break; }
          }
        }
        if (link) evidence.push({ruleId:'ontology.topic-link', path:`${rolePath}/concept`,
          concept:ref.concept, topic, ...link, source:'ontology.relationTargets/isA',
          constraint:'preference'});
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') visit(value,
        `${path}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`);
    }
  }
  visit(meaning, '#');
  return evidence;
}

function contextBoundAddresseeNumber(meaning,context) {
  const role=meaning?.roles?.agent;
  if(role?.referent?.kind!=='deictic'||role.referent.anchor!=='addressee')return false;
  const addressees=new Set((context.bindings||[])
    .filter(binding=>binding.path==='#/roles/agent').map(binding=>binding.referentId));
  const numbers=new Set((context.facts||[]).filter(fact=>addressees.has(fact.referentId)&&
    fact.feature==='number'&&['singular','plural'].includes(fact.value)&&
    ['request','session'].includes(fact.source?.kind)).map(fact=>fact.value));
  return numbers.size===1;
}

/** Realize bounded complete readings; ranking is preference, never disambiguation. */
export function realizeInterpretations(engine, candidates, options) {
  const context = options.context ?? {};
  const requestedPreviewId=options.previewId;
  const ids = new Map([...candidates].sort((a,b) => compare(meaningKey(a.interlingua), meaningKey(b.interlingua)))
    .map((candidate, index) => [candidate, `i${index + 1}`]));
  const outputs = [];
  let limitError;
  const interpretations = candidates.map(candidate => {
    const id = ids.get(candidate), meaning = candidate.interlingua;
    const reasons = contextEvidence(meaning, context, engine.ontology);
    reasons.push(...(candidate.contextReport?.decisions ?? [])
      .filter(decision => ['matched','bound'].includes(decision.action)));
    const score = {assumptions:null,
      contextRules:reasons.filter(reason => ['context.explicit-sense','context.explicit-fact'].includes(reason.ruleId)).length,
      ontologyLinks:reasons.filter(reason => reason.ruleId === 'ontology.topic-link').length,
      lexicalPreference:candidate.lexicalPreference ?? 0};
    reasons.push({ruleId:'source.lexical-preference', source:'LanguagePlugin.analysis.score',
      value:score.lexicalPreference});
    let output, error;
    try {
      output = engine.realize({interlingua:meaning,...options,
        sourceSegments:candidate.sourceSegments||[],construction:context.construction,
        omitDeicticSubject:contextBoundAddresseeNumber(meaning,context)});
    } catch (caught) {
      const status = translationErrorStatus(caught);
      if (!['unsupported','resource_limit'].includes(status)) throw caught;
      error = caught;
      if (status === 'resource_limit') limitError ??= caught;
    }
    outputs.push({candidate, output, error});
    const realizations = [];
    if (output) {
      const usesRealizationRows=Array.isArray(output.realizations)&&output.realizations.length>0;
      const rows=usesRealizationRows?
        output.realizations:[...new Set([output.text,...(output.alternatives||[])])]
          .map(text=>({text,kind:'equivalent_expression',assumptions:[],informationLoss:[]}));
      for (const [index, row] of rows.entries()) {
        const text=row.text;
        const informationLoss=[...(output.informationLoss??[]),...(row.informationLoss??[])];
        const details=realizationAssumptions(output.informationLoss??[],row.informationLoss??[],
          row.assumptions??[]);
        const assumptions=details.map(({path,feature,reason})=>({path,feature,reason}));
        const assumptionReasons=details.length?details.map(item=>({
          ruleId:'target.additional-assumption',path:item.path,feature:item.feature,
          cause:item.reason,source:item.source})): [{ruleId:'target.no-additional-assumption',
          source:'LanguagePlugin.informationLoss'}];
        realizations.push({id:`${id}.r${index + 1}`, interpretationId:id, text,
          kind:assumptions.length?'additional_assumption':row.kind||'equivalent_expression',
          assumptions,
          informationLoss, diagnostics:output.diagnostics ?? [],
          warnings:output.warnings ?? [], score:{...score,assumptions:assumptions.length},
          reasons:[...assumptionReasons,{ruleId:'target.lexical-order',
            source:'LanguagePlugin.realize', value:index}],
          uncertainties:withUncertainties({...output,text,status:'ok',meaning,
            informationLoss,assumptions,alternatives:usesRealizationRows?
              rows.filter(candidate=>candidate!==row &&
                candidate.kind!=='additional_assumption' &&
                !(candidate.assumptions??[]).length &&
                !(candidate.informationLoss??[]).some(loss=>loss.status==='ambiguous'))
                .map(candidate=>candidate.text):output.alternatives??[]}).uncertainties,
          ...(Array.isArray(row.segments)?{segments:row.segments}:{})});
      }
      const best=realizations.reduce((current,row)=>!current||
        compareScore(row.score,current.score)<0?row:current,null);
      score.assumptions=best.score.assumptions;
      reasons.push(...best.reasons.filter(reason=>reason.ruleId!=='target.lexical-order'));
    }
    return {id, meaning, lexicalSenses:candidate.lexicalSenses, score, reasons,
      ...(candidate.surface ? {surface:candidate.surface} : {}),
      ...(candidate.contextReport ? {contextReport:candidate.contextReport} : {}),
      ruleIds:[...new Set(reasons.map(reason => reason.ruleId))],
      status:error ? translationErrorStatus(error) : 'ok',
      diagnostics:error ? [{code:error.code, message:'No complete target realization is available for this reading.'}] : [],
      realizations};
  }).sort((a,b) => compareScore(a.score,b.score) || compare(a.id,b.id));
  let rank = 1;
  interpretations.forEach((item,index) => {
    if (index && compareScore(item.score, interpretations[index - 1].score)) rank = index + 1;
    item.rank = rank;
  });
  const defaultPreviewId=limitError?null:
    interpretations.find(item=>item.realizations.length)?.realizations.reduce((best,row)=>
      compareScore(row.score,best.score)<0?row:best).id??null;
  const allRealizations=interpretations.flatMap(item=>item.realizations.map(realization=>({
    ...realization,meaning:item.meaning
  })));
  // Incomplete semantic search cannot authorize any preview, even when the
  // caller names a realization that happened to finish before the limit.
  if(limitError)return {interpretations,outputs,limitError,previewId:null,preview:null};
  if(requestedPreviewId!==undefined&&
      (typeof requestedPreviewId!=='string'||!/^i[1-9][0-9]*\.r[1-9][0-9]*$/u.test(requestedPreviewId)))
    throw new EngineError('INVALID_PREVIEW_ID','Preview ID is invalid.',{status:'invalid'});
  if(requestedPreviewId!==undefined&&!allRealizations.some(item=>item.id===requestedPreviewId))
    throw new EngineError('INVALID_PREVIEW_ID','The requested complete realization was not found.',
      {status:'invalid'});
  const previewId=requestedPreviewId??defaultPreviewId;
  const selected=allRealizations.find(item=>item.id===previewId);
  const preview=selected?{id:selected.id,interpretationId:selected.interpretationId,
    meaning:selected.meaning,text:selected.text,kind:selected.kind,assumptions:selected.assumptions,
    informationLoss:selected.informationLoss,
    ...(Array.isArray(selected.segments)?{segments:selected.segments}:{})}:null;
  return {interpretations,outputs,limitError,previewId,preview};
}
