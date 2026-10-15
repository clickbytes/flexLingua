import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,pl,en,pg,eg,corpus]=await Promise.all([
 'data/concepts.json','data/features.json','data/pl.json','data/en.json',
 'data/grammar/pl.json','data/grammar/en.json','tests/fixtures/gold-a1-crossbatch.json'
].map(load));
const make=()=>new Engine(ontology,features)
 .registerLanguage(createRuleAdapter(pl,pg))
 .registerLanguage(createRuleAdapter(en,eg));
function shapeOf(node){
 if(node.type==='modality')return {type:node.type,operator:node.operator,concept:node.operand.concept};
 if(node.type==='question')return {
  type:'question',questionType:node.questionType,targetRole:node.targetRole||null,
  operator:node.proposition.operator||null,
  concept:node.proposition.type==='modality'?node.proposition.operand.concept:
   node.proposition.type==='state'?'state.'+node.proposition.kind:node.proposition.concept
 };
 if(node.type==='coordination')return {type:'coordination',concepts:node.clauses.map(x=>x.concept)};
 if(node.type==='discourse')return {type:'discourse',concepts:node.events.map(x=>x.concept)};
 throw new Error('Unknown controlled cross-batch graph: '+node.type);
}
function assertGold(engine,row){
 const translation=engine.translate({text:row.input,from:row.from,to:row.to});
 assert.equal(translation.text,row.expected,row.id);
 assert.deepEqual(shapeOf(translation.interlingua),row.shape,row.id);
 assert.deepEqual(shapeOf(engine.analyze({from:row.to,text:row.expected})),row.shape,
   row.id+' target analysis');
 assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(translation.interlingua)}),
   translation.interlingua,row.id+' INTER JSON roundtrip');
}
function eventOf(node){
 if(node.type==='event')return node;
 if(node.type==='question')return eventOf(node.proposition);
 if(node.type==='modality')return eventOf(node.operand);
 throw new Error('Expected a single controlled event.');
}
function roleShape(node){
 const event=eventOf(node);
 return {concept:event.concept,
  roles:Object.fromEntries(Object.entries(event.roles).map(([role,participant])=>
   [role,{concept:participant.concept,number:participant.features.number}]))};
}
test('A1 Batch 6: cross-batch compositions preserve scope, questions and event order',()=>{
 assert.equal(corpus.license,'project-authored');
 assert.equal(corpus.cases.length,46);
 assert.deepEqual(corpus.cases.reduce((counts,row)=>{
  counts[row.from+'->'+row.to]++;return counts;
 },{'en->pl':0,'pl->en':0}),{'en->pl':26,'pl->en':20});
 const engine=make();
 for(const row of corpus.cases)assertGold(engine,row);
 assert.equal(corpus.unsupported.length,1);
 for(const row of corpus.unsupported){
  const result=engine.tryTranslate({text:row.input,from:row.from,to:row.to});
  assert.equal(result.ok,false,row.id+' must refuse: '+row.reason);
  assert.ok(result.error?.message,row.id+' needs a diagnostic');
 }
});
test('A1 Batch 6: question scope retains WH targetRole inside ability',()=>{
 const q=make().analyze({from:'en',text:'What can the sister open?'});
 assert.equal(q.questionType,'wh');
 assert.equal(q.targetRole,'theme');
 assert.equal(q.proposition.operator,'modality.ability');
 assert.equal(Object.hasOwn(q.proposition.operand.roles,'theme'),false);
 assert.equal(q.proposition.operand.roles.agent.concept,'person.sister');
});
test('A1 Batch 6: modal WH scope composes with a different event frame',()=>{
 const q=make().analyze({from:'en',text:'What can the sister read?'});
 assert.equal(q.questionType,'wh');
 assert.equal(q.targetRole,'theme');
 assert.equal(q.proposition.operator,'modality.ability');
 assert.equal(q.proposition.operand.concept,'event.read');
 assert.equal(Object.hasOwn(q.proposition.operand.roles,'theme'),false);
});
test('VAL-04: role oracle detects a swapped participant in a modal composition',()=>{
 const row=corpus.cases.find(item=>item.id==='A1C-01');
 const translated=make().translate({text:row.input,from:row.from,to:row.to});
 const expected={concept:'event.open',roles:{
  agent:{concept:'person.father',number:'singular'},
  theme:{concept:'object.book',number:'singular'}
 }};
 assert.deepEqual(roleShape(translated.interlingua),expected);
 const swapped=structuredClone(translated.interlingua);
 const event=eventOf(swapped);
 [event.roles.agent,event.roles.theme]=[event.roles.theme,event.roles.agent];
 assert.notDeepEqual(roleShape(swapped),expected);
});
test('A1 Batch 6: independent semantic gold detects tampering',()=>{
 const bad={...corpus.cases[0],shape:{...corpus.cases[0].shape,concept:'event.write'}};
 assert.throws(()=>assertGold(make(),bad),{code:'ERR_ASSERTION',message:/A1C-01/});
 const badSurface={...corpus.cases[0],expected:'An unrelated sentence.'};
 assert.throws(()=>assertGold(make(),badSurface),{code:'ERR_ASSERTION',message:/A1C-01/});
});
