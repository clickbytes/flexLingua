import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOntology } from '../js/core/ontology.js';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import {
  createDiscourse, createEvent, materializeEvent, participant,
  validateInterlingua, DISCOURSE_VERSION
} from '../js/core/interlingua.js';

const load = async file => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const [concepts, features, en, pl, enGrammar, plGrammar] = await Promise.all(
  ['concepts.json', 'features.json', 'en.json', 'pl.json', 'grammar/en.json', 'grammar/pl.json'].map(load));
const copy = o => structuredClone(o);
const makeEngine = ({ontology=concepts, english=en, polish=pl, eg=enGrammar, pg=plGrammar}={}) =>
  new Engine(ontology, features)
    .registerLanguage(createRuleAdapter(english, eg))
    .registerLanguage(createRuleAdapter(polish, pg));
const engine = makeEngine();
const ontology = createOntology(concepts);

const see = (subject='person.girl',object='animal.dog') => createEvent('event.visual_perception', {
  agent: participant(subject,'definite'), theme:participant(object,'indefinite')
}, {tense:'past',polarity:'positive',aspect:'unknown'});
const give = () => createEvent('event.transfer_possession', {
  agent: participant('person.boy','definite'),
  recipient: participant('person.girl','definite'),
  theme: participant('object.apple','indefinite')
}, {tense:'past',polarity:'positive',aspect:'unknown'});

test('Ontology: type-safe transitive taxonomy and inherited event semantic frame', () => {
  assert.ok(ontology.isA('person.girl','entity'));
  assert.ok(ontology.isA('place.riverbank','geographical_feature'));
  assert.ok(!ontology.isA('place.riverbank','institution'));
  assert.deepEqual(ontology.frameRoles('event.visual_perception'),['agent','theme']);
  assert.deepEqual(ontology.ancestors('place.riverbank'),['geographical_feature','entity']);
  assert.equal(ontology.get('event.visual_perception').roleTypes.theme, 'entity');
  assert.equal(ontology.get('bogus'),undefined);
});

test('Ontology: inherited/symmetric typed relations and topical semantic lookups', () => {
  assert.deepEqual(ontology.relationTargets('place.riverbank','adjacent_to'), ['place.river']);
  assert.deepEqual(ontology.relationTargets('place.river','adjacent_to'), ['place.riverbank']);
  assert.deepEqual(ontology.relationTargets('place.financial_institution','associated_with'), ['object.money']);
  assert.equal(ontology.relatedToTopic('place.financial_institution','place.river'),false);
  assert.equal(ontology.relatedToTopic('place.riverbank','place.river'),true);
  assert.equal(ontology.relatedToTopic('place.financial_institution','object.money'),true);
});

test('Ontology: snapshots input, preventing post-registration changes', () => {
  const spec=copy(concepts);const frozen=createOntology(spec);
  spec.concepts['place.riverbank'].parent='institution';
  assert.equal(frozen.isA('place.riverbank','geographical_feature'),true);
  assert.ok(Object.isFrozen(frozen.concepts['place.riverbank']));
});

test('Ontology: unknown parent, cycles, invalid inheritance and references are rejected', () => {
  let spec=copy(concepts);
  spec.concepts.person.parent='missing';
  assert.throws(()=>createOntology(spec),/Unknown ontology concept/);
  spec=copy(concepts);spec.concepts.entity.parent='person';
  assert.throws(()=>createOntology(spec),/cycle/);
  spec=copy(concepts);spec.concepts['person.girl'].parent='event.perception';
  assert.throws(()=>createOntology(spec),/inheritance/);
  spec=copy(concepts);spec.concepts['place.riverbank'].relations.adjacent_to=['person.girl'];
  assert.throws(()=>createOntology(spec),/relation target/);
  spec=copy(concepts);spec.concepts['person.girl'].relations={unlisted:['animal.dog']};
  assert.throws(()=>createOntology(spec),/relation/);
  spec=copy(concepts);spec.concepts['event.visual_perception'].roleTypes={unknown:'entity'};
  assert.throws(()=>createOntology(spec),/role type/);
});

test('Ontology: enforces typed semantic participants without leaking grammatical features', () => {
  const restricted=copy(concepts);
  restricted.concepts['event.visual_perception'].roleTypes={agent:'person'};
  const strict=makeEngine({ontology:restricted});
  assert.throws(()=>strict.realize({interlingua:see('animal.dog'),to:'en'}),/role type/);
  assert.equal(strict.realize({interlingua:see('person.girl'),to:'en'}).text,'The girl saw a dog.');
});

