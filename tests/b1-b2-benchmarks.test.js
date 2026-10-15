import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg,fixture,b1,b2]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json',
  'tests/fixtures/gold-b1-b2.json','data/coverage/b1-targets.json',
  'data/coverage/b2-targets.json'
].map(read));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));
const categories={B1:['event_relations','composition','discourse','polysemy','phraseology'],
  B2:['passive','conditionals','event_relations','polysemy','phraseology']};

test('B1B2-06: separate original samples have 100 cases each, directional split and negatives',()=>{
  assert.equal(fixture.schemaVersion,1);
  assert.equal(fixture.license,'project-authored');
  const ids=new Set(),inputs=new Set();
  for(const level of ['B1','B2']) {
    const rows=fixture.cases.filter(row=>row.level===level);
    assert.equal(rows.length,100);
    assert.equal(rows.filter(row=>row.direction==='en->pl').length,50);
    assert.equal(rows.filter(row=>row.direction==='pl->en').length,50);
    assert.equal(rows.filter(row=>row.expectation.status==='unsupported').length,20);
    for(const category of categories[level])
      assert.equal(rows.filter(row=>row.construction===category).length,20,category);
    const targets=level==='B1'?b1:b2;
    assert.equal(targets.scope.caseCount,100);
    assert.equal(targets.scope.representativeCefrDenominator,null);
    assert.deepEqual(targets.targets.map(row=>row.category),categories[level]);
    for(const row of rows) {
      assert.ok(!ids.has(row.id),row.id);
      ids.add(row.id);
      assert.ok(row.input.length>15);
      const sampleKey=row.level+':'+row.direction+':'+row.input;
      assert.ok(!inputs.has(sampleKey),`Duplicate source: ${sampleKey}`);
      inputs.add(sampleKey);
    }
  }
  assert.equal(ids.size,200);
});

for(const level of ['B1','B2'])test(`${level}: finite semantic, ambiguity and refusal benchmark`,()=>{
  const results={},failures=[];
  for(const row of fixture.cases.filter(item=>item.level===level)) {
    const from=row.direction.slice(0,2),to=row.direction.slice(4);
    let passed=false;
    if(row.expectation.status==='ambiguous') {
      const candidates=engine.analyzeCandidates({text:row.input,from});
      const senses=new Set(candidates.map(item=>item.interlingua.roles?.theme?.concept));
      passed=candidates.length>=row.expectation.minReadings &&
        row.expectation.senses.every(sense=>senses.has(sense));
    } else {
      const output=engine.tryTranslate({text:row.input,from,to,
        ...(row.context?{context:row.context}:{})});
      if(row.expectation.status==='unsupported')passed=!output.ok;
      else if(output.ok) {
        const meaning=output.value.interlingua;
        passed=meaning.type===row.expectation.semanticType &&
          (row.expectation.voice===undefined||meaning.voice===row.expectation.voice) &&
          (row.expectation.kind===undefined||meaning.kind===row.expectation.kind) &&
          (row.expectation.concept===undefined||meaning.concept===row.expectation.concept) &&
          (row.expectation.contentConcept===undefined||
            meaning.content?.concept===row.expectation.contentConcept) &&
          (row.expectation.conditionConcept===undefined||
            meaning.condition?.concept===row.expectation.conditionConcept) &&
          (row.expectation.consequenceConcept===undefined||
            meaning.consequence?.concept===row.expectation.consequenceConcept) &&
          (row.expectation.agentOmitted===undefined||
            Boolean(meaning.omittedRoles?.includes('agent'))===row.expectation.agentOmitted) &&
          (row.expectation.eventConcepts===undefined||
            JSON.stringify(meaning.events?.map(event=>event.concept))===
              JSON.stringify(row.expectation.eventConcepts)) &&
          (row.expectation.relation===undefined||
            meaning.relations?.some(edge=>edge.type===row.expectation.relation));
      }
    }
    const key=row.construction+':'+row.direction;
    results[key]??={pass:0,total:0};
    results[key].total++;
    if(passed)results[key].pass++;
    if(!passed)failures.push(`${row.id} ${key}: ${row.input}`);
  }
  console.log(`${level} construction report: ${JSON.stringify(results)}`);
  for(const [key,result] of Object.entries(results))
    assert.equal(result.total,10,key);
  assert.deepEqual(failures,[]);
});
