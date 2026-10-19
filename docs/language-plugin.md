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

Bounded warianty w istniejącym `frame.linearizations`, ich stabilne ID oraz rozdział surface evidence od MeaningGraph opisuje [ADR wariantów szyku](adr/feature-driven-word-order.md). Kompilator waliduje opt-in deskryptory i tworzy głęboko zamrożony indeks konstrukcja → variantId → sequence/preference. Przy tworzeniu adaptera deskryptory normalizują się do tablic slotów używanych przez obecny parser i realizer; dotychczasowe tablice pozostają pierwsze i zachowują domyślną realizację. Obecne pakiety PL/EN nie deklarują jeszcze deskryptorów, więc kompilacja nie dodaje capabilities ani nowych wyników tłumaczenia.

Ograniczenia i kolejność słów należą do grammar.json; wspólny interpreter korzysta z deklaracji pakietu bez rozgałęzień według kodu języka. states.supportedTensesByPolarity może zawęzić dostępne czasy dla danej polaryzacji. questions.wh.destination.order przyjmuje frame albo verb_first; brak pola zachowuje kolejność ramy zdania.

## Niepewność w publicznym wyniku

Przyszłe, opcjonalne analysis.surface może dodać ID rozpoznanej konstrukcji/wariantu, mapowanie slotów, zakresy źródłowe i dowody składniowe. Jest to trace pluginu, a nie pole MeaningGraph ani obowiązkowa część interfejsu 1.0; brak trace nie oznacza wariantu domyślnego ani topic/focus.

`Engine.translate()` i serwis aplikacji zachowują wszystkie odrębne znaczenia. Gdy pozostaje więcej niż jedno, zwracają `status:"ambiguous"`, `text:null`, `meaning:null` i `interlingua:null`, a odczytania pozostają w `alternatives`. Różne wyniki punktowe nie rozstrzygają znaczenia. Jawne ograniczenie `context.senses` może zawężać zbiór; `context.topics` jedynie zmienia kolejność. Serwis sprawdza dodatkowo dostępność pakietów, kierunków i capabilities.

Wynik zawiera `uncertainties`: rekordy `{id,kind,path,options,reason}`. `path` jest wskaźnikiem fragmentu MeaningGraph (`#` oznacza całość), `options` wymienia możliwości bez procentowej pewności, a `reason` podaje stabilną przyczynę. Rodzaje to `semantic_ambiguity`, `missing_information`, `equivalent_expression`, `additional_assumption` oraz `unsupported`; ograniczenie zasobów jest osobnym `search_limit`. Nieznany aspekt, niepodana określoność i nierozwiązany poprzednik pozostają nieznane w CORE. Wybór przedimka przez politykę wyświetlania jest dodatkowym założeniem, a nie ustaleniem faktu. Dotychczasowe `informationLoss` pozostaje osobnym raportem.

`Engine.analyze()` zwraca MeaningGraph tylko dla jednego znaczenia. Przy niejednoznaczności zgłasza `EngineError` z kodem `AMBIGUOUS_MEANING`, statusem `ambiguous` i dokumentem w `error.result`. `Engine.tryTranslate()` zachowuje kopertę `{ok,value,error}`: odmowa domenowa ma `ok:false` i pełny dokument w `value`; nieoczekiwana awaria ma `error.status:"error"` oraz `INFRASTRUCTURE_ERROR` i nie udaje odmowy językowej.

`interpretations` zawiera każde odczytanie wraz z `id`, `meaning`, `status`, `diagnostics`, `realizations`, `score`, `reasons`, `ruleIds` i `rank`. Brak obsługi w języku docelowym pozostawia odczytanie z pustym `realizations`; nie usuwa jego znaczenia. Realizacja ma własne `id`, `interpretationId`, kompletny `text`, opis założeń i strat oraz uzasadnienie preferencji. Lista sformułowań jest ograniczona wariantami udostępnionymi przez plugin; nie deklaruje wszystkich możliwych parafraz.

Żądanie może ustawić `includeSegments:true`, aby otrzymać segmenty tylko dla wybranego `preview`. Każdy segment podaje kompletny fragment tekstu, indeksy `targetSpan` w jednostkach UTF-16, ścieżki `meaningPaths`, źródłowe powiązania i zastosowane decyzje leksykalne/morfologiczne. Powiązanie źródła ma status `aligned` z rzeczywistym zakresem albo `unavailable` z przyczyną; nie wolno dopowiadać zakresu dla informacji pominiętej w źródle. Segment może obejmować frazę lub formę z końcówką, a czasownik może być powiązany z rolą sterującą zgodnością, nawet gdy jej podmiot jest pominięty w tekście docelowym.

