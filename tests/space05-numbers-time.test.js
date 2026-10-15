import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));

test('SPACE-05: exact quantities 0-20 survive English-CORE-Polish roundtrips',()=>{
  for(let value=0;value<=20;value++) {
    const word=en.quantifiers.find(item=>item.meaning.kind==='exact'&&item.meaning.value===value).lemma;
    const source=`${word} ${value===1?'girl':'girls'} ${value===1?'sees':'see'} a dog.`;
    const core=engine.translate({from:'en',to:'core',text:source}).interlingua;
    assert.deepEqual(core.roles.agent.quantifier,{kind:'exact',value});
    assert.equal(core.roles.agent.features.number,value===1?'singular':'plural');
    const polish=engine.translate({from:'en',to:'pl',text:source});
    assert.deepEqual(polish.interlingua.roles.agent.quantifier,{kind:'exact',value});
    const reread=engine.translate({from:'pl',to:'en',text:polish.text});
    assert.deepEqual(reread.interlingua.roles.agent.quantifier,{kind:'exact',value});
    if(value===0||value>=5)assert.match(polish.text,/widzi/u);
  }
});

test('SPACE-05: clock and Gregorian date are explicit local values with no zone conversion',()=>{
  for(const [from,to,text,field,value] of [
    ['en','pl','The girl sees the dog at 07:05.','clockTime',{hour:7,minute:5}],
    ['pl','en','Dziewczynka widzi psa o 07:05.','clockTime',{hour:7,minute:5}],
    ['en','pl','The girl sees the dog on 2024-02-29.','calendarDate',{year:2024,month:2,day:29}],
    ['pl','en','Dziewczynka widzi psa dnia 2024-02-29.','calendarDate',{year:2024,month:2,day:29}]
  ]) {
    const translated=engine.translate({from,to,text});
    assert.deepEqual(translated.interlingua[field],value);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(translated.interlingua)})[field],value);
    assert.deepEqual(engine.analyze({from:to,text:translated.text})[field],value);
    assert.equal(Object.hasOwn(translated.interlingua,'timeZone'),false);
  }
});

test('SPACE-05: unsupported numeric formats and invalid CORE values are refused',()=>{
  for(const text of ['The girl sees the dog at 7:05.','The girl sees the dog on 2023-02-29.',
    'The girl sees the dog at 24:00.','The girl sees the dog around 12:00.']) {
    assert.equal(engine.tryTranslate({from:'en',to:'pl',text}).ok,false,text);
  }
  const valid=engine.translate({from:'en',to:'core',text:'The girl sees the dog at 12:30.'}).interlingua;
  assert.throws(()=>validateInterlingua({...valid,clockTime:{hour:24,minute:0}},engine.ontology,engine.features),/clock time/u);
  const date=engine.translate({from:'en',to:'core',text:'The girl sees the dog on 2024-02-29.'}).interlingua;
  assert.throws(()=>validateInterlingua({...date,calendarDate:{year:2023,month:2,day:29}},engine.ontology,engine.features),/Gregorian/u);
});
