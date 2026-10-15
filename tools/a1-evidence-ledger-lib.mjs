import {createHash} from 'node:crypto';

export const DIALOGUE_GOLD_SHA256='31511c82e602783982a54bb091c969d9612833a454bd31c52c3b39914019c163';

/** Build scene- and act-level results from the separately executed dialogue gold suite. */
export function buildDialogueGoldReport({fixture,fixtureSha256,results}={}) {
 if(!record(fixture)||fixture.schemaVersion!==1||fixture.license!=='project-authored'||
    !Array.isArray(fixture.scenes)||fixture.scenes.length<20||fixture.scenes.length>100||
    fixtureSha256!==DIALOGUE_GOLD_SHA256||!Array.isArray(results))
   throw new Error('Invalid or unpinned dialogue gold fixture/report inputs.');
 const sceneIds=new Set(),resultById=new Map();
 for(const scene of fixture.scenes) {
   if(!record(scene)||!/^DIAL-A1-[0-9]{2,}$/u.test(scene.id)||sceneIds.has(scene.id)||
      !['en','pl'].includes(scene.from)||scene.to!==(scene.from==='en'?'pl':'en')||
      !word(scene.fact)||!word(scene.question)||!word(scene.expectedText)||
      !['answer','confirm'].includes(scene.expectedAct)||scene.expectedOutcome!=='answer'||
      !record(scene.confidence)||scene.confidence.level!=='grounded'||
      !Number.isInteger(scene.confidence.evidenceCount)||scene.confidence.evidenceCount<1)
     throw new Error('Invalid or duplicate dialogue scene: '+String(scene?.id));
   sceneIds.add(scene.id);
 }
 for(const result of results) {
   if(!record(result)||!sceneIds.has(result.id)||resultById.has(result.id)||
      !['pass','fail'].includes(result.status))
     throw new Error('Invalid or duplicate dialogue scene result: '+String(result?.id));
   resultById.set(result.id,result.status);
 }
 if(resultById.size!==sceneIds.size)
   throw new Error('Dialogue gold report must contain one result for every scene.');
 const byDirection={'en->pl':{passed:0,failed:0},'pl->en':{passed:0,failed:0}};
 const byAct=Object.fromEntries(['assert','ask','answer','confirm','refuse'].map(act=>
   [act,{passed:0,failed:0}]));
 const scenes=fixture.scenes.map(scene=>{
   const status=resultById.get(scene.id),direction=scene.from+'->'+scene.to;
   const key=status==='pass'?'passed':'failed';
   byDirection[direction][key]++;
   for(const act of ['assert','ask',scene.expectedAct])byAct[act][key]++;
   return {id:scene.id,direction,turns:3,acts:[
     {act:'assert',status},{act:'ask',status},{act:scene.expectedAct,status}
   ],expectedOutcome:scene.expectedOutcome,confidence:scene.confidence};
 });
 const passed=scenes.filter(scene=>scene.acts[0].status==='pass').length;
 return {schemaVersion:1,suite:'DIAL-05',fixtureSha256,
   totals:{scenes:scenes.length,passed,failed:scenes.length-passed,
     minimumTurns:Math.min(...scenes.map(scene=>scene.turns))},
   byDirection,byAct,scenes};
}

