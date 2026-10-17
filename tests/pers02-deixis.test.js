import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createMorphology } from '../js/core/morphology/engine.js';
import { createCoreLanguage } from '../js/core/core-language.js';
import { ConversationContext } from '../js/core/conversation.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [ontology,features,en,pl,eng,plg,gold] = await Promise.all([
  '../data/concepts.json','../data/features.json','../data/en.json','../data/pl.json',
  '../data/grammar/en.json','../data/grammar/pl.json','./fixtures/pers02-deixis.json'
].map(read));
const engine = new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,eng))
  .registerLanguage(createRuleAdapter(pl,plg));

const expected = item => ({
  version:'1.22', type:'event', concept:'event.movement',
  roles:{agent:{referent:{kind:'deictic',anchor:item.anchor},
    agreement:{person:item.person,number:item.number}}},
  features:{tense:'present',polarity:'positive',aspect:item.aspect||'unknown'}
});

test('PERS-02 gold preserves first/second-person anchors across PL ↔ CORE ↔ EN', () => {
  for (const item of gold.cases) {
    const core=engine.analyze({text:item.input,from:item.from});
    assert.deepEqual(core,expected(item),item.input+' CORE');
    const translation=engine.realize({interlingua:core,to:item.to});
    assert.equal(translation.text,item.output,item.input+' target realization');
    const restored=engine.analyzeCandidates({text:translation.text,from:item.to});
    assert.ok(restored.some(candidate=>
      candidate.interlingua.roles.agent.referent.anchor===item.anchor &&
      candidate.interlingua.roles.agent.agreement.person===item.person &&
      candidate.interlingua.roles.agent.agreement.number===item.number),
    item.input+' reverse analysis keeps the source reading');
  }
});

test('English you keeps both number readings as explicit Polish alternatives', () => {
  const candidates=engine.analyzeCandidates({text:'You go.',from:'en'});
  assert.deepEqual(candidates.map(item=>item.interlingua.roles.agent.agreement.number),
    ['singular','plural']);
  const output=engine.translate({text:'You go.',from:'en',to:'pl'});
  assert.equal(output.text,'Ty idziesz.');
  assert.deepEqual(output.semanticAlternatives.map(item=>item.text),['Wy idziecie.']);
  assert.ok(output.warnings.some(message=>message.includes('distinct semantic readings')));
});

test('deictic pronouns stay separate from third-person anaphora', () => {
  assert.equal(engine.language('en').readDeicticPronoun('She sees a dog.').length,0);
  const pronoun=engine.language('en').readSubjectPronoun('She sees a dog.');
  assert.equal(pronoun.text,'she');
  assert.deepEqual(pronoun.agreement,
    {person:'third',number:'singular',gender:'feminine'});
  assert.equal(Object.hasOwn(pronoun,'concepts'),false);
  const ordinary=engine.analyze({text:'The girl goes.',from:'en'});
  assert.equal(ordinary.version,'0.2');
  assert.equal(ordinary.roles.agent.concept,'person.girl');
});

test('deictic schema rejects invalid anchors, agreement and unversioned references', () => {
  const valid=expected(gold.cases[0]);
  const mutations=[
    doc=>{doc.roles.agent.referent.anchor='observer';},
    doc=>{doc.roles.agent.agreement.person='second';},
    doc=>{delete doc.roles.agent.agreement.number;},
    doc=>{doc.roles.agent.agreement.gender='feminine';},
    doc=>{doc.version='1.0';}
  ];
  for(const mutate of mutations){
    const invalid=structuredClone(valid);
    mutate(invalid);
    assert.throws(()=>engine.realize({interlingua:invalid,to:'en'}),
      /Invalid (?:deictic|typed) participant|Unsupported event version/);
  }
  const roundTrip=engine.analyze({text:engine.realize({interlingua:valid,to:'core'}).text,
    from:'core'});
  assert.deepEqual(roundTrip,valid);
});

test('session turns keep deictic references turn-local unless IDs are explicit', () => {
  const result=engine.tryTranslate({text:'I go. I go.',from:'en',to:'pl'});
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'UNRESOLVED_DEIXIS');
  const conversation=new ConversationContext(engine);
  conversation.translate({text:'I go.',from:'en',to:'pl'});
  conversation.translate({text:'I go.',from:'en',to:'pl'});
  const snapshot=conversation.snapshot();
  assert.equal(snapshot.eventCount,2);
  assert.equal(snapshot.interlingua,null);
  assert.notEqual(snapshot.turns[0].references[0].referenceId,
    snapshot.turns[1].references[0].referenceId);
  assert.deepEqual(snapshot.turns.map(turn=>turn.references[0].referent.referent.anchor),
    ['speaker','speaker']);

  const mapped=new ConversationContext(engine);
  for(let index=0;index<2;index++) {
    mapped.translate({text:'I go.',from:'en',to:'pl',
      participants:{speakerId:'alice',addresseeId:'assistant'}});
  }
  const mappedTurns=mapped.snapshot().turns;
  assert.equal(mappedTurns[0].references[0].referenceId,
    mappedTurns[1].references[0].referenceId);
});

test('productive morphology bridge preserves the explicit person forms', async () => {
  const [morphFeatures,plSpec]=await Promise.all([
    read('../data/morphology/features.json'),read('../data/morphology/pl.json')
  ]);
  const core=createCoreLanguage(ontology);
  const morph=createMorphology(plSpec,pl,morphFeatures,{core});
  const productive=new Engine(ontology,features).registerMorphology(morph)
    .registerLanguage(createRuleAdapter(pl,plg,{morphology:morph}));
  assert.equal(productive.translate({text:'Wy idziecie.',from:'pl',to:'pl'}).text,
    'Wy idziecie.');
  assert.equal(productive.analyze({text:'Ja widzę psa.',from:'pl'}).roles.agent.agreement.person,
    'first');
});
