import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KnowledgeSource} from '../js/core/knowledge-source.js';

const provenance={entityId:'Q42',revisionId:123,
  url:'https://www.wikidata.org/wiki/Q42',license:'CC0-1.0'};
const fact={id:'claim_1',subject:'Q42',predicate:'P31',object:'Q5',
  validFrom:'2026-01-01T00:00:00Z',validUntil:null,provenance};
const snapshot={version:'1.0',origin:'offline_snapshot',provider:'wikidata',
  retrievedAt:'2026-10-15T00:00:00Z',facts:[fact]};

test('MULTI-04: offline snapshot preserves provenance and validity without CORE assertions',()=>{
  const source=new KnowledgeSource();
  assert.deepEqual(source.query({subject:'Q42',predicate:'P31',
    asOf:'2026-10-15T00:00:00Z'}),
  {status:'unavailable',facts:[],retrievedAt:null});
  source.importSnapshot(snapshot);
  const result=source.query({subject:'Q42',predicate:'P31',
    asOf:'2026-10-15T00:00:00Z'});
  assert.equal(result.status,'available');
  assert.deepEqual(result.facts,[fact]);
  result.facts[0].object='Q1';
  assert.equal(source.snapshot().facts[0].object,'Q5');
  assert.equal(source.query({subject:'Q42',predicate:'P31',
    asOf:'2025-12-31T00:00:00Z'}).status,'unavailable');
});

test('MULTI-04: conflicting values remain explicit and stale updates are refused',()=>{
  const source=new KnowledgeSource();
  const conflicting={...fact,id:'claim_2',object:'Q1'};
  source.importSnapshot({...snapshot,facts:[fact,conflicting]});
  const result=source.query({subject:'Q42',predicate:'P31',
    asOf:'2026-10-15T00:00:00Z'});
  assert.equal(result.status,'conflict');
  assert.equal(result.facts.length,2);
  assert.throws(()=>source.importSnapshot(snapshot),{code:'KNOWLEDGE_STALE_SNAPSHOT'});
  assert.equal(source.snapshot().facts.length,2);
});

test('MULTI-04: missing provenance, unsafe licenses and external access fail closed',()=>{
  const source=new KnowledgeSource();
  assert.throws(()=>source.importSnapshot({origin:'external',url:'https://www.wikidata.org'}),
    {code:'KNOWLEDGE_EXTERNAL_UNAVAILABLE'});
  for(const invalid of [
    {...fact,provenance:{...provenance,license:'CC-BY-SA-4.0'}},
    {...fact,provenance:{...provenance,revisionId:0}},
    {...fact,provenance:{...provenance,url:'https://example.com/Q42'}},
    {...fact,validUntil:'2025-01-01T00:00:00Z'}
  ])assert.throws(()=>source.importSnapshot({...snapshot,facts:[invalid]}),
    {code:'KNOWLEDGE_PROVENANCE_INVALID'});
  assert.equal(source.snapshot(),null);
});
