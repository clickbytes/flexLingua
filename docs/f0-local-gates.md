# F0 / Batch 1 — lokalna walidacja bramek CORE

**Data:** 2026-10-14. GitHub Actions nadal zgłasza `startup_failure` przed utworzeniem jobów (issue #9). Nie da się naprawić polityk/billing GitHub zmianą kodu JavaScript i brak podstaw, by wskazać przyczynę.

## Implementacja

`npm run check:core-local` uruchamia sekwencyjnie jako osobne procesy Node:
1. `tools/check-lexicon.mjs`
2. `tools/check-morphology.mjs`
3. `tools/verify-gold.mjs`
4. `tools/report-a1.mjs --strict`
5. `node --test tests/coverage-a1.test.js`
6. **pełny** `node --test tests/*.test.js` (pliki odkrywane dynamicznie)

Odczytuje wyniki wszystkich bramek nawet przy wcześniejszym błędzie i emituje JSON zawierający exit code, błędy, ograniczony log i czas. Zwraca kod wyjścia 1, jeżeli jakikolwiek check nie przejdzie. Nie używa `npm install`, sieci, LLM ani usług zewnętrznych. Przy `--include-standalone` (lub `npm run check:core-local-standalone`) dodaje na końcu tylko **sprawdzenie** parytetu `tools/build-standalone.mjs --check` bez przebudowy artefaktu GUI. Wersja pakietu 1.12.0 bez zmian.

## Rzetelność walidacji

Dodano testy planu, odmów, błędów i propagacji awarii `tests/core-gates-f0.test.js`. Dla pełnego wyniku konieczny jest checkout repo z Node 22+. Repo nie jest dostępne do klonowania w tym środowisku (brak DNS github.com), zatem **nie należy twierdzić, że cały npm test przeszedł**. Lokalny raport nie potwierdza GitHub Actions ani wydania; wynik `githubActionsVerified:false`, `releaseVerified:false` pozostaje jawny nawet przy lokalnym `status: pass`.

## Dalsze czynności

Właściciel powinien sprawdzić Actions General, limity billing i szczegóły [issue #9](https://github.com/ppotepa/flexLingua/issues/9); nie zamykać sprawy do czasu wykonania rzeczywistych jobów. Artefakt offline pozostaje zadaniem agenta GUI, [issue #16](https://github.com/ppotepa/flexLingua/issues/16).
