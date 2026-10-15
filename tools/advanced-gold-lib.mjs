const categories={
  C1:['register','paraphrase','sense','refusal'],
  C2:['idiom','ambiguity','semantic_error','refusal']
};
export const ADVANCED_GOLD_SHA256='fff83c1f6bd7808ee02040bcad2f0cc8e1ad2d1ac6ad7f3a4a5d5afada1997b6';

/** Separate bounded C1/C2 evidence; no values enter the A1 release ledger. */
export function buildAdvancedGoldReport(fixture,targets,results,fixtureSha256){
  if(fixture?.schemaVersion!==1||fixture.suite!=='ADV-GOLD-01'||
      fixtureSha256!==ADVANCED_GOLD_SHA256||
      fixture.license!=='project-authored'||fixture.representativeCefrDenominator!==null||
      !Array.isArray(fixture.cases)||fixture.cases.length!==200||
      targets?.version!==1||targets.scope?.caseCount!==100||
      targets.scope?.representativeCefrDenominator!==null||
      !Array.isArray(results)||results.length!==200)
    throw new Error('Invalid advanced benchmark inputs.');
  const ids=new Set(),resultIds=new Set();
  const levels={};
  for(const level of ['C1','C2']){
    const cases=fixture.cases.filter(row=>row.level===level);
    if(cases.length!==100)throw new Error(`Expected 100 ${level} cases.`);
    const byCategory={};
    for(const category of categories[level]){
      if(cases.filter(row=>row.category===category).length!==25)
        throw new Error(`Expected 25 ${level}/${category} cases.`);
      byCategory[category]={passed:0,failed:0};
    }
    levels[level]={cases:100,passed:0,failed:0,byCategory,
      byDirection:{'en->pl':{passed:0,failed:0},'pl->en':{passed:0,failed:0}}};
  }
  for(const row of fixture.cases){
    if(!/^C[12]-\d{3}$/u.test(row?.id)||ids.has(row.id)||
        !categories[row.level]?.includes(row.category)||
        !['en','pl'].includes(row.from)||row.to!==(row.from==='en'?'pl':'en')||
        !row.input||!row.expectation?.status)
      throw new Error('Invalid advanced benchmark case.');
    ids.add(row.id);
  }
  for(const result of results){
    if(!ids.has(result?.id)||resultIds.has(result.id)||typeof result.passed!=='boolean')
      throw new Error('Invalid advanced benchmark result.');
    resultIds.add(result.id);
  }
  const resultById=new Map(results.map(row=>[row.id,row]));
  for(const row of fixture.cases){
    const passed=resultById.get(row.id).passed;
    const slot=passed?'passed':'failed';
    const level=levels[row.level];
    level[slot]++;
    level.byCategory[row.category][slot]++;
    level.byDirection[`${row.from}->${row.to}`][slot]++;
  }
  return {schemaVersion:1,suite:'ADV-GOLD-01',levels,
    limitations:{representativeCefrDenominator:null,independentReview:false,
      certification:false,caseOracles:'project-authored template judgments'}};
}
