import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createComplement, createNegation, createEvent, participant,
  validateInterlingua, SEMANTIC_VERSION, MAX_CLAUSE_DEPTH } from '../js/core/interlingua.js';

const load = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const source = Object.fromEntries(['en','pl','tr'].map(lang => [lang, {
  lexicon: load(`${lang}.json`), grammar: load(`grammar/${lang}.json`) }]));
const ontology = load('concepts.json'), features = load('features.json');
const setup = data => {
  const e = new Engine(ontology, features);
  for (const [code, lang] of Object.entries(data)) e.registerLanguage(createRuleAdapter(lang.lexicon, lang.grammar));
  return e;
};
const engine = setup(source);
const t = (text,from,to) => engine.translate({text,from,to});

const corpus = [
  ['The girl saw the dog.','en','tr','Kız köpeği gördü.'],
  ['The girl saw a dog.','en','tr','Kız köpek gördü.'],
  ['The boy gave the girl a book.','en','tr','Oğlan kıza kitap verdi.'],
  ['The boy gave the girl the book.','en','tr','Oğlan kıza kitabı verdi.'],
  ['The boy gave a book to the girl.','en','tr','Oğlan kıza kitap verdi.'],
  ['Kız köpeği gördü.','tr','pl','Dziewczynka widziała psa.'],
  ['Oğlan kıza kitabı verdi.','tr','en','A boy gave a girl the book.'],
  ['Kız köpeği görmüyor.','tr','en','A girl does not see the dog.'],
  ['Kız kedi gördü.','tr','pl','Dziewczynka widziała kota.'],
  ['The girl believes that the boy saw the dog.','en','pl','Dziewczynka wierzy, że chłopiec widział psa.'],
  ['The girl believed that the boy saw the dog.','en','pl','Dziewczynka wierzyła, że chłopiec widział psa.'],
  ['The boys believed that the girl saw the dog.','en','pl','Chłopcy wierzyli, że dziewczynka widziała psa.'],
  ['The girls believed that the boy saw the dog.','en','pl','Dziewczynki wierzyły, że chłopiec widział psa.'],
  ['Dziewczynka wierzy, że chłopiec widział psa.','pl','en','A girl believes that a boy saw a dog.'],
  ['It is not true that all the girls saw the dog.','en','pl','Nie jest prawdą, że wszystkie dziewczynki widziały psa.'],
  ['The boy believes that the girl believes that the dog saw the cat.','en','pl',
    'Chłopiec wierzy, że dziewczynka wierzy, że pies widział kota.']
];
for (const [text,from,to,expected] of corpus) {
  test(`golden ${from} → ${to}: ${text}`, () => assert.equal(t(text,from,to).text,expected));
}

test('English → Turkish → English keeps the event and case-conditioned definiteness', () => {
  for (const definite of ['a','the']) for (const subject of ['girl','boy']) for (const object of ['dog','cat','book']) {
    const sentence = `The ${subject} saw ${definite} ${object}.`;
    const meaning = engine.analyze({text:sentence,from:'en'});
    const turkish = engine.realize({interlingua:meaning,to:'tr'}).text;
    const restored = engine.analyze({text:turkish,from:'tr'});
    assert.equal(restored.roles.agent.concept,meaning.roles.agent.concept);
    assert.equal(restored.roles.theme.concept,meaning.roles.theme.concept);
    assert.equal(restored.roles.theme.features.definiteness,meaning.roles.theme.features.definiteness);
    assert.equal(restored.features.tense,'past');
  }
});

test('matrix predicate is a first-class nested semantic node with finite tense', () => {
  const doc = engine.analyze({text:'The girl believed that the boy saw the dog.',from:'en'});
  assert.equal(doc.version,SEMANTIC_VERSION);
  assert.equal(doc.type,'complement');
  assert.equal(doc.features.tense,'past');
  assert.equal(doc.content.features.tense,'past');
  assert.equal(doc.experiencer.concept,'person.girl');
  assert.equal(engine.analyze({text:engine.realize({interlingua:doc,to:'pl'}).text,from:'pl'}).features.tense,'past');
});

