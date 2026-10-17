import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const [concepts,features,english,englishGrammar,morphologyFeatures,zeroCase,twoCase,tenCase]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/grammar/en.json',
  'data/morphology/features.json','tests/fixtures/toy-cases-zero.json',
  'tests/fixtures/toy-cases-two.json','tests/fixtures/toy-cases-ten.json'
].map(load));
const toyFixtures=[zeroCase,twoCase,tenCase];

function makeToy(fixture,{caseMorphology=false}={}){
  const dictionary=copy(english),grammar=copy(englishGrammar);
  dictionary.language=fixture.language;
  dictionary.nouns=dictionary.nouns.filter(noun=>['girl','book'].includes(noun.lemma));
  const stateFunctions=new Set(['grammar.state_copula','grammar.state_possession','grammar.state_location']);
  dictionary.verbs=dictionary.verbs.filter(verb=>verb.senses.some(sense=>
    sense.coreRef?.id==='event.visual_perception'||stateFunctions.has(sense.coreRef?.id)));
  dictionary.nouns=dictionary.nouns.map(noun=>({...noun,forms:caseMorphology?{}:noun.forms}));
  grammar.language=fixture.language;
  const frame=grammar.frames['event.visual_perception'];
  frame.linearizations=[fixture.linearization];
  if(fixture.roleCases)frame.cases=fixture.roleCases;
  else delete frame.cases;
  for(const otherFrame of Object.values(grammar.frames)){
    if(otherFrame===frame)continue;
    if(!caseMorphology)delete otherFrame.cases;
    else if(otherFrame.cases)for(const role of Object.keys(otherFrame.cases)){
      otherFrame.cases[role]=mapCases(otherFrame.cases[role],fixture.profile.syntactic.case);
    }
  }
  grammar.nounPhrase.path=caseMorphology?'forms.{number}.{case}':'forms.{number}';
  if(fixture.roleCases)grammar.nounPhrase.subjectCase='nom';
  else delete grammar.nounPhrase.subjectCase;
  grammar.cases={alternations:[]};
  for(const key of ['comparison','deicticPronouns','passive'])delete grammar[key];
  for(const stateFrame of Object.values(grammar.states.frames)){
    for(const role of Object.keys(stateFrame.cases)){
      stateFrame.cases[role]=caseMorphology
        ?mapCases(stateFrame.cases[role],fixture.profile.syntactic.case):null;
    }
    if(stateFrame.predicateCase!==undefined)stateFrame.predicateCase=caseMorphology
      ?mapCases(stateFrame.predicateCase,fixture.profile.syntactic.case):null;
  }

  if(!caseMorphology)return {dictionary,grammar};
  const cases=fixture.profile.syntactic.case;
  const paradigmId=`${fixture.language}.noun.case`;
  const slots=[];
  for(const number of fixture.profile.morphology.number)for(const grammaticalCase of cases){
    slots.push({features:{number,case:grammaticalCase},path:[number,grammaticalCase],steps:[]});
  }
  const spec={version:'1.11',language:fixture.language,featureProfile:fixture.profile,
    provenance:{source:'project-authored toy case fixture',license:'project authored'},
    paradigms:{[paradigmId]:{pos:'NOUN',slots}},
    bindings:dictionary.nouns.map(noun=>({lexemeId:noun.id,paradigmId,stems:{base:noun.lemma},
      overrides:slots.map(slot=>{
        const numberSuffix=fixture.numberSuffixes[slot.features.number];
        const isSyncretic=fixture.syncretic?.lexemeId===noun.id&&
          fixture.syncretic.number===slot.features.number&&
          fixture.syncretic.cases.includes(slot.features.case);
        const caseSuffix=isSyncretic?'':fixture.caseSuffixes[slot.features.case];
        const value=`${numberSuffix}${caseSuffix}`;
        return {when:slot.features,mode:'replace',forms:[{text:noun.lemma+value,variant:'standard'}]};
      })
    }))};
  const morphology=createMorphology(spec,dictionary,morphologyFeatures,
    {featureProfile:fixture.profile});
  return {dictionary,grammar,morphology};
}

