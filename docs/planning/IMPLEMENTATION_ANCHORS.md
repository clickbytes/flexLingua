# flexLingua — kotwice symboli i plików (stan `clickbytes/main` 2026-10-14)

Wymienione ścieżki i symbole zostały sprawdzone w istniejących plikach. Nazwy linii zmieniają się po nowych commitach.

## CORE / INTER

- `js/core/interlingua.js`: `participant`, `createEvent`, `validateReferent`, `validateEventShape`, `validateInterlingua`, `createDiscourse`, `materializeEvent`, `MAX_DISCOURSE_EVENTS`, `MAX_CLAUSE_DEPTH`. Semantyka osób/roles nie może polegać na fikcyjnym `person.girl` dla `I`.
- `js/core/features.js`: `createFeatureRegistry`, `validateFeatureBundle`, `unifyFeatures`, `featureSource`, `matchesConditions`, `matchesAgreement`. `data/features.json` ma w domenie `participant` obecnie tylko `number` i `definiteness`, **brak `person`**.
- `js/core/engine.js`: `Engine`, `registerLanguage`, `registerMorphology`, `analyzeCandidates`, `translate`, `canonicalizeParsedCoreDocument`, `eventWithin` — ochrona przed utratą identyfikatorów ról i niespójną serializacją.
- `js/core/ontology.js` + `data/concepts.json`: hierarchia `person`, role semantyczne i typy. Trzeba rozdzielić `speaker/addressee` od anafory i płci.
- `js/core/conversation.js`: `ConversationContext`, `translate`, `tryTranslate`; E4 ma ograniczoną pamięć operacyjną, brak trwałego store i Personality Engine.

## PARSER / REALIZATOR

- `js/core/grammar.js`: `validateGrammar`, `createRuleAdapter`, `formsAt`, `expandLexemes`, `contextFor`, `parseClause`, `matchVerb`, `renderEvent`, `realizeQuestion`, `realizeModal`, `parseModalCandidates`, `subjectPronounFor` — podstawowe kotwice PERS/STATE/GRAM.
- `js/core/nominals.js`: `createNominalInterpreter`, wewnętrzne `read`, `render`, `featuresFor` — warstwa case/number/definiteness; nie wrzucać form językowych do INTER.
- `data/grammar/pl.json`: `verb.rules`, `verb.agreement`, `nounPhrase`, `questions`, `anaphora.subjectPronouns`, `modality`; dzisiaj przede wszystkim 3. osoba (`thirdSingular`, `thirdPlural`) i past gender/class.
- `data/grammar/en.json`: `forms.present3sg`, `forms.present3pl`, `forms.past`, do/does/did, WH, modalność. Nowe I/you/we nie powinno wejść pod 3sg.
- `data/pl.json`, `data/en.json`: każdy nowy leksem przez `senses[].coreRef`, żadnych zapamiętanych par zdań w runtime.

## MORFOLOGIA

- `data/morphology/features.json`: ma `person` = `first`, `second`, `third`, niezależnie od `data/features.json`. Zmiana musi zachować zgodność schematów.
- `data/morphology/pl.json`: `pl.verb.third_person`, `pl.verb.third_person_particle`; nowe formy dla ja/ty/my/wy wymagają jawnych paradygmatów i wyjątków.
- `data/morphology/en.json`: `en.verb.regular`, `en.verb.regular_particle`; dotychczasowe 3sg, 3pl, past, base.
- `js/core/morphology/engine.js`: `createMorphology`, `materializeInflections(dictionary,morph,{assertLegacy:true})`; nie przełamywać zgodności historycznych komórek.

## TESTY / CI / WŁASNOŚĆ

- `tools/a1-evidence-ledger-lib.mjs`, `tools/a1-evidence-ledger.mjs`: 6 źródeł gold; `--catalog-only` = `not-run`. Nie podawać procentu CEFR bez reprezentatywnego mianownika.
- `tests/features.test.js`, `tests/morphology.test.js`, `tests/conversation-e4.test.js`, `tests/a1-crossbatch-composition.test.js`, `tests/a1-evidence-ledger.test.js`: baza regresji i nowe fixture dla Batch 8+.
- `package.json`: `npm test`, `check:release`, `report:a1-evidence`, `check:a1-evidence`.
- `.github/workflows/core-engine.yml`: jobs `engine-tests`, `lexical-audits`, `release-gate`.
- GUI: `js/ui/studio.js`, `index.html`, `tests/studio-ui.test.js`; uruchomienie przez lokalny HTTP.

Historyczny raport bazowy [Actions #38610233253](https://github.com/clickbytes/flexLingua/actions/runs/38610233253): Node 398/401 i trzy błędy GUI. Bieżący `main` po PR #90 jest zielony w [Actions #38633750354](https://github.com/clickbytes/flexLingua/actions/runs/38633750354); wszystkie trzy jobs przeszły.
