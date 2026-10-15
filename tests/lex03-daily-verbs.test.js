import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,eg,pg,emData,pmData,mf]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json',
  'data/morphology/pl.json','data/morphology/features.json'
].map(load));
const core=createCoreLanguage(ontology);
const enMorph=createMorphology(emData,en,mf,{core});
const plMorph=createMorphology(pmData,pl,mf,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

const gold=[
  ['event.eat','eats','eat','ate','jeść','je','jedzą','jadła','food',
    'The girl eats a banana.','Dziewczynka je banan.','A girl eats a banana.','The girl ate a banana.','Dziewczynka jadła banan.','A girl ate a banana.'],
  ['event.drink','drinks','drink','drank','pić','pije','piją','piła','beverage',
    'The girl drinks a juice.','Dziewczynka pije sok.','A girl drinks a juice.','The girl drank a juice.','Dziewczynka piła sok.','A girl drank a juice.'],
  ['event.work','works','work','worked','pracować','pracuje','pracują','pracowała',null,
    'The girl works.','Dziewczynka pracuje.','A girl works.','The girl worked.','Dziewczynka pracowała.','A girl worked.'],
  ['event.learn','learns','learn','learned','uczyć się','uczy się','uczą się','uczyła się','knowledge_content',
    'The girl learns a lesson.','Dziewczynka uczy się lekcji.','A girl learns a lesson.','The girl learned a lesson.','Dziewczynka uczyła się lekcji.','A girl learned a lesson.'],
  ['event.sleep','sleeps','sleep','slept','spać','śpi','śpią','spała',null,
    'The girl sleeps.','Dziewczynka śpi.','A girl sleeps.','The girl slept.','Dziewczynka spała.','A girl slept.']
];

test('LEX-03: five daily predicates have separate bilingual senses and explicit capabilities',()=>{
  const enSenseIds=[],plSenseIds=[];
  for(const [concept,en3,enBase,enPast,plLemma,pl3,pl3pl,plPast,themeType] of gold) {
    const english=en.verbs.find(item=>item.lemma===enBase&&item.senses.some(s=>s.coreRef.id===concept));
    const polish=pl.verbs.find(item=>item.lemma===plLemma&&item.senses.some(s=>s.coreRef.id===concept));
    assert.ok(english,`English predicate ${concept}`);
    assert.ok(polish,`Polish predicate ${concept}`);
    enSenseIds.push(english.senses[0].id);
    plSenseIds.push(polish.senses[0].id);
    assert.deepEqual(english.capabilities.tenses,['present','past']);
    assert.deepEqual(english.capabilities.aspects,['unknown']);
    assert.deepEqual(polish.capabilities.tenses,['present','past']);
    assert.deepEqual(polish.capabilities.aspects,['imperfective']);
    assert.equal(english.capabilities.roles.agent,'person');
    assert.equal(polish.capabilities.roles.agent,'person');
    if(themeType) {
      assert.equal(ontology.concepts[concept].roleTypes.theme,themeType);
      assert.equal(english.capabilities.roles.theme,themeType);
      assert.equal(polish.capabilities.roles.theme,themeType);
    } else {
      assert.ok(!Object.hasOwn(ontology.concepts[concept].roleTypes,'theme'));
    }
    assert.deepEqual(eg.frames[concept].capabilities.tenses,['present','past']);
    assert.deepEqual(pg.frames[concept].capabilities.aspects,['imperfective']);
    assert.equal(enMorph.has(english.id),true);
    assert.equal(plMorph.has(polish.id),true);
    assert.ok(enMorph.analyze({text:en3}).some(form=>form.lexemeId===english.id));
    assert.ok(enMorph.analyze({text:enPast}).some(form=>form.lexemeId===english.id));
    assert.ok(plMorph.analyze({text:pl3}).some(form=>form.lexemeId===polish.id));
    assert.ok(plMorph.analyze({text:pl3pl}).some(form=>form.lexemeId===polish.id));
    assert.ok(plMorph.analyze({text:plPast}).some(form=>form.lexemeId===polish.id));
  }
  assert.equal(new Set(enSenseIds).size,5);
  assert.equal(new Set(plSenseIds).size,5);
});

test('LEX-03: daily predicate gold composes in both directions with correct CORE roles',()=>{
  for(const [concept,,,,,,,,,enPresent,plPresent,enPresentBack,enPast,plPast,enPastBack] of gold) {
    for(const [source,target,input,expected] of [
      ['en','pl',enPresent,plPresent],['pl','en',plPresent,enPresentBack],
      ['en','pl',enPast,plPast],['pl','en',plPast,enPastBack]
    ]) {
      const output=engine.translate({from:source,to:target,text:input});
      assert.equal(output.text,expected,`${input}`);
      assert.equal(output.interlingua.concept,concept);
      assert.equal(output.interlingua.roles.agent.concept,'person.girl');
    }
  }
});

test('LEX-03: declared role types reject incompatible themes and intransitive objects',()=>{
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl eats a lesson.'}).ok,false);
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl learns a banana.'}).ok,false);
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl works the banana.'}).ok,false);
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The banana sleeps.'}).ok,false);
});

test('LEX-03: negated eating uses Polish genitive and English auxiliary forms',()=>{
  const english=engine.translate({from:'en',to:'pl',text:'The girl does not eat a banana.'});
  assert.equal(english.text,'Dziewczynka nie je banana.');
  assert.equal(english.interlingua.roles.theme.concept,'food.banana');
  const polish=engine.translate({from:'pl',to:'en',text:'Dziewczynka nie je banana.'});
  assert.equal(polish.text,'A girl does not eat a banana.');
  assert.equal(polish.interlingua.roles.theme.concept,'food.banana');
});
