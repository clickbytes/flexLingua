# Etap 1 / Batche C–F — kontrakt roboczy INTER 1.20

**Stan na 13 października 2026:** PR #1 został scalony do `main` jako `2933cfa`. Jest to kod źródłowy silnika; synchronizacja `index-standalone.html` należy do osobnego agenta GUI. **Pełne `npm test` i `check:release` nie zostały wykonane**: GitHub Actions zgłosił `startup_failure` przed startem zadań. Izolowany test 15 przykładów w wykonaniu modułów JS przeszedł, ale nie zastępuje całej regresji Node.

## C — modalność, czas teraźniejszy

Dwa operatorowe odniesienia `modality.ability` oraz `modality.obligation` są zadeklarowane w `data/concepts.json` jako niezależne od języków. `type: modality`, `version: 1.20` przyjmuje `operator` i `operand` (zdarzenie `event` albo w przypadku zakazu `scope(not, event)`). `type: scope` z `operator: not` i operandem modalnym zapisuje brak możliwości lub brak obowiązku:

- `ABILITY(P)` — `The girl can see the dog.` / `Dziewczynka może widzieć psa.`
- `NOT(ABILITY(P))` — `The girl cannot see the dog.` / `Dziewczynka nie może widzieć psa.`
- `OBLIGATION(P)` — `The girl must see the dog.` / `Dziewczynka musi widzieć psa.`
- `NOT(OBLIGATION(P))` — `The girl does not have to see the dog.` / `Dziewczynka nie musi widzieć psa.`
- `OBLIGATION(NOT(P))` — `The girl must not see the dog.`; brak autoryzowanego odpowiednika w aktualnym kontrolowanym pakiecie PL, zatem tłumaczenie do PL ma **jawnie się nie udać**.

Są obsługiwane wybrane pytania `can`, `kto`/`who` i `co`/`what` z już istniejącym schematem `question`. Syntaktyczna negacja polska wpływa na przypadek dopełnienia, ale zdarzenie semantyczne pozostaje dodatnie wewnątrz operatora modalnego. Nie dodajemy fałszywego `targetRole` ani syntetycznego uczestnika pytania. Typy CORE i brakujące role są walidowane przed realizacją. Zakres: wybrane zdarzenia, 3. osoba, liczba pojedyncza/mnoga, teraźniejszość. Brak bezpiecznej obsługi czasu przeszłego, wszystkich negowanych pytań i pełnego systemu modalności epistemicznej.

Przykład uproszczonego dokumentu (właściwości zdarzenia i uczestników muszą spełniać pełny istniejący schemat):

```json
{
  "version": "1.20",
  "type": "scope",
  "operator": "not",
  "operand": {
    "version": "1.20",
    "type": "modality",
    "operator": "modality.obligation",
    "operand": {
      "version": "0.2",
      "type": "event",
      "concept": "event.visual_perception",
      "roles": {
        "agent": { "concept": "person.girl", "features": { "number": "singular", "definiteness": "definite" } },
        "theme": { "concept": "animal.dog", "features": { "number": "singular", "definiteness": "definite" } }
      },
      "features": { "tense": "present", "polarity": "positive", "aspect": "unknown" }
    }
  }
}
```

## D — parser o ograniczonej kompozycyjności

`Engine.analyzeSentence` najpierw próbuje pełnego odczytania atomowego. Dopiero w razie niepowodzenia szuka granic poprawnych gramatycznie fragmentów wokół językowo zdefiniowanego spójnika (`and`/`i`), zamiast bezwarunkowo przecinać tekst w każdym wystąpieniu. Budżety: maksymalnie 8 segmentów kandydackich, 4 poprawne klauzule, 16 kombinacji oraz istniejące limity analiz i głębokości (maksymalnie 5 warstw w drzewie semantycznym). Koordynacja dopuszcza zwykłe zdarzenia, modalności i ich zakresy negacji. Szerokie `NOT(A AND B)` pozostaje oddzielne od `NOT(A) AND B`. To nie jest parser swobodnego języka ani nie obsługuje dowolnej rekurencji.

