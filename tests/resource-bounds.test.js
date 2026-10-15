import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {ConversationContext} from '../js/core/conversation.js';
import {RESOURCE_LIMITS} from '../js/core/resource-limits.js';

const get=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,enGrammar,plGrammar]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json'
].map(get));
const engine=new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(en,enGrammar))
  .registerLanguage(createRuleAdapter(pl,plGrammar));

test('Resource benchmark: eight ambiguous events stay under candidate and time ceilings',()=>{
  const text=Array.from({length:RESOURCE_LIMITS.discourseEvents},
    ()=>'The girl saw a bank.').join(' ');
  const started=performance.now();
  const candidates=engine.analyzeCandidates({text,from:'en'});
  const elapsedMs=performance.now()-started;

  assert.equal(candidates.length,RESOURCE_LIMITS.grammarAnalyses);
  assert.ok(candidates.every(candidate=>candidate.interlingua.events.length===
    RESOURCE_LIMITS.discourseEvents));
  const maxMilliseconds=3_000;
  assert.ok(elapsedMs<maxMilliseconds,
    `eight-event ambiguity benchmark took ${elapsedMs.toFixed(1)}ms (limit ${maxMilliseconds}ms)`);
});

test('Grammar search benchmark refuses after the configured node budget',()=>{
  const overloadedGrammar=structuredClone(enGrammar);
  const perception=overloadedGrammar.frames['event.visual_perception'];
  const sequence=perception.linearizations[0];
  perception.linearizations=Array.from({
    length:Math.ceil(RESOURCE_LIMITS.grammarSearchNodes/4)+2
  },()=>sequence);
  const constrained=new Engine(ontology,features)
    .registerLanguage(createRuleAdapter(en,overloadedGrammar));

  const started=performance.now();
  assert.throws(()=>constrained.analyzeCandidates({text:'The girl saw the dog.',from:'en'}),
    error=>error.code==='GRAMMAR_SEARCH_LIMIT');
  const elapsedMs=performance.now()-started;
  const maxMilliseconds=5_000;
  assert.ok(elapsedMs<maxMilliseconds,
    `bounded search refusal took ${elapsedMs.toFixed(1)}ms (limit ${maxMilliseconds}ms)`);

  const conversation=new ConversationContext(constrained);
  const before=conversation.snapshot();
  const refusal=conversation.tryTranslate({
    text:'The girl saw the dog.',from:'en',to:'en'
  });
  assert.equal(refusal.ok,false);
  assert.equal(refusal.error.code,'GRAMMAR_SEARCH_LIMIT');
  assert.deepEqual(conversation.snapshot(),before);
});
