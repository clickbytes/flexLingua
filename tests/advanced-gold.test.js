import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';
import {buildAdvancedGoldReport} from '../tools/advanced-gold-lib.mjs';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,mf,em,pm,fixture,targets]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/features.json',
  'data/morphology/en.json','data/morphology/pl.json',
  'tests/fixtures/gold-advanced.json','data/coverage/c2-targets.json'
].map(load));
const core=createCoreLanguage(concepts);
const enMorph=createMorphology(em,en,mf,{core});
const plMorph=createMorphology(pm,pl,mf,{core});
const engine=new Engine(concepts,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));
const fixtureSha256=createHash('sha256').update(await readFile(new URL(
  '../tests/fixtures/gold-advanced.json',import.meta.url))).digest('hex');

function evaluate(row){
  const expected=row.expectation;
  const conceptOf=node=>['register','sense'].includes(row.category)
    ?node.roles?.theme?.concept:node.concept;
  if(expected.status==='unsupported')
    return !engine.tryTranslate({text:row.input,from:row.from,to:row.to}).ok;
  if(expected.status==='invalid-core'){
    const source=engine.analyze({text:row.input,from:row.from});
    const altered=structuredClone(source);
    switch(expected.mutation){
      case 'add-theme':altered.roles.theme={concept:'object.ice',features:{number:'singular',definiteness:'unknown'}};break;
      case 'remove-agent':delete altered.roles.agent;break;
      case 'wrong-agent-type':altered.roles.agent.concept='object.ice';break;
      case 'bad-polarity':altered.features.polarity='maybe';break;
      case 'unknown-concept':altered.concept='event.invented';break;
      default:throw new Error('Unknown gold mutation.');
    }
    return !engine.tryTranslate({text:JSON.stringify(altered),from:'core',to:row.to}).ok;
  }
  const candidates=engine.analyzeCandidates({text:row.input,from:row.from});
  if(expected.status==='ambiguous'){
    const conceptsFound=new Set(candidates.map(item=>item.interlingua.concept));
    const output=engine.translate({text:row.input,from:row.from,to:row.to});
    return expected.concepts.every(concept=>conceptsFound.has(concept))&&
      output.warnings.some(warning=>/distinct semantic readings/u.test(warning))&&
      output.semanticAlternatives.some(item=>item.interlingua.concept==='event.social_icebreak');
  }
  const selected=candidates.find(item=>conceptOf(item.interlingua)===expected.concept);
  if(!selected)return false;
  const options={};
  if(expected.register)options.lexicalRegister=expected.register;
  if(expected.focus)options.informationStructure={topic:'agent',focus:expected.focus};
  const output=engine.realize({interlingua:selected.interlingua,to:row.to,...options});
  const targetConcepts=engine.analyzeCandidates({text:output.text,from:row.to})
    .map(item=>conceptOf(item.interlingua));
  if(!targetConcepts.includes(expected.concept))return false;
  if(expected.polarity&&selected.interlingua.features.polarity!==expected.polarity)return false;
  if(expected.tense&&selected.interlingua.features.tense!==expected.tense)return false;
  if(expected.targetLemma){
    const surface=row.to==='pl'?expected.targetLemma.replace(/a$/u,'ę'):expected.targetLemma;
    if(!output.text.toLocaleLowerCase().includes(surface.toLocaleLowerCase()))return false;
  }
  if(expected.status==='fallback'&&
      !output.warnings.some(warning=>/No plain lexical variant/u.test(warning)))return false;
  if(expected.focus){
    const text=output.text.toLocaleLowerCase();
    const theme=text.search(/book|książk/u);
    const recipient=Math.max(text.lastIndexOf('boy'),text.lastIndexOf('chłopc'));
    if(theme<0||recipient<0||
        (expected.focus==='theme'&&theme<recipient)||
        (expected.focus==='recipient'&&recipient<theme))return false;
  }
  const serialized=engine.realize({interlingua:selected.interlingua,to:'core'}).text;
  return conceptOf(engine.analyze({text:serialized,from:'core'}))===expected.concept;
}

test('ADV-04 separate 100-case C1 and C2 samples report every category and direction',()=>{
  const results=fixture.cases.map(row=>{
    try{return {id:row.id,passed:evaluate(row)};}
    catch(error){return {id:row.id,passed:false,error:error.message};}
  });
  const report=buildAdvancedGoldReport(fixture,targets,results,fixtureSha256);
  const failed=results.filter(result=>!result.passed);
  console.log('Advanced category report:',JSON.stringify(report.levels));
  assert.deepEqual(failed,[]);
  for(const level of ['C1','C2']){
    assert.equal(report.levels[level].cases,100);
    assert.equal(report.levels[level].passed,100);
    assert.equal(Object.values(report.levels[level].byDirection)
      .reduce((sum,item)=>sum+item.passed,0),100);
  }
  assert.equal(report.limitations.certification,false);
  assert.equal(report.limitations.representativeCefrDenominator,null);
});

test('ADV-04 report rejects missing results and inflated level counts',()=>{
  const results=fixture.cases.map(row=>({id:row.id,passed:true}));
  assert.throws(()=>buildAdvancedGoldReport(fixture,targets,results.slice(1),fixtureSha256),/Invalid advanced benchmark inputs/);
  assert.throws(()=>buildAdvancedGoldReport({...fixture,cases:fixture.cases.slice(1)},targets,results,fixtureSha256),/Invalid advanced benchmark inputs/);
  assert.throws(()=>buildAdvancedGoldReport(fixture,targets,results,'wrong'),/Invalid advanced benchmark inputs/);
});
