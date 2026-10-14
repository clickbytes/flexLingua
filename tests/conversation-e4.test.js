import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const engine=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('E4: separate calls share an explicit CORE entity; mixed-language turns are supported',()=>{
  const e=engine(),conversation=new ConversationContext(e);
  const first=conversation.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  assert.equal(first.text,'Dziewczynka widzi psa.');
  assert.equal(first.eventCount,1);
  const second=conversation.translate({text:'She sees the cat.',from:'en',to:'pl',
    pronounRealization:'safe'});
  assert.equal(second.text,'Ona widzi kota.');
  assert.equal(second.anaphora.antecedent,'e1.agent');
  const third=conversation.translate({text:'Ona widzi książkę.',from:'pl',to:'en',
    pronounRealization:'safe'});
  assert.equal(third.text,'She sees a book.');
  assert.equal(third.eventCount,3);
  const graph=conversation.snapshot().interlingua;
  assert.equal(graph.events.length,3);
  assert.equal(new Set(graph.events.map(x=>x.roles.agent)).size,1);
  assert.deepEqual(e.analyze({text:JSON.stringify(graph),from:'core'}),graph);
});

test('E4: absent and ambiguous antecedents refuse with no state changes',()=>{
  const c=new ConversationContext(engine());
  assert.equal(c.tryTranslate({text:'She sees the cat.',from:'en',to:'pl'})
    .error.code,'UNRESOLVED_ANAPHORA');
  assert.equal(c.snapshot().eventCount,0);
  c.translate({text:'The girl sees the girl.',from:'en',to:'pl'});
  const before=c.snapshot();
  const result=c.tryTranslate({text:'She sees the dog.',from:'en',to:'pl'});
  assert.equal(result.error.code,'AMBIGUOUS_ANAPHORA');
  assert.deepEqual(c.snapshot(),before);
  assert.equal(c.translate({text:'The boy sees the cat.',from:'en',to:'pl'}).eventCount,2);
});

test('E4: repeated noun strings never create inferred identity, even across turns',()=>{
  const c=new ConversationContext(engine());
  c.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  c.translate({text:'The girl sees the cat.',from:'en',to:'pl'});
  const snap=c.snapshot().interlingua;
  assert.notEqual(snap.events[0].roles.agent,snap.events[1].roles.agent);
  assert.equal(c.tryTranslate({text:'She sees the dog.',from:'en',to:'pl'})
    .error.code,'AMBIGUOUS_ANAPHORA');
});

test('E4: ambiguous lexical sense cannot contaminate context without disambiguation',()=>{
  const c=new ConversationContext(engine());
  const failed=c.tryTranslate({text:'The girl sees the bank.',from:'en',to:'pl'});
  assert.equal(failed.error.code,'AMBIGUOUS_CONVERSATION_READING');
  assert.equal(c.snapshot().eventCount,0);
  const selected=c.translate({text:'The girl sees the bank.',from:'en',to:'pl',
    context:{senses:{theme:'place.financial_institution'}}});
  assert.equal(selected.eventCount,1);
  assert.equal(selected.interlingua.roles.theme.concept,'place.financial_institution');
});

test('E4: snapshots are defensive copies and independent sessions never share state',()=>{
  const e=engine(),a=new ConversationContext(e),b=new ConversationContext(e);
  a.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const exposed=a.snapshot();
  exposed.interlingua.roles.agent.concept='person.boy';
  assert.equal(a.snapshot().interlingua.roles.agent.concept,'person.girl');
  assert.equal(b.snapshot().eventCount,0);
  assert.equal(b.tryTranslate({text:'She sees the cat.',from:'en',to:'pl'})
    .error.code,'UNRESOLVED_ANAPHORA');
  a.reset();
  assert.equal(a.snapshot().eventCount,0);
  assert.equal(a.tryTranslate({text:'She sees the cat.',from:'en',to:'pl'})
    .error.code,'UNRESOLVED_ANAPHORA');
});

test('E4: bounded memory rejects ninth event, reset is explicit',()=>{
  const c=new ConversationContext(engine(),{maxEvents:3});
  for(const sentence of [
    'The girl sees the dog.','She sees the cat.','She sees the book.'
  ])c.translate({text:sentence,from:'en',to:'pl'});
  assert.equal(c.snapshot().eventCount,3);
  const result=c.tryTranslate({text:'She sees the dog.',from:'en',to:'pl'});
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'CONTEXT_LIMIT');
  assert.equal(c.snapshot().eventCount,3);
  c.reset();
  assert.equal(c.translate({text:'The boy sees the dog.',from:'en',to:'pl'}).eventCount,1);
});

test('E4: unsupported inputs and realization errors cannot partially commit history',()=>{
  const c=new ConversationContext(engine());
  assert.throws(()=>new ConversationContext(engine(),{maxEvents:9}),/event limit/);
  c.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const baseline=c.snapshot();
  for(const query of [
    {text:'She sees the cat?',from:'en',to:'pl'},
    {text:'The girl sees the cat. The girl sees the dog.',from:'en',to:'pl'},
    {text:'She sees the cat.',from:'en',to:'xy'},
    {text:'She sees the cat.',from:'en',to:'pl',pronounRealization:'never'},
    {text:'She sees the cat.',from:'en',to:'pl',
      context:{coreference:{'e2.agent':'e1.agent'}}}
  ]){
    assert.equal(c.tryTranslate(query).ok,false);
    assert.deepEqual(c.snapshot(),baseline);
  }
  const safe=c.translate({text:'She sees the cat.',from:'en',to:'pl',
    pronounRealization:'safe'});
  assert.equal(safe.eventCount,2);
  assert.equal(safe.text,'Ona widzi kota.');
});

test('E4: explicit CORE output remains language-neutral and without pronoun tokens',()=>{
  const c=new ConversationContext(engine());
  c.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
  const out=c.translate({text:'She sees the cat.',from:'en',to:'core',
    pronounRealization:'safe'});
  assert.equal(JSON.parse(out.text).type,'event');
  assert.equal(out.conversation.type,'discourse');
  assert.equal(out.conversation.events[0].roles.agent,
    out.conversation.events[1].roles.agent);
  assert.equal(JSON.stringify(out.conversation).includes('"she"'),false);
});

test('PERS-06: safe pronoun realization preserves speaker and addressee events',()=>{
  const c=new ConversationContext(engine());
  const out=c.translate({text:'I see a dog.',from:'en',to:'pl',pronounRealization:'safe'});
  assert.equal(out.text,'Ja widzę psa.');
  assert.deepEqual(out.interlingua.roles.agent.referent,
    {kind:'deictic',anchor:'speaker'});
  assert.deepEqual(out.interlingua.roles.agent.agreement,
    {person:'first',number:'singular'});
  assert.deepEqual(out.conversation,out.interlingua);
  assert.deepEqual(c.snapshot().interlingua.roles.agent,
    {referent:{kind:'deictic',anchor:'speaker'},agreement:{person:'first',number:'singular'}});

  const other=new ConversationContext(engine()).translate({text:'Ty widzisz psa.',
    from:'pl',to:'en',pronounRealization:'safe'});
  assert.equal(other.text,'You see a dog.');
  assert.deepEqual(other.interlingua.roles.agent,
    {referent:{kind:'deictic',anchor:'addressee'},agreement:{person:'second',number:'singular'}});
});
