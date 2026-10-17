# Autorski zakres A1 flexLingua

**Wersja zakresu:** 2 · **Stan:** wymagany, ograniczony zestaw projektu · **Języki:** PL ↔ CORE ↔ EN

Ten dokument opisuje wewnętrzny, celowo ograniczony zestaw celów. Nie jest kompletnym zakresem CEFR A1, certyfikacją poziomu ani kopią listy Oxford. CEFR i Oxford służą wyłącznie jako punkty odniesienia; repozytorium nie zawiera skopiowanych list, definicji ani przykładów z tych źródeł. Nie wyliczamy procentu pokrycia CEFR z tej macierzy.

Maszynowym źródłem prawdy jest [`data/coverage/a1-targets.json`](../data/coverage/a1-targets.json). Każdy wiersz ma stabilny identyfikator zakresu, status zakresu, wymagany sens CORE, wymagania mapowania PL/EN, morfologii i — dla konstrukcji — ramę gramatyczną. `npm run audit:a1-gaps` sprawdza te wymagania i pokazuje wewnętrzny gold albo jawną lukę dla zamrożonego fixture'u G2.

## Statusy i reguły odbioru

`scopeStatus` ma trzy dozwolone wartości:

- `required` — jednostka należy do tej wersji wewnętrznego zestawu.
- `deferred` — rozpoznany kandydat odłożony poza ten zestaw.
- `unsupported` — jawnie wykluczony z obsługi produktu; brak implementacji sam w sobie nie uzasadnia tego statusu.

W tej wersji wszystkie 23 jednostki są `required`: 16 pojęć i 7 konstrukcji. Nie ma wpisów `deferred` ani `unsupported`, ponieważ backlog nie wskazuje zatwierdzonej listy odroczeń ani wykluczeń. Kandydatów można dodać dopiero z identyfikatorem, sensem CORE oraz jawnymi wymaganiami i lukami.

Wymagania dla każdego wymaganego celu:

1. Identyfikowalny sens CORE (`concept`), niezależny od formy językowej.
2. Mapowanie leksykalne PL i EN oraz jawnie wymagane wiązanie morfologii.
3. Dla konstrukcji: rama gramatyczna PL i EN.
4. Co najmniej jeden zaliczony przypadek w wewnętrznym G2 albo luka `gold:not-exercised` w raporcie. G2 zawiera 32 przypadki przekładu i 8 odmów; pokrycie w tym fixture nie zastępuje goldów osobnych batchy. Autorzy próbek uczestniczyli w rozwoju projektu, więc wynik nie jest niezależnym benchmarkiem ani potwierdzeniem poziomu CEFR.

Status wykonania w raporcie (`pilot-exercised`, `without-gold`, `missing-*` itd.) jest odrębny od `scopeStatus`. Wymagany, ale nieprzetestowany cel pozostaje wymagany i widnieje jako luka.

## Wymagane pojęcia — 16

| Obszar | Identyfikatory | Status |
| --- | --- | --- |
| Osoby | `person.girl`, `person.boy`, `person.child`, `person.woman` | `required` |
| Rodzina | `person.mother`, `person.sister`, `person.brother`, `person.father` | `required` |
| Zwierzęta, rzeczy | `animal.dog`, `animal.cat`, `object.book`, `object.apple` | `required` |
| Miejsca | `structure.house`, `institution.school` | `required` |
| Opisy | `quality.big`, `quality.small` | `required` |

## Wymagane konstrukcje zdarzeniowe — 7

Każdy identyfikator zakresu `construction.event.*` wskazuje przez `coreRef` na niezależny sens zdarzenia w CORE. Jego mapowanie obejmuje leksykę, morfologię i ramę walencyjną obu języków.

| Identyfikator zakresu | Wymagany sens CORE | Status |
| --- | --- | --- |
| `construction.event.visual_perception` | `event.visual_perception` | `required` |
| `construction.event.transfer_possession` | `event.transfer_possession` | `required` |
| `construction.event.movement` | `event.movement` | `required` |
| `construction.event.write` | `event.write` | `required` |
| `construction.event.read` | `event.read` | `required` |
| `construction.event.help` | `event.help` | `required` |
| `construction.event.open` | `event.open` | `required` |

`drink` jest poza zamrożoną macierzą 23 celów: plik [`a1-targets.json`](../data/coverage/a1-targets.json) zawiera 16 pojęć i 7 konstrukcji. Sens `event.drink` jest używany przez osobną rodzinę EN→CORE→PL A1-ENPL-03, bez dopisywania go do G2 ani do tej listy celów.

## Osobny rejestr rodzin konstrukcji EN→PL

Rejestr [`a1-enpl-constructions.json`](../data/coverage/a1-enpl-constructions.json) jest źródłem rodzin 01–06 i planowanych 08–12. Batch 07 obsługuje dowody, nie jest rodziną tłumaczeniową. `implementationStatus` pochodzi z rejestru, a `evidenceStatus` w `constructionCoverage.families` jest wyliczany z rzeczywistych fixture/case ID i wyniku suite w `npm run report:a1-evidence` lub `npm run check:a1-evidence`. Status `planned` pozostaje jawną luką; tryb katalogowy oznacza wykonanie jako `not-run`.

To są kontrolowane kontrakty implementacyjne, nie pełny zakres CEFR A1. Każdy wykonany batch wymaga niezależnie zapisanego golda, uzasadnionych odmów i testu nowych kombinacji; próbki autorów projektu nie są niezależnym benchmarkiem.

## Pochodzenie i ograniczenia

Macierz jest autorskim artefaktem projektu, a jej pochodzenie i status licencji są zapisane w [`data/provenance.json`](../data/provenance.json). Oznaczenie `project-authored` nie stanowi osobnej deklaracji licencji SPDX. Zmiana zakresu wymaga aktualizacji macierzy, tego opisu, [raportu pokrycia](coverage-a1.md), [roadmapy](../ROADMAP.md) i zasad DoR/DoD w tym samym PR.
