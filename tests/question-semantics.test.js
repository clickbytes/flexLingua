import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {QUESTION_VERSION,createQuestion,createEvent,createNegation,createCoordination,
  participant,validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const ref=(id)=>participant(id,'definite');
const see=(roles={agent:ref('person.girl'),theme:ref('animal.dog')},features={})=>
  createEvent('event.visual_perception',roles,
    {tense:'past',polarity:'negative',aspect:'unknown',...features});
const valid=doc=>validateInterlingua(doc,engine.ontology,engine.features);

test('questions have a new semantic type and preserve tense and polarity',()=>{
 const q=createQuestion(see());
 assert.equal(q.version,QUESTION_VERSION);
 assert.equal(q.type,'question');
 assert.equal(q.questionType,'yes_no');
 assert.equal(q.proposition.features.tense,'past');
 assert.equal(q.proposition.features.polarity,'negative');
 assert.equal(valid(q),q);
 assert.equal(engine.capabilities().questionDocumentVersion,QUESTION_VERSION);
});
test('WH questions represent missing agent/theme rather than synthetic participants',()=>{
 for(const [role,roles] of [['theme',{agent:ref('person.girl')}],
                            ['agent',{theme:ref('animal.dog')}]]) {
  const q=createQuestion(see(roles),{questionType:'wh',targetRole:role});
  assert.equal(q.targetRole,role);
  assert.equal(Object.hasOwn(q.proposition.roles,role),false);
  assert.equal(valid(q),q);
 }
});
test('yes/no questions can scope semantically valid negation and coordination',()=>{
 assert.doesNotThrow(()=>valid(createQuestion(createNegation(see()))));
 assert.doesNotThrow(()=>valid(createQuestion(createCoordination([see(),see()]))));
});
test('CORE JSON I/O round-trips questions without changing semantic role gaps',()=>{
 const q=createQuestion(see({agent:ref('person.girl')}),
   {questionType:'wh',targetRole:'theme'});
 const text=engine.realize({interlingua:q,to:'core'}).text;
 assert.deepEqual(engine.analyze({from:'core',text}),q);
 assert.deepEqual(engine.translate({from:'core',to:'core',text}).interlingua,q);
});
test('malformed interrogatives fail semantic validation explicitly',()=>{
 const complete=see();
 const q=createQuestion(see({agent:ref('person.girl')}),{questionType:'wh',targetRole:'theme'});
 assert.throws(()=>createQuestion(complete,{questionType:'wh',targetRole:'theme'}),/unfilled/);
 assert.throws(()=>createQuestion(complete,{questionType:'yes_no',targetRole:'agent'}),/Yes\/no/);
 assert.throws(()=>createQuestion(complete,{questionType:'bogus'}),/Unsupported/);
 assert.throws(()=>valid({...q,targetRole:'location'}),/targetRole/);
 assert.throws(()=>valid({...q,proposition:complete}),/gap/);
 assert.throws(()=>valid({...q,other:'who'}),/Invalid or unsupported/);
 assert.throws(()=>valid({...q,proposition:{...q.proposition,roles:{}}}),/roles/);
 assert.throws(()=>valid({...q,proposition:{...q.proposition,version:'9'}}),/Invalid WH/);
 assert.throws(()=>valid({...q,proposition:{...q.proposition,
   roles:{agent:ref('event.visual_perception')}}}),/Invalid participant/);
 assert.throws(()=>valid({...q,proposition:{...q.proposition,
   features:{...q.proposition.features,tense:'futuristic'}}}),/feature/);
});
test('source grammar remains compatible; semantic CORE questions realize through PL and EN',()=>{
 const q=createQuestion(see());
 assert.equal(engine.translate({from:'core',to:'pl',text:JSON.stringify(q)}).text,
   'Czy dziewczynka nie widziała psa?');
 assert.equal(engine.translate({from:'core',to:'en',text:JSON.stringify(q)}).text,
   'Did the girl not see the dog?');
 const wh=createQuestion(see({agent:ref('person.girl')}),
   {questionType:'wh',targetRole:'theme'});
 assert.equal(engine.translate({from:'core',to:'en',text:JSON.stringify(wh)}).text,
   'What did the girl not see?');
 const legacy=engine.translate({from:'en',to:'pl',text:'The girl saw the dog.'});
 assert.equal(legacy.text,'Dziewczynka widziała psa.');
 assert.equal(legacy.interlingua.version,'0.2');
});
