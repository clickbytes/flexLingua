# flexLingua v1.12 — curated vocabulary, morphology gold oracle, PL/EN

## Scope and guarantees

- 14 **new parallel nouns per language**, **28 newly added lexemes**, with **15 distinct CORE senses** (mouse has two: animal vs computer device).
- 17 new CORE ontology entries (including categories), with all new lexical senses referencing existing CORE IDs.
- 4 JSON paradigms: `pl.noun.masc_inanimate_hard`, `pl.noun.neuter_o_plain`, `pl.noun.feminine_sz`, `en.noun.consonant_y`. Individual stem alternations and lexical exceptions remain JSON data.
- Full **seven-case singular + seven-case plural** reference forms for those 14 selected Polish nouns; two number forms for corresponding English nouns. **224 oracle cases total**, plus independent inverse/core-reference checks.
- Existing PL/EN/legacy-TR translation corpus is unchanged; the new lexemes can participate in the existing controlled-language sentence structures.

This is **not a general Polish or English dictionary**. The core dictionary's `senses[].coreRef` is mandatory for active PL/EN lexemes. Additional meanings of a word are represented as distinct lexical senses; grammatical ambiguity is analyzed separately.

## Data architecture

```text
PL/EN data/{pl,en}.json
  lexeme (lemma + lexical properties, no forms for these new nouns)
    → senses[] → CORE / data/concepts.json
    → id → morphology binding / data/morphology/{pl,en}.json
                → paradigm (inheritance) + stem(s) + exception overrides
                   → generator AND inverse form index

Controlled grammar adapter / js/core/grammar.js
   → morphology materialization for the new lexemes
   → parse and realize semantic frames and noun phrases
```

Data files remain ordinary JSON and the browser build remains fully static. For older applications that register a language adapter *without* morphology, a lexeme with no stored `forms` is not activated for grammatical parsing: existing lexemes keep working but new words cannot be guessed from a lemma alone. `createLexicon()` still includes these words and validates their CORE references regardless of whether morphology was supplied.

## Curated noun concepts and paradigms

| EN | PL | CORE | Main behavior |
|---|---|---|---|
| house | dom | `structure.house` | inanimate hard plural, locative override |
| bicycle | rower | `object.bicycle` | hard plural, `rowerze` |
| phone | telefon | `object.phone` | hard plural, regular `telefonie` |
| garden | ogród | `place.garden` | alternating stem, `ogrodzie` |
| table | stół | `object.table` | `stół/stołu/stole` |
| forest | las | `place.forest` | `las/lasu/lesie` |
| mother | mama | `person.mother` | feminine -a, `mamie` |
| school | szkoła | `institution.school` | feminine -a, `szkół` |
| river | rzeka | `place.river` | velar alternation, `rzece` |
| window | okno | `object.window` | neuter -o, `okien` |
| tree | drzewo | `plant.tree` | neuter -o, genitive plural `drzew` |
| city | miasto | `place.city` | `mieście`, English `cities` |
| mouse | mysz | `animal.mouse`, `device.computer_mouse` | feminine consonant; English `mice` |
| woman | kobieta | `person.woman` | `kobiecie`, English `women` |

The new lexical entries do *not* include hand-enumerated `forms`: they point to morphology bindings and exceptions. Some gender and case behaviors are language-specific; CORE stores meaning, not these inflectional details.

## Independent gold corpus

`tests/fixtures/gold-nouns-v1.12.json` contains manually recorded forms, **not a dump of the generator output**. It acts as a reference set for the *declared words and cells only*. `npm run check:gold` verifies, for every case:

1. the source lexeme exists and its designated sense resolves through CORE;
2. the generator produces exactly the expected form;
3. the inverse index yields that lexeme with matching features and CORE linkage;
4. no lexeme IDs or mandatory paradigm cells are missing from the fixture.

The test also intentionally mutates a correct form to ensure the oracle detects disagreements. Word forms are descriptive linguistic facts; this dataset is independently entered, not an automated copy or redistribution of external lexicon entries. For spot checks of difficult alternations, compare authoritative morphology pages, e.g. [WSJP PAN `ogród`](https://wsjp.pl/haslo/podglad/489/ogrod), [WSJP PAN `stół`](https://wsjp.pl/haslo/podglad/7994/stol/5084073/mebel) and [Wikisłownik `mysz`](https://pl.wiktionary.org/wiki/mysz). Usage variants and dialectal exceptions may require further work. The gold corpus is deliberately bounded, not proof of universal linguistic coverage.

## Example

```js
// Requires the PL/EN core, morphology and language adapters to be registered.
engine.inflect({
  language:'pl', lexemeId:'pl.ogrod.1',
  features:{number:'singular',case:'loc'}
}); // [{text:'ogrodzie', source:'exception', coreRefs:[...], ...}]

engine.resolveWord({language:'en',text:'mice'});
// possible CORE senses: animal.mouse and device.computer_mouse

engine.translate({
  text:'The girl saw the garden.',from:'en',to:'pl'
}).text;
// 'Dziewczynka widziała ogród.'
```

## Next work

- Expand verb paradigms beyond the current third-person/limited tense inventory and adjectives beyond the supported cases.
- Separate a shared ontology mapping for all function words and all multiword expressions, rather than treating context as a word-substitution rule.
- Add a provenance/review status per imported lexeme/sense and automatic comparison to independent licensed dictionaries.
- Add new typologically diverse languages without weakening CORE type checks or overfitting PL/EN behavior.
