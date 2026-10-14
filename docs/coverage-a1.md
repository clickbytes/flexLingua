# A1.0 — structural coverage

`npm run coverage:a1` reports lexemes, CORE senses, morphology bindings, grammar frames and an original 13-concept pilot sample.

This is **not CEFR A1 certification**. `cefr.percentage` is null until there is a legally sourced denominator and independently assessed sentence-level PL→EN and EN→PL tests.

Run `npm run check:coverage` for regression checks. Pilot source: project-authored `data/coverage/a1-pilot.json`, not copied from Oxford.

**Ownership:** engine, data, CLI, tests and docs only. Another agent handles GUI.


## Audyt G1a (2026-10-14)

Inwentarz od teraz zlicza również leksykalne `modals` (po dwa w PL i EN), oddzielając je od leksemów kwalifikujących się do produktywnej odmiany rzeczowników/czasowników/przymiotników. Rejestr sprawdza istnienie powiązań CORE rodzaju `concept`, `operator` i `grammaticalFunction`. W izolowanym wykonaniu na danych z 2026-10-14 strukturalny raport liczył 47 leksemów PL, 52 EN, dwa modale w każdym języku i zachował `cefr.percentage: null`. Nie oznacza to pomiaru pokrycia A1. Zob. [G1 audit](g1-ci-audit.md).

## G2: próbki zdań

Zob. [G2 original corpus](g2-a1-gold.md): 32 kontrolowane tłumaczenia dwukierunkowe i 8 odmów, niezależnie od raportu inwentarza struktur. `cefr.percentage` nadal jest `null`.

## G3: raport połączony

`npm run report:a1` łączy inwentarz strukturalny ze statusem 32 przekładów i 8 odmów oraz podziałem na kierunki i konstrukcje. `check:a1-gold` to ścisła bramka regresji; **nie** oznacza globalnego pokrycia A1. Zob. [raport G3](g3-a1-report.md).

## A1 Batch 2: autorski rejestr luk

`npm run audit:a1-gaps` wypisuje osobno braki w ontologii, słownikach, morfologii, ramach i dowodach gold dla 22 celów kontrolowanego pilotażu. Nie jest mianownikiem CEFR. [Opis](a1-gap-audit.md).

## Po Batch 5

PL/EN `event.movement` jest w leksyce i morfologii, ale inwentarz nie zmienia `translationVerified:false`. Regresję `tests/coverage-a1.test.js` zaktualizowano do faktycznego zakresu.

## Batch 6

Pokrycie strukturalne PL/EN obejmuje teraz `event.write` i `event.open`. Weryfikacja znaczenia znajduje się w oddzielnym gold Batch 6, a `cefr.percentage` pozostaje `null`.
