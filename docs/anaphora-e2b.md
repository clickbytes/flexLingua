# E2b — bezpieczna realizacja zaimka podmiotu (opt-in)

**Data:** 2026-10-14  
**Stan:** implementacja silnika na osobnej gałęzi, do scalenia po testach. Nie dotyczy GUI ani artefaktu offline.

## Cel i API

E2a analizuje `he/she`, `on/ona` w drugim zdaniu i zapisuje jeden identyfikator encji w INTER. E2b umożliwia **opcjonalne** wygenerowanie analogicznego zaimka w języku docelowym:

```js
engine.translate({
  text: 'The girl sees the dog. She sees the cat.',
  from: 'en', to: 'pl',
  pronounRealization: 'safe'
});
// Dziewczynka widzi psa. Ona widzi kota.

engine.realize({
  interlingua: validatedSharedDiscourse,
  to: 'en',
  pronounRealization: 'safe'
});
```

Dopuszczalne ustawienia: `'repeat'` (domyślne, zachowuje stare wyniki) oraz `'safe'` (jedynie zweryfikowany zaimek, w przeciwnym razie powtórzenie rzeczownika i ostrzeżenie). Nieznana wartość jest błędem wejścia. To ustawienie jest parametrem **realizacji**, nie polem znaczenia INTER: przy `to: 'core'` otrzymujemy niezmieniony JSON.

## Bezpieczny wybór powierzchni

Dostępne deklaracje gramatyczne `anaphora.subjectPronouns` (tylko `person.girl/person.boy`, 3. osoba, liczba pojedyncza) są jedynym źródłem zaimka. Silnik może zamienić podmiot drugiego z **dokładnie dwóch** zdarzeń na zaimek tylko jeśli:

1. Rola podmiotu drugiego zdarzenia ma identyfikator encji taki sam jak **dokładnie jedna** odpowiednia wzmianka w pierwszym zdarzeniu.
2. W pierwszym zdarzeniu nie ma innej roli, która mogłaby zostać odebrana jako ten sam zaimek powierzchniowy (np. dwie dziewczynki).
3. Pakiet docelowy ma jednoznaczne mapowanie formy zaimka i potrafi go użyć jako podmiotu w pierwszej liniaryzacji zdarzenia.

Dopiero wtedy `js/core/grammar.js` podmienia **pojedynczy slot `agent` w generowanej klauzuli**, zachowując dotychczasowe reguły odmiany, przeczenia, dopełnienia i szyku. Nie stosujemy zamiany substringów gotowego zdania ani zgadywania, że powtórzony rzeczownik oznacza jedną encję. Wynik bezpiecznej realizacji zawiera `pronounizedEvents: [2]`; przy odmowie `pronounizedEvents: []` i ostrzeżenie. Bez ustawienia `safe` zachowujemy dotychczasowy format wyników.

## Przykłady i ograniczenia

- EN → PL: `The boy sees the girl. She sees the cat.` → `Chłopiec widzi dziewczynkę. Ona widzi kota.`
- PL → EN: `Chłopiec widzi dziewczynkę. Ona widzi kota.` → `A boy sees a girl. She sees a cat.`
- Manual `context.coreference: {'e2.agent':'e1.agent'}` może włączyć zaimek po stronie docelowej przy `safe`.
- Bez dowodu współdzielonej encji `The girl sees the dog. The girl sees the cat.` pozostaje dwoma powtórzonymi rzeczownikami.
- Przy `The girl sees the girl. The girl sees the dog.` z wymuszeniem współdzielonego agenta odmów wygenerowania `ona`, ponieważ dwie wcześniejsze role pasują do `ona`; bezpieczny fallback powtarza `dziewczynka`.

**Poza zakresem:** >2 zdania, zaimki innych przypadków, rodzajów lub liczby mnogiej, zamiana zaimków w zdaniach podrzędnych, automatyczna pamięć dialogu, domniemana koreferencja po podobieństwie słów. Rozszerzenia do E3 i E4 wymagają własnej walidacji.

## Testy i status wdrożenia

W izolowanym środowisku JavaScript wykonano **16/16** testów: `tests/anaphora-e2b.test.js`, `tests/anaphora-e2a.test.js` oraz `tests/context-coreference-v1.20.test.js`. Sprawdzono także równoważność INTER przy zmianie `pronounRealization`. **Nie wykonano pełnego `npm test` ani `npm run check:release`** — w kontenerze nie ma dostępu DNS do GitHub, a starsze Actions miały `startup_failure`. Wersja `index-standalone.html` pozostaje zadaniem osobnego agenta GUI.

## Addendum E3 (2026-10-14)

Mikrobatch E3 rozszerza politykę `pronounRealization:'safe'` na 3–8 zdań z już rozpoznanymi identyfikatorami encji. Liczymy **różne poprzednie ID**, nie liczbę wzmianek. Bezpieczne generowanie pozostaje opcjonalne; kryteria w [anaphora-e3.md](anaphora-e3.md). Historyczny zakres E2b powyżej dotyczył dokładnie dwóch zdarzeń.
