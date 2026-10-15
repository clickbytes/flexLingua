import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';
import {createConditional,createDialogueAct,createEvent,createNegation,participant,
  validateInterlingua} from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(read));
const make=()=>new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg))
  .registerLanguage(createRuleAdapter(pl,pg));

test('B1B2-05: real conditionals round-trip EN ↔ CORE ↔ PL, including else',()=>{
  const engine=make();
  assert.equal(engine.capabilities().conditionalDocumentVersion,'1.30');
  const english='If the girl opens the book, then the boy reads the book.';
  const meaning=engine.analyze({text:english,from:'en'});
  assert.equal(meaning.type,'conditional');
  assert.equal(meaning.kind,'real');
  assert.equal(engine.realize({interlingua:meaning,to:'pl'}).text,
    'Jeśli dziewczynka otwiera książkę, to chłopiec czyta książkę.');
  assert.deepEqual(engine.analyze({text:JSON.stringify(meaning),from:'core'}),meaning);
  assert.equal(engine.translate({text:'Jeśli dziewczynka otwiera książkę, to chłopiec czyta książkę.',
    from:'pl',to:'en'}).text,'If a girl opens a book, then a boy reads a book.');

  const withElse=engine.translate({text:
    'If the girl opens the book, then the boy reads the book, otherwise the boy opens the book.',
    from:'en',to:'pl'});
  assert.equal(withElse.interlingua.type,'conditional');
  assert.ok(withElse.interlingua.otherwise);
  assert.equal(withElse.text,
    'Jeśli dziewczynka otwiera książkę, to chłopiec czyta książkę, w przeciwnym razie chłopiec otwiera książkę.');
  assert.equal(engine.analyze({text:withElse.text,from:'pl'}).otherwise.concept,'event.open');
});

test('B1B2-05: conditional consequents preserve modal and negative scope',()=>{
  const engine=make();
  const modal=engine.analyze({text:
    'If the girl opens the book, then the boy can read the book.',from:'en'});
  assert.equal(modal.consequence.type,'modality');
  assert.equal(modal.consequence.operator,'modality.ability');
  assert.equal(engine.translate({text:
    'If the girl opens the book, then the boy can read the book.',from:'en',to:'pl'}).text,
    'Jeśli dziewczynka otwiera książkę, to chłopiec może czytać książkę.');

  const locallyNegative=engine.analyze({text:
    'If the girl opens the book, then the boy does not read the book.',from:'en'});
  assert.equal(locallyNegative.consequence.features.polarity,'negative');
  const broadlyNegative=createNegation(modal);
  assert.equal(broadlyNegative.operand.type,'conditional');
  assert.equal(broadlyNegative.operand.consequence.type,'modality');
  assert.notDeepEqual(broadlyNegative,locallyNegative);
  assert.doesNotThrow(()=>validateInterlingua(broadlyNegative,engine.ontology,engine.features));
  assert.deepEqual(engine.analyze({text:JSON.stringify(broadlyNegative),from:'core'}),broadlyNegative);
});

test('B1B2-05: conditional clauses are not added to committed event memory',()=>{
  const engine=make(),conversation=new ConversationContext(engine);
  const condition=engine.analyze({text:'The girl opens the book.',from:'en'});
  const consequence=engine.analyze({text:'The boy reads the book.',from:'en'});
  const conditional=createConditional(condition,consequence);
  const session=conversation.appendDialogueAct(
    createDialogueAct('assert',{proposition:conditional}));
  assert.equal(session.eventCount,0);
  assert.equal(session.interlingua,null);
  assert.equal(session.turnCount,1);
  assert.equal(session.memory.facts.length,0);
});

test('B1B2-05: unsupported mixed conditional periods are rejected',()=>{
  const engine=make();
  for(const text of [
    'If the girl opened the book, then the boy reads the book.',
    'If the girl opens the book, then the boy read the book.',
    'If the girl will open the book, then the boy reads the book.',
    'If the girl opens the book, then the boy reads the book, otherwise the boy read the book.'
  ]) assert.equal(engine.tryTranslate({text,from:'en',to:'pl'}).ok,false,text);

  const event=(tense,polarity='positive')=>createEvent('event.read',{
    agent:participant('person.boy'),theme:participant('object.book')
  },{tense,polarity,aspect:'unknown'});
  assert.throws(()=>validateInterlingua(createConditional(
    createEvent('event.open',{agent:participant('person.girl'),theme:participant('object.book')},
      {tense:'present',polarity:'positive',aspect:'unknown'}),event('past')),
    engine.ontology,engine.features),/conditional period/);
});
