import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {EVIDENCE_SOURCES,verifyEvidenceFixture} from '../tools/a1-evidence-ledger-lib.mjs';
import {buildA1Report} from '../tools/report-a1-lib.mjs';

const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const [ontology,features,pl,en,plMorph,enMorph,plGrammar,enGrammar,seed,corpus]=await Promise.all([
  'data/concepts.json','data/features.json','data/pl.json','data/en.json',
  'data/morphology/pl.json','data/morphology/en.json',
  'data/grammar/pl.json','data/grammar/en.json',
  'data/coverage/a1-pilot.json','data/coverage/a1-gold-g2.json'
].map(load));
const inventory={pl,en,ontology,plMorph,enMorph,plGrammar,enGrammar,seed};
const make=()=>new Engine(ontology,features)
  .registerLanguage(createRuleAdapter(pl,plGrammar))
  .registerLanguage(createRuleAdapter(en,enGrammar));

test('G3: audited report distinguishes structural, behavioral, and CEFR coverage',()=>{
  const report=buildA1Report(make(),inventory,corpus);
  assert.equal(report.outcome,'pass');
  assert.deepEqual(report.behavioral.summary,{total:40,passed:40,failed:0});
  assert.deepEqual(report.behavioral.positive,{total:32,passed:32,failed:0});
  assert.deepEqual(report.behavioral.negative,{total:8,passed:8,failed:0});
  assert.equal(report.sampleEvidence.classification,'development');
  assert.deepEqual(report.sampleEvidence.declared,{positive:32,negative:8});
  assert.deepEqual(report.sampleEvidence.verified,{positive:32,negative:8,status:'pass'});
  assert.equal(report.sampleEvidence.heldOut.included,false);
  assert.equal(report.structural.pilot.conceptCount,13);
  assert.ok(report.sampleEvidence.pilotConceptsMentionedByGold>0);
  assert.equal(report.sampleEvidence.pilotConceptsTotal,
    report.sampleEvidence.conceptIdsNotMentioned.length+
    report.sampleEvidence.conceptIdsMentioned.length);
  assert.equal(report.cefr.percentage,null);
  assert.equal(report.cefr.status,'not-measured');
  assert.equal(report.release.verified,false);
  assert.equal(report.provenance.notOfficialOxford,true);
});

test('G3: semantically false gold fails the overall outcome, including direction and group',()=>{
  const broken=structuredClone(corpus);
  broken.cases[0].core.concept='event.nonexistent';
  const report=buildA1Report(make(),inventory,broken);
  assert.equal(report.outcome,'fail');
  assert.equal(report.behavioral.summary.failed,1);
  assert.equal(report.behavioral.byDirection['en->pl'].failed,1);
  assert.equal(report.behavioral.byFeature.statement.failed,1);
  assert.equal(report.cefr.percentage,null);
});

test('G3: invalid source registry is refused rather than reported as valid vocabulary',()=>{
  const modified=structuredClone(pl);
  modified.nouns[0].senses[0].coreRef.id='concept.missing';
  assert.throws(()=>buildA1Report(make(),{...inventory,pl:modified},corpus),
    /Unknown CORE reference/);
});

test('G3: report CLI works in Node with strict mode and no external runtime dependencies',()=>{
  const result=spawnSync(process.execPath,['tools/report-a1.mjs','--strict'],
    {cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
  const json=JSON.parse(result.stdout);
  assert.equal(json.behavioral.summary.passed,40);
  assert.equal(json.release.verified,false);
  assert.equal(json.cefr.percentage,null);
});

test('G3: strict report only accepts the pinned development gold fixture',async()=>{
  const source=EVIDENCE_SOURCES.find(item=>item.id==='g2');
  const text=await readFile(new URL('../'+source.fixture,import.meta.url),'utf8');
  assert.equal(verifyEvidenceFixture('g2',text),source.sha256);
  assert.throws(()=>verifyEvidenceFixture('g2',text+'\n'),/integrity check failed/);
});
