import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {DialogueContext} from '../js/core/conversation.js';
import {
  DIALOGUE_ACT_VERSION, MAX_DIALOGUE_ACTS, createDialogueAct, createEvent,
  createQuestion, participant, validateInterlingua
} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const ref=id=>participant(id,'definite');
const see=(roles={agent:ref('person.girl'),theme:ref('animal.dog')},features={})=>
  createEvent('event.visual_perception',roles,
    {tense:'past',polarity:'negative',aspect:'unknown',...features});
const yesNo=createQuestion(see());
const wh=createQuestion(see({agent:ref('person.girl')}),{questionType:'wh',targetRole:'theme'});
const personWh=createQuestion(createEvent('event.belief',{content:ref('object.book')},
  {tense:'present',polarity:'positive',aspect:'unknown'}),
  {questionType:'wh',targetRole:'experiencer'});
const valid=act=>validateInterlingua(act,engine.ontology,engine.features);

test('dialogue act envelope exposes version and all six ontology backed types',()=>{
  assert.equal(DIALOGUE_ACT_VERSION,'1.24');
  assert.equal(engine.capabilities().dialogueActDocumentVersion,DIALOGUE_ACT_VERSION);
  for(const act of ['assert','ask','answer','confirm','clarify','refuse']) {
    assert.equal(engine.ontology.isA('dialogue_act.'+act,'dialogue_act'),true);
  }
});

test('all dialogue acts validate with explicit, typed CORE payloads',()=>{
  const docs=[
    createDialogueAct('assert',{proposition:see()}),
    createDialogueAct('ask',{question:yesNo}),
    createDialogueAct('answer',{question:yesNo,response:{type:'yes_no',value:false}}),
    createDialogueAct('answer',{question:wh,response:{type:'referent',value:ref('animal.dog')}}),
    createDialogueAct('answer',{question:personWh,response:{type:'referent',value:ref('person.girl')}}),
    createDialogueAct('confirm',{question:yesNo}),
    createDialogueAct('clarify',{inReplyTo:yesNo,question:wh}),
    createDialogueAct('clarify',{inReplyTo:see(),question:yesNo}),
    createDialogueAct('refuse',{question:yesNo,reason:'insufficient_context'})
  ];
  for(const doc of docs) assert.equal(valid(doc),doc);
});

test('CORE JSON roundtrip preserves dialogue acts and ordinary sentence documents',()=>{
  const act=createDialogueAct('answer',{
    question:wh,response:{type:'referent',value:ref('animal.dog')}
  });
  const text=engine.realize({interlingua:act,to:'core'}).text;
  assert.deepEqual(engine.analyze({text,from:'core'}),act);
  assert.deepEqual(engine.translate({text,from:'core',to:'core'}).interlingua,act);
  assert.equal(engine.analyze({text:JSON.stringify(see()),from:'core'}).type,'event');
  assert.throws(()=>engine.realize({interlingua:act,to:'en'}),/Language realization.*not supported/);
});

test('CORE rejects unknown acts, versions, missing context and malformed payloads',()=>{
  const unknown={...createDialogueAct('assert',{proposition:see()}),act:'negotiate'};
  assert.throws(()=>valid(unknown),/Unknown dialogue act/);
  assert.throws(()=>engine.analyze({from:'core',text:JSON.stringify(unknown)}),error=>
    error.code==='CORE_SCHEMA_INVALID' && /Unknown dialogue act/.test(error.message));
  const unsafe=JSON.stringify(createDialogueAct('assert',{proposition:see()}))
    .replace('"payload":{','"payload":{"__proto__":{},');
  assert.throws(()=>engine.analyze({from:'core',text:unsafe}),error=>
    error.code==='CORE_JSON_UNSAFE_KEY');
  assert.throws(()=>valid({...unknown,version:'9.0',act:'ask'}),/unsupported dialogue act/i);
  assert.throws(()=>valid(createDialogueAct('answer',{
    response:{type:'yes_no',value:true}
  })),/question context/);
  assert.throws(()=>valid(createDialogueAct('answer',{
    question:yesNo,response:{type:'referent',value:ref('animal.dog')}
  })),/boolean answer/);
  assert.throws(()=>valid(createDialogueAct('answer',{
    question:personWh,response:{type:'referent',value:ref('animal.dog')}
  })),/role type/);
  assert.throws(()=>valid(createDialogueAct('answer',{
    question:wh,response:{type:'referent',value:null}
  })),/Invalid participant/);
  assert.throws(()=>valid(createDialogueAct('confirm',{question:wh})),/yes\/no question/);
  assert.throws(()=>valid(createDialogueAct('refuse',{question:yesNo,reason:'guess'})),
    /refusal reason/);
  assert.throws(()=>createDialogueAct('unknown',{}),/Unsupported dialogue act/);
});

test('DialogueContext matches replies, tracks clarification chains, and commits atomically',()=>{
  const context=new DialogueContext(engine);
  context.append(createDialogueAct('ask',{question:yesNo}));
  const clarifyingQuestion=createQuestion(see(undefined,{tense:'present',polarity:'positive'}));
  context.append(createDialogueAct('clarify',{
    inReplyTo:yesNo,question:clarifyingQuestion
  }));
  assert.equal(context.snapshot().pendingQuestions.length,2);
  assert.throws(()=>context.append(createDialogueAct('answer',{
    question:yesNo,response:{type:'yes_no',value:true}
  })),/matching question/);
  assert.equal(context.snapshot().actCount,2);
  context.append(createDialogueAct('answer',{
    question:clarifyingQuestion,response:{type:'yes_no',value:true}
  }));
  assert.deepEqual(context.snapshot().pendingQuestions,[yesNo]);
  context.append(createDialogueAct('confirm',{question:yesNo}));
  assert.deepEqual(context.snapshot().pendingQuestions,[]);
  assert.equal(context.snapshot().actCount,4);
  context.reset();
  assert.equal(context.snapshot().actCount,0);
});

test('DialogueContext bounds history and refuses an answer without an open question',()=>{
  assert.throws(()=>new DialogueContext(engine,{maxActs:MAX_DIALOGUE_ACTS+1}),/act limit/);
  const context=new DialogueContext(engine,{maxActs:1});
  assert.throws(()=>context.append(createDialogueAct('answer',{
    question:yesNo,response:{type:'yes_no',value:true}
  })),/matching question/);
  context.append(createDialogueAct('assert',{proposition:see()}));
  assert.throws(()=>context.append(createDialogueAct('assert',{proposition:see()})),/history limit/);
  assert.equal(context.snapshot().actCount,1);
});
