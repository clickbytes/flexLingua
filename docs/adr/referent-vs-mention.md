# ADR: tożsamość referenta a jego wzmianka

- **Status:** Accepted.
- **Data:** 2026-10-17.
- **Zakres:** dyskursowy CORE i jawne koreferencje między wzmiankami.
- **Poza zakresem:** automatyczne rozwiązywanie dowolnej koreferencji, nowy runtime,
  globalne tożsamości między dokumentami oraz zmiany w GUI.
- **Zależności:** #171 / [ADR deiksy](person-deixis.md) oraz #180.

## Decyzja

Przyjmujemy model **ID encji w obrębie dyskursu plus osobne wzmianki**. Identyczne
leksemy, kategorie ani zbiory cech nie są dowodem tożsamości. Współdzielenie
referenta wymaga jawnego linku CORE, rozwiązania jednoznacznego zaimka według
kontraktu #171 albo jawnego mapowania uczestnika rozmowy według #180.

Nowy wire format dyskursu będzie wersją `0.5`. Zachowa tabelę `entities`, a
wartości w slotach ról zdarzenia staną się ID wzmianki. Każda wzmianka będzie
łączyć się przez `entityId` z jedną encją; nierozwiązana wzmianka nie będzie
miała `entityId`. ID encji i wzmianki są lokalne dla jednego dokumentu CORE,
deterministyczne i nie obiecują trwałości między dokumentami ani sesjami.

To wariant B: **per-discourse entity ID + mention**. Wariant A miesza opis NP
z tożsamością, a więc czyni różnicę definiteness błędną różnicą tożsamości.
Wariant C wprowadza uchwyty globalne i cykl życia trwałej tożsamości, którego
obecny CORE nie potrzebuje. Deiktyczne `actor:<id>` z #180 pozostaje jawnym
mechanizmem tożsamości uczestnika rozmowy i nie jest globalnym ID każdej encji.

## Stan obecny i problem

Zwykły uczestnik zdarzenia ma postać `{concept, features}` oraz opcjonalne
`modifiers`, `quantifier`, `relatives`, `demonstrative` i `possessor`. Wzmianka
`a girl` i wzmianka `the girl` mają więc różne wartości `features.definiteness`.
W dyskursie `entities` przechowuje cały taki obiekt, a `events[].roles` wskazuje
na jego klucz `pN`. `sameDiscourseReferent` porównuje pełne, kanonicznie
posortowane obiekty. Jawny link między dwiema różniącymi się wzmiankami zostaje
odrzucony, nawet gdy różni się wyłącznie definiteness.

To zachowanie nie łączy nazw automatycznie i zostaje zachowane w wire format
`0.4`. Zmiana kontraktu dotyczy przyszłego, jawnie wersjonowanego formatu.

Planner odpowiedzi (`responsePlannerVersion: "1.0"`) nie zmienia tego wire
formatu. Dostaje osobny, jawny `referenceContext` mapujący ścieżkę roli na ID;
tylko równe ID pozwalają plannerowi pominąć różnicę `definiteness` podczas
porównania. ID różnych wzmianek i nierozwiązane zaimki nie są łączone na
podstawie podobieństwa tekstu. Szczegóły dopasowania opisuje
`docs/adr/response-planner.md`.

## Właściwości encji i wzmianki