## E — jawne odniesienia, tylko fundament

Nowe opcjonalne `context.coreference` mapuje `eN.role` → `eM.role`, np. `{"e2.agent":"e1.agent"}` dla dwóch kolejnych zdań. `createDiscourse(events, {coreference})` dzieli wówczas wskazane referencje przez jeden identyfikator encji. Warunki: wyłącznie wcześniejsza wzmianka, zgodne kompletne reprezentacje semantyczne i zweryfikowana składnia mapy; bez zgadywania tożsamości przez identyczną pisownię. Stare dokumenty `discourse` zachowują dotychczasowy format i domyślnie tworzą różne encje. **Nie ma automatycznej analizy zaimków `she/he/ona/on`, pamięci pomiędzy niezależnymi wywołaniami API ani pytań doprecyzowujących; Batch E jest częściowy.**

## F — pierwsze wielowyrazowe konstrukcje leksykalne

- `event.visual_attention`: `look at` / `patrzeć na` — różne od `event.visual_perception` (`see` / `widzieć`).
- `event.raise_object`: `pick up` / `podnosić` — z ograniczeniem typowym do roli `physical_object`.

Obie realizacje korzystają z tych samych ramek, reguł odmiany i INTER. Przy `patrzeć na` przypadek dopełnienia pozostaje biernikiem także przy negacji (`nie patrzy na książkę`), podczas gdy `nie podnosi książki` przyjmuje dopełniacz. Pytania WH o dopełnienie czasownika przyimkowego zostały wyłączone do czasu niezależnego modelu ekstrakcji przyimków; nie generujemy gramatycznie wadliwych odpowiedzi. Tylko te dwa sensy stanowią początek Batch F, a nie kompletna lista czasowników frazowych.

## Testy i kryteria publikacji

Zestawy: `tests/modalities-v1.20.test.js`, `tests/composition-v1.20.test.js`, `tests/context-coreference-v1.20.test.js`, `tests/multiword-v1.20.test.js`, `tests/fixtures/gold-modality-v1.20.json`, a także wszystkie historyczne testy pytań, morfologii, CORE JSON i regresji. Wymagane przed scaleniem `npm test`, `npm run check:release`, sprawdzenie nowego `main`, ocena wyników oraz synchronizacja offline przez agenta GUI. Zmiany są izolowane od interfejsu użytkownika; nie dopisywano nieprzetestowanej obsługi do artefaktu offline.

## Kolejne kroki

1. Uzyskać uruchomienie pełnych testów Node i wyeliminować wszystkie regresje.
2. Uzupełnić Batch E: rzeczywistą analizę zaimków, pamięć referencji pomiędzy wypowiedziami i jednoznaczne doprecyzowanie zamiast zgadywania.
3. Rozszerzyć Batch F o kontrolowane odmienne typy konstrukcji wielowyrazowych, oddzielając operator składniowy od sensu CORE.
4. Po przeglądzie i synchronizacji standalone przejść do Batch G — niezależnie mierzalnego pakietu A1.

## Addendum: mikrobatch F2 — kontrolowane pytania z przyimkiem

Osobny pakiet F2 rozwija parser pytań o rolę `theme` dla `event.visual_attention`. W angielskim zachowuje przyimek `at` na końcu `look at`; w polskim przesuwa rządzony `na` przed `co` i usuwa go z postaci czasownika tylko w konstrukcji WH (`Na co patrzy dziewczynka?`). Obsługuje wybrane warianty modalne `can`, czas przeszły i przeczenie. Błędne polskie `Co patrzy na dziewczynka?` jest odrzucane. Niewymienione tu przyimki i konstrukcje WH nie są deklarowane jako obsługiwane. Testy: `tests/prepositional-wh-v1.21.test.js` oraz zaktualizowany `tests/multiword-v1.20.test.js`.
