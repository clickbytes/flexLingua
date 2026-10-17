import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {validateInterlingua} from '../js/core/interlingua.js';

const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const [fixture,concepts,features,english,englishGrammar]=await Promise.all([
  'tests/fixtures/toy-dual-classifier.json','data/concepts.json','data/features.json',
  'data/en.json','data/grammar/en.json'
].map(load));
const [polish,polishGrammar]=await Promise.all(['data/pl.json','data/grammar/pl.json'].map(load));

function createToyEngine(){
  const dictionary=copy(english),grammar=copy(englishGrammar);
  dictionary.language=fixture.language;
  dictionary.nouns=dictionary.nouns.filter(noun=>['girl','book'].includes(noun.lemma));
  dictionary.nouns=dictionary.nouns.map(noun=>({...noun,forms:{...noun.forms,
    dual:noun.lemma==='girl'?'girl-dual':'book-dual'}}));
  const stateFunctions=new Set(['grammar.state_copula','grammar.state_possession','grammar.state_location']);
  dictionary.verbs=dictionary.verbs.filter(verb=>verb.senses.some(sense=>
    sense.coreRef?.id==='event.visual_perception'||stateFunctions.has(sense.coreRef?.id)));
  for(const quantifier of dictionary.quantifiers||[])for(const form of quantifier.forms||[]) {
    form.when={};
  }
  grammar.language=fixture.language;
  delete grammar.passive;
  grammar.nounPhrase.quantity=copy(fixture.quantityModel);
  grammar.nounPhrase.qualified.layouts=grammar.nounPhrase.qualified.layouts.map(layout=>{
    const slots=[...layout],at=slots.indexOf('quantifier');
    slots.splice(at+1,0,'classifier');
    return slots;
  });
  grammar.verb.rules.push({tense:'present',polarity:'positive',
    when:{'subject.person':'third','subject.number':'dual'},prefix:[],path:'forms.present3pl'});
  const featureProfile={version:'1.0',language:fixture.language,
    syntactic:{case:['nom','gen','dat','acc','loc']},
    morphology:{number:['singular','plural','dual']}};
  const engine=new Engine(concepts,features)
    .registerLanguage(createRuleAdapter(english,englishGrammar))
    .registerLanguage(createRuleAdapter(dictionary,grammar,{featureProfile}))
    .registerLanguage(createRuleAdapter(polish,polishGrammar));
  return {engine,dictionary,grammar,featureProfile};
}

test('exact nominal quantity stays semantic while a language profile selects dual and classifier',()=>{
  const {engine}=createToyEngine();
  for(const row of fixture.cases) {
    const result=engine.translate({from:'en',to:fixture.language,text:row.input});
    assert.equal(result.text,row.expected,row.id);
    const reverse=engine.translate({from:fixture.language,to:'core',text:row.expected}).interlingua;
    assert.equal(reverse.version,'1.34',row.id);
    for(const role of ['agent','theme']) {
      assert.deepEqual(reverse.roles[role].quantity,{kind:'exact',value:row.quantity},row.id);
      assert.deepEqual(Object.keys(reverse.roles[role].features),['definiteness'],row.id);
    }
    assert.equal(engine.translate({from:fixture.language,to:'en',text:row.expected}).text,row.input,row.id);
    assert.equal(engine.translate({from:fixture.language,to:'pl',text:row.expected}).text,row.polish,row.id);
  }
  const parsed=engine.translate({from:fixture.language,to:'core',text:fixture.reverse.input});
  assert.deepEqual(parsed.interlingua,fixture.reverse.core);
  assert.equal(engine.translate({from:fixture.language,to:'en',text:fixture.reverse.input}).text,
    fixture.reverse.english);
  assert.doesNotMatch(JSON.stringify(parsed.interlingua),/"number":"dual"|"classifier"/u);
});

test('new exact quantity CORE validates while legacy exact quantifiers remain valid',()=>{
  const {engine}=createToyEngine();
  const newCore=fixture.reverse.core;
  assert.equal(validateInterlingua(newCore,engine.ontology,engine.features),newCore);
  const invalid=copy(newCore);
  invalid.roles.agent.quantity.value=21;
  assert.throws(()=>validateInterlingua(invalid,engine.ontology,engine.features),
    error=>error.code==='INTERLINGUA_INVALID');
  const mixed=copy(newCore);
  mixed.roles.agent.features.number='plural';
  assert.throws(()=>validateInterlingua(mixed,engine.ontology,engine.features),
    error=>error.code==='INTERLINGUA_INVALID');
  const legacy=engine.translate({from:'en',to:'core',text:'Two girls see two books.'}).interlingua;
  assert.equal(legacy.roles.agent.quantifier.value,2);
  assert.equal(legacy.roles.agent.features.number,'plural');
  assert.equal(validateInterlingua(legacy,engine.ontology,engine.features),legacy);
});

test('classifier is licensed by the target package and malformed classifier features fail closed',()=>{
  const {engine,dictionary,grammar,featureProfile}=createToyEngine();
  for(const row of fixture.refusals) {
    assert.equal(engine.tryTranslate({from:fixture.language,to:'core',text:row.input}).ok,false,row.id);
  }
  const invalid=copy(grammar);
  invalid.nounPhrase.quantity.classifiers[0].forms[0].when.case='erg';
  assert.throws(()=>createRuleAdapter(dictionary,invalid,{featureProfile}),/classifier|case|feature/i);
});
