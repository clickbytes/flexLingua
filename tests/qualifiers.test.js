import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import {
  createEvent, createDiscourse, materializeEvent, participant, modifier,
  validateInterlingua, QUALIFIED_VERSION, INTERLINGUA_VERSION, DISCOURSE_VERSION
} from '../js/core/interlingua.js';
import { createOntology } from '../js/core/ontology.js';

const load = async p => JSON.parse(await readFile(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const [concepts, features, en, pl, eg, pg] = await Promise.all(
  ['concepts.json', 'features.json', 'en.json', 'pl.json', 'grammar/en.json', 'grammar/pl.json'].map(load));
const copy = obj => structuredClone(obj);
const makeEngine = (settings = {}) => new Engine(settings.concepts || concepts, settings.features || features)
  .registerLanguage(createRuleAdapter(settings.en || en, settings.eg || eg))
  .registerLanguage(createRuleAdapter(settings.pl || pl, settings.pg || pg));
const engine = makeEngine();
const translate = (text, from = 'en', to = 'pl') => engine.translate({ text, from, to });
const see = (agent, theme) => createEvent('event.visual_perception', { agent, theme },
  { tense: 'past', polarity: 'positive', aspect: 'unknown' });
const graph = (subject, object) => see(participant('person.girl', 'definite', 'singular', subject),
  participant('object.book', 'indefinite', 'plural', object));

// End-to-end: morphology, semantic annotation and word order are driven by JSON.
test('EN → PL: adjective agreement, exact cardinality and case', () => {
  const out = translate('The big girl saw two small cats.');
  assert.equal(out.text, 'Duża dziewczynka widziała dwa małe koty.');
  assert.equal(out.interlingua.version, QUALIFIED_VERSION);
  assert.deepEqual(out.interlingua.roles.agent.modifiers, [{ concept: 'quality.big' }]);
  assert.deepEqual(out.interlingua.roles.theme.modifiers, [{ concept: 'quality.small' }]);
  assert.deepEqual(out.interlingua.roles.theme.quantifier, { kind: 'exact', value: 2 });
  assert.equal(out.interlingua.roles.theme.features.number, 'plural');
  assert.equal(out.lexicalSenses['theme.quantifier'], 'en.two.quant.1');
  assert.deepEqual(out.lexicalSenses['theme.modifiers'], ['en.small.adj.1']);
});

test('PL → EN: qualified nouns roundtrip; lost articles stay explicitly unknown', () => {
  const out = translate('Duża dziewczynka widziała dwa małe koty.', 'pl', 'en');
  assert.equal(out.text, 'A big girl saw two small cats.');
  assert.equal(out.interlingua.roles.agent.features.definiteness, 'unknown');
  assert.deepEqual(out.interlingua.roles.theme.quantifier, { kind: 'exact', value: 2 });
  assert.ok(out.warnings.some(w => w.includes('definiteness')));
});

test('EN → PL: virile plural subject and feminine accusative numerals', () => {
  assert.equal(translate('All the big boys saw two small books.').text,
    'Wszyscy duzi chłopcy widzieli dwie małe książki.');
});

test('EN → PL: singular animate masculine adjective takes accusative -ego', () => {
  assert.equal(translate('The girl saw the small boy.').text,
    'Dziewczynka widziała małego chłopca.');
  assert.equal(translate('The girl saw the big bank.').text,
    'Dziewczynka widziała duży bank.');
});

test('EN → PL: negation applies genitive across quantified adjective + noun', () => {
  assert.equal(translate('The very big girls did not see all the small books.').text,
    'Bardzo duże dziewczynki nie widziały wszystkich małych książek.');
});

test('Nested modifier trees are preserved by parser and cross-language realization', () => {
  const out = translate('The very very big girls saw the red dogs.');
  assert.equal(out.text, 'Bardzo bardzo duże dziewczynki widziały czerwone psy.');
  assert.deepEqual(out.interlingua.roles.agent.modifiers, [{ concept: 'quality.big', modifiers: [
    { concept: 'degree.very', modifiers: [{ concept: 'degree.very' }] }
  ] }]);
  assert.equal(out.interlingua.version, '0.5');
  assert.equal(engine.realize({ interlingua: out.interlingua, to: 'en' }).text,
    'The very very big girls saw the red dogs.');
});

test('Multiple adjective modifiers survive across languages without conflating concepts', () => {
  const out = translate('The big red girl saw the small dog.');
  assert.equal(out.text, 'Duża czerwona dziewczynka widziała małego psa.');
  assert.deepEqual(out.interlingua.roles.agent.modifiers.map(m => m.concept), ['quality.big', 'quality.red']);
});

test('English article form follows first adjective, not noun lemma', () => {
  assert.equal(translate('The boy saw a big apple.').text, 'Chłopiec widział duże jabłko.');
  assert.equal(translate('The boy saw an apple.').text, 'Chłopiec widział jabłko.');
  assert.throws(() => translate('The boy saw an big apple.'), /construction/);
  assert.throws(() => translate('The boy saw a apple.'), /construction/);
  const meaning = see(participant('person.boy', 'definite'),
    participant('object.apple', 'indefinite', 'singular', {modifiers: [modifier('quality.big')]}));
  assert.equal(engine.realize({interlingua:meaning,to:'en'}).text,'The boy saw a big apple.');
});

test('Universal quantifier preserves quantifier meaning, not source article', () => {
  const parsed = engine.analyze({text:'All the big boys saw the small dog.',from:'en'});
  assert.deepEqual(parsed.roles.agent.quantifier,{kind:'universal'});
  assert.equal(parsed.roles.agent.features.definiteness,'definite');
  assert.equal(engine.realize({interlingua:parsed,to:'en'}).text,'All the big boys saw the small dog.');
  assert.equal(engine.realize({interlingua:parsed,to:'pl'}).text,'Wszyscy duzi chłopcy widzieli małego psa.');
});

test('Lexical ambiguity + modifiers: senses remain separate', () => {
  const out = translate('The big girl saw a red bank.');
  assert.equal(out.text,'Duża dziewczynka widziała czerwony bank.');
  assert.equal(out.semanticAlternatives.length,1);
  assert.equal(out.semanticAlternatives[0].text,'Duża dziewczynka widziała czerwony brzeg.');
  assert.deepEqual(out.interlingua.roles.theme.modifiers,[{concept:'quality.red'}]);
  assert.deepEqual(out.semanticAlternatives[0].interlingua.roles.theme.modifiers,[{concept:'quality.red'}]);
});

test('Qualified referents are valid across discourse; identity is not inferred automatically', () => {
  const parsed=engine.analyze({text:'The big girl saw two cats. The big girl saw the dog.',from:'en'});
  assert.equal(parsed.version,QUALIFIED_VERSION);
  assert.equal(parsed.type,'discourse');
  assert.notEqual(parsed.events[0].roles.agent,parsed.events[1].roles.agent);
  assert.deepEqual(parsed.entities[parsed.events[0].roles.agent].modifiers,[{concept:'quality.big'}]);
  assert.equal(engine.realize({interlingua:parsed,to:'pl'}).text,
    'Duża dziewczynka widziała dwa koty. Duża dziewczynka widziała psa.');
  assert.equal(materializeEvent(parsed,parsed.events[0]).version,QUALIFIED_VERSION);
});

test('Plain graph remains backward-compatible with event 0.2 and discourse 0.4', () => {
  const simple = see(participant('person.girl'),participant('object.book'));
  assert.equal(simple.version,INTERLINGUA_VERSION);
  assert.equal(createDiscourse([simple,simple]).version,DISCOURSE_VERSION);
  assert.equal(engine.realize({interlingua:simple,to:'pl'}).text,'Dziewczynka widziała książkę.');
});

test('Manual qualified semantic graph can be realized without parsing any source sentence', () => {
  const doc=graph({modifiers:[modifier('quality.big',[modifier('degree.very')])]},
    {quantifier:{kind:'exact',value:2},modifiers:[modifier('quality.red')]});
  assert.equal(engine.realize({interlingua:doc,to:'en'}).text,'The very big girl saw two red books.');
  assert.equal(engine.realize({interlingua:doc,to:'pl'}).text,'Bardzo duża dziewczynka widziała dwie czerwone książki.');
});

test('Feature registry and ontology reject unknown modifier concepts and wrong target types', () => {
  const x = graph({modifiers:[modifier('quality.not_declared')]}, {});
  assert.throws(()=>engine.realize({interlingua:x,to:'en'}),/Modifier/);
  x.roles.agent.modifiers=[modifier('degree.very')];
  assert.throws(()=>engine.realize({interlingua:x,to:'en'}),/cannot modify entity/);
  x.roles.agent.modifiers=[modifier('quality.big',[modifier('quality.small')])];
  assert.throws(()=>engine.realize({interlingua:x,to:'en'}),/cannot modify property/);
});

test('Nested modifiers are strictly bounded and cannot inject unvalidated fields', () => {
  const base = graph({},{});
  const faulty = mods => {const node=copy(base);node.version=QUALIFIED_VERSION;node.roles.agent.modifiers=mods;return node};
  assert.throws(()=>engine.realize({to:'en',interlingua:faulty([])}),/depth or breadth/);
  assert.throws(()=>engine.realize({to:'en',interlingua:faulty(Array(4).fill({concept:'quality.big'}))}),/depth or breadth/);
  assert.throws(()=>engine.realize({to:'en',interlingua:faulty([{concept:'quality.big',literal:'bad'}])}),/modifier node/);
  assert.throws(()=>engine.realize({to:'en',interlingua:faulty([
    modifier('quality.big',[modifier('degree.very',[modifier('degree.very',[modifier('degree.very')])])])
  ])}),/depth or breadth/);
});

test('Invalid cardinality is rejected before realization', () => {
  for(const bad of [0,1,1.5,-2,21,Infinity]) {
    assert.throws(()=>engine.realize({to:'en',interlingua:graph({}, {quantifier:{kind:'exact',value:bad}})}), /quantifier/);
  }
  assert.throws(()=>engine.realize({to:'en',interlingua:graph({}, {quantifier:{kind:'universal',value:2}})}), /quantifier/);
  assert.throws(()=>engine.realize({to:'en',interlingua:graph({}, {quantifier:{kind:'unknown'}})}), /quantifier/);
  const singular=see(participant('person.girl','definite','singular',{quantifier:{kind:'universal'}}),participant('animal.dog'));
  assert.throws(()=>engine.realize({to:'en',interlingua:singular}), /quantifier/);
});

test('Unsupported cardinalities are reported explicitly, not silently dropped', () => {
  const doc=graph({}, {quantifier:{kind:'exact',value:3}});
  assert.throws(()=>engine.realize({to:'pl',interlingua:doc}), /Missing pl quantifier/);
});

test('Older semantic schema may not smuggle newly qualified participants', () => {
  const event=graph({modifiers:[modifier('quality.big')]},{});
  event.version='0.2';
  assert.throws(()=>validateInterlingua(event,engine.ontology,engine.features), /require Interlingua v0.5/);
  const doc=createDiscourse([see(participant('person.girl'),participant('object.book')),graph({modifiers:[modifier('quality.big')]},{})]);
  doc.version='0.4';
  assert.throws(()=>validateInterlingua(doc,engine.ontology,engine.features), /require Interlingua v0.5/);
});

test('Qualified discourse preserves explicit shared references', () => {
  const repeated=graph({modifiers:[modifier('quality.big')]},{});
  const doc=createDiscourse([repeated,repeated]);
  doc.events[1].roles.agent=doc.events[0].roles.agent;
  assert.equal(engine.realize({interlingua:doc,to:'pl'}).text,
    'Duża dziewczynka widziała książki. Duża dziewczynka widziała książki.');
});

test('Declarative JSON order: move modifier slot behind quantifier without adapter code', () => {
  const gram=copy(pg);
  gram.nounPhrase.qualified.layouts=[['modifiers','quantifier','noun']];
  const local=makeEngine({pg:gram});
  const doc=engine.analyze({text:'The girl saw two small books.',from:'en'});
  assert.equal(local.realize({interlingua:doc,to:'pl'}).text,'Dziewczynka widziała małe dwie książki.');
  assert.equal(local.analyze({text:'Dziewczynka widziała małe dwie książki.',from:'pl'}).roles.theme.quantifier.value,2);
});

test('Dictionary-only new adjective works after adding a concept and inflected form', () => {
  const ont=copy(concepts), enData=copy(en), plData=copy(pl);
  ont.concepts['quality.fast']={type:'property',appliesTo:['entity'],label:'fast'};
  enData.adjectives.push({id:'en.fast.adj.1',concept:'quality.fast',lemma:'fast',indefiniteArticle:'a',forms:[{text:'fast'}]});
  const small=copy(plData.adjectives.find(a=>a.senses[0].coreRef.id==='quality.small'));
  small.id='pl.szybki.adj.1';small.senses[0].id='pl.szybki.adj.1.sense.1';small.senses[0].coreRef.id='quality.fast';small.lemma='szybki';
  // A focused new paradigm entry is sufficient for our example; other slots remain unsupported.
  small.forms=[{text:'szybka',when:{number:'singular',gender:'feminine',case:'nom'}}];
  plData.adjectives.push(small);
  const local=makeEngine({concepts:ont,en:enData,pl:plData});
  assert.equal(local.translate({text:'The fast girl saw the dog.',from:'en',to:'pl'}).text,
    'Szybka dziewczynka widziała psa.');
});

test('Malformed lexical modifier data and undeclared inflection features fail registration', () => {
  const d=copy(en);
  d.adjectives[0].forms=[{text:'big!',when:{number:'singular'}}];
  assert.throws(()=>makeEngine({en:d}), /inflected form/);
  const d2=copy(en);d2.adjectives[0].senses[0].coreRef.id='missing.quality';
  assert.throws(()=>makeEngine({en:d2}),/Unknown property concept/);
  const d3=copy(en);d3.adjectives[0].forms=[{text:'big',when:{number:'zillion'}}];
  assert.throws(()=>makeEngine({en:d3}), /Unsupported inflection condition/);
  const d4=copy(en);d4.quantifiers[0].meaning={kind:'exact',value:0};
  assert.throws(()=>makeEngine({en:d4}), /quantifier meaning/);
});

test('Ontology validates modifier applicability and typed inheritance', () => {
  const bad=copy(concepts);
  delete bad.concepts['quality.big'].appliesTo;
  assert.throws(()=>createOntology(bad), /modifier applicability/);
  const bad2=copy(concepts);
  bad2.concepts['degree.very'].appliesTo=['entity'];
  const local=makeEngine({concepts:bad2});
  const doc=graph({modifiers:[modifier('quality.big',[modifier('degree.very')])]},{});
  assert.throws(()=>local.realize({interlingua:doc,to:'en'}),/cannot modify property/);
});

// Portable grammar experiment: matrix explores cases and numbers rather than only canned phrases.
test('Qualified noun matrix preserves semantic roles under EN → PL → Interlingua', () => {
  const nouns=['person.girl','person.boy','animal.dog','object.book'];
  let tested=0;
  for(const agent of nouns) for(const theme of nouns) for(const adj of ['quality.big','quality.small']) {
    const meaning=see(participant(agent,'definite','plural',{modifiers:[modifier(adj)]}),
      participant(theme,'definite','plural',{modifiers:[modifier('quality.red')]}));
    const text=engine.realize({interlingua:meaning,to:'en'}).text;
    const plOutput=engine.translate({text,from:'en',to:'pl'}).text;
    const after=engine.analyze({text:plOutput,from:'pl'});
    assert.equal(after.roles.agent.concept,agent);
    assert.equal(after.roles.theme.concept,theme);
    assert.equal(after.roles.agent.modifiers[0].concept,adj);
    assert.equal(after.roles.theme.modifiers[0].concept,'quality.red');
    tested++;
  }
  assert.equal(tested,32);
});

test('English quantifier layout distinguishes all the, the two and two the', () => {
  assert.equal(translate('The girl saw the two small cats.').text,
    'Dziewczynka widziała dwa małe koty.');
  assert.deepEqual(engine.analyze({text:'The girl saw the two small cats.',from:'en'})
    .roles.theme.quantifier, {kind:'exact',value:2});
  const meaning=engine.analyze({text:'The girl saw the two small cats.',from:'en'});
  assert.equal(engine.realize({interlingua:meaning,to:'en'}).text,
    'The girl saw the two small cats.');
  assert.throws(()=>translate('The girl saw two the small cats.'),/construction/);
  assert.equal(engine.realize({interlingua:engine.analyze({
    text:'The girl saw all the small cats.',from:'en'
  }),to:'en'}).text, 'The girl saw all the small cats.');
});

test('Configuration rejects invalid qualifier layout or duplicate lexical IDs', () => {
  const gram=copy(eg);gram.nounPhrase.qualified.layouts=[['noun','modifiers','quantifier','determiner']];
  assert.throws(()=>makeEngine({eg:gram}),/layout/);
  const gram2=copy(eg);gram2.nounPhrase.qualified.layoutByQuantifier.exact=99;
  assert.throws(()=>makeEngine({eg:gram2}),/layout/);
  const dic=copy(en);dic.adjectives.push(copy(dic.adjectives[0]));
  assert.throws(()=>makeEngine({en:dic}),/duplicate adjective lexeme/);
});
