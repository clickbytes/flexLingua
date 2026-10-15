import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const dialogue=engine.createDialogueEngine();

test('DialogueEngine exposes a versioned facade and translates en↔pl offline',()=>{
  assert.equal(engine.capabilities().dialogueEngineVersion,'1.0');
  const enToPl=dialogue.createSession();
  const first=dialogue.nextTurn({session:enToPl,utterance:'The girl sees the dog.',
    language:'en',to:'pl'});
  assert.equal(first.text,'Dziewczynka widzi psa.');
  assert.equal(first.core.type,'event');
  assert.equal(first.dialogueAct.act,'assert');
  assert.equal(first.turnCount,1);
  assert.deepEqual(first.diagnostics,[]);

  const plToEn=dialogue.createSession();
  const second=dialogue.nextTurn({session:plToEn,
    utterance:{text:'Ja idę.',language:'pl'},to:'en'});
  assert.equal(second.text,'I go.');
  assert.equal(second.core.type,'event');
});

test('DialogueEngine preserves explicit perspective and participant identity',()=>{
  const session=dialogue.createSession();
  const result=dialogue.nextTurn({session,utterance:'I go.',language:'en',to:'pl',
    participants:{speakerId:'alice',addresseeId:'assistant'}});
  assert.equal(result.text,'Ja idę.');
  assert.equal(result.core.roles.agent.referent.anchor,'speaker');
  assert.equal(result.conversation.turns[0].references[0].referenceId,'actor:alice');
});

test('tryNextTurn returns diagnostics and leaves session untouched after ambiguity',()=>{
  const session=dialogue.createSession();
  const before=session.snapshot();
  const failed=dialogue.tryNextTurn({session,utterance:'The girl sees the bank.',
    language:'en',to:'pl'});
  assert.equal(failed.ok,false);
  assert.equal(failed.error.code,'AMBIGUOUS_CONVERSATION_READING');
  assert.equal(failed.diagnostics[0].severity,'error');
  assert.deepEqual(session.snapshot(),before);

  assert.throws(()=>dialogue.nextTurn({session,utterance:'The girl sees the dog.',
    language:'xx',to:'pl'}),error=>error.code==='UNSUPPORTED_LANGUAGE');
  assert.deepEqual(session.snapshot(),before);
});

test('DialogueEngine routes parsed questions through the CORE response planner',()=>{
  const session=dialogue.createSession();
  dialogue.nextTurn({session,utterance:'The girl sees the dog.',language:'en',to:'en'});
  const asked=dialogue.nextTurn({session,utterance:'What does the girl see?',
    language:'en',to:'en'});
  assert.equal(asked.dialogueAct.act,'ask');
  assert.equal(asked.core.type,'question');
  assert.equal(session.snapshot().pendingQuestions.length,1);

  const response=dialogue.respond({session,to:'pl'});
  assert.equal(response.dialogueAct.act,'answer');
  assert.equal(response.plan.act.payload.response.type,'referent');
  assert.equal(response.text,'Dziewczynka widzi psa.');
  assert.equal(session.snapshot().pendingQuestions.length,0);
});

test('tryRespond reports failures without mutating session state',()=>{
  const session=dialogue.createSession();
  dialogue.nextTurn({session,utterance:'The girl sees the dog.',language:'en',to:'en'});
  dialogue.nextTurn({session,utterance:'Does the girl see the dog?',language:'en',to:'en'});
  const before=session.snapshot();
  const failed=dialogue.tryRespond({session,to:'xx'});
  assert.equal(failed.ok,false);
  assert.equal(failed.error.code,'UNSUPPORTED_LANGUAGE');
  assert.deepEqual(session.snapshot(),before);
});

test('sessions cannot be passed between DialogueEngine instances',()=>{
  const other=engine.createDialogueEngine();
  const session=dialogue.createSession();
  const result=other.tryNextTurn({session,utterance:'I go.',language:'en',to:'pl'});
  assert.equal(result.ok,false);
  assert.match(result.error.message,/created by this DialogueEngine/);
});