test('semantic scopes distinguish universal-in-negation from local negative event', () => {
  const wide=engine.analyze({text:'It is not true that all the girls saw the dog.',from:'en'});
  const narrow=engine.analyze({text:'All the girls did not see the dog.',from:'en'});
  assert.notDeepEqual(wide,narrow);
  assert.equal(wide.type,'scope');
  assert.equal(wide.operand.roles.agent.quantifier.kind,'universal');
  assert.equal(narrow.type,'event');
  assert.equal(narrow.features.polarity,'negative');
});

test('deep complement validates without accepting arbitrary clause types', () => {
  const ref=participant('person.girl');
  const event=createEvent('event.visual_perception', {agent:ref, theme:participant('animal.dog')},
    {tense:'past',polarity:'positive'});
  const good=createComplement('event.belief',ref,createComplement('event.belief',ref,event));
  assert.doesNotThrow(()=>validateInterlingua(good,engine.ontology,engine.features));
  assert.throws(()=>validateInterlingua(createComplement('event.belief',ref,{type:'discourse'}),engine.ontology,engine.features),/complement/);
  const wrong={...good,experiencer:participant('object.book')};
  assert.throws(()=>validateInterlingua(wrong,engine.ontology,engine.features),/person/);
  // The current clause depth budget is 5; exceed it rather than assuming 4 is excessive.
  let tooDeep=event;
  for (let level=0;level<=MAX_CLAUSE_DEPTH;level++) {
    tooDeep=createComplement('event.belief',ref,tooDeep);
  }
  assert.throws(()=>validateInterlingua(tooDeep,engine.ontology,engine.features),/depth|nesting/);
});

test('Turkish unsupported structures fail visibly, instead of inventing a translation', () => {
  assert.match(engine.tryTranslate({text:'The girl believed that the dog saw the cat.',from:'en',to:'tr'}).error.message,/complement/);
  assert.match(engine.tryTranslate({text:'All the girls saw the cat.',from:'en',to:'tr'}).error.message,/quantifier/);
  assert.match(engine.tryTranslate({text:'The big girl saw a dog.',from:'en',to:'tr'}).error.message,/modifier/);
  assert.equal(engine.language('tr').describe().support.wideScopeNegation,false);
});

test('invalid data and language failures are diagnostic objects, never partial translations', () => {
  const no=engine.tryTranslate({text:'The girl saw the dog.',from:'en',to:'zz'});
  assert.equal(no.ok,false);
  assert.equal(no.error.code,'UNSUPPORTED_LANGUAGE');
  const bad=engine.tryTranslate({text:'The alien saw a spaceship.',from:'en',to:'pl'});
  assert.equal(bad.ok,false);
  assert.equal(typeof bad.error.message,'string');
  assert.equal(engine.tryTranslate({text:'The girl saw the dog.',from:'en',to:'tr'}).ok,true);
});

test('new attitude lemma is configured by JSON, without custom adapter branches', () => {
  const modified=structuredClone(source);
  modified.en.lexicon.attitudes[0].forms.present.singular='imagines';
  const local=setup(modified);
  const doc=local.analyze({text:'The girl imagines that the dog saw the cat.',from:'en'});
  assert.equal(doc.concept,'event.belief');
  assert.equal(local.realize({interlingua:doc,to:'en'}).text,'The girl imagines that the dog saw the cat.');
});

test('invalid matrix predicate and unsafely formed complement grammar cannot register', () => {
  const modified=structuredClone(source);
  modified.en.lexicon.attitudes[0].forms.present.singular='<script>';
  assert.throws(()=>setup(modified),/matrix predicate/i);
  modified.en.lexicon.attitudes[0].forms.present.singular='believes';
  modified.en.grammar.sentence.complement.marker='../data';
  assert.throws(()=>setup(modified),/complement grammar/i);
});

test('single events, qualified referents and bounded discourse retain legacy serialization versions', () => {
  assert.equal(engine.analyze({text:'The girl saw the dog.',from:'en'}).version,'0.2');
  assert.equal(engine.analyze({text:'The big girl saw the dog.',from:'en'}).version,'0.5');
  assert.equal(engine.analyze({text:'The girl saw the dog. The boy saw the cat.',from:'en'}).version,'0.4');
});

test('unknown Polish definiteness is reported when producing Turkish case-marked objects', () => {
  const result=t('Dziewczynka widziała psa.','pl','tr');
  assert.equal(result.text,'Kız köpeği gördü.');
  assert.ok(result.warnings.some(w=>/definiteness/.test(w)));
});
