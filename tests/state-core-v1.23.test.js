import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createOntology, STATE_FRAME_VERSION } from '../js/core/ontology.js';
import {
  createIdentity, createNegation, createPossession, createPredication, createQuestion,
  participant, STATE_VERSION, validateInterlingua
} from '../js/core/interlingua.js';

const load = async path => JSON.parse(await readFile(new URL(`../data/${path}`,import.meta.url),'utf8'));
const [concepts,features,en,pl,enGrammar,plGrammar] = await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine = new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const copy = value => structuredClone(value);
const validate = value => validateInterlingua(value,engine.ontology,engine.features);

const identity = createIdentity(participant('person.girl','definite'),
  participant('person.girl','definite'));
const predication = createPredication('quality.big',participant('object.apple','definite'));
const possession = createPossession(participant('person.girl','definite'),
  participant('object.apple','definite'),{tense:'past',polarity:'negative'});

test('STATE-01 exposes separate, typed identity, predication, and possession meanings', () => {
  assert.equal(STATE_VERSION,'1.23');
  assert.equal(engine.capabilities().stateDocumentVersion,STATE_VERSION);
  assert.equal(engine.capabilities().stateFrameVersion,STATE_FRAME_VERSION);
  assert.equal(engine.ontology.stateFrames.identity.symmetric,true);
  assert.equal(engine.ontology.stateFrames.possession.symmetric,false);
  assert.deepEqual(Object.keys(identity.roles).sort(),['complement','subject']);
  assert.equal(identity.roles.subject.concept,'person.girl');
  assert.equal(identity.roles.complement.concept,'person.girl');
  assert.equal(identity.kind,'identity');
  assert.equal(predication.kind,'predication');
  assert.equal(predication.predicate,'quality.big');
  assert.equal(predication.roles.subject.concept,'object.apple');
  assert.equal(possession.kind,'possession');
  assert.deepEqual(Object.keys(possession.roles).sort(),['owned','owner']);
  for (const state of [identity,predication,possession]) assert.equal(validate(state),state);
});

test('STATE-01 state contracts enforce role types, property applicability, and exact versions', () => {
  const wrongVersion=copy(predication);wrongVersion.version='1.22';
  const missingRole=copy(identity);delete missingRole.roles.complement;
  const replacedRole=copy(identity);delete replacedRole.roles.complement;
  replacedRole.roles.other=participant('person.girl');
  const extraRole=copy(possession);extraRole.roles.theme=participant('object.apple');
  const eventPredicate=copy(predication);eventPredicate.predicate='event.visual_perception';
  const unknownSubject=copy(predication);unknownSubject.roles.subject.concept='event.visual_perception';
  const extraFeature=copy(predication);extraFeature.features.aspect='unknown';
  const extraField={...predication,concept:'event.visual_perception'};
  for (const malformed of [wrongVersion,missingRole,replacedRole,extraRole,eventPredicate,unknownSubject,extraFeature,extraField]) {
    assert.throws(()=>validate(malformed));
  }
  assert.throws(()=>createOntology({...copy(concepts),stateFrameVersion:'0.9'}),/state frame registry version/);
  const incomplete=copy(concepts);delete incomplete.stateFrames.possession.roles[1];
  assert.throws(()=>createOntology(incomplete),/state frame contract: possession/);
  const duplicate=copy(concepts);duplicate.stateFrames.identity.roles=['subject','subject'];
  assert.throws(()=>createOntology(duplicate),/state frame contract: identity/);
});

test('STATE-01 property concepts only predicate subjects within their applicability domain', () => {
  const propertyOnly=copy(concepts);
  propertyOnly.concepts['quality.of_quality']={type:'property',label:'applies to properties',appliesTo:['property']};
  const typedEngine=new Engine(propertyOnly,features);
  const objectState=createPredication('quality.of_quality',participant('object.apple'));
  assert.throws(()=>validateInterlingua(objectState,typedEngine.ontology,typedEngine.features),/does not apply/);
});

test('STATE-01 CORE JSON round-trips states and rejects incomplete documents', () => {
  for (const state of [identity,predication,possession,createNegation(predication)]) {
    const encoded=engine.realize({interlingua:state,to:'core'}).text;
    assert.deepEqual(engine.analyze({text:encoded,from:'core'}),state);
  }
  const malformed=copy(predication);delete malformed.features;
  assert.throws(()=>engine.analyze({text:JSON.stringify(malformed),from:'core'}),/state|invalid/i);
  const unversioned=copy(possession);delete unversioned.version;
  assert.throws(()=>engine.analyze({text:JSON.stringify(unversioned),from:'core'}),/state|invalid/i);
});

test('STATE-01 allows explicit state negation and refuses unsupported questions, coordination, and PL/EN realization', () => {
  assert.doesNotThrow(()=>validate(createNegation(possession)));
  assert.throws(()=>validate({version:'0.6',type:'coordination',connective:'and',clauses:[predication,predication]}),/coordination/i);
  assert.throws(()=>createQuestion(predication),/supported semantic proposition/i);
  assert.throws(()=>engine.realize({interlingua:predication,to:'en'}),/Unsupported state construction in en/);
  assert.throws(()=>engine.realize({interlingua:predication,to:'pl'}),/Unsupported state construction in pl/);
  assert.throws(()=>engine.translate({text:JSON.stringify(possession),from:'core',to:'en'}),/Unsupported state construction in en/);
  assert.throws(()=>engine.translate({text:JSON.stringify(possession),from:'core',to:'pl'}),/No pl state verb form supports past/);
  assert.throws(()=>engine.analyze({text:'The girl is big.',from:'en'}));
  assert.throws(()=>engine.analyze({text:'Dziewczynka jest duża.',from:'pl'}));
});
