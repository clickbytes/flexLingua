# flexLingua — proponowana kolejność realizacji

## Stan walidacji w aktywnym repo

Bazowy `clickbytes/main` SHA `04aeaa811453e8aa8054779af6a903e24dd4e953` jest **GREEN** w [GitHub Actions #38639074374](https://github.com/clickbytes/flexLingua/actions/runs/38639074374): wszystkie trzy jobs przeszły po merge PR #93. Standalone HTML i jego test parytetu zostały usunięte; UI działa przez loopback HTTP. Każdy nowy commit wymaga osobnego Actions runu.


**To plan zależności, nie harmonogram kalendarzowy.** Nie twierdzi, że taski zostały wykonane. `clickbytes/flexLingua` pozostaje jedynym repo do zapisu.

## Gotowe do rozpoczęcia (brak formalnych blockerów)

- **REL-01 [#18](https://github.com/clickbytes/flexLingua/issues/18)** — inwentaryzacja CI z rzeczywistych logów. Nie zależy od naprawy GUI.
- **VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26)** — rejestr legalności/pochodzenia materiałów językowych. Można wykonać równolegle z REL-01.

## Ścieżka krytyczna P0 — jakość i pierwsza osoba

1. [REL-01 #18](https://github.com/clickbytes/flexLingua/issues/18) → [REL-02 #19](https://github.com/clickbytes/flexLingua/issues/19) → [REL-03 #20](https://github.com/clickbytes/flexLingua/issues/20). GUI-01 #1 zamknięto przez PR #89 po wycofaniu standalone i potwierdzeniu testów Studio.
2. [REL-01 #18](https://github.com/clickbytes/flexLingua/issues/18) → [REL-04 #21](https://github.com/clickbytes/flexLingua/issues/21) — walidacja bezpieczeństwa, limitów i testów zasobów.
3. [VAL-05 #26](https://github.com/clickbytes/flexLingua/issues/26) → [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) — zamrożony zakres A1, legalność źródeł.
4. [VAL-01 #22](https://github.com/clickbytes/flexLingua/issues/22) → [PERS-01 #27](https://github.com/clickbytes/flexLingua/issues/27): ADR dla speaker/addressee i form 1./2. osoby.
5. [PERS-01 #27](https://github.com/clickbytes/flexLingua/issues/27) → [PERS-02 #28](https://github.com/clickbytes/flexLingua/issues/28) (**scalone w PR #89**) → [PERS-03 #29](https://github.com/clickbytes/flexLingua/issues/29) (**scalone w PR #90**) → [PERS-04 #30](https://github.com/clickbytes/flexLingua/issues/30) (**scalone w PR #91**): jawne zaimki, zgodność osoby/liczby oraz polska fleksja.
6. [PERS-04 #30](https://github.com/clickbytes/flexLingua/issues/30) (**spełnione**) → [PERS-05 #31](https://github.com/clickbytes/flexLingua/issues/31) (**scalone w PR #92**) → [PERS-06 #32](https://github.com/clickbytes/flexLingua/issues/32) (**scalone w PR #93**): niezależny gold osoby 1./2., deiksy i integracja modalności.
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
- [GUI #17](https://github.com/clickbytes/flexLingua/issues/17): dalsze prace nad Studio, słownikiem i dialogiem; ustalony podział zakresu CORE/UI pozostaje w backlogu.

## Przed rozpoczęciem każdego TASK

1. Zweryfikować `Blocked by`, rodzica, zakres per plik, kryteria AC i bieżący `main`.
2. Mały branch, najpierw niezależny gold (PL→CORE→EN oraz EN→CORE→PL) i negatywne przykłady, potem kod.
3. Nie mylić morfologii językowej z neutralnym CORE; nie zgadywać płci, aspektu, źródeł ani certyfikacji CEFR.
4. Uruchomić komponentowe Node tests i full `npm test`; dokumentować rzeczywiste wyniki Actions wraz z SHA.
5. Aktualizować docs/README/ROADMAP, gdy zmiana tego wymaga; status, SHA i Actions zapisywać w powiązanym issue/PR. CORE nie zmienia źródeł GUI.
6. Bieżący `check:release` przechodzi na main; zachować wszystkie bramki i aktualizować status na podstawie runu dla konkretnego SHA.