Parser pluginu może udostępnić `analysis.sourceSegments`, przypisując rozpoznane fragmenty tekstu do ścieżek znaczenia. CORE i adapter przekazują je do realizacji. Każda pozycja `realizations` jest kompletnym wariantem zdania i może mieć własne `segments`, `kind`, `assumptions` oraz `informationLoss`. Interfejs wybiera wariant przez jego `id`; wymiana segmentu samodzielnie nie jest poprawną operacją, bo formy fleksyjne mogą zależeć od innych decyzji w zdaniu.

`previewId` wskazuje dostępną realizację albo jest `null`. Przy `ambiguous` interfejs może wyświetlić jej tekst wyłącznie jako podgląd; pola główne `text` i `meaning` pozostają puste. Ranking porównuje kolejno: mniej `assumptions`, więcej `contextRules`, więcej `ontologyLinks`, większe `lexicalPreference`, następnie stabilne ID. Ostatnie kryterium tylko porządkuje remis: równe oceny zachowują ten sam `rank`. `lexicalPreference` pochodzi z priorytetów analizy języka źródłowego; kolejność sformułowań docelowych ma osobną regułę `target.lexical-order`. Nie są to prawdopodobieństwa. Dla niedostępnej realizacji koszt założeń jest nieznany (`null`), a podgląd wybierany jest spośród dostępnych zdań.

Żądanie engine/serwisu może zawierać `search:{maxReadings:1..16}`. Przekroczenie budżetu zwraca `resource_limit` i `SEMANTIC_SEARCH_LIMIT`, bez podglądu ani twierdzenia o jednoznaczności. Wewnętrzne limity gramatyki również zgłaszają odmowę zamiast obcinać zbiór znaczeń. Limit realizacji blokuje podgląd całego wyniku, zachowując zebrane odczytania. Hasło bez zadeklarowanych i wygenerowanych form rzeczownika otrzymuje `TARGET_NOUN_FORMS_UNAVAILABLE`; niespójna niepusta tablica form oraz nieoczekiwane wyjątki nadal oznaczają błąd wykonania.

Jawny kontekst referentów ma `bindings:[{path,referentId}]` oraz `facts:[{id,referentId,feature,value,source}]`. Obsługiwane fakty dotyczą liczby (`number`) i konceptu (`concept`); `path` wskazuje uczestnika pojedynczego zdania, np. `#/roles/agent`. Fakt jest twardym ograniczeniem tylko dla uczestnika przypisanego do tego samego `referentId`. Tematy nadal są preferencją. Sprzeczne fakty o jednym referencie albo sprzeczność ze wszystkimi odczytaniami zwracają `invalid` / `CONTEXT_CONFLICT`, z listą konfliktów i niepewnością `context_conflict`.

`contextReport` dokumentuje `bindings`, `decisions`, `conflicts` i odrzucone odczytania. Decyzje podają regułę, ścieżkę, referenta, fakt oraz pochodzenie. Powiązanie bez pasującego faktu jest `unconfirmed`; z jawnym zgodnym faktem — `confirmed`. CORE nadal opisuje informację źródłową: nieznana określoność i źródłowe nierozwiązane „he” nie otrzymują dopisanych cech. Kontekstowe ustalenie tożsamości jest osobnym powiązaniem, bez automatycznego podstawienia rzeczownika, wieku ani innych danych.

`createTranslationService(runtime,{session})` korzysta z `ConversationContext.translationContext(context)`. Metoda eksportuje wyłącznie aktywne fakty jawnie zapisane przez `remember`, z pasującą turą i referencją bieżącej sesji. Zwraca identyfikator faktu/tury, język i tekst źródłowy oraz czas zapisu. Import pamięci bez pasującej bieżącej tury nie ustala referenta; fakty zastąpione są pomijane. Jawne fakty żądania mają `source:{kind:"request",id}`. Serwis odrzuca podszywanie się żądania pod pochodzenie `session`; to pochodzenie dodaje dostawca sesji. Bezpośrednie API engine przyjmuje przygotowany kontekst z tej metody i nie prowadzi własnej pamięci.
