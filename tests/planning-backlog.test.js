import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [near,future,map]=await Promise.all([
 'docs/planning/backlog-near.json',
 'docs/planning/backlog-future.json',
 'docs/planning/ISSUE_MAP.json'
].map(load));
const epics=[...near.epics,...future.epics];
const tasks=epics.flatMap(epic=>epic.tasks.map(item=>({...item,parent:epic.id})));
const byId=Object.fromEntries(tasks.map(item=>[item.id,item]));

test('Planning: 14 epics and 67 unique tasks, every issue number is present and unique',()=>{
 assert.equal(epics.length,14);
 assert.equal(tasks.length,67);
 assert.equal(new Set(epics.map(e=>e.id)).size,14);
 assert.equal(new Set(tasks.map(t=>t.id)).size,67);
 assert.equal(Object.keys(map.epics).length,14);
 assert.equal(Object.keys(map.tasks).length,67);
 const issueNums=new Set();
 for(const epic of epics){
  const indexed=map.epics[epic.id];
  assert.ok(Number.isInteger(indexed?.number),epic.id);
  assert.deepEqual(indexed.children,epic.tasks.map(t=>t.id),epic.id);
 }
 for(const task of tasks){
  const indexed=map.tasks[task.id];
  assert.ok(Number.isInteger(indexed?.number)&&indexed.number>0,task.id);
  assert.equal(indexed.parent,task.parent);
  assert.equal(indexed.priority,epics.find(e=>e.id===task.parent).priority);
  assert.ok(!issueNums.has(indexed.number),'Shared issue number: '+indexed.number);
  issueNums.add(indexed.number);
  assert.ok(task.files.length>=2,'Missing paths: '+task.id);
  assert.ok(task.checks.length>=3,'Missing acceptance criteria: '+task.id);
  assert.ok(task.checks.every(x=>typeof x==='string'&&x.length>15),task.id);
 }
 assert.equal(map.tasks['GUI-01'].number,1,'Existing GUI bug must be reused');
});

test('Planning: all blockers exist, reverse edges match, and dependency DAG has no cycles',()=>{
 const active=new Set(),done=new Set();
 function visit(code){
  assert.ok(byId[code],'Unknown dependency: '+code);
  assert.ok(!active.has(code),'Circular dependency: '+code);
  if(done.has(code))return;
  active.add(code);
  for(const dep of byId[code].deps)visit(dep);
  active.delete(code);done.add(code);
 }
 tasks.forEach(t=>visit(t.id));
 assert.equal(done.size,tasks.length);
 for(const task of tasks){
  assert.deepEqual(map.tasks[task.id].blockedBy,task.deps.map(d=>map.tasks[d].number));
  const unblocks=tasks.filter(other=>other.deps.includes(task.id)).map(other=>map.tasks[other.id].number);
  assert.deepEqual(map.tasks[task.id].unblocks,unblocks,task.id);
 }
 assert.deepEqual(byId['REL-01'].deps,[],'CI baseline cannot wait for GUI #1');
 assert.deepEqual(byId['GUI-01'].deps,['REL-01']);
 assert.ok(epics.every(x=>['P0','P1','P2','P3'].includes(x.priority)));
});

test('Planning: all non-new source paths exist or are explicitly created by a predecessor',async()=>{
 const willCreate=new Set(tasks.flatMap(task=>task.files.filter(path=>path.startsWith('[NEW] ')).map(path=>path.slice(6))));
 for(const task of tasks)for(const path of task.files){
  if(path.startsWith('[NEW] '))continue;
  try{await access(new URL('../'+path,import.meta.url));}
  catch{
   assert.ok(willCreate.has(path),task.id+' references unknown path not created by task: '+path);
  }
 }
});

test('Planning: issue forms and PR template require scope, acceptance and real test evidence',async()=>{
 const forms=['01_epic.yml','02_task.yml','03_bug.yml','04_spike.yml'];
 for(const name of forms){
  const text=await readFile(new URL('../.github/ISSUE_TEMPLATE/'+name,import.meta.url),'utf8');
  assert.match(text,/^name:/m,name);
  assert.match(text,/^description:/m,name);
  assert.match(text,/^body:\s*$/m,name);
  assert.match(text,/criteria|kryteria|acceptance|odbior|Definition of Done|test/i,name);
  assert.match(text,/validations:/,name);
 }
 const policy=await readFile(new URL('../docs/planning/ISSUE_POLICY.md',import.meta.url),'utf8');
 assert.match(policy,/Definition of Done/);
 assert.match(policy,/Definition of Ready/);
 const pr=await readFile(new URL('../.github/PULL_REQUEST_TEMPLATE.md',import.meta.url),'utf8');
 assert.match(pr,/Kryteria odbioru/);
 assert.match(pr,/HANDOFF\.md/);
 assert.match(pr,/SHA/);
 const config=await readFile(new URL('../.github/ISSUE_TEMPLATE/config.yml',import.meta.url),'utf8');
 assert.match(config,/blank_issues_enabled:\s*false/);
});