/** VAL-03: declared sample catalog joined to real Node suite executions. */
export const EVIDENCE_SOURCES = Object.freeze([
 {id:'g2',fixture:'data/coverage/a1-gold-g2.json',sha256:'82068514a0101ba06fe2d13e8af279409f792c82c75644b4ba59efd7c350c9ab',classification:'development',args:['tools/report-a1.mjs','--strict']},
 {id:'family',fixture:'tests/fixtures/gold-family-actions-a1.json',sha256:'4fefe40031a522f582fe4929458b0c065f3fefae1a3de3314576971aa90e321e',classification:'regression',args:['--test','tests/family-actions-a1.test.js']},
 {id:'father',fixture:'tests/fixtures/gold-father-a1.json',sha256:'82ea606548e9907b6aad0c63c60307e85e456834011f8f6484d0bab656830ca3',classification:'regression',args:['--test','tests/father-a1.test.js']},
 {id:'movement',fixture:'tests/fixtures/gold-movement-a1.json',sha256:'f0cb1c7b9a1023e0135797bcb5d74b8f793e08a93397a2a3b94b80fabb0d7975',classification:'regression',args:['--test','tests/movement-a1.test.js']},
 {id:'actions',fixture:'tests/fixtures/gold-daily-actions-a1.json',sha256:'00a66d5cdf7f25b186fcfd96c153303a790edf8d4ee14647ebf06ee710b37ad2',classification:'regression',args:['--test','tests/daily-actions-a1.test.js']},
 {id:'composition',fixture:'tests/fixtures/gold-a1-crossbatch.json',sha256:'dadf9698a7f572b059e1ec2b006d9314d31f844995df35701843b1775db0ce8d',classification:'regression',args:['--test','tests/a1-crossbatch-composition.test.js']},
 {id:'person',fixture:'tests/fixtures/gold-person-a1.json',sha256:'2b292bf3cbb7ec48c577cb7d1597a0bc7db48a84d5e8b02e3a33890479df61c9',classification:'regression',args:['--test','tests/a1-person-gold.test.js']},
 {id:'state',fixture:'tests/fixtures/gold-state-a1.json',sha256:'61ba671790dbe8dc029a533adb03aadbbcce03761b10bb99cb20ee2e0cbbdafa',classification:'regression',args:['--test','tests/a1-state-gold.test.js']},
 {id:'spacetime',fixture:'tests/fixtures/gold-space-time-a1.json',sha256:'03a6ff2530977242b8becd6c9c18ae07b3a986e8d5508672980aea2f3ca17357',classification:'regression',args:['--test','tests/a1-space-time.test.js']},
 {id:'heldout',fixture:'data/coverage/a1-heldout-v1.json',sha256:'2913b8ea0451ee51b321342336a310f5d1f2b2743a8e6b22999ef7e818f3fee3',classification:'held-out',authorIndependent:false,args:['--test','tests/a1-heldout.test.js']}
]);

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const word=x=>typeof x==='string'&&x.trim().length>0;
const direction=x=>x==='en'||x==='pl';
const statusNames=new Set(['pass','fail','not-run']);
const directionKeys=['en->pl','pl->en'];
const opposite=language=>language==='en'?'pl':'en';

export function sha256Text(text) {
 return createHash('sha256').update(text.replace(/\r\n?/g,'\n'),'utf8').digest('hex');
}

export function verifyEvidenceFixture(sourceId,text) {
 const source=EVIDENCE_SOURCES.find(item=>item.id===sourceId);
 if(!source)throw new Error('Unknown evidence fixture: '+sourceId);
 const actual=sha256Text(text);
 if(actual!==source.sha256)
   throw new Error(`Gold fixture integrity check failed for ${source.fixture}: expected ${source.sha256}, received ${actual}. Update the pinned digest only with an intentional gold review.`);
 return actual;
}