test('Lexical senses: ambiguous bank exposes distinct concepts, sense IDs and translations', () => {
  const result=engine.translate({text:'The girl saw a bank.',from:'en',to:'pl'});
  assert.equal(result.text,'Dziewczynka widziała bank.');
  assert.equal(result.interlingua.roles.theme.concept,'place.financial_institution');
  assert.equal(result.lexicalSenses.theme,'en.bank.finance.1');
  assert.deepEqual(result.semanticAlternatives.map(a=>a.text),['Dziewczynka widziała brzeg.']);
  assert.equal(result.semanticAlternatives[0].interlingua.roles.theme.concept,'place.riverbank');
  assert.match(result.warnings.join(' '),/2 distinct semantic readings/);
});

test('Lexical senses: explicit selection and contextual topics are independent of grammar', () => {
  const request={text:'The girl saw a bank.',from:'en',to:'pl'};
  const river=engine.translate({...request,context:{topics:['place.river']}});
  assert.equal(river.text,'Dziewczynka widziała brzeg.');
  assert.equal(river.semanticAlternatives[0].text,'Dziewczynka widziała bank.');
  assert.equal(engine.translate({...request,context:{topics:['object.money']}}).text,
    'Dziewczynka widziała bank.');
  const chosen=engine.translate({...request,context:{senses:{theme:'place.riverbank'}}});
  assert.equal(chosen.text,'Dziewczynka widziała brzeg.');
  assert.deepEqual(chosen.semanticAlternatives,[]);
  assert.throws(()=>engine.translate({...request,context:{senses:{theme:'animal.cat'}}}),/No semantic reading/);
  assert.throws(()=>engine.translate({...request,context:{topics:['invented']}}),/Invalid semantic context/);
  assert.throws(()=>engine.translate({...request,context:{senses:{unknown:'place.riverbank'}}}),/No semantic reading/);
});

test('Lexical senses: one meaning can be expressed by distinct lemmas (synonymy)', () => {
  const fromHound=engine.analyzeCandidates({text:'The hound saw the girl.',from:'en'});
  assert.equal(fromHound[0].interlingua.roles.agent.concept,'animal.dog');
  assert.equal(fromHound[0].lexicalSenses.agent,'en.hound.1.sense.1');
  assert.equal(engine.translate({text:'The hound saw the girl.',from:'en',to:'pl'}).text,
    'Pies widział dziewczynkę.');
  assert.equal(engine.translate({text:'Pies widział dziewczynkę.',from:'pl',to:'en'}).text,
    'A dog saw a girl.');
});

test('Lexical senses: new ambiguous lemma needs only dictionary JSON, no interpreter code', () => {
  const dict=copy(en);
  dict.nouns.push({id:'en.pet.1',lemma:'pet',forms:{singular:'pet',plural:'pets'},indefiniteArticle:'a',
    senses:[{id:'en.pet.dog.1',concept:'animal.dog'}, {id:'en.pet.cat.1',concept:'animal.cat'}]});
  const extended=makeEngine({english:dict});
  const result=extended.translate({text:'The girl saw a pet.',from:'en',to:'pl'});
  assert.equal(result.text,'Dziewczynka widziała psa.');
  assert.deepEqual(result.semanticAlternatives.map(x=>x.text),['Dziewczynka widziała kota.']);
});

test('Lexical senses: malformed inventories, collisions, dangling references rejected at registration', () => {
  let dict=copy(en);
  dict.nouns.at(-2).senses.push({...dict.nouns.at(-2).senses[0]});
  assert.throws(()=>makeEngine({english:dict}),/duplicate lexical sense/);
  dict=copy(en);dict.nouns.at(-2).senses[0].coreRef.id='unknown.entity';
  assert.throws(()=>makeEngine({english:dict}),/Unknown (?:entity concept|CORE reference)/);
  dict=copy(en);dict.nouns.at(-2).senses[0].priority=NaN;
  assert.throws(()=>makeEngine({english:dict}),/Invalid or duplicate lexical sense/);
  dict=copy(en);dict.nouns.at(-2).concept='object.book';
  assert.throws(()=>makeEngine({english:dict}),/Invalid sense inventory/);
  dict=copy(en);dict.nouns.push({...dict.nouns[0]});
  assert.throws(()=>makeEngine({english:dict}),/duplicate noun lexeme/);
});

