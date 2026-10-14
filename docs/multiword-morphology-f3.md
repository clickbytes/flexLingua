# F3b — produktywna morfologia czasowników wielowyrazowych (PL/EN)

**Stan:** źródłowy mikrobatch morfologii i niezależny zestaw gold; nie jest to pełne wydanie ani potwierdzenie CEFR A1.
**Zakres:** wyłącznie pakiety językowe, silnik morfologii, testy i dokumentacja. **Bez zmian w GUI i standalone HTML.**

## Cel

Uzupełnić brakujące wiązania morfologiczne pięciu par zdarzeń (10 leksemów), aby istniejące gramatyki PL/EN i analizator form miały spójną reprezentację. Nie wprowadzamy tłumaczenia bezpośredniego PL→EN ani nowych par zapamiętanych zdań.

| INTER | EN | PL |
| --- | --- | --- |
| `event.visual_attention` | `look at` | `patrzeć na` |
| `event.raise_object` | `pick up` | `podnosić` |
| `event.search` | `look for` | `szukać` |
| `event.auditory_attention` | `listen to` | `słuchać` |
| `event.wait_for_entity` | `wait for` | `czekać na` |

## Implementacja

- `js/core/morphology/operations.js`: nowa walidowana operacja **`appendStem`**, dołączająca wskazaną nazwą końcową cząstkę ze `stems`. Bez dynamicznego kodu czy wyrażeń JS, z istniejącymi limitami długości i walidacją klucza.
- `data/morphology/en.json`: współdzielony paradygmat `en.verb.regular_particle`. Najpierw odmienia podstawowy czasownik, potem dołącza ` at`/` up`/` for`/` to`. Pozwala to utworzyć `looks for`, nie `look fors`.
- `data/morphology/pl.json`: współdzielony `pl.verb.third_person_particle` rozszerzający logikę regularnych komórek osobowych. Formy `patrzyła na`, `czekali na` pochodzą z odmiany tematu czasownika i końcowego przyimka. Pozostałe trzy czasowniki używają dotychczasowego `pl.verb.third_person`.
- Wszystkie 10 wiązań odnoszą się do już istniejących leksemów i ich referencji CORE; kanoniczne pliki `data/{pl,en}.json` pozostają niezmienione. Nie usuwamy jawnych form stanowiących niezależny oracle dla `materializeInflections(...,{assertLegacy:true})`.

## Zestaw gold

`tests/fixtures/gold-multiword-morphology-f3.json` zawiera **55 ręcznie opisanych oczekiwanych komórek**, po 4 angielskie i 7 polskich na każdą parę. `tests/multiword-morphology-f3.test.js` sprawdza:

1. Powiązania wszystkich dziesięciu leksemów z odpowiednim pojęciem CORE.
2. 55 oczekiwanych powierzchni słów (nie tylko test generator→analizator).
3. Poprawne odtworzenie każdej komórki przez analizator odwrotny.
4. Zgodność wygenerowanych form z istniejącymi jawnymi formami słownikowymi.
5. Nieprawidłowe `appendStem`, brakujące stems i końcówki przyimkowe.
6. Regresje wcześniej istniejących czasowników i rozróżniania znaczeń.

~~~sh
npm run check:gold-multiword
npm run check:morphology
npm test
npm run check:release
~~~

## Wyniki i ograniczenia

W izolowanym środowisku JavaScript wykonano kod morfologii na faktycznych danych z repozytorium: **6/6 grup testów przeszło**, sprawdzając 55 niezależnych form i odwrotne analizy. Liczba w pakietach zwiększyła się do **35 związanych leksemów i 86 form EN** oraz **35 leksemów i 455 form PL**. Te liczby to licznik konkretnych form wygenerowanych przez silnik, nie miara pokrycia CEFR.

**Nie wykonano pełnego Node `npm test`, `check:release` ani `check:standalone` na checkout repo.** GitHub Actions dotąd zgłaszało `startup_failure` przed uruchomieniem jobów — [issue #9](https://github.com/ppotepa/flexLingua/issues/9). Realna bramka wydaniowa pozostaje otwarta.

Dodane reguły obejmują tylko opisane leksemy/komórki (angielski: baza, 3. os. lp/lm, przeszłość; polski: 3. osoba i wybrane formy czasu przeszłego). Nie są kompletnym analizatorem wszystkich czasowników ani systemem odmieniania dowolnych zwrotów. GUI i wygenerowany standalone są zarządzane przez **osobnego agenta** i nie są modyfikowane w tym mikrobatchu.

## Następny krok

G1b: pełny checkout/Node CI, `npm test`, raporty weryfikacji wersji, kontrola parytetu offline przez agenta GUI. Potem A1 gold sentences i niezależna miara poziomu. Aktualny rozdział jest dokumentacją **zawartości źródłowej**, nie potwierdzeniem wydania.
