import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createDiscourse,createEvent,materializeEvent,participant,validateInterlingua}
  from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('B1B2-04: EN/PL passive preserves active event roles and round-trips CORE',()=>{
  const engine=make();
  assert.equal(engine.capabilities().passiveEventDocumentVersion,'1.29');
  const active=engine.analyze({text:'The girl opened the book.',from:'en'});
  const passive=engine.analyze({text:'The book was opened by the girl.',from:'en'});
  assert.equal(passive.version,'1.29');
  assert.equal(passive.voice,'passive');
  assert.deepEqual(passive.roles,active.roles);
  assert.equal(engine.realize({interlingua:passive,to:'pl'}).text,
    'Książka została otwarta przez dziewczynkę.');
  assert.deepEqual(engine.analyze({text:JSON.stringify(passive),from:'core'}),passive);
  assert.equal(engine.analyze({text:'Książka została otwarta przez dziewczynkę.',from:'pl'})
    .voice,'passive');
  assert.equal(engine.translate({text:'Książka została otwarta przez dziewczynkę.',
    from:'pl',to:'en'}).text,'A book was opened by a girl.');

  const discourse=createDiscourse([passive,passive]);
  assert.equal(discourse.version,'1.29');
  assert.equal(materializeEvent(discourse,discourse.events[0]).voice,'passive');
  assert.deepEqual(engine.analyze({text:JSON.stringify(discourse),from:'core'}),discourse);
});

test('B1B2-04: passive agreement tables cover the bounded EN/PL forms',()=>{
  const english=eg.passive.events['event.open'].past;
  const polish=pg.passive.events['event.open'].past;
  assert.deepEqual(Object.keys(english.auxiliary).sort(),['plural','singular']);
  assert.deepEqual(Object.keys(english.participle).sort(),['plural','singular']);
  for(const table of [polish.auxiliary,polish.participle]) {
    assert.deepEqual(Object.keys(table.singular).sort(),['feminine','masculine','neuter']);
    assert.deepEqual(Object.keys(table.plural).sort(),['nonvirile','virile']);
  }
  const engine=make();
  for(const [concept,expected] of [
    ['object.key','Klucz został otwarty.'],
    ['object.apple','Jabłko zostało otwarte.']
  ]) {
    const meaning=createEvent('event.open',{theme:participant(concept,'definite')},
      {tense:'past',polarity:'positive',aspect:'unknown'},
      {voice:'passive',omittedRoles:['agent']});
    assert.equal(engine.realize({interlingua:meaning,to:'pl'}).text,expected);
  }
  const plural=engine.translate({text:'The books were opened.',from:'en',to:'pl'});
  assert.equal(plural.text,'Książki zostały otwarte.');
  assert.equal(plural.interlingua.omittedRoles[0],'agent');
  assert.equal(engine.translate({text:'Książki zostały otwarte.',from:'pl',to:'en'}).text,
    'Books were opened.');
  const malformed=structuredClone(eg);
  malformed.passive.events['event.open'].past.participle.plural='opened incorrectly';
  assert.throws(()=>createRuleAdapter(en,malformed),/passive past paradigm/);
});

test('B1B2-04: omitted agents remain absent; unknown agents are explicit CORE referents',()=>{
  const engine=make();
  const omitted=engine.analyze({text:'The book was opened.',from:'en'});
  assert.equal(omitted.voice,'passive');
  assert.deepEqual(omitted.omittedRoles,['agent']);
  assert.equal(Object.hasOwn(omitted.roles,'agent'),false);
  assert.equal(engine.realize({interlingua:omitted,to:'pl'}).text,'Książka została otwarta.');

  const unknown=createEvent('event.open',{
    theme:participant('object.book','definite'),
    agent:participant('person.unknown','unknown')
  },{tense:'past',polarity:'positive',aspect:'unknown'},{voice:'passive'});
  assert.equal(Object.hasOwn(unknown,'omittedRoles'),false);
  assert.equal(unknown.roles.agent.concept,'person.unknown');
  assert.doesNotThrow(()=>validateInterlingua(unknown,engine.ontology,engine.features));
  assert.deepEqual(engine.analyze({text:JSON.stringify(unknown),from:'core'}),unknown);

  const malformed=structuredClone(omitted);
  malformed.omittedRoles=['theme'];
  assert.throws(()=>validateInterlingua(malformed,engine.ontology,engine.features),
    /omitted-role declaration/);
  const missingWithoutDeclaration=structuredClone(omitted);
  delete missingWithoutDeclaration.omittedRoles;
  assert.throws(()=>validateInterlingua(missingWithoutDeclaration,
    engine.ontology,engine.features),/Event roles/);
});

test('B1B2-04: invalid passive agents and unsupported tenses are rejected',()=>{
  const engine=make();
  for(const text of [
    'The book was opened by the dog.',
    'The book is opened by the girl.',
    'The book was opened by.'
  ])assert.equal(engine.tryTranslate({text,from:'en',to:'pl'}).ok,false,text);
});
