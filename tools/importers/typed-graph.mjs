/** Offline review importer for proposed typed-graph lexemes. Never activates data. */
import {lstat, mkdir, readFile, realpath, stat, writeFile} from 'node:fs/promises';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TextDecoder} from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {createCoreLanguage} from '../../js/core/core-language.js';
import {PROJECT_ROOT} from '../project-plugins.mjs';

const MAX_INPUT_BYTES=4_000_000;
const MAX_OUTPUT_BYTES=24_000_000;
const MAX_ROWS=2_000;
const MAX_LINE_LENGTH=16_000;
const OUTPUT_NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.json$/u;
const POS=new Set(['noun','verb','adjective','degree','quantifier','attitude','function_word','modal']);
const TSV_COLUMNS=[
  'sourceId','sourceVersion','author','license','permittedUse','reviewedAt',
  'plLemma','enLemma','plPOS','enPOS','senseDefinition','senseId',
  'proposedCoreId','proposedCoreType','parent','relations','confidenceNote','sourceLocation'
];
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const compare=(left,right)=>left<right?-1:left>right?1:0;

function fail(message,code='TYPED_GRAPH_IMPORT_INVALID') {
  const error=new Error(message);
  error.code=code;
  throw error;
}

function isWithin(root,target) {
  const path=relative(root,target);
  return path==='' || (path!=='..' && !path.startsWith('..'+sep) && !isAbsolute(path));
}

function parseOptions(args) {
  const accepted=new Set(['--input','--format','--out']);
  const options={};
  for(let index=0;index<args.length;index+=2) {
    const key=args[index],value=args[index+1];
    if(!accepted.has(key) || Object.hasOwn(options,key) || typeof value!=='string' ||
        !value || value.startsWith('--'))fail('Invalid command-line arguments.');
    options[key]=value;
  }
  if(Object.keys(options).length!==accepted.size ||
      !['jsonl','tsv'].includes(options['--format'])) {
    fail('Usage: node tools/importers/typed-graph.mjs --input FILE --format jsonl|tsv --out NEW_FILE.json');
  }
  if(!OUTPUT_NAME.test(options['--out'])) {
    fail('Output must be a new JSON filename without path components.','unsafe_output_path');
  }
  return {input:options['--input'],format:options['--format'],outputName:options['--out']};
}

async function ensureRealDirectory(parent,name,rootReal) {
  const path=resolve(parent,name);
  try {
    const entry=await lstat(path);
    if(!entry.isDirectory() || entry.isSymbolicLink()) {
      fail('Staging path contains a non-directory or symbolic link.','unsafe_staging_path');
    }
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await mkdir(path);
  }
  const pathReal=await realpath(path);
  if(!isWithin(rootReal,pathReal) || pathReal===rootReal) {
    fail('Staging path resolves outside the repository.','unsafe_staging_path');
  }
  return pathReal;
}

async function prepareStagingDirectory() {
  const rootReal=await realpath(PROJECT_ROOT);
  const importRoot=await ensureRealDirectory(rootReal,'import-staging',rootReal);
  return ensureRealDirectory(importRoot,'typed-graph',rootReal);
}

function parseJsonl(text) {
  const rows=[],rejected=[];
  const lines=text.split(/\r?\n/u);
  if(lines.length>MAX_ROWS+1) {
    return {rows,rejected:[{line:0,reasonId:'row_limit_exceeded'}]};
  }
  for(let index=0;index<lines.length;index++) {
    const line=lines[index];
    if(!line.trim())continue;
    if(line.length>MAX_LINE_LENGTH) {
      rejected.push({line:index+1,reasonId:'row_too_large'});
      continue;
    }
    try {
      rows.push({line:index+1,value:JSON.parse(line)});
    } catch {
      rejected.push({line:index+1,reasonId:'malformed_json'});
    }
  }
  return {rows,rejected};
}

