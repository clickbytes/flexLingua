/** Batch 7: independent sample ledger, never a CEFR denominator or release certificate. */
export const EVIDENCE_SOURCES = Object.freeze([
 {id:'g2',fixture:'data/coverage/a1-gold-g2.json',args:['tools/report-a1.mjs','--strict']},
 {id:'family',fixture:'tests/fixtures/gold-family-actions-a1.json',args:['--test','tests/family-actions-a1.test.js']},
 {id:'father',fixture:'tests/fixtures/gold-father-a1.json',args:['--test','tests/father-a1.test.js']},
 {id:'movement',fixture:'tests/fixtures/gold-movement-a1.json',args:['--test','tests/movement-a1.test.js']},
 {id:'actions',fixture:'tests/fixtures/gold-daily-actions-a1.json',args:['--test','tests/daily-actions-a1.test.js']},
 {id:'composition',fixture:'tests/fixtures/gold-a1-crossbatch.json',args:['--test','tests/a1-crossbatch-composition.test.js']},
 {id:'person',fixture:'tests/fixtures/gold-person-a1.json',args:['--test','tests/a1-person-gold.test.js']},
 {id:'state',fixture:'tests/fixtures/gold-state-a1.json',args:['--test','tests/a1-state-gold.test.js']},
 {id:'heldout',fixture:'data/coverage/a1-heldout-v1.json',args:['--test','tests/a1-heldout.test.js']}
]);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const word=x=>typeof x==='string'&&x.trim().length>0;
const direction=x=>x==='en'||x==='pl';
const statusNames=new Set(['pass','fail','not-run']);

function extractRows(id, corpus) {
 if(!record(corpus)||corpus.schemaVersion!==1||corpus.license!=='project-authored')
   throw new Error('Invalid source license/schema: '+id);
 let positive=[],negative=[],morphology=[],productive=[];
 if(id==='g2'){
   if(!Array.isArray(corpus.cases)||!Array.isArray(corpus.unsupported))
     throw new Error('Malformed G2 fixture.');
   positive=corpus.cases;
   negative=corpus.unsupported;
 }else if(id==='composition'){
   if(!Array.isArray(corpus.cases))throw new Error('Malformed composition fixture.');
   positive=corpus.cases;
   if(!Array.isArray(corpus.unsupported))throw new Error('Malformed composition refusals.');
   negative=corpus.unsupported;
 }else if(id==='heldout'){
   if(!Array.isArray(corpus.groups)||!Array.isArray(corpus.unsupported))
     throw new Error('Malformed VAL-02 held-out fixture.');
   const pairs=corpus.groups.flatMap(group=>{
     if(!record(group)||!word(group.concept)||!['singular','plural'].includes(group.roleNumber)||
        !Array.isArray(group.pairs))throw new Error('Invalid VAL-02 semantic group.');
     return group.pairs.map(pair=>{
       if(!record(pair)||!word(pair.id)||!word(pair.en)||!word(pair.pl)||
          !Array.isArray(pair.wrappers))throw new Error('Invalid VAL-02 pair.');
       const roles=Object.fromEntries(['agent','theme'].filter(role=>pair[role]!==undefined)
         .map(role=>[role,{concept:pair[role],number:group.roleNumber}]));
       return {...pair,core:{concept:group.concept,roles,tense:pair.tense,
         polarity:pair.polarity,wrappers:pair.wrappers}};
     });
   });
   positive=pairs.flatMap(pair=>[
     {id:pair.id+'-EN',from:'en',to:'pl',input:pair.en,expected:pair.pl,core:pair.core},
     {id:pair.id+'-PL',from:'pl',to:'en',input:pair.pl,expected:pair.en,core:pair.core}
   ]);
   negative=corpus.unsupported;
 }else if(id==='state'){
   if(!Array.isArray(corpus.enToPl)||!Array.isArray(corpus.plToEn)||
      !Array.isArray(corpus.unsupported))throw new Error('Malformed state gold fixture.');
   positive=[
     ...corpus.enToPl.map(row=>({...row,from:'en',to:'pl'})),
     ...corpus.plToEn.map(row=>({...row,from:'pl',to:'en'}))
   ];
   negative=corpus.unsupported;
 }else{
   if(!Array.isArray(corpus.enToPl)||!Array.isArray(corpus.plToEn)||
      !Array.isArray(corpus.morphology)||!Array.isArray(corpus.invalid))
     throw new Error('Malformed A1 batch fixture: '+id);
   positive=[
     ...corpus.enToPl.map(row=>({...row,from:'en',to:'pl'})),
     ...corpus.plToEn.map(row=>({...row,from:'pl',to:'en'}))
   ];
   // Historic negative fixtures may omit IDs; generate stable source-scoped IDs.
   negative=corpus.invalid.map((row,i)=>({...row,
     id:row.id===undefined?('NEG-'+id+'-'+String(i+1).padStart(2,'0')):row.id}));
   morphology=corpus.morphology;
   if(id==='actions'){
     if(!Array.isArray(corpus.productiveOnly))throw new Error('Missing productive-only evidence.');
     productive=corpus.productiveOnly;
   }
 }
 if(!positive.length||positive.length>250||negative.length>100||
    morphology.length>500||productive.length>100)
   throw new Error('Empty or oversized A1 evidence fixture: '+id);
 return {positive:[...positive,...productive],negative,morphology,productiveOnly:productive};
}

