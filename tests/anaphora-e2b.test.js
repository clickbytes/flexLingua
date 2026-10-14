import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(pl,pg))
  .registerLanguage(createRuleAdapter(en,eg));

test('E2b: opt-in output pronouns preserve semantic identity and parse back through INTER',()=>{
  const e=engine();
  for(const [from,to,text,expected] of [
    ['en','pl','The girl sees the dog. She sees the cat.',
      'Dziewczynka widzi psa. Ona widzi kota.'],
    ['pl','en','Dziewczynka widzi psa. Ona widzi kota.',
      'A girl sees a dog. She sees a cat.'],
    ['en','pl','The boy sees the girl. She sees the cat.',
      'Chłopiec widzi dziewczynkę. Ona widzi kota.'],
    ['pl','en','Chłopiec widzi dziewczynkę. Ona widzi kota.',
      'A boy sees a girl. She sees a cat.'],
    ['en','pl','The girl sees the boy. He sees the cat.',
      'Dziewczynka widzi chłopca. On widzi kota.']
  ]){
    const output=e.translate({from,to,text,pronounRealization:'safe'});
    assert.equal(output.text,expected,text);
    assert.deepEqual(output.pronounizedEvents,[2]);
    const restored=e.analyze({from:to,text:output.text});
    assert.equal(restored.events[0].roles[output.interlingua.events[0].roles.agent===
      output.interlingua.events[1].roles.agent?'agent':'theme'],
      restored.events[1].roles.agent);
    assert.equal(restored.entities[restored.events[1].roles.agent].concept,
      output.interlingua.entities[output.interlingua.events[1].roles.agent].concept);
    assert.deepEqual(e.analyze({from:'core',text:JSON.stringify(output.interlingua)}),
      output.interlingua);
  }
});

test('E2b: default remains noun repetition and semantic documents are unchanged',()=>{
  const e=engine(),text='The girl sees the dog. She sees the cat.';
  const legacy=e.translate({text,from:'en',to:'pl'});
  const explicit=e.translate({text,from:'en',to:'pl',pronounRealization:'repeat'});
  const safe=e.translate({text,from:'en',to:'pl',pronounRealization:'safe'});
  assert.equal(legacy.text,'Dziewczynka widzi psa. Dziewczynka widzi kota.');
  assert.equal(explicit.text,legacy.text);
  assert.ok(legacy.warnings.some(w=>w.includes('target repeats the noun phrase')));
  assert.ok(!safe.warnings.some(w=>w.includes('target repeats the noun phrase')));
  assert.deepEqual(safe.interlingua,legacy.interlingua);
  assert.equal(e.realize({interlingua:legacy.interlingua,to:'core',
    pronounRealization:'safe'}).text,JSON.stringify(legacy.interlingua,null,2));
});

test('E2b: manual coreference and external CORE documents may opt in without guessing',()=>{
  const e=engine();
  const source='The girl sees the dog. The girl sees the cat.';
  const context={coreference:{'e2.agent':'e1.agent'}};
  const linked=e.analyze({text:source,from:'en',context});
  assert.equal(e.realize({interlingua:linked,to:'pl',
    pronounRealization:'safe'}).text,'Dziewczynka widzi psa. Ona widzi kota.');
  assert.equal(e.translate({text:source,from:'en',to:'pl',context,
    pronounRealization:'safe'}).text,'Dziewczynka widzi psa. Ona widzi kota.');
  const bare=e.translate({text:source,from:'en',to:'pl',
    pronounRealization:'safe'});
  assert.equal(bare.text,'Dziewczynka widzi psa. Dziewczynka widzi kota.');
  assert.deepEqual(bare.pronounizedEvents,[]);
  const round=e.translate({text:JSON.stringify(linked),from:'core',to:'en',
    pronounRealization:'safe'});
  assert.equal(round.text,'The girl sees the dog. She sees the cat.');
});

test('E2b: ambiguous target antecedents refuse surface pronoun even if identity is explicit',()=>{
  const e=engine();
  const text='The girl sees the girl. The girl sees the dog.';
  const context={coreference:{'e2.agent':'e1.agent'}};
  const output=e.translate({text,from:'en',to:'pl',context,pronounRealization:'safe'});
  assert.equal(output.text,'Dziewczynka widzi dziewczynkę. Dziewczynka widzi psa.');
  assert.deepEqual(output.pronounizedEvents,[]);
  assert.match(output.warnings.join(' '),/pronoun was not safe/i);
  assert.equal(output.interlingua.events[1].roles.agent,
    output.interlingua.events[0].roles.agent);
});

test('E2b: unsupported policies and spoofed grammar overrides are rejected',()=>{
  const e=engine();
  const input='The girl sees the dog.';
  for(const bad of ['always','she',true,null,{},'']){
    const result=e.tryTranslate({text:input,from:'en',to:'pl',pronounRealization:bad});
    assert.equal(result.ok,false,String(bad));
    assert.equal(result.error.code,'INVALID_INPUT');
  }
  const enAdapter=e.language('en');
  const boy=e.analyze({text:'The boy sees the dog.',from:'en'});
  assert.throws(()=>enAdapter.realize(boy,{subjectPronoun:'she'}),
    /Unsupported subject pronoun/);
});
