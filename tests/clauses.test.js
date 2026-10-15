import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import {
  createEvent, participant, createRelativeClause, createCoordination,
  createNegation, validateInterlingua, CLAUSE_VERSION, MAX_RELATIVE_DEPTH
} from '../js/core/interlingua.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [ontology,features,en,pl,eng,plg] = await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const engineWith = (o=ontology, enDict=en, plDict=pl, enRules=eng, plRules=plg) => new Engine(o,features)
  .registerLanguage(createRuleAdapter(enDict,enRules))
  .registerLanguage(createRuleAdapter(plDict,plRules));
const engine=engineWith();
const copy=structuredClone;
const event=(subject='person.girl', object='animal.dog', pol='positive') => createEvent('event.visual_perception', {
  agent:participant(subject,'definite'), theme:participant(object,'definite')
}, {tense:'past',polarity:pol,aspect:'unknown'});

test('Relative agent gap is preserved as a concept relation, not a repeated pronoun referent', () => {
  const result=engine.translate({
    text:'The girl that saw the dog gave the boy a book.',from:'en',to:'pl'
  });
  assert.equal(result.text,'Dziewczynka, która widziała psa, dała chłopcu książkę.');
  const doc=result.interlingua;
  assert.equal(doc.version,CLAUSE_VERSION);
  assert.equal(doc.roles.agent.concept,'person.girl');
  const clause=doc.roles.agent.relatives[0];
  assert.equal(clause.gap,'agent');
  assert.deepEqual(Object.keys(clause.event.roles),['theme']);
  assert.equal(clause.event.roles.theme.concept,'animal.dog');
  assert.equal(clause.event.concept,'event.visual_perception');
  const restored=engine.analyze({text:result.text,from:'pl'});
  assert.equal(restored.roles.agent.relatives[0].gap,'agent');
});

test('English who and Polish którą / którego vary with grammatical gap', () => {
  const cases=[
    ['The boy that the girl saw gave the dog a book.',
      'Chłopiec, którego dziewczynka widziała, dał psu książkę.'],
    ['The girl who saw a dog gave the boy a book.',
      'Dziewczynka, która widziała psa, dała chłopcu książkę.']
  ];
  for(const [source,target] of cases){
    const result=engine.translate({text:source,from:'en',to:'pl'});
    assert.equal(result.text,target);
    const back=engine.analyze({text:target,from:'pl'});
    assert.equal(back.roles.agent.relatives[0].gap,
      source.includes('the girl saw')?'theme':'agent');
  }
});

test('Relative clauses support controlled depth-two nesting with one shared comma closure', () => {
  const source='The girl that saw the boy that saw the dog gave the cat a book.';
  const polish='Dziewczynka, która widziała chłopca, który widział psa, dała kotu książkę.';
  const output=engine.translate({text:source,from:'en',to:'pl'});
  assert.equal(output.text,polish);
  const outer=output.interlingua.roles.agent.relatives[0];
  assert.equal(outer.event.roles.theme.relatives[0].event.roles.theme.concept,'animal.dog');
  const back=engine.analyze({text:polish,from:'pl'});
  assert.equal(back.roles.agent.relatives[0].event.roles.theme.relatives[0].gap,'agent');
  assert.equal(MAX_RELATIVE_DEPTH,2);
});

test('Adjectives and negation compose with embedded relative clauses', () => {
  const output=engine.translate({text:
    'The big girl that did not see the book saw the small dog.',from:'en',to:'pl'});
  assert.equal(output.text,'Duża dziewczynka, która nie widziała książki, widziała małego psa.');
  assert.equal(output.interlingua.roles.agent.relatives[0].event.features.polarity,'negative');
  assert.equal(output.interlingua.roles.agent.modifiers[0].concept,'quality.big');
  assert.equal(engine.analyze({text:output.text,from:'pl'}).roles.agent.relatives[0].event.features.polarity,'negative');
});

test('Event coordination preserves separate, locally-scoped polarity (EN → PL → EN)', () => {
  const source='The girl saw the dog and the boy did not see a cat.';
  const result=engine.translate({text:source,from:'en',to:'pl'});
  assert.equal(result.text,'Dziewczynka widziała psa i chłopiec nie widział kota.');
  assert.equal(result.interlingua.type,'coordination');
  assert.equal(result.interlingua.clauses.length,2);
  assert.deepEqual(result.interlingua.clauses.map(x=>x.features.polarity),['positive','negative']);
  const back=engine.analyze({text:result.text,from:'pl'});
  assert.equal(back.type,'coordination');
  assert.equal(back.clauses[1].features.polarity,'negative');
});

