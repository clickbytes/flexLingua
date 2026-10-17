import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const [concepts,features,english,englishGrammar,fixture]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/grammar/en.json',
  'tests/fixtures/toy-agreement.json'
].map(load));

function makeEngine(controller){
  const dictionary=copy(english),grammar=copy(englishGrammar);
  dictionary.language=fixture.language;
  dictionary.nouns=dictionary.nouns.filter(noun=>['girl','book'].includes(noun.lemma));
  const stateFunctions=new Set(['grammar.state_copula','grammar.state_possession','grammar.state_location']);
  dictionary.verbs=dictionary.verbs.filter(verb=>verb.senses.some(sense=>
    sense.coreRef?.id===fixture.event||stateFunctions.has(sense.coreRef?.id)));
  const see=dictionary.verbs.find(verb=>verb.senses.some(sense=>sense.coreRef?.id===fixture.event));
  see.forms={...fixture.verbForms};
  grammar.language=fixture.language;
  grammar.verb.agreement={number:fixture.globalController};
  grammar.verb.rules=[{tense:'present',polarity:'positive',when:{},prefix:[],path:'forms.{number}'}];
  grammar.frames[fixture.event].agreement={number:controller};
  delete grammar.passive;
  const engine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(english,englishGrammar))
    .registerLanguage(createRuleAdapter(dictionary,grammar));
  return {engine,dictionary,grammar};
}

function roundTrip(engine,source){
  const core=engine.translate({from:'en',to:'core',text:source}).interlingua;
  const target=engine.realize({interlingua:core,to:fixture.language});
  const inverse=engine.translate({from:fixture.language,to:'core',text:target.text}).interlingua;
  assert.deepEqual(inverse,core);
  return {core,target};
}

test('event frame agreement selects a verb by object/theme number and parses it back',()=>{
  const {engine}=makeEngine(fixture.objectController);
  for(const row of fixture.objectSentences){
    const {core,target}=roundTrip(engine,row.source);
    assert.equal(core.roles.agent.features.number,'singular');
    assert.equal(target.text,row.expected);
    assert.equal(core.roles.theme.features.number,row.source.endsWith('books.')?'plural':'singular');
  }
});

test('possessor in an NP can control a construction without changing its subject',()=>{
  const {engine}=makeEngine(fixture.possessorController);
  for(const row of fixture.possessorSentences){
    const {core,target}=roundTrip(engine,row.source);
    assert.equal(core.roles.agent.features.number,'singular');
    assert.equal(core.roles.theme.possessor.agreement.number,row.number);
    assert.equal(target.text,row.expected);
  }
});

test('a controller role absent from the semantic frame is rejected at registration',()=>{
  const {dictionary,grammar}=makeEngine(fixture.objectController);
  grammar.frames[fixture.event].agreement.number='recipient.number';
  assert.throws(()=>new Engine(concepts,features).registerLanguage(
    createRuleAdapter(dictionary,grammar)),/feature dependency|agreement controller/i);
});

test('conflicting possessors do not silently choose one controller value',()=>{
  const {engine}=makeEngine(fixture.possessorController);
  const core=engine.translate({from:'en',to:'core',text:fixture.conflictingPossessors}).interlingua;
  assert.equal(core.roles.agent.possessor.agreement.number,'singular');
  assert.equal(core.roles.theme.possessor.agreement.number,'plural');
  assert.throws(()=>engine.realize({interlingua:core,to:fixture.language}),
    /No qaf verb form supports/);
});
