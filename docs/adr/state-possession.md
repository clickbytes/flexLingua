# ADR: typowane stany w CORE

STATE-03 extends the English grammar to present and past `be` property
predication and `have` possession. The English lexicon keeps these predicate
lexemes separate from auxiliary function words. `Be` supports first, second,
and third person agreement; `have` supports possession statements and
present/past do-support yes/no questions. Present `be` and `have` state
negation, plus present yes/no questions for predication and possession, are now
supported in the bounded grammar. Identity, WH state questions, and perfect
auxiliary uses remain unsupported. Present progressive event clauses have a
separate bounded English event contract; progressive auxiliary use inside
state frames remains unsupported.
In a single English state sentence, configured subject pronouns can use their
lexicon concept mapping directly; event pronouns still require discourse context.

**Status:** przyjęty dla CORE state documents `1.23`, `1.31` oraz decyzji egzystencjalnej `1.33`

**Kontrakt ramek:** `stateFrameVersion` `1.3`

## Kontekst

Dotychczasowe ramki CORE opisują zdarzenia. Użycie zdarzenia, takiego jak `event.visual_perception`, do zapisania „X jest duży”, „X to Y” albo „X ma Y” przypisywałoby zdaniu uczestników i strukturę, których ono nie wyraża. Angielskie `be` i polskie `być` mogą wprowadzać identyczność lub predykat, a `have` i `mieć` mogą wyrażać posiadanie. Te formy wymagają odrębnych kontraktów semantycznych.

## Decyzja

CORE przechowuje typowane węzły `state`, niezależne od ramek zdarzeń:

```json
{
  "version": "1.23",
  "type": "state",
  "kind": "predication",
  "predicate": "quality.big",
  "roles": {
    "subject": {
      "concept": "object.apple",
      "features": { "number": "singular", "definiteness": "definite" }
    }
  },
  "features": { "tense": "present", "polarity": "positive" }
}
```

| `kind` | Role contract | Semantics |
| --- | --- | --- |
| `identity` | `subject: entity`, `complement: entity` | Stwierdza tożsamość dwóch referentów; relacja jest symetryczna. |
| `predication` | `subject: entity`, `predicate: property` stosowalny do podmiotu | Przypisuje referentowi właściwość, np. `quality.big`. |
| `classification` | `subject: entity`, `category: entity` | Kierunkowo stwierdza, że podmiot należy do klasy wyrażonej rzeczownikiem; nie utożsamia podmiotu z kategorią. |
| `possession` | `owner: entity`, `owned: entity` | Stwierdza kierunkową relację posiadania; zamiana ról zmienia znaczenie. |
| `location` | `subject: entity`, `location: entity` | Stwierdza położenie określonego referenta względem miejsca. Negacja zaprzecza jego położeniu. |
| `existence` | `entity: entity`, `location: entity` | Stwierdza lub neguje istnienie egzemplarza danej klasy w miejscu; nie identyfikuje konkretnego referenta. |

Wartości ról wynikają z typowanych ramek w `data/concepts.json`. Rejestr jest wersjonowany jako `stateFrameVersion: "1.3"`; walidator ontology odrzuca brakujące, nadmiarowe lub zmienione kontrakty. Węzły mają wersję `1.23`, rama klasyfikacji `1.31`, a rama egzystencji `1.33`. Cechy stanu to dokładnie `tense` (`past` lub `present`) i `polarity` (`positive` lub `negative`); stan nie ma aspektu zdarzeniowego.

`identity` nie oznacza przynależności do klasy. „To jest książka” jest kodowane jako `classification`, z podmiotem deiktycznym `demonstrative` i klasą `object.book`; „ta książka jest mała” pozostaje `predication`, a wskazanie `proximal` jest cechą frazy rzeczownikowej. Te reprezentacje nie tworzą powiązania referencyjnego między osobnym zaimkiem i rzeczownikiem.

## Różnice PL/EN

- Angielskie `be` i polskie `być` przypisują właściwość w zadeklarowanych konstrukcjach; tożsamość nie jest obecnie realizowana przez te adaptery.
- Angielskie `have` i polskie `mieć` mogą wyrażać posiadanie i wtedy role `owner` oraz `owned` zachowują kierunek relacji.
- Angielskie `have` jako operator czasu perfect, angielskie `do` w pytaniu lub przeczeniu oraz polskie formy `być` użyte jako czasownik posiłkowy nie stają się automatycznie relacją posiadania ani węzłem stanu.
- Zgoda przymiotnika z rzeczownikiem w polszczyźnie i szyk kopuły w angielszczyźnie należą do gramatyk językowych. Nie są cechami referenta ani ramek CORE.

## Rozważone alternatywy

1. **Kodowanie jako zdarzenie.** Odrzucone, ponieważ sugeruje sprawcę lub przebieg zdarzenia i utrudnia odróżnienie stanów od czynności.
2. **Jedna nieokreślona rama `subject/complement`.** Odrzucona, ponieważ nie rozróżnia encji, właściwości i kierunkowego posiadania.
3. **Umieszczenie stanów w `relationTypes`.** Odrzucone dla tego zakresu: relacje ontology opisują statyczne linki między pojęciami, a węzeł `state` przenosi referenty, czas i negację konkretnego zdania.
4. **Egzystencja jako ujemne `location`.** Odrzucone: „There is no book on the table” nie wskazuje konkretnej książki, której położeniu zaprzecza. Odwrócenie polarności nie odtwarza różnicy referencyjnej.

