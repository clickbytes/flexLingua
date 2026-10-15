import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar,gold]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','tests/fixtures/gold-conversation-a1.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const dialogue=engine.createDialogueEngine();

function assertCoreRoundtrip(value,id,act){
  const text=engine.realize({interlingua:value,to:'core'}).text;
  assert.deepEqual(engine.analyze({text,from:'core'}),value,`${id} ${act} CORE roundtrip`);
}

assert.equal(gold.license,'project-authored');
assert.ok(gold.scenes.length>=20,'DIAL-05 requires at least 20 dialogue scenes');

for(const scene of gold.scenes){
  test(`${scene.id}: assert → ask → ${scene.expectedAct}`,()=>{
    const session=dialogue.createSession();
    const asserted=dialogue.nextTurn({session,utterance:scene.fact,
      language:scene.from,to:scene.from});
    assert.equal(asserted.dialogueAct.act,'assert',`${scene.id} assertion`);
    assert.equal(asserted.turnCount,1,`${scene.id} assertion turn`);
    assertCoreRoundtrip(asserted.core,scene.id,'assert');

    const asked=dialogue.nextTurn({session,utterance:scene.question,
      language:scene.from,to:scene.from});
    assert.equal(asked.dialogueAct.act,'ask',`${scene.id} question`);
    assert.equal(asked.turnCount,2,`${scene.id} question turn`);
    assert.equal(session.snapshot().pendingQuestions.length,1,`${scene.id} pending question`);
    assertCoreRoundtrip(asked.core,scene.id,'ask');

    const response=dialogue.respond({session,to:scene.to});
    assert.equal(response.dialogueAct.act,scene.expectedAct,`${scene.id} response act`);
    assert.equal(response.plan.outcome,scene.expectedOutcome,`${scene.id} outcome`);
    assert.deepEqual(response.plan.confidence,scene.confidence,`${scene.id} confidence`);
    assert.equal(response.text,scene.expectedText,`${scene.id} cross-language response`);
    assert.equal(response.turnCount,3,`${scene.id} minimum three turns`);
    assert.equal(session.snapshot().pendingQuestions.length,0,`${scene.id} closes question`);
    assertCoreRoundtrip(response.dialogueAct,scene.id,'response');
  });
}

test('DIAL-05 unknown answer has no invented text and reports no confidence',()=>{
  const session=dialogue.createSession();
  dialogue.nextTurn({session,utterance:'The girl reads the book.',language:'en',to:'en'});
  dialogue.nextTurn({session,utterance:'Does the girl see the dog?',language:'en',to:'en'});
  const response=dialogue.respond({session,to:'pl'});
  assert.equal(response.dialogueAct.act,'refuse');
  assert.equal(response.plan.reason,'insufficient_context');
  assert.deepEqual(response.plan.confidence,{level:'none',evidenceCount:0});
  assert.equal(response.text,null);
  assert.equal(response.turnCount,3);
});

test('DIAL-05 false WH referents remain ambiguous instead of selecting one',()=>{
  for(const [facts,question] of [
    [['The girl sees the dog.','The girl sees the cat.'],'What does the girl see?'],
    [['The girl sees the dog.','The boy sees the dog.'],'Who sees the dog?']
  ]){
    const session=dialogue.createSession();
    for(const fact of facts)dialogue.nextTurn({session,utterance:fact,language:'en',to:'en'});
    dialogue.nextTurn({session,utterance:question,language:'en',to:'en'});
    const response=dialogue.respond({session,to:'pl'});
    assert.equal(response.dialogueAct.act,'refuse');
    assert.equal(response.plan.reason,'ambiguous');
    assert.deepEqual(response.plan.confidence,{level:'ambiguous',evidenceCount:2});
    assert.equal(response.text,null);
    assert.equal(response.turnCount,4);
  }
});

test('DIAL-05 a conflicting correction stays visible and lowers confidence',()=>{
  const session=dialogue.createSession();
  for(const utterance of ['The girl sees the dog.','The girl does not see the dog.']){
    dialogue.nextTurn({session,utterance,language:'en',to:'en'});
  }
  dialogue.nextTurn({session,utterance:'Does the girl see the dog?',language:'en',to:'en'});
  const response=dialogue.respond({session,to:'pl'});
  assert.equal(response.dialogueAct.act,'refuse');
  assert.equal(response.plan.reason,'ambiguous');
  assert.deepEqual(response.plan.confidence,{level:'ambiguous',evidenceCount:2});
  assert.equal(response.text,null);
  assert.equal(response.turnCount,4);
});

test('DIAL-05 ambiguous input rolls back all session state before the next answer',()=>{
  const session=dialogue.createSession();
  dialogue.nextTurn({session,utterance:'The girl sees the dog.',language:'en',to:'en'});
  dialogue.nextTurn({session,utterance:'Does the girl see the dog?',language:'en',to:'en'});
  const before=session.snapshot();
  const failed=dialogue.tryNextTurn({session,utterance:'The girl sees the bank.',
    language:'en',to:'pl'});
  assert.equal(failed.ok,false);
  assert.equal(failed.error.code,'AMBIGUOUS_CONVERSATION_READING');
  assert.deepEqual(session.snapshot(),before);
  const response=dialogue.respond({session,to:'pl'});
  assert.equal(response.dialogueAct.act,'confirm');
  assert.equal(response.text,'Dziewczynka widzi psa.');
  assert.equal(response.turnCount,3);
});
