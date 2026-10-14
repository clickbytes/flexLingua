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
  operator:node.proposition.operator,concept:node.proposition.operand.concept
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
test('A1 Batch 6: cross-batch compositions preserve scope, questions and event order',()=>{
 assert.equal(corpus.license,'project-authored');
 assert.equal(corpus.cases.length,11);
 const engine=make();
 for(const row of corpus.cases)assertGold(engine,row);
});
test('A1 Batch 6: question scope retains WH targetRole inside ability',()=>{
 const q=make().analyze({from:'en',text:'What can the sister open?'});
 assert.equal(q.questionType,'wh');
 assert.equal(q.targetRole,'theme');
 assert.equal(q.proposition.operator,'modality.ability');
 assert.equal(Object.hasOwn(q.proposition.operand.roles,'theme'),false);
 assert.equal(q.proposition.operand.roles.agent.concept,'person.sister');
});
test('A1 Batch 6: independent semantic gold detects tampering',()=>{
 const bad={...corpus.cases[0],shape:{...corpus.cases[0].shape,concept:'event.write'}};
 assert.throws(()=>assertGold(make(),bad),{code:'ERR_ASSERTION',message:/A1C-01/});
 const badSurface={...corpus.cases[0],expected:'An unrelated sentence.'};
 assert.throws(()=>assertGold(make(),badSurface),{code:'ERR_ASSERTION',message:/A1C-01/});
});
