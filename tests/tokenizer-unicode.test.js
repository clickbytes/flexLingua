import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGE_ADAPTER_CONTRACT_VERSION,validateLanguageAdapter}
  from '../js/core/adapter-contract.js';
import {createTextProfile,MAX_SOURCE_TEXT_LENGTH,matchesTokens,sentenceText,tokenize,tokenizeDetailed}
  from '../js/core/text.js';

test('NFC/NFD text tokenizes equivalently and spans point to original UTF-16 offsets',()=>{
  const english=createTextProfile('en');
  const decomposed=tokenizeDetailed('Cafe\u0301.',english);
  const composed=tokenizeDetailed('Caf\u00e9.',english);
  assert.deepEqual(decomposed.tokens,composed.tokens);
  assert.deepEqual(decomposed.tokens,['café']);
  assert.deepEqual(decomposed.spans,[{start:0,end:5}]);
  assert.deepEqual(composed.spans,[{start:0,end:4}]);
  assert.deepEqual(tokenizeDetailed('  Cafe\u0301. ',english).spans,[{start:2,end:7}]);
  const legacy=tokenize('Caf\u00e9.',english);
  assert.deepEqual(legacy,['café']);
  assert.deepEqual(legacy.sourceSpans,[{start:0,end:4}]);
});

test('locale case folding handles Turkish dotted and dotless I',()=>{
  const turkish=tokenizeDetailed('İ I.',createTextProfile('tr'));
  assert.deepEqual(turkish.tokens,['i','ı']);
  assert.equal(matchesTokens(turkish.tokens,0,'İ'),1);
  assert.equal(matchesTokens(turkish.tokens,1,'I'),1);
  assert.equal(sentenceText(['istanbul'],'.','tr'),'İstanbul.');
});

test('Unicode letters, combining marks, and apostrophes remain in lexical tokens',()=>{
  assert.deepEqual(tokenizeDetailed('Z\u0307o\u0301łć.',createTextProfile('pl')).tokens,['żółć']);
  const italian=tokenizeDetailed('l’uomo.',createTextProfile('it'));
  assert.deepEqual(italian.tokens,['l’uomo']);
  assert.deepEqual(italian.spans,[{start:0,end:6}]);
  assert.deepEqual(tokenizeDetailed('ن\u0650.',createTextProfile('ar')).tokens,['ن\u0650']);
  assert.deepEqual(tokenizeDetailed('कि.',createTextProfile('hi')).tokens,['कि']);
});

test('unsupported controls, markup, malformed profiles, and oversized input fail closed',()=>{
  const english=createTextProfile('en');
  for(const input of ['a\u0000b','a\u200bb','<b>word</b>','a,,b']) {
    assert.throws(()=>tokenizeDetailed(input,english));
  }
  assert.throws(()=>tokenizeDetailed('word',{...english,segmenter:'unknown'}),/profile|segment/i);
  assert.throws(()=>createTextProfile('zh',{segmenter:'word'}),/profile|segment/i);
  assert.throws(()=>createTextProfile('zh',{segmentation:'han-word-v1'}),/profile|segment/i);
  assert.throws(()=>tokenizeDetailed('x'.repeat(MAX_SOURCE_TEXT_LENGTH+1),english),error=>
    error.code==='SOURCE_TEXT_SIZE_LIMIT');
});

test('language adapter validates matching text-profile metadata',()=>{
  const textProfile=createTextProfile('tr');
  const adapter={code:'tr',contractVersion:LANGUAGE_ADAPTER_CONTRACT_VERSION,textProfile,
    analyze(){},analyzeCandidates(){},realize(){},validateOntology(){},
    describe:()=>({language:'tr',grammarVersion:'1.0',textProfile})};
  assert.equal(validateLanguageAdapter(adapter).textProfile.locale,'tr');
  assert.throws(()=>validateLanguageAdapter({...adapter,
    describe:()=>({language:'tr',grammarVersion:'1.0',textProfile:createTextProfile('en')})}),
  /text profile/i);
});