test('Wide negation of conjunction is structurally different from negating a clause', () => {
  const source='It is not true that the girl saw the dog and the boy saw the cat.';
  const output=engine.translate({text:source,from:'en',to:'pl'});
  assert.equal(output.text,'Nie jest prawdą, że dziewczynka widziała psa i chłopiec widział kota.');
  assert.equal(output.interlingua.type,'scope');
  assert.equal(output.interlingua.operator,'not');
  assert.equal(output.interlingua.operand.type,'coordination');
  assert.deepEqual(output.interlingua.operand.clauses.map(c=>c.features.polarity),['positive','positive']);
  const local=engine.analyze({text:'The girl did not see the dog and the boy saw the cat.',from:'en'});
  assert.equal(local.type,'coordination');
  assert.equal(local.clauses[0].features.polarity,'negative');
  assert.notDeepEqual(local,output.interlingua);
  const back=engine.analyze({text:output.text,from:'pl'});
  assert.equal(back.type,'scope');
});

test('Declarative relative markers and connectives change translation without JS changes', () => {
  const changed=copy(eng);
  changed.nounPhrase.relatives.markers=[{gap:'agent',text:'which'},
    ...changed.nounPhrase.relatives.markers.filter(x=>x.gap!=='agent')];
  changed.sentence.coordination.and='plus';
  const other=engineWith(ontology,en,pl,changed,plg);
  const meaning=engine.analyze({text:'The girl that saw the dog gave the boy a book.',from:'en'});
  assert.equal(other.realize({interlingua:meaning,to:'en'}).text,
    'The girl which saw the dog gave the boy a book.');
  const coordinated=createCoordination([event(),event('person.boy','animal.cat')]);
  assert.equal(other.realize({interlingua:coordinated,to:'en'}).text,
    'The girl saw the dog plus the boy saw the cat.');
  assert.equal(other.analyze({text:'The girl saw the dog plus the boy saw the cat.',from:'en'}).type,'coordination');
});

test('Single-event and ordered discourse semantics remain backward compatible', () => {
  assert.equal(engine.analyze({text:'The girl saw the dog.',from:'en'}).version,'0.2');
  assert.equal(engine.analyze({text:'The girl saw the dog. The boy saw a cat.',from:'en'}).version,'0.4');
  assert.equal(engine.translate({text:'The girl saw a bank.',from:'en',to:'pl'}).semanticAlternatives.length,1);
  const discourse=engine.analyze({text:'The girl that saw the dog saw the cat. The boy saw the dog.',from:'en'});
  assert.equal(discourse.version,CLAUSE_VERSION);
  assert.equal(discourse.events.length,2);
});

test('Structural validation rejects malformed relative gaps, arity, versions and excessive depth', () => {
  const e=event();
  const rel=createRelativeClause(e,'agent');
  const valid=createEvent('event.visual_perception',{
    agent:participant('person.girl','definite','singular',{relatives:[rel]}),
    theme:participant('animal.cat','definite')
  },{tense:'past',polarity:'positive',aspect:'unknown'});
  assert.doesNotThrow(()=>engine.realize({interlingua:valid,to:'en'}));
  let bad=copy(valid);bad.roles.agent.relatives[0].event.roles.agent=participant('person.girl');
  assert.throws(()=>engine.realize({interlingua:bad,to:'en'}),/Event roles|gap/);
  bad=copy(valid);bad.roles.agent.relatives[0].gap='invalid';
  assert.throws(()=>engine.realize({interlingua:bad,to:'en'}),/Relative gap/);
  bad=copy(valid);bad.version='0.5';
  assert.throws(()=>engine.realize({interlingua:bad,to:'en'}),/Relative clause nesting|v0.5/);
  bad=copy(valid);
  bad.roles.agent.relatives[0].event.roles.theme.relatives=[rel];
  bad.roles.agent.relatives[0].event.roles.theme.relatives[0].event.roles.theme.relatives=[rel];
  assert.throws(()=>engine.realize({interlingua:bad,to:'en'}),error=>
    error.code==='INTERLINGUA_CYCLE' || /depth|nesting/.test(error.message));
  bad=createCoordination([event(),event()]);bad.clauses.push({type:'scope',operator:'not',operand:bad});
  assert.throws(()=>engine.realize({interlingua:bad,to:'en'}),/limit|scope|version|requires complete event|cycle/);
});

test('Disallowed syntactic and operator combinations fail visibly instead of silently degrading', () => {
  assert.equal(engine.analyze({text:'It is not true that the girl saw the dog.',from:'en'}).operand.type,'event');
  assert.throws(()=>engine.analyze({text:'The girl saw the dog and.',from:'en'}),/unsupported|construction|coordination/i);
  assert.throws(()=>engine.translate({text:'The girl saw the dog and the boy saw the cat. The boy saw the dog.',from:'en',to:'pl'}),/Mixed multi-sentence coordination/);
  assert.equal(engine.realize({interlingua:createNegation(event()),to:'en'}).text,
    'It is not true that the girl saw the dog.');
  let malformed=copy(eng);malformed.nounPhrase.relatives.markers[0].when={__proto__:'foo',number:'bogus'};
  assert.throws(()=>engineWith(ontology,en,pl,malformed,plg),/Invalid relative marker feature/);
});

test('Relative clause with ambiguous noun keeps semantic alternatives', () => {
  const output=engine.translate({text:'The girl that saw a bank gave the boy a book.',from:'en',to:'pl'});
  assert.equal(output.text,'Dziewczynka, która widziała bank, dała chłopcu książkę.');
  assert.equal(output.semanticAlternatives.length,1);
  assert.equal(output.semanticAlternatives[0].text,'Dziewczynka, która widziała brzeg, dała chłopcu książkę.');
  assert.equal(output.interlingua.roles.agent.relatives[0].event.roles.theme.concept,
    'place.financial_institution');
});