function parseTsv(text) {
  const lines=text.split(/\r?\n/u);
  const header=(lines.shift()??'').split('\t');
  if(header.length!==TSV_COLUMNS.length ||
      header.some((name,index)=>name!==TSV_COLUMNS[index])) {
    return {rows:[],rejected:[{line:1,reasonId:'malformed_tsv_header'}]};
  }
  if(lines.length>MAX_ROWS+1) {
    return {rows:[],rejected:[{line:0,reasonId:'row_limit_exceeded'}]};
  }
  const rows=[],rejected=[];
  for(let index=0;index<lines.length;index++) {
    const line=lines[index];
    if(!line.trim())continue;
    if(line.length>MAX_LINE_LENGTH) {
      rejected.push({line:index+2,reasonId:'row_too_large'});
      continue;
    }
    const cells=line.split('\t');
    if(cells.length!==TSV_COLUMNS.length) {
      rejected.push({line:index+2,reasonId:'malformed_tsv_row'});
      continue;
    }
    const value=Object.fromEntries(TSV_COLUMNS.map((key,column)=>[key,cells[column]]));
    value.parent=value.parent.trim()||null;
    if(!value.senseId.trim())delete value.senseId;
    try {
      value.relations=JSON.parse(value.relations);
      rows.push({line:index+2,value});
    } catch {
      rejected.push({line:index+2,reasonId:'malformed_relations_json'});
    }
  }
  return {rows,rejected};
}

async function readInput(path,format) {
  try {
    const entry=await lstat(path);
    if(!entry.isFile() || entry.isSymbolicLink()) {
      return {rows:[],rejected:[{line:0,reasonId:'input_not_regular_file'}]};
    }
    const info=await stat(path);
    if(info.size>MAX_INPUT_BYTES) {
      return {rows:[],rejected:[{line:0,reasonId:'input_byte_limit_exceeded'}]};
    }
    const bytes=await readFile(path);
    let text;
    try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    catch { return {rows:[],rejected:[{line:0,reasonId:'invalid_utf8'}]}; }
    return format==='jsonl'?parseJsonl(text):parseTsv(text);
  } catch(error) {
    if(error.code==='ENOENT')return {rows:[],rejected:[{line:0,reasonId:'input_not_found'}]};
    return {rows:[],rejected:[{line:0,reasonId:'input_unreadable'}]};
  }
}

function normalizeText(value) {
  return typeof value==='string'?value.normalize('NFC').trim():value;
}

function validDate(value) {
  if(!value)return true;
  const parsed=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
}

function normalizeCandidate(value) {
  return {
    sourceId:normalizeText(value.sourceId),
    sourceVersion:normalizeText(value.sourceVersion),
    author:normalizeText(value.author),
    license:normalizeText(value.license),
    permittedUse:normalizeText(value.permittedUse),
    reviewedAt:normalizeText(value.reviewedAt),
    plLemma:normalizeText(value.plLemma),
    enLemma:normalizeText(value.enLemma),
    plPOS:value.plPOS,
    enPOS:value.enPOS,
    senseDefinition:normalizeText(value.senseDefinition),
    ...(value.senseId===undefined?{}:{senseId:normalizeText(value.senseId)}),
    proposedCoreId:value.proposedCoreId,
    proposedCoreType:value.proposedCoreType,
    parent:value.parent===null?null:normalizeText(value.parent),
    relations:value.relations.map(edge=>({
      relation:edge.relation,
      target:edge.target,
      constraint:edge.constraint,
      ...(edge.weight===undefined?{}:{weight:edge.weight})
    })).sort((a,b)=>compare(a.relation,b.relation)||compare(a.target,b.target)||
      compare(a.constraint,b.constraint)||(a.weight??0)-(b.weight??0)),
    confidenceNote:normalizeText(value.confidenceNote),
    sourceLocation:normalizeText(value.sourceLocation)
  };
}

function lemmaKey(value,language) {
  return value.normalize('NFC').trim().toLocaleLowerCase(language).normalize('NFC');
}

function lexiconLemma(entry) {
  if(typeof entry.lemma==='string'&&entry.lemma.trim())return normalizeText(entry.lemma);
  const forms=entry.forms;
  if(record(forms)) {
    for(const key of ['lemma','base']) {
      if(typeof forms[key]==='string'&&forms[key].trim())return normalizeText(forms[key]);
    }
  }
  if(Array.isArray(forms)) {
    const firstForm=forms[0]?.text;
    if(typeof firstForm==='string'&&firstForm.trim())return normalizeText(firstForm);
  }
  return null;
}

