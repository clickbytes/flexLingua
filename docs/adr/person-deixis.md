# ADR: deiktyczna tożsamość mówcy i adresata

- **Status:** przyjęta decyzja dla strumienia PERS; podstawowy runtime CORE/PL/EN wdraża PERS-02, a pełniejsza zgodność i fleksja pozostają w PERS-03..06.
- **Data:** 2026-10-14.
- **Zakres:** reprezentacja `I/you/we` i `ja/ty/my/wy` w PL ↔ CORE ↔ EN.
- **Nie obejmuje:** implementacji parsera, odmiany, UI, mowy zależnej ani trwałego profilu uczestników dialogu.

## Kontekst

CORE przechowuje uczestników jako referencje do pojęć `entity` (`{concept, features}`). Walidator wymaga, by `concept` istniało w `data/concepts.json`, a `features` dokładnie odpowiadały domenie `participant` z `data/features.json`. Schemat nie wyraża osoby gramatycznej ani roli mówcy/adresata. Obecne reguły anaforyczne obsługują ograniczony przypadek zaimków trzeciej osoby `she/he` i `ona/on`, rozwiązując je do wcześniej jawnie wspomnianej encji.

Mapowanie pierwszej osoby na `person.girl`, a drugiej na `person.boy` byłoby fałszywe: dodawałoby płeć/rodzaj i tożsamość, których wypowiedź nie podaje. Sama cecha gramatycznej osoby też nie wystarczy, ponieważ nie wskazuje, który uczestnik rozmowy jest mówcą ani adresatem.

## Rozważane modele

| Model | Zaleta | Problem |
| --- | --- | --- |
| Zaimki jako pojęcia osoby, np. `person.girl` | Pasuje do istniejącego walidatora referencji encji. | Przypisuje niepodaną tożsamość i często rodzaj; zaimek może błędnie połączyć niezależne osoby w dyskursie. |
| Sama cecha `person: first/second` na zdarzeniu lub roli | Pozwala dobrać końcówkę czasownika bez dodawania płci do CORE. | Nie wskazuje referenta: `speaker` i `addressee` pozostają nierozróżnieni, więc nie da się bezpiecznie zachować osoby w dyskursie ani przy zmianie perspektywy. |
| **Rozstrzygnięty: deiktyczny referent plus osobne cechy zgody gramatycznej** | Rozdziela tożsamość referenta od osoby/liczby wymaganej przez gramatykę. Nie tworzy fikcyjnego pojęcia ani płci. | W niektórych wejściach liczba lub cecha potrzebna do odmiany jest nieznana; takie przypadki wymagają jawnych alternatyw albo odmowy. |

## Decyzja

Wersjonowany uczestnik zdarzenia może mieć jedną z dwóch postaci:

1. Dotychczasową referencję pojęciową `{concept, features}` dla zwykłych osób i rzeczy.
2. Nową referencję deiktyczną `{referent, agreement}` dla mówcy lub adresata.

Postać deiktyczna zachowuje **tożsamość** w `referent.anchor` i **zgodę gramatyczną** w `agreement`. Dla pierwszej i drugiej osoby zapisuje jawnie `person` oraz `number`; nie dodaje płci do osoby gramatycznej.

```json
{
  "version": "1.22",
  "type": "event",
  "concept": "event.visual_perception",
  "roles": {
    "agent": {
      "referent": { "kind": "deictic", "anchor": "speaker" },
      "agreement": { "person": "first", "number": "singular" }
    },
    "theme": {
      "referent": { "kind": "deictic", "anchor": "addressee" },
      "agreement": { "person": "second", "number": "singular" }
    }
  },
  "features": {
    "tense": "present",
    "polarity": "positive",
    "aspect": "unknown"
  }
}
```

Ten sam dokument CORE może powstać z `I see you.` albo `Ja widzę ciebie.`. Tekst i leksyka źródłowa nie trafiają do znaczenia. Dla innych form schemat zapisuje:

| Formy | Referent | Osoba gramatyczna | Liczba | Uwagi |
| --- | --- | --- | --- | --- |
| `I` / `ja` | `speaker` | `first` | `singular` | Nie wnosi rodzaju ani płci. |
| `you` / `ty` | `addressee` | `second` | `singular` | Angielskie `you` samo nie rozstrzyga liczby. |
| `we` / `my` | `speaker` | `first` | `plural` | Oznacza grupę zawierającą mówcę; nie wymienia pozostałych osób. |
| `you` / `wy` | `addressee` | `second` | `plural` | Angielskie `you` samo nie rozstrzyga liczby. |

Przykład grupy pierwszej osoby używa tej samej kotwicy mówcy, ale jawnej liczby mnogiej:

```json
{
  "version": "1.22",
  "type": "event",
  "concept": "event.visual_perception",
  "roles": {
    "agent": {
      "referent": { "kind": "deictic", "anchor": "speaker" },
      "agreement": { "person": "first", "number": "plural" }
    },
    "theme": {
      "referent": { "kind": "deictic", "anchor": "addressee" },
      "agreement": { "person": "second", "number": "singular" }
    }
  },
  "features": {
    "tense": "present",
    "polarity": "positive",
    "aspect": "unknown"
  }
}
```

