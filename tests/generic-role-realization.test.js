import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createQuestion,participant,validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const [concepts,features,en,enGrammar,fixture]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/grammar/en.json',
  'tests/fixtures/toy-optional-roles.json'
].map(load));

function makeEngine({linearizations=fixture.linearizations,formalSubject=fixture.formalSubject}={}){
  const ontology=copy(concepts);
  ontology.concepts[fixture.concept].optionalRoles=fixture.optionalRoles;
  const dictionary=copy(en),grammar=copy(enGrammar);
  dictionary.language=fixture.language;
  grammar.language=fixture.language;
  const frame=grammar.frames[fixture.concept];
  frame.linearizations=copy(linearizations);
  if(formalSubject===null)delete frame.formalSubject;
  else frame.formalSubject=formalSubject;
  return new Engine(ontology,features)
    .registerLanguage(createRuleAdapter(en,enGrammar))
    .registerLanguage(createRuleAdapter(dictionary,grammar));
}

test('an optional CORE role survives realization when the target uses a formal subject',()=>{
  const engine=makeEngine();
  const source=engine.analyze({text:'The girls see the book.',from:'en'});
  const target=engine.realize({interlingua:source,to:fixture.language});

  assert.equal(target.text,'It sees the book.');
  assert.deepEqual(target.interlingua,source);

  const parsed=engine.analyze({text:target.text,from:fixture.language});
  assert.deepEqual(Object.keys(parsed.roles),['theme']);
  assert.equal(Object.hasOwn(parsed.roles,'agent'),false);
  assert.equal(parsed.roles.theme.concept,'object.book');
  assert.doesNotThrow(()=>validateInterlingua(parsed,engine.ontology,engine.features));
});

test('optional, required, and explicit unknown arguments stay distinct',()=>{
  const engine=makeEngine();
  const book=participant('object.book','definite');
  const optionalMissing=createEvent(fixture.concept,{theme:book},
    {tense:'present',polarity:'positive',aspect:'unknown'});
  assert.doesNotThrow(()=>validateInterlingua(optionalMissing,engine.ontology,engine.features));

  const requiredMissing=createEvent('event.open',{theme:book},
    {tense:'past',polarity:'positive',aspect:'unknown'});
  assert.throws(()=>validateInterlingua(requiredMissing,engine.ontology,engine.features),/Event roles/);

  const explicitUnknown=createEvent(fixture.concept,{
    agent:participant('person.unknown','unknown'),theme:book
  },{tense:'present',polarity:'positive',aspect:'unknown'});
  assert.doesNotThrow(()=>validateInterlingua(explicitUnknown,engine.ontology,engine.features));
  assert.equal(explicitUnknown.roles.agent.concept,'person.unknown');

  const wh=createQuestion(optionalMissing,{questionType:'wh',targetRole:'agent'});
  assert.equal(wh.targetRole,'agent');
  assert.deepEqual(wh.proposition.roles,optionalMissing.roles);
  assert.doesNotThrow(()=>validateInterlingua(wh,engine.ontology,engine.features));
});

test('formal subject declaration is required and semantic roles cannot repeat or be invented',()=>{
  const duplicate=copy(fixture.linearizations);
  duplicate[1]=['agent','agent','@verb','theme'];
  assert.throws(()=>makeEngine({linearizations:duplicate}),/Linearization roles/);

  const invented=copy(fixture.linearizations);
  invented[1]=['agent','intruder','@verb','theme'];
  assert.throws(()=>makeEngine({linearizations:invented}),/Linearization roles/);

  const noDeclaration=copy(fixture.linearizations);
  assert.throws(()=>makeEngine({linearizations:noDeclaration,formalSubject:null}),/expletive/);
});
