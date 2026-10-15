import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const makeEngine=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('MEM-03: explicitly accepted facts retain CORE, referent, source, date and scope',()=>{
  const conversation=new ConversationContext(makeEngine());
  const turn=conversation.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const fact=conversation.remember({turnId:'t1',referent:'proposition.roles.agent',
    recordedAt:'2026-10-15T12:00:00Z'});
  assert.equal(fact.id,'f1');
  assert.equal(fact.referent,conversation.snapshot().turns[0].references
    .find(ref=>ref.role==='proposition.roles.agent').referenceId);
  assert.deepEqual(fact.proposition,turn.interlingua);
  assert.deepEqual(fact.source,{turnId:'t1',language:'en',text:'The girl sees the dog.'});
  assert.equal(fact.recordedAt,'2026-10-15T12:00:00Z');
  assert.equal(fact.scope,'session');
  assert.deepEqual(fact.correction,{policy:'explicit_supersede',supersedes:[]});
  const snapshot=conversation.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),snapshot);
  snapshot.memory.facts[0].proposition.concept='event.transfer_possession';
  assert.equal(conversation.snapshot().memory.facts[0].proposition.concept,
    'event.visual_perception');
});

test('MEM-03: invalid provenance and mismatched referents never enter memory',()=>{
  const conversation=new ConversationContext(makeEngine());
  conversation.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const before=conversation.snapshot();
  assert.equal(conversation.tryRemember({turnId:'t1',referent:'proposition.roles.unknown'})
    .error.code,'MEMORY_REFERENT_MISMATCH');
  assert.equal(conversation.tryRemember({turnId:'t2',referent:'proposition.roles.agent'})
    .error.code,'MEMORY_SOURCE_INVALID');
  assert.equal(conversation.tryRemember({turnId:'t1',referent:'proposition.roles.agent',
    recordedAt:'yesterday'}).error.code,'MEMORY_TIME_SCOPE_INVALID');
  assert.deepEqual(conversation.snapshot(),before);
  const fact=conversation.remember({turnId:'t1',referent:'proposition.roles.agent'});
  const afterFact=conversation.snapshot();
  assert.equal(conversation.tryTranslate({text:'She sees the bank.',from:'en',to:'pl'}).ok,false);
  assert.deepEqual(conversation.snapshot(),afterFact);
  assert.equal(fact.source.turnId,'t1');
});

test('MEM-03: contradictions require explicit superseding and retain correction history',()=>{
  const conversation=new ConversationContext(makeEngine());
  conversation.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const original=conversation.remember({turnId:'t1',referent:'proposition.roles.agent',
    recordedAt:'2026-10-15T12:00:00Z'});
  conversation.translate({text:'She does not see the dog.',from:'en',to:'pl'});
  const beforeCorrection=conversation.snapshot();
  assert.equal(conversation.tryRemember({turnId:'t2',referent:'proposition.roles.agent',
    recordedAt:'2026-10-15T12:01:00Z'}).error.code,'MEMORY_FACT_CONFLICT');
  assert.deepEqual(conversation.snapshot(),beforeCorrection);
  const corrected=conversation.remember({turnId:'t2',referent:'proposition.roles.agent',
    recordedAt:'2026-10-15T12:01:00Z',supersedes:[original.id]});
  assert.equal(corrected.correction.supersedes[0],original.id);
  assert.deepEqual(conversation.snapshot().memory.facts.map(fact=>fact.status),
    ['superseded','active']);
  assert.equal(conversation.snapshot().memory.facts[0].supersededBy,corrected.id);
});

test('MEM-03: memory limits refuse insertion without eviction and reset clears facts',()=>{
  const conversation=new ConversationContext(makeEngine(),{maxFacts:1});
  conversation.translate({text:'The boy sees the cat.',from:'en',to:'pl'});
  conversation.remember({turnId:'t1',referent:'proposition.roles.agent'});
  conversation.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const full=conversation.snapshot();
  assert.equal(conversation.tryRemember({turnId:'t2',referent:'proposition.roles.agent'})
    .error.code,'MEMORY_LIMIT');
  assert.deepEqual(conversation.snapshot(),full);
  assert.throws(()=>new ConversationContext(makeEngine(),{maxFacts:129}),/memory limit/);
  conversation.reset();
  assert.deepEqual(conversation.snapshot().memory,
    {factCount:0,maxFacts:1,facts:[]});
});
