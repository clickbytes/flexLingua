/** Safe, review-first TSV adapter. Never inserts data into active lexicons.
 * The input is caller-supplied and its source/license are required.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createLexicon} from '../../js/core/lexicon.js';
const TAGS={N:null,V:null,ADJ:null,SG:['number','singular'],PL:['number','plural'],DU:['number','dual'],
  NOM:['case','nom'],GEN:['case','gen'],DAT:['case','dat'],ACC:['case','acc'],INS:['case','inst'],
  LOC:['case','loc'],VOC:['case','voc'],ABL:['case','abl'],PST:['tense','past'],PRS:['tense','present'],FUT:['tense','future'],
  '1':['person','first'],'2':['person','second'],'3':['person','third']};
const POS={N:'nouns',V:'verbs',ADJ:'adjectives'};

export function importUniMorph({tsv,language,lexicon,source,license}) {
  if(typeof tsv!=='string' || tsv.length>15_000_000 || !['en','pl','tr','ar'].includes(language) ||
     lexicon.language!==language || typeof source!=='string' || !source.trim() ||
     typeof license!=='string' || !license.trim())throw new Error('Importer needs bounded input, source and license metadata.');
  const dictionary=createLexicon(lexicon,{strict:lexicon.lexicalModel==='1.01'});
  const data=[],review=[],seen=new Set();
  const rows=tsv.split(/\r?\n/gu);
  if(rows.length>100000)throw new Error('UniMorph input has too many records.');
  for(const [idx,line] of rows.entries()){
    if(!line.trim() || line.startsWith('#'))continue;
    const columns=line.split('\t');
    if(columns.length!==3 || columns.some(s=>!s.trim() || s.length>120)) {
      review.push({line:idx+1,reason:'invalid_columns',raw:line.slice(0,240)});continue;
    }
    const [lemma,text,tagString]=columns;
    const tags=tagString.split(';');
    const pos=tags.find(t=>Object.hasOwn(POS,t));
    const unknown=tags.filter(t=>!Object.hasOwn(TAGS,t));
    if(!pos || unknown.length){review.push({line:idx+1,reason:'unknown_tags',tags});continue;}
    const features={}; let conflict=false;
    for(const tag of tags){const mapping=TAGS[tag];if(!mapping)continue;const [name,val]=mapping;
      if(features[name]!==undefined&&features[name]!==val)conflict=true;
      features[name]=val;
    }
    if(conflict){review.push({line:idx+1,reason:'conflicting_tags',tags});continue;}
    const matches=dictionary.lookup(lemma).filter(x=>x.category===POS[pos]);
    if(matches.length!==1){review.push({line:idx+1,reason:matches.length?'ambiguous_lemma':'unmapped_core_lexeme',lemma});continue;}
    const lex=matches[0];
    const k=JSON.stringify([lex.id,text,features]);
    if(seen.has(k))continue;
    seen.add(k);
    data.push({lexemeId:lex.id,form:text,features,coreRefs:lex.senses.map(s=>s.coreRef),
      source,license,verified:false});
  }
  return {version:'1.11',language,source,license,status:'staging',candidates:data,review,
    statistics:{acceptedForReview:data.length,unmappedOrRejected:review.length}};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const get=key=>args[args.indexOf(key)+1];
  try {
    if(['--language','--input','--out','--license','--source'].some(key=>!args.includes(key)))throw new Error('Usage: --language pl --input forms.tsv --source NAME --license LICENSE --out staging.json');
    const language=get('--language');
    const [tsv,lexicon]=await Promise.all([readFile(get('--input'),'utf8'),readFile(new URL(`../../data/${language}.json`,import.meta.url),'utf8')]);
    const result=importUniMorph({tsv,language,lexicon:JSON.parse(lexicon),source:get('--source'),license:get('--license')});
    await writeFile(get('--out'),JSON.stringify(result,null,2)+'\n','utf8');
    console.log(JSON.stringify(result.statistics));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
