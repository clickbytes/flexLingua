import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createInformationStructure,eventSemanticSignature} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const choices=[{topic:'agent',focus:'theme'},{topic:'agent',focus:'recipient'}];

test('ADV-02 controlled PL and EN paraphrases preserve one semantic signature',()=>{
  const gold=[
    {from:'en',to:'pl',source:'The girl gives the boy a book.',
      expected:['Dziewczynka daje chłopcu książkę.','Dziewczynka daje książkę chłopcu.']},
    {from:'pl',to:'en',source:'Dziewczynka daje chłopcu książkę.',
      expected:['A girl gives a boy a book.','A girl gives a book to a boy.']}
  ];
  for(const row of gold){
    const source=engine.analyze({text:row.source,from:row.from});
    const signature=eventSemanticSignature(source);
    for(const [index,choice] of choices.entries()){
      const result=engine.translate({text:row.source,from:row.from,to:row.to,
        informationStructure:choice});
      assert.equal(result.text,row.expected[index]);
      assert.equal(eventSemanticSignature(result.interlingua),signature);
      assert.equal(eventSemanticSignature(engine.analyze({text:result.text,from:row.to})),
        eventSemanticSignature(engine.analyze({text:row.expected[0],from:row.to})));
      const serialized=engine.realize({interlingua:source,to:'core'}).text;
      assert.equal(eventSemanticSignature(engine.analyze({text:serialized,from:'core'})),signature);
    }
  }
});

test('ADV-02 focus ordering preserves negation and rejects unsupported scope or roles',()=>{
  const negative=engine.analyze({text:'The girl does not give the boy a book.',from:'en'});
  for(const choice of choices){
    const output=engine.realize({interlingua:negative,to:'pl',informationStructure:choice});
    assert.equal(output.interlingua.features.polarity,'negative');
    assert.equal(engine.analyze({text:output.text,from:'pl'}).features.polarity,'negative');
    assert.equal(eventSemanticSignature(output.interlingua),eventSemanticSignature(negative));
  }
  assert.throws(()=>createInformationStructure(negative,{topic:'theme',focus:'recipient'}),/Unsupported information structure/);
  assert.throws(()=>engine.realize({interlingua:negative,to:'en',
    informationStructure:{topic:'agent',focus:'agent'}}),/Unsupported information structure/);
  assert.throws(()=>engine.realize({interlingua:engine.analyze({text:'The girl sees the book.',from:'en'}),
    to:'pl',informationStructure:choices[0]}),/Unsupported information structure/);
});