Może opisywać `We see you.` / `My widzimy ciebie.`. Dla angielskiego wejścia wariant `singular` adresata wymaga kontekstu; bez niego zachowujemy też wariant `plural` (`wy`). Polski `Ty widzisz mnie.` jednoznacznie ustala `addressee/second/singular`; `Wy widzicie mnie.` ustala `addressee/second/plural`.

`anchor` i `person` muszą być zgodne: `speaker` z `first`, `addressee` z `second`. `number` opisuje gramatyczną liczbę zaimka/grupy, a nie liczbę znanych identyfikatorów w CORE. Nie wnioskujemy inkluzywnego/ekskluzywnego `we`, jeśli język tego nie koduje.

Osoba gramatyczna wyznacza formę czasownika na pozycji podmiotu. Dla zwykłej referencji do encji zgodę trzeciej osoby można wyprowadzić jako `third`; istniejące dokumenty nadal serializują się według swoich dotychczasowych wersji. Domena `participant` nie dostaje globalnie nowego wymaganego pola `person`, bo `validateFeatureBundle` wymaga obecnie dokładnego zestawu kluczy, a taka zmiana unieważniłaby stare dane i testy.

Nowy wire format używa osobnej wersji dokumentu `1.22` (niezależnej od wersji pakietu npm). Implementacja dodaje stałą wersji uczestnika, waliduje dokładnie dozwolone pola i zachowuje bez zmian odczyt/serializację istniejących wersji `0.2`, `0.4`, `0.5`, `0.6` i `1.0`. Nie wolno po cichu interpretować starej referencji pojęciowej jako deiktycznej.

## Nieznana tożsamość i perspektywa

- W pojedynczej bezpośredniej wypowiedzi `speaker` i `addressee` są symbolicznymi kotwicami. Tłumaczenie zachowuje je między językami; samo przejście EN→PL lub PL→EN nie zamienia mówcy z adresatem.
- Stabilne łączenie uczestnika między turami wymaga jawnego przypisania kotwicy do stabilnego ID rozmówcy przez kontekst sesji. Pisownia zaimka, kolejność zdań ani domysł o autorze nie są takim przypisaniem.
- Przy braku przypisania nie wolno tworzyć relacji koreferencji do wcześniejszej encji. Jeśli operacja wymaga rozstrzygnięcia, kto mówi lub do kogo, wynikiem jest jawna odmowa `UNRESOLVED_DEIXIS`.
- Perspektywy nie zmieniamy automatycznie w cytowaniu ani mowie zależnej. Transformacja wymagająca przeliczenia `speaker`/`addressee` wymaga jawnej mapy tożsamości; bez niej odmawia.
- Angielskie `you` bez kontekstu liczby zachowuje odczytania singular i plural. Polski cel nie może arbitralnie wybrać `ty` albo `wy`; silnik zwraca obie jawne alternatywy, jeśli API je umie przedstawić, a w przeciwnym razie odmawia.
- Polski czas przeszły pierwszej/drugiej osoby singular może wymagać jawnej cechy rodzaju gramatycznego referenta; rodzaj nie wynika z `person`. Bez wiarygodnej cechy kontekstu wolno zwrócić jawne warianty lub odmówić, ale nie zgadywać formy męskiej/żeńskiej. Dokładne reguły odmiany ustalają PERS-04 i PERS-05.

## Ryzyka integracji z E4 i dyskursem

`ConversationContext` rozwiązuje ograniczone zaimki trzeciej osoby do wcześniejszych encji i zapisuje ich współdzielenie jako linki `eN.role → eM.role`. Kotwica deiktyczna nie jest takim linkiem: `speaker` w dwóch turach może oznaczać różne osoby, a ten sam człowiek może być mówcą w jednej turze i adresatem w następnej. Każda tura zapisuje więc osobne `referenceId` dla wystąpień uczestników. Jawne `speakerId`/`addresseeId` wiążą kotwicę z `actor:<id>`; bez nich używany jest identyfikator lokalny dla tury. Planner porównuje te identyfikatory, a nie same etykiety kotwic:

- przechowywać referencje deiktyczne jako osobny wariant uczestnika, nie jako `person.girl`/`person.boy`;
- uznawać tożsamość między turami tylko przy zgodnych, jawnych identyfikatorach; brak mapowania daje `unknown/insufficient_context`;
- pozwalać temu samemu stabilnemu ID wystąpić jako `speaker` w jednej turze i `addressee` w innej, bez dopisywania tożsamości do CORE;
- nie utożsamiać liczby mnogiej z pojedynczym aktorem na podstawie jednego ID;
- nie dopasowywać zaimków pierwszej/drugiej osoby do `#antecedents()` używanego dla `he/she/on/ona`;
- sprawdzać snapshot → `JSON.stringify`/`JSON.parse` → walidacja → realization bez utraty kotwic, osoby, liczby ani jawnej tożsamości;
- odrzucić nieznaną kotwicę, niezgodność `speaker/first` i `addressee/second`, nieznaną liczbę, niejednoznaczną perspektywę oraz niejawny link koreferencji.

