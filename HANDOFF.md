# CI FAKTYCZNE WYNIKI POPRAWEK CORE — 2026-10-14

**Repo aktywne tylko clickbytes/flexLingua.** Po importowaniu kompletnej migawki `main`, prawdziwy hosted [run 38607989473](https://github.com/clickbytes/flexLingua/actions/runs/38607989473) uruchomił poprawiony zestaw: **392/395 pass**; `lexical-audits` success, `offline-parity` failure, `engine-tests` failure wyłącznie w trzech testach **GUI**. GUI musi poprawić [issue #1](https://github.com/clickbytes/flexLingua/issues/1): nieaktualny standalone i dwa testy Studio. Żadne zmiany w UI/HTML nie zostały wykonane przez CORE. Przed zielonym release wymagane aktualne `npm test`, `check:standalone`, `check:release` na `main`.

---

# CHECKPOINT MIGRACJA / GITHUB ACTIONS — 2026-10-14

**JEDYNE AKTYWNE REPO:** https://github.com/clickbytes/flexLingua
**Nie zapisuj niczego do ppotepa/flexLingua**. Historia dawnych commitów i PR-ów jest archiwalna. Kopia wszystkich 158 plików ma identyczny Git tree SHA `f21ccb19d3a1b1616d4ffea11d4d77f1ed572839`; commit importu `clickbytes/main` = `17a9b255783027890cc56dcd8141782a40212f7b`. Repo clickbytes ma nową historię, bez przepisania dawnej historii commitów.

Prawdziwy [Actions Startup Probe #38607020509](https://github.com/clickbytes/flexLingua/actions/runs/38607020509) przeszedł. [Core Engine CI #38607020365](https://github.com/clickbytes/flexLingua/actions/runs/38607020365) uruchomił Node 22 i pełny `npm test`: **379/393 pass, 14 fail**; poprzedni problem `startup_failure` nie blokuje już hostowanych jobów. Regressions CORE: kanoniczny parse CORE JSON dyskursu musi odtworzyć mapy bez prototypu; dwie stare asercje corpus tamper, asercja ojca i błędny test głębokości komplementu. GUI nadal stale standalone + 2 Studio UI regressions; **nie ruszaj plików GUI** — przekaż oddzielnemu agentowi. Szczegóły: [docs/migration-clickbytes.md](docs/migration-clickbytes.md).

Aktualna praca odbywa się na osobnej gałęzi `core/ci-real-run-regressions-20261014` w **clickbytes**, po aktualizacji muszą być wykonane realne testy GitHub Actions. PR/merge tylko na clickbytes, bez force push, po każdym batchu HANDOFF.md. Nie deklarować green release bez full suite i standalone.

---

# A1 BATCH 6 — cross-batch semantic composition checkpoint

Independent 11-case `tests/fixtures/gold-a1-crossbatch.json` covers modal ability, obligation, modal questions (WH targetRole), coordination and short discourse, combining legacy and new predicates. Isolated real Engine V8 confirmed G2 old gold 40/40 and all 11 constructed cases (correct texts, top-level semantic types). Dedicated Node tests now assert operator scope, event order, target reanalysis, INTER JSON roundtrip and detection of corrupted semantic or surface gold. The combined `check:gold-actions` script runs both test files. Full Node CI remains blocked by Actions `startup_failure`.

---

# A1 BATCH 6 — integracja testów, CI, aktualizacja poprzedniego audytu

- Dodano `tests/daily-actions-a1.test.js`: 20 niezależnych przykładowych zdań PL/EN, 2 dodatkowe `productiveOnly`, 15 komórek odmiany z odwrotną analizą i 5 odmów; osobno sprawdza role, czas, polarność, pytaną rolę, odrębność sensów oraz celowo zepsuty oracle.
- Zintegrowano `check:gold-actions` z `Core Engine CI`; dopasowano poprzedni `tests/a1-gap-audit.test.js` z 22 do 23 celów i oczekiwania `event.write` / `event.open`. Brak fikcyjnego procentu CEFR.
- Izolowany rzeczywisty Engine w V8: 20/20 tłumaczeń, 5/5 odmów, a plain-mode odmówił obu prób z oknem. Rzeczywiste adaptery z morfologią: dwa warianty `window/okno` poprawne; rzeczywiste 15/15 form morfologicznych i ich analiza odwrotna, `assertLegacy:true` bez błędów.
- G1b zdalne Actions pozostaje w `startup_failure` issue #9; pełny `npm test` i `check:release` nadal niezweryfikowane. Offline GUI należące do issue #16 poza zakresem zmian.

---

# A1 BATCH 6 — rozdzielenie trybu plain i productive

Wstępny rzeczywisty Engine/V8 wykazał brak tabel powierzchniowych `window/okno` w legacy parserze, mimo poprawnych paradygmatów morfologicznych. Nie dopisujemy `forms` do bazowych nowych rzeczowników (sprzeczne z `tests/lexicon-expansion.test.js`). Główne testy używają `book/książka`; dwie oddzielne próbki `productiveOnly` wymagają adaptera z morfologią i odrzucenia bez niej. W WH question `theme` jest niewypełnioną rolą, więc test ma sprawdzać jej brak zamiast porównywać `undefined` do `null`.

---

# CHECKPOINT A1 BATCH 6 — 2026-10-14

- Based on `83713d1187c9d5a4951ebc8782ce1ab0d3c82bdc`. Introduced PL/EN `pisać/write` from existing `event.write`, and new typed `event.open` mapped to `otwierać/open`.
- New PL/EN morphology, language-specific frames, 20 independent sentence gold rows, 15 morphology cells, 5 invalid controls; `check:gold-actions` script added to release gate. Remaining in this PR: Node tests, CI lexical audit job, checklist test updates, actual isolated integration and fixes.
- The planning A1 checklist is 23 authored targets, not a measure of completed CEFR. Historical `event.write` typing remains intentionally permissive for backward compatibility.
- Full Node project checkout and hosted Actions are still unverified (startup_failure issue #9), standalone owned by GUI issue #16. No GUI changes.

---

# A1 BATCH 5 — WALIDACJA I CI

- Izolowany V8: rzeczywisty `Engine` na danych Batch 5 zaliczył 18/18 pozytywnych przekładów i 4/4 odmów; prawdziwy silnik morfologii wygenerował i zanalizował odwrotnie 11/11 zadeklarowanych komórek PL/EN, z `assertLegacy:true` bez regresji.
- Dodano test Node `tests/movement-a1.test.js` oraz `check:gold-movement` w `Core Engine CI`; stary `coverage-a1.test.js` i `a1-gap-audit.test.js` wymagały aktualizacji, bo PL movement już istnieje.
- Zbiór G2 pozostaje niezmieniony; audyt raportuje `without-gold` dla movement, mimo osobnego gold Batch 5. `cefr.percentage:null`, full Node CI/release niepotwierdzone, GUI nietknięte.

---

# CHECKPOINT A1 BATCH 5 — 2026-10-14

- Source main: `1f8e8878577837eebf41729f19931c8fe78343cb`. Added `pl.isc.1`, PL movement frame, productive irregular inflections and historical EN `go` forms. Existing semantic type remains one-agent movement with no destination.
- New independent oracle: 18 PL/EN sentences, 11 morphology cells and 4 refusals. `check:gold-movement` is planned as an explicit release/lexical CI gate; prior tests for missing PL movement require update within this PR.
- Does not equate Polish on-foot `iść` to all English `go` uses. Neither destination nor mode are encoded. Not full CEFR A1.
- Full checkout Node tests are not yet verified; Actions still startup_failure issue #9. GUI/standalone remain with separate agent issue #16.

---

# A1 BATCH 4 — korekta regresji poprzedniego audytu

W `tests/a1-gap-audit.test.js` usunięto przestarzałe oczekiwania `father=unmodelled` i `family.unmodelled=1`. Nowe asercje potwierdzają `father=without-gold` w izolowanym G2 i poprawę pokrycia strukturalnego całej rodziny, bez naciągania certyfikacji CEFR. Izolowany rzeczywisty Engine: 16/16 pozytywnych zdań i 4/4 odmów; prawdziwa morfologia: 16/16 komórek z odczytem odwrotnym, ścisła kontrola zgodności historycznych form. Full `npm test` nadal nieuruchomiony.

---

# CHECKPOINT A1 Batch 4 — 2026-10-14

- Baza `e4a5918a50b9925f964050101135de257ee0b4a0`, branch `core/a1-batch4-father-20261014`.
- Nowy sens `person.father`, PL `ojciec`, EN `father`, 2 wiązania morfologii, ręcznie zdefiniowane wyjątki pełnej deklinacji, dwukierunkowy autorski gold 16 zdań + 16 komórek + 4 odmowy.
- Dodano `check:gold-father` do release/lexical-audits, testy, dokumentację. `index-standalone.html` oraz GUI bez zmian.
- Po merge następnym krokiem Batch 5 jest brakujące `event.movement` po stronie polskiej. `cefr.percentage` nadal null, nie deklarować pełnego A1.
- Actions issue #9: `startup_failure` przed jobs, brak pełnej weryfikacji Node/release; standalone GUI issue #16.

---

# BATCH 3 — finalny checkpoint weryfikacji, 2026-10-14

- Baza: `9ee492cf0b2ad7dbdd7e933c2127f616c16e6173` po Batch 2; zakres wyłącznie CORE, leksykony PL/EN, morfologia, testy i dokumentacja.
- Dodano 4 znaczenia CORE, 8 nowych leksemów i komplet wiązań morfologicznych, ramy dla `event.read` i `event.help` (polski celownik przy `pomagać`).
- Izolowany test **rzeczywistego Engine (bez morfologii)**: 23/23 kontroli, w tym 16 zdań w obu kierunkach, 4 odmowy i 3 sprawdzenia znaczenia/ról/czasu/polarności. W V8 zweryfikowano także alternatywę czasów angielskiego `read`.
- Izolowany test **rzeczywistego adaptera z morfologią**: 16/16 zdań, 18/18 niezależnych komórek morfologicznych z analizą odwrotną; 8/8 nowych wiązań morfologicznych poprawnie inicjalizuje się z walidacją CORE. Wszystkie 3 zmienione pliki testów mają poprawną składnię JS.
- Audyt A1 na gałęzi: 51 leksemów PL, 56 EN, 22 cele planistyczne, `cefr.percentage:null`, 4 nowe znaczenia mają `without-gold` w korpusie G2, lecz **odrębne** testy z pliku `gold-family-actions-a1.json` są już zaimplementowane. `person.father` i polskie `event.movement` nadal niekompletne.
- Zmodyfikowano nieaktualne oczekiwania `tests/a1-gap-audit.test.js` (inaczej pełny zestaw miałby regresję); zabezpieczono CI przed pominięciem `check:gold-family`.
- **Nie wykonano pełnego `npm test`, `npm run check:release` ani `check:standalone` na kompletnym checkoutcie Node**; GitHub Actions kończy się `startup_failure` bez jobów (issue #9). Tego ograniczenia nie wolno ukrywać. Brak ingerencji w GUI (issue #16).
- Po scaleniu konieczne są: rzeczywisty pełny Node test/release, aktualizacja offline przez agenta GUI, dalsze rozszerzanie audytu A1 i leksyki w nowych batchach.

---

# WALIDACJA A1 BATCH 3 — 2026-10-14

- Po korekcie gold angielskiego `read`: izolowany JS na **rzeczywistym adapterze z produktywną morfologią** sprawdził 16 zdań z dwukierunkową analizą semantyczną i 18 komórek morfologicznych z odczytem odwrotnym: **34/34** kontroli bez błędów. Wcześniej rzeczywisty Engine w V8 sprawdził 19/20 par oraz ujawnił niejednoznaczność `read`; preferencję skorygowano do past z alternatywą present, nie poprzez wyłączenie dwuznaczności.
- Wersjonowany audyt 22 celów na aktualnych danych: 51 leksemów PL, 56 EN; 4 nowe znaczenia w statusie `without-gold` ograniczonego korpusu G2, `person.father` nadal `unmodelled`, `event.movement` nadal nie ma lex/frame PL. `cefr.percentage:null`.
- Dodano ochronę workflow `check:gold-family` i testy zachowania ról, czasu i negacji.
- Pełnego `npm test`, `check:release` ani `check:standalone` w checkoutcie Node nie potwierdzono; GitHub Actions pozostaje `startup_failure`. Zmian GUI brak.

---

# KOREKTA REGRESJI AUDYTU A1 PO BATCH 3 — 2026-10-14

Stary test `tests/a1-gap-audit.test.js` zakładał, że `person.sister`, `person.brother`, `event.read`, `event.help` nie istnieją w CORE. Po dodaniu ich w Batch 3 był nieaktualny i powodowałby błąd pełnego `npm test`. Test teraz sprawdza ich rzeczywiste pokrycie PL/EN, wiązania morfologii i ramy zdarzeń, a jednocześnie wymaga `without-gold` w ograniczonym do G2 raporcie oraz nadal potwierdza brak `person.father` i polskiego ruchu. Oddzielny gold rodzinny pozostaje w `check:gold-family`. Pełnego `npm test` nadal nie potwierdzono, brak dostępu do kompletu plików przez checkout.

---

# KOREKTA BATCH 3 — ambiguous English read (14.10.2026)

Izolowany test rzeczywistego adaptera wykazał 19/20 prawidłowych pierwszych oczekiwań; wyjątkiem było `The sisters read the books.`: wybrany czas past zamiast present. Gold zmieniono na oczekiwany past z jawną alternatywą present; dodano test zachowania obu odczytań w `semanticAlternatives`. Morfologia przeszła odrębnie 18/18 ręcznie opisanych komórek i odwrotnych analiz z rzeczywistą funkcją `createMorphology`. Nie jest to pełny `npm test`.

---

# CHECKPOINT A1 / BATCH 3 — 2026-10-14

- Podstawa: `9ee492cf0b2ad7dbdd7e933c2127f616c16e6173` (F0 batch1 i A1 batch2 na `main`).
- Nowe CORE: person.sister, person.brother, event.read, event.help; PL/EN leksyka, pełne formy podstawowe, wiązania paradygmatów, ramy przypadków PL/EN.
- Gold: 16 zdań autorskich (8+8), 18 form fleksyjnych, 4 odmowy + testy kontraktów, dodane do release gate/CI.
- UWAGA: F0 runner z Batch 1 nie ingeruje w offline GUI, `npm test` automatycznie wykrywa nowy test. `check:gold-family` oddzielnym skryptem.
- Status nie jest certyfikacją A1. Issue #9 Actions startup_failure i #16 standalone nadal otwarte. Gdy dostępny pełny checkout Node 22+, uruchom: `npm test`, `check:lexicon`, `check:morphology`, `check:gold-family`, `audit:a1-gaps`, `check:release`. Błędy naprawić przed wydaniem.
- GUI/HTML nie zmieniono, brak force-push i automatycznej aktualizacji wersji 1.12.0.

---

# CHECKPOINT A1 / BATCH 2 — 2026-10-14

- Punkt wyjścia: `0562591bb322b1b63a7c4e80133f4de3f1ebffd4` (F0 local runner już scalony). Wersjonowana lista 22 autorskich celów A1 i audyt struktura + gold, bez procentu CEFR.
- CLI `npm run audit:a1-gaps`, testy walidacji i błędnych wyników, dokumentacja. Nie dotykano GUI.
- Plan na Batch 3: `person.sister`, `person.brother`, `event.read`, `event.help` (CORE, PL/EN, morfologia, ramy, testy gold). Aktualny `event.movement` to osobny dług techniczny; nie wprowadzać fikcyjnej pełnej obsługi.
- Nadal brak pełnego zdalnego CI i Node/release w kompletnym checkoutcie, issue #9 / #16.

---

# CHECKPOINT F0 / BATCH 1 — 2026-10-14

- Punkt wyjścia: `6c2b6c9070b26de6ac97eded0c2527322389b2f8`.
- Dodano deterministyczny lokalny runner bramek CORE jako alternatywne źródło dowodów, bez zmiany CI/provider ani GUI; CLI `npm run check:core-local`, opcjonalny check standalone, testy i [opis](docs/f0-local-gates.md).
- Status GitHub Actions **nadal zablokowany** (`startup_failure`, 0 jobs, issue #9), brak zweryfikowanego `npm test`, `check:release`, `check:standalone` w kompletnym checkoutcie. Nie zgadywać przyczyny.
- Następne mikrobatchy: A1 audyt luk i rozszerzenie leksyki rodzina/czynności. Po każdym: aktualizuj HANDOFF w tym samym PR.

---

# CHECKPOINT G1b/G2/G3 — zweryfikowany stan 2026-10-14

**Aktualny sprawdzony stan przed tym dokumentacyjnym commitem:** `main` `5a1f97e938e8e862adb670d032ac733beca9e664`. Wszystkie zmiany CORE G2 i G3 wylądowały na `main` poprzez PR #12 (3ff8d17b...) i PR #13 (f081f3e...). Probe G1b: PR #14 (a6d49ab...), drugi push PR #15 (5a1f97e...).

**Dowody:**
- Izolowany interpreter V8 na pobranym kodzie silnika: 32 pozytywne przekłady + 8 jawnych odmów, 40/40. G3 evaluator w tym samym środowisku potwierdził 40/40 i fail po mutacji oracle. **Nie** jest to `npm test` ani pełny Node checkout.
- Strukturalny inwentarz JS: 47 leksemów PL, 52 EN, 13 pojęć w pilocie, 12 ze słownikami w obu językach. To **nie** % pokrycia A1; `cefr.percentage:null`.
- `Core Engine CI` dla `main` SHA `5a1f97e938e8e862adb670d032ac733beca9e664`: [Actions run 38586263561](https://github.com/ppotepa/flexLingua/actions/runs/38586263561): `completed`, `startup_failure`, `BuildFailed`, **0 jobs**. Listę ostatnich 20 przebiegów nadal stanowi wyłącznie `workflow_id=383042448`; odrębnego probe nie zaobserwowano po dwóch push. To **nie** dowodzi pozytywnego smoke ani przyczyny. Problem i fakty zapisane w [issue #9](https://github.com/ppotepa/flexLingua/issues/9).
- Otworzono [issue #16](https://github.com/ppotepa/flexLingua/issues/16) dla osobnego agenta GUI, aby ponownie wygenerował i sprawdził `index-standalone.html`. Agent CORE nie zmienił GUI.
- G1b pozostaje **otwarte** do czasu potwierdzenia zadań Actions i `npm test`, `check:a1-gold`, `check:release`, `check:standalone` z pełnego checkoutu. Wersja package pozostaje historyczna `1.12.0`.

**Następny właścicielski krok:** sprawdzić Actions General/rozliczenia/restrykcje oraz szczegółowe komunikaty w UI albo skontaktować się z GitHub Support z run ID 38586263561. Gdy Actions wystartuje, ponowić pełny pipeline i zapisać wyniki; w szczególności synchronizację standalone przekazać agentowi GUI.

---

# CHECKPOINT G1b.2 — 2026-10-14

Base `a6d49ab97d23c15e42c9e087bf70d0555dde2317` (po PR #14). Drugi push tylko w komentarzu istniejącego workflow probe plus docs; do weryfikacji nowy run `Actions Startup Probe` i `Core Engine CI`. Potwierdzony [38585995455](https://github.com/ppotepa/flexLingua/actions/runs/38585995455): `startup_failure`, 0 jobs. Brak pełnego `npm test`, `check:release`, `check:standalone`; GUI nietknięte. Issue #9 pozostaje otwarte.

---

# CHECKPOINT G1b — minimalny probe Actions, 2026-10-14

- Baza: `f081f3ef0dbfd94ea9c194b718226cbf31265baa` (G2/G3 już scalone). Utrzymuje się [startup_failure 38585582590](https://github.com/ppotepa/flexLingua/actions/runs/38585582590) na G3 main, 0 jobs.
- Dodano niezależny smoke workflow uruchamiający tylko `echo`, statyczny test, dokumentację, bez zmian w CORE i GUI. Po merge sprawdzić **rzeczywisty run** smoke i zaktualizować status issue #9.
- Zdalny problem startu Actions NIE jest rozwiązany; kontrola składni i testy izolowane nie zastępują pełnego checkoutu i Node CI. `npm test`, `check:release`, `check:standalone` nadal nieweryfikowane jako pełen projekt.
- Offline index-standalone.html nadal należy do agenta GUI. Wersja package pozostaje 1.12.0.

---

# CHECKPOINT G3 — 2026-10-14

- Punkt wyjścia: `3ff8d17b2248cbf6e24ad526fb72a3b369a410ca`, scalony G2 PR #12. **Zmiany G3**: `tools/report-a1-lib.mjs`, `tools/report-a1.mjs`, testy Node, scripts, bramka `check:a1-gold`, dokumentacja i HANDOFF w tej samej zmianie.
- `npm run report:a1` oraz `npm run check:a1-gold` wyłącznie mierzą projektowy pilotaż 40 przypadków; `cefr.percentage: null` i `release.verified:false` są celowe.
- Ostatnie sprawdzone Actions dla G2 main: [38584238248](https://github.com/ppotepa/flexLingua/actions/runs/38584238248) = `startup_failure`, `BuildFailed`, **0 jobs**. G1b niezamknięte; nie zgadywać przyczyny billing/YAML.
- Nie wykonano pełnego `npm test`, `check:release`, `check:standalone` w kompletnej kopii repo. Agent CORE nie zmieniał GUI, CSS ani `index-standalone.html`. Przekazać standalone agentowi GUI.

---

# CHECKPOINT G2 — 2026-10-14

Baza `b7aa0ed4ee94953b56a24a2a8bb96b7124b00d47`; ograniczenie do CORE/data/tests/tools/docs. Dodano oryginalny corpus 32 przykłady w obu kierunkach + 8 odmów, gold semantyczny, tests i dokumentację. Izolowany JS/V8 zweryfikował wcześniej 32 zdania i 8 odmów. **Pełne `npm test`, `check:standalone` i `check:release` NIE zostały uruchomione** z kompletnego checkoutu; nie przypisywać statusu green CI. Najnowszy run [38580071364](https://github.com/ppotepa/flexLingua/actions/runs/38580071364): `startup_failure` / 0 jobs. Issue #9 nadal otwarte. Kolejny batch G3: raport CLI; potem rozwiązać blokadę Actions i uzgodnić synchronizację GUI.

---

# HANDOFF — flexLingua / lexLingua

**Ostatnia aktualizacja:** 2026-10-13
**Repozytorium:** https://github.com/ppotepa/flexLingua
**Język współpracy:** polski
**Właściciel tego strumienia prac:** wyłącznie CORE, data/PL/EN, testy, tools i dokumentacja. GUI i generowany `index-standalone.html` obsługuje osobny agent; nie modyfikuj ich.

## Cel architektoniczny
Symboliczny translator PL ↔ INTER/CORE ↔ EN, CPU/offline, bez par sztywnych zdań i bez LLM w runtime. Utrzymywać neutralny INTER, niezależne gramatyki, morfologię i ontologię, kontrolowane diagnostyki przy brakach. Nie deklarować pełnego CEFR A1; Oxford 3000/5000 są wyłącznie referencją zakresu. Conversation/personality/memory/external actions — odleglejsze etapy.

## Konieczne kroki na rozpoczęcie każdej sesji
1. **Ponownie pobierz aktualny HEAD `main`** i porównaj wszystkie zmiany; GUI może równolegle modyfikować główną gałąź.
2. Otwórz ten plik, `README.md`, `ROADMAP.md`, `docs/development-workflow.md`, `docs/stage1-batches-c-f-v1.20.md` oraz właściwe testy.
3. Małe partie: pojedyncza cecha silnika + osobne testy + dokumentacja + aktualizacja niniejszego `HANDOFF.md` w tym samym PR/commicie; po ukończeniu wróć z linkiem do GitHub i wynikiem rzeczywiście wykonanych testów.
4. Bez force push. Publikacja do `main` tylko bezpiecznym FF z expected SHA albo squash-merge PR. Nie ruszaj GUI i nie buduj standalone bez uzgodnienia.

## Stan Etapu 1 (C–F źródła scalone 2026-10-13)
- PR #1 został scalony metodą squash do `main`: commit `2933cfa0fa42478767ef8eda5adadfbccec948fb`. Bazowy wcześniejszy `main`: `1a794be6696fc9bb84a804c77cc1cafc145c31ae`.
- Zarchiwizowane źródło zmian: `core/stage1-c-modalities-20261013`; scalony PR https://github.com/ppotepa/flexLingua/pull/1.
- Batch C: scoped modalność `ability`, `obligation`, `NOT(ABILITY(P))`, `NOT(OBLIGATION(P))`, `OBLIGATION(NOT(P))`; słowniki PL/EN; pytania modalne.
- Batch D: ograniczona analiza pełnych klauzul, chart segmentation koordynacji, węzły modalne, zagnieżdżenie w `complement`, limity.
- Batch E **częściowy**: `context.coreference` łączy wyłącznie jawnie wskazane role między zdaniami; bez automatycznej anafory i zaimków.
- Batch F **częściowy**: pierwsze dwa wielowyrazowe sensy CORE `look at/patrzeć na` i `pick up/podnosić`; odmowa nieobsługiwanych pytań z ekstrakcją przyimka.
- Pakiety i przykłady szczegółowo w `docs/stage1-batches-c-f-v1.20.md`.
- Pliki testowe: `tests/modalities-v1.20.test.js`, `tests/composition-v1.20.test.js`, `tests/context-coreference-v1.20.test.js`, `tests/multiword-v1.20.test.js`, `tests/fixtures/gold-modality-v1.20.json`.

## Co wiemy o weryfikacji
- Izolowany interpreter V8 dla modułów JS: 15 integracyjnych przykładów PL/EN; 6/7 testów Batch C (pozostały przypadek pełnej morfologii wówczas pominięty), 10 testów D/F, 5 testów E, 18 testów historycznych CORE/question, 8 historycznych question-translation (jeden morfologiczny pominięty). Łącznie 47 grup testów z tamtej weryfikacji, oraz 7 osobnych przykładów z prawdziwym adapterem morfologicznym.
- Nie wykonano pełnego `npm test` ani `npm run check:release`. GitHub Actions zgłosił `startup_failure` i nie uruchomił jobs. Część badań miała własny zamiennik Node; to nie jest równoważność CI.
- Offline standalone nie zsynchronizowano; to zadanie agenta GUI. Nie deklarować wydania ukończonym.

## Najbliższe małe zadania
1. Ustabilizować uruchamianie CI na GitHubie i odpalić `npm test`, `npm run check:release`, `npm run check:lexicon`, `npm run check:morphology`, `npm run check:gold`; usunąć ujawnione regresje.
2. Batch E1: doprecyzować kontrakt referencji i obronić `coreference` przed błędnymi połączeniami; następnie E2: bezpieczny parser zaimków, bez automatycznego zgadywania.
3. Batch F2: wprowadzić bezpieczną analizę pytań z przyimkiem przy prawidłowym semantycznym `targetRole` (np. `what ... look at`), bez nieuprawnionych form.
4. Po ukończonym mikrobatchu uaktualnij **ten** `HANDOFF.md` (stan HEAD/PR, zakres, rzeczywiste testy, ograniczenia, kolejny krok), zanim zakończysz odpowiedź.

## Zasady kompatybilności
Stare zdarzenia INTER v0.2 oraz pytania v1.19 pozostają prawidłowe; `modality` ma wersję 1.20. PL odróżnia `nie może` od `nie musi`; nie utożsamiać `must not` z `does not have to`. Zachowywać nieznaną angielską określoność i polski aspekt. Braki gramatyczne powinny jawnie odmawiać, nie zgadywać. Semantyczny `question.targetRole` pozostaje niewypełniony. Zamknięcie wymaga realnego walidatora JSON, regresji, docs i koordynacji z agentem GUI.

## Mikrobatch F2 — pytania WH z rządzonym przyimkiem (2026-10-13)

**Mikrobatch F2 scalony:** [PR #2](https://github.com/ppotepa/flexLingua/pull/2), commit `91fa03bc7e6d59ddbc093e924c52ed12c44333f4` (squash do `main`). Źródłowa gałąź `core/f2-prepositional-wh-20261013`, baza `2933cfa`. **Nie modyfikowano GUI.**

- W `data/grammar/en.json`: `frames.event.visual_attention.whTheme=true`, dopuszczające angielskie `What does the girl look at?` i modalne `What can the girl look at?`.
- W `data/grammar/pl.json`: `frames.event.visual_attention.whTheme={frontPreposition:'na'}`; tylko jawnie licencjonowany przyimek zostaje przeniesiony przed `co`. Polskie `Na co patrzy dziewczynka?`, `Na co patrzyła dziewczynka?`, `Na co może patrzeć dziewczynka?` bez tworzenia fikcyjnego uczestnika pytania.
- W `js/core/grammar.js` ponownie wykorzystano dotychczasowy `parseClause`, liniaryzacje i fleksję, zamiast tabel zdań. Błędne `Co patrzy na dziewczynka?` jest kontrolowanie odrzucone; próby z niewłaściwym przyimkiem także. Nie zakładać wsparcia dla innych przyimków.
- Testy: `tests/prepositional-wh-v1.21.test.js` (5 przypadków), zaktualizowane `tests/multiword-v1.20.test.js` i istniejące `tests/questions-translation.test.js`; dokumentację uaktualniono w `README.md`, `ROADMAP.md`, `docs/stage1-batches-c-f-v1.20.md`.
- Faktycznie wykonano **18 z 19** grup testów tych trzech zestawów w izolowanym interpreterze V8: 18 zaliczonych, jeden historyczny test wymagający produktywnej morfologii pominięty. To NIE jest `npm test`. Dodatkowo 9 integracyjnych zdań EN/PL odczytanych i zrealizowanych przed dodaniem testów. CLI Node.js i offline nadal bez pełnej weryfikacji.
- Aktualny wymagany checkpoint CI: uruchomić `npm test` i `npm run check:release` w środowisku Node 20+; zidentyfikować przyczynę `startup_failure` GitHub Actions. Nie deklarować CI jako przechodzącego.
- **Kolejny mały batch:** E1 — rygorystyczny kontrakt `context.coreference` i diagnostyka niezrozumiałego/niejednoznacznego wskazania; następnie E2 — ograniczone zaimki z rozstrzyganiem jednoznaczności. Każdą partię zamknąć oddzielnie i zawsze uaktualnić `HANDOFF.md`.

## Checkpoint końcowy tej sesji — 2026-10-13

- PR #1: scalony `2933cfa0fa42478767ef8eda5adadfbccec948fb` (C–D i częściowe E–F).
- PR #2: scalony `91fa03bc7e6d59ddbc093e924c52ed12c44333f4` (F2 pytania WH z rządzonym przyimkiem, 18/19 izolowanych grup testów zaliczonych, jedna pominięta).
- Ostatni zweryfikowany HEAD `main` przed tym checkpointem: `91fa03bc7e6d59ddbc093e924c52ed12c44333f4`. Ten plik jest zapisywany późniejszym commitem; nowy agent powinien odczytać faktyczny HEAD.
- Nie ma dowodu uruchomienia pełnego `npm test` / `check:release`; nie deklaruj testów CI jako zaliczonych. GitHub Actions dotychczas zgłaszało `startup_failure`.
- Następny mikrobatch: E1 — poprawność/diagnostyka jawnego wiązania encji i walidacji kontekstu, bez niesprawdzonego zgadywania zaimków; oddzielny PR, niezależne testy i kolejna aktualizacja `HANDOFF.md`.
- Interfejs offline nie jest synchronizowany przez tego agenta. Trzeba powiadomić jego właściciela, że CORE source został rozszerzony.

## Mikrobatch E1 — jawne powiązania i stabilna wieloznaczność (2026-10-13, ostatni checkpoint)

**Gałąź:** `core/e1-coreference-validation-20261013` z `main` `38eff9d6c517b7471ae3decee84399369c8be540`. Po scaleniu zapisz PR i docelowy commit `main` w następnym checkpointie. Zmiany E1 dotyczą wyłącznie CORE, testów i dokumentacji, bez HTML/GUI.

### Zrealizowano
- `js/core/interlingua.js`: wspólny `validateCoreferenceMap(coreference,eventCount)` (maksymalnie 32 linki, zdarzenia e1–e8, tylko wcześniejsze role), `sameDiscourseReferent(a,b)` z porównaniem semantyki niewrażliwym na kolejność pól obiektu. Nie wolno utożsamiać brakujących ról/undefined; bez zgadywania znaczenia i określoności.
- `js/core/engine.js`: najpierw sprawdza identyfikatory i obecność źródłowych/docelowych ról, potem przy budowaniu kombinacji odrzuca tylko odczytania sprzeczne z jawnymi odwołaniami. Dzięki temu `bank` w dwóch zdaniach: 4 odczytania bez linku, 2 po związaniu `e2.theme` z `e1.theme` (instytucja z instytucją, brzeg z brzegiem). Zachowany budżet 16 wyników. Zwraca `INVALID_COREFERENCE` w `tryTranslate` przy błędnych linkach lub braku zgodnego znaczenia, zamiast losowego komunikatu lub porzucenia poprawnych kandydatur.
- Nowe testy `tests/coreference-e1-v1.22.test.js`; istniejące `tests/context-coreference-v1.20.test.js` bez ingerencji. Kontrakt w `docs/context-coreference-e1.md`; README/ROADMAP i indeks dokumentów zaktualizowane.

### Faktyczna weryfikacja
- **10/10** grup z nowego E1 i historycznego testu kontekstu zaliczone w izolowanym interpreterze JavaScript.
- **6/6** historycznych testów semantyki pytań zaliczone w tym samym rodzaju izolowanej weryfikacji.
- **Nie wykonano** pełnego `npm test`, `npm run check:release` ani testów standalone. Dostęp do github.com z lokalnego kontenera nie działa (DNS), a workflow GitHub Actions wcześniej raportował `startup_failure` bez zadań. Nie przedstawiać wyników izolowanych jako Node CI.
- Test `CORE JSON` zachowuje semantykę, a kontekst nie jest stosowany do wejścia `from:core` ani pojedynczych pytań. Własne identyfikatory są walidowane, ale nie dodano pamięci trwałej.

### Następne zadanie (oddzielny, mały batch)
- **E2:** projekt kontrolowanych zaimków (np. `she/he` i `ona/on`) oraz reguł jednoznacznego poprzednika, bez cichego rozstrzygania przy dwóch zgodnych antecedensach. Najpierw osobny kontrakt i negatywne testy, potem parser/generator PL ↔ INTER ↔ EN.
- Osobno rozwiązać CI (`npm test`, `npm run check:release`) i przekazać agentowi GUI informację o konieczności synchronizacji offline.
- Przed następną zmianą sprawdź najnowszy HEAD `main`, nie nadpisuj równoległej pracy. Każdy ukończony mikrobatch musi aktualizować **`HANDOFF.md`** przed zamknięciem.

## Zamknięcie E1 po merge — 2026-10-13

- **PR #3 scalony:** https://github.com/ppotepa/flexLingua/pull/3 (squash). Commit implementacji w `main`: `f3e6b6233ee7daf4305c3f0a877b69c166893117`.
- Powiązania encji pozostają **jawne** i wyłącznie między wcześniejszymi zdarzeniami. Wieloznaczne sensy są filtrowane bez odrzucania zgodnych odczytań. Brak automatycznej anafory i brak zmian GUI.
- Potwierdzono 10/10 izolowanych testów E1/kontekstu oraz 6/6 izolowanych regresji semantyki pytań. To nie jest uruchomienie pełnego `npm test`; release gate i synchronizacja standalone pozostają otwarte.
- Następny mikrobatch: **E2** — bezpieczna anafora zaimkowa z jednoznacznym poprzednikiem albo jawną odmową. Prowadzić w oddzielnym PR, zakończyć aktualizacją `HANDOFF.md` i nie zmieniać interfejsu GUI.
- Ten checkpoint zostaje zapisany odrębnym commitem dokumentacyjnym na `main`, więc faktyczny HEAD będzie nowszy niż podany wyżej commit implementacji.

## Mikrobatch E2a — kontrolowane rozpoznawanie zaimków, checkpoint (2026-10-13)

**Baza gałęzi:** aktualny w chwili rozpoczęcia `main` `8cb5368f984dba023d1d639f0f9f88ef59e9b426`. Gałąź robocza: `core/e2a-controlled-pronouns-20261013`. Po zakończeniu PR i scaleniu dopisz numer PR i docelowy commit `main`. Bez zmian GUI i standalone.

### Faktyczne zmiany
- `data/grammar/en.json`, `data/grammar/pl.json`: deklaratywne `anaphora.subjectPronouns` dla `she/he`, `ona/on` i tylko `person.girl/person.boy`; inne rzeczowniki mogą wymagać produktywnej morfologii, więc nie są automatycznie dopuszczane.
- `js/core/grammar.js`: walidacja unikalności markerów, typów pojęć i aktywnych leksemów oraz `readSubjectPronoun`, `expandSubjectPronoun`. Używa już istniejącej frazy nominalnej w mianowniku — nie okleja przypadkowych końcówek.
- `js/core/engine.js`: `analyzeAnaphoricPair` rozpoznaje zaimek **wyłącznie jako podmiot drugiego z dokładnie dwóch zdań**, dopasowuje dokładnie jedną semantyczną rolę z pierwszego zdarzenia, buduje wspólną encję przez `createDiscourse`; `AMBIGUOUS_ANAPHORA` dla wielu możliwych wzmianek, `UNRESOLVED_ANAPHORA` dla braku poprzednika lub nieobsługiwanej konstrukcji.
- Tłumaczenie tekstu na język docelowy **powtarza rzeczownik**, nie generuje jeszcze zaimka. Ostrzeżenie precyzuje to zachowanie. Zaimek źródłowy nie jest wpisywany do CORE JSON jako fikcyjna encja.
- `tests/anaphora-e2a.test.js` oraz `docs/anaphora-e2a.md` i aktualizacje README/ROADMAP/docs indeksu.

### Weryfikacja
- Wykonane **16/16 grup testów** E2a + E1 + historycznych testów kontekstu w izolowanym interpreterze JS; wcześniej niezależnie przeprowadzono 9 prób E2a (6 poprawnych + jawne odmowy), w tym wybór agenta i dopełnienia.
- Nie uruchomiono całego `npm test`, `npm run check:release` ani generowanego standalone. Brak DNS do GitHuba w kontenerze; nie przypisuj tym wynikom statusu CI Node.
- Nie wprowadzono nowych wersji istniejącego schematu CORE: wydarzenie v0.2 i dyskurs v0.4–0.6 pozostają kompatybilne.

### Następny mały krok
1. Sprawdź ponownie `main`, PR oraz workflow. Na E2b przygotuj **bezpieczną realizację zaimków w języku docelowym**, z zachowaniem starych wyników bez kontekstu; nie zamieniaj wszystkich powtórzonych nazw automatycznie.
2. Sprawdź granice bezpieczeństwa i gramatykę w obu kierunkach, pytania/negacje, zewnętrzne dokumenty CORE, i dodaj nowe regresje.
3. Osobno napraw blokadę CI i skoordynuj z agentem GUI synchronizację offline.
4. Po każdej partii aktualizuj `HANDOFF.md` w repozytorium i podawaj sprawdzony commit, wyniki rzeczywiście wykonanych testów i otwarte kwestie.

## Scalenie E2a — zamknięcie mikrobatcha 2026-10-13

- **PR #4 został scalony:** https://github.com/ppotepa/flexLingua/pull/4, commit implementacyjny `433f6a8b55dc04441d3602f41bfad16826ebf8cd` (squash); źródłowa gałąź `core/e2a-controlled-pronouns-20261013`.
- E2a obsługuje tylko `she/he` i `ona/on` dla jednoznacznych referentów `person.girl/person.boy`, występujących jako podmiot drugiego z dwóch zdań. Nie twierdzić, że jest swobodna anafora ani że zaimek jest realizowany w tekście docelowym: docelowo na razie powtarzany jest rzeczownik z ostrzeżeniem.
- **Weryfikacja:** 16/16 grup E2a+E1+kontekst oraz 6/6 historycznych question-semantics zaliczonych w izolowanym interpreterze JS. Pełne `npm test`, `npm run check:release` i weryfikacja standalone pozostają NIEURUCHOMIONE. GUI należy do odrębnego agenta.
- **Ostatni zweryfikowany HEAD przed niniejszym commitem dokumentacyjnym:** `433f6a8b55dc04441d3602f41bfad16826ebf8cd`. Po publikacji tego pliku HEAD ulegnie zmianie.
- **Następny mikrobatch E2b:** wyłącznie kontrolowana realizacja zaimków po stronie docelowej na podstawie już zweryfikowanego wspólnego referenta, w taki sposób, aby starsze tłumaczenia bez opcji zachowywały dotychczasowe wyniki. Zdefiniować jawne kryterium włączenia realizacji (bez naiwnej zamiany każdego powtarzanego rzeczownika), dodać pozytywne i negatywne testy PL/EN i zaktualizować `HANDOFF.md` w tej samej partii.
- Osobny priorytet infrastrukturalny: diagnostyka `startup_failure` GitHub Actions, `npm test` i `check:release` w rzeczywistym Node 20+ oraz koordynacja z właścicielem GUI w celu odbudowania offline bundle.

## E2b — bezpieczne generowanie zaimków, checkpoint 2026-10-14

- Gałąź E2b: `core/e2b-safe-pronoun-realization-20261014`, start z `main` `c15506b0203bd4055087dffacbbaaefb0c82bfd3`. Dołączyć numer PR i SHA scalonego commitu po publikacji.
- Zakres tylko CORE/grammar, testy, dokumentacja; **bez zmian GUI**.
- `js/core/grammar.js`: `subjectPronounFor(ref)` wybiera pojedynczą zadeklarowaną formę (`she/he`, `ona/on`) dla znanych aktywnych leksemów w liczbie pojedynczej. `realize(event,{subjectPronoun})` może zastąpić semantycznie wskazany slot podmiotu, nie przez zamianę tekstu i nie przy niewłaściwej liniaryzacji.
- `js/core/engine.js`: opcjonalny `pronounRealization:'repeat'|'safe'` dla `translate()` i `realize()`. Domyślne `repeat` zachowuje dotychczasowe rezultaty. `safe` wymaga dwóch zdarzeń i jawnie współdzielonej encji, której zaimek jest niejednoznaczny z żadną inną wcześniejszą rolą; bez tego powtarzamy rzeczownik z ostrzeżeniem. Przełącznik nie zmienia INTER JSON i przy `to:'core'` nie modyfikuje znaczenia. W trybie safe zwracane jest `pronounizedEvents` (np. `[2]`).
- Testy: `tests/anaphora-e2b.test.js` (5 nowych grup), `tests/anaphora-e2a.test.js`, `tests/context-coreference-v1.20.test.js`. Wykonano **16/16** w izolowanym JS. To nie jest `npm test` — pełny test Node i release check nadal niezrealizowane (brak DNS z kontenera do GitHub, starszy workflow Actions `startup_failure`).
- Dokumentacja: `docs/anaphora-e2b.md`, README, ROADMAP, indeks docs.
- Pozostaje otwarte: realizacja w ponad dwóch zdaniach (E3), pamięć między wywołaniami (E4), rozbudowa wyrażeń wielowyrazowych (F3), testy `npm test`/`check:release` i synchronizacja offline u agenta GUI.

**Następny mikrobatch E3:** 3–8 zdań w pojedynczym dyskursie, jawna tożsamość encji przez `context.coreference` już istnieje. Rozszerzyć kontrolowaną anaforę źródłową na późniejsze zdania tylko tam, gdzie istnieje jednoznaczny poprzednik i gdzie dopuszcza to budżet analiz. Nie zapisywać fikcyjnych encji i nie zmieniać zachowania dla niezwiązanych zdań. Po E3 osobny E4 (zarządzany w pamięci procesowej `ConversationContext`) i F3 (wielowyrazowe konstrukcje). Każdy batch kończyć `HANDOFF.md` i PR.

## Zakończony E2b — scalenie (2026-10-14)

- [PR #5](https://github.com/ppotepa/flexLingua/pull/5) scalony do `main`, commit implementacji `bdd90a91762d5d812a0df69419a09526e54019f1`.
- Zakres: opcjonalny `pronounRealization:'safe'`, realizacja zaimków `he/she`, `on/ona` przy dowiedzionej wspólnej encji w dwóch zdarzeniach; domyślny `repeat` bez zmian. Brak zmian GUI.
- Testy: **16/16 izolowane JS**, pełne `npm test` i `check:release` wciąż niezweryfikowane. `index-standalone.html` niesynchronizowany przez tego agenta.
- **Następny mikrobatch: E3** (3–8 zdań, ograniczona semantyczna anafora, diagnostyka niejednoznaczności, testy i HANDOFF). Po nim E4 oraz F3, osobne PR.
- HEAD `main` przed niniejszym dokumentacyjnym commitem: `bdd90a91762d5d812a0df69419a09526e54019f1`. Przed nowym branchem zawsze sprawdź nowy HEAD.

## E3 — wielozdaniowa anafora 3–8 zdań, checkpoint 2026-10-14

- Gałąź `core/e3-bounded-discourse-20261014`, baza `main` `dfc73b1c8c82e247448865c43d807391eab95451`. PR i merge SHA dopisać po scaleniu.
- `js/core/engine.js`: nowa `analyzeAnaphoricDiscourse` buduje maksymalnie 8 zdarzeń w ograniczonej wiązce 16 kandydatów, śledząc rolę źródłową każdej współdzielonej encji. Wiele wzmianek **tej samej tożsamości** nie wywołuje fałszywej niejednoznaczności; dwie różne pasujące osoby wywołują `AMBIGUOUS_ANAPHORA`. Odczyt `bank` nadal może dać 2 sensy mimo spójnego zaimka. Bez domyślnego wybierania najbliższej wzmianki.
- `Engine.realize` w opcjonalnym trybie `pronounRealization:'safe'` dopuszcza teraz także dalsze zdania, lecz tylko gdy nie ma konkurencyjnej wcześniejszej osoby pasującej do identycznej formy zaimka. Domyślna realizacja rzeczownikowa bez zmian. Graf CORE zachowuje format `discourse` i ograniczoną strukturę.
- `tests/anaphora-e3.test.js`: 6 grup, w tym 8-zdaniowa granica, brak recency heuristic, łańcuch 3 zdań, alternatywne znaczenia, wyraźna odmowa. Jedną dawną negatywną próbę 3 zdań z `tests/anaphora-e2a.test.js` przeniesiono do pozytywnych przypadków E3.
- W izolowanym V8 przeprowadzono **17/17** grup E3/E2b/E2a (zaliczone). Pełne `npm test`, `npm run check:release`, `check:standalone` nie zostały uruchomione; GitHub DNS kontenera niedostępny. Nie utożsamiać tych wyników z CI Node.
- `docs/anaphora-e3.md`, README, ROADMAP, indeks docs oraz addendum E2b zaktualizowane. Nie zmieniono GUI ani `index-standalone.html`.
- **Następny mikrobatch E4:** ograniczony i jawny `ConversationContext` w pamięci procesu (stan 1–8 zdarzeń, limit, reset, brak trwałej pamięci, bez LLM). Ostrożnie oddzielić opcjonalną pamięć między wywołaniami od dotychczasowego stateless `Engine.translate` i od semantycznego `discourse`. Po każdej pracy uaktualnić `HANDOFF.md`; F3 dopiero po E4.

## Zakończony E3 — scalenie PR #6 (2026-10-14)

- [PR #6](https://github.com/ppotepa/flexLingua/pull/6) scalony metodą squash do `main`, commit `7a477fd47578e86b6d42a03f9d773af6e1d10ac6`.
- E3 rozszerza kontrolowaną anaforę na 3–8 zdarzeń w obrębie jednego tekstu, z konserwatywnym rozstrzyganiem jednoznacznego referenta. `pronounRealization:'safe'` może realizować także kolejne zdania. Brak automatycznego łączenia powtarzanych rzeczowników.
- Izolowane testy V8 E3/E2b/E2a: **17/17**, bez pełnego `npm test`/`check:release`. Nie modyfikowano GUI ani offline bundle.
- **Następny batch E4:** zarządzany `ConversationContext` w pamięci procesu, bez trwałego zapisu i bez naruszania istniejącego stateless API. Potem F3.
- Faktyczny HEAD `main` po niniejszym doc-commicie będzie nowszy od powyższego SHA implementacji.

## E4 — operacyjna pamięć ConversationContext, checkpoint 2026-10-14

- Branch `core/e4-conversation-context-20261014`, baza `main` `6f1bba004d9b120e5f183d17e00381d1f374ebb4`. PR/merge SHA dopisać po publikacji.
- `js/core/conversation.js`: dodano klasę `ConversationContext(engine,{maxEvents:8})`, metody `translate()`, `tryTranslate()`, `snapshot()`, `reset()`. Stan jest **wyłącznie w RAM instancji**, do 8 niezależnych zdarzeń, bez automatycznej eksmisji. Jedna tura = jedno kontrolowane zdanie oznajmujące; nie zmienia podstawowego stateless API `Engine`.
- Zaimki źródłowe `she/he`, `ona/on` rozwiązywane przeciw wcześniejszym stabilnym identyfikatorom CORE. Przy wielu różnych pasujących osobach `AMBIGUOUS_ANAPHORA`, przy braku `UNRESOLVED_ANAPHORA`. Bez domyślania tożsamości z powtórzenia frazy.
- Wieloznaczny nowy `bank` nie jest zapisywany w pamięci bez ręcznego `context.senses`: `AMBIGUOUS_CONVERSATION_READING`. Błędy i brak formy docelowej nie zmieniają historii; `snapshot()` oddaje defensywną kopię. `pronounRealization:'safe'` dobiera formę tylko dla jednoznacznego targetowego zaimka. `to:'core'` pozostaje językowo neutralne.
- `tests/conversation-e4.test.js` — **8/8** izolowanych testów JS zaliczonych (dwujęzyczne tury, poprzedniki, brak inferencji, pamięć, reset, limit, rollback, CORE). Nie uruchomiono pełnego Node `npm test` i `check:release` ani testów offline: brak DNS do GitHub z kontenera, wcześniejsze GitHub Actions `startup_failure`. Nie podawać zweryfikowanego CI.
- Dokumentacja `docs/conversation-e4.md` oraz README, ROADMAP i indeks docs zmienione. GUI/standalone pozostawione innemu agentowi.
- **Następny mikrobatch F3:** rozbudowa oddzielnych znaczeń wyrażeń wielowyrazowych w obu językach, poprawna kolejność przyimków/cząstek i testy interlingua, pytań oraz negacji. Nie dodawać gotowych par zdań. Po nim w osobnym etapie G1 konieczny jest realny `npm test`/CI.
- Każdy kolejny mikrobatch osobno z PR + `HANDOFF.md`; nie nadpisuj zmian GUI.

## Zakończony E4 — scalenie PR #7 (2026-10-14)

- [PR #7](https://github.com/ppotepa/flexLingua/pull/7) scalony do `main`, commit implementacji `9b351e748bc86e8ff3d4b83a734babc551e5230d`.
- Ograniczona sesyjna pamięć RAM `ConversationContext`, 8 zdarzeń, reset, powiązania CORE, deterministyczne odmowy i rollback. Nie jest to trwała pamięć.
- **8/8 testów E4** przeszło w izolowanym JS; pełne `npm test`, `check:release` i standalone niezweryfikowane. Zero zmian GUI.
- Następny mikrobatch: F3, odrębne sensy konstrukcji wielowyrazowych w leksykonie CORE i gramatykach, przykłady i kontrprzykłady PL/EN. Aktualizować `HANDOFF.md` po zakończeniu.
- Faktyczny HEAD po niniejszym commicie dokumentacyjnym będzie nowszy niż powyższy commit implementacyjny.

## F3 — końcowy mikrobatch Etapu 1, checkpoint 2026-10-14

**Branch:** `core/f3-multiword-semantics-20261014`, baza `main` `7dd56cd301ce75cff9b1c1c54249b726d8bc68ef`. Po PR/squash należy dopisać jego numer i SHA scalenia w następnym checkpointie. Pracowano wyłącznie nad semantyką, leksykonami, gramatyką, testami i docs, bez GUI.

### Wykonano
- Dodano koncepty `event.search`, `event.auditory_attention` oraz `event.wait_for_entity` w `data/concepts.json`. To niezależne od języka sensy: angielskie `look for` (szukanie) ≠ starsze `look at` (uwaga wzrokowa).
- `data/en.json` i `data/pl.json`: 6 nowych kanonicznych leksemów z jawnie zapisanymi czasami i powiązaniami CORE; `data/grammar/en.json` i `data/grammar/pl.json`: rząd polski genitive dla `szukać`/`słuchać` i acc po `na` dla `czekać na`. Dotychczasowy parser kompozycyjny realizuje pytania, negacje i część modalności bez sztywnych par zdań.
- `tests/multiword-f3.test.js` (6 grup), starsze `tests/multiword-v1.20.test.js` i `tests/prepositional-wh-v1.21.test.js`; **16/16 grup przeszło w izolowanym JS**. Dodatkowo 14 próbek integracyjnych PL↔EN przeszło przed dodaniem testów.
- Opis: `docs/multiword-f3.md`, README, ROADMAP, indeks docs. W `data/morphology/*` **nie dodawano bindingów produktywnej odmiany nowych leksemów**, co należy uzupełnić osobno wraz z niezależnym gold corpus. Nie uznawać form wpisanych w słowniku za automatyczne pełne pokrycie morfologiczne.
- Pełne `npm test`, `npm run check:release`, `npm run check:standalone` NIE zostały wykonane. Powód środowiskowy: brak DNS do github.com z kontenera, a GitHub Actions wcześniej miało `startup_failure`. Nie przypisywać im statusu PASS. Agent GUI odpowiada za offline standalone.

### Etap 1 — bilans prac w tej sesji
- E2b: [PR #5](https://github.com/ppotepa/flexLingua/pull/5), commit `bdd90a91762d5d812a0df69419a09526e54019f1` (opcjonalne zaimki docelowe, 16/16 izolowanych testów).
- E3: [PR #6](https://github.com/ppotepa/flexLingua/pull/6), commit `7a477fd47578e86b6d42a03f9d773af6e1d10ac6` (anafora 3–8 zdań, 17/17 testów).
- E4: [PR #7](https://github.com/ppotepa/flexLingua/pull/7), commit `9b351e748bc86e8ff3d4b83a734babc551e5230d` (operacyjny `ConversationContext`, 8/8 testów).
- F3: bieżący branch, PR do scalenia. Testy izolowane 16/16.
- Wszystkie podane wyniki dotyczą osobnych pakietów; nie sumować ich i nie deklarować całego `npm test`/pełnego CEFR ani gotowego mikroagenta.

### Następny etap G1 — priorytet
1. Odtworzyć repo w środowisku Node.js 20+, uruchomić faktyczne `npm test` i `npm run check:release`; naprawić `startup_failure` GitHub Actions i wszystkie ujawnione regresje.
2. Uzgodnić synchronizację `index-standalone.html` z agentem GUI, bez modyfikowania jego plików w tym strumieniu prac.
3. Dodać osobny pakiet testów gold i bindingi produktywnej morfologii nowych wielowyrazowych leksemów F3.
4. Później G2/G3: niezależnie mierzalne słownictwo i semantyczne pokrycie A1, nigdy nie deklarować procentu bez audytu.
5. **Po każdym ukończonym mikrobatchu odczytaj aktualny HEAD `main`, aktualizuj `HANDOFF.md` i podaj link do PR/commitu oraz tylko faktycznie wykonane testy. Bez force push i bez GUI.**

## Etap 1 (E2b, E3, E4, F3) — finalny checkpoint 2026-10-14

Wszystkie cztery zaplanowane **mikrobatchy kodu źródłowego** zostały scalone do `main` metodą squash, bez modyfikowania GUI:

| Batch | PR | Commit implementacji | Testy izolowane |
| --- | --- | --- | --- |
| E2b — opcjonalne bezpieczne zaimki docelowe | [#5](https://github.com/ppotepa/flexLingua/pull/5) | `bdd90a91762d5d812a0df69419a09526e54019f1` | 16/16 grup E2b + starsze |
| E3 — anafora w 3–8 zdaniach | [#6](https://github.com/ppotepa/flexLingua/pull/6) | `7a477fd47578e86b6d42a03f9d773af6e1d10ac6` | 17/17 grup E3 + starsze |
| E4 — RAM ConversationContext, reset i rollback | [#7](https://github.com/ppotepa/flexLingua/pull/7) | `9b351e748bc86e8ff3d4b83a734babc551e5230d` | 8/8 nowych grup |
| F3 — trzy semantyczne konstrukcje wielowyrazowe | [#8](https://github.com/ppotepa/flexLingua/pull/8) | `11714c271739002cd18c1f6fc684790483c2af4d` | 16/16 nowych i starszych grup |

Dodatkowa **pomerge'owa kontrola integracyjna** aktualnego `main` (po F3) w izolowanym wykonaniu JavaScript: **14/14** grup `tests/conversation-e4.test.js` oraz `tests/anaphora-e3.test.js` zaliczone. Liczniki dla partii zawierają częściowo powtarzane regresje — nie sumować ich jako liczby niezależnych przypadków ani nie nazywać pełnym zestawem Node.

**Granice ukończenia:** wdrożony jest ograniczony **kod źródłowy** silnika. Brak pełnego `npm test`, `npm run check:release`, `check:standalone`, pełnych bindingów morfologii F3 i synchronizacji wygenerowanego `index-standalone.html`. Dotychczas GitHub Actions miało `startup_failure` bez jobs, a kontener posiada Node 22, lecz nie potrafi rozwiązać DNS github.com. Te bramki pozostają **otwarte**, więc nie deklarować gotowego wydania offline ani pełnego A1/CEFR.

**Następny etap G1 (pierwszy PR nowego agenta):**
1. Pobierz aktualny HEAD `main`, README, ROADMAP, `docs/development-workflow.md` i ten `HANDOFF.md`.
2. Ustal przyczynę `startup_failure` GitHub Actions; uruchom `npm test`, `npm run check:lexicon`, `npm run check:morphology`, `npm run check:gold`, `npm run check:coverage` i `npm run check:release` w prawdziwym Node 20+. Raportuj faktyczne wyniki i popraw wszystkie regresje.
3. Powiadom oddzielnego agenta GUI o zmianach API i koniecznej synchronizacji offline, **nie modyfikując GUI** w tym strumieniu.
4. Zidentyfikuj brakujące bindingi paradygmatów nowych konstrukcji F3, dodaj je w osobnym pakiecie z niezależnymi testami gold.
5. Aktualizuj README/ROADMAP/docs wraz z każdym zakończonym batch, a zwłaszcza `HANDOFF.md` przed końcem; scalaj bez force push i podawaj rzeczywisty merge SHA.

**Stan `main` przed tym finalnym checkpointem:** `11714c271739002cd18c1f6fc684790483c2af4d`. Ten dokument zostaje zapisany późniejszym osobnym commitem, więc kolejny agent MUSI sprawdzić nowy HEAD.

## G1a — audyt workflow i pokrycia semantycznego (2026-10-14)

**Gałąź:** `core/g1-ci-20261014`; baza `main` `f9d64f865e5f589e8093d626da51357f6e075075`. Dokładny PR i commit squash dopisać po rzeczywistym scaleniu. Zmiany wyłącznie w workflow, narzędziach coverage, testach oraz docs; **nie dotykać GUI ani index-standalone.html**.

### Wprowadzone zmiany
1. `.github/workflows/core-engine.yml`: naprawiono brak wyzwalania na push do `main` (poprzednio tylko `core/stage1-*`); dodano `core/**`, `pull_request: main`, `workflow_dispatch`, uprawnienia `contents: read` i osobne, rozliczalne jobs `engine-tests`, `lexical-audits`, `offline-parity`, `release-gate` (Node 22). Weryfikacja standalone jest **odczytowa**, realizację GUI wykonuje osobny agent.
2. `tests/ci-workflow.test.js`: regresje triggerów, prawa tylko do odczytu, wywołania istniejących skryptów `package.json`.
3. `tools/coverage-a1-lib.mjs`: uwzględnienie grupy `modals` i sprawdzanie, czy leksykalne odwołania `concept`, `operator`, `grammaticalFunction` naprawdę występują w CORE.
4. `tests/coverage-a1.test.js`: regresja pokazująca modalne leksemy, nieistniejący operator i brak fałszywej wartości procentowego A1. Dokumentacja `docs/g1-ci-audit.md`, `docs/coverage-a1.md`, README, ROADMAP, docs/README.

### Wyniki rzeczywiście sprawdzone
- Lokalny Node **22.16.0**, npm **10.9.2**: `node --test tests/ci-workflow.test.js` **4/4** PASS na dokładnym workflow i `package.json` odtworzonych w minimalnym katalogu lokalnym. To **nie** jest cały `npm test`.
- Izolowane wykonanie JS `tests/coverage-a1.test.js` na repozytoryjnych pakietach z G1: **4/4** PASS. Raport: 52 leksemy EN, 47 PL, po 2 modalne; `cefr.percentage:null`. To **nie** jest Node CLI `check:coverage`.
- `npm test` (pełne), `npm run check:release`, `npm run check:standalone` **NIEURUCHOMIONE**. Nie można uznać ich za przechodzące.
- GitHub Actions wciąż zwraca `startup_failure` przed utworzeniem jobs, nawet po poprawce triggerów; run [38561443454](https://github.com/ppotepa/flexLingua/actions/runs/38561443454) dla nowej gałęzi ma `path=BuildFailed`, 0 jobs. Analogicznie [38554469891](https://github.com/ppotepa/flexLingua/actions/runs/38554469891) na wcześniejszym main. Dokładna przyczyna upstream **niepotwierdzona**. Brak uprawnień connectora do ustawień Actions/billing, a lokalny kontener nie może rozwiązać DNS `github.com`. Szczegóły w [issue #9](https://github.com/ppotepa/flexLingua/issues/9).

### Otwarte — kolejny najmniejszy batch G1b
1. Właściciel repo w GitHub Settings → Actions → General (i ewentualnych ograniczeniach rozliczeniowych) oraz ewentualnie GitHub Support wyjaśnia `startup_failure`. Nie zgadywać przyczyny; uruchomić ręcznie workflow na main po przywróceniu jobs.
2. Uzyskać rzeczywiste logi wszystkich czterech jobs i `npm test`, `check:release`, `check:standalone`, poprawić odkryte regresje.
3. Brakująca morfologia produktywna F3 w osobnym mikrobatchu z niezależnym gold, nie ruszać GUI; uzgodnić z GUI agentem synchronizację wersji offline.
4. Po każdej partii `HANDOFF.md`, osobny PR, squash merge bez force push, raport wyłącznie faktycznie wykonanych testów.

**Ten batch G1a jest częściową naprawą konfiguracji + audytem, a nie zamknięciem G1 ani wydaniem.**

## G1a — scalenie PR #10 i stan blokady CI (checkpoint 2026-10-14)

- **PR #10 scalony do main:** https://github.com/ppotepa/flexLingua/pull/10, commit implementacji `012dd501220c40fd10abc109430116e6bdcafd25`. Poprawiono wyzwalacze GitHub Actions na `main` / `core/**` / PR i rozdzielono cztery zadania kontrolne. Audyt A1 zlicza teraz modalne leksemy i waliduje CORE `concept/operator/grammaticalFunction`. Nie modyfikowano GUI.
- Testy rzeczywiście wykonane: `node --test tests/ci-workflow.test.js` w minimalnym lokalnym środowisku Node 22.16.0 — **4/4 PASS**; izolowane testy JS `tests/coverage-a1.test.js` na danych G1 — **4/4 PASS**. **Nie jest to pełne npm test ani wydanie**.
- Krytyczna blokada potwierdzona **również po mergu**: Actions [run 38562898573](https://github.com/ppotepa/flexLingua/actions/runs/38562898573), HEAD `012dd501220c40fd10abc109430116e6bdcafd25`, `startup_failure`, `BuildFailed`, **0 jobs**. Przyczyna poza workflow nadal niepotwierdzona. [Issue #9](https://github.com/ppotepa/flexLingua/issues/9) śledzi diagnostykę Settings → Actions / polityk / ograniczeń / kontaktu z supportem.
- **G1 NIE JEST ukończony:** do wykonania `npm test`, `check:lexicon`, `check:morphology`, `check:gold`, `check:coverage`, `check:standalone`, `check:release` w pełnym checkoutcie i rzeczywistym Node. Dopiero potem zmienić status w README/ROADMAP, koordynować synchronizację offline przez odrębnego agenta GUI.
- Następny mały batch `G1b`: po przywróceniu jobs Actions lub dostępu do pełnego lokalnego checkoutu uruchomić prawdziwe testy, naprawić regresje, podać SHA/logi, aktualizować `HANDOFF.md`. W międzyczasie możliwy niezależny batch gold dla F3 (nie należy maskować blokady CI).
- Właśnie zapisany dokument `docs/g1-ci-audit.md` zawiera też post-merge status. Przed kolejną pracą pobierz aktualny HEAD. HEAD przed tym checkpointem `2cee19918ef182c0c2698d37880255fc3d5a6ecb`; zapis tego pliku utworzy nowy commit.

## F3b — produktywna morfologia czasowników z cząstką, checkpoint 2026-10-14

- **Baza prac:** `main` `af312e6e3ee68faa4a912f9d89bbf3c3268d4adc`. Po publikacji PR i merge ustalić najnowszy HEAD. Nie stosować force push.
- **Zmiany:** `js/core/morphology/operations.js` (`appendStem` z bezpieczną walidacją), pakiety `data/morphology/{en,pl}.json` (10 bindingów, współdzielone paradygmaty), autorski `tests/fixtures/gold-multiword-morphology-f3.json` (55 oczekiwanych komórek), `tests/multiword-morphology-f3.test.js` (6 grup), `npm run check:gold-multiword`, README/ROADMAP/docs.
- **Weryfikacja rzeczywista:** 6/6 nowych grup testowych w izolowanym JS na aktualnej ontologii i pakietach, 55 komórek i odwrotne analizy; `materializeInflections(...,{assertLegacy:true})` zachowuje zgodność wcześniejszych jawnych form. Strukturalnie: 35 wiązań, 86 form EN; 35 wiązań, 455 form PL. To nie jest `npm test` uruchomiony w Node.
- **Niewykonane:** `npm test`, `check:release`, `check:standalone`, pełny CI Node. GitHub Actions nadal wcześniej zgłaszało `startup_failure`, issue #9. Przyczyna nie jest potwierdzona; potrzeba konta właściciela repo lub działających runnerów.
- **Podział pracy:** zero HTML/CSS/GUI; osobny agent GUI odpowiada za wyświetlanie odmian i synchronizację `index-standalone.html`. Nie twierdzić, że offline jest już spójne.
- **Następny mikrobatch G1b:** pełny checkout Node i rzeczywiste CI, naprawa ujawnionych regresji i raport wyników; potem A1 gold sentences i wiarygodna miara, bez zmyślonego procentu.
