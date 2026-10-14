# flexLingua — kontrakt zarządzania backlogiem (2026-10-14)

**Aktywne repozytorium:** `clickbytes/flexLingua`. Inne konta/repo są historyczne; nie tworzyć tam nowych issues i PR.

## Struktura

- `[EPIC][P0|P1|P2|P3][AREA] ...`: wartość, granice, Definition of Done, lista odnośników `- [ ] #...`.
- `[TASK][P0|P1|P2|P3][AREA] ...`: mały niezależny rezultat, kotwice plików, realne testy, kryteria.
- `[BUG]`, `[SPIKE]`: odpowiednio reprodukcja/regresja oraz decyzja/ADR.
- Zależności zapisuje się dwukierunkowo: `Parent: #...` w tasku, lista tasków w epic; `Blocked by` z prawdziwymi numerami.
- Stałe identyfikatory `REL-01`, `PERS-04` etc są osobnym kluczem, mapowanym na numer issue w `docs/planning/BACKLOG.md`.
- Native GitHub sub-issue, custom label i milestone nie są konfigurowane automatycznie przez dostępny connector. Relacje checklist+backlink mają działać także bez nich.
- Po skonfigurowaniu w UI można dodać etykiety `type:epic`, `type:task`, `type:bug`, `type:spike`, `priority:P0/P1/P2/P3`, `area:core/data/qa/gui/research`; brak etykiet nie uniemożliwia planowania.
- P0 = blokada wydania lub bezpośredni fundament MVP; P1 = następne istotne batche; P2 = po MVP; P3 = dalsze prace planistyczne, bez dat obietnicy.

## Definition of Ready (przed rozpoczęciem)

- [ ] Jedna zmiana obserwowalna; kontekst i definicja używanego sensu CORE.
- [ ] Konkretne pliki (nowe oznaczone `[NEW]`) i zakres bez GUI/CORE cross-ownership.
- [ ] Minimum trzy testowalne AC, w tym pozytywny i negatywny przebieg, gdy kod językowy.
- [ ] Zależności `Blocked by` i właściciel obszaru; brak cudzych sekretnych danych/licencji.
- [ ] Decyzje architektoniczne mają ADR lub najpierw `[SPIKE]`; nie implementować nieustalonego semantycznego kontraktu.

## Definition of Done — TASK

- [ ] AC na issue spełnione; testy obejmują obie strony PL/EN oraz podstępną odmowę, gdy dotyczy.
- [ ] Prawdziwe wyniki Node/GitHub Actions z run URL i SHA; nie nazywaj isolated JS odpowiednikiem `npm test`.
- [ ] `npm test`, odpowiednie `check:gold-*` i `check:release` albo jawny istniejący blocker z numerem issue.
- [ ] Zaktualizowano odpowiednie docs/README/ROADMAP oraz `HANDOFF.md` w tym samym PR.
- [ ] Dla leksyki: CORE sense, słowniki, role/ramy, morfologia, autorski gold, provenance/licencja.
- [ ] Brak przypadkowych zmian `index.html`, `js/ui/**`, `index-standalone.html` w PR agenta CORE.
- [ ] Mały branch → PR → sprawdzenie aktualnego HEAD → bezpieczny squash merge, bez force push.
- [ ] Jeśli GUI nadal ma niezaliczone testy, **release nie jest green**; issue może być zakończone z dowodem braku nowych regresji, ale epik wydania pozostaje otwarty.

## Definition of Done — EPIC

- [ ] Wszystkie jego nieodroczone, powiązane TASK zamknięte z dowodami.
- [ ] Obserwowalny artefakt, test integracyjny, odmowy i dokumentacja działają.
- [ ] Powiązane epiki/issue nie mają niezidentyfikowanych blockerów.
- [ ] Przed zamknięciem zmierzono wynik oraz ograniczenia; nie certyfikowano A1–C2 fikcyjnym procentem.
- [ ] GUI owner zatwierdził offline gdy epic obejmuje wydanie, UI lub zmieniony model źródła.

## Dowody i wydania

Aktualna bazowa migawka planowania: `f3f1a62af1777d7cca4afc52fe3a0b13ad1fed25`.
Hosted [CI run #38620219789](https://github.com/clickbytes/flexLingua/actions/runs/38620219789): `npm test=405/405`; `engine-tests`, `lexical-audits`, `offline-parity` i `release-gate` zakończyły się sukcesem. Historyczny wynik 398/401 dotyczy awarii GUI sprzed [PR #84](https://github.com/clickbytes/flexLingua/pull/84). GUI #1 nadal otwarte do formalnego odbioru.
Referencje: `docs/migration-clickbytes.md`, `docs/a1-evidence-ledger.md`, `docs/development-workflow.md`, `ROADMAP.md`.

## Aktualizacja realnego CI po GUI PR #84

[Run #38616320178](https://github.com/clickbytes/flexLingua/actions/runs/38616320178) dla `main` SHA `33132c5c` potwierdza 401/401 testów Node, `lexical-audits`, `offline-parity` i `release-gate` **success**. Stan przyszłych tasków i ich dowodów musi pochodzić z konkretnych nowych runów. GUI #1 formalnie pozostaje otwarte do właścicielskiego zamknięcia.