## GRAM-01: przypadek zaimka i jawny possessor

GRAM-01 rozszerza tę samą deiktyczną tożsamość na wspierane formy dopełnienia: angielskie `me/you/us` oraz polskie `mnie/mi/ciebie/tobie/nas/nam/was/wam`. Gramatyka przypisuje formie wymagany przypadek; `me` i polskie `mnie` są dopuszczone w bierniku, a `mi/tobie` w celowniku. Zdanie z formą w niezgodnym przypadku jest odrzucane.

Possessive determiner nie staje się sensem rzeczownika. CORE dodaje do referenta rzeczownika jawne pole `possessor` zawierające zwykłą referencję `{referent, agreement}` mówcy lub adresata. Na przykład `my book` i `moja książka` mają ten sam koncept `object.book`, a właściciel jest osobną relacją. Polski podzbiór odmienia `mój/twój` dla rodzaju, przypadku i liczby pojedynczej posiadanego rzeczownika. Angielskie `your` zachowuje warianty liczby pojedynczej i mnogiej jako konkurujące odczytania.

Nowy wariant dokumentu `1.26` wersjonuje uczestnika z polem `possessor` i stan posiadania odczytany z konstrukcji `The book is mine` / `Książka jest moja`. Dokumenty bez tego pola nadal używają wcześniejszych wersji. `mine` wymaga znanego posiadania w zdaniu; samodzielne `I see mine` jest odrzucane, bo nie wskazuje referenta posiadanego przedmiotu. Kotwice i identyfikatory zdarzeń nie są łączone przez samą pisownię; testy E2a–E4 pozostają kontrolą regresji.

## Konsekwencje i podział wdrożenia

- `data/concepts.json` pozostaje ontologią pojęć. Nie dodajemy do niej `I`, `you`, `speaker` ani `addressee` jako bytów.
- `data/features.json` zachowuje obecną domenę dla zwykłych referencji. Osoba i liczba gramatyczna deiktycznej referencji należą do nowego, wersjonowanego `agreement`, walidowanego osobną gałęzią.
- PERS-02 dodaje leksykalne mapowania `ja/ty/my/wy` i `I/you/we`, walidowany zapis referencji oraz kontrolowane zdania teraźniejsze PL/EN. PERS-03/04/05 rozszerzają zgodę, fleksję, czas przeszły i pytania; PERS-06 dostarcza niezależny gold integracyjny.
- Ten ADR ustala kontrakt i ryzyka. Bieżący zakres runtime opisuje [PERS-02](../pers02-deictic-pronouns.md); pozostałe wiersze tabeli testów są wymaganiami dla dalszych zadań.

## Wymagane testy przy wdrażaniu kontraktu

1. Te same znaczenia dla EN i PL: `I see you` / `Ja widzę ciebie`, `We see you` / `My widzimy ciebie`, `You see me` / `Ty widzisz mnie`; sprawdzić również wariant plural `wy`.
2. Roundtrip JSON zachowuje `referent.anchor`, `agreement.person` i `agreement.number`; zwykłe dokumenty i historyczne wersje serializacji nie zmieniają się.
3. Negatywne: nieznany anchor, speaker z second person, addressee z first person, brak liczby, dodane nieznane pola, cichy wybór liczby dla angielskiego `you`, oraz niejednoznaczna zmiana perspektywy.
4. Bezpieczna realizacja polskiego czasu przeszłego przy znanym rodzaju oraz jawna alternatywa/odmowa przy rodzaju nieznanym.
5. Dwie tury tego samego jawnie zidentyfikowanego mówcy i tury ze zmianą mówcy; brak koreferencji między samymi etykietami `speaker`/`addressee`.

## Addendum A1-ENPL-08: unresolved third person

The third-person subject inventory declares agreement, not a person concept. `She`/`ona` carry `{person:"third", number:"singular", gender:"feminine"}` and `he`/`on` carry the masculine counterpart. CORE stores this as `{referent:{kind:"anaphoric",resolution:"unresolved"},agreement}` under document version `1.32`; it carries no age, job, name, or `person.girl`/`person.boy` identity.

In a single clause the unresolved pronoun is preserved in the target when its form and agreement are supported. For Polish adjective agreement the grammatical gender is available, while identity remains unresolved. In discourse an English or Polish third-person pronoun links only to one unique earlier person with matching singular number and grammatical gender. No compatible antecedent yields `UNRESOLVED_ANAPHORA`; multiple compatible antecedents yield `AMBIGUOUS_ANAPHORA`. A pronoun does not create `person.unknown` or turn its grammatical gender into lexical identity.

Te przypadki wymagają niezależnie zapisanych oczekiwań PL↔CORE↔EN. Nie wystarczy sprawdzić, że parser i realizator zgadzają się ze sobą.
