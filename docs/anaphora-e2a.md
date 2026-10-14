# E2a — kontrolowane zaimki podmiotu w dwóch zdaniach

**Data:** 2026-10-13  
**Stan:** mikrobatch E2a, etap 1 — kod źródłowy PL/EN/INTER. Nie obejmuje GUI, offline standalone, swobodnej anafory ani pamięci pomiędzy wywołaniami.

## Semantyka

Parser umożliwia anaforę wyłącznie w **drugim z dokładnie dwóch zdań oznajmujących**, gdy podmiot drugiego zdania zaczyna się od jawnie zadeklarowanego zaimka. Na teraz:

| EN | PL | Dozwolony poprzednik CORE |
|---|---|---|
| she | ona | `person.girl` |
| he | on | `person.boy` |

Mapowania są w `data/grammar/en.json` i `data/grammar/pl.json` jako `anaphora.subjectPronouns`; gramatyka waliduje składnię, typy konceptów i dostępność aktywnych form rzeczownikowych. To celowo wąska lista: `person.woman` i `person.mother` mają hasła leksykalne, ale w aktualnym trybie bez produktywnej morfologii nie mają wszystkich aktywnych form w adapterze. Nie zgadywać form ani zachowania dodatkowych języków.

## Przebieg

1. Rozpoznaj jedynie zaimek w pierwszej pozycji zdania nr 2. Brak autowykrywania języka.
2. Parsuj pierwsze zdanie istniejącym adapterem gramatyki, nie opieraj się na surowych słowach. Sprawdź wszystkie jego semantyczne role.
3. Wybierz poprzednik tylko gdy **dokładnie jedna rola semantyczna** we wszystkich odczytaniach spełnia kontrolowane pojęcie, liczbę pojedynczą i tożsamość. W razie 2 potencjalnych wzmianek, np. `The girl sees the girl. She ...`, zgłoś `AMBIGUOUS_ANAPHORA`; w razie braku — `UNRESOLVED_ANAPHORA`.
4. Zamień zaimek tymczasowo na gramatyczną frazę nominalną generowaną przez istniejące reguły, aby ponownie użyć `parseClause`. Druga reprezentacja `event` odzyskuje **dokładnie ten sam referent semantyczny**, nawet gdy powierzchniowy rodzajnik różni się od wcześniejszego (np. `a girl`).
5. Utwórz normalny dokument `discourse` ze współdzielonym ID w dwóch rolach, przez istniejące `createDiscourse` i `coreference`. W dokumentach CORE nie przechowujemy angielskiego ani polskiego zaimka.

## Przykłady

- `The girl sees the dog. She sees the cat.` → `Dziewczynka widzi psa. Dziewczynka widzi kota.`
- `The boy sees the girl. She sees the cat.` → `Chłopiec widzi dziewczynkę. Dziewczynka widzi kota.`
- `Chłopiec widzi dziewczynkę. Ona widzi kota.` → `A boy sees a girl. A girl sees a cat.`
- `The girl sees the girl. She sees the dog.` → `AMBIGUOUS_ANAPHORA`.
- `The boy sees the dog. She sees the cat.` → `UNRESOLVED_ANAPHORA`.

**Ważne:** realizacja w języku docelowym **powtarza rzeczownik zamiast zaimka** i dodaje ostrzeżenie. Tak zachowujemy znaczenie bez niepotwierdzonego generowania form. Docelowe generowanie zaimków jest osobnym zadaniem E2b.

## Jawne ograniczenia

Nieobsługiwane: pierwszoosobowe i drugoosobowe zaimki, liczba mnoga, dopełnienia zaimkowe, więcej niż dwa zdania, modalne lub podrzędne pierwsze klauzule, pamięć między wywołaniami, automatyczne rozpoznawanie kobiet/mężczyzn spoza whitelist, domyślne powiązania, łączenie ręcznego `context.coreference` z zaimkami. Dodatkowe zdania nie są automatycznie przekształcane. Nie zmieniono semantycznej wersji zdarzeń ani formatu pytań.

Wciąż zachowujemy polisemię innych ról: `The girl sees the bank. She sees the cat.` pozostawia dwa różne odczytania `bank`; w obu zaimek odnosi się do tej samej dziewczynki.

## Testy i dalsza praca

- `tests/anaphora-e2a.test.js` — 6 niezależnych grup testowych, w tym obie strony PL/EN, niejednoznaczność, brak poprzednika, zachowanie polisemi i błędna konfiguracja reguł.
- W izolowanym interpreterze JavaScript: **16/16** grup testowych E2a+E1+historyczny kontekst przeszło.
- **Nie uruchomiono** pełnego `npm test`, `npm run check:release` ani sprawdzenia standalone. Zewnętrzny klon GitHuba z lokalnego kontenera nie jest możliwy (DNS); CI GitHub Actions wcześniej zwracał `startup_failure`. Izolowana weryfikacja nie zastępuje Node CLI.
- Dalszy mikrobatch **E2b**: deklaratywny wybór i kontrolowana realizacja zaimka w zdaniu wynikowym dla już współdzielonych referentów, z regułami bezpiecznej odmowy i bez regresji dla eksplicytnych map `coreference`. Po nim: dalsza anafora z kontekstem obejmującym więcej niż dwa zdania i kontrola przynależności encji.
