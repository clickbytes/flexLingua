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
| `construction.event.drink` | `event.drink` | `required` |

## Osobna macierz konstrukcji EN→PL

Powyższe 23 pozycje nie wyczerpują podstawowych konstrukcji zdaniowych. Ta
macierz śledzi rodziny konstrukcji EN→CORE→PL osobno, bez zmiany wyniku ani
zakresu istniejącego fixture'u G2. „Wymagany batch” oznacza mały kontrakt
implementacyjny, a nie pełny zakres A1.

| Rodzina konstrukcji | Batch | Stan w repozytorium |
| --- | --- | --- |
| Proksymalne `this` jako zaimek oraz określenie rzeczownika | A1-ENPL-01 | Obsługiwane w liczbie pojedynczej; demonstratywne formy PL mają jawne uzgodnienie. |
| Predykacja cechy: `This book is small.` | A1-ENPL-01 | Obsługiwana w czasie teraźniejszym, z zachowaniem modyfikatora w CORE. |
| Predykacja klasowa: `This is a book.` | A1-ENPL-01 | Osobny kierunkowy węzeł CORE `classification`; nie używa `identity`. |
| Sense `simple` „nieskomplikowany pod względem struktury, projektu lub użycia” | A1-ENPL-01 | Obsługiwany; nie utożsamia się z sensem „łatwy”. |
| Przeczenie `be/have` i pytania yes/no dla predykacji/posiadania | A1-ENPL-02 | Obsługiwane w teraźniejszości; inne typy pytań i czasy pozostają poza zakresem. |
| Niepoliczalne napoje bez rodzajnika (`water`, `milk`, `coffee`, `tea`) jako dopełnienie `drink` | A1-ENPL-03 | Obsługiwane w EN→CORE→PL i PL→CORE→EN; ograniczone do jawnej listy napojów i ramy `drink`. Inne napoje, gołe NP poza tą ramą i gołe rzeczowniki policzalne pozostają odrzucane. |
| Egzystencjalne lokatywy: `there is/are` + jawne `in/on/at` | A1-ENPL-04 | Obsługiwane pozytywnie w czasie teraźniejszym przez stan CORE `location`; polska realizacja zachowuje relację i referenty. Negacja, pytania i brak jawnej lokacji pozostają odrzucane. |
| Zaimki anaforyczne bez dostępnego antecedensu | A1-ENPL-05+ | Poza zakresem tej macierzy; nierozwiązane odniesienie jest jawnie odrzucane. |
| Dodatnia predykacja cechy w czasie przeszłym: `The book was small.` | A1-ENPL-05 | Obsługiwana w PL↔CORE↔EN dla rzeczownikowych podmiotów z pięcioma klasami zgody. Przeszłe przeczenie, pytania i inne rodzaje stanów pozostają odrzucane. |
| Dodatni angielski present progressive: `am/is/are + V-ing` | A1-ENPL-06 | Sześć jawnych czasowników (`read`, `write`, `eat`, `drink`, `help`, `open`) mapuje się na teraźniejszy aspekt imperfective CORE i polski czas teraźniejszy. PL→EN realizuje polski czas teraźniejszy jako simple present; nie wnioskuje progressive. Przeczenie, pytania, przeszłość i niezadeklarowane czasowniki pozostają odrzucane. |

Statusy tej macierzy nie są wskaźnikiem opanowania CEFR. Każdy batch wymaga
osobnego golda z poprawnymi wynikami, uzasadnionymi odmowami i kontrolą nowych
kombinacji; próbki autorów projektu nie są niezależnym benchmarkiem.

## Pochodzenie i ograniczenia

Macierz jest autorskim artefaktem projektu, a jej pochodzenie i status licencji są zapisane w [`data/provenance.json`](../data/provenance.json). Oznaczenie `project-authored` nie stanowi osobnej deklaracji licencji SPDX. Zmiana zakresu wymaga aktualizacji macierzy, tego opisu, [raportu pokrycia](coverage-a1.md), [roadmapy](../ROADMAP.md) i zasad DoR/DoD w tym samym PR.
