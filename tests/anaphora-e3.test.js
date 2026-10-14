import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('E3: three linked pronoun sentences share one CORE entity and round-trip',()=>{
  const e=engine();
  for(const [from,to,source,expected] of [
    ['en','pl','The girl sees the dog. She sees the cat. She sees the book.',
      'Dziewczynka widzi psa. Ona widzi kota. Ona widzi książkę.'],
    ['pl','en','Dziewczynka widzi psa. Ona widzi kota. Ona widzi książkę.',
      'A girl sees a dog. She sees a cat. She sees a book.'],
    ['en','pl','The boy sees the girl. She sees the dog. She sees the cat.',
      'Chłopiec widzi dziewczynkę. Ona widzi psa. Ona widzi kota.']
  ]){
    const output=e.translate({text:source,from,to,pronounRealization:'safe'});
    assert.equal(output.text,expected);
    assert.deepEqual(output.pronounizedEvents,[2,3]);
    const events=output.interlingua.events;
    assert.equal(events.length,3);
    assert.equal(events[0].roles[events[1].roles.agent===events[0].roles.agent?
      'agent':'theme'],events[2].roles.agent);
    const reread=e.analyze({text:expected,from:to});
    assert.equal(reread.events[1].roles.agent,reread.events[2].roles.agent);
    assert.deepEqual(e.analyze({text:JSON.stringify(output.interlingua),from:'core'}),
      output.interlingua);
  }
});

test('E3: multiple earlier entities remain distinguishable; no recency shortcut',()=>{
  const e=engine();
  const output=e.translate({from:'en',to:'pl',
    text:'The girl sees the dog. The boy sees the cat. She sees the book.',
    pronounRealization:'safe'});
  assert.equal(output.text,'Dziewczynka widzi psa. Chłopiec widzi kota. Ona widzi książkę.');
  assert.equal(output.interlingua.events[0].roles.agent,
    output.interlingua.events[2].roles.agent);
  assert.notEqual(output.interlingua.events[1].roles.agent,
    output.interlingua.events[2].roles.agent);
  const boy=e.translate({from:'en',to:'pl',
    text:'The boy sees the girl. She sees the dog. He sees the cat.',
    pronounRealization:'safe'});
  assert.equal(boy.text,'Chłopiec widzi dziewczynkę. Ona widzi psa. On widzi kota.');
  assert.equal(boy.interlingua.events[0].roles.theme,
    boy.interlingua.events[1].roles.agent);
  assert.equal(boy.interlingua.events[0].roles.agent,
    boy.interlingua.events[2].roles.agent);
});

test('E3: two independent compatible entities must not be guessed as one',()=>{
  const e=engine();
  for(const source of [
    'The girl sees the dog. The girl sees the cat. She sees the book.',
    'The boy sees the girl. The girl sees the dog. She sees the cat.'
  ]){
    const result=e.tryTranslate({text:source,from:'en',to:'pl',
      pronounRealization:'safe'});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'AMBIGUOUS_ANAPHORA');
  }
  const missing=e.tryTranslate({from:'en',to:'pl',
    text:'The boy sees the dog. He sees the cat. She sees the book.'});
  assert.equal(missing.error.code,'UNRESOLVED_ANAPHORA');
});

test('E3: semantic ambiguity unrelated to pronoun retains distinct readings',()=>{
  const e=engine();
  const src='The girl sees the bank. She sees the dog. She sees the cat.';
  const readings=e.analyzeCandidates({from:'en',text:src});
  assert.equal(readings.length,2);
  assert.deepEqual(new Set(readings.map(x=>x.interlingua.entities[
    x.interlingua.events[0].roles.theme].concept)),
    new Set(['place.financial_institution','place.riverbank']));
  assert.ok(readings.every(x=>x.interlingua.events[0].roles.agent===
    x.interlingua.events[1].roles.agent &&
    x.interlingua.events[1].roles.agent===x.interlingua.events[2].roles.agent));
});

test('E3: exactly eight events are bounded, ninth and initial pronoun are rejected',()=>{
  const e=engine();
  const eight=['The girl sees the dog.',...Array(7).fill('She sees the cat.')].join(' ');
  const output=e.analyze({from:'en',text:eight});
  assert.equal(output.events.length,8);
  assert.equal(new Set(output.events.map(x=>x.roles.agent)).size,1);
  const result=e.realize({interlingua:output,to:'pl',pronounRealization:'safe'});
  assert.equal(result.pronounizedEvents.length,7);
  assert.equal(e.tryTranslate({text:eight+' She sees the cat.',from:'en',to:'pl'}).ok,false);
  assert.equal(e.tryTranslate({text:'She sees the cat. The girl sees the dog. She sees the book.',
    from:'en',to:'pl'}).error.code,'UNRESOLVED_ANAPHORA');
});

test('E3: plain sentences stay independent without links; manual cross-event refs remain opt-in',()=>{
  const e=engine();
  const src='The girl sees the dog. The girl sees the cat. The girl sees the book.';
  const unlinked=e.translate({text:src,from:'en',to:'pl',pronounRealization:'safe'});
  assert.equal(unlinked.text,
    'Dziewczynka widzi psa. Dziewczynka widzi kota. Dziewczynka widzi książkę.');
  assert.deepEqual(unlinked.pronounizedEvents,[]);
  const linked=e.translate({text:src,from:'en',to:'pl',
    context:{coreference:{'e2.agent':'e1.agent','e3.agent':'e1.agent'}},
    pronounRealization:'safe'});
  assert.equal(linked.text,'Dziewczynka widzi psa. Ona widzi kota. Ona widzi książkę.');
  assert.deepEqual(linked.pronounizedEvents,[2,3]);
});
