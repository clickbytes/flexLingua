import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('Batch F: multiword verb meanings have independent CORE frames, not sentence mappings',()=>{
  const engine=make();
  for(const [from,to,input,output,concept] of [
    ['en','pl','The girl looks at the dog.','Dziewczynka patrzy na psa.','event.visual_attention'],
    ['en','pl','The girl picks up the book.','Dziewczynka podnosi książkę.','event.raise_object'],
    ['pl','en','Dziewczynka patrzy na psa.','A girl looks at a dog.','event.visual_attention'],
    ['pl','en','Dziewczynka podnosi książkę.','A girl picks up a book.','event.raise_object']
  ]){
    const result=engine.translate({from,to,text:input});
    assert.equal(result.text,output,input);
    assert.equal(result.interlingua.concept,concept);
    assert.equal(engine.analyze({from:to,text:output}).concept,concept);
    assert.equal(engine.analyze({from:'core',text:JSON.stringify(result.interlingua)}).concept,concept);
  }
  const see=engine.analyze({from:'en',text:'The girl sees the dog.'});
  const look=engine.analyze({from:'en',text:'The girl looks at the dog.'});
  assert.notEqual(see.concept,look.concept);
});

test('Batch F: negative preposition governing accusative is not treated as transitive negation',()=>{
  const engine=make();
  const look=engine.translate({text:'The girl does not look at the book.',from:'en',to:'pl'});
  assert.equal(look.text,'Dziewczynka nie patrzy na książkę.');
  const lift=engine.translate({text:'The girl does not pick up the book.',from:'en',to:'pl'});
  assert.equal(lift.text,'Dziewczynka nie podnosi książki.');
  assert.equal(engine.analyze({text:look.text,from:'pl'}).features.polarity,'negative');
  assert.equal(engine.analyze({text:lift.text,from:'pl'}).features.polarity,'negative');
  assert.equal(look.interlingua.features.polarity,'negative');
});

test('Batch F: modal + multiword combinations reuse composition rules',()=>{
  const engine=make();
  const out=engine.translate({text:'The girl can look at the dog.',from:'en',to:'pl'});
  assert.equal(out.text,'Dziewczynka może patrzeć na psa.');
  assert.equal(out.interlingua.operator,'modality.ability');
  assert.equal(out.interlingua.operand.concept,'event.visual_attention');
  assert.equal(engine.analyze({text:out.text,from:'pl'}).operand.concept,'event.visual_attention');
});

test('Batch F: interrogatives remain correct where frame licenses role extraction',()=>{
  const engine=make();
  assert.equal(engine.translate({text:'Does the girl look at the dog?',from:'en',to:'pl'}).text,
    'Czy dziewczynka patrzy na psa?');
  assert.equal(engine.translate({text:'What does the girl pick up?',from:'en',to:'pl'}).text,
    'Co podnosi dziewczynka?');
  assert.equal(engine.translate({text:'What does the girl look at?',from:'en',to:'pl'}).text,
    'Na co patrzy dziewczynka?');
  assert.equal(engine.translate({text:'What can the girl look at?',from:'en',to:'pl'}).text,
    'Na co może patrzeć dziewczynka?');
  for(const [from,text] of [
    ['pl','Co patrzy na dziewczynka?']
  ]) {
    assert.equal(engine.tryTranslate({text,from,to:from==='en'?'pl':'en'}).ok,false,text);
  }
});

test('Batch F: typed lexical concepts constrain the roles of new frames',()=>{
  const engine=make();
  const invalid={
    version:'0.2',type:'event',concept:'event.raise_object',
    roles:{
      agent:{concept:'person.girl',features:{number:'singular',definiteness:'definite'}},
      theme:{concept:'animal.dog',features:{number:'singular',definiteness:'definite'}}
    },
    features:{tense:'present',polarity:'positive',aspect:'unknown'}
  };
  assert.equal(engine.tryTranslate({text:JSON.stringify(invalid),from:'core',to:'en'}).ok,false);
});
