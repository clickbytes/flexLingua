# A1 / Batch 4 — ojciec ↔ father

**Data:** 2026-10-14. Nowy neutralny sens `person.father` dziedziczy po kategorii `person`. Leksemy `pl.ojciec.1` i `en.father.1` wskazują tylko na ten sens; silnik nie zawiera zapamiętanych par zdań.

## Odmiana i semantyka
PL `ojciec/ojca/ojcu/ojcem/ojcze`, liczba mnoga `ojcowie/ojców/ojcom/ojcami/ojcach` są realizowane przez istniejący paradygmat rzeczownika ożywionego z jawnymi wyjątkami. Angielskie `father/fathers` wykorzystuje regularny paradygmat. `pomagać` zachowuje celownik, a `read/help/see` nie wymagają nowych typów CORE.

Autorski plik `tests/fixtures/gold-father-a1.json` zawiera 16 par w dwóch kierunkach, 16 ręcznie zatwierdzonych komórek liczby/przypadku i 4 przykłady odmowy. `npm run check:gold-father` sprawdza tłumaczenie i zgodność ról/czasu, z i bez produktywnej morfologii, odwrotne rozpoznanie form oraz serializację CORE. Test został dodany do CI i release gate. Nie kopiowano Oxford.

## Granice
Nie wprowadzono dzierżawczości („mój ojciec”), zdrobnień, wyrażeń rodzinnych ani pełnej kompetencji A1; `cefr.percentage` pozostaje `null`. Istniejący `audit:a1-gaps` wykryje zmianę `person.father` z `unmodelled` na `without-gold` (ponieważ raport liczy tylko korpus G2). Full `npm test` i `check:release` są nadal blokowane przez GitHub Actions `startup_failure`; offline standalone prowadzi oddzielny agent GUI (#16).