function indexActiveLexicon(document,language) {
  const lemmas=new Map();
  let unresolved=0;
  for(const entries of Object.values(document)) {
    if(!Array.isArray(entries))continue;
    for(const entry of entries) {
      const lemma=lexiconLemma(entry);
      if(!lemma) {
        unresolved++;
        continue;
      }
      const key=lemmaKey(lemma,language);
      const targets=new Set((entry.senses??[])
        .map(sense=>sense?.coreRef?.kind==='concept'?sense.coreRef.id:null)
        .filter(Boolean));
      const senses=lemmas.get(key)??{targets:new Set(),count:0};
      targets.forEach(target=>senses.targets.add(target));
      senses.count++;
      lemmas.set(key,senses);
    }
  }
  return {lemmas,unresolved};
}

function addError(item,reasonId) {
  item.errors.add(reasonId);
}

function addReview(item,reasonId) {
  item.reviewFlags.add(reasonId);
}

function validateReferences(candidate,core,coreIds,candidateById,allowedRelations) {
  const errors=[];
  const targetExists=id=>coreIds.has(id)||candidateById.has(id);
  if(candidate.parent!==null && !targetExists(candidate.parent))errors.push('orphan_core_reference');
  for(const edge of candidate.relations) {
    if(!allowedRelations.has(edge.relation)) {
      errors.push('unknown_relation_type');
      continue;
    }
    if(!targetExists(edge.target)) {
      errors.push('orphan_core_reference');
      continue;
    }
    if(edge.target===candidate.proposedCoreId)errors.push('self_relation_target');
    const signature=core.ontology.relationTypes[edge.relation];
    if(!signature) {
      errors.push('unregistered_relation_type');
      continue;
    }
    const isA=(id,expected)=>{
      let cursor=id;
      const seen=new Set();
      while(cursor && !seen.has(cursor)) {
        if(cursor===expected)return true;
        if(coreIds.has(cursor))return core.ontology.isA(cursor,expected);
        if(candidateById.get(cursor)?.proposedCoreType===expected)return true;
        seen.add(cursor);
        cursor=candidateById.get(cursor)?.parent??null;
      }
      return false;
    };
    if(!isA(candidate.proposedCoreId,signature.subject) ||
        !isA(edge.target,signature.object))errors.push('relation_type_mismatch');
  }
  const seen=new Set();
  let cursor=candidate.proposedCoreId;
  while(cursor) {
    if(seen.has(cursor)) {
      errors.push('parent_cycle');
      break;
    }
    seen.add(cursor);
    if(coreIds.has(cursor)) {
      const concept=core.ontology.get(cursor);
      cursor=concept.parent??null;
    } else {
      cursor=candidateById.get(cursor)?.parent??null;
    }
  }
  return [...new Set(errors)].sort(compare);
}

function reviewReasons(candidate) {
  const reasons=[];
  if(!candidate.license || /^(?:unknown|tbd|undetermined|not verified)$/iu.test(candidate.license)) {
    reasons.push('rights_not_documented');
  }
  if(!candidate.permittedUse)reasons.push('permitted_use_missing');
  if(!candidate.author || !candidate.sourceVersion || !candidate.sourceLocation ||
      !candidate.reviewedAt)reasons.push('provenance_incomplete');
  if(!candidate.confidenceNote ||
      /uncertain|unknown|unreviewed|needs? review|low confidence/iu.test(candidate.confidenceNote)) {
    reasons.push('alignment_review_required');
  }
  return [...new Set(reasons)].sort(compare);
}

function duplicateGroups(candidates,keyFor) {
  const groups=new Map();
  for(const item of candidates) {
    const key=keyFor(item.candidate);
    const group=groups.get(key)??[];
    group.push(item);
    groups.set(key,group);
  }
  return [...groups.values()].filter(group=>group.length>1);
}

