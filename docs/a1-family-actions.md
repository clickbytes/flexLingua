# A1 / Batch 3 — rodzina, czytanie i pomaganie

**Data:** 2026-10-14. **Właściciel:** CORE, leksykony PL/EN, morfologia, gramatyka, gold, docs — bez zmian w GUI.

## Dodane pojęcia neutralnego CORE

- `person.sister`, `person.brother`: nowe znaczenia osób; osobne leksemy polskie `siostra`, `brat` i angielskie `sister`, `brother`.
- `event.read`: zdarzenie czytania z rolami `agent:person`, `theme:physical_object`. Wykorzystuje kontrolowaną ramę agent + czasownik + obiekt; nie oznacza pełnej semantyki treści czytania.
- `event.help`: zdarzenie pomagania `agent:person`, `theme:person`. PL rząd celownikowy (`pomaga bratu`), EN dopełnienie bez przyimka (`helps a brother`). Żadnych bezpośrednich par tekstowych w silniku.

Dodano dwa czasowniki `czytać/read` oraz `pomagać/help` z formami czasu teraźniejszego i przeszłego; angielski czas przeszły `read` jest jawnie zadeklarowany jako wyjątek. Dwa nowe rzeczowniki mają wiązania paradygmatów, w tym 10 świadomych wyjątków dla `brat/bracia` i 3 dla `siostra/siostrze/sióstr`.

## Dowód i ograniczenia

`tests/fixtures/gold-family-actions-a1.json` to niezależnie zapisane 16 autorskich zdań w obu kierunkach, 18 komórek fleksyjnych i 4 przypadki odmowy. `tests/family-actions-a1.test.js` testuje zwykły adapter, adapter morfologiczny, odwrotną analizę form, zachowanie sensu INTER oraz błędną walencję lub przypadek. `npm run check:gold-family` działa samodzielnie i jest dodane do `check:release` i `lexical-audits` w CI.

Cel `event.movement` nadal nie ma polskiej realizacji, `person.father` pozostaje niezaimplementowany, a nowe pojęcia nie zwiększają automatycznie poziomu CEFR A1. Opublikowany wcześniej rejestr luk `npm run audit:a1-gaps` wykryje zmiany w strukturach, ale dopóki nowe zdania nie są częścią jego G2 gold, może nadal oznaczać `without-gold` — to świadome rozdzielenie benchmarków, nie dowód braku testów w odrębnym pliku.

## Status wydania

W chwili sporządzenia raportu wszystkie zmiany wymagały rzeczywistej walidacji Node i CI; późniejsze pełne testy i hosted release runy przeszły. Standalone i powiązany podział własności zostały wycofane.

## Udokumentowana niejednoznaczność angielskiego read

`The sisters read the books.` to dwie poprawne interpretacje pisowni angielskiej: czas teraźniejszy i przeszły. Silnik obecnie wybiera domyślnie `Siostry czytały książki.` (past), ale zachowuje `Siostry czytają książki.` (present) w `semanticAlternatives`. Oracle kontroluje **obie**, zamiast udawać automatyczne odgadnięcie czasu. Dla jawnego czasu teraźniejszego można użyć w gold formy trzeciej osoby `The sister reads…`.

## Kompatybilność z audytem poprzedniego batcha

`tests/a1-gap-audit.test.js` pozostaje częścią regresji i został dostosowany do faktycznego stanu: nowe cztery znaczenia mają już bilingwalną leksykę, produktywną morfologię oraz (dla zdarzeń) ramy składniowe, ale status `without-gold` w **raporcie G2** utrzymuje się, gdyż testy z osobnej próbki rodzinnej nie są tam zliczane. Brakujące `person.father` i polskie `event.movement` nadal figurują jako luki.

## Dodatkowa ochrona CI i zakres analizy semantycznej

Testy CI weryfikują obecność `check:gold-family` w job `lexical-audits` oraz `check:release`. Regresje nowych zdań wymagają zachowania nie tylko sensu zdarzenia, ale także ról agenta/obiektu, czasu i negacji w każdej stronie tłumaczenia. Zamrożone testy znaczeń nie mierzą znajomości całego A1.
