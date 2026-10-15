import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createItalianAdapter} from '../js/languages/it.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createLexicon} from '../js/core/lexicon.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,it,eg,pg,ig,mf,em,pm]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','it.json',
  'grammar/en.json','grammar/pl.json','grammar/it.json',
  'morphology/features.json','morphology/en.json','morphology/pl.json'
].map(read));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(em,en,mf,{core});
const plMorph=createMorphology(pm,pl,mf,{core});
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}))
  .registerLanguage(createItalianAdapter(it,ig));
const subjects=[
  ['person.girl','la ragazza'],['person.boy','il ragazzo'],
  ['animal.dog','il cane'],['animal.cat','il gatto'],['person.woman','la donna']
];
const objects=[
  ['animal.dog','il cane'],['animal.cat','il gatto'],
  ['object.book','il libro'],['object.apple','la mela'],['person.boy','il ragazzo']
];
const ref=concept=>({concept,features:{number:'singular',definiteness:'definite'}});

// Fixed, project-authored surface and semantic oracle: 5 subjects × 5 objects × 2 polarities.
test('MULTI-03: 50 Italian CORE↔IT gold cases and PL/EN transit',()=>{
  let count=0;
  for(const [agent,subject] of subjects) for(const [theme,object] of objects)
    for(const [polarity,negative] of [['positive',''],['negative','non ']]) {
      const expected=`${subject[0].toLocaleUpperCase('it')}${subject.slice(1)} ${negative}vede ${object}.`;
      const meaning={version:'0.2',type:'event',concept:'event.visual_perception',
        roles:{agent:ref(agent),theme:ref(theme)},
        features:{tense:'present',polarity,aspect:'unknown'}};
      assert.equal(engine.realize({interlingua:meaning,to:'it'}).text,expected);
      const parsed=engine.analyze({text:expected,from:'it'});
      assert.deepEqual(parsed,meaning);
      for(const language of ['pl','en']) {
        const surface=engine.realize({interlingua:parsed,to:language}).text;
        const transit=engine.analyze({text:surface,from:language});
        if(language==='pl') {
          // Polish articles are absent and its present verb marks imperfective aspect.
          assert.equal(transit.concept,meaning.concept);
          assert.equal(transit.features.tense,'present');
          assert.equal(transit.features.polarity,polarity);
          assert.equal(transit.roles.agent.concept,agent);
          assert.equal(transit.roles.theme.concept,theme);
        } else assert.deepEqual(transit,meaning,`${expected} via ${language}`);
      }
      count++;
    }
  assert.equal(count,50);
});

test('MULTI-03: strict CORE-linked lexicon and bounded refusal',()=>{
  createLexicon(it, {strict:true}).validateCore(core);
  for(const [text,from,to] of [
    ['La ragazza vede il drago.','it','en'],
    ['La ragazza vedeva il cane.','it','en'],
    ['The girl saw the dog.','en','it'],
    ['The big girl sees the dog.','en','it'],
    ['Does the girl see the dog?','en','it']
  ]) {
    const result=engine.tryTranslate({text,from,to});
    assert.equal(result.ok,false,text);
    assert.equal(typeof result.error.message,'string');
  }
  assert.throws(()=>createItalianAdapter(en,ig),/Italian adapter/);
});

test('MULTI-03: plural noun and verb cells are reversible',()=>{
  const text='Le ragazze non vedono i cani.';
  const meaning=engine.analyze({text,from:'it'});
  assert.equal(meaning.roles.agent.features.number,'plural');
  assert.equal(meaning.roles.theme.features.number,'plural');
  assert.equal(meaning.features.polarity,'negative');
  assert.equal(engine.realize({interlingua:meaning,to:'it'}).text,text);
});
