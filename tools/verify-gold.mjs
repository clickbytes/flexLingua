/** Curated, human-authored PL/EN morphology reference cases.
 * Unlike generate -> analyze roundtrips, this checks expected surface forms
 * against a separately recorded oracle, including irregular cells.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCoreLanguage} from '../js/core/core-language.js';
import {createMorphology} from '../js/core/morphology/engine.js';

const CASES=['nom','gen','dat','acc','inst','loc','voc'];
const NUMBERS=['singular','plural'];
const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));

/** Throws at the first mismatch, dangling reference or unsupported cell. */
export function verifyGoldNouns(gold, {core,pl,en}) {
  if(gold?.version!=='1.12' || !Array.isArray(gold.items) || !gold.items.length || gold.items.length>10000)
    throw new Error('Invalid morphology gold corpus version or size.');
  const seen=new Set();
  let cells=0, analyses=0;
  for(const [index,item] of gold.items.entries()){
    assert.ok(item && typeof item.conceptId==='string' && core.resolve({kind:'concept',id:item.conceptId}),`gold row ${index}: bad CORE ID`);
    for(const [language,morph] of [['pl',pl],['en',en]]){
      const record=item[language];
      const lex=morph.lexicon.get(record?.lexemeId);
      assert.ok(lex && lex.senses.some(s=>s.coreRef.id===item.conceptId),`gold ${index} ${language}: dangling lexical CORE sense`);
      assert.ok(!seen.has(record.lexemeId),`duplicate oracle lexeme: ${record.lexemeId}`);
      seen.add(record.lexemeId);
      for(const number of NUMBERS){
        const expected=record[number];
        const list=language==='pl'?CASES.map(c=>[c,expected?.[c]]):[[null,expected]];
        if(language==='pl' && (Object.keys(expected||{}).length!==CASES.length ||
          CASES.some(c=>typeof expected[c]!=='string')))throw new Error(`Incomplete Polish reference paradigm: ${record.lexemeId}`);
        for(const [grammaticalCase,form] of list){
          assert.ok(typeof form==='string' && form.length<128,`Missing gold form: ${record.lexemeId}/${number}/${grammaticalCase}`);
          const features=grammaticalCase?{number,case:grammaticalCase}:{number};
          const generated=morph.generate({lexemeId:record.lexemeId,features}).map(item=>item.text);
          assert.deepEqual(generated,[form],`Wrong generated form for ${record.lexemeId} ${JSON.stringify(features)}`);
          const inverse=morph.analyze({text:form});
          assert.ok(inverse.some(r=>r.lexemeId===record.lexemeId &&
            Object.keys(features).every(k=>r.features[k]===features[k]) &&
            r.coreRefs.some(ref=>ref.id===item.conceptId)),`Missing inverse analysis ${record.lexemeId} ${JSON.stringify(features)}`);
          cells++;analyses++;
        }
      }
    }
  }
  return {languages:['pl','en'],lexemePairs:gold.items.length,lexemes:seen.size,
    validatedCells:cells,inverseCells:analyses};
}

export async function runGoldAudit(){
  const [gold,concepts,features,plData,enData,plSpec,enSpec]=await Promise.all([
    'tests/fixtures/gold-nouns-v1.12.json','data/concepts.json','data/morphology/features.json',
    'data/pl.json','data/en.json','data/morphology/pl.json','data/morphology/en.json'].map(load));
  const core=createCoreLanguage(concepts);
  const pl=createMorphology(plSpec,plData,features,{core});
  const en=createMorphology(enSpec,enData,features,{core});
  return verifyGoldNouns(gold,{core,pl,en});
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify({goldVersion:'1.12',...await runGoldAudit()},null,2));}
  catch(error){console.error(`Gold morphology verification failed: ${error.message}`);process.exitCode=1;}
}