test('Plural antecedents select Polish relative pronouns and conjugation from JSON', () => {
  for(const [english,polish] of [
    ['The boys that saw the dog saw the cat.','Chłopcy, którzy widzieli psa, widzieli kota.'],
    ['The girls that saw the boy gave the dog a book.','Dziewczynki, które widziały chłopca, dały psu książkę.']
  ]){
    assert.equal(engine.translate({text:english,from:'en',to:'pl'}).text,polish);
    assert.equal(engine.analyze({text:polish,from:'pl'}).roles.agent.features.number,'plural');
  }
});

test('Coordination combines qualified referents and relatives without flattening scope', () => {
  const text='The big girl that saw two small cats saw the dog and the boy did not see the book.';
  const r=engine.translate({text,from:'en',to:'pl'});
  assert.equal(r.text,
    'Duża dziewczynka, która widziała dwa małe koty, widziała psa i chłopiec nie widział książki.');
  assert.equal(r.interlingua.clauses[0].roles.agent.relatives[0].event.roles.theme.quantifier.value,2);
  assert.equal(r.interlingua.clauses[1].features.polarity,'negative');
  assert.equal(engine.analyze({text:r.text,from:'pl'}).type,'coordination');
});

test('Relative-clause matrix retains semantic gaps, aspect gap and participant number', () => {
  const actors=['person.girl','person.boy','animal.dog','animal.cat'];
  const objects=['animal.dog','object.book','animal.cat'];
  let checked=0;
  for(const actor of actors) for(const object of objects)
    for(const plurality of ['singular','plural']) for(const pol of ['positive','negative']) {
      const antecedent=participant(actor,'definite',plurality,{relatives:[
        createRelativeClause(createEvent('event.visual_perception',{
          agent:participant(actor,'definite',plurality), theme:participant(object,'definite')
        },{tense:'past',polarity:pol,aspect:'unknown'}),'agent')
      ]});
      const target=event(actor,'person.boy');
      target.roles.agent=antecedent;
      target.version=CLAUSE_VERSION;
      const enText=engine.realize({interlingua:target,to:'en'}).text;
      const parsed=engine.analyze({text:enText,from:'en'});
      const plText=engine.realize({interlingua:parsed,to:'pl'}).text;
      const back=engine.analyze({text:plText,from:'pl'});
      assert.equal(back.roles.agent.concept,actor);
      assert.equal(back.roles.agent.features.number,plurality);
      assert.equal(back.roles.agent.relatives[0].event.roles.theme.concept,object);
      assert.equal(back.roles.agent.relatives[0].event.features.polarity,pol);
      checked++;
    }
  assert.equal(checked,48);
});


test('A new semantic gap role can be defined with JSON markers alone', () => {
  const english=copy(eng);
  const polish=copy(plg);
  english.nounPhrase.relatives.markers.push({gap:'recipient',text:'whom'});
  polish.nounPhrase.relatives.markers.push({gap:'recipient',text:'której',
    when:{number:'singular',gender:'feminine'}});
  const custom=engineWith(ontology,en,pl,english,polish);
  const nested=createEvent('event.transfer_possession', {
    agent:participant('person.boy','definite'),
    recipient:participant('person.girl','definite'),
    theme:participant('object.book','definite')
  }, {tense:'past',polarity:'positive',aspect:'unknown'});
  const doc=createEvent('event.visual_perception', {
    agent:participant('person.girl','definite','singular',{
      relatives:[createRelativeClause(nested,'recipient')]
    }), theme:participant('animal.dog','definite')
  }, {tense:'past',polarity:'positive',aspect:'unknown'});
  const englishText=custom.realize({interlingua:doc,to:'en'}).text;
  const polishText=custom.translate({text:englishText,from:'en',to:'pl'}).text;
  assert.equal(englishText,'The girl whom the boy gave the book saw the dog.');
  assert.equal(polishText,'Dziewczynka, której chłopiec dał książkę, widziała psa.');
  assert.equal(custom.analyze({text:polishText,from:'pl'}).roles.agent.relatives[0].gap,'recipient');
});

test('Per-language maximum relative depth is declarative, while semantic safety is global', () => {
  const limited=copy(eng);limited.nounPhrase.relatives.maxDepth=1;
  const short=engineWith(ontology,en,pl,limited,plg);
  assert.equal(short.translate({text:'The girl that saw the dog saw the boy.',from:'en',to:'pl'}).interlingua.version,CLAUSE_VERSION);
  const twice=engine.analyze({text:'The girl that saw the boy that saw the dog saw the cat.',from:'en'});
  assert.throws(()=>short.realize({interlingua:twice,to:'en'}),/depth exceeded/);
  assert.throws(()=>short.analyze({text:'The girl that saw the boy that saw the dog saw the cat.',from:'en'}),/construction/);
});
