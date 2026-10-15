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

test('SPACE-04: deictic day is explicit and independent of grammatical tense',()=>{
  for(const [from,to,text,expected,reference,tense] of [
    ['en','pl','The girl sees the dog today.','Dziewczynka widzi psa dziś.','today','present'],
    ['pl','en','Dziewczynka widzi psa dziś.','A girl sees a dog today.','today','present'],
    ['pl','en','Dziewczynka widzi psa jutro.','A girl sees a dog tomorrow.','tomorrow','present'],
    ['en','pl','The girl sees the dog tomorrow.','Dziewczynka widzi psa jutro.','tomorrow','present'],
    ['en','pl','The girl saw the dog yesterday.','Dziewczynka widziała psa wczoraj.','yesterday','past'],
    ['pl','en','Dziewczynka widziała psa wczoraj.','A girl saw a dog yesterday.','yesterday','past']
  ]) {
    const translated=engine.translate({from,to,text});
    assert.equal(translated.text,expected,text);
    assert.equal(translated.interlingua.features.tense,tense);
    assert.equal(translated.interlingua.timeReference,reference);
    assert.equal(engine.analyze({from:'core',text:JSON.stringify(translated.interlingua)}).timeReference,
      reference);
    const reread=engine.analyze({from:to,text:translated.text});
    assert.equal(reread.features.tense,tense);
    assert.equal(reread.timeReference,reference);
    assert.equal(validateInterlingua(reread,engine.ontology,engine.features),reread);
  }
});

test('SPACE-04: unknown temporal expressions refuse and invalid time references fail validation',()=>{
  assert.equal(engine.tryTranslate({from:'en',to:'pl',
    text:'The girl sees the dog someday.'}).ok,false);
  const known=engine.translate({from:'en',to:'core',text:'The girl sees the dog today.'}).interlingua;
  for(const timeReference of ['future','next_week',null]) {
    assert.throws(()=>validateInterlingua({...known,timeReference},engine.ontology,engine.features),
      /time reference/u);
  }
});
