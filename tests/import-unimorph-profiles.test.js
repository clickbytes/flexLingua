import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importUniMorph,validateUniMorphProfile} from '../tools/importers/unimorph.mjs';

const readJson=async url=>JSON.parse(await readFile(new URL(url,import.meta.url),'utf8'));
const [polish,featureProfiles,profilePl,core]=await Promise.all([
  readJson('../data/pl.json'),readJson('./fixtures/language-feature-profiles.json'),
  readJson('./fixtures/unimorph-profile-pl.json'),readJson('../data/concepts.json')
]);

test('profile supplies a new language mapping for ERG and ABS without importer edits',async()=>{
  const featureProfile={...featureProfiles.tenCase,language:'qaa'};
  const profile={version:'1.0',language:'qaa',conflictPolicy:'review',
    posTags:{N:'nouns'},
    tags:{SG:{feature:'number',value:'singular'},
      ERG:{feature:'case',value:'erg'},ABS:{feature:'case',value:'abs'}},
    unsupportedTags:[],featureProfile};
  const lexicon=structuredClone(polish);
  lexicon.language='qaa';
  const tsv=await readFile(new URL('./fixtures/unimorph-ergative-sample.tsv',import.meta.url),'utf8');
  const result=importUniMorph({tsv,profile,lexicon,core,source:'self-authored synthetic fixture',
    license:'project-authored test data'});
  assert.equal(result.language,'qaa');
  assert.equal(result.status,'staging');
  assert.equal(result.candidates.length,2);
  assert.deepEqual(result.candidates.map(item=>item.features.case),['erg','abs']);
  assert.ok(result.candidates.every(item=>item.verified===false &&
    item.coreRefs[0].id==='animal.cat'));
});

test('mapping values outside a language profile are rejected, not imported',()=>{
  const profile={version:'1.0',language:'qac',conflictPolicy:'review',posTags:{N:'nouns'},
    tags:{ERG:{feature:'case',value:'erg'}},unsupportedTags:[],
    featureProfile:{...featureProfiles.zeroCase,language:'qac'}};
  assert.throws(()=>validateUniMorphProfile(profile),/outside its declared language profile/);
});

test('unknown, declared unsupported, and conflicting tags remain review items',()=>{
  const rows=['kot\tkota\tN;SG;ABL','kot\tkoty\tN;SG;XFEATURE',
    'kot\tkotami\tN;SG;PL;DAT'].join('\n');
  const result=importUniMorph({tsv:rows,profile:profilePl,lexicon:polish,core,
    source:'self-authored fixture',license:'test data'});
  assert.deepEqual(result.review.map(item=>item.reason),
    ['unsupported_tags','unknown_tags','conflicting_tags']);
  assert.equal(result.candidates.length,0);
});

test('a lexeme with an unresolved CORE reference is sent to review',()=>{
  const lexicon=structuredClone(polish);
  lexicon.nouns.find(item=>item.lemma==='kot').senses[0].coreRef={kind:'concept',id:'animal.missing'};
  const result=importUniMorph({tsv:'kot\tkotu\tN;SG;DAT',profile:profilePl,lexicon,core,
    source:'self-authored fixture',license:'test data'});
  assert.equal(result.candidates.length,0);
  assert.equal(result.review[0].reason,'dangling_core_reference');
});

test('ambiguous lemmas are sent to review instead of selecting a lexeme',()=>{
  const lexicon=structuredClone(polish);
  const duplicate=structuredClone(lexicon.nouns.find(item=>item.lemma==='kot'));
  duplicate.id='pl.kot.ambiguous';
  duplicate.senses=duplicate.senses.map((sense,index)=>({...sense,
    id:`pl.kot.ambiguous.sense${index+1}`}));
  lexicon.nouns.push(duplicate);
  const result=importUniMorph({tsv:'kot\tkotu\tN;SG;DAT',profile:profilePl,lexicon,core,
    source:'self-authored fixture',license:'test data'});
  assert.equal(result.candidates.length,0);
  assert.equal(result.review[0].reason,'ambiguous_lemma');
});

test('profile and lexicon language identifiers must agree',()=>{
  assert.throws(()=>importUniMorph({tsv:'kot\tkotu\tN;SG;DAT',profile:profilePl,
    lexicon:{...polish,language:'toy10'},core,source:'fixture',license:'test'}),
  /matching language and CORE packages/);
});