function extractRows(id,corpus) {
 if(!record(corpus)||corpus.schemaVersion!==1||corpus.license!=='project-authored')
   throw new Error('Invalid source license/schema: '+id);
 let positive=[],negative=[],morphology=[],productive=[];
 if(id==='g2'){
   if(!Array.isArray(corpus.cases)||!Array.isArray(corpus.unsupported))
     throw new Error('Malformed G2 fixture.');
   positive=corpus.cases;
   negative=corpus.unsupported;
 }else if(id==='composition'){
   if(!Array.isArray(corpus.cases)||!Array.isArray(corpus.unsupported))
     throw new Error('Malformed composition fixture.');
   positive=corpus.cases;
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
 }else if(id==='spacetime'){
   if(!Array.isArray(corpus.pairs)||!Array.isArray(corpus.unsupported))
     throw new Error('Malformed SPACE-06 gold fixture.');
   positive=corpus.pairs.flatMap(pair=>{
     if(!record(pair)||!word(pair.id)||!['direction','location','time','quantity'].includes(pair.category)||
        !word(pair.en)||!word(pair.pl)||!record(pair.core))
       throw new Error('Invalid SPACE-06 bilingual pair.');
     return [
       {id:pair.id+'-EN',from:'en',to:'pl',input:pair.en,expected:pair.pl,core:pair.core},
       {id:pair.id+'-PL',from:'pl',to:'en',input:pair.pl,expected:pair.en,core:pair.core}
     ];
   });
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
   if(row.core.type==='state'){
     for(const role of Object.values(row.core.roles||{}))
       if(role?.concept)concepts.push(role.concept);
   }else if(['identity','predication','possession'].includes(row.core.kind)){
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

function sampleDirection(row) {
 if(!direction(row.from))throw new Error('Invalid sample language direction: '+String(row.id));
 const to=direction(row.to)?row.to:opposite(row.from);
 if(row.to!==undefined&&(!direction(row.to)||row.to!==opposite(row.from)))
   throw new Error('Invalid sample language direction: '+String(row.id));
 return row.from+'->'+to;
}

function emptyCounts() {
 return {positive:0,negative:0,morphologyCells:0,productiveOnly:0,
   byDirection:{'en->pl':{positive:0,negative:0},'pl->en':{positive:0,negative:0}},
   morphologyByLanguage:{en:0,pl:0}};
}

function addSample(counts,kind,directionKey) {
 counts[kind]++;
 if(directionKey)counts.byDirection[directionKey][kind]++;
}

function digestJson(value) {
 return createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
}

function validateExecution(check,id) {
 if(!record(check)||!statusNames.has(check.status)||
    (check.status==='pass'&&check.exitCode!==0)||
    (check.status==='fail'&&check.exitCode===0&&!word(check.error))||
    (check.status==='not-run'&&check.exitCode!==null)||
    (check.exitCode!==null&&(!Number.isInteger(check.exitCode)||check.exitCode<0)))
   throw new Error('Invalid or fabricated test result for '+id);
 if(check.execution===undefined)return null; // Pure library callers may model outcomes; the CLI always supplies execution evidence.
 if(check.status==='not-run'){
   if(check.execution!==null)throw new Error('A not-run suite cannot claim a Node child process: '+id);
   return null;
 }
 const execution=check.execution;
 if(!record(execution)||execution.kind!=='benchmark'||execution.runtime!=='node'||
    !word(execution.executable)||!word(execution.version)||
    (execution.pid!==null&&(!Number.isInteger(execution.pid)||execution.pid<1))||
    !Array.isArray(execution.args)||execution.args.length!==EVIDENCE_SOURCES.find(x=>x.id===id).args.length||
    execution.args.some((arg,index)=>arg!==EVIDENCE_SOURCES.find(x=>x.id===id).args[index])||
    execution.exitCode!==check.exitCode||
    (check.status==='pass'&&(!execution.pid||execution.exitCode!==0||execution.signal!==null)))
   throw new Error('Execution metadata does not match the actual Node suite result for '+id);
 return execution;
}

/** Joins declarations, source integrity, sample quality and real Node exit statuses. */
export function buildA1EvidenceLedger({manifest,ontology,corpora,checks,inputDigests={}}) {
 if(!record(manifest)||manifest.version!==2||manifest.license!=='project-authored'||
    manifest.scope?.completeness!=='project-authored-subset'||
    !Array.isArray(manifest.targets)||!manifest.targets.length||manifest.targets.length>250||
    !record(ontology)||!record(ontology.concepts)||!record(corpora)||!record(checks))
   throw new Error('Invalid evidence inputs/target registry.');
 if(!record(inputDigests))throw new Error('Invalid evidence input digests.');
 if(inputDigests.fixtures!==undefined&&(!record(inputDigests.fixtures)||
    EVIDENCE_SOURCES.some(spec=>inputDigests.fixtures[spec.id]!==spec.sha256)))
   throw new Error('Gold fixture integrity digest does not match the pinned evidence set.');
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

 const seenIds=new Set(),inputGroups=new Map(),sources=[],observations=[];
 const allDeclared=emptyCounts(),allVerified=emptyCounts(),heldOutDeclared=emptyCounts(),heldOutVerified=emptyCounts();
 let totalPositive=0,totalNegative=0,totalMorphology=0,totalProductiveOnly=0;
 for(const spec of EVIDENCE_SOURCES){
   const rows=extractRows(spec.id,corpora[spec.id]);
   const check=checks[spec.id];
   const execution=validateExecution(check,spec.id);
   const sourceDeclared=emptyCounts(),sourceVerified=emptyCounts();
   for(const [kind,items] of [['positive',rows.positive],['negative',rows.negative]]){
     for(const row of items){
       if(!record(row)||!word(row.id)||seenIds.has(row.id)||!word(row.input)||
          (kind==='positive'&&(!direction(row.to)||row.from===row.to||!word(row.expected)))||
          (kind==='negative'&&row.to!==undefined&&(!direction(row.to)||row.from===row.to)))
         throw new Error('Invalid or duplicate sample ID: '+String(row?.id));
       seenIds.add(row.id);
       const directionKey=sampleDirection(row);
       addSample(sourceDeclared,kind,directionKey);
       addSample(allDeclared,kind,directionKey);
       if(spec.classification==='held-out')addSample(heldOutDeclared,kind,directionKey);
       const normalized=row.input.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
       const fingerprint=JSON.stringify([row.from,normalized]);
       const sample={source:spec.id,id:row.id,kind,direction:directionKey,input:row.input};
       if(!inputGroups.has(fingerprint))inputGroups.set(fingerprint,[]);
       inputGroups.get(fingerprint).push(sample);
       if(kind==='positive'){
         const ids=explicitConcepts(row);
         for(const concept of ids){
           if(!Object.hasOwn(ontology.concepts,concept))
             throw new Error('Unknown sample CORE concept: '+concept);
         }
         observations.push({source:spec.id,id:row.id,from:row.from,to:row.to,
           concepts:ids,verified:check.status==='pass'});
       }
     }
   }
   for(const form of rows.morphology){
     if(!record(form)||!direction(form.language)||!word(form.lexemeId)||
        !word(form.text)||!record(form.features))
       throw new Error('Invalid morphology evidence in '+spec.id);
     sourceDeclared.morphologyCells++;
     sourceDeclared.morphologyByLanguage[form.language]++;
     allDeclared.morphologyCells++;
     allDeclared.morphologyByLanguage[form.language]++;
     if(spec.classification==='held-out'){
       heldOutDeclared.morphologyCells++;
       heldOutDeclared.morphologyByLanguage[form.language]++;
     }
   }
   sourceDeclared.productiveOnly=rows.productiveOnly.length;
   allDeclared.productiveOnly+=rows.productiveOnly.length;
   if(spec.classification==='held-out')heldOutDeclared.productiveOnly+=rows.productiveOnly.length;
   if(check.status==='pass'){
     Object.assign(sourceVerified,structuredClone(sourceDeclared));
     allVerified.positive+=sourceVerified.positive;
     allVerified.negative+=sourceVerified.negative;
     allVerified.morphologyCells+=sourceVerified.morphologyCells;
     allVerified.productiveOnly+=sourceVerified.productiveOnly;
     for(const key of directionKeys){
       allVerified.byDirection[key].positive+=sourceVerified.byDirection[key].positive;
       allVerified.byDirection[key].negative+=sourceVerified.byDirection[key].negative;
     }
     allVerified.morphologyByLanguage.en+=sourceVerified.morphologyByLanguage.en;
     allVerified.morphologyByLanguage.pl+=sourceVerified.morphologyByLanguage.pl;
     if(spec.classification==='held-out'){
       heldOutVerified.positive+=sourceVerified.positive;
       heldOutVerified.negative+=sourceVerified.negative;
       heldOutVerified.morphologyCells+=sourceVerified.morphologyCells;
       heldOutVerified.productiveOnly+=sourceVerified.productiveOnly;
       for(const key of directionKeys){
         heldOutVerified.byDirection[key].positive+=sourceVerified.byDirection[key].positive;
         heldOutVerified.byDirection[key].negative+=sourceVerified.byDirection[key].negative;
       }
       heldOutVerified.morphologyByLanguage.en+=sourceVerified.morphologyByLanguage.en;
       heldOutVerified.morphologyByLanguage.pl+=sourceVerified.morphologyByLanguage.pl;
     }
   }
   const byDirection={
     'en->pl':sourceDeclared.byDirection['en->pl'].positive,
     'pl->en':sourceDeclared.byDirection['pl->en'].positive
   };
   if(byDirection['en->pl']<1||byDirection['pl->en']<1)
     throw new Error('Both directions required for '+spec.id);
   const source={
     id:spec.id,fixture:spec.fixture,
     fixtureContentSha256:inputDigests.fixtures?.[spec.id]??digestJson(corpora[spec.id]),
     pinnedFixtureSha256:spec.sha256,
     fixtureIntegrity:inputDigests.fixtures?'verified':'not-checked',
     classification:spec.classification,
     ...(spec.classification==='held-out'?{authorIndependent:spec.authorIndependent}:{}),
     testArgs:spec.args,
     status:check.status,exitCode:check.exitCode,execution,
     ...(check.status==='fail'&&check.error?{error:String(check.error).slice(-1800)}:{}),
     samples:{positive:rows.positive.length,negative:rows.negative.length,
       morphologyCells:rows.morphology.length,productiveOnly:rows.productiveOnly.length,
       byDirection,morphologyByLanguage:sourceDeclared.morphologyByLanguage},
     byDirection,
     sampleQuality:{declared:sourceDeclared,verified:sourceVerified,
       duplicateRepeats:0,duplicateByDirection:{'en->pl':{positive:0,negative:0},'pl->en':{positive:0,negative:0}}}
   };
   sources.push(source);
   totalPositive+=rows.positive.length;
   totalNegative+=rows.negative.length;
   totalMorphology+=rows.morphology.length;
   totalProductiveOnly+=rows.productiveOnly.length;
 }

 const duplicateGroups=[...inputGroups.entries()].filter(([,items])=>items.length>1);
 const duplicateByDirection={
   'en->pl':{positive:0,negative:0,total:0},
   'pl->en':{positive:0,negative:0,total:0}
 };
 let crossSourceDuplicateGroups=0,withinSourceDuplicateGroups=0,duplicateRepeats=0;
 const duplicateExamples=[];
 for(const [fingerprint,items] of duplicateGroups){
   const sourceIds=[...new Set(items.map(item=>item.source))];
   const sourceCounts=new Map(sourceIds.map(sourceId=>[
     sourceId,items.filter(item=>item.source===sourceId).length
   ]));
   if(sourceIds.length>1)crossSourceDuplicateGroups++;
   if([...sourceCounts.values()].some(count=>count>1))withinSourceDuplicateGroups++;
   const repeated=items.slice(1);
   duplicateRepeats+=repeated.length;
   for(const sample of repeated){
     const metric=duplicateByDirection[sample.direction];
     metric[sample.kind]++;
     metric.total++;
     const source=sources.find(item=>item.id===sample.source);
     source.sampleQuality.duplicateRepeats++;
     source.sampleQuality.duplicateByDirection[sample.direction][sample.kind]++;
   }
   if(duplicateExamples.length<25)
     duplicateExamples.push({fingerprintSha256:digestJson(fingerprint),direction:items[0].direction,
       sources:items.map(({source,id,kind})=>({source,id,kind}))});
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
 const passes=sources.filter(x=>x.status==='pass').length,
   fails=sources.filter(x=>x.status==='fail').length,
   notRun=sources.filter(x=>x.status==='not-run').length;
 const fixtureDigests=Object.fromEntries(EVIDENCE_SOURCES.map(spec=>[
   spec.id,inputDigests.fixtures?.[spec.id]??digestJson(corpora[spec.id])
 ]));
 const manifestSha256=inputDigests.manifest??digestJson(manifest);
 const ontologySha256=inputDigests.ontology??digestJson(ontology);
 const inputSha256=digestJson({schemaVersion:2,ledgerVersion:'VAL-03-v1',manifestSha256,ontologySha256,fixtures:fixtureDigests,
   sources:EVIDENCE_SOURCES.map(({id,fixture,classification,args})=>({id,fixture,classification,args}))});
 const releaseId='a1-evidence-v2-'+inputSha256.slice(0,20);
 return {
   schemaVersion:2,scope:'project-authored-declared-verified-held-out-sample-ledger-not-cefr',
   provenance:{source:'project-authored',notOfficialOxford:true,
     heldOutIndependence:'H1 is separated from development samples but was authored by the implementation owner; independent authoring was unavailable.'},
   release:{id:releaseId,version:'VAL-03-v1',inputSha256,
     inputs:{manifestSha256,ontologySha256,fixtures:fixtureDigests},verified:false,
     reason:'This report release identifies pinned inputs; gold suites alone do not verify the full Node regression and release gate.'},
   runtime:{name:'node',version:process.version,executable:process.execPath},
   totals:{sources:sources.length,positive:totalPositive,negative:totalNegative,
     morphologyCells:totalMorphology,productiveOnly:totalProductiveOnly,
     crossSourceDuplicateUtterances:crossSourceDuplicateGroups},
   sampleQuality:{declared:allDeclared,verified:allVerified,
     heldOut:{declared:heldOutDeclared,verified:heldOutVerified},
     duplicates:{repeatSamples:duplicateRepeats,groups:duplicateGroups.length,
       crossSourceGroups:crossSourceDuplicateGroups,withinSourceGroups:withinSourceDuplicateGroups,
       byDirection:duplicateByDirection,examples:duplicateExamples}},
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
   cefr:{level:'A1',percentage:null,status:'not-measured',licensedDenominator:null,
     reason:'No licensed, representative CEFR denominator is declared for these project-authored samples.'},
   releaseGate:{verified:false,reason:'Gold suites alone do not verify the full Node regression and release gate.'}
 };
}
