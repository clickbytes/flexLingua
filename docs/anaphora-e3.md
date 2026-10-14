# E3 — kontrolowany dyskurs 3–8 zdań

**Data:** 2026-10-14  
**Status:** implementacja mikrobatcha E3 w silniku źródłowym; pełne testy Node i standalone pozostają osobnymi bramkami.

## Zakres

E3 rozwija istniejący mechanizm E2a/E2b i E1 na ograniczony, jednoznaczny kontekst w jednym tekście liczącym od 3 do 8 zdań oznajmujących. Używane są istniejące znaczenia INTER, rozdzielone pakiety PL/EN, kod normalnej odmiany i `createDiscourse` — bez trenowania LLM i bez list par gotowych zdań.

- Rozpoznawane w języku źródłowym zaimki podmiotu: `she/he`, `ona/on`, w zdaniach po pierwszym, tylko dla `person.girl` i `person.boy`.
- Kandydaci na poprzednika pochodzą ze **wszystkich wcześniejszych zdarzeń**, a nie automatycznie z najbliższego. Wiele wzmianek jednej już połączonej encji jest traktowanych jako jeden poprzednik, ale różne encje o pasującym zaimku tworzą `AMBIGUOUS_ANAPHORA`.
- Gdy brak poprzednika lub obsługiwanej struktury gramatycznej: `UNRESOLVED_ANAPHORA`; nie tworzymy fikcyjnych uczestników.
- Zachowywane są pozostałe polisemiczne odczytania, np. dwa sensy `bank`, o ile nie kolidują z koreferencją.
- Budżet: maksymalnie 8 zdań z `MAX_DISCOURSE_EVENTS`, do 16 kolejnych kandydatur po każdym etapie. To kontrolowana wiązka, nie nieograniczony parser.
- `pronounRealization:'safe'` działa opcjonalnie również w dalszych zdaniach. Jeżeli dokładnie **jeden wcześniejszy identyfikator encji** jest zgodny z danym zaimkiem, generujemy go. W przeciwnym razie wynik zachowuje rzeczownik i ostrzeżenie.
- Domyślny `pronounRealization:'repeat'` nie generuje zaimków. Stare tłumaczenia bez zaimków i bez `context.coreference` nie zyskują automatycznych połączeń encji.

## Przykłady

```text
The girl sees the dog. She sees the cat. She sees the book.
→ Dziewczynka widzi psa. Ona widzi kota. Ona widzi książkę.

The boy sees the girl. She sees the dog. He sees the cat.
→ Chłopiec widzi dziewczynkę. Ona widzi psa. On widzi kota.

The girl sees the dog. The girl sees the cat. She sees the book.
→ AMBIGUOUS_ANAPHORA
```

W powyższych poprawnych przykładach przekazano `pronounRealization:'safe'`. W składni INTER `discourse` identyczne role korzystają z jednego identyfikatora w `entities`; nie wpisujemy zaimka jako osobnego znaczenia.

## Ograniczenia

Nieobsługiwane: zaimki dopełnienia, wielokrotne konstrukcje względne w kolejnych zdaniach, zapytania, modalne lub zagnieżdżone zdarzenia jako samodzielne składniki dyskursu E3, 9+ zdań, anafora dotycząca encji bez aktywnych form, mieszanie ręcznych `context.coreference` i automatycznych zaimków źródłowych w jednym wywołaniu oraz niezależne rozmowy API (E4).

Nie ma automatycznej inferencji tożsamości z powtórzonego rzeczownika: zdania `The girl ... The girl ...` wciąż wprowadzają dwie oddzielne encje, o ile użytkownik nie podał jawnej mapy. Nowy silnik nie przenosi kontekstu między wywołaniami.

## Testy

- `tests/anaphora-e3.test.js`: sześć grup dla wielozdaniowych łańcuchów, różnych uczestników, odmowy przy niejednoznaczności, polisemi, limitu ośmiu zdań i ręcznych linków.
- `tests/anaphora-e2b.test.js`, `tests/anaphora-e2a.test.js`: zachowanie dotychczasowego API i odpowiedzi, przy dostosowaniu jednego starszego kontrprzykładu, który stał się legalnym przypadkiem E3.
- Izolowane wykonanie V8: **17/17** grup E3, E2b i E2a zaliczonych. Pełne `npm test` i `check:release` nie zostały uruchomione (GitHub DNS niedostępny z lokalnego kontenera). Synchronizacja `index-standalone.html` należy do agenta GUI.

**Następna mała partia E4:** sesyjny `ConversationContext` z jawnym wywołaniem, ograniczonym stanem, kopiowaniem danych i resetem. Nie utożsamiać pamięci operacyjnej między wywołaniami z trwałą pamięcią osobowości.