function mapCases(value,allowed){
  if(Array.isArray(value))return value.map(item=>mapCases(item,allowed));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>
    [key,mapCases(item,allowed)]));
  if(typeof value==='string'&&['nom','gen','dat','acc','loc','inst','abl','voc','erg','abs'].includes(value)){
    return allowed.includes(value)?value:allowed[0];
  }
  return value;
}

function createEngine(fixture,options={}){
  const toy=makeToy(fixture,options);
  const engine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(english,englishGrammar))
    .registerLanguage(createRuleAdapter(toy.dictionary,toy.grammar,{featureProfile:fixture.profile,
      ...(toy.morphology?{morphology:toy.morphology}:{})}));
  if(toy.morphology)engine.registerMorphology(toy.morphology);
  return {engine,toy};
}

const source='The girl sees the book.';

test('0-case grammar assigns roles by word order through EN/CORE/toy/CORE',()=>{
  const fixture=toyFixtures[0];
  const {engine}=createEngine(fixture);
  const core=engine.translate({from:'en',to:'core',text:source}).interlingua;
  const target=engine.realize({interlingua:core,to:fixture.language});
  assert.equal(target.text,fixture.expected);
  assert.deepEqual(engine.translate({from:fixture.language,to:'core',text:target.text}).interlingua,core);
});

test('2-case grammar uses both cases and preserves all readings of a syncretic form',()=>{
  const fixture=toyFixtures[1];
  const {engine,toy}=createEngine(fixture,{caseMorphology:true});
  const readings=toy.morphology.analyze({text:'book-sg'});
  assert.deepEqual(readings.map(reading=>reading.features.case).sort(),['acc','nom']);
  assert.deepEqual(toy.morphology.generate({lexemeId:'en.book.1',
    features:{number:'singular',case:'acc'}}).map(form=>form.text),['book-sg']);
  const core=engine.translate({from:'en',to:'core',text:source}).interlingua;
  const target=engine.realize({interlingua:core,to:fixture.language});
  assert.equal(target.text,fixture.expected);
  assert.deepEqual(engine.translate({from:fixture.language,to:'core',text:target.text}).interlingua,core);
});

test('10-case profile carries twenty cells per noun and distinct role mappings end to end',()=>{
  const fixture=toyFixtures[2];
  const {engine,toy}=createEngine(fixture,{caseMorphology:true});
  for(const noun of toy.dictionary.nouns){
    const paradigm=toy.morphology.paradigm({lexemeId:noun.id});
    assert.equal(paradigm.length,20);
    assert.equal(new Set(paradigm.map(form=>form.text)).size,20);
    assert.equal(new Set(paradigm.map(form=>form.features.case)).size,10);
    assert.equal(new Set(paradigm.map(form=>form.features.number)).size,2);
  }
  assert.deepEqual(toy.grammar.frames['event.visual_perception'].cases,
    {agent:'erg',theme:'abs'});
  const girl=toy.dictionary.nouns.find(noun=>noun.lemma==='girl');
  assert.equal(toy.morphology.generate({lexemeId:girl.id,features:{number:'singular',case:'erg'}})[0].text,
    'girl-sg-erg');
  const core=engine.translate({from:'en',to:'core',text:source}).interlingua;
  const target=engine.realize({interlingua:core,to:fixture.language});
  assert.equal(target.text,fixture.expected);
  assert.deepEqual(engine.translate({from:fixture.language,to:'core',text:target.text}).interlingua,core);
});

test('grammar case mappings outside a language profile fail closed',()=>{
  const fixture=toyFixtures[1];
  const toy=makeToy(fixture,{caseMorphology:true});
  toy.grammar.frames['event.visual_perception'].cases.theme='erg';
  assert.throws(()=>new Engine(concepts,features).registerLanguage(
    createRuleAdapter(toy.dictionary,toy.grammar,{featureProfile:fixture.profile,
      morphology:toy.morphology})),/Unknown syntactic case: erg/);
});
