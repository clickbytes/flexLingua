# LanguagePlugin — kontrakt pakietu językowego

Każdy język jest niezależnym pakietem JavaScript ESM i JSON. Registry wybiera pakiet, loader waliduje jego manifest, graph i provenance, a CLI przekazuje mu pracę. Decyzje architektoniczne opisuje [ADR pluginów](adr/language-plugins.md).

## Pliki pakietu

```text
languages/<code>/
  index.js                 # fabryka pluginu
  manifest.json            # kod, status, moduły, capabilities i provenance
  graph.json               # LanguageGraph
  lexicon.json             # opcjonalny leksykon zdań
  grammar.json             # opcjonalna analiza i realizacja zdań
  features.json            # opcjonalny profil lokalnych cech
  morphology.json          # opcjonalne paradygmaty i operacje
  morphology-lexicon.json  # opcjonalne hasła używane przez morfologię
  signal.json              # opcjonalne moduły sygnału
  bridge.json              # opcjonalne mapowania do CORE
  provenance.json          # źródła i licencje pakietu
```

`index.js` eksportuje fabrykę domyślną. Walidowany loader przekazuje jej manifest, graph, wspólny CORE i provenance. Fabryka zwraca plugin korzystający ze wspólnych interpreterów. Opcjonalny moduł nie jest wymagany, gdy pakiet nie udostępnia danej funkcji; pusty plik nie oznacza obsługi.

## Interfejs

Plugin zwraca obiekt o kontrakcie `1.0` z polami `code`, `describe()` i `capabilities()`. `describe()` zwraca serializowalne `{ language, version }`. `capabilities()` deklaruje ograniczone operacje i konstrukcje w formie `{ operation, channel, construction, status, evidence }`.

Dozwolone kanały i operacje:

- `sentence`: `analyze`, `realize`
- `morphology`: `generate`, `analyze`, `paradigm`, `availability`
- `lexicon`: `lookup`
- `signal`: `decode`, `encode`

Wynik capability ma status `implemented` lub `unsupported`. Każde stwierdzenie capability zawiera co najmniej jeden identyfikator ręcznej sentencji lub odmowy. Nie deklaruj wsparcia na podstawie samych danych. Nie używaj ogólnego construction `all`.

Plugin zdaniowy udostępnia potrzebne `analyze({ text, context })` i/lub `realize({ meaning, context })`. Pakiet morphology-only może nie mieć metod zdaniowych. Wyniki używają statusu `ok`, `ambiguous`, `unsupported`, `invalid` albo `resource_limit`. Odmowa nie zawiera tekstu udawanego za udane tłumaczenie. Przy sukcesie wynik może zawierać alternatywy, warnings, informationLoss i diagnostics; diagnostyki mają stabilny kod.

## Manifest i zakres

Manifest wiąże kod języka, wersję schematu, ścieżkę graph, status pakietu, capabilities i provenance. Opcjonalna lista `directions` zawęża pary `from->to`; każda zadeklarowana lista musi dopuszczać wybrany kierunek. Registry nie dodaje kierunku, którego pakiet nie deklaruje.

`graph.json` to typowany, ograniczony LanguageGraph. Nie przechowuje dowolnych ścieżek ani kodu JavaScript. CORE pozostaje neutralny wobec szyku, przypadka i językowych wykładników. Pakiety nie kopiują parserów lub wspólnych reguł dla każdej pary języków.

Aktualne kierunki są zapisane w manifestach i widoczne przez `node tools/translate.mjs --languages`. CLI musi jawnie odmawiać nieobsługiwanych konstrukcji i kierunków. Obecne przykłady ręcznego przeglądu są w [przewodniku CLI](../examples/cli-sentences.md); pełny interfejs poleceń opisuje [CLI](cli.md).

## Deklaracje gramatyki

Ograniczenia i kolejność słów należą do grammar.json; wspólny interpreter korzysta z deklaracji pakietu bez rozgałęzień według kodu języka. states.supportedTensesByPolarity może zawęzić dostępne czasy dla danej polaryzacji. questions.wh.destination.order przyjmuje frame albo verb_first; brak pola zachowuje kolejność ramy zdania.

## Niepewność w publicznym wyniku

`Engine.translate()` i serwis aplikacji zachowują wszystkie odrębne znaczenia. Gdy pozostaje więcej niż jedno, zwracają `status:"ambiguous"`, `text:null`, `meaning:null` i `interlingua:null`, a odczytania pozostają w `alternatives`. Różne wyniki punktowe nie rozstrzygają znaczenia. Jawne ograniczenie `context.senses` może zawężać zbiór; `context.topics` jedynie zmienia kolejność. Serwis sprawdza dodatkowo dostępność pakietów, kierunków i capabilities.

Wynik zawiera `uncertainties`: rekordy `{id,kind,path,options,reason}`. `path` jest wskaźnikiem fragmentu MeaningGraph (`#` oznacza całość), `options` wymienia możliwości bez procentowej pewności, a `reason` podaje stabilną przyczynę. Rodzaje to `semantic_ambiguity`, `missing_information`, `equivalent_expression`, `additional_assumption` oraz `unsupported`; ograniczenie zasobów jest osobnym `search_limit`. Nieznany aspekt, niepodana określoność i nierozwiązany poprzednik pozostają nieznane w CORE. Wybór przedimka przez politykę wyświetlania jest dodatkowym założeniem, a nie ustaleniem faktu. Dotychczasowe `informationLoss` pozostaje osobnym raportem.

`Engine.analyze()` zwraca MeaningGraph tylko dla jednego znaczenia. Przy niejednoznaczności zgłasza `EngineError` z kodem `AMBIGUOUS_MEANING`, statusem `ambiguous` i dokumentem w `error.result`. `Engine.tryTranslate()` zachowuje kopertę `{ok,value,error}`: odmowa domenowa ma `ok:false` i pełny dokument w `value`; nieoczekiwana awaria ma `error.status:"error"` oraz `INFRASTRUCTURE_ERROR` i nie udaje odmowy językowej.
