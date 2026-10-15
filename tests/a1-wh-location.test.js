import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';

const load=async path=>JSON.parse(await readFile(new URL('../data/'+path,import.meta.url),'utf8'));
const [concepts,features,en,pl,eg,pg]=await Promise.all(
  ['concepts.json','features.json','en.json','pl.json','grammar/en.json','grammar/pl.json'].map(load));
const engine=new Engine(concepts,features)
  .registerLanguage(createRuleAdapter(en,eg)).registerLanguage(createRuleAdapter(pl,pg));

test('SPACE-03: static where and movement destination use separate CORE gaps',()=>{
  for(const [from,to,text,expected,role,kind,concept] of [
    ['pl','en','Gdzie jest ojciec?','Where is a father?','location','state','location'],
    ['en','pl','Where is the father?','Gdzie jest ojciec?','location','state','location'],
    ['pl','en','Dokąd idzie ojciec?','Where does a father go?','destination','event','event.movement.to_destination'],
    ['en','pl','Where does the father go?','Dokąd idzie ojciec?','destination','event','event.movement.to_destination']
  ]) {
    const result=engine.translate({from,to,text});
    assert.equal(result.text,expected,text);
    const question=result.interlingua;
    assert.equal(question.type,'question');
    assert.equal(question.questionType,'wh');
    assert.equal(question.targetRole,role);
    assert.equal(question.proposition.type,kind);
    assert.equal(question.proposition.concept||question.proposition.kind,concept);
    assert.equal(Object.hasOwn(question.proposition.roles,role),false);
    assert.deepEqual(engine.analyze({from:'core',text:JSON.stringify(question)}),question);
    const reread=engine.analyze({from:to,text:result.text});
    assert.equal(reread.targetRole,role);
    assert.equal(Object.hasOwn(reread.proposition.roles,role),false);
  }
});

test('SPACE-03: invalid destination government, WH markers, and word order are refused',()=>{
  for(const [from,text] of [
    ['pl','Do dokąd idzie ojciec?'],
    ['pl','Dokąd ojciec idzie?'],
    ['en','Where does the father go to?'],
    ['en','Where the father goes?'],
    ['pl','Gdzie ojciec jest?']
  ]) {
    assert.equal(engine.tryTranslate({from,to:from==='pl'?'en':'pl',text}).ok,false,text);
  }
  const where=engine.translate({from:'en',to:'core',text:'Where is the father?'}).interlingua;
  const completed=structuredClone(where);
  completed.proposition.roles.location={concept:'structure.house',
    features:{number:'singular',definiteness:'definite'}};
  assert.equal(engine.tryTranslate({from:'core',to:'pl',text:JSON.stringify(completed)}).ok,false);
});