## Zakres i polityka odmowy

- Parser i writer CORE JSON akceptują kompletne ramki stanu oraz ich negację przez istniejący węzeł `scope`.
- Gramatyka PL obsługuje czas teraźniejszy i negację dla posiadania (`mieć`) oraz predykacji znaną właściwością (`być` + przymiotnik), z jawnymi paradygmatami i zgodą przymiotnika z podmiotem. Dla predykacji cechy obsługuje także dodatnie zdania oznajmujące w czasie przeszłym, z uzgodnieniem `był/była/było/byli/były` i przymiotnika. Przeszłe przeczenie i pytania stanowe pozostają poza zakresem. Rządzenie dopełnieniem posiadania jest zadeklarowane w gramatyce: biernik w zdaniu twierdzącym, dopełniacz po `nie`. Prefiksowe pytania yes/no obsługują predykację i posiadanie w czasie teraźniejszym.
- Polska kopuła nie mapuje automatycznie na tożsamość. Ograniczona rama klasyfikacji obsługuje obecnie „to jest książka” oraz znane frazy rzeczownikowe z przymiotnikami w podanym zakresie; nie obsługuje zawodów, lokalizacji, egzystencji, strony biernej ani użycia posiłkowego `być`. Inne podmioty deiktyczne i formy bez zadeklarowanej zgody są odrzucane.
- English grammar supports present and past `be` predication and `have` possession, plus typed present location statements. Present existential clauses use the separate `existence` frame described below. Present `be` negation places `not` after the copula; present negative possession uses person-agreeing do-support. Yes/no questions support present predication by copula inversion and present/past possession with do-support. Identity, WH state questions, perfect auxiliary uses, and progressive auxiliary use inside state frames remain unsupported. A separate event contract supports positive English present progressive for six configured verbs as imperfective CORE events.
- CORE permits yes/no wrappers around states. English parses and realizes present/past possession questions and present predication questions; other state question types, WH questions, coordination, complements, modality, and discourse composition remain unsupported.
- Nieobsługiwane są także relacje rodzinne i inne predykaty bez jawnej ramki. Nie wolno mapować ich na istniejące zdarzenie ani na samą tożsamość.

Sense `quality.simple` jest ograniczony do „nieskomplikowany pod względem struktury, projektu lub użycia”; nie obejmuje automatycznie znaczenia „łatwy”. Kolejne zadania językowe mogą rozszerzyć analizę i realizację na podstawie tych ramek; powinny zachować wersje kontraktów CORE i wyraźnie zgłaszać nierozstrzygniętą niejednoznaczność.

## Addendum A1-ENPL-08: third-person state subjects

In state frames, `she/he` and `ona/on` are third-person pronouns with grammatical agreement. They do not resolve to `person.girl` or `person.boy`. An unresolved pronoun may fill the existing `subject` or `owner` role as the versioned CORE participant `{referent:{kind:"anaphoric",resolution:"unresolved"},agreement:{person:"third",number:"singular",gender}}` in version `1.32`. State kind and role direction remain unchanged: `She is big` is predication and `She has a book` is possession. Discourse links the participant only when a unique compatible person antecedent is present; absent or ambiguous evidence is reported explicitly.

## Addendum A1-ENPL-12: existence at a location

**Status decyzji:** przyjęta 2026-10-17; implementacja może rozpocząć się po scaleniu tego ADR.

`There is a book on the table` wprowadza nieokreślony egzemplarz klasy `object.book` i stwierdza jego istnienie w lokalizacji. CORE zapisuje to jako `state`, `kind:"existence"`, role `entity` i `location`, relację przestrzenną oraz cechy `tense` i `polarity`. Wersja ramy to `1.33`. Formalne `there` nie jest referentem.

`There isn't a book on the table` ma tę samą ramę z `polarity:"negative"`: neguje istnienie egzemplarza książki na stole. `The book is not on the table` pozostaje `kind:"location"`, ma rolę `subject` o określonej referencji i neguje położenie tej książki. Te dwa CORE nie są wymienne. Pytanie yes/no owija dodatnią propozycję `existence` w istniejący węzeł `question`; nie zmienia jej na identity ani location.

Zakres powierzchniowy obejmuje wyłącznie czas teraźniejszy, relacje skonfigurowane jako `in`, `on` i `at`, obecną listę rzeczowników oraz zgodę angielskiego `is/are`. Kanoniczna polska realizacja zachowuje odczyt egzystencjalny przez szyk lokalizacja–orzeczenie–encja: `Na stole jest książka`, `Czy na stole jest książka?`, a negacja przez bezosobowe `nie ma` z dopełniaczem: `Na stole nie ma książki`. Zwykła lokalizacja pozostaje podmiotowa: `Książka nie jest na stole`. Past, brak lokalizacji i nieznane przyimki są jawnie odrzucane.
