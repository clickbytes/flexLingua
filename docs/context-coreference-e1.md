# E1 — Bezpieczne jawne powiązania encji między zdaniami

**Data:** 2026-10-13  
**Status:** mikrobatch E1 — CORE source, bez zmian GUI; nie oznacza pełnego Batch E ani implementacji zaimków.

## Kontrakt API

Dla tekstu wielozdaniowego w PL lub EN można przekazać do `Engine.analyzeCandidates`, `Engine.analyze`, `Engine.translate` lub `Engine.tryTranslate` kontekst:

```js
const result = engine.analyzeCandidates({
  from: 'en',
  text: 'The girl sees the dog. The girl sees the cat.',
  context: { coreference: { 'e2.agent': 'e1.agent' } }
});
```

`coreference` to **jawne potwierdzenie tożsamości** wybranych wzmianek. Klucz `eN.role` wskazuje rolę zdarzenia N, a wartość `eM.role` musi wskazywać znaną rolę wcześniejszego zdarzenia (M < N). Nie wystarcza podobieństwo słów, identyczna odmiana, typ encji ani kolejność tematów. Bez parametru każda wzmianka nadal dostaje odrębny identyfikator w semantyce dyskursu. Brak automatycznej anafory i rozpoznawania zaimków.

Walidator `validateCoreferenceMap(map, eventCount)` rozpoznaje maksymalnie 32 jawne linki w maksymalnie 8 zdarzeniach. Odrzuca złe identyfikatory, role rezerwowane, odwołania przyszłe i do bieżącego zdarzenia oraz nieobecne role. Zgodność znaczeń `sameDiscourseReferent(a,b)` jest ścisła, uwzględnia pojęcie, liczbę, określoność, modyfikatory i relacje, ale nie uzależnia wyniku od kolejności właściwości obiektu JS. Odmienne określoności lub sensy nie są automatycznie utożsamiane. Nie następuje rozszerzanie semantycznego formatu CORE na słowa powierzchniowe.

## Wieloznaczność

Dla dwóch zdań z rzeczownikiem `bank` dotychczasowy parser rozpoznaje niezależnie instytucję finansową i brzeg rzeki. Bez linku są 4 kombinacje interpretacji. Przy `{'e2.theme':'e1.theme'}` pozostają 2 **odrębne, zgodne semantycznie** odczytania; sens finansowy nie jest łączony z brzegiem. Poprawne kandydatury nie są odrzucane tylko dlatego, że inna kandydatura konfliktuje z jawnym powiązaniem.

Wyszukiwanie jest nadal ograniczone do `MAX_CANDIDATES=16` po kolejnych etapach; nie deklarujemy wyczerpującego wyszukiwania w języku naturalnym. Gdy brak spójnego odczytania, nie zgadujemy — otrzymuje się błąd, np. `No semantic reading satisfies explicit coreference links: e2.theme → e1.theme.`.

## Diagnostyka

`Engine.tryTranslate(...)` oznacza problemy linków kodem `INVALID_COREFERENCE` i opisem, np. `Unknown discourse coreference source role: e2.invalid.`, `Unknown earlier discourse coreference target role: e1.invalid.`, albo `Coreference e1.agent → e2.agent must reference a role in an earlier event.`.

Kontekst `coreference` nie jest stosowany do `from: 'core'`, pojedynczych zdań ani pytań. Nie zmieniono formatów `event` v0.2, `question` v1.19 ani `discourse` v0.4–v0.6.

## Sprawdzenie i otwarte wymagania

Testy E1: `tests/coreference-e1-v1.22.test.js`, rozszerzone o regresje `tests/context-coreference-v1.20.test.js`. Sprawdzają zgodne wieloznaczności, niezgodne połączenia, błędne/futurystyczne linki, wierność CORE JSON oraz brak inferencji.

W izolowanym interpreterze modułów JavaScript wykonano **10/10** testów E1 + starszych testów kontekstu. **Nie wykonano pełnego `npm test` ani `npm run check:release`.** Lokalny dostęp sieciowy do GitHuba w środowisku Node jest niedostępny (DNS); GitHub Actions poprzednio zgłaszał `startup_failure`. Nie uznawać samodzielnych testów JS za ukończony release gate. Testy CI i zsynchronizowanie offline przez osobnego agenta GUI pozostają do potwierdzenia.

**Dalsze mikrobatch E2:** ograniczona, jawna obsługa zaimków z deterministyczną polityką kandydatów, odmową w przypadku wielu zgodnych antecedensów i testami PL/EN. Nie przypisywać tożsamości na podstawie samego wystąpienia `he`, `she`, `on`, `ona`.
