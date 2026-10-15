import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,eg,pg,em,pm,mf]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json',
  'data/morphology/pl.json','data/morphology/features.json'
].map(load));
const core=createCoreLanguage(ontology);
const enMorph=createMorphology(em,en,mf,{core});
const plMorph=createMorphology(pm,pl,mf,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

const batch=[
  ['person.grandmother','grandmother','babcia','a','babcię','babcie'],
  ['person.grandfather','grandfather','dziadek','a','dziadka','dziadkowie'],
  ['person.aunt','aunt','ciocia','an','ciocię','ciocie'],
  ['person.uncle','uncle','wujek','an','wujka','wujkowie'],
  ['person.cousin','cousin','kuzyn','a','kuzyna','kuzyni'],
  ['person.son','son','syn','a','syna','synowie'],
  ['person.daughter','daughter','córka','a','córkę','córki'],
  ['person.teacher','teacher','nauczyciel','a','nauczyciela','nauczyciele'],
  ['person.student','student','student','a','studenta','studenci'],
  ['person.doctor','doctor','lekarz','a','lekarza','lekarze'],
  ['person.friend','friend','przyjaciel','a','przyjaciela','przyjaciele'],
  ['person.neighbor','neighbor','sąsiad','a','sąsiada','sąsiedzi'],
  ['place.room','room','pokój','a','pokój','pokoje'],
  ['place.kitchen','kitchen','kuchnia','a','kuchnię','kuchnie'],
  ['place.shop','shop','sklep','a','sklep','sklepy'],
  ['place.station','station','dworzec','a','dworzec','dworce'],
  ['place.park','park','park','a','park','parki'],
  ['place.hospital','hospital','szpital','a','szpital','szpitale'],
  ['place.office','office','biuro','an','biuro','biura'],
  ['place.library','library','biblioteka','a','bibliotekę','biblioteki'],
  ['object.chair','chair','krzesło','a','krzesło','krzesła'],
  ['object.key','key','klucz','a','klucz','klucze'],
  ['object.cup','cup','kubek','a','kubek','kubki'],
  ['object.car','car','samochód','a','samochód','samochody'],
  ['object.ball','ball','piłka','a','piłkę','piłki'],
  ['object.bag','bag','torba','a','torbę','torby'],
  ['object.bed','bed','łóżko','a','łóżko','łóżka'],
  ['object.bowl','bowl','miska','a','miskę','miski']
];

test('LEX-01: 28 original concepts have aligned Polish and English CORE senses',()=>{
  assert.equal(new Set(batch.map(row=>row[0])).size,28);
  for(const [concept,english,polish] of batch) {
    assert.equal(ontology.concepts[concept]?.type,'entity',concept);
    const enLex=en.nouns.find(item=>item.lemma===english);
    const plLex=pl.nouns.find(item=>item.lemma===polish);
    assert.ok(enLex,`English noun ${english}`);
    assert.ok(plLex,`Polish noun ${polish}`);
    assert.equal(enLex.senses[0].coreRef.id,concept);
    assert.equal(plLex.senses[0].coreRef.id,concept);
  }
});

test('LEX-01: productive noun morphology covers singular/plural cases and both translation directions',()=>{
  for(const [concept,english,polish,article,accusative,pluralNominative] of batch) {
    const enLex=en.nouns.find(item=>item.lemma===english);
    const plLex=pl.nouns.find(item=>item.lemma===polish);
    assert.equal(enMorph.generate({lexemeId:enLex.id,features:{number:'plural'}})[0]?.text,
      enLex.forms.plural,`${english} plural`);
    for(const number of ['singular','plural'])for(const grammaticalCase of
      ['nom','gen','dat','acc','inst','loc','voc']) {
      const forms=plMorph.generate({lexemeId:plLex.id,features:{number,case:grammaticalCase}});
      assert.ok(forms.length,`${polish} ${number}/${grammaticalCase}`);
      if(number==='singular'&&['nom','gen','dat','acc'].includes(grammaticalCase))
        assert.equal(forms[0].text,plLex.forms.singular[grammaticalCase]);
    }
    assert.equal(plMorph.generate({lexemeId:plLex.id,
      features:{number:'plural',case:'nom'}})[0].text,pluralNominative);
    const enToPl=engine.translate({from:'en',to:'pl',text:`The girl sees the ${english}.`});
    assert.equal(enToPl.text,`Dziewczynka widzi ${accusative}.`,concept);
    assert.equal(enToPl.interlingua.roles.theme.concept,concept);
    const plToEn=engine.translate({from:'pl',to:'en',text:`Dziewczynka widzi ${accusative}.`});
    assert.equal(plToEn.text,`A girl sees ${article} ${english}.`,concept);
    assert.equal(plToEn.interlingua.roles.theme.concept,concept);
  }
});

test('LEX-01: unknown nouns remain unsupported instead of receiving guessed concepts',()=>{
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl sees a dragon.'}).ok,false);
  assert.equal(engine.tryTranslate({from:'pl',to:'en',text:'Dziewczynka widzi smoka.'}).ok,false);
});
