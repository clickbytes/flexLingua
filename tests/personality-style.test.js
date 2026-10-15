import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createQuestion,participant} from '../js/core/interlingua.js';
import {createPersonalityProfile} from '../js/core/personality.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const fact=createEvent('event.visual_perception',{
  agent:participant('person.girl','definite'),theme:participant('animal.dog','definite')
},{tense:'present',polarity:'positive',aspect:'unknown'});
const question=createQuestion(fact);
const profile=(plStyle,enStyle)=>({version:'1.1',id:'test',realization:{
  pronounRealization:'repeat',outputVariant:'preferred',
  replyStyles:{pl:plStyle,en:enStyle}}});

test('MEM-02: each language supports standard and emphatic replies with identical CORE',()=>{
  for(const [language,standard,emphatic] of [
    ['pl','Dziewczynka widzi psa.','Dziewczynka widzi psa!'],
    ['en','The girl sees the dog.','The girl sees the dog!']
  ]) {
    const plain=engine.respond({question,facts:[fact],to:language,
      profile:profile('standard','standard')});
    const styled=engine.respond({question,facts:[fact],to:language,
      profile:profile('emphatic','emphatic')});
    assert.equal(plain.text,standard);
    assert.equal(styled.text,emphatic);
    assert.deepEqual(styled.plan.act,plain.plan.act);
    assert.deepEqual(styled.plan.realization,plain.plan.realization);
  }
});

test('MEM-02: unsupported style falls back with warning; clarification keeps question punctuation',()=>{
  const unsupported=engine.respond({question,facts:[fact],to:'en',
    profile:profile('standard','poetic')});
  assert.equal(unsupported.text,'The girl sees the dog.');
  assert.match(unsupported.warnings[0],/unavailable/);
  const clarify=engine.respond({question,facts:[],clarifyQuestion:question,to:'pl',
    profile:profile('emphatic','standard')});
  assert.equal(clarify.text,'Czy dziewczynka widzi psa?');
  assert.match(clarify.warnings[0],/unavailable/);
  assert.equal(clarify.plan.act.act,'clarify');
  const legacy=createPersonalityProfile({version:'1.0',id:'old',realization:{
    pronounRealization:'repeat',outputVariant:'preferred'}});
  assert.deepEqual(legacy.realization.replyStyles,{pl:'standard',en:'standard'});
});
