/** Local, dependency-free evidence runner. It does not repair or replace GitHub Actions. */
const allowedTest=/^[A-Za-z0-9._-]+\.test\.js$/u;
const fixed=[
  ['lexicon','tools/check-lexicon.mjs'],
  ['morphology','tools/check-morphology.mjs'],
  ['gold','tools/verify-gold.mjs'],
  ['a1-gold','tools/report-a1.mjs','--strict'],
  ['coverage','--test','tests/coverage-a1.test.js']
];

export function coreGatePlan(testFiles){
  if(!Array.isArray(testFiles)||testFiles.length<1||testFiles.length>200||
      testFiles.some(file=>!allowedTest.test(file))||
      new Set(testFiles).size!==testFiles.length)
    throw new Error('Core gate requires a unique, bounded *.test.js file inventory.');
  const gates=fixed.map(([name,...args])=>({name,args}));
  gates.push({name:'full-node-tests',args:['--test',...testFiles.slice().sort().map(file=>'tests/'+file)]});
  return gates;
}

export function runCoreGates(plan,{spawn,nodePath='node',cwd}={}){
  if(!Array.isArray(plan)||!plan.length||typeof spawn!=='function')
    throw new Error('Missing gate plan or synchronous runner.');
  const rows=plan.map(gate=>{
    const start=Date.now();
    try{
      const run=spawn(nodePath,gate.args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
      const passed=run.status===0&&!run.error&&!run.signal;
      return {name:gate.name,passed,exitCode:run.status??null,signal:run.signal||null,
        elapsedMs:Date.now()-start,
        ...(passed?{}:{error:run.error?.message||null,stdoutTail:String(run.stdout||'').slice(-2500),
          stderrTail:String(run.stderr||'').slice(-2500)})};
    }catch(error){return {name:gate.name,passed:false,exitCode:null,signal:null,
      elapsedMs:Date.now()-start,error:String(error.message)};}
  });
  return {schemaVersion:1,scope:'local-checkout-only-not-CI-certification',
    status:rows.every(r=>r.passed)?'pass':'fail',
    summary:{total:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length},
    githubActionsVerified:false,releaseVerified:false,rows};
}
