# Migracja do clickbytes i walidacja GitHub Actions

**Aktywne repozytorium:** https://github.com/clickbytes/flexLingua

Właściciel wskazał `clickbytes/flexLingua` jako jedyne aktywne repozytorium dla commitów, branchy, PR-ów, issues i CI. Osobny checkpoint `HANDOFF.md` nie jest wymagany; aktualny status zapisujemy w issue i PR. Stare `ppotepa/flexLingua` jest archiwalnym źródłem historycznej migawki; nie wykonujemy tam nowych zapisów. Dotychczasowych historycznych odnośników do PR-ów `ppotepa` nie trzeba przepisywać.

## Aktualizacja procesu — 2026-10-14

Bieżąca baza `main` to SHA `b7ea1ef2850971bdd342b3ef76cc8f8843ecbd18`; [Actions #38625444693](https://github.com/clickbytes/flexLingua/actions/runs/38625444693) przeszedł 417/417 testów, w tym historyczny job standalone. W tej gałęzi standalone HTML, generator, test parytetu i job CI są wycofywane; UI działa przez loopback HTTP. Lokalny `npm run check:release` przeszedł 413/413 testów Node oraz 4/4 testy pokrycia. Hosted Actions dla tej zmiany jest wymagane przed merge.

Poniższe zapisy opisują wcześniejszą diagnostykę. Podział na osobnego agenta GUI i dawne zadania synchronizacji offline nie obowiązują.

## Historyczna baza CI i przypisanie regresji — 2026-10-14

Aktualny `main` to `f3f1a62af1777d7cca4afc52fe3a0b13ad1fed25`. [Hosted run #38620219789](https://github.com/clickbytes/flexLingua/actions/runs/38620219789) zakończył wszystkie cztery jobs sukcesem; `npm test` zgłosił **405/405**.

Historyczny [run #38610233253](https://github.com/clickbytes/flexLingua/actions/runs/38610233253), SHA `d70359ba0d783c32f37eb31cddc6c4abf3ce16e3`, miał 398/401 testów Node oraz niezaliczone offline parity. Zlogowane regresje przypisane do GUI-01 [#1](https://github.com/clickbytes/flexLingua/issues/1):

| Nieudany check / test | Komponent i właściciel | Powiązane issue | Wynik na bieżącym main |
| --- | --- | --- | --- |
| `check:standalone` i test Node #294: offline HTML nie odpowiadał źródłom | Dawny generator / artefakt offline | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Historyczna regresja została naprawiona w PR #84; kontrolę parytetu wycofano |
| Test #369: checkbox podglądu hipotetycznych form oczekiwał 6 opcji, engine zwracał 7 | Studio UI; strumień GUI | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Naprawione w PR #84; bieżące `npm test` przechodzi |
| Test #371: brakowało szczegółów niezgodności lematu i komórek odmiany | Studio UI; strumień GUI | [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) | Naprawione w PR #84; bieżące `npm test` przechodzi |

Nie ma obecnie czerwonych testów do reprodukcji. Issue #1 pozostaje otwarte do merge'a, który usuwa wycofany standalone z produktu i procesu; nie należy opisywać dawnych 398/401 jako bieżącego stanu.

## Import

- Kopia plików starego źródła na commit `64e3795b7fd8b0ced5d84b52fce44c86106ad54f` została zaimportowana na `clickbytes` commit `17a9b255783027890cc56dcd8141782a40212f7b`.
- Sprawdzono **dokładną równość Git tree SHA** `f21ccb19d3a1b1616d4ffea11d4d77f1ed572839` w obu repozytoriach: 158 plików, w tym workflow, testy, docs, kod CORE i istniejący GUI. To **nowa historia repozytorium**, nie mirror całej historii commitów.
- Dawny podział na osobnego agenta GUI dotyczył prac opisanych w historycznych runach. Bieżąca aplikacja ma jeden lokalny HTTP entry point; standalone artefakt i jego synchronizacja zostały wycofane.

## Pierwsze prawdziwe CI na clickbytes

- [Actions Startup Probe #38607020509](https://github.com/clickbytes/flexLingua/actions/runs/38607020509): **success**, prawdziwy hosted runner wystartował.
- [Core Engine CI #38607020365](https://github.com/clickbytes/flexLingua/actions/runs/38607020365): Node 22 wystartował, `npm test` wykonało 393 testy — **379 pass / 14 fail**, a nie dawne `startup_failure`.
- Lexical-audits: leksyka, morfologia, G2, rodzina, ojciec i ruch przeszły, ale trzy testy `check:gold-actions` nie; offline-parity wykrył nieaktualny `index-standalone.html`.
- Wśród 14 testów nieudanych: siedem testów serializacji dyskursu (prototypy słowników `entities`/`roles`), dwa testy mutacji gold o zbyt kruchych regexach, jedna stara asercja audytu ojca, jeden test zbyt płytkiego progu zagnieżdżenia, trzy GUI/offline (`tests/offline.test.js` oraz dwa `tests/studio-ui.test.js`).
- CORE patch: po bezpiecznej walidacji nieufnego JSON dyskursu parser odtwarza null-prototype mapy (ochrona i kontrakt API); regresje testów odwołują się do aktualnych ograniczeń. Oddzielny agent musi poprawić GUI/offline.
- Wynik pozostaje **niezweryfikowany jako green release**, dopóki nowy `main` nie przejdzie całego `check:release` i offline.

## Pierwsze wyniki po poprawce CORE

[Run 38607989473](https://github.com/clickbytes/flexLingua/actions/runs/38607989473) na branch `core/ci-real-run-regressions-20261014`: `lexical-audits` **success**, `npm test` **392/395 pass**. Pozostałe trzy nieudane przypadki to wyłącznie GUI/offline: `tests/offline.test.js` oraz dwa w `tests/studio-ui.test.js`; opis i warunki odbioru: [issue #1](https://github.com/clickbytes/flexLingua/issues/1). `check:release` **nie przechodzi** i agregat jest pominięty do czasu naprawy GUI. Zmiana CORE wyeliminowała 11 poprzednich błędów regresji, a dwa nowe testy potwierdzają bezpieczną serializację dyskursu. Nie należy tego przedstawiać jako zielonego pełnego wydania.

