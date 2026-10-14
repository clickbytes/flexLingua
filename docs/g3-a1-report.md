# G3 — mierzalny raport ograniczonego pilota A1

**Data:** 2026-10-14. **Silnik:** PL ↔ INTER/CORE ↔ EN, offline i Node 22+. **Zakres raportu:** strukturalny manifest 13 pojęć + 32 oryginalne przypadki gold i 8 nieobsługiwanych. Nie jest to formalne pokrycie CEFR A1.

## Uruchomienie

```sh
npm run report:a1
npm run check:a1-gold
npm run report:a1 -- --output /tmp/flexlingua-a1.json
```

Pierwszy skrypt emituje JSON; drugi uruchamia go w trybie `--strict` i kończy kodem niezerowym, jeżeli dowolny przypadek zostanie błędnie przetłumaczony, źle zmapowany do CORE, niespójny semantycznie przy reanalizie lub błędnie zaakceptowany. Opcjonalne `--output` zapisuje raport poza repo. Nie wymaga npm install ani serwisów sieciowych.

## Pola

- `structural`: obecność leksykalnych odniesień PL/EN, wiązań paradygmatów i zadeklarowanych konstrukcji; stan inwentarza, nie dowód poprawnego użycia.
- `behavioral`: wyniki na **skończonym, jawnie określonym korpusie** (po kierunku, rodzaju konstrukcji, szczegółowych kontrolach powierzchni/CORE); 8 odmów pod kategorią `unsupported`.
- `sampleEvidence`: przecięcie pojęć obecnych w dwóch małych zestawach kontrolnych, z jawną listą brakujących pojęć. Nie liczymy tego jako procentu A1.
- `cefr.percentage: null`, `release.verified: false`: brak reprezentatywnego mianownika i potwierdzenia Actions/standalone. Ten status nie staje się zielony nawet gdy korpus 40/40 przechodzi lokalnie.

## Automatyzacja i granice

`check:a1-gold` dodano do jobs `lexical-audits` i `check:release`, a `tests/report-a1-g3.test.js` uruchamia bezpośrednio raport i CLI Node. Należy nadal testować pełne `npm test` i `check:standalone` na kompletnym checkoutcie. Ostatni sprawdzony push po PR #12 dał [38584238248](https://github.com/ppotepa/flexLingua/actions/runs/38584238248) `startup_failure` (0 jobs), co **nie dowodzi regresji raportu**. Następne kroki G1b wymagają diagnozy ustawień Actions przez właściciela repo, a artefakt standalone aktualizuje odrębny agent GUI.
