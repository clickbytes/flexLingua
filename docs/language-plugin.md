# LanguagePlugin — kontrakt pakietu językowego

Dokument opisuje publiczne API jednego pluginu. Decyzję i granice migracji
określa [ADR pluginów językowych](adr/language-plugins.md); szczegóły walidacji
manifestu, graphu, registry i loadera należą do kolejnych implementacyjnych
issues.

## Katalog pakietu

```text
languages/<code>/
  index.js                 # eksportuje jeden LanguagePlugin
  manifest.json            # identity, wersje, capability i moduły
  graph.json               # LanguageGraph tego języka
  lexicon.json             # jeśli plugin ma leksykon zdaniowy
  grammar.json             # jeśli plugin ma parser/realizator zdań
  features.json            # lokalny profil cech, gdy jest potrzebny
  morphology.json          # opcjonalne paradygmaty/operator instructions
  morphology-lexicon.json  # opcjonalne sensy używane przez morfologię
  signal.json              # opcjonalnie, gdy jest dostawca signal
  provenance.json          # źródła danych pakietu
```

Pliki poza `index.js`, `manifest.json` i `graph.json` są wymagane tylko wtedy,
gdy odpowiadają istniejącej funkcjonalności pakietu. Plugin morphology-only nie
ma gramatyki zdaniowej. Brak modułu nie jest równoważny pustemu modułowi.

## Interfejs JavaScript ESM

Plugin ma stabilny `code` zgodny z registry i wersję kontraktu. `describe()`
zwraca serializowalne identity i wersje; `capabilities()` podaje tylko
funkcjonalności rzeczywiście dostępne po walidacji. `analyze()` i `realize()`
zwracają jawny status, nie rzucają tekstu tłumaczenia dla refusal.

```js
export default {
  contractVersion: '1.0',
  code: 'en',
  describe() {
    return { language: 'en', manifestVersion: '1.0', graphVersion: '1.0' };
  },
  capabilities() {
    return {
      parsing: ['controlled-event-present'],
      realization: ['controlled-event-present'],
      morphology: true
    };
  },
  analyze({ text, context = {} }) {
    // Deleguje do wspólnego runtime; przykład nie jest implementacją parsera.
    return { status: 'unsupported', readings: [], diagnostics: [
      { code: 'EXAMPLE_ONLY', message: 'Replace with the compiled plugin.' }
    ] };
  },
  realize({ meaning, context = {} }) {
    return { status: 'unsupported', diagnostics: [
      { code: 'EXAMPLE_ONLY', message: 'Replace with the compiled plugin.' }
    ] };
  }
};
```

Pokazany plugin jest szkieletem dokumentacyjnym i celowo odmawia. Nie stanowi
fixture ani przykładowego tłumaczenia do akceptacji.

## Kształt wyników

- `analyze({text, context})`:
  - `ok`: `readings[]` ma co najmniej jedno zwalidowane znaczenie;
  - `ambiguous`: zwraca ograniczony zestaw odczytań i diagnostykę;
  - `unsupported`: składnia lub kierunek nie należy do aktywnego capability;
  - `invalid`: wejście łamie wymagany format/kontrakt;
  - `resource_limit`: jawnie osiągnięto zadeklarowany limit.
- `realize({meaning, context})`:
  - `ok`: niepusty `text`, ewentualne `warnings`, `alternatives`,
    `informationLoss` i `diagnostics`;
  - `ambiguous`: jest więcej niż jedna licencjonowana realizacja i wybór nie ma
    dowodu; alternatywy muszą być jawne;
  - `unsupported`, `invalid`, `resource_limit`: brak tekstu przedstawionego jako
    udane tłumaczenie.

Każdy diagnostic zawiera stabilny `code` oraz opis dla operatora. Wynik `ok`
nie obiecuje pełnej poprawności ani pokrycia CEFR. `informationLoss` wskazuje
neutralizację znanego wymiaru lub jawne niedookreślenie; nie modyfikuje CORE.
Nieznane pole CORE jest błędem walidacji, a nie ostrzeżeniem do zignorowania.

## Manifest i LanguageGraph

Manifest opisuje `language`, wersję pakietu, wersje kontraktów, locale,
tokenizer, moduły, kierunki oraz capability per konstrukcja. Capability ma
status `implemented` albo `unsupported`; pierwszego nie deklaruje się wyłącznie
na podstawie danych w graphie. Każda deklaracja wymaga realnego provideru i
ręcznie sprawdzonego zdania lub jawnej odmowy. Schemat manifestu i statusów
zostanie wdrożony w R02/R03.

`graph.json` jest typowanym grafem jednego języka: stabilne ID węzłów, zamknięte
typy węzłów, walidowane atrybuty i zamknięte typy krawędzi. Krawędź nie może
łączyć dowolnych typów węzłów. Graf nie przechowuje dowolnej ścieżki pliku ani
JavaScript jako danych. Dokładne enumy i dozwolone pary typów należą do R04.

## Przykładowy manifest

```json
{
  "schemaVersion": "1.0",
  "language": "pl",
  "locale": "pl",
  "modules": {
    "graph": "graph.json",
    "lexicon": "lexicon.json",
    "grammar": "grammar.json",
    "morphology": "morphology.json"
  },
  "capabilities": {
    "parsing": ["controlled-event-present"],
    "realization": ["controlled-event-present"],
    "morphology": ["noun-number-case", "verb-tense-person"]
  }
}
```

To tylko ilustracja pól. R03 definiuje bezpieczne rozwiązywanie ścieżek,
walidację wymaganych modułów i zgodność `capabilities()` runtime z manifestem.

## Pakiety z ograniczonym zakresem

`ar` zachowuje provider morfologii korzeniowej, ale nie deklaruje analizy ani
realizacji zdań, dopóki ich nie ma. CLI dla pytania o zdanie EN→AR ma zwracać
`unsupported`, a nie tworzyć zdanie z samych form morfologicznych.

`fi`, `tr` i `it` deklarują wyłącznie uruchomione i ręcznie zaakceptowane
konstrukcje. Brak capability dla zdania nie odrzuca samego pakietu; oznacza
jawny refusal przy tej konstrukcji lub kierunku. Nie kopiować wspólnego
interpretera ani reguł per para języków do `languages/<code>/index.js`.

## Lokalna ocena przez CLI

Po udostępnieniu `tools/translate.mjs` agent uruchamia konkretne zdania:

```sh
node tools/translate.mjs --from en --to pl --text "The girl sees the dog."
node tools/translate.mjs --from pl --to en --text "Dziewczynka widzi psa."
node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
```

Przegląd zapisuje dokładne wejście, oczekiwany sens, zaobserwowany tekst lub
refusal, CORE/diagnostykę i sprawdzony SHA. Dla tego kontraktowego issue CLI
nie istnieje: jego stan to `CLI NOT AVAILABLE — requires R07`; nie uruchamia się
testów automatycznych ani nie dopisuje `tests/`.