export function buildCandidateReport({rows,rejected=[],core,coreDocument,candidateSchema,activeLemmas}) {
  const ajv=new Ajv2020({allErrors:true,strict:false});
  const validate=ajv.compile(candidateSchema);
  const coreIds=new Set(Object.keys(coreDocument.concepts));
  const allowedRelations=new Set(candidateSchema.$defs.relationEdge.oneOf[0].properties.relation.enum);
  const items=[],allRejected=[...rejected];

  for(const row of rows) {
    if(!record(row.value)) {
      allRejected.push({line:row.line,reasonId:'invalid_record'});
      continue;
    }
    if(['forms','morphology','paradigm','bindings'].some(key=>Object.hasOwn(row.value,key))) {
      allRejected.push({line:row.line,reasonId:'unsupported_morphology_payload'});
      continue;
    }
    if(!POS.has(row.value.plPOS)||!POS.has(row.value.enPOS)) {
      allRejected.push({line:row.line,reasonId:'unknown_pos'});
      continue;
    }
    if(!validate(row.value)) {
      allRejected.push({line:row.line,reasonId:'candidate_schema_invalid'});
      continue;
    }
    const candidate=normalizeCandidate(row.value);
    if(!candidate.plLemma||!candidate.enLemma||!candidate.senseDefinition||
        !candidate.sourceId||!candidate.proposedCoreId) {
      allRejected.push({line:row.line,reasonId:'blank_normalized_field'});
      continue;
    }
    if(!validDate(candidate.reviewedAt)) {
      allRejected.push({line:row.line,reasonId:'invalid_reviewed_at'});
      continue;
    }
    items.push({line:row.line,candidate,errors:new Set(),reviewFlags:new Set()});
  }

  for(const item of items) {
    if(coreIds.has(item.candidate.proposedCoreId))addError(item,'conflicting_core_target');
  }
  for(const item of items) {
    for(const language of ['pl','en']) {
      const lemma=item.candidate[language+'Lemma'];
      const existing=activeLemmas[language].lemmas.get(lemmaKey(lemma,language));
      if(!existing)continue;
      const explicitNewSense=item.candidate.senseId&&
        !existing.targets.has(item.candidate.proposedCoreId);
      if(explicitNewSense)addReview(item,'active_lemma_polysemy_requires_review');
      else addError(item,'duplicate_normalized_lemma');
    }
    if(activeLemmas.pl.unresolved||activeLemmas.en.unresolved) {
      addReview(item,'active_lexicon_lemma_unresolved');
    }
  }
  for(const group of duplicateGroups(items,candidate=>
    candidate.sourceId.normalize('NFC').toLocaleLowerCase('und'))) {
    for(const item of group)addError(item,'duplicate_source_id');
  }
  for(const group of duplicateGroups(items,candidate=>candidate.proposedCoreId)) {
    for(const item of group)addError(item,'conflicting_core_target');
  }
  for(const language of ['pl','en']) {
    for(const group of duplicateGroups(items,candidate=>
      lemmaKey(candidate[language+'Lemma'],language))) {
      const senses=group.map(item=>item.candidate.senseId);
      const ids=group.map(item=>item.candidate.proposedCoreId);
      const definitions=group.map(item=>item.candidate.senseDefinition);
      const deliberate=senses.every(Boolean)&&new Set(senses).size===group.length&&
        new Set(ids).size===group.length&&new Set(definitions).size===group.length;
      if(!deliberate)for(const item of group)addError(item,'duplicate_normalized_lemma');
      else for(const item of group)addReview(item,'polysemous_candidate_requires_review');
    }
  }

  const initialById=new Map(items.map(item=>[item.candidate.proposedCoreId,item.candidate]));
  for(const item of items) {
    if(item.candidate.parent) {
      const parent=initialById.get(item.candidate.parent)??coreDocument.concepts[item.candidate.parent];
      const allowedParentTypes={
        category:['category'],
        entity:['category'],
        event:['event']
      }[item.candidate.proposedCoreType];
      if(parent&&allowedParentTypes&&!allowedParentTypes.includes(parent.proposedCoreType??parent.type)) {
        addError(item,'parent_type_mismatch');
      }
    }
    for(const reasonId of validateReferences(item.candidate,core,coreIds,initialById,allowedRelations)) {
      addError(item,reasonId);
    }
    for(const relation of item.candidate.relations.filter(edge=>edge.constraint==='required')) {
      const targets=item.candidate.relations.filter(edge=>
        edge.constraint==='required'&&edge.relation===relation.relation).map(edge=>edge.target);
      if(new Set(targets).size>1)addError(item,'conflicting_required_relation');
    }
  }

  const finalById=new Map(items.filter(item=>!item.errors.size)
    .map(item=>[item.candidate.proposedCoreId,item.candidate]));
  for(const item of items.filter(item=>!item.errors.size)) {
    for(const edge of item.candidate.relations) {
      if(!coreIds.has(edge.target)&&!finalById.has(edge.target)) {
        addError(item,'orphan_core_reference');
      }
    }
    if(item.candidate.parent&&!coreIds.has(item.candidate.parent)&&
        !finalById.has(item.candidate.parent))addError(item,'orphan_core_reference');
  }

  const candidates=[];
  for(const item of items) {
    if(item.errors.size) {
      for(const reasonId of [...item.errors].sort(compare)) {
        allRejected.push({line:item.line,reasonId});
      }
      continue;
    }
    const candidate=item.candidate;
    const reasons=[...new Set([...reviewReasons(candidate),...item.reviewFlags])].sort(compare);
    candidates.push({
      ...candidate,
      normalizedLemma:{
        pl:lemmaKey(candidate.plLemma,'pl'),
        en:lemmaKey(candidate.enLemma,'en')
      },
      status:'unverified',
      reviewStatus:reasons.length?'review_needed':'accepted_for_human_review',
      reviewReasons:reasons
    });
  }
  candidates.sort((a,b)=>compare(a.proposedCoreId,b.proposedCoreId)||
    compare(a.normalizedLemma.pl,b.normalizedLemma.pl)||
    compare(a.normalizedLemma.en,b.normalizedLemma.en)||
    compare(a.sourceId,b.sourceId));
  const rejectedByLine=new Map();
  for(const item of allRejected) {
    const line=item.line??0;
    const reasons=rejectedByLine.get(line)??new Set();
    reasons.add(item.reasonId);
    rejectedByLine.set(line,reasons);
  }
  const rejectedRows=[...rejectedByLine.entries()].map(([line,reasons])=>{
    const reasonIds=[...reasons].sort(compare);
    return {line,reasonId:reasonIds[0],reasonIds};
  }).sort((a,b)=>a.line-b.line);
  const acceptedCandidates=candidates.filter(item=>item.reviewStatus==='accepted_for_human_review').length;
  const reviewNeeded=candidates.length-acceptedCandidates;
  return {
    schemaVersion:'1.0',
    status:'staging_only',
    counts:{
      inputRecords:rows.length+rejected.length,
      acceptedCandidates,
      reviewNeeded,
      rejected:rejectedRows.length
    },
    candidates,
    rejected:rejectedRows
  };
}

