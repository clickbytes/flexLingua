# flexLingua — proponowana kolejność realizacji

## Stan walidacji w aktywnym repo

Bazowy `clickbytes/main` SHA `f3f1a62af1777d7cca4afc52fe3a0b13ad1fed25` jest **GREEN** w [GitHub Actions #38620219789](https://github.com/clickbytes/flexLingua/actions/runs/38620219789): **405/405** Node, lexical-audits, offline-parity i release-gate — wszystkie jobs `success`. Historyczne 398/401 były sprzed naprawy GUI/Windows. GUI #1 pozostaje formalnie otwarte, choć jego kryteria testowe przechodzą po [PR #84](https://github.com/clickbytes/flexLingua/pull/84); trzeba zapisać formalny odbiór. Każdy nowy commit wymaga osobnego runu CI.


**To plan zależności, nie harmonogram kalendarzowy.** Nie twierdzi, że taski zostały wykonane. `clickbytes/flexLingua` pozostaje jedynym repo do zapisu.

## Gotowe do rozpoczęcia (brak formalnych blockerów)

- **REL-01 [#18](https://github.com/clickbytes/flexLingua/issues/18)** — inwentaryzacja CI z rzeczywistych logów. Nie zależy od naprawy GUI.
- **VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26)** — rejestr legalności/pochodzenia materiałów językowych. Można wykonać równolegle z REL-01.

## Ścieżka krytyczna P0 — jakość i pierwsza osoba

1. [REL-01 #18](https://github.com/clickbytes/flexLingua/issues/18) → [GUI-01 #1](https://github.com/clickbytes/flexLingua/issues/1) (naprawione w PR #84; formalny odbiór do zapisania) → [REL-02 #19](https://github.com/clickbytes/flexLingua/issues/19) → [REL-03 #20](https://github.com/clickbytes/flexLingua/issues/20). GUI #1 dotyczy standalone i dwóch regresji Studio, nie zmian CORE.
2. [REL-01 #18](https://github.com/clickbytes/flexLingua/issues/18) → [REL-04 #21](https://github.com/clickbytes/flexLingua/issues/21) — walidacja bezpieczeństwa, limitów i testów zasobów.
3. [VAL-05 #26](https://github.com/clickbytes/flexLingua/issues/26) → [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) — zamrożony zakres A1, legalność źródeł.
4. [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) → [PERS-01 #27](https://github.com/clickbytes/flexLingua/issues/27): ADR dla speaker/addressee i form 1./2. osoby.
5. [PERS-01 #27](https://github.com/clickbytes/flexLingua/issues/27) → [PERS-02 #28](https://github.com/clickbytes/flexLingua/issues/28) → [PERS-03 #29](https://github.com/clickbytes/flexLingua/issues/29): jawne zaimki oraz zgodność osoby/liczby.
6. [PERS-03 #29](https://github.com/clickbytes/flexLingua/issues/29) → [PERS-04 #30](https://github.com/clickbytes/flexLingua/issues/30) + [PERS-05 #31](https://github.com/clickbytes/flexLingua/issues/31) → [PERS-06 #32](https://github.com/clickbytes/flexLingua/issues/32): odmiana i niezależny gold.
7. [PERS-01 #27](https://github.com/clickbytes/flexLingua/issues/27) → [STATE-01 #33](https://github.com/clickbytes/flexLingua/issues/33) → [STATE-02 #34](https://github.com/clickbytes/flexLingua/issues/34) + [STATE-03 #35](https://github.com/clickbytes/flexLingua/issues/35) → [STATE-04 #36](https://github.com/clickbytes/flexLingua/issues/36): być/mieć/tożsamość/posiadanie.
8. [PERS-06 #32](https://github.com/clickbytes/flexLingua/issues/32) + [STATE-04 #36](https://github.com/clickbytes/flexLingua/issues/36) + [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) → [VAL-02 #23](https://github.com/clickbytes/flexLingua/issues/23) → [VAL-03 #24](https://github.com/clickbytes/flexLingua/issues/24): oddzielny held-out, raport jakości.
9. [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) → [VAL-04 #25](https://github.com/clickbytes/flexLingua/issues/25): testy metamorficzne i odmowy, równolegle z rozwijaniem person.

## Następne strumienie P1

- [SPACE #8](https://github.com/clickbytes/flexLingua/issues/8): miejsce/destination/temporal/quantity; wybrane taski czekają na STATE i person.
- [LEX #9](https://github.com/clickbytes/flexLingua/issues/9): następne 20+ sensów, pełne role i morfologia, licencje.
- [GRAM #10](https://github.com/clickbytes/flexLingua/issues/10): zaimki, przymiotniki, zakres negacji, pytania, kompozycja.
- [DIAL #11](https://github.com/clickbytes/flexLingua/issues/11): Dialogue Acts → Session Context → Response Planner → API → wieloturowy gold; nie wdrażać przed kontraktem person/state.

## Dopiero później

- [MEM #12](https://github.com/clickbytes/flexLingua/issues/12): osobowość, pamięć, bezpieczne akcje.
- [A2 #13](https://github.com/clickbytes/flexLingua/issues/13) → [B1/B2 #14](https://github.com/clickbytes/flexLingua/issues/14) → [C1/C2 #15](https://github.com/clickbytes/flexLingua/issues/15): oddzielne matryce poziomów.
- [MULTI #16](https://github.com/clickbytes/flexLingua/issues/16): adaptery dodatkowych języków, TR audit i research źródeł.
- [GUI #17](https://github.com/clickbytes/flexLingua/issues/17): własny backlog osobnego agenta, bez modyfikacji semantyki przez GUI.

## Przed rozpoczęciem każdego TASK

1. Zweryfikować `Blocked by`, rodzica, zakres per plik, kryteria AC i bieżący `main`.
2. Mały branch, najpierw niezależny gold (PL→CORE→EN oraz EN→CORE→PL) i negatywne przykłady, potem kod.
3. Nie mylić morfologii językowej z neutralnym CORE; nie zgadywać płci, aspektu, źródeł ani certyfikacji CEFR.
4. Uruchomić komponentowe Node tests i full `npm test`; dokumentować rzeczywiste wyniki Actions wraz z SHA.
5. Aktualizować docs/README/ROADMAP i `HANDOFF.md` w tym samym PR; nie zmieniać GUI przez agenta CORE.
6. Bieżący `check:release` przechodzi na main; zachować wszystkie bramki i aktualizować status na podstawie runu dla konkretnego SHA.