test('Discourse: two sentences create an ordered multi-event semantic graph', () => {
  const result=engine.translate({
    text:'The girl saw the dog. The boy gave the girl an apple.',from:'en',to:'pl'
  });
  assert.equal(result.text,'Dziewczynka widziała psa. Chłopiec dał dziewczynce jabłko.');
  assert.equal(result.interlingua.type,'discourse');
  assert.equal(result.interlingua.version,DISCOURSE_VERSION);
  assert.equal(result.interlingua.events.length,2);
  assert.deepEqual(result.interlingua.relations,[{type:'precedes',from:'e1',to:'e2'}]);
  assert.equal(result.interlingua.events[0].roles.theme,'p2');
  assert.equal(result.interlingua.entities.p2.concept,'animal.dog');
  assert.equal(result.interlingua.events[1].roles.agent,'p3');
  assert.equal(engine.analyze({text:result.text,from:'pl'}).events[1].concept,'event.transfer_possession');
});

test('Discourse: source does NOT infer coreference from repeated nouns', () => {
  const graph=engine.analyze({text:'The girl saw the boy. The girl saw the dog.',from:'en'});
  assert.notEqual(graph.events[0].roles.agent,graph.events[1].roles.agent);
  assert.equal(graph.entities[graph.events[0].roles.agent].concept,'person.girl');
  assert.equal(graph.entities[graph.events[1].roles.agent].concept,'person.girl');
});

test('Discourse: explicitly shared entity IDs are preserved on realization', () => {
  const graph=createDiscourse([see('person.girl','animal.dog'),see('person.girl','animal.cat')]);
  const shared=graph.events[0].roles.agent;
  graph.events[1].roles.agent=shared;
  const found=materializeEvent(graph,graph.events[1]);
  assert.equal(found.roles.agent,graph.entities[shared]);
  assert.equal(engine.realize({interlingua:graph,to:'pl'}).text,
    'Dziewczynka widziała psa. Dziewczynka widziała kota.');
});

test('Discourse: invalid references, event duplication, non-sequential or cyclic edges are rejected', () => {
  const valid=createDiscourse([see(),give()]);
  const faulty=modify=>{const doc=copy(valid);modify(doc);return doc};
  const validate=doc=>validateInterlingua(doc,engine.ontology,engine.features);
  assert.throws(()=>validate(faulty(d=>{d.events[0].roles.agent='no_entity'})),/Unknown discourse entity/);
  assert.throws(()=>validate(faulty(d=>{d.events[1].id='e1'})),/Duplicate or invalid/);
  assert.throws(()=>validate(faulty(d=>{d.relations[0]={type:'precedes',from:'e2',to:'e1'}})),/sequence relations/);
  assert.throws(()=>validate(faulty(d=>{d.relations=[]})),/sequence relations/);
  assert.throws(()=>validate(faulty(d=>{d.events[0].roles.theme='p999'})),/entity reference/);
  assert.throws(()=>engine.realize({to:'pl',interlingua:faulty(d=>{d.events[0].concept='fake'})}),/Unknown event concept/);
});

test('Discourse: 8-event limit and unsupported separators cannot be bypassed', () => {
  const eight=Array(8).fill('The girl saw the dog.').join(' ');
  assert.equal(engine.analyze({text:eight,from:'en'}).events.length,8);
  assert.throws(()=>engine.analyze({text:`${eight} The girl saw the dog.`,from:'en'}),/exceeds 8/);
  assert.throws(()=>engine.analyze({text:'The girl saw the dog.. The boy saw the cat.',from:'en'}),/Empty discourse/);
  assert.throws(()=>engine.analyze({text:'The girl saw the dog. The boy saw the cat?',from:'en'}),/Only simple sentences/);
});

test('Discourse: multiple ambiguous events produce bounded semantic combinations', () => {
  const text='The girl saw a bank. The boy saw a bank.';
  const candidates=engine.analyzeCandidates({text,from:'en'});
  assert.equal(candidates.length,4);
  const combinations=new Set(candidates.map(c=>c.interlingua.events.map(ev=>
    c.interlingua.entities[ev.roles.theme].concept).join('|')));
  assert.equal(combinations.size,4);
  const result=engine.translate({text,from:'en',to:'pl'});
  assert.equal(result.semanticAlternatives.length,3);
  assert.ok(result.warnings.some(w=>w.includes('4 distinct semantic readings')));
});
