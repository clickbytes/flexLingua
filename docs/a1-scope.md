# Autorski zakres A1 flexLingua

**Wersja zakresu:** 2 · **Stan:** wymagany, ograniczony zestaw projektu · **Języki:** PL ↔ CORE ↔ EN

Ten dokument opisuje wewnętrzny, celowo ograniczony zestaw celów. Nie jest kompletnym zakresem CEFR A1, certyfikacją poziomu ani kopią listy Oxford. CEFR i Oxford służą wyłącznie jako punkty odniesienia; repozytorium nie zawiera skopiowanych list, definicji ani przykładów z tych źródeł. Nie wyliczamy procentu pokrycia CEFR z tej macierzy.

Maszynowym źródłem prawdy jest [`data/coverage/a1-targets.json`](../data/coverage/a1-targets.json). Każdy wiersz ma stabilny identyfikator zakresu, status zakresu, wymagany sens CORE, wymagania mapowania PL/EN, morfologii i — dla konstrukcji — ramę gramatyczną. `npm run audit:a1-gaps` sprawdza te wymagania i pokazuje niezależny gold albo jawną lukę dla zamrożonego fixture'u G2.

## Statusy i reguły odbioru

`scopeStatus` ma trzy dozwolone wartości:

- `required` — jednostka należy do tej wersji wewnętrznego zestawu.
- `deferred` — rozpoznany kandydat odłożony poza ten zestaw.
- `unsupported` — jawnie wykluczony z obsługi produktu; brak implementacji sam w sobie nie uzasadnia tego statusu.

W tej wersji wszystkie 23 jednostki są `required`. Nie ma wpisów `deferred` ani `unsupported`, ponieważ backlog nie wskazuje zatwierdzonej listy odroczeń ani wykluczeń. Kandydatów można dodać dopiero z identyfikatorem, sensem CORE oraz jawnymi wymaganiami i lukami.

Wymagania dla każdego wymaganego celu:

1. Identyfikowalny sens CORE (`concept`), niezależny od formy językowej.
2. Mapowanie leksykalne PL i EN oraz jawnie wymagane wiązanie morfologii.
3. Dla konstrukcji: rama gramatyczna PL i EN.
4. Co najmniej jeden zaliczony przypadek w niezależnym G2 albo luka `gold:not-exercised` w raporcie. G2 zawiera 32 przypadki przekładu i 8 odmów; pokrycie w tym fixture nie zastępuje goldów osobnych batchy.

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

## Pochodzenie i ograniczenia

Macierz jest autorskim artefaktem projektu, a jej pochodzenie i status licencji są zapisane w [`data/provenance.json`](../data/provenance.json). Oznaczenie `project-authored` nie stanowi osobnej deklaracji licencji SPDX. Zmiana zakresu wymaga aktualizacji macierzy, tego opisu, [raportu pokrycia](coverage-a1.md), [roadmapy](../ROADMAP.md) i zasad DoR/DoD w tym samym PR.
