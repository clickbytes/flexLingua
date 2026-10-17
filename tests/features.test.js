import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GRAMMATICAL_PERSON, createFeatureRegistry, unifyFeatures, valueAt, featureSource,
  matchesConditions, matchesAgreement, validateFeatureBundle, createLanguageFeatureProfile
} from '../js/core/features.js';
import {createMorphFeatureRegistry,flattenMorphFeatures} from '../js/core/morphology/features.js';

const fixture = JSON.parse(await readFile(new URL('../data/features.json', import.meta.url), 'utf8'));
const morphologyFixture = JSON.parse(await readFile(new URL('../data/morphology/features.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(await readFile(new URL('./fixtures/language-feature-profiles.json', import.meta.url), 'utf8'));
const clone = object => JSON.parse(JSON.stringify(object));

test('Feature registry validates six structured domains', () => {
  const registry = createFeatureRegistry(fixture);
  assert.deepEqual(Object.keys(registry.domains).sort(),
    ['event', 'eventTimeReference', 'lexical', 'participant', 'state', 'syntactic']);
  assert.ok(registry.domains.participant.number.includes('plural'));
});

test('Feature registry rejects missing required domain', () => {
  const spec = clone(fixture); delete spec.domains.participant;
  assert.throws(() => createFeatureRegistry(spec), /Missing feature domain/);
});

test('Feature registry rejects non-unique feature values', () => {
  const spec = clone(fixture); spec.domains.participant.number.push('plural');
  assert.throws(() => createFeatureRegistry(spec), /Invalid feature dimension/);
});

test('Feature registry rejects malicious dimension and values', () => {
  const spec = clone(fixture); spec.domains.event['constructor'] = ['ok'];
  assert.throws(() => createFeatureRegistry(spec), /Invalid feature dimension/);
  const spec2 = clone(fixture); spec2.domains.participant.number.push('__proto__');
  assert.throws(() => createFeatureRegistry(spec2), /Invalid feature dimension/);
});

test('Feature registry rejects unsupported schema versions', () => {
  const spec = clone(fixture); spec.version = '0.2';
  assert.throws(() => createFeatureRegistry(spec), /version/);
});

test('Feature registry copies input data instead of keeping mutable aliases', () => {
  const spec = clone(fixture);
  const registry = createFeatureRegistry(spec);
  spec.domains.participant.number[0] = 'tampered';
  assert.equal(registry.domains.participant.number[0], 'singular');
});

test('Versioned language profiles scope syntax and morphology without changing the shared inventories',()=>{
  for(const profile of Object.values(profiles)){
    const registry=createFeatureRegistry(fixture,profile);
    const morphology=createMorphFeatureRegistry(morphologyFixture,profile);
    assert.deepEqual(registry.domains.syntactic,profile.syntactic);
    assert.deepEqual(morphology.dimensions,profile.morphology);
    assert.deepEqual(registry.domains.participant.number,fixture.domains.participant.number);
  }
  assert.deepEqual(createFeatureRegistry(fixture,profiles.zeroCase).domains.syntactic,{});
  assert.equal(createFeatureRegistry(fixture,profiles.twoCase).domains.syntactic.case.length,2);
  assert.equal(createFeatureRegistry(fixture,profiles.tenCase).domains.syntactic.case.length,10);
  assert.ok(morphologyFixture.dimensions.case.includes('abl'));
  assert.equal(morphologyFixture.dimensions.case.includes('erg'),false);
});

test('Profile feature errors distinguish absent categories, unknown values, and conflicts',()=>{
  const zero=createMorphFeatureRegistry(morphologyFixture,profiles.zeroCase);
  const two=createMorphFeatureRegistry(morphologyFixture,profiles.twoCase);
  assert.throws(()=>zero.supports({case:'nom'}),error=>error.code==='absent_feature_category');
  assert.throws(()=>two.supports({case:'erg'}),error=>error.code==='unknown_feature_value');
  assert.throws(()=>flattenMorphFeatures({subject_number:'first',subject:{number:'plural'}},two),
    error=>error.code==='invalid_combination');
  assert.deepEqual(flattenMorphFeatures({number:'singular',case:'acc'},two),
    {number:'singular',case:'acc'});
  assert.throws(()=>featureSource('subject.case',profiles.zeroCase),
    error=>error.code==='absent_feature_category');
  assert.deepEqual(featureSource('subject.case',profiles.twoCase),['subject','case']);
});

test('Language feature profile rejects duplicate values and a mismatched language',()=>{
  const duplicate=clone(profiles.twoCase);duplicate.syntactic.case.push('nom');
  assert.throws(()=>createLanguageFeatureProfile(duplicate),/Invalid syntactic feature dimension/);
  assert.throws(()=>createLanguageFeatureProfile(profiles.twoCase,{language:'en'}),/Invalid or unsupported/);
});

test('Feature unification merges nonconflicting bindings without input mutation', () => {
  const left = Object.freeze({ subjectNumber: 'plural' });
  const right = Object.freeze({ subjectPluralClass: 'virile' });
  const result = unifyFeatures(left, right);
  assert.deepEqual(result, { subjectNumber: 'plural', subjectPluralClass: 'virile' });
  assert.deepEqual(left, { subjectNumber: 'plural' });
  assert.deepEqual(right, { subjectPluralClass: 'virile' });
});

test('Feature unification detects conflicts (unknown is not a wildcard)', () => {
  assert.equal(unifyFeatures({ number: 'singular' }, { number: 'plural' }), null);
  assert.equal(unifyFeatures({ aspect: 'unknown' }, { aspect: 'perfective' }), null);
  assert.deepEqual(unifyFeatures({ number: 'plural' }, { number: 'plural' }), { number: 'plural' });
});

test('Feature unification rejects unsafe keys from externally parsed JSON', () => {
  assert.throws(() => unifyFeatures({}, JSON.parse('{"__proto__":"bad"}')), /Unsafe feature key/);
});

test('Feature source resolution is bounded to subject and event namespaces', () => {
  assert.deepEqual(featureSource('subject.number'), ['subject','number']);
  assert.deepEqual(featureSource('subject.person'), ['subject','person']);
  assert.equal(valueAt({ subject:{ number:'plural' } }, 'subject.number'), 'plural');
  assert.equal(valueAt({ subject:{ person:'second' } }, 'subject.person'), 'second');
  for (const invalid of ['source.number','subject.number.sneaky','subject.__proto__','constructor']) {
    assert.throws(() => featureSource(invalid), /feature dependency/);
  }
});

test('Subject person and number conditions and agreement are exact across the full person-number matrix', () => {
  assert.deepEqual(Object.values(GRAMMATICAL_PERSON), ['first','second','third']);
  const mapping = { subjectPerson:'subject.person', subjectNumber:'subject.number' };
  for (const person of Object.values(GRAMMATICAL_PERSON)) {
    for (const number of ['singular','plural']) {
      const context = { subject:{person,number}, event:{} };
      const bindings = { subjectPerson:person, subjectNumber:number };
      assert.ok(matchesConditions(context, {'subject.person':person,'subject.number':number}));
      assert.ok(matchesAgreement(bindings, mapping, context));
      for (const otherPerson of Object.values(GRAMMATICAL_PERSON).filter(value=>value!==person)) {
        assert.equal(matchesConditions(context, {'subject.person':otherPerson}), false);
        assert.equal(matchesAgreement({...bindings,subjectPerson:otherPerson},mapping,context), false);
      }
      assert.equal(matchesConditions(context, {'subject.number':number==='singular'?'plural':'singular'}), false);
      assert.equal(matchesAgreement({...bindings,subjectNumber:number==='singular'?'plural':'singular'},mapping,context), false);
    }
  }
  assert.equal(matchesConditions({subject:{number:'singular'},event:{}},{'subject.person':'third'}),false);
  assert.equal(matchesAgreement({subjectPerson:'third'}, {subjectPerson:'subject.person'}, {subject:{},event:{}}),false);
});

test('Feature condition fails when dependent source is unknown', () => {
  const context = { subject: { number:'plural' }, event: { polarity:'negative' } };
  assert.ok(matchesConditions(context, { 'subject.number':'plural', 'event.polarity':'negative' }));
  assert.equal(matchesConditions(context, { 'subject.gender':'masculine' }), false);
});

test('Agreement checks inflection capture against lexical subject property', () => {
  const context = { subject: { number:'plural', pluralClass:'virile' }, event:{} };
  const mapping = { subjectPluralClass:'subject.pluralClass' };
  assert.ok(matchesAgreement({ subjectPluralClass:'virile' }, mapping, context));
  assert.equal(matchesAgreement({ subjectPluralClass:'nonvirile' }, mapping, context), false);
  assert.equal(matchesAgreement({ missing:'x' }, mapping, context), false);
});

test('Semantic feature validation rejects unknown values and extra fields', () => {
  const dims = fixture.domains.participant;
  assert.equal(validateFeatureBundle({number:'plural',definiteness:'unknown'}, dims, 'p').number, 'plural');
  assert.throws(() => validateFeatureBundle({number:'quartet',definiteness:'unknown'}, dims, 'p'), /number/);
  assert.throws(() => validateFeatureBundle({number:'plural',definiteness:'unknown',case:'nom'}, dims, 'p'), /features/);
});
