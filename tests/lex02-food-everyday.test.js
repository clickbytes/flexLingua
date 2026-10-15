import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../js/core/engine.js';
import {createRuleAdapter} from '../js/core/grammar.js';
import {createMorphology} from '../js/core/morphology/engine.js';
import {createCoreLanguage} from '../js/core/core-language.js';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [ontology,features,en,pl,eg,pg,emData,pmData,mf]=await Promise.all([
  'data/concepts.json','data/features.json','data/en.json','data/pl.json',
  'data/grammar/en.json','data/grammar/pl.json','data/morphology/en.json',
  'data/morphology/pl.json','data/morphology/features.json'
].map(load));
const core=createCoreLanguage(ontology);
const enMorph=createMorphology(emData,en,mf,{core});
const plMorph=createMorphology(pmData,pl,mf,{core});
const engine=new Engine(ontology,features)
  .registerMorphology(enMorph).registerMorphology(plMorph)
  .registerLanguage(createRuleAdapter(en,eg,{morphology:enMorph}))
  .registerLanguage(createRuleAdapter(pl,pg,{morphology:plMorph}));

const gold=[
  ['food.egg','egg','jajko','an','A girl sees an egg.','Dziewczynka widzi jajko.','jajko'],
  ['food.banana','banana','banan','a','A girl sees a banana.','Dziewczynka widzi banan.','banan'],
  ['food.orange','orange','pomarańcza','an','A girl sees an orange.','Dziewczynka widzi pomarańczę.','pomarańczę'],
  ['food.sandwich','sandwich','kanapka','a','A girl sees a sandwich.','Dziewczynka widzi kanapkę.','kanapkę'],
  ['food.soup','soup','zupa','a','A girl sees a soup.','Dziewczynka widzi zupę.','zupę'],
  ['food.potato','potato','ziemniak','a','A girl sees a potato.','Dziewczynka widzi ziemniak.','ziemniak'],
  ['food.tomato','tomato','pomidor','a','A girl sees a tomato.','Dziewczynka widzi pomidor.','pomidor'],
  ['food.carrot','carrot','marchewka','a','A girl sees a carrot.','Dziewczynka widzi marchewkę.','marchewkę'],
  ['food.onion','onion','cebula','an','A girl sees an onion.','Dziewczynka widzi cebulę.','cebulę'],
  ['food.lemon','lemon','cytryna','a','A girl sees a lemon.','Dziewczynka widzi cytrynę.','cytrynę'],
  ['food.cookie','cookie','ciastko','a','A girl sees a cookie.','Dziewczynka widzi ciastko.','ciastko'],
  ['food.cake','cake','ciasto','a','A girl sees a cake.','Dziewczynka widzi ciasto.','ciasto'],
  ['food.pizza','pizza','pizza','a','A girl sees a pizza.','Dziewczynka widzi pizzę.','pizzę'],
  ['food.pear','pear','gruszka','a','A girl sees a pear.','Dziewczynka widzi gruszkę.','gruszkę'],
  ['food.cucumber','cucumber','ogórek','a','A girl sees a cucumber.','Dziewczynka widzi ogórek.','ogórek'],
  ['food.pancake','pancake','naleśnik','a','A girl sees a pancake.','Dziewczynka widzi naleśnik.','naleśnik'],
  ['object.bottle','bottle','butelka','a','A girl sees a bottle.','Dziewczynka widzi butelkę.','butelkę'],
  ['object.box','box','pudełko','a','A girl sees a box.','Dziewczynka widzi pudełko.','pudełko'],
  ['object.basket','basket','koszyk','a','A girl sees a basket.','Dziewczynka widzi koszyk.','koszyk'],
  ['object.ticket','ticket','bilet','a','A girl sees a ticket.','Dziewczynka widzi bilet.','bilet'],
  ['object.coin','coin','moneta','a','A girl sees a coin.','Dziewczynka widzi monetę.','monetę'],
  ['object.wallet','wallet','portfel','a','A girl sees a wallet.','Dziewczynka widzi portfel.','portfel'],
  ['object.receipt','receipt','paragon','a','A girl sees a receipt.','Dziewczynka widzi paragon.','paragon'],
  ['object.newspaper','newspaper','gazeta','a','A girl sees a newspaper.','Dziewczynka widzi gazetę.','gazetę'],
  ['object.card','card','karta','a','A girl sees a card.','Dziewczynka widzi kartę.','kartę'],
  ['object.plate','plate','talerz','a','A girl sees a plate.','Dziewczynka widzi talerz.','talerz'],
  ['object.spoon','spoon','łyżka','a','A girl sees a spoon.','Dziewczynka widzi łyżkę.','łyżkę'],
  ['object.fork','fork','widelec','a','A girl sees a fork.','Dziewczynka widzi widelec.','widelec']
];

