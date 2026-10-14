# F3 — rozszerzenie wielowyrazowych konstrukcji PL/EN

**Data:** 2026-10-14  
**Status:** implementacja źródłowa na osobnej gałęzi; nie jest pełnym pakietem CEFR ani automatycznym tłumaczem swobodnych tekstów.

## Sensy CORE

Wprowadzono trzy niezależne od języka pojęcia zdarzeń:

| Znaczenie CORE | Angielski leksem | Polski leksem | Rząd polski |
| --- | --- | --- | --- |
| `event.search` | look for | szukać | dopełniacz (gen) |
| `event.auditory_attention` | listen to | słuchać | dopełniacz (gen) |
| `event.wait_for_entity` | wait for | czekać na | biernik (acc) po rządzonym `na` |

`event.auditory_attention` dziedziczy semantyczne role `agent/theme` z `event.perception`. Pozostałe ramki deklarują uczestników w neutralnej ontologii. Rozróżniono `look for` (poszukiwanie) od istniejącego `look at` (kierowanie uwagi wzrokowej): nie są synonimami. Nie tworzono tabel sztywnych odpowiedników całych zdań.

Formy PL i EN oraz kanoniczne odniesienia CORE dodano do `data/pl.json`, `data/en.json`. Ramki składniowe należą do `data/grammar/`. Wykorzystują istniejący wspólny parser `js/core/grammar.js`, reguły fleksji, do-support, negację, pytania WH, a także modalne `can/móc`. Nie wymagały rozbudowy GUI.

## Przykłady kontrolowane

```text
The girl looks for the dog.      → Dziewczynka szuka psa.
The girl listens to the boy.     → Dziewczynka słucha chłopca.
The girl waits for the boy.      → Dziewczynka czeka na chłopca.
What does the girl look for?     → Czego szuka dziewczynka?
What does the girl listen to?    → Czego słucha dziewczynka?
What does the girl wait for?     → Na co czeka dziewczynka?
What can the girl wait for?      → Na co może czekać dziewczynka?
```

Polskie `szukać` i `słuchać` wymagają genitive również przy przeczeniu. `czekać na` pozostawia biernik po przyimku, a przy pytaniu przenosi rządzone `na` przed `co`. Nie mnożymy operatorów INTER dla powierzchniowej pozycji przyimka. Czas i polaryzacja pozostają cechami zdarzenia, a cel pytania `theme` jest niezapełnioną rolą.

## Kontrprzykłady i ograniczenia

Brak reguły dla niepoprawnych układów `What does the girl wait?`, `Dziewczynka czeka chłopca`, `Czego czeka dziewczynka?` czy `The girl looks the dog for`. Parser powinien odmówić, nie usuwać tokenów ani zgadywać znaczenia. Nie implementujemy swobodnego przemieszczania cząstek, idiomów, czasowników separowalnych ani szerokich klas rządu przyimków.

**Morfologia (aktualizacja F3b):** pierwotnie leksemy miały tylko jawne formy w słowniku; nowy [mikrobatch F3b](multiword-morphology-f3.md) dodaje wiązania w `data/morphology/*` dla 10 czasowników (w tym starsze `look at/pick up`). Test gold sprawdza 55 komórek i analizę odwrotną. Nie jest to pełne pokrycie morfologii ani zaliczenie wydania.

## Testy

`tests/multiword-f3.test.js` (6 grup) i historyczne `tests/multiword-v1.20.test.js` (5 grup), `tests/prepositional-wh-v1.21.test.js` (5 grup). Izolowane wykonanie JavaScript: **16/16 grup przeszło**. Przed scalenieniem i wydaniem wymagane realne `npm test`, `npm run check:lexicon`, `npm run check:morphology`, `npm run check:release` i synchronizacja standalone przez właściciela GUI. Bieżący kontener z Node nie ma DNS do github.com; wcześniejsze GitHub Actions zwracało `startup_failure`. Nie traktować izolowanego V8 jako pełnej regresji Node.

## Następne prace

Stage 1 po E2b–E3–E4–F3 ma źródłowe, ograniczone implementacje. Następnym etapem jest G1: uruchomienie i naprawa prawdziwych testów CI, audyt kontraktów i synchronizacja offline z agentem GUI. Dopiero później poszerzać A1/A2 i zakres konstrukcji wielowyrazowych.
