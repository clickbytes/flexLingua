import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createQuestion,participant} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url)));
const [ontology,features,en,pl,enGrammar,plGrammar]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(load));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));

const ref=(id,definiteness='definite')=>participant(id,definiteness);
const proposition=(roles={},eventFeatures={})=>createEvent('event.visual_perception',{
  agent:ref('person.girl'),theme:ref('animal.dog'),...roles
},{tense:'present',polarity:'positive',aspect:'imperfective',...eventFeatures});
const refs=(agentId='girl-1',themeId='dog-1')=>[
  {role:'question.proposition.roles.agent',referenceId:agentId},
  {role:'question.proposition.roles.theme',referenceId:themeId}
];
const factRefs=(agentId='girl-1',themeId='dog-1')=>[
  {role:'proposition.roles.agent',referenceId:agentId},
  {role:'proposition.roles.theme',referenceId:themeId}
];
const referenceContext=(questionReferences,factReferences)=>({
  question:questionReferences,facts:factReferences
});

test('same grounded participant matches across a definite-to-indefinite mention change',()=>{
  const question=createQuestion(proposition());
  const fact=proposition({agent:ref('person.girl','indefinite')});
  const plan=engine.planResponse({question,facts:[fact],referenceContext:
    referenceContext(refs(),[factRefs()])});
  assert.equal(plan.outcome,'answer');
  assert.equal(plan.act.act,'confirm');
  assert.deepEqual(plan.evidence,[{factIndex:0}]);
});

test('different grounded participant IDs do not support the same definite proposition',()=>{
  const question=createQuestion(proposition());
  const fact=proposition();
  const plan=engine.planResponse({question,facts:[fact],referenceContext:
    referenceContext(refs('girl-question'),[factRefs('girl-fact')])});
  assert.equal(plan.outcome,'unknown');
  assert.equal(plan.reason,'insufficient_context');
});

test('unresolved third-person pronouns need an explicit shared reference ID',()=>{
  const she={referent:{kind:'anaphoric',resolution:'unresolved'},
    agreement:{person:'third',number:'singular',gender:'feminine'}};
  const question=createQuestion(proposition({agent:she}));
  const fact=proposition({agent:she});
  const ungrounded=engine.planResponse({question,facts:[fact]});
  assert.equal(ungrounded.outcome,'unknown');
  assert.equal(ungrounded.reason,'insufficient_context');

  const grounded=engine.planResponse({question,facts:[fact],referenceContext:
    referenceContext(refs('person-1','dog-1'),[factRefs('person-1','dog-1')])});
  assert.equal(grounded.act.act,'confirm');
});

test('opposite polarity for the same grounded meaning stays ambiguous',()=>{
  const question=createQuestion(proposition());
  const facts=[proposition(),proposition({}, {polarity:'negative'})];
  const plan=engine.planResponse({question,facts,referenceContext:
    referenceContext(refs(),[factRefs(),factRefs()])});
  assert.equal(plan.outcome,'unknown');
  assert.equal(plan.reason,'ambiguous');
  assert.deepEqual(plan.evidence,[{factIndex:0},{factIndex:1}]);
});

test('identity normalization does not hide an aspect mismatch',()=>{
  const question=createQuestion(proposition());
  const fact=proposition({}, {aspect:'unknown'});
  const plan=engine.planResponse({question,facts:[fact],referenceContext:
    referenceContext(refs(),[factRefs()])});
  assert.equal(plan.outcome,'unknown');
  assert.equal(plan.reason,'insufficient_context');
});

test('WH answers for distinct grounded referents remain ambiguous',()=>{
  const question=createQuestion(createEvent('event.visual_perception',{
    agent:ref('person.girl')
  },{tense:'present',polarity:'positive',aspect:'imperfective'}),
  {questionType:'wh',targetRole:'theme'});
  const facts=[
    proposition({theme:ref('animal.dog','indefinite')}),
    proposition({theme:ref('animal.dog','indefinite')})
  ];
  const plan=engine.planResponse({question,facts,referenceContext:
    referenceContext([{role:'question.proposition.roles.agent',referenceId:'girl-1'}],[
      factRefs('girl-1','dog-1'),factRefs('girl-1','dog-2')
    ])});
  assert.equal(plan.outcome,'unknown');
  assert.equal(plan.reason,'ambiguous');
});
