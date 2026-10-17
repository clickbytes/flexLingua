import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {loadLanguagePackage,loadLanguagePackages} from '../tools/language-packages.mjs';
import {compileLanguage} from '../tools/compile-language.mjs';
import {runLexiconAudit} from '../tools/check-lexicon.mjs';
import {runMorphologyAudit} from '../tools/check-morphology.mjs';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(value,null,2)+'\n');
};

async function makeToyDataRoot() {
  const root=await mkdtemp(join(tmpdir(),'flexlingua-language-package-'));
  const source=await loadLanguagePackage('en');
  const packages=structuredClone(source.packages);
  for(const name of ['lexicon','grammar','morphology','morphologyLexicon']) {
    if(packages[name])packages[name].language='qaa';
  }
  if(packages.morphology?.featureProfile)packages.morphology.featureProfile.language='qaa';
  const files={
    core:'concepts.json',lexicon:'qaa.json',grammar:'grammar/qaa.json',
    morphology:'morphology/qaa.json',morphologyLexicon:'qaa.json',
    morphologyFeatures:'morphology/features.json'
  };
  for(const key of Object.keys(files)) {
    if(key==='core' || key==='morphologyFeatures')continue;
    await writeJson(join(root,files[key]),packages[key]);
  }
  await writeJson(join(root,files.core),packages.core);
  await writeJson(join(root,files.morphologyFeatures),packages.morphologyFeatures);
  const manifest=structuredClone(source.manifest);
  manifest.language='qaa';
  manifest.scope='Synthetic package used to verify manifest discovery.';
  manifest.tokenizer.locale='qaa';
  manifest.packages=files;
  manifest.capabilities.directions=[];
  await writeJson(join(root,'languages/qaa.json'),manifest);
  return {root,manifest,packages};
}

test('language manifests report the checked-in package status, tokenizer and real syntax scope',async()=>{
  const schema=await readJson(new URL('../schemas/language-package.schema.json',import.meta.url));
  assert.ok(schema.required.includes('tokenizer'));
  assert.equal(schema.properties.packages.additionalProperties,false);
  const loaded=await loadLanguagePackages();
  const byCode=new Map(loaded.map(item=>[item.manifest.language,item]));
  assert.deepEqual([...byCode.keys()],['ar','en','it','pl','tr']);
  assert.equal(byCode.get('en').manifest.status,'controlled-subset');
  assert.equal(byCode.get('pl').manifest.status,'controlled-subset');
  assert.equal(byCode.get('it').manifest.status,'limited-demo');
  assert.equal(byCode.get('tr').manifest.status,'limited-demo');
  assert.equal(byCode.get('ar').manifest.status,'morphology-only');
  for(const {manifest,packages} of loaded) {
    assert.equal(manifest.tokenizer.locale,manifest.language);
    assert.equal(manifest.capabilities.questions,!!packages.grammar?.questions);
    assert.ok(manifest.capabilities.frames.every(frame=>!frame.startsWith('event.event.')));
  }
  assert.deepEqual(byCode.get('ar').manifest.capabilities.frames,[]);
  assert.equal(byCode.get('ar').manifest.capabilities.parsing,false);
  assert.equal(byCode.get('ar').manifest.capabilities.realization,false);
  assert.equal(byCode.get('tr').manifest.capabilities.questions,false);
  assert.equal(byCode.get('it').manifest.capabilities.questions,false);
});

test('a toy language is discovered by the compiler and both audits without a code list',async t=>{
  const {root}=await makeToyDataRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const loaded=await loadLanguagePackages({dataRoot:root});
  assert.deepEqual(loaded.map(item=>item.manifest.language),['qaa']);
  const result=await compileLanguage('qaa',{dataRoot:root});
  assert.ok(result.compiled);
  assert.equal(result.coverage.language,'qaa');
  const lexicon=await runLexiconAudit({dataRoot:root});
  assert.ok(lexicon.languages.qaa);
  const morphology=await runMorphologyAudit({dataRoot:root});
  assert.ok(morphology.coverage.some(item=>item.language==='qaa'));
});

test('language package loading reports stable version, language and missing-file errors',async t=>{
  const {root,packages}=await makeToyDataRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const grammarPath=join(root,'grammar/qaa.json');
  const badVersion=structuredClone(packages.grammar);
  badVersion.version='9.9';
  await writeJson(grammarPath,badVersion);
  await assert.rejects(loadLanguagePackage('qaa',{dataRoot:root}),
    error=>error.code==='LANGUAGE_PACKAGE_VERSION_MISMATCH');

  await writeJson(grammarPath,packages.grammar);
  const badLanguage=structuredClone(packages.grammar);
  badLanguage.language='pl';
  await writeJson(grammarPath,badLanguage);
  await assert.rejects(loadLanguagePackage('qaa',{dataRoot:root}),
    error=>error.code==='LANGUAGE_PACKAGE_LANGUAGE_MISMATCH');

  await writeJson(grammarPath,packages.grammar);
  const manifestPath=join(root,'languages/qaa.json');
  const manifest=await readJson(manifestPath);
  manifest.packages.grammar='grammar/missing.json';
  await writeJson(manifestPath,manifest);
  await assert.rejects(loadLanguagePackage('qaa',{dataRoot:root}),
    error=>error.code==='LANGUAGE_PACKAGE_FILE_MISSING');
});
