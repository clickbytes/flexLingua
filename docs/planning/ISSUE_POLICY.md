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

### Zakres językowy A1

- Zakres A1 projektu przechowujemy w wersjonowanej, autorskiej macierzy. Każda jednostka ma stabilny identyfikator, status `required` / `deferred` / `unsupported`, sens CORE, wymagania mapowania PL/EN i morfologii oraz gold albo jawną lukę.
- Konstrukcja wymaga także ramy gramatycznej w PL i EN. Status zakresu nie zastępuje statusu implementacji ani wyniku testu.
- CEFR i Oxford są punktami odniesienia. Nie kopiujemy list, definicji ani przykładów bez praw/licencji; autorska macierz nie jest mianownikiem pełnego poziomu CEFR i nie uzasadnia procentu biegłości.
- Zmiana macierzy wymaga aktualizacji jej dokumentacji i `ROADMAP.md` w tym samym PR. Status pracy i linki do dowodów utrzymuj w powiązanym issue/PR.

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
- [ ] Zaktualizowano odpowiednie docs/README/ROADMAP w tym samym PR; status, SHA i Actions są zapisane w powiązanym issue/PR.
- [ ] Dla leksyki: CORE sense, słowniki, role/ramy, morfologia, autorski gold, provenance/licencja.
- [ ] CORE nie modyfikuje `index.html` ani `js/ui/**`; GUI pozostaje osobnym obszarem własności.
- [ ] Mały branch → PR → sprawdzenie aktualnego HEAD → bezpieczny squash merge, bez force push.
- [ ] Jeśli GUI nadal ma niezaliczone testy, **release nie jest green**; issue może być zakończone z dowodem braku nowych regresji, ale epik wydania pozostaje otwarty.

## Definition of Done — EPIC

- [ ] Wszystkie jego nieodroczone, powiązane TASK zamknięte z dowodami.
- [ ] Obserwowalny artefakt, test integracyjny, odmowy i dokumentacja działają.
- [ ] Powiązane epiki/issue nie mają niezidentyfikowanych blockerów.
- [ ] Przed zamknięciem zmierzono wynik oraz ograniczenia; nie certyfikowano A1–C2 fikcyjnym procentem.
- [ ] GUI owner zatwierdził zmiany interfejsu, gdy epic obejmuje UI.

## Dowody i wydania

Aktualna bazowa migawka planowania: `d355d877ae56cc159612ec0280810f0040d5d360`.
Hosted [CI run #38635488680](https://github.com/clickbytes/flexLingua/actions/runs/38635488680) na `main` SHA `d355d877ae56cc159612ec0280810f0040d5d360`: wszystkie trzy jobs zakończyły się sukcesem po merge PR #91. Standalone i jego kontrola zostały usunięte w PR #89; każdy nowy PR wymaga własnego runu na dokładnym SHA.
Referencje: `docs/migration-clickbytes.md`, `docs/a1-evidence-ledger.md`, `docs/development-workflow.md`, `ROADMAP.md`.

## Aktualizacja realnego CI po GUI PR #84

[Run #38616320178](https://github.com/clickbytes/flexLingua/actions/runs/38616320178) dla `main` SHA `33132c5c` historycznie potwierdził 401/401 testów Node i sukces wszystkich ówczesnych jobs. Bieżący status i dowody tasków muszą pochodzić z runu dla konkretnego SHA.
