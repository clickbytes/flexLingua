/** Shared browser/Node contract suite, without testing libraries. */
import { Engine } from '../js/core/engine.js';
import { createRuleAdapter } from '../js/core/grammar.js';
import { createFeatureRegistry, unifyFeatures } from '../js/core/features.js';

export function contractTests(engine, fixtures) {
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const configured = modify => {
    const data = clone(fixtures);
    modify(data);
    return new Engine(data.ontology, data.features)
      .registerLanguage(createRuleAdapter(data.en, data.enGrammar))
      .registerLanguage(createRuleAdapter(data.pl, data.plGrammar));
  };
  const eq = (actual, expected) => {
    if (actual !== expected) throw new Error(`Expected: ${JSON.stringify(expected)}; got: ${JSON.stringify(actual)}`);
  };
  const translation = (text, from, to) => engine.translate({ text, from, to });
  const throws = (fn, fragment) => {
    let caught;
    try { fn(); } catch (error) { caught = error; }
    if (!caught || !caught.message.includes(fragment)) {
      throw new Error(`Expected an error containing ${fragment}; got ${caught?.message || 'no error'}`);
    }
  };

  return [
    ['EN → PL: transfer, feminine past agreement', () => eq(
      translation('The girl gave the boy a book.', 'en', 'pl').text,
      'Dziewczynka dała chłopcu książkę.')],
    ['EN → PL: transfer, masculine past agreement and neuter noun', () => eq(
      translation('The boy gave the girl an apple.', 'en', 'pl').text,
      'Chłopiec dał dziewczynce jabłko.')],
    ['EN → PL: prepositional dative construction', () => eq(
      translation('The boy gave a book to the girl.', 'en', 'pl').text,
      'Chłopiec dał dziewczynce książkę.')],
    ['EN → PL: present verb and subject agreement', () => eq(
      translation('The dog sees the cat.', 'en', 'pl').text,
      'Pies widzi kota.')],
    ['EN → PL: past visual perception', () => eq(
      translation('The girl saw the boy.', 'en', 'pl').text,
      'Dziewczynka widziała chłopca.')],
    ['EN → PL: negation triggers genitive of object', () => eq(
      translation('The girl did not see the book.', 'en', 'pl').text,
      'Dziewczynka nie widziała książki.')],
    ['EN → PL: present negation triggers genitive', () => eq(
      translation('The boy does not see the apple.', 'en', 'pl').text,
      'Chłopiec nie widzi jabłka.')],
    ['EN → PL: present GIVE selects imperfective dawać', () => eq(
      translation('The girl gives the boy a book.', 'en', 'pl').text,
      'Dziewczynka daje chłopcu książkę.')],
    ['EN → PL: ambiguous GIVE past offers both Polish aspects', () => {
      const out = translation('The girl gave the boy a book.', 'en', 'pl');
      eq(out.alternatives[0], 'Dziewczynka dawała chłopcu książkę.');
      if (!out.warnings.length) throw new Error('Missing aspect warning');
    }],
    ['PL → EN: missing definiteness is reported, not inserted into meaning', () => {
      const out = translation('Dziewczynka dała chłopcu książkę.', 'pl', 'en');
      eq(out.text, 'A girl gave a boy a book.');
      eq(out.interlingua.roles.agent.features.definiteness, 'unknown');
      eq(out.alternatives[0], 'The girl gave the boy the book.');
      if (!out.warnings.length) throw new Error('Missing definiteness warning');
    }],
    ['PL → EN: Polish alternative word order', () => eq(
      translation('Dziewczynka dała książkę chłopcu.', 'pl', 'en').text,
      'A girl gave a boy a book.')],
    ['PL → EN: negation and past', () => eq(
      translation('Dziewczynka nie widziała książki.', 'pl', 'en').text,
      'A girl did not see a book.')],
    ['PL → EN: present, Polish animate accusative', () => eq(
      translation('Pies widzi kota.', 'pl', 'en').text,
      'A dog sees a cat.')],
    ['PL → EN: article an before apple', () => eq(
      translation('Chłopiec dał dziewczynce jabłko.', 'pl', 'en').text,
      'A boy gave a girl an apple.')],
    ['EN → EN: explicit definiteness survives interlingua', () => eq(
      translation('The girl saw a dog.', 'en', 'en').text,
      'The girl saw a dog.')],
    ['PL: perfective aspect is retained in semantic graph', () => eq(
      engine.analyze({ text: 'Dziewczynka dała chłopcu książkę.', from: 'pl' }).features.aspect,
      'perfective')],
    ['PL: imperfective aspect is retained in semantic graph', () => eq(
      engine.analyze({ text: 'Dziewczynka dawała chłopcu książkę.', from: 'pl' }).features.aspect,
      'imperfective')],
    ['PL: gender agreement is checked', () => throws(
      () => engine.analyze({text:'Dziewczynka dał chłopcu książkę.',from:'pl'}), 'agree')],
    ['EN: incorrect a/an is rejected', () => throws(
      () => translation('The boy saw a apple.', 'en', 'pl'), 'construction')],
    ['EN: unknown vocabulary is rejected', () => throws(
      () => translation('The woman sees the dog.', 'en', 'pl'), 'subject noun')],
    ['EN: unsupported syntactic constructions are rejected', () => throws(
      () => translation('I went home.', 'en', 'pl'), 'subject noun')],
    ['EN: plural subject is parsed and translated', () => eq(
      translation('The girls see the dog.', 'en', 'pl').text, 'Dziewczynki widzą psa.')],
    ['EN: unsupported punctuation is rejected', () => throws(
      () => translation('The dog sees the cat?', 'en', 'pl'), 'Only simple sentences')],
    ['Core: rejects a missing semantic role', () => throws(
      () => engine.realize({
        to: 'en',
        interlingua: {
          version: '0.2', type: 'event', concept: 'event.transfer_possession',
          roles: { agent: { concept: 'person.girl', features: { number:'singular', definiteness:'unknown' } } },
          features: { tense:'past', polarity:'positive', aspect:'unknown' }
        }
      }), 'roles do not match')],
    ['Core: rejects unknown language', () => throws(
      () => translation('The dog sees the cat.', 'en', 'fr'), 'Unsupported language')],
    ['Grammar: adapters report declarative schema v1.0', () => {
      eq(engine.language('en').describe().grammarVersion, '1.0');
      eq(engine.language('pl').describe().grammarVersion, '1.0');
    }],
    ['Grammar JSON: switches preferred English transfer construction', () => {
      const modified = configured(data => {
        data.enGrammar.frames['event.transfer_possession'].linearizations.reverse();
      });
      eq(modified.translate({ text: 'Dziewczynka dała chłopcu książkę.', from: 'pl', to: 'en' }).text,
        'A girl gave a book to a boy.');
      eq(modified.analyze({ text: 'The girl gave a book to the boy.', from: 'en' }).concept,
        'event.transfer_possession');
    }],
    ['Grammar JSON: supports verb-subject-complements order without custom JS', () => {
      const modified = configured(data => {
        data.plGrammar.frames['event.visual_perception'].linearizations[0] = ['@verb','agent','theme'];
      });
      eq(modified.translate({ text: 'The girl saw the dog.', from: 'en', to: 'pl' }).text,
        'Widziała dziewczynka psa.');
      eq(modified.analyze({ text: 'Widziała dziewczynka psa.', from: 'pl' }).roles.agent.concept,
        'person.girl');
    }],
    ['Grammar JSON: alternative polarity-marker configuration is interpreted', () => {
      const modified = configured(data => {
        for (const rule of data.enGrammar.verb.rules) {
          if (rule.polarity === 'negative') {
            rule.prefix = ['never'];
            rule.path = rule.tense === 'past' ? 'forms.past' :
              rule.when?.['subject.number'] === 'plural' ? 'forms.present3pl' : 'forms.present3sg';
          }
        }
      });
      eq(modified.translate({ text: 'Dziewczynka nie widziała psa.', from: 'pl', to: 'en' }).text,
        'A girl never saw a dog.');
      eq(modified.analyze({ text: 'The girl never saw the dog.', from: 'en' }).features.polarity,
        'negative');
    }],
    ['Grammar JSON: changing case alternation changes generated form', () => {
      const modified = configured(data => { data.plGrammar.cases.alternations = []; });
      eq(modified.translate({ text: 'The girl did not see the book.', from: 'en', to: 'pl' }).text,
        'Dziewczynka nie widziała książkę.');
    }],
    ['PL: negative GIVE uses generic accusative-to-genitive case alternation', () => {
      eq(translation('The girl did not give a book to the boy.', 'en', 'pl').text,
        'Dziewczynka nie dała chłopcu książki.');
      eq(engine.analyze({ text: 'Dziewczynka nie dała chłopcu książki.', from: 'pl' }).features.polarity,
        'negative');
    }],
    ['Grammar JSON: changing aspect default changes first output without changing semantics', () => {
      const modified = configured(data => {
        data.plGrammar.verb.preferredAspects['event.transfer_possession'] = 'imperfective';
      });
      const result = modified.translate({ text: 'The girl gave the boy a book.', from: 'en', to: 'pl' });
      eq(result.text, 'Dziewczynka dawała chłopcu książkę.');
      eq(result.interlingua.features.aspect, 'unknown');
      eq(result.alternatives[0], 'Dziewczynka dała chłopcu książkę.');
    }],
    ['Lexicon: adding a noun needs only concepts and dictionary records', () => {
      const modified = configured(data => {
        data.ontology.concepts['object.lamp'] = { type: 'entity', parent: 'physical_object', label: 'lamp' };
        data.en.nouns.push({ id: 'en.lamp.1', concept: 'object.lamp', lemma: 'lamp',
          forms: { singular: 'lamp', plural: 'lamps' }, indefiniteArticle: 'a' });
        data.pl.nouns.push({ id: 'pl.lampa.1', concept: 'object.lamp', lemma: 'lampa',
          gender: 'feminine', forms: { singular: {
            nom: 'lampa', gen: 'lampy', dat: 'lampie', acc: 'lampę'
          }, plural: { nom: 'lampy', gen: 'lamp', dat: 'lampom', acc: 'lampy' } } ,
          pluralClass: 'nonvirile' });
      });
      eq(modified.translate({ text: 'The girl saw the lamp.', from: 'en', to: 'pl' }).text,
        'Dziewczynka widziała lampę.');
      eq(modified.translate({ text: 'Lampa widziała psa.', from: 'pl', to: 'en' }).text,
        'A lamp saw a dog.');
    }],
    ['Interlingua: realization does not mutate known or unknown features', () => {
      const meaning = engine.analyze({ text: 'Dziewczynka dała chłopcu książkę.', from: 'pl' });
      const before = JSON.stringify(meaning);
      engine.realize({ interlingua: meaning, to: 'en' });
      engine.realize({ interlingua: meaning, to: 'pl' });
      eq(JSON.stringify(meaning), before);
    }],
    ['Grammar: rejects mismatched language descriptors', () => throws(() => {
      createRuleAdapter(fixtures.en, fixtures.plGrammar);
    }, 'mismatch')],
    ['Grammar: rejects unsupported grammar version', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.version = '0.2';
      createRuleAdapter(fixtures.en, g);
    }, 'version')],
    ['Grammar: rejects unsafe paths in JSON', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.verb.rules[0].path = 'forms.__proto__.constructor';
      createRuleAdapter(fixtures.en, g);
    }, 'Unsafe')],
    ['Grammar: rejects duplicate rule combinations', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.verb.rules.push(clone(g.verb.rules[0]));
      createRuleAdapter(fixtures.en, g);
    }, 'Duplicate')],
    ['Grammar: rejects malformed linearization steps', () => throws(() => {
      const g = clone(fixtures.plGrammar);
      g.frames['event.visual_perception'].linearizations[0] = ['theme','@verb', 123];
      createRuleAdapter(fixtures.pl, g);
    }, 'linearizations')],
    ['Grammar: validates role mappings against ontology before registration', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.frames['event.transfer_possession'].linearizations[0] = ['agent', '@verb', 'theme'];
      new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(fixtures.en, g));
    }, 'Linearization roles')],
    ['Grammar: invalid adjective-like tokens are rejected rather than dropped', () => throws(
      () => translation('The girl saw the black dog.', 'en', 'pl'), 'construction')],
    ['EN: indefinite article must match lexical form in subject NP', () => throws(
      () => translation('An girl saw the dog.', 'en', 'pl'), 'subject noun')],
    ['Grammar: entirely new language code can use generic interpreter', () => {
      const dictionary = clone(fixtures.en);
      const grammar = clone(fixtures.enGrammar);
      dictionary.language = 'toy';
      grammar.language = 'toy';
      const toyEngine = new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(dictionary, grammar));
      eq(toyEngine.translate({ text: 'The dog sees the cat.', from: 'toy', to: 'toy' }).text,
        'The dog sees the cat.');
    }],
    ['Grammar: rejects unknown noun feature placeholders', () => throws(() => {
      const g = clone(fixtures.plGrammar);
      g.nounPhrase.path = 'forms.singular.{unknownFeature}';
      createRuleAdapter(fixtures.pl, g);
    }, 'placeholder')],
    ['Grammar: rejects unknown verb feature placeholders', () => throws(() => {
      const g = clone(fixtures.plGrammar);
      g.verb.rules[0].path = 'forms.past.singular.{unknownFeature}';
      createRuleAdapter(fixtures.pl, g);
    }, 'placeholder')],
    ['PLURAL: feminine third-person past agreement', () => eq(
      translation('The girls saw the boys.', 'en', 'pl').text,
      'Dziewczynki widziały chłopców.')],
    ['PLURAL: masculine personal past agreement', () => eq(
      translation('The boys saw the girls.', 'en', 'pl').text,
      'Chłopcy widzieli dziewczynki.')],
    ['PLURAL: masculine personal past GIVE agreement', () => eq(
      translation('The boys gave the girls apples.', 'en', 'pl').text,
      'Chłopcy dali dziewczynkom jabłka.')],
    ['PLURAL: present tense plural verb agreement', () => eq(
      translation('The girls see the dogs.', 'en', 'pl').text,
      'Dziewczynki widzą psy.')],
    ['PLURAL: present GIVE has plural dative and accusative', () => eq(
      translation('The boys give the girls apples.', 'en', 'pl').text,
      'Chłopcy dają dziewczynkom jabłka.')],
    ['PLURAL: English present negative uses do not', () => eq(
      translation('Dziewczynki nie widzą kotów.', 'pl', 'en').text,
      'Girls do not see cats.')],
    ['PLURAL: English past negative uses did not', () => eq(
      translation('Chłopcy nie widzieli psów.', 'pl', 'en').text,
      'Boys did not see dogs.')],
    ['PLURAL: negation selects genitive plural', () => eq(
      translation('The boys did not see the books.', 'en', 'pl').text,
      'Chłopcy nie widzieli książek.')],
    ['PLURAL: negative transfer uses dat and gen plurals', () => eq(
      translation('The boys did not give books to the girls.', 'en', 'pl').text,
      'Chłopcy nie dali dziewczynkom książek.')],
    ['PLURAL: source morphology records numbers per semantic role', () => {
      const meaning = engine.analyze({ text: 'The boys see a cat.', from: 'en' });
      eq(meaning.roles.agent.features.number, 'plural');
      eq(meaning.roles.theme.features.number, 'singular');
      eq(meaning.version, '0.2');
    }],
    ['PLURAL: Polish bare plural leaves definiteness unknown', () => {
      const meaning = engine.analyze({ text: 'Chłopcy widzą dziewczynki.', from: 'pl' });
      eq(meaning.roles.agent.features.definiteness, 'unknown');
      eq(meaning.roles.theme.features.number, 'plural');
      eq(engine.realize({ to: 'en', interlingua: meaning }).text, 'Boys see girls.');
    }],
    ['PLURAL: bare English plural noun is allowed but bare singular is rejected', () => {
      eq(translation('Girls saw cats.', 'en', 'pl').text, 'Dziewczynki widziały koty.');
      throws(() => translation('Girl saw a cat.', 'en', 'pl'), 'construction');
    }],
    ['AGREEMENT: singular noun cannot take plural English present', () => throws(
      () => engine.analyze({ text: 'The girl see the dog.', from: 'en' }), 'agree')],
    ['AGREEMENT: plural noun cannot take singular English present', () => throws(
      () => engine.analyze({ text: 'The girls sees the dog.', from: 'en' }), 'agree')],
    ['AGREEMENT: Polish virile plural rejects nonvirile past form', () => throws(
      () => engine.analyze({ text: 'Chłopcy widziały dziewczynki.', from: 'pl' }), 'agree')],
    ['AGREEMENT: Polish nonvirile plural rejects virile past form', () => throws(
      () => engine.analyze({ text: 'Dziewczynki widzieli chłopców.', from: 'pl' }), 'agree')],
    ['MORPHOLOGY: plural rejects singular indefinite article', () => throws(
      () => engine.analyze({ text: 'A girls saw the dog.', from: 'en' }), 'construction')],
    ['MORPHOLOGY: Polish unexpected dative object is rejected', () => throws(
      () => engine.analyze({ text: 'Chłopcy nie widzieli książkom.', from: 'pl' }), 'construction')],
    ['INTERLINGUA: malformed plurality is rejected by generic registry', () => throws(() => {
      const meaning = clone(engine.analyze({ text: 'The girls saw the dog.', from: 'en' }));
      meaning.roles.agent.features.number = 'bogus';
      engine.realize({ to: 'pl', interlingua: meaning });
    }, 'feature: number')],
    ['INTERLINGUA: arbitrary new participant field is rejected', () => throws(() => {
      const meaning = clone(engine.analyze({ text: 'The girls saw the dog.', from: 'en' }));
      meaning.roles.agent.features.case = 'nom';
      engine.realize({ to: 'pl', interlingua: meaning });
    }, 'participant')],
    ['LINEARIZATION: SOV (object before verb) requires only JSON', () => {
      const modified = configured(data => {
        data.plGrammar.frames['event.visual_perception'].linearizations[0] = ['agent','theme','@verb'];
      });
      eq(modified.translate({ text:'The girl saw a dog.', from:'en', to:'pl' }).text,
        'Dziewczynka psa widziała.');
      eq(modified.analyze({ text:'Dziewczynka psa widziała.', from:'pl' }).roles.theme.concept,
        'animal.dog');
    }],
    ['LINEARIZATION: OVS (object-verb-subject) requires only JSON', () => {
      const modified = configured(data => {
        data.plGrammar.frames['event.visual_perception'].linearizations[0] = ['theme','@verb','agent'];
      });
      eq(modified.translate({ text:'The boy saw the cat.', from:'en', to:'pl' }).text,
        'Kota widział chłopiec.');
      eq(modified.analyze({ text:'Kota widział chłopiec.', from:'pl' }).roles.agent.concept,
        'person.boy');
    }],
    ['LINEARIZATION: subject-verb agreement works even when subject follows verb', () => {
      const modified = configured(data => {
        data.plGrammar.frames['event.visual_perception'].linearizations[0] = ['@verb','theme','agent'];
      });
      eq(modified.translate({ text:'The boys saw the girls.', from:'en', to:'pl' }).text,
        'Widzieli dziewczynki chłopcy.');
      eq(modified.analyze({ text:'Widzieli dziewczynki chłopcy.', from:'pl' }).roles.agent.features.number,
        'plural');
      throws(() => modified.analyze({ text:'Widziały dziewczynki chłopcy.', from:'pl' }), 'agree');
    }],
    ['AGREEMENT: changing lexical plural class changes realization without JS changes', () => {
      const modified = configured(data => {
        data.pl.nouns.find(noun => noun.senses.some(sense => sense.coreRef?.id === 'person.boy')).pluralClass = 'nonvirile';
      });
      eq(modified.translate({ text:'The boys saw the cats.', from:'en', to:'pl' }).text,
        'Chłopcy widziały koty.'); // Deliberately wrong Polish, demonstrates declarative rule.
    }],
    ['REGISTRY: new number category dual via JSON and forms alone', () => {
      const modified = configured(data => {
        data.features.domains.participant.number.push('dual');
        data.en.nouns.find(noun => noun.senses.some(sense => sense.coreRef?.id === 'animal.dog')).forms.dual = 'dodogs';
        data.enGrammar.nounPhrase.determiners.dual = {
          definite: { literal: 'the' }, indefinite: { omit: true }
        };
        data.enGrammar.verb.rules.push({ tense:'present', polarity:'positive',
          when: {'subject.number':'dual'}, prefix: [], path:'forms.present3pl' });
        data.enGrammar.verb.rules.push({ tense:'present', polarity:'negative',
          when: {'subject.number':'dual'}, prefix:['do','not'], path:'forms.base' });
      });
      const meaning = modified.analyze({ text:'The dodogs see a cat.', from:'en' });
      eq(meaning.roles.agent.features.number, 'dual');
      eq(modified.realize({ interlingua: meaning, to: 'en' }).text, 'The dodogs see a cat.');
    }],
    ['REGISTRY: new tense future via JSON and form rules alone', () => {
      const modified = configured(data => {
        data.features.domains.event.tense.push('future');
        data.enGrammar.verb.rules.push({ tense:'future', polarity:'positive',
          when: {}, prefix:['will'], path:'forms.base' });
      });
      const meaning = modified.analyze({ text:'The dog will see the cat.', from:'en' });
      eq(meaning.features.tense, 'future');
      eq(modified.realize({ interlingua: meaning, to: 'en' }).text, 'The dog will see the cat.');
    }],
    ['GRAMMAR: missing verb slot is rejected at registration', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.frames['event.visual_perception'].linearizations[0] = ['agent','theme'];
      new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(fixtures.en,g));
    }, 'Linearization roles')],
    ['GRAMMAR: repeated role is rejected at registration', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.frames['event.visual_perception'].linearizations[0] = ['agent','@verb','agent'];
      new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(fixtures.en,g));
    }, 'Linearization roles')],
    ['GRAMMAR: unsafe literal token is rejected', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.frames['event.visual_perception'].linearizations[0].push('@__proto__');
      createRuleAdapter(fixtures.en,g);
    }, 'linearizations')],
    ['GRAMMAR: noun forms must encode the number feature', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.nounPhrase.path = 'forms.singular';
      createRuleAdapter(fixtures.en,g);
    }, 'noun form placeholder')],
    ['GRAMMAR: unknown subject agreement dependency is rejected', () => throws(() => {
      const g = clone(fixtures.plGrammar);
      g.verb.agreement.subjectPluralClass = 'subject.unknownKey';
      new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(fixtures.pl,g));
    }, 'Unknown agreement source')],
    ['GRAMMAR: case alternations cannot require unknown subject state', () => throws(() => {
      const g = clone(fixtures.plGrammar);
      g.cases.alternations[0].when = {'subject.number':'plural'};
      createRuleAdapter(fixtures.pl,g);
    }, 'event.*')],
    ['GRAMMAR: condition value must be in the feature registry', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.verb.rules[1].when['subject.number'] = 'quartet';
      new Engine(fixtures.ontology, fixtures.features).registerLanguage(createRuleAdapter(fixtures.en,g));
    }, 'Unknown conditional feature')],
    ['GRAMMAR: invalid lexical agreement class is rejected', () => throws(() => {
      const data = clone(fixtures);
      data.pl.nouns[0].pluralClass = 'impossible';
      new Engine(data.ontology, data.features).registerLanguage(createRuleAdapter(data.pl,data.plGrammar));
    }, 'Invalid lexical pluralClass')],
    ['GRAMMAR: duplicate verb rule despite reordered condition properties is rejected', () => throws(() => {
      const g = clone(fixtures.enGrammar);
      g.verb.rules.push(clone(g.verb.rules[1]));
      createRuleAdapter(fixtures.en,g);
    }, 'Duplicate verb rule')],
    ['Semantics v0.4: inherited event frames remain analyzable', () => {
      eq(engine.ontology.isA('event.visual_perception', 'event.perception'), true);
      eq(engine.ontology.frameRoles('event.visual_perception').join(','), 'agent,theme');
    }],
    ['Semantics v0.4: ambiguous lexeme exposes two readings', () => {
      const readings = engine.analyzeCandidates({ text:'The girl saw a bank.', from:'en' });
      eq(readings.length, 2);
      eq(readings[0].interlingua.roles.theme.concept, 'place.financial_institution');
      eq(readings[1].interlingua.roles.theme.concept, 'place.riverbank');
    }],
    ['Semantics v0.4: explicit context chooses the river reading', () => eq(
      engine.translate({text:'The girl saw a bank.',from:'en',to:'pl',
        context:{senses:{theme:'place.riverbank'}}}).text,
      'Dziewczynka widziała brzeg.')],
    ['Semantics v0.4: topic hints can reorder senses without rewriting grammar', () => eq(
      engine.translate({text:'The girl saw a bank.',from:'en',to:'pl',
        context:{topics:['place.river']}}).text,
      'Dziewczynka widziała brzeg.')],
    ['Semantics v0.4: synonym lexemes map to the same concept', () => eq(
      engine.analyze({text:'The hound saw the girl.',from:'en'}).roles.agent.concept,
      'animal.dog')],
    ['Semantics v0.4: multiple events share one structured discourse', () => {
      const result = engine.translate({ text:'The girl saw the dog. The boy gave the girl an apple.',
        from:'en', to:'pl' });
      eq(result.text,'Dziewczynka widziała psa. Chłopiec dał dziewczynce jabłko.');
      eq(result.interlingua.type,'discourse');
      eq(result.interlingua.events.length,2);
    }],
    ['Semantics v0.4: discourse does not hallucinate shared referents', () => {
      const doc = engine.analyze({text:'The girl saw the dog. The girl saw the cat.',from:'en'});
      if (doc.events[0].roles.agent === doc.events[1].roles.agent)
        throw new Error('Unjustified coreference in discourse.');
    }],
    ['Semantics v0.4: sense candidates do not contaminate morphology', () => {
      const out = engine.translate({text:'The boys did not see the banks.',from:'en',to:'pl'});
      eq(out.text,'Chłopcy nie widzieli banków.');
      eq(out.semanticAlternatives[0].text,'Chłopcy nie widzieli brzegów.');
    }],
    ['V1: three registered language adapters expose real capabilities', () => {
      eq(engine.capabilities().interlinguaVersion, '1.0');
      eq(engine.capabilities().languages.length, 3);
      eq(engine.language('tr').describe().support.relativeClauses, false);
    }],
    ['V1: EN → TR SOV with accusative object', () => eq(
      translation('The girl saw the dog.', 'en', 'tr').text, 'Kız köpeği gördü.')],
    ['V1: TR → PL semantic roles survive', () => eq(
      translation('Kız oğlana kitabı verdi.', 'tr', 'pl').text,
      'Dziewczynka dała chłopcu książkę.')],
    ['V1: TR object distinguishes definite vs indefinite without an article', () => {
      eq(engine.analyze({text:'Kız köpeği gördü.',from:'tr'}).roles.theme.features.definiteness, 'definite');
      eq(engine.analyze({text:'Kız köpek gördü.',from:'tr'}).roles.theme.features.definiteness, 'indefinite');
    }],
    ['V1: propositional complement parses a nested event', () => {
      const doc = engine.analyze({text:'The girl believes that the boy saw the dog.',from:'en'});
      eq(doc.type, 'complement');
      eq(doc.concept, 'event.belief');
      eq(doc.content.roles.theme.concept, 'animal.dog');
      eq(engine.realize({interlingua:doc,to:'pl'}).text,
        'Dziewczynka wierzy, że chłopiec widział psa.');
    }],
    ['V1: explicit scope of negation over a universal subject', () => {
      const wide = engine.analyze({text:'It is not true that all the girls saw the dog.',from:'en'});
      const narrow = engine.analyze({text:'All the girls did not see the dog.',from:'en'});
      eq(wide.type, 'scope');
      eq(wide.operand.roles.agent.quantifier.kind, 'universal');
      eq(narrow.type, 'event');
      eq(narrow.features.polarity, 'negative');
    }],
    ['V1: safe API returns a structured unsupported language diagnostic', () => {
      const failure = engine.tryTranslate({text:'The girl saw the dog.',from:'en',to:'xx'});
      eq(failure.ok, false);
      eq(failure.error.code, 'UNSUPPORTED_LANGUAGE');
    }],
    ['Round-trip: fixed semantic roles survive EN → PL → EN', () => {
      const meaning = engine.analyze({ text: 'The girl gave a book to the boy.', from: 'en' });
      const polish = engine.realize({ interlingua: meaning, to: 'pl' }).text;
      const result = engine.analyze({ text: polish, from: 'pl' });
      eq(result.roles.agent.concept, meaning.roles.agent.concept);
      eq(result.roles.recipient.concept, meaning.roles.recipient.concept);
      eq(result.roles.theme.concept, meaning.roles.theme.concept);
      eq(result.features.tense, meaning.features.tense);
    }]
  ];
}
