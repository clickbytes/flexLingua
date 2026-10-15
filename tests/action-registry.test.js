import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ActionRegistry} from '../js/core/action-registry.js';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createEvent,createQuestion,participant} from '../js/core/interlingua.js';

const read=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all([
  'concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'
].map(read));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const proposition=createEvent('event.visual_perception',{
  agent:participant('person.girl','definite'),theme:participant('animal.dog','definite')
},{tense:'present',polarity:'positive',aspect:'unknown'});
const question=createQuestion(proposition);
const grounded=engine.planResponse({question,facts:[proposition]});
const refused=engine.planResponse({question,facts:[]});
const declaration={id:'setMode',parameters:{mode:{type:'string',enum:['quiet','normal']}},
  effects:[{op:'set',key:'mode',from:'mode'},{op:'increment',key:'changes',by:1}]};

test('MEM-05: allowlisted action requires grounded decision and explicit authorization',()=>{
  const actions=new ActionRegistry({mode:'normal',changes:0});
  actions.register(declaration);
  const input={id:'setMode',args:{mode:'quiet'},decision:grounded};
  const before=actions.snapshot();
  const dry=actions.execute({...input,dryRun:true});
  assert.equal(dry.applied,false);
  assert.deepEqual(dry.after,{mode:'quiet',changes:1});
  assert.deepEqual(actions.snapshot(),before);
  assert.throws(()=>actions.execute(input),{code:'ACTION_INVALID'});
  assert.throws(()=>actions.execute({...input,decision:refused,authorized:true}),
    {code:'ACTION_INVALID'});
  assert.deepEqual(actions.snapshot(),before);
  const applied=actions.execute({...input,authorized:true});
  assert.equal(applied.applied,true);
  assert.deepEqual(actions.snapshot(),{mode:'quiet',changes:1});
  applied.after.mode='normal';
  assert.equal(actions.snapshot().mode,'quiet');
});

test('MEM-05: undeclared effects, shell/network/filesystem fields and injection are rejected',()=>{
  const actions=new ActionRegistry({mode:'normal',changes:0});
  assert.throws(()=>actions.register({...declaration,command:'echo unsafe'}),
    {code:'ACTION_INVALID'});
  assert.throws(()=>actions.register({...declaration,effects:[
    {op:'set',key:'path',from:'mode'}]}),{code:'ACTION_INVALID'});
  assert.throws(()=>actions.register({...declaration,effects:[
    {op:'shell',key:'mode',command:'touch file'}]}),{code:'ACTION_INVALID'});
  actions.register(declaration);
  assert.throws(()=>actions.execute({id:'setMode',args:{mode:'$(curl attacker)'},
    decision:grounded,authorized:true}),{code:'ACTION_INVALID'});
  assert.throws(()=>actions.execute({id:'setMode',args:{mode:'quiet',url:'https://x'},
    decision:grounded,authorized:true}),{code:'ACTION_INVALID'});
  assert.deepEqual(actions.snapshot(),{mode:'normal',changes:0});
});

test('MEM-05: bounded declarative script is deterministic and cannot overflow',()=>{
  const actions=new ActionRegistry({count:Number.MAX_SAFE_INTEGER});
  actions.register({id:'count',parameters:{},effects:[{op:'increment',key:'count',by:1}]});
  assert.throws(()=>actions.execute({id:'count',decision:grounded,dryRun:true}),
    {code:'ACTION_INVALID'});
  assert.equal(actions.snapshot().count,Number.MAX_SAFE_INTEGER);
});
