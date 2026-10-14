/** Auditable PL↔INTER↔EN A1 pilot: finite independent text and meaning oracle, NOT a CEFR score. */
const directions=new Set(['en:pl','pl:en']);
const features=new Set(['statement','negation','question','modality','multiword']);
const word=x=>typeof x==='string'&&x.trim().length>0;
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));

export function semanticSignature(document){
  const wrappers=[];
  let node=document;
  for(let depth=0;depth<6&&node;depth++){
    if(node.type==='event'){
      return {concept:node.concept,
        roles:Object.fromEntries(Object.entries(node.roles||{}).map(([role,entity])=>
          [role,{concept:entity.concept,number:entity.features?.number}])),
        tense:node.features?.tense,polarity:node.features?.polarity,wrappers};
    }
    if(node.type==='question'){
      wrappers.push('question:'+node.questionType+(node.targetRole?':'+node.targetRole:''));
      node=node.proposition;
    }else if(node.type==='modality'){
      wrappers.push('modal:'+node.operator);
      node=node.operand;
    }else if(node.type==='scope'){
      wrappers.push('scope:'+node.operator);
      node=node.operand;
    }else throw new Error('Unsupported gold semantic structure: '+node.type);
  }
  throw new Error('Missing or excessively nested gold event.');
}

export function validateA1Gold(corpus){
  if(!corpus||corpus.schemaVersion!==1||corpus.license!=='project-authored'||
      !Array.isArray(corpus.cases)||!Array.isArray(corpus.unsupported)||
      !corpus.cases.length||corpus.cases.length>500||corpus.unsupported.length>100)
    throw new Error('Invalid or excessive A1 gold corpus.');
  const ids=new Set(),utterances=new Set(),found=new Set();
  for(const item of [...corpus.cases,...corpus.unsupported]){
    if(!item||!/^G2-(?:EN|PL|INVALID)-[0-9]{2}$/u.test(item.id||'')||
        ids.has(item.id)||!directions.has(item.from+':'+item.to)||
        !word(item.input)||item.input.length>400||utterances.has(item.from+':'+item.input))
      throw new Error('Invalid or duplicate A1 gold item: '+String(item?.id));
    ids.add(item.id);utterances.add(item.from+':'+item.input);
  }
  for(const row of corpus.cases){
    found.add(row.from+':'+row.to);
    if(!features.has(row.feature)||!word(row.expected)||row.expected.length>400||
      !row.core||!word(row.core.concept)||!row.core.roles||
      !Array.isArray(row.core.wrappers)||!['present','past'].includes(row.core.tense)||
      !['positive','negative'].includes(row.core.polarity)||
      Object.values(row.core.roles).some(r=>!word(r.concept)||
        !['singular','plural'].includes(r.number))||
      row.core.wrappers.some(x=>!word(x)))
      throw new Error('Invalid A1 gold oracle: '+row.id);
  }
  if(found.size!==2)throw new Error('A1 gold must cover both directions.');
  return true;
}

export function evaluateA1Gold(engine,corpus){
  validateA1Gold(corpus);
  const results=[];
  for(const row of corpus.cases){
    try{
      const translated=engine.translate({text:row.input,from:row.from,to:row.to});
      const checks={
        surface:translated.text===row.expected,
        sourceCore:same(semanticSignature(translated.interlingua),row.core),
        targetCore:same(semanticSignature(engine.analyze({text:translated.text,from:row.to})),row.core),
        coreSerialization:same(engine.analyze({text:JSON.stringify(translated.interlingua),from:'core'}),translated.interlingua)
      };
      const passed=Object.values(checks).every(Boolean);
      results.push({id:row.id,from:row.from,to:row.to,feature:row.feature,
        kind:'positive',passed,checks,...(passed?{}:{actual:translated.text})});
    }catch(e){results.push({id:row.id,from:row.from,to:row.to,feature:row.feature,kind:'positive',
      passed:false,error:String(e.message)});}
  }
  for(const row of corpus.unsupported){
    try{
      const out=engine.tryTranslate({text:row.input,from:row.from,to:row.to});
      const passed=out.ok===false&&word(out.error?.message);
      results.push({id:row.id,from:row.from,to:row.to,feature:'unsupported',kind:'negative',
        passed,...(passed?{}:{error:'Unsupported input accepted or missing diagnostic'})});
    }catch(e){results.push({id:row.id,from:row.from,to:row.to,feature:'unsupported',kind:'negative',
      passed:false,error:String(e.message)});}
  }
  const sum=items=>({total:items.length,passed:items.filter(x=>x.passed).length,failed:items.filter(x=>!x.passed).length});
  const summary=sum(results);
  return {schemaVersion:1,source:corpus.origin,scope:corpus.scope,status:summary.failed?'fail':'pass',
    summary,positive:sum(results.filter(x=>x.kind==='positive')),negative:sum(results.filter(x=>x.kind==='negative')),
    byDirection:Object.fromEntries(['en','pl'].map(from=>[from+'->'+(from==='en'?'pl':'en'),sum(results.filter(x=>x.from===from))])),
    byFeature:Object.fromEntries([...features,'unsupported'].map(feature=>[feature,sum(results.filter(x=>x.feature===feature))])),
    results,cefr:{level:'A1',percentage:null,status:'not-measured',
      reason:'Finite project-authored pilot, not a licensed representative A1 denominator or CEFR evaluation.'}};
}
