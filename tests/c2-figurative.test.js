import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,mf,em,pm,fixture]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/features.json',
  'data/morphology/en.json','data/morphology/pl.json','tests/fixtures/gold-figurative.json'
].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(em,en,mf,{core});
const plMorph=createMorphology(pm,pl,mf,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

test('ADV-03 30 reviewed internal cases distinguish literal, metaphor and quotation',()=>{
  assert.equal(fixture.cases.length,30);
  assert.equal(new Set(fixture.cases.map(row=>row.id)).size,30);
  for(const kind of ['literal','metaphor','quotation'])
    assert.equal(fixture.cases.filter(row=>row.kind===kind).length,10);
  for(const row of fixture.cases){
    const to=row.from==='en'?'pl':'en';
    if(row.kind==='quotation'){
      const result=engine.tryTranslate({text:row.text,from:row.from,to});
      assert.equal(result.ok,false,row.id);
      continue;
    }
    const candidates=engine.analyzeCandidates({text:row.text,from:row.from});
    const selected=candidates.find(candidate=>candidate.interlingua.concept===row.concept);
    assert.ok(selected,row.id);
    if(row.ambiguous){
      assert.ok(candidates.some(candidate=>candidate.interlingua.concept==='event.break_object'),row.id);
      const translation=engine.translate({text:row.text,from:row.from,to});
      assert.match(translation.warnings.join(' '),/distinct semantic readings/u,row.id);
      assert.ok(translation.semanticAlternatives.some(item=>
        item.interlingua.concept==='event.social_icebreak'),row.id);
    }else assert.equal(candidates.length,1,row.id);
    const rendered=engine.realize({interlingua:selected.interlingua,to});
    assert.ok(engine.analyzeCandidates({text:rendered.text,from:to}).some(item=>
      item.interlingua.concept===row.concept),row.id);
    const serialized=engine.realize({interlingua:selected.interlingua,to:'core'}).text;
    assert.equal(engine.analyze({text:serialized,from:'core'}).concept,row.concept,row.id);
  }
});

test('ADV-03 figurative event has no physical ice theme; fabricated theme is refused',()=>{
  const figurative=engine.analyze({text:'Dziewczynka przełamuje lody.',from:'pl'});
  const literal=engine.analyze({text:'Dziewczynka łamie lód.',from:'pl'});
  assert.equal(figurative.roles.theme,undefined);
  assert.equal(literal.roles.theme.concept,'object.ice');
  assert.notEqual(figurative.concept,literal.concept);
  const fabricated=structuredClone(figurative);
  fabricated.roles.theme=literal.roles.theme;
  assert.throws(()=>engine.realize({interlingua:fabricated,to:'en'}),/Event roles do not match/);
});

test('ADV-03 Polish idiom inflects its fixed object under negation',()=>{
  const candidates=engine.analyzeCandidates({text:'The girl does not break the ice.',from:'en'});
  const figurative=candidates.find(item=>item.interlingua.concept==='event.social_icebreak');
  assert.ok(figurative);
  const polish=engine.realize({interlingua:figurative.interlingua,to:'pl'});
  assert.equal(polish.text,'Dziewczynka nie przełamuje lodów.');
  const parsed=engine.analyze({text:polish.text,from:'pl'});
  assert.equal(parsed.concept,'event.social_icebreak');
  assert.equal(parsed.features.polarity,'negative');
});
