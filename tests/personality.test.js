import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {
  createDiscourse, createEvent, participant
} from '../js/core/interlingua.js';
import {
  createPersonalityProfile, DEFAULT_PERSONALITY_PROFILE,
  PERSONALITY_PROFILE_VERSION
} from '../js/core/personality.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar,profileJson,profileSchema]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/personality/default.json',
  'schemas/personality.schema.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));
const ref=id=>participant(id,'definite');
const event=(theme)=>createEvent('event.visual_perception',
  {agent:ref('person.girl'),theme:ref(theme)},
  {tense:'present',polarity:'positive',aspect:'unknown'});
const profile=(id,pronounRealization,outputVariant='preferred')=>({
  version:PERSONALITY_PROFILE_VERSION,id,
  realization:{pronounRealization,outputVariant}
});

test('default JSON and runtime default share the closed versioned schema',()=>{
  assert.equal(engine.capabilities().personalityProfileVersion,'1.1');
  assert.deepEqual(profileJson,DEFAULT_PERSONALITY_PROFILE);
  assert.deepEqual(createPersonalityProfile(),profileJson);
  assert.deepEqual(profileSchema.required,['version','id','realization']);
  assert.equal(profileSchema.additionalProperties,false);
  assert.deepEqual(profileSchema.properties.realization.properties.pronounRealization.enum,
    ['repeat','safe']);
});

test('profile validator rejects unknown keys, invalid versions, IDs and option ranges',()=>{
  assert.throws(()=>createPersonalityProfile({...profileJson,extra:true}),/Invalid personality/);
  assert.throws(()=>createPersonalityProfile({...profileJson,version:'2.0'}),/Invalid personality/);
  assert.throws(()=>createPersonalityProfile({...profileJson,id:'Bad ID'}),/Invalid personality/);
  assert.throws(()=>createPersonalityProfile(profile('casual','guess')),/Invalid personality/);
  assert.throws(()=>createPersonalityProfile(profile('casual','safe','invented')),/Invalid personality/);
  assert.throws(()=>createPersonalityProfile({...profileJson,
    realization:{...profileJson.realization,temperature:0.5}}),/Invalid personality/);
});

test('safe pronoun profile changes only target wording, never CORE semantics',()=>{
  const meaning=createDiscourse([event('animal.dog'),event('animal.cat')],
    {coreference:{'e2.agent':'e1.agent'}});
  const plain=engine.realize({interlingua:meaning,to:'en'});
  const styled=engine.realize({interlingua:meaning,to:'en',
    profile:profile('narrator','safe')});
  assert.equal(plain.text,'The girl sees the dog. The girl sees the cat.');
  assert.equal(styled.text,'The girl sees the dog. She sees the cat.');
  assert.deepEqual(styled.interlingua,meaning);
  assert.equal(styled.interlingua.events[0].features.tense,'present');
  assert.equal(styled.interlingua.events[0].features.polarity,'positive');
  assert.equal(styled.interlingua.events[1].roles.agent,meaning.events[1].roles.agent);
});

test('profile can select an existing target wording alternative without changing question CORE',()=>{
  const question=engine.analyze({text:'Co widzi dziewczynka?',from:'pl'});
  const preferred=engine.realize({interlingua:question,to:'en'});
  assert.ok(preferred.alternatives.length);
  const selected=engine.realize({interlingua:question,to:'en',
    profile:profile('explicit','repeat','first_alternative')});
  assert.equal(selected.text,preferred.alternatives[0]);
  assert.equal(selected.alternatives[0],preferred.text);
  assert.deepEqual(selected.interlingua,question);
});

test('DialogueEngine applies the profile across turns and rejects bad profiles atomically',()=>{
  const dialogue=engine.createDialogueEngine();
  const session=dialogue.createSession();
  const first=dialogue.nextTurn({session,utterance:'The girl sees the dog.',language:'en',to:'en'});
  const second=dialogue.nextTurn({session,utterance:'She sees the cat.',language:'en',to:'en',
    profile:profile('narrator','safe')});
  assert.equal(second.text,'She sees the cat.');
  assert.deepEqual(second.core.roles.agent,first.core.roles.agent);
  assert.equal(second.core.features.tense,first.core.features.tense);
  const before=session.snapshot();
  const failed=dialogue.tryNextTurn({session,utterance:'The girl sees the dog.',
    language:'en',to:'en',profile:profile('narrator','guess')});
  assert.equal(failed.ok,false);
  assert.equal(failed.error.code,'INVALID_INPUT');
  assert.deepEqual(session.snapshot(),before);
});
