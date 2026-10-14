/** Structural PL/EN coverage inventory; not a CEFR proficiency measure. */
export function analyzeCoverage({pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed}) {
  if(seed.version!==1 || !Array.isArray(seed.concepts) || !Array.isArray(seed.constructions))
    throw new Error('Invalid A1 pilot manifest');
  const dictionaries={pl,en}, morph={pl:plMorph,en:enMorph}, grammar={pl:plGrammar,en:enGrammar};
  const groups=['nouns','verbs','adjectives','degrees','quantifiers','attitudes','functionWords','modals'];
  const languages={}, indexes={};
  for(const lang of ['pl','en']){
    if(dictionaries[lang].language!==lang || morph[lang].language!==lang || grammar[lang].language!==lang)
      throw new Error('Language mismatch: '+lang);
    const entries=groups.flatMap(group=>(dictionaries[lang][group]||[]).map(row=>({...row,group})));
    const ids=new Set(), refs=new Map();
    for(const lex of entries){
      if(!lex.id || ids.has(lex.id))throw new Error('Duplicate lexeme ID: '+lex.id);
      ids.add(lex.id);
      for(const sense of lex.senses||[]){
        if(!sense.coreRef?.id || !sense.coreRef?.kind)throw new Error('Missing CORE reference: '+lex.id);
        const collections={
          concept:ontology.concepts,
          operator:ontology.operators,
          grammaticalFunction:ontology.grammaticalFunctions
        };
        const registry=Object.hasOwn(collections,sense.coreRef.kind)
          ? collections[sense.coreRef.kind] : null;
        if(!registry || !Object.hasOwn(registry,sense.coreRef.id))
          throw new Error('Unknown CORE reference: '+sense.coreRef.kind+':'+sense.coreRef.id);
        const key=sense.coreRef.kind+':'+sense.coreRef.id;
        if(!refs.has(key))refs.set(key,[]);
        refs.get(key).push(lex.id);
      }
    }
    const bound=new Set();
    for(const row of morph[lang].bindings||[]){
      if(bound.has(row.lexemeId))throw new Error('Duplicate morphology binding: '+row.lexemeId);
      if(!ids.has(row.lexemeId))throw new Error('Orphan morphology binding: '+row.lexemeId);
      if(!morph[lang].paradigms[row.paradigmId])throw new Error('Unknown morphology paradigm: '+row.paradigmId);
      bound.add(row.lexemeId);
    }
    const eligible=entries.filter(x=>['nouns','verbs','adjectives'].includes(x.group));
    languages[lang]={
      lexemes:entries.length,
      lexemesByGroup:Object.fromEntries(groups.map(group=>[group,(dictionaries[lang][group]||[]).length])),
      senseRecords:entries.reduce((sum,x)=>sum+(x.senses||[]).length,0),
      distinctCoreReferences:refs.size,
      morphology:{eligibleLexemes:eligible.length,boundLexemes:eligible.filter(x=>bound.has(x.id)).length,
        missingLexemeIds:eligible.filter(x=>!bound.has(x.id)).map(x=>x.id).sort(),
        paradigms:Object.keys(morph[lang].paradigms||{}).length},
      grammarFrames:Object.keys(grammar[lang].frames||{}).sort()
    };
    indexes[lang]={refs,bound};
  }
  const plKeys=[...indexes.pl.refs.keys()],enKeys=new Set(indexes.en.refs.keys());
  const used=new Set();
  const concepts=seed.concepts.map(item=>{
    if(!item.id || used.has(item.id)||!ontology.concepts[item.id])
      throw new Error('Unknown or duplicate pilot concept: '+item.id);
    used.add(item.id);
    const key='concept:'+item.id;
    const langs={};
    for(const code of ['pl','en']){
      const ids=indexes[code].refs.get(key)||[];
      langs[code]={lexemeIds:ids,boundLexemeIds:ids.filter(id=>indexes[code].bound.has(id))};
    }
    return {id:item.id,category:item.category,pl:langs.pl,en:langs.en,
      hasBothLexicons:langs.pl.lexemeIds.length>0&&langs.en.lexemeIds.length>0,
      hasBothMorphologies:langs.pl.boundLexemeIds.length>0&&langs.en.boundLexemeIds.length>0,
      translationVerified:false};
  });
  const usedConstructions=new Set();
  const constructions=seed.constructions.map(item=>{
    if(!item.id||usedConstructions.has(item.id))throw new Error('Duplicate/missing construction ID: '+item.id);
    usedConstructions.add(item.id);
    return {id:item.id,
      plDeclaredFrame:item.frame?Boolean(grammar.pl.frames?.[item.frame]):null,
      enDeclaredFrame:item.frame?Boolean(grammar.en.frames?.[item.frame]):null,
      translationVerified:false,status:'needs-independent-test'};
  });
  return {schemaVersion:1,scope:'structural-inventory-only',languages,
    sharedCoreReferences:plKeys.filter(k=>enKeys.has(k)).length,
    plOnlyReferences:plKeys.filter(k=>!enKeys.has(k)).sort(),
    enOnlyReferences:[...enKeys].filter(k=>!indexes.pl.refs.has(k)).sort(),
    pilot:{source:seed.source,license:seed.license,notOfficialOxford:true,
      conceptCount:concepts.length,bilingualConcepts:concepts.filter(x=>x.hasBothLexicons).length,
      bilingualMorphologyConcepts:concepts.filter(x=>x.hasBothMorphologies).length,
      concepts,constructions},
    cefr:{level:'A1',percentage:null,status:'not-measured',
      reason:'Pilot is not a complete licensed CEFR reference or independent translation benchmark'}};
}
