/** Honest A1 gap audit. Counts project-authored checklist deficits; never produces CEFR proficiency %. */
import {analyzeCoverage} from './coverage-a1-lib.mjs';

const groups=['nouns','verbs','adjectives','degrees','quantifiers','attitudes','functionWords','modals'];
const domains=new Set(['people','family','objects','places','activities','descriptions']);
const kinds=new Set(['entity','event','property']);
const statuses=['unmodelled','missing-lexicon','missing-morphology','missing-frame','gold-failed','without-gold','pilot-exercised'];

export function auditA1Gaps({manifest,inventory,corpus,benchmark}){
  if(!manifest||manifest.version!==1||manifest.license!=='project-authored'||
      !Array.isArray(manifest.targets)||!manifest.targets.length||manifest.targets.length>250||
      !corpus||!Array.isArray(corpus.cases)||!benchmark||!Array.isArray(benchmark.results))
    throw new Error('Invalid A1 checklist or independent benchmark evidence.');
  const ids=new Set();
  for(const row of manifest.targets){
    if(!row||typeof row.id!=='string'||!/^[-a-z0-9_.]+$/u.test(row.id)||
        ids.has(row.id)||!domains.has(row.domain)||!kinds.has(row.kind))
      throw new Error('Invalid or duplicate A1 checklist target: '+String(row?.id));
    ids.add(row.id);
  }
  // Also validates duplicate lexical IDs, CORE refs and orphan morphology bindings.
  const structural=analyzeCoverage(inventory);
  const lex={pl:new Map(),en:new Map()};
  const morph={pl:new Set(inventory.plMorph.bindings.map(x=>x.lexemeId)),
    en:new Set(inventory.enMorph.bindings.map(x=>x.lexemeId))};
  for(const language of ['pl','en']){
    for(const group of groups)for(const item of inventory[language][group]||[]){
      for(const sense of item.senses||[]){
        if(sense.coreRef?.kind!=='concept')continue;
        const id=sense.coreRef.id;
        if(!lex[language].has(id))lex[language].set(id,[]);
        lex[language].get(id).push(item.id);
      }
    }
  }
  const results=new Map();
  for(const row of benchmark.results){
    if(results.has(row.id))throw new Error('Duplicate benchmark evidence ID: '+row.id);
    results.set(row.id,row);
  }
  const audits=manifest.targets.map(({id,domain,kind})=>{
    const concept=inventory.ontology.concepts[id];
    const ontologyPresent=Boolean(concept&&concept.type===kind);
    const reference=Object.fromEntries(['pl','en'].map(language=>{
      const lexemeIds=lex[language].get(id)||[];
      return [language,{
        lexemeIds,
        morphologyLexemeIds:lexemeIds.filter(lexeme=>morph[language].has(lexeme)),
        ...(kind==='event'?{grammarFrame:Boolean(inventory[language+'Grammar'].frames?.[id])}:{})
      }];
    }));
    const sample=corpus.cases.filter(row=>row.core?.concept===id||
      Object.values(row.core?.roles||{}).some(entity=>entity.concept===id));
    const passing=sample.filter(row=>results.get(row.id)?.kind==='positive'&&results.get(row.id)?.passed===true);
    const failing=sample.filter(row=>!results.get(row.id)||results.get(row.id).passed!==true);
    const gaps=[];
    if(!ontologyPresent)gaps.push('core:ontology');
    for(const language of ['pl','en']){
      if(!reference[language].lexemeIds.length)gaps.push(language+':lexicon');
      else if(!reference[language].morphologyLexemeIds.length)
        gaps.push(language+':morphology');
      if(kind==='event'&&!reference[language].grammarFrame)gaps.push(language+':frame');
    }
    if(!sample.length)gaps.push('gold:not-exercised');
    if(failing.length)gaps.push('gold:failed-or-missing-result');
    const hasLexGap=gaps.some(x=>x.endsWith(':lexicon'));
    const hasMorphGap=gaps.some(x=>x.endsWith(':morphology'));
    const hasFrameGap=gaps.some(x=>x.endsWith(':frame'));
    const status=!ontologyPresent?'unmodelled':
      hasLexGap?'missing-lexicon':
      hasMorphGap?'missing-morphology':
      hasFrameGap?'missing-frame':
      failing.length?'gold-failed':
      !passing.length?'without-gold':'pilot-exercised';
    return {id,domain,kind,status,ontologyPresent,pl:reference.pl,en:reference.en,
      independentGold:{observedIds:sample.map(x=>x.id),passedIds:passing.map(x=>x.id),
        failedOrMissingIds:failing.map(x=>x.id)},gaps};
  });
  const byDomain=Object.fromEntries([...domains].map(domain=>{
    const list=audits.filter(x=>x.domain===domain);
    return [domain,{targets:list.length,unmodelled:list.filter(x=>!x.ontologyPresent).length,
      bilingualLexical:list.filter(x=>x.pl.lexemeIds.length&&x.en.lexemeIds.length).length,
      exercised:list.filter(x=>x.independentGold.passedIds.length>0).length}];
  }));
  return {
    schemaVersion:1,scope:'project-authored-A1-checklist-gaps-not-cefr',
    source:manifest.origin,license:manifest.license,
    targetCount:audits.length,
    statusCounts:Object.fromEntries(statuses.map(status=>[status,audits.filter(x=>x.status===status).length])),
    byDomain,
    targets:audits,
    validation:{structuralScope:structural.scope,benchmarkStatus:benchmark.status,
      benchmarkCases:benchmark.summary.total},
    cefr:{level:'A1',percentage:null,status:'not-measured',
      reason:'Curated planning targets are not a CEFR denominator; presence or a passing sample does not establish proficiency.'}
  };
}
