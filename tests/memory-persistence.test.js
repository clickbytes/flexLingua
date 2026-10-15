import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';
import {MemoryStore,parseMemoryDocument} from '../js/core/memory-store.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const makeSession=()=>new ConversationContext(new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg)));

test('MEM-04: persistence requires opt-in and roundtrips facts into another session',()=>{
  const entries=new Map();
  const storage={getItem:key=>entries.get(key)??null,
    setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  const store=new MemoryStore({storage});
  const first=makeSession();
  first.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  first.remember({turnId:'t1',referent:'proposition.roles.agent'});
  assert.equal(store.save(first.snapshot().memory),false);
  assert.equal(store.load(),null);
  assert.equal(entries.size,0);
  store.enable();
  assert.equal(store.save(first.snapshot().memory),true);
  const second=makeSession();
  second.importMemory(store.export(store.load()));
  assert.deepEqual(second.snapshot().memory,first.snapshot().memory);
  assert.equal(second.snapshot().turnCount,0);
  second.clearMemory();
  assert.equal(second.snapshot().memory.factCount,0);
  store.disable();
  assert.equal(store.load(),null);
  store.delete();
  assert.equal(entries.size,0);
});

test('MEM-04: legacy import, invalid versions and malformed records',()=>{
  const session=makeSession();
  session.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  session.remember({turnId:'t1',referent:'proposition.roles.agent'});
  const snapshot=session.snapshot().memory;
  assert.deepEqual(parseMemoryDocument(JSON.stringify(snapshot)),snapshot);
  const before=session.snapshot().memory;
  assert.throws(()=>session.importMemory(JSON.stringify({version:2,memory:snapshot})),
    {code:'MEMORY_DOCUMENT_INVALID'});
  assert.throws(()=>session.importMemory(JSON.stringify({version:1,memory:{
    ...snapshot,facts:[{...snapshot.facts[0],id:'f999'}]}})),
    {code:'MEMORY_DOCUMENT_INVALID'});
  assert.throws(()=>session.importMemory(JSON.stringify({version:1,memory:{
    ...snapshot,maxFacts:1}})),{code:'MEMORY_LIMIT_MISMATCH'});
  assert.deepEqual(session.snapshot().memory,before);
});
