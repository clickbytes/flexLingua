# flexLingua 1.11 — independent, CORE-linked morphology (PL/EN first)

## Architectural contract

```
CORE Concept / Operator / Grammatical Function
                  ↑
            LexicalSense
                  ↑
                Lexeme ────── Paradigm Binding
                  │                 │
                  │            Stems, exceptions
                  │                 │
           Syntactic Planner ──→ Morphology Generator
                  │                 │
                  └───── Surface forms / reverse analyses
```

The CORE lexical model remains `1.01`, the stable semantic graph wire format is still `1.0`, and **morphology is separately versioned `1.11`**. The shared registry `data/morphology/features.json` is version `1.02`; it is separate from `data/features.json` (the version `0.4` semantic compatibility registry).

A **lexeme** represents a language-specific lexical unit, not a surface word. Every canonical PL and EN lexical sense resolves to CORE. Its optional morphology binding is stored in `data/morphology/<lang>.json` with `lexemeId`, `paradigmId`, `stems` and `overrides`. The canonical source dictionary remains the authority for meanings. Morphology results inherit CORE references through that lexeme; they cannot create new concepts by themselves.

**Only the source lemma does not always determine the paradigm.** A lexical entry must store its inflection class and, where necessary, additional stems, inherent features or exceptions. New regular lexemes sharing a class do not require new JS rules.

## What versions 1.02–1.11 actually deliver

| Stage | Implemented in this bounded release | Not claimed |
|---|---|---|
| 1.02 | Morphological feature registry, typed values, limited nested agreement controllers (`subject`, `object`, `possessor`), unification | Complete UniMorph hierarchy |
| 1.03 | JSON paradigms, parent-class inheritance, stems, paradigm slots and finite generation | All morphological categories of every language |
| 1.04 | Declarative append, prepend, strip/replace suffix, stem choice, consonant softening, high/low vowel harmony, simple reduplication, three-consonant root templates | Full phonological or prosodic theory |
| 1.05 | Replacing, blocking and adding variant forms with validated cell identities | Automatic discovery of all exceptions |
| 1.06 | Precomputed inverse form index; returns all candidates for the bounded lexicon | General-purpose FST or out-of-vocabulary inference |
| 1.07 | Generated PL/EN noun, verb and adjective forms supplied to the **existing grammar interpreter**, retaining comparison with legacy tables | Full free-form text parser; arbitrary case/agreement coverage |
| 1.08 | Dependency-free review-first UniMorph-style TSV staging importer and provenance | Imported national dictionaries or bulk automatic CORE mappings |
| 1.09 | Word-form → lexeme → CORE senses, explicit topic-based ranking | General word-sense disambiguation |
| 1.10 | Arabic 3-consonant root/template morphological fixture with a CORE concept | An Arabic sentence parser or translator |
| 1.11 | Versioned JS API, compiler emitting finite form/reading table, coverage reports, inspector, historical offline build and regression tests | A production-scale linguistic platform |

## Data and algorithms

`data/morphology/{pl,en}.json` stores paradigms independent of canonical dictionary `data/{pl,en}.json`. Only **nouns, verbs and adjectives** are currently included in the productive morphology package. Degree markers, quantifiers, function words and finite attitude-predicate constructions continue to use their existing form logic; they remain CORE-linked.

Each paradigm contains a finite list of licensed *feature bundles* (`slots`). A slot specifies the transformation steps and an optional legacy adapter form path. This avoids generating meaningless cartesian products of all features. A subclass can override specific slots while inheriting the others. In a binding, an exception can replace the default output, add an alternative or block a cell. Contradictory overrides are rejected.

Morphology requests may express supported agreement dimensions as flat keys or under the limited `subject`, `object` and `possessor` controllers. If both forms supply the same flattened key, equal values coalesce; conflicting values are rejected regardless of property order. Flattening does not add dimensions: the feature registry still decides which resulting keys are supported.

The interpreter rejects unknown operations, unsafe identifiers, conflicting overrides, impossible feature values, cyclic paradigm inheritance, path injection and oversized inventories. It limits rule steps, slots, lexemes and precomputed forms. The inverse index is built once per package in browser memory. **This is a finite mapping compiler, not a genuine weighted or two-level FST;** replacing it with an optimized backend can be a later stage.

Each operation has a closed argument schema and is validated when a paradigm is registered as well as before direct execution. Missing required values, unexpected fields, and empty values where the operation requires content are rejected before any step runs. `harmonicSuffix` computes only the `A` and `I` vowel-harmony symbols; unsupported macros such as `D` are rejected rather than emitted literally.

### Generation and reverse analysis

