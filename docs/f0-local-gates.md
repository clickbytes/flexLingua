# F0 / Batch 1 — lokalna walidacja bramek CORE

**Archiwalny raport:** opisuje wcześniejszy problem `startup_failure` i lokalny runner. Actions później uruchomił pełny release gate. Aktualny zakres bramek wynika z `package.json` i `.github/workflows/core-engine.yml`; standalone nie jest wspierany.

## Implementacja

`npm run check:core-local` uruchamia sekwencyjnie jako osobne procesy Node:
1. `tools/check-lexicon.mjs`
2. `tools/check-morphology.mjs`
3. `tools/verify-gold.mjs`
4. `tools/report-a1.mjs --strict`
5. `node --test tests/coverage-a1.test.js`
6. **pełny** `node --test tests/*.test.js` (pliki odkrywane dynamicznie)

Runner zbiera wyniki bramek i emituje JSON zawierający exit code, błędy, ograniczony log i czas. Zwraca kod wyjścia 1, jeżeli jakikolwiek check nie przejdzie. Nie używa `npm install`, sieci, LLM ani usług zewnętrznych. Historyczny wariant `--include-standalone` został usunięty; bieżącą listę testów określa konfiguracja projektu.

## Rzetelność walidacji

Dodano testy planu, odmów, błędów i propagacji awarii `tests/core-gates-f0.test.js`. Dla pełnego wyniku konieczny jest checkout repo z Node 22+. Repo nie jest dostępne do klonowania w tym środowisku (brak DNS github.com), zatem **nie należy twierdzić, że cały npm test przeszedł**. Lokalny raport nie potwierdza GitHub Actions ani wydania; wynik `githubActionsVerified:false`, `releaseVerified:false` pozostaje jawny nawet przy lokalnym `status: pass`.

## Dalsze czynności

W chwili sporządzenia raportu Actions nie uruchamiało jobów. Ten blocker został później rozwiązany i nie jest bieżącym zadaniem. Artefakt offline oraz jego osobne issue GUI zostały wycofane.