test('LEX-02: 28 authored food and everyday-object senses align across languages',()=>{
  assert.equal(new Set(gold.map(row=>row[0])).size,28);
  for(const [concept,english,polish] of gold) {
    assert.equal(ontology.concepts[concept]?.type,'entity',concept);
    const enLex=en.nouns.find(item=>item.lemma===english&&item.senses.some(s=>s.coreRef.id===concept));
    const plLex=pl.nouns.find(item=>item.lemma===polish&&item.senses.some(s=>s.coreRef.id===concept));
    assert.ok(enLex,`English ${english} -> ${concept}`);
    assert.ok(plLex,`Polish ${polish} -> ${concept}`);
  }
});

test('LEX-02: gold examples preserve concepts through English and Polish analysis',()=>{
  for(const [concept,english,polish,article,enSentence,plSentence,accusative] of gold) {
    const enLex=en.nouns.find(item=>item.lemma===english&&item.senses.some(s=>s.coreRef.id===concept));
    const plLex=pl.nouns.find(item=>item.lemma===polish&&item.senses.some(s=>s.coreRef.id===concept));
    assert.equal(engine.translate({from:'en',to:'pl',text:`The girl sees ${article} ${english}.`}).text,
      plSentence,concept);
    const forward=engine.translate({from:'en',to:'pl',text:`The girl sees ${article} ${english}.`});
    assert.equal(forward.interlingua.roles.theme.concept,concept);
    assert.equal(engine.translate({from:'pl',to:'en',text:`Dziewczynka widzi ${accusative}.`}).text,
      enSentence,concept);
    const reverse=engine.translate({from:'pl',to:'en',text:`Dziewczynka widzi ${accusative}.`});
    assert.equal(reverse.interlingua.roles.theme.concept,concept);
    assert.equal(enMorph.generate({lexemeId:enLex.id,features:{number:'plural'}})[0]?.text,
      enLex.forms.plural,`${english} plural`);
    for(const grammaticalCase of ['nom','gen','dat','acc','inst','loc','voc']) {
      assert.ok(plMorph.generate({lexemeId:plLex.id,features:{number:'singular',case:grammaticalCase}}).length,
        `${polish} singular ${grammaticalCase}`);
      assert.ok(plMorph.generate({lexemeId:plLex.id,features:{number:'plural',case:grammaticalCase}}).length,
        `${polish} plural ${grammaticalCase}`);
    }
  }
});

test('LEX-02: orange fruit and orange color remain distinct lexical readings',()=>{
  const readings=enMorph.analyze({text:'orange'});
  const concepts=new Set(readings.flatMap(reading=>reading.coreRefs.map(ref=>ref.id)));
  assert.ok(concepts.has('food.orange'));
  assert.ok(concepts.has('quality.orange'));
  const fruit=engine.translate({from:'en',to:'pl',text:'The girl sees an orange.'});
  assert.equal(fruit.interlingua.roles.theme.concept,'food.orange');
  const color=engine.translate({from:'en',to:'pl',text:'The girl sees an orange sandwich.'});
  assert.equal(color.interlingua.roles.theme.concept,'food.sandwich');
  assert.deepEqual(color.interlingua.roles.theme.modifiers,[{concept:'quality.orange'}]);
  assert.equal(color.text,'Dziewczynka widzi pomarańczową kanapkę.');
});

test('LEX-02: unsupported food terms are not guessed',()=>{
  assert.equal(engine.tryTranslate({from:'en',to:'pl',text:'The girl sees a dragon.'}).ok,false);
  assert.equal(engine.tryTranslate({from:'pl',to:'en',text:'Dziewczynka widzi smoka.'}).ok,false);
});