```js
import {createCoreLanguage} from './js/core/core-language.js';
import {createMorphology} from './js/core/morphology/engine.js';

const morphology = createMorphology(polishMorphologyJSON, polishLexiconJSON,
  morphologicalFeaturesJSON, {core:createCoreLanguage(coreConceptsJSON)});

morphology.generate({lexemeId:'pl.kot.1',features:{number:'singular',case:'loc'}});
// [{text:'kocie', lexemeId:'pl.kot.1', features:{...}, coreRefs:[...], ...}]

morphology.analyze({text:'koty'});
// Nominative, accusative and vocative plural readings for pl.kot.1.

morphology.paradigm({lexemeId:'pl.kot.1'});
// Lists all supported paradigm cells, including grammatical features and provenance.

morphology.cells({lexemeId:'pl.kot.1'});
// Lists each declared feature cell and path, including cells blocked by an override.
```

`engine.registerMorphology(adapter)` makes `engine.inflect`, `engine.analyzeForm`, `engine.inspectParadigm`, and `engine.resolveWord` available. The latter expands grammatical readings to all lexical senses and uses the same **explicit**, ontology-derived topic hints as the sentence resolver. Scores are heuristics, not probabilities.

The `materializeInflections()` compatibility bridge fills the existing `forms.*` tables with one deterministic surface per path. It checks the first generated surface for each legacy path, preserves ungenerated cells, removes legacy fallback for explicitly blocked cells, and does not mutate the caller's original JSON. `createRuleAdapter(dictionary, grammar, {morphology})` consumes every generated candidate and its feature bundle during sentence analysis; realization uses the first generated candidate in stable paradigm order. Thus `addVariant` forms are parseable without creating new CORE senses. The `createRuleAdapter(dictionary, grammar)` call without morphology remains supported.

### Example: new lexemes with no surface tables

`data/en.json` contains `en.fox.1` with no `forms.plural`. `data/pl.json` contains `pl.lis.1` with no case forms. Both lexemes have CORE `animal.fox`. Binding to `en.noun.sibilant` and `pl.noun.masc_animate` generates `foxes`, `lisa`, `lisowi`, `lisami` etc. The previous sentence analyzer can now translate **The girl saw the fox. → Dziewczynka widziała lisa.** without sentence-pair mappings.

By contrast, forms such as `children`, `went`, Polish `kocie`, or `dzieci` are explicitly represented as exceptions where general patterns are not sufficient.

### Arabic: structural stress fixture

`data/morphology/ar-lexicon.json` contains a single canonical CORE-linked lexeme and `ar.json` contains its root-template paradigm. These exist **solely to verify** that non-concatenative morphology can run through the common API. The application does not offer Arabic as a natural-language translator, and the fixture does not model the full Arabic verbal system.

## Importing lexical forms safely

A CLI adapter takes caller-provided UniMorph-style TSV rows (`lemma<TAB>form<TAB>tags`), looks up existing CORE-linked lexical entries and emits a **staging** JSON with candidate forms and review items:

```sh
node tools/importers/unimorph.mjs \
  --profile /path/to/language-mapping.json \
  --lexicon /path/to/language-lexicon.json \
  --core /path/to/concepts.json \
  --input /path/to/source.tsv \
  --source "source name and edition" --license "verified license" \
  --out reviewed-candidates.json
```

The versioned mapping profile declares `language`, the GEN-07 `featureProfile`,
`posTags`, tag-to-`feature`/`value` mappings, `unsupportedTags`, and the fixed
`conflictPolicy: "review"`. A mapped value must occur in that language's
morphology profile. The importer does not keep a built-in language whitelist or
connect to the Internet. It writes only a new JSON filename under
`import-staging/unimorph/`, after checking every candidate reference against
the supplied CORE package. It refuses directory paths and existing output files,
and never modifies active dictionaries. Unknown or declared unsupported tags,
ambiguous lemmas, conflicting tags, and malformed records go to review.
Every candidate records its source and license and stays `verified: false`;
human verification and actual source rights remain necessary before publication.

## Compiling, validating and reporting coverage

```sh
npm run check:lexicon
npm run check:morphology
node tools/compile-language.mjs pl --output /tmp/flexlingua-pl.json
npm run check:release
```

The coverage report counts **eligible canonical lexemes** of POS noun/verb/adjective that have active morphology bindings in this small dictionary. Full coverage there does *not* imply coverage of every word, every POS, every inflection cell or every construction in Polish and English. Source forms were used as golden checks for legacy slots. Actual linguistic quality should later be evaluated against *independent licensed* paradigms held out from development.

## Important constraints

- The grammar API handles only the controlled sentence constructions previously supported by v1.0, plus these additional nouns.
- Polish noun paradigms here include seven named cases, but *not* all alternations or all possible classes; adjective and verb datasets retain their limited feature slots.
- English irregular past forms and plurals are handled by explicit exceptions; other tense/aspect constructions are not asserted to exist.
- High-vowel harmony and `rootTemplate` are demonstration-level operators; they are not a replacement for a language-complete two-level morphophonological transducer.
- Derivation, open-ended compounding, arbitrary novel-word guessing, prosodic exponents, free word order and unbounded contextual syntax remain out of scope.
- The former offline browser mode embedded only PL/EN morphology plus the legacy TR *sentence* adapter; it has been retired. Arabic morphology runs through the CLI/tests, not through the UI.
- Every active lexeme is mapped to CORE (including function words); inflectional forms are not individual CORE concepts.
