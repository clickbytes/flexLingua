# ADR: typowane stany w CORE

**Status:** przyjęty dla CORE state document `1.23`  
**Kontrakt ramek:** `stateFrameVersion` `1.0`

## Kontekst

Dotychczasowe ramki CORE opisują zdarzenia. Użycie zdarzenia, takiego jak `event.visual_perception`, do zapisania „X jest duży”, „X to Y” albo „X ma Y” przypisywałoby zdaniu uczestników i strukturę, których ono nie wyraża. Angielskie `be` i polskie `być` mogą wprowadzać identyczność lub predykat, a `have` i `mieć` mogą wyrażać posiadanie. Te formy wymagają odrębnych kontraktów semantycznych.

## Decyzja

CORE przechowuje trzy rodzaje węzłów `state`, niezależne od ramek zdarzeń:

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
| `possession` | `owner: entity`, `owned: entity` | Stwierdza kierunkową relację posiadania; zamiana ról zmienia znaczenie. |

Wartości ról wynikają z typowanych ramek w `data/concepts.json`. Rejestr jest wersjonowany jako `stateFrameVersion: "1.0"`; walidator ontology odrzuca brakujące, nadmiarowe lub zmienione kontrakty. Sam węzeł ma wersję `1.23`. Cechy stanu to dokładnie `tense` (`past` lub `present`) i `polarity` (`positive` lub `negative`); stan nie ma aspektu zdarzeniowego.

`identity` nie oznacza przynależności do klasy. Zdanie „X jest nauczycielem” nie jest identycznością dwóch encji i nie należy kodować go jako `identity`; przynależność zawodowa i inne predykaty klasowe wymagają osobnego kontraktu.

## Różnice PL/EN

- Angielskie `be` i polskie `być` mogą łączyć dwa referenty albo przypisywać właściwość. Konstrukcja i kontekst rozstrzygają, czy powstaje `identity`, czy `predication`.
- Angielskie `have` i polskie `mieć` mogą wyrażać posiadanie i wtedy role `owner` oraz `owned` zachowują kierunek relacji.
- Angielskie `have` jako operator czasu perfect, angielskie `do` w pytaniu lub przeczeniu oraz polskie formy `być` użyte jako czasownik posiłkowy nie stają się automatycznie relacją posiadania ani węzłem stanu.
- Zgoda przymiotnika z rzeczownikiem w polszczyźnie i szyk kopuły w angielszczyźnie należą do gramatyk językowych. Nie są cechami referenta ani ramek CORE.

## Rozważone alternatywy

1. **Kodowanie jako zdarzenie.** Odrzucone, ponieważ sugeruje sprawcę lub przebieg zdarzenia i utrudnia odróżnienie stanów od czynności.
2. **Jedna nieokreślona rama `subject/complement`.** Odrzucona, ponieważ nie rozróżnia encji, właściwości i kierunkowego posiadania.
3. **Umieszczenie stanów w `relationTypes`.** Odrzucone dla tego zakresu: relacje ontology opisują statyczne linki między pojęciami, a węzeł `state` przenosi referenty, czas i negację konkretnego zdania.

## Zakres i polityka odmowy

- Parser i writer CORE JSON akceptują trzy kompletne ramki stanu oraz ich negację przez istniejący węzeł `scope`.
- Gramatyka PL obsługuje obecnie czas teraźniejszy i negację dla posiadania (`mieć`) oraz predykacji znaną właściwością (`być` + przymiotnik), z jawnymi paradygmatami i zgodą przymiotnika z podmiotem. Rządzenie dopełnieniem posiadania jest zadeklarowane w gramatyce: biernik w zdaniu twierdzącym, dopełniacz po `nie`.
- Polska kopuła nie mapuje automatycznie na tożsamość ani predykat klasowy. Zdania o zawodzie, klasie, lokalizacji, egzystencji, strona bierna i użycie posiłkowe `być` nie mają tu licencjonowanej ramy. Predykacja z podmiotem deiktycznym, gdy rodzaj nie wynika z kontraktu, także jest odrzucana.
- Gramatyka EN nie analizuje ani nie realizuje jeszcze stanów; przekład stanu PL do EN jawnie zwraca błąd `Unsupported state construction` do czasu zadania STATE-03.
- Stany nie są obecnie obsługiwane jako składniki pytań, koordynacji, komplementów, modalności ani dyskursu. Walidator odrzuca takie struktury, zamiast zgadywać typ zdania.
- Nieobsługiwane są także relacje rodzinne i inne predykaty bez jawnej ramki. Nie wolno mapować ich na istniejące zdarzenie ani na samą tożsamość.

Kolejne zadania językowe mogą rozszerzyć analizę i realizację na podstawie tych ramek; powinny zachować wersje kontraktów CORE i wyraźnie zgłaszać nierozstrzygniętą niejednoznaczność.