function explicitConcepts(row) {
 const concepts=[];
 if(row.core){
   if(!record(row.core))throw new Error('Invalid semantic gold signature');
   if(['identity','predication','possession'].includes(row.core.kind)){
     if(row.core.kind==='predication')concepts.push(row.core.predicate);
     for(const role of Object.values(row.core.roles||{}))
       if(role?.concept)concepts.push(role.concept);
   }else{
     concepts.push(row.core.concept);
     for(const role of Object.values(row.core.roles||{}))concepts.push(role?.concept);
   }
 }else if(row.shape){
   if(!record(row.shape))throw new Error('Invalid composition signature');
   if(row.shape.concept)concepts.push(row.shape.concept);
   if(Array.isArray(row.shape.concepts))concepts.push(...row.shape.concepts);
 }else{
   concepts.push(row.concept);
   if(row.agent)concepts.push(row.agent);
   if(row.theme)concepts.push(row.theme);
 }
 if(!concepts.length||concepts.some(x=>!word(x)))
   throw new Error('Positive evidence lacks explicit semantic annotation: '+row.id);
 return [...new Set(concepts)];
}

/** Joins declared source observations and *real* Node exit statuses without inventing an A1 %. */
export function buildA1EvidenceLedger({manifest,ontology,corpora,checks}) {
 if(!record(manifest)||manifest.version!==2||manifest.license!=='project-authored'||
    manifest.scope?.completeness!=='project-authored-subset'||
    !Array.isArray(manifest.targets)||!manifest.targets.length||manifest.targets.length>250||
    !record(ontology)||!record(ontology.concepts)||!record(corpora)||!record(checks))
   throw new Error('Invalid evidence inputs/target registry.');
 const targetIds=new Set();
 for(const item of manifest.targets){
   const coreId=item?.coreRef?.id;
   if(!item||!word(item.id)||targetIds.has(item.id)||item.coreRef?.kind!=='concept'||
      !['concept','construction'].includes(item.unitType)||
      !['required','deferred','unsupported'].includes(item.scopeStatus)||
      !word(coreId)||!record(ontology.concepts[coreId]))
     throw new Error('Duplicate or unknown A1 target: '+String(item?.id));
   targetIds.add(item.id);
 }
 const seenIds=new Set(),utterances=new Map(),sources=[],observations=[];
 let totalPositive=0,totalNegative=0,totalMorphology=0,totalProductiveOnly=0;
 for(const spec of EVIDENCE_SOURCES){
   const check=checks[spec.id],rows=extractRows(spec.id,corpora[spec.id]);
   if(!record(check)||!statusNames.has(check.status)||
      (check.status==='pass'&&check.exitCode!==0)||
      (check.status==='not-run'&&check.exitCode!==null))
     throw new Error('Invalid or fabricated test result for '+spec.id);
   for(const row of [...rows.positive,...rows.negative]){
     if(!record(row)||!word(row.id)||seenIds.has(row.id)||!word(row.input)||
       !direction(row.from)||(rows.positive.includes(row)&&
       (!direction(row.to)||row.from===row.to||!word(row.expected))))
       throw new Error('Invalid or duplicate sample ID: '+String(row?.id));
     seenIds.add(row.id);
   }
   for(const form of rows.morphology){
     if(!record(form)||!direction(form.language)||!word(form.lexemeId)||
        !word(form.text)||!record(form.features))
       throw new Error('Invalid morphology evidence in '+spec.id);
   }
   const byDirection={
     'en->pl':rows.positive.filter(x=>x.from==='en'&&x.to==='pl').length,
     'pl->en':rows.positive.filter(x=>x.from==='pl'&&x.to==='en').length
   };
   if(byDirection['en->pl']<1||byDirection['pl->en']<1)
     throw new Error('Both directions required for '+spec.id);
   for(const row of rows.positive){
     const ids=explicitConcepts(row);
     for(const concept of ids){
       if(!Object.hasOwn(ontology.concepts,concept))
         throw new Error('Unknown sample CORE concept: '+concept);
     }
     observations.push({source:spec.id,id:row.id,from:row.from,to:row.to,
       concepts:ids,verified:check.status==='pass'});
     const fingerprint=row.from+':'+row.input;
     if(!utterances.has(fingerprint))utterances.set(fingerprint,[]);
     utterances.get(fingerprint).push({source:spec.id,id:row.id});
   }
   totalPositive+=rows.positive.length;
   totalNegative+=rows.negative.length;
   totalMorphology+=rows.morphology.length;
   totalProductiveOnly+=rows.productiveOnly.length;
   sources.push({
     id:spec.id,fixture:spec.fixture,testArgs:spec.args,
     status:check.status,exitCode:check.exitCode,
     ...(check.status==='fail'&&check.error?{error:String(check.error).slice(-1800)}:{}),
     samples:{positive:rows.positive.length,negative:rows.negative.length,
       morphologyCells:rows.morphology.length,productiveOnly:rows.productiveOnly.length},
     byDirection
   });
 }
 const targets=manifest.targets.map(item=>{
   const coreId=item.coreRef.id;
   const refs=observations.filter(x=>x.concepts.includes(coreId));
   const verified=refs.filter(x=>x.verified);
   const verifiedSources=[...new Set(verified.map(x=>x.source))];
   const directions={
     'en->pl':verified.filter(x=>x.from==='en').length,
     'pl->en':verified.filter(x=>x.from==='pl').length
   };
   const state=verified.length?
     (directions['en->pl']&&directions['pl->en']?'sampled-both-directions':'sampled-one-direction'):
     (refs.length?'declared-unverified':'not-explicitly-annotated');
   return {id:coreId,matrixId:item.id,unitType:item.unitType,
     scopeStatus:item.scopeStatus,coreRef:item.coreRef,domain:item.domain,kind:item.kind,state,
     annotatedCases:refs.length,verifiedCases:verified.length,
     sourceIds:[...new Set(refs.map(x=>x.source))],
     verifiedSourceIds:verifiedSources,
     verifiedByDirection:directions};
 });
 const overlapped=[...utterances.entries()].filter(([,rows])=>
   new Set(rows.map(x=>x.source)).size>1).map(([,rows])=>rows);
 const passes=sources.filter(x=>x.status==='pass').length,
   fails=sources.filter(x=>x.status==='fail').length,
   notRun=sources.filter(x=>x.status==='not-run').length;
 return {
   schemaVersion:1,scope:'finite-independent-project-authored-sample-ledger-not-cefr',
   provenance:{source:'project-authored',notOfficialOxford:true},
   totals:{sources:sources.length,positive:totalPositive,negative:totalNegative,
     morphologyCells:totalMorphology,productiveOnly:totalProductiveOnly,
     crossSourceDuplicateUtterances:overlapped.length},
   verification:{status:fails?'fail':notRun?'not-run':'pass',
     suitesPassed:passes,suitesFailed:fails,suitesNotRun:notRun,
     positiveVerified:observations.filter(x=>x.verified).length},
   sources,targets,
   targetSummary:{
     total:targets.length,
     sampledBothDirections:targets.filter(x=>x.state==='sampled-both-directions').length,
     sampledOneDirection:targets.filter(x=>x.state==='sampled-one-direction').length,
     declaredUnverified:targets.filter(x=>x.state==='declared-unverified').length,
     notExplicitlyAnnotated:targets.filter(x=>x.state==='not-explicitly-annotated').length
   },
   overlappingInputIds:overlapped.slice(0,25),
   cefr:{level:'A1',percentage:null,status:'not-measured',
     reason:'Small authored and overlapping samples with no representative CEFR denominator.'},
   release:{verified:false,reason:'Gold suites alone do not verify the full Node regression and release gate.'}
 };
}