async function loadContracts() {
  const [coreText,schemaText,semanticText,plLexiconText,enLexiconText]=await Promise.all([
    readFile(resolve(PROJECT_ROOT,'data','core','concepts.json'),'utf8'),
    readFile(resolve(PROJECT_ROOT,'schemas','typed-graph-candidate.schema.json'),'utf8'),
    readFile(resolve(PROJECT_ROOT,'schemas','typed-semantic-graph.schema.json'),'utf8'),
    readFile(resolve(PROJECT_ROOT,'languages','pl','lexicon.json'),'utf8'),
    readFile(resolve(PROJECT_ROOT,'languages','en','lexicon.json'),'utf8')
  ]);
  const coreDocument=JSON.parse(coreText);
  const core=createCoreLanguage(coreDocument);
  const candidateSchema=JSON.parse(schemaText);
  const semanticSchema=JSON.parse(semanticText);
  if(JSON.stringify(candidateSchema.$defs.relationEdge.oneOf[0].properties.relation.enum)!==
      JSON.stringify(semanticSchema.$defs.relationName.enum)) {
    fail('Candidate schema relation names differ from the typed graph contract.');
  }
  const activeLemmas={
    pl:indexActiveLexicon(JSON.parse(plLexiconText),'pl'),
    en:indexActiveLexicon(JSON.parse(enLexiconText),'en')
  };
  return {core,coreDocument,candidateSchema,activeLemmas};
}

async function main() {
  const options=parseOptions(process.argv.slice(2));
  const staging=await prepareStagingDirectory();
  const output=resolve(staging,options.outputName);
  if(!isWithin(staging,output)||output===staging)fail('Output must be a file inside typed-graph staging.','unsafe_output_path');
  const {core,coreDocument,candidateSchema,activeLemmas}=await loadContracts();
  const input=await readInput(options.input,options.format);
  const report=buildCandidateReport({...input,core,coreDocument,candidateSchema,activeLemmas});
  const text=JSON.stringify(report,null,2)+'\n';
  if(Buffer.byteLength(text,'utf8')>MAX_OUTPUT_BYTES) {
    fail('Normalized report exceeds the output byte limit.','output_byte_limit_exceeded');
  }
  await writeFile(output,text,{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({counts:report.counts,output:'import-staging/typed-graph/'+options.outputName}));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    console.error([error.code,error.message].filter(Boolean).join(': '));
    process.exitCode=1;
  });
}
