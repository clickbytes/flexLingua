# flexLingua v1.01 — PL/EN lexical CORE and CORE wire language

The **CORE language** is an explicit machine-readable inventory of *concepts*,
*operators* and *grammatical functions*. It is not Esperanto, English, Polish, or
another written natural language. The wire representation of a statement is a
validated Interlingua JSON document. Semantic graph versions from v1.0 are
unchanged; `1.01` versions **only the lexical model and CORE registry**.

## Source of truth

- `data/concepts.json` holds the existing ontological concepts **plus**
  `coreLanguageVersion`, `operators` and `grammaticalFunctions`.
- `data/en.json`, `data/pl.json` contain `lexicalModel: "1.01"` and every entry
  in `nouns`, `verbs`, `adjectives`, `degrees`, `quantifiers`, `attitudes` and
  `functionWords` declares `senses[].coreRef`.
- `js/core/core-language.js` validates and resolves typed CORE references.
- `js/core/lexicon.js` normalizes dictionaries, indexes lexical meanings and
  validates their references. The **lexeme** retains grammatical properties;
  each **sense** points to exactly one valid CORE entry. Forms are NOT
  independent CORE concepts. Polysemy has multiple sense references.
- `data/tr.json` remains on the v1.0 lexical source format. The shared runtime
  normalizes its existing `concept` fields; it is not marked as migrated.

### Lexeme and sense structure

```json
{
  "id": "en.bank.1",
  "lemma": "bank",
  "forms": {"singular":"bank", "plural":"banks"},
  "senses": [
    {"id":"en.bank.finance.1", "coreRef":{"kind":"concept", "id":"place.financial_institution"}, "priority":2},
    {"id":"en.bank.river.1", "coreRef":{"kind":"concept", "id":"place.riverbank"}, "priority":0}
  ]
}
```

A CORE reference is `{ "kind": "concept|operator|grammaticalFunction", "id": "..." }`.
Some operators additionally require typed parameters, e.g.
`{"kind":"operator","id":"quantifier.exact","parameters":{"value":2}}`.
The runtime rejects unknown references, inconsistent semantic types, invalid
parameters, duplicate lexical/sense IDs and conflicting canonical/legacy fields.
Function words such as `nie`, `and`, `że`, `the` and `that` reference CORE
operators or grammatical functions, rather than inventing ordinary entities.
`that` demonstrates a grammatical item with two distinct lexical senses.

Senses belong to the lexeme, not individual inflected forms. A given word form
can have several grammatical analyses even when it represents the same lexeme.
Noun senses may declare `countability: "mass"|"count"|"both"`; a missing value
is treated as `count` for compatibility. Mass senses license a bare singular
noun across compatible semantic frames, while indefinite portion readings such
as `a coffee` require a separate sense and remain unsupported without one.
The **full morphology paradigm generator and inverse word-form analyzer are NOT
implemented in 1.01**; they are planned for later stages (1.02–1.06).

## API

```js
import { Engine } from './js/core/engine.js';
import { createLexicon } from './js/core/lexicon.js';
import { createCoreLanguage } from './js/core/core-language.js';

const core = createCoreLanguage(conceptsJSON);
core.resolve({kind:'operator',id:'logic.negation'});
const english = createLexicon(englishJSON, {strict:true});
english.validateCore(core);

const items = engine.lookupLexemes({language:'en',lemma:'bank'});
// items[0].senses has two distinct CORE references
const equivalents = engine.lexemesForCore({language:'pl',
  coreRef:{kind:'concept',id:'animal.cat'}});
// equivalents[0].lemma === 'kot'
```

`engine.resolveCoreRef(ref)` queries CORE, and `engine.capabilities().coreLanguage`
reports `{code:'core',version:'1.01',format:'interlingua-json'}`.
`engine.capabilities().languages` still lists the three NATURAL language adapters.

### CORE as source or target

```js
const wire = engine.translate({text:'The girl saw the dog.',from:'en',to:'core'}).text;
const translated = engine.translate({text:wire,from:'core',to:'pl'}).text;
// translated === 'Dziewczynka widziała psa.'
```

CORE input must be a complete, schema-valid Interlingua JSON document. It is
**not** free-form sentences or an invented surface grammar. The decoder enforces
existing semantic validation and rejects unsafe JSON keys and excessive input
size/depth. A source `core` document is already interpreted; word-sense context
hints do not apply. The UI exposes CORE as a selectable format and a sample.

## Migration and validation

```sh
npm run check:lexicon
npm test
node tools/migrate-lexicon.mjs old-lexicon.json migrated-lexicon.json
```

The check command verifies all canonical EN/PL entries against the live CORE
inventory. The migration utility never silently overwrites its input. For
existing v1.0 clients, `createRuleAdapter()` transparently adapts historical
`concept` and `senses[].concept` fields **in memory**; new packaged dictionaries
are authored exclusively with `senses[].coreRef`. Source schema version `1.0`
is retained for grammar compatibility, while `lexicalModel` identifies the
new independent contract.

The existing grammar parser still consumes an internal normalized compatibility
view. As a result, lexicalized grammatical words are CORE-linked but grammar
literals have not yet been entirely converted into token-level lexical analyses.
That integration, productive inflection and rich syntactic analysis belong to
later releases. In particular, this release does not claim complete coverage
of function words, lexicalized constructions or ambiguity in natural language.
