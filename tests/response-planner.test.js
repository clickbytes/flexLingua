import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';
import {
  createDialogueAct, createEvent, createQuestion, participant, validateInterlingua
} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const ref=id=>participant(id,'definite');
const see=(roles={agent:ref('person.girl'),theme:ref('animal.dog')},
  eventFeatures={tense:'present',polarity:'positive',aspect:'unknown'})=>
  createEvent('event.visual_perception',roles,eventFeatures);
const question=createQuestion(see());
const valid=node=>validateInterlingua(node,engine.ontology,engine.features);

test('planner confirms only a matching explicit fact and produces deterministic CORE plans',()=>{
  const fact=see();
  const first=engine.planResponse({question,facts:[fact]});
  assert.deepEqual(engine.planResponse({question,facts:[fact]}),first);
  assert.equal(first.version,'1.0');
  assert.equal(first.outcome,'answer');
  assert.equal(first.act.act,'confirm');
  assert.deepEqual(first.evidence,[{factIndex:0}]);
  assert.deepEqual(valid(first.act),first.act);
  assert.deepEqual(valid(first.realization),first.realization);
});

test('negative answers require an explicit opposite fact; absence remains unknown',()=>{
  const absent=engine.planResponse({question,facts:[]});
  assert.equal(absent.outcome,'unknown');
  assert.equal(absent.act.act,'refuse');
  assert.equal(absent.act.payload.reason,'insufficient_context');
  assert.equal(absent.realization,null);

  const negative=see(undefined,{tense:'present',polarity:'negative',aspect:'unknown'});
  const answer=engine.planResponse({question,facts:[negative]});
  assert.equal(answer.outcome,'answer');
  assert.equal(answer.act.act,'answer');
  assert.deepEqual(answer.act.payload.response,{type:'yes_no',value:false});
  assert.deepEqual(answer.realization,negative);
});

test('conflicting evidence yields ambiguity and never chooses a convenient fact',()=>{
  const plan=engine.planResponse({question,facts:[see(),
    see(undefined,{tense:'present',polarity:'negative',aspect:'unknown'})]});
  assert.equal(plan.outcome,'unknown');
  assert.equal(plan.act.act,'refuse');
  assert.equal(plan.act.payload.reason,'ambiguous');
  assert.deepEqual(plan.evidence,[{factIndex:0},{factIndex:1}]);
});

test('WH planning fills only a matching semantic gap and uses typed referents',()=>{
  const wh=createQuestion(see({agent:ref('person.girl')}),
    {questionType:'wh',targetRole:'theme'});
  const plan=engine.planResponse({question:wh,facts:[see()]});
  assert.equal(plan.outcome,'answer');
  assert.equal(plan.act.act,'answer');
  assert.deepEqual(plan.act.payload.response,{type:'referent',value:ref('animal.dog')});
  assert.deepEqual(plan.realization,see());
  assert.equal(engine.realize({interlingua:plan.realization,to:'en'}).text,'The girl sees the dog.');
  assert.equal(engine.realize({interlingua:plan.realization,to:'pl'}).text,'Dziewczynka widzi psa.');

  const conflicting=engine.planResponse({question:wh,facts:[see(),
    see({agent:ref('person.girl'),theme:ref('animal.cat')})]});
  assert.equal(conflicting.act.payload.reason,'ambiguous');
});

test('clarification is typed against the pending question and receives language realization',()=>{
  const clarifyQuestion=createQuestion(see(undefined,
    {tense:'past',polarity:'positive',aspect:'unknown'}));
  const response=engine.respond({question,facts:[],clarifyQuestion,to:'en'});
  assert.equal(response.plan.outcome,'clarify');
  assert.equal(response.plan.act.act,'clarify');
  assert.deepEqual(response.plan.act.payload.inReplyTo,question);
  assert.equal(response.text,'Did the girl see the dog?');
});

test('planner rejects non-assert dialogue acts and malformed facts instead of treating them as evidence',()=>{
  const ask=createDialogueAct('ask',{question});
  assert.throws(()=>engine.planResponse({question,facts:[ask]}),/Only explicit assert/);
  assert.throws(()=>engine.planResponse({question,facts:[{type:'event',concept:'event.fake'}]}),/Unsupported event version/);
  assert.throws(()=>engine.planResponse({question:{type:'event'}}),/semantic question/);
});

test('ConversationContext answers its latest pending question from explicit assertion turns',()=>{
  const conversation=new ConversationContext(engine);
  conversation.appendDialogueAct(createDialogueAct('ask',{question}));
  conversation.appendDialogueAct(createDialogueAct('assert',{proposition:see()}));
  const plan=conversation.planResponse();
  assert.equal(plan.act.act,'confirm');
  const response=conversation.respond({to:'pl'});
  assert.equal(response.text,'Dziewczynka widzi psa.');
  assert.equal(response.dialogueAct.act,'confirm');
  assert.equal(response.turnCount,3);
  assert.deepEqual(conversation.snapshot().pendingQuestions,[]);
  assert.equal(conversation.snapshot().turns[2].intent,'confirm');
});

test('failed response realization leaves the conversation history unchanged',()=>{
  const conversation=new ConversationContext(engine);
  conversation.appendDialogueAct(createDialogueAct('ask',{question}));
  conversation.appendDialogueAct(createDialogueAct('assert',{proposition:see()}));
  const before=conversation.snapshot();
  assert.throws(()=>conversation.respond({to:'xx'}),/Unsupported response language/);
  assert.deepEqual(conversation.snapshot(),before);
});