| Dane | Miejsce w modelu | Reguła |
| --- | --- | --- |
| ID referenta | encja `pN` | Jedyny nośnik tożsamości w obrębie dyskursu; powstaje z jawnego linku lub jawnego kontekstu. |
| Typ ontologiczny i ograniczenia walidatora | ograniczenia encji oraz typowane dane wzmianki | Sprawdzają zgodność przypisania; równość typu nie tworzy tożsamości. Sprzeczne typy odrzucają link. |
| Leksem / koncept opisujący osobę lub rzecz | wzmianka | Jest opisem danej wzmianki; powtórzenie nie łączy encji. Zmiana opisu musi przejść kontrolę zgodności. |
| Definiteness, demonstrative, quantifier i modifiers | wzmianka | Zakres frazy, który może się zmienić bez zmiany ID encji. |
| Gramatyczna osoba, rodzaj i liczba zaimka | wzmianka / agreement | Sterują analizą i realizacją. Nie kodują wieku, zawodu ani konkretnej osoby. Liczność semantyczna jest osobnym kontraktem GEN-17 (#195). |
| Possessor | typowana relacja lub dane wzmianki | Nie jest częścią tożsamości posiadanej encji; jego wiązanie pozostaje jawne. |
| Niejednoznaczność lub brak tożsamości | wzmianka bez `entityId` i diagnostyka | Nie tworzy się `person.unknown`, losowego `pN` ani linku z podobieństwa tekstu. |

Przykładowy kształt jest kontraktem projektowym, nie bieżącym JSON-em ani
schematem gotowym do implementacji:

```json
{
  "version": "0.5",
  "type": "discourse",
  "entities": {"p1": {"kind": "entity"}},
  "mentions": {
    "m1": {"entityId": "p1", "description": {
      "concept": "person.girl",
      "features": {"number": "singular", "definiteness": "indefinite"}
    }},
    "m2": {"entityId": "p1", "description": {
      "concept": "person.girl",
      "features": {"number": "singular", "definiteness": "definite"}
    }},
    "m3": {"entityId": "p1", "agreement": {
      "person": "third", "number": "singular", "gender": "feminine"
    }}
  },
  "events": [
    {"id": "e1", "roles": {"agent": "m1"}},
    {"id": "e2", "roles": {"agent": "m2"}},
    {"id": "e3", "roles": {"agent": "m3"}}
  ]
}
```

W przyszłym walidatorze każde ID roli musi wskazywać na jedną wzmiankę, a każda
wzmianka z `entityId` na jedną encję. Jedna encja może mieć wiele wzmianek;
jedna wzmianka nie może wskazywać na dwie encje. Link sprawdza ograniczenia
typowane, nie pełną równość opisu NP. Nie wolno osłabiać walidatora tak, by
niezgodny typ albo nieznane pole przechodziły bez diagnostyki.

## Przykłady tożsamości

Te trzy zdania przedstawiają jednego referenta wyłącznie po jawnym rozwiązaniu
obu zaimków w łańcuchu:

1. `A girl sleeps.` — wzmianka `m1`, nieokreślona fraza, encja `p1`.
2. `The girl sleeps.` — wzmianka `m2`, określona fraza, ta sama encja `p1`.
3. `She sleeps.` — wzmianka `m3` z żeńską zgodą gramatyczną, ta sama `p1`.

Powiązania muszą być jawne, np. `e2.agent → e1.agent` i `e3.agent → e1.agent`.
Różnica `a` / `the` nie tworzy nowej encji; samo podobieństwo `girl` nie
tworzy linku. W obecnym formacie `0.4` pierwsze powiązanie jest odrzucane z
powodu różnicy definiteness — właśnie tę barierę ma usunąć migracja `0.5`.

Dwa takie same leksemy mogą opisywać różne osoby:

```text
A girl sleeps. A girl sleeps.
```

Bez jawnego linku wynik zawiera dwie encje, `p1` i `p2`. Gdy późniejsza
wzmianka `she` ma dwa zgodne, niezależne antecedensy, wynikiem jest
`AMBIGUOUS_ANAPHORA`; najbliższy antecedens ani zgodność leksemu nie rozstrzygają.

## Deikty i odpowiedzialność warstw

- Zgodnie z #171 `she`/`ona` niesie nierozwiązaną referencję i agreement, nie
  `person.girl`. Jednoznaczny, typowo zgodny antecedens może nadać wzmiance
  istniejące ID encji. Brak antecedensu pozostawia ją unresolved; wiele
  antecedensów daje ambiguity. Ten ADR nie zmienia kontraktu E2a/E3.
- Zgodnie z #180 `I` Alice i `I` Bob wskazują różne `actor:<id>` tylko przy
  jawnych `speakerId`; bez ID używa się kotwicy lokalnej dla tury. Dwa napisy
  `I` nie są linkiem do tej samej encji. `speaker` może w innej turze stać się
  `addressee` tej samej osoby tylko z tym samym jawnym ID aktora.
- Parser źródłowy tworzy wzmiankę, zapisuje jawny opis i zgodę, a anaforę
  rozwiązuje tylko wtedy, gdy kontrakt daje jeden antecedens. Powtórzony
  rzeczownik, rodzaj gramatyczny lub zgodny typ nie są samodzielnym dowodem.
- Realizator docelowy wybiera formę z informacji wzmianki i agreement. Może
  zachować zaimek, gdy język docelowy ma bezpieczną realizację; nie dopisuje
  ukrytej nazwy, wieku ani zawodu z ID encji. Jeśli referencja lub wymagana
  zgoda pozostają nieznane, zgłasza alternatywy albo jawnie odmawia.

## Kompatybilność i migracja

1. Walidacja i realizacja istniejących event docs (`0.2`, `0.5`, `0.6`),
   discourse `0.4` oraz pozostałych typów dokumentów `1.x` pozostają bez zmian.
   Parser rozpoznaje wersję po `type` i wersji dokumentu; pole `version` encji
   nie jest wersją dokumentu dyskursu.
2. Nowa postać jest osobnym wire version `0.5`; istniejące `0.4` nie dostaje
   po cichu nowego znaczenia i zachowuje dotychczasowy odczyt/serializację.
3. Jawne linki `eN.role → eM.role` można zachować jako wejściowy kontrakt
   konstruktora. Przy budowie `0.5` rozstrzygają one `mentionId → entityId`.
   Bez linku każde zwykłe wspomnienie rzeczownikowe tworzy osobną encję.
4. Import `0.4` zachowuje istniejące klucze `pN` jako tożsamości i tworzy
   wzmianki dla użyć ról; referent zapisany w `entities[pN]` jest kopiowany do
   każdej wzmianki tego klucza. Stary dokument nie zawierał odrębnych opisów
   tych użyć, więc importer niczego o nich nie dopowiada.
5. JSON round-trip `0.4` pozostaje stabilny; JSON round-trip `0.5` zachowuje
   identyfikatory encji, wzmianek, jawne linki, opisy, agreement i diagnostyki.
   Nie łączy się ID z różnych dokumentów według ich tekstowych wartości.
6. Wdrożenie wymaga jawnego `DISCOURSE_VERSION` bump, wersjonowanej walidacji,
   typed references dla event-role edges i fail-closed obsługi pól nieznanych.
   To osobne zadanie implementacyjne; ten ADR nie modyfikuje runtime.

## Kontrakt regresji i plan testów

| Test | Zabezpieczony kontrakt obecny lub docelowy |
| --- | --- |
| `tests/anaphora-e2a.test.js` | Jeden wcześniejszy antecedens rozwiązuje `he/she/on/ona`; brak kontekstu zachowuje unresolved third person; brak lub konflikt antecedensu ma jawny status. |
| `tests/anaphora-e3.test.js` | Trzy zdania mogą jawnie dzielić jedną encję; dwie pasujące osoby nie wybierają się przez recency; limit ośmiu zdarzeń pozostaje. |
| `tests/context-coreference-v1.20.test.js` | Powtórzony rzeczownik bez linku pozostaje osobny; jawny link działa PL/EN; zły/forward/niekompatybilny link odrzucany; wersja historyczna przechodzi JSON round-trip. |
| conversation / dialogue tests z #180 | Jawne `speakerId` scala tylko wskazanego aktora; różne ID i brak mapowania nie utożsamiają mówców; `speaker` ↔ `addressee` zależy od jawnego ID. |
| nowe testy wdrożeniowe | `a girl` → `the girl` → `she` zachowuje jedno `entityId`, lecz trzy `mentionId`; dwa `a girl` bez linku tworzą dwa entity IDs; zmiana description nie gubi definiteness; type conflict i ambiguity odrzucane; stare `0.4` czytelne i round-tripowalne. |

Wstępny audyt regresji na `main@daa05b3326984e05504f01bf4ebbf284d85594fc`:
`node --test tests/anaphora-e2a.test.js tests/anaphora-e3.test.js tests/context-coreference-v1.20.test.js`
— PASS, 18/18. Są to dowody obecnego kontraktu, a nie testy nowego wire formatu.
