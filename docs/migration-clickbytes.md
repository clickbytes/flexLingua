# Migracja do clickbytes i walidacja GitHub Actions

**Aktywne repozytorium:** https://github.com/clickbytes/flexLingua

Właściciel zdecydował, że od 14 października 2026 wszystkie nowe commity, branche, PR-y, issues, wyniki CI i checkpointy `HANDOFF.md` dotyczą tylko `clickbytes/flexLingua`. Stare `ppotepa/flexLingua` jest archiwalnym źródłem historycznej migawki; **nie wykonywać tam nowych zapisów**. Dotychczasowych historycznych odnośników do PR-ów `ppotepa` nie trzeba przepisywać, ponieważ wskazują istniejące prace.

## Bieżąca baza CI i przypisanie regresji — 2026-10-14

Aktualny `main` to `f3f1a62af1777d7cca4afc52fe3a0b13ad1fed25`. [Hosted run #38620219789](https://github.com/clickbytes/flexLingua/actions/runs/38620219789) zakończył wszystkie cztery jobs sukcesem; `npm test` zgłosił **405/405**.

Historyczny [run #38610233253](https://github.com/clickbytes/flexLingua/actions/runs/38610233253), SHA `d70359ba0d783c32f37eb31cddc6c4abf3ce16e3`, miał 398/401 testów Node oraz niezaliczone offline parity. Zlogowane regresje przypisane do GUI-01 [#1](https://github.com/clickbytes/flexLingua/issues/1):

| Nieudany check / test | Komponent i właściciel | Powiązane issue | Wynik na bieżącym main |
| --- | --- | --- | --- |
| `check:standalone` i test Node #294: offline HTML nie odpowiadał źródłom | Generator / artefakt offline; strumień GUI | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Naprawione w [PR #84](https://github.com/clickbytes/flexLingua/pull/84); bieżące `offline-parity` przechodzi |
| Test #369: checkbox podglądu hipotetycznych form oczekiwał 6 opcji, engine zwracał 7 | Studio UI; strumień GUI | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Naprawione w PR #84; bieżące `npm test` przechodzi |
| Test #371: brakowało szczegółów niezgodności lematu i komórek odmiany | Studio UI; strumień GUI | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Naprawione w PR #84; bieżące `npm test` przechodzi |

Nie ma obecnie czerwonych testów do reprodukcji. Issue #1 pozostaje otwarte tylko do formalnego odbioru właściciela GUI; nie należy opisywać dawnych 398/401 jako bieżącego stanu.

## Import

- Kopia plików starego źródła na commit `64e3795b7fd8b0ced5d84b52fce44c86106ad54f` została zaimportowana na `clickbytes` commit `17a9b255783027890cc56dcd8141782a40212f7b`.
- Sprawdzono **dokładną równość Git tree SHA** `f21ccb19d3a1b1616d4ffea11d4d77f1ed572839` w obu repozytoriach: 158 plików, w tym workflow, testy, docs, kod CORE i istniejący GUI. To **nowa historia repozytorium**, nie mirror całej historii commitów.
- Zmiany w GUI, HTML/CSS/JS/UI oraz generowanym `index-standalone.html` nadal należą do osobnego agenta GUI. CORE agent może uruchamiać walidację i zgłaszać problemy w CI, ale nie aktualizuje artefaktu GUI bez przekazania odpowiedzialności.

## Pierwsze prawdziwe CI na clickbytes

- [Actions Startup Probe #38607020509](https://github.com/clickbytes/flexLingua/actions/runs/38607020509): **success**, prawdziwy hosted runner wystartował.
- [Core Engine CI #38607020365](https://github.com/clickbytes/flexLingua/actions/runs/38607020365): Node 22 wystartował, `npm test` wykonało 393 testy — **379 pass / 14 fail**, a nie dawne `startup_failure`.
- Lexical-audits: leksyka, morfologia, G2, rodzina, ojciec i ruch przeszły, ale trzy testy `check:gold-actions` nie; offline-parity wykrył nieaktualny `index-standalone.html`.
- Wśród 14 testów nieudanych: siedem testów serializacji dyskursu (prototypy słowników `entities`/`roles`), dwa testy mutacji gold o zbyt kruchych regexach, jedna stara asercja audytu ojca, jeden test zbyt płytkiego progu zagnieżdżenia, trzy GUI/offline (`tests/offline.test.js` oraz dwa `tests/studio-ui.test.js`).
- CORE patch: po bezpiecznej walidacji nieufnego JSON dyskursu parser odtwarza null-prototype mapy (ochrona i kontrakt API); regresje testów odwołują się do aktualnych ograniczeń. Oddzielny agent musi poprawić GUI/offline.
- Wynik pozostaje **niezweryfikowany jako green release**, dopóki nowy `main` nie przejdzie całego `check:release` i offline.

## Pierwsze wyniki po poprawce CORE

[Run 38607989473](https://github.com/clickbytes/flexLingua/actions/runs/38607989473) na branch `core/ci-real-run-regressions-20261014`: `lexical-audits` **success**, `npm test` **392/395 pass**. Pozostałe trzy nieudane przypadki to wyłącznie GUI/offline: `tests/offline.test.js` oraz dwa w `tests/studio-ui.test.js`; opis i warunki odbioru: [issue #1](https://github.com/clickbytes/flexLingua/issues/1). `check:release` **nie przechodzi** i agregat jest pominięty do czasu naprawy GUI. Zmiana CORE wyeliminowała 11 poprzednich błędów regresji, a dwa nowe testy potwierdzają bezpieczną serializację dyskursu. Nie należy tego przedstawiać jako zielonego pełnego wydania.

