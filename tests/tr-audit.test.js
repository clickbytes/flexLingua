import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createTurkishAdapter} from '../js/languages/tr.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,tr,eg,pg,tg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','tr.json',
  'grammar/en.json','grammar/pl.json','grammar/tr.json'
].map(read));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg))
  .registerLanguage(createTurkishAdapter(tr,tg));

test('MULTI-02: the TR data inventory is a small demonstration, not level coverage',()=>{
  assert.equal(tr.nouns.length,6);
  assert.equal(tr.verbs.length,2);
  assert.deepEqual(Object.keys(tg.frames),[
    'event.visual_perception','event.transfer_possession']);
  assert.equal(tr.nouns.flatMap(noun=>Object.values(noun.forms)
    .flatMap(number=>Object.values(number))).length,36);
  assert.equal(tr.verbs.flatMap(verb=>Object.values(verb.forms)).length,8);
  const support=engine.language('tr').describe().support;
  for(const feature of ['questions','relativeClauses','propositionalComplements',
    'states','modality','quantifiers','wideScopeNegation'])
    assert.equal(support[feature],false,feature);
  assert.throws(()=>createTurkishAdapter(en,tg),/Turkish adapter/);
});

test('MULTI-02: historical EN↔TR translation remains bounded and deterministic',()=>{
  assert.equal(engine.translate({text:'The girl saw the dog.',from:'en',to:'tr'}).text,
    'Kız köpeği gördü.');
  assert.equal(engine.translate({text:'Kız köpeği gördü.',from:'tr',to:'en'}).text,
    'A girl saw the dog.');
  assert.equal(engine.translate({text:'The boy gave the girl a book.',from:'en',to:'tr'}).text,
    'Oğlan kıza kitap verdi.');
});

test('MULTI-02: unknown Turkish syntax refuses instead of completing missing meaning',()=>{
  for(const text of ['The big girl saw a dog.',
    'The girl believed that the dog saw the cat.']) {
    const result=engine.tryTranslate({text,from:'en',to:'tr'});
    assert.equal(result.ok,false,text);
    assert.match(result.error.message,/modifier|complement/i);
  }
  const unknown=engine.tryTranslate({text:'Kız nerede?',from:'tr',to:'en'});
  assert.equal(unknown.ok,false);
  assert.equal(typeof unknown.error.message,'string');
});
