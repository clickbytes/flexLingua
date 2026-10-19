# Kanoniczna macierz testów zdań

`tests/` jest **jedynym** katalogiem testów w repozytorium i jedynym źródłem prawdy o oczekiwanych tłumaczeniach zdań. Status produktu: najpierw pojedyncze zdania poziomu A1 (etykieta autorska planistyczna, bez twierdzeń o pełnym CEFR) dla PL↔EN, z jawnymi odmowami i pilotami innych deklarowanych kierunków. Nie odtwarzamy historycznych unit testów, gold-runnerów CEFR, benchmarków ani testów TUI; jedyne dopuszczone uruchomienie to runner `tests/run.mjs` (`npm test`) oraz workflow `translation-matrix` w GitHub Actions.

## Struktura docelowa

```text
tests/
  README.md
  schemas/{case,catalog,surface-equivalence}.schema.json   # JSON Schema 2020-12
  catalog/{a1-single,required-ids,surface-equivalence}.json
  cases/<from>-<to>/*.json             # koperty {"schemaVersion":"1.0","cases":[...]}
  gaps/known-gaps.json
  lib/{discover,validate,assertions,coverage,report,cli}.mjs
  run.mjs
  .reports/                            # generowane, nigdy nie commitowane
```

`examples/cli-sentences.md` pozostaje wyłącznie przewodnikiem dla człowieka; nowe dane testowe trafiają zawsze do `tests/cases/`. Kody produktu (`tools/translate.mjs`, `tools/compile-language.mjs`) są produkcyjne i nie są testami.

## Kontrakt koperty z przypadkami

Plik `tests/cases/<from>-<to>/<rodzina>.json` to jeden kopert JSON `{"schemaVersion":"1.0","cases":[{...}]}`; każdy element waliduje `tests/schemas/case.schema.json`. Kluczowe pola:

- `id` — unikalny, stabilny identyfikator (`A1-EN-PL-VISUAL-0001`), spójny z `direction` w folderze.
- `schemaVersion`, `level` (`A1` autorskie albo `pilot`), `mode:"single-sentence"`, `construction`, `tier:"required"|"exploratory"`, `priority`, `tags` (tense, aspect, polarity, person, number, reference, quantity), `purpose`.
- `input:{from,to,text}` i `expected:{status,text,meaning,diagnostics,alternatives,informationLoss,graph?}`; statusy `ok|unsupported|invalid|ambiguous|resource_limit|...`. Błąd infrastruktury (**`error`/`INFRASTRUCTURE_ERROR`**) **nigdy** nie jest dozwolonym `expected`.
- `review:{status,source,author,reviewedAt,issue}` — tylko `approved` może być w wymaganym gate; `proposed` jest dozwolone wyłącznie dla `tier:"exploratory"` i nie liczy się jako dowód. `author` wskazuje rzeczywistego recenzenta: właściciela projektu albo agenta z jawną delegacją zapisaną w issue; nie przypisujemy agentowej decyzji człowiekowi.
- `requirements:{coverageTargetId,capability}` — wiąże przypadek z celem planistycznym z `tests/catalog/a1-single.json`.

W `expected` dla `status:"ok"` wymagane są: `text.accepted[]` (dokładne, ograniczone warianty, porównanie po normalizacji NFC), `meaning.type`, `meaning.concept` (albo `kind` dla stanów), dokładny `meaning.roleSet`, per-role `concept`/`features` oraz `meaning.assert` — mapa JSON-Pointer (prefiks `#/`) → wartość skalar, porównywana dokładnie, nigdy substringiem. Jedyny wyjątek od płaskiego kształtu to jawny `question.yes-no`: `meaning:{type:"question",questionType:"yes_no",proposition:<expected event>,assert:{...}}`. Wrapper nie ma fikcyjnego concept, roles, roleSet ani features; porównanie schodzi dokładnie o jeden poziom do event proposition. Proposition i wrapper mają osobne `assert` — wskaźniki w każdym z nich są względne do tego MeaningGraph node. Nested `informationLoss.path` ma pełny prefix `#/proposition/...`. Nie wspieramy rekurencyjnych question wrappers ani WH expected w tym wariancie. `construction.question.yes-no` (target) i `question.yes-no` (capability) nie są CORE concept IDs. Katalog zapisuje wyłącznie ten wrapper jako `unitType:"construction",kind:"question",concept:null`.

`alternatives` i `informationLoss` mają zawsze jawne `required[]` oraz `allowUnexpected` — brak pola nie oznacza zgody na dowolną stratę. Odwołania do alternatyw pasują semantycznie (typ, koncept, role; dla pytania również `questionType` i proposition) albo literalnie (tekst), nigdy heurystycznie.

Uczestnik zaimkowy może mieć `target:{kind:"deictic",anchor}` i `agreement:{person,number}` albo `target:{kind:"anaphoric",resolution:"unresolved"}` i `agreement:{person:"third",number:"singular",gender:"feminine"|"masculine"}`. Asercje sprawdzają dokładny kształt referencji i zgodności, w tym rodzaj, bez wymyślania poprzednika zaimka.

Opcjonalne `expected.uncertainties:{required,allowUnexpected}` sprawdza rodzaj, ścieżkę znaczenia, możliwości i przyczynę niepewności. Każdy wynik serwisu ma tablicę `uncertainties`, niezależnie od tego, czy przypadek wymienia dodatkowe asercje. `verifyEngine:true` uruchamia w tym samym runnerze publiczne `Engine.translate`, `tryTranslate` i `analyze` wobec tego samego niezależnego oracle; wynik przeglądu każdego wejścia jest zachowany w `matrix.json`. Nie powstaje osobny runner ani zbiór oczekiwań.

`input.context` może zawierać jawne `topics`, `senses`, powiązania `bindings` i pochodzące z żądania lub sesji `facts`. CLI przyjmuje je przez `--context-json`; `input.search` jest dostępne przez `--search-json`. `cliSmoke:true` uruchamia zatem również przypadki z tymi jawnie podanymi opcjami. Różne konteksty są różnymi żądaniami, a kolejność kluczy lub tematów nie tworzy nowego przypadku.

`expected.interpretations` sprawdza znaczenie i status każdego odczytania, kompletne teksty realizacji, liczbę założeń, identyfikatory reguł, pozycję i remis oraz tekst dostępnego podglądu. Runner zawsze sprawdza unikalność ID i powiązania realizacji z odczytaniem. Dane są zapisane w `matrix.json`. `analyze` jest sprawdzany wobec źródłowego znaczenia/odmowy; realizacje docelowe sprawdzają `translate`, `tryTranslate` i serwis.

`input.includeSegments:true` żąda segmentów wybranego pełnego wariantu; `input.previewId` wybiera całe zdanie po stabilnym ID realizacji. `expected.segments.required` sprawdza tekst, ścieżkę znaczenia i zakres UTF-16 po stronie docelowej oraz rzeczywisty zakres źródła albo jawny powód `unavailable`. Gdy źródło pomija podmiot, asercja może sprawdzić, że targetowy zaimek jest związany z rolą, ale jego `source` ma `status:"unavailable"` zamiast zmyślonego zakresu. Segmenty są widokiem realizacji, nie niezależnymi zamiennymi tokenami. Przypadki z `review.status:"proposed"` pozostają eksploracyjne także po PASS; nie trafiają do `required-ids.json` bez osobnego zatwierdzenia dokładnych ID.

`input.search.maxReadings` (1–16) pozwala sprawdzić kontrolowane przekroczenie budżetu na prawdziwym zdaniu. Budżet jest częścią tożsamości żądania i może być przekazany CLI przez `--search-json`. Przypadki `proposed` nadal są eksploracyjne nawet po pozytywnym wykonaniu; nie zwiększają zatwierdzonego pokrycia.

`input.context.bindings` wiąże ścieżkę uczestnika z konkretnym referentem; `facts` zawiera jawne fakty liczby/konceptu i ich pochodzenie. `expected.context` sprawdza stan powiązań, użyte/pominięte fakty, konflikty i identyfikatory źródeł sesyjnych. Konteksty porównujemy niezależnie od kolejności kluczy/faktów/powiązań. `session:{caseId,rememberRole}` tworzy w tym samym runnerze prawdziwą sesję z zatwierdzonego poprawnego przypadku, sprawdza ją wobec jego oracle i jawnie zapisuje wskazanego uczestnika przez `remember`. Przypadek nadal ocenia jedno bieżące zdanie. Dane przygotowania sesji i raport kontekstu trafiają do `matrix.json`; sprawdzenia engine korzystają z tego samego przygotowanego kontekstu co serwis.

`expected.graph` jest opcjonalną projekcją sprawdzaną po tekście i MeaningGraph przez tę samą produkcyjną `Engine.projectMeaningGraph`. Ma wymagane `requiredEdges[]`, `forbiddenEdges[]` i `allowUnexpected`; każda krawędź zapisuje `fromPath` (JSON Pointer źródła MeaningGraph), `relation` i kanoniczny `toConcept`. Walidator sprawdza źródło, cel i sygnaturę relacji na skompilowanym CORE przed uruchomieniem zdań. Brak projekcji lub niekompletne `sourcePaths` to INFRA; brak/nadmiar krawędzi to FAIL. Nierozwiązane fragmenty projekcji nie przechodzą asercji grafowej.

Dla `unsupported|invalid|resource_limit` wymagane są `text:null`, `meaning:null`, puste alternatywy i lista wymaganych kodów diagnostyki. Dla `ambiguous` wymagany jest zbiór co najmniej dwóch odrębnych sensów (porównywane znaczeń, nie tylko liczby) oraz kod `AMBIGUOUS_MEANING`; runner nie wybiera arbitralnego tekstu.

## Zasady wyników

- **PASS translation** — zgodny tekst **i** zgodna semantyka (roles, features, asercje), bez niepożądanej straty informacji.
- **PASS refusal** — jawnie nieobsługiwana albo niepoprawna wypowiedź została odmówiona z oczekiwanym kodem, null `text`/`meaning`. Poprawna odmowa NIE świadczy o umiejętności tłumaczenia.
- **PASS ambiguity** — właściwy, dokładny zbiór sensów alternatywnych, bez arbitralnego wyboru.
- **FAIL** — rozbieżność roli, czasu, aspektu, polaryzacji, liczby, referencji, tekstu albo niespodziewana odmowa; blockuje.
- **INFRA** — wyjątek, `error`, exit 1 CLI dla wymaganego przypadku; zawsze blockuje i wymaga oddzielnego bugfixa.
- **KNOWN-GAP i NOT-RUN** — raportowane jawnie, **nigdy nie liczą się jako PASS**. Znany błąd i poprawne zdanie odmówione jako niedostępne w wymaganym zakresie idą do `tests/gaps/known-gaps.json` z `observedAtSha`, severity, ownerem i issue follow-up; historycznych obserwacji nie wpisuje się bez ponownego wywołania.

## Rządy zmian i ochrona zbioru

- Nie wolno usuwać przypadku, zmniejszyć `required-ids`, zmienić `approved`→`exploratory`, podmienić expected na faktyczny output silnika ani zamazać błąd jako `unsupported` bez jawnego review.
- Usunięcie lub zmiana wpisu w `tests/catalog/required-ids.json` wymaga jawnego przeglądu diffu przez człowieka, udokumentowanego w powiązanym issue/PR. Walidator odrzuca puste i zduplikowane listy, brakujący przypadek nadal wymieniony na liście oraz niespójność `required`/`approved`. Jednoczesnego skreślenia ID z listy i pliku przypadku nie da się wykryć z samego zmienianego katalogu; to kontrola review PR.
- Przypadek może być członkiem wielu grup relacyjnych (współdzieliony A w układzie `A~B` i `A≠C` jest legalny). Walidator odrzuca natomiast powtórzenie tego samego case ID w jednej grupie, identyczną grupę semantyczną (ten sam kierunek, relacja i zestaw członków) pod dwoma ID oraz jawnie sprzeczne relacje dla tej samej pary członków między grupami.
- Teksty, koncepcje i diagnozy oczekiwane były pisane przed uruchomieniem; `review.source` dokumentuje niezależne źródło oczekiwań (np. dowody historyczne z issue), a PR pokazują wykonane komendy z SHA.
- Dla nowych graph-constrained required cases zatwierdzenie konkretnych ID i znaczeń musi być zapisane w komentarzu GitHub przed ustawieniem `review.status:"approved"` lub dodaniem ID do `required-ids.json`; pole `review` samo nie zastępuje tej decyzji. Właściciel projektu może jawnie powierzyć ocenę językową wskazanych przypadków agentowi. Agent zapisuje własne uzasadnienie form, ról, cech, strat informacji, grafu i odmów oraz zakres delegacji; zgodność z outputem silnika nie jest uzasadnieniem. Ta delegacja nie osłabia ochrony wcześniejszych required expected ani osobnego przeglądu źródeł i praw do wsadów danych.
- Warianty poza wymaganym zakresem mogą być obserwowane, ale nie podnoszą raportowanej jakości A1; deklaracje capabilities bez pozytywnego świadectwa są raportowane oddzielnie (coverage).

## Relacyjne grupy semantyczne

`tests/catalog/surface-equivalence.json` wiąże istniejące przypadki w grupy `same-core` albo `different-core`. Nie tworzy kopii oczekiwanego znaczenia ani nowych przypadków. Każda grupa ma unikalne ID, jeden kierunek, od 2 do 8 unikalnych case ID i `comparison:"strict-core"`. Case ID może należeć do wielu grup (współdzielony A w `A~B` i `A≠C` jest legalny), ale ta sama para członków musi wszędzie mieć tę samą relację; identyczna grupa semantyczna pod dwoma ID jest odrzucana. Wskazany przypadek musi istnieć, mieć ten sam kierunek, `tier:"required"`, `review.status:"approved"`, `expected.status:"ok"` i expected MeaningGraph. Walidator odrzuca także grupę sprzeczną z już zatwierdzonymi expected MeaningGraphs, pusty katalog grup oraz ID grupy chronionej w `required-ids.requiredRelationIds`, której katalog nie deklaruje. Chronione ID muszą być zadeklarowane w katalogu wraz z poprawnymi grupami i muszą PASS w gate relacyjnym; grupa bez wpisu w `requiredRelationIds` jest dobrowolna i nie zmienia obowiązkowych liczników.

Zatwierdzone przypadki FWO-10 pokazują obie strony tej relacji: `Kobieta widzi mamę.` i `Mamę widzi kobieta.` mają ten sam MeaningGraph, bo polski biernik nadal wskazuje `theme`, a mianownik `agent`; `The woman sees the dog.` i `The dog sees the woman.` mają różne grafy, bo angielski szyk SVO zamienia role. PL→EN jawnie zachowuje nieokreśloność źródłowych rzeczowników i stratę aspektu niedostępnego w angielskim czasie prostym. EN→PL zapisuje stratę rodzajnika określonego, której polski rzeczownik nie oznacza. Odmowa dla angielskiego szyku z wysuniętym dopełnieniem dotyczy ograniczenia tego prototypu, nie gramatyczności angielskiego; `The child sees a bank.` zachowuje oba odczytania (`place.financial_institution` i `place.riverbank`) bez zgadywania.

Nowe expected meanings należy niezależnie uzasadnić i zatwierdzić przed ich uruchomieniem. CLI służy potem do sprawdzenia oracle, ról, cech, informacji utraconej, diagnostyk i kodu wyjścia; zgodny output nie jest samodzielną akceptacją. Przed scaleniem raport PR porównuje `matrix.json` z ostatnim zielonym artefaktem `main`, w tym zmiany ID, oczekiwań, klas wyników, inventory i relacji.

Przykład:

```json
{
  "schemaVersion": "1.0",
  "purpose": "Relacyjne asercje na zatwierdzonych przypadkach.",
  "groups": [{
    "id": "FWO-PL-0001",
    "direction": "pl-en",
    "relation": "same-core",
    "caseIds": ["A1-PL-EN-VISUAL-0001", "A1-PL-EN-OVSVISUAL-0001"],
    "comparison": "strict-core"
  }]
}
```

Po wykonaniu zdań runner porównuje wynikowe MeaningGraphs rekurencyjnie. Obiekty porównuje niezależnie od kolejności kluczy, tablice zachowują kolejność, a tekst normalizuje do NFC. Zachowane są wszystkie role i referenty oraz cechy, w tym czas, aspekt, polaryzacja, określoność i zakres. W wynikowych MeaningGraphs ignorowane są wyłącznie metadane prezentacji i śladu powierzchniowego (`surface`, `surfaceTrace`, `presentation`). Podczas sprawdzania relacji wobec zatwierdzonego oracle pomijane są dodatkowo jego dyrektywy testowe (`assert`, `roleSet`, `roleFeaturesExact`, `featuresAllowExtra`), które nie należą do wynikowego MeaningGraph. `unknown` pozostaje zwykłą wartością i nigdy nie jest normalizowane do pominięcia.

`same-core` wymaga identycznej treści materialnej wszystkich wyników; `different-core` wymaga różnicy każdej pary. Brak wyniku `ok`, MeaningGraph lub wykonania grupy daje `NOT RUN`, nie PASS. `FAIL` albo `NOT RUN` zadeklarowanej grupy blokuje gate macierzy, ale pozostaje osobnym wynikiem relacji — nie zmienia klasy FAIL/INFRA/odmowy pojedynczego przypadku ani liczników coverage. Pusty katalog raportuje `NOT RUN`, bez twierdzenia o pokryciu. JSON, Markdown i JUnit zachowują status, ID grup, case ID oraz ścieżki różnic; `test:report` odtwarza je bez ponownego tłumaczenia.

## Uruchamianie

Runner przyjmuje opcje prezentacji po poleceniu npm. Domyślne `--verbosity=normal`
wypisuje każdy przypadek z kierunkiem, pełnym zdaniem źródłowym i zaobserwowanym
tekstem docelowym. Przy nierozstrzygniętej wieloznaczności pokazuje pełne realizacje
z etykietą podglądu, bez przedstawiania go jako rozstrzygniętego tłumaczenia.
Kontrolowana odmowa pokazuje źródło i faktyczną diagnostykę, bez dopisywania celu.

`--verbosity=verbose` dodaje czas, expected/observed, MeaningGraph, diagnostykę,
straty informacji oraz szczegóły interpretacji i realizacji. `--verbosity=quiet`
pomija udane przypadki i pozostawia podsumowania; każdy FAIL i INFRA nadal ma
widoczny identyfikator oraz szczegóły. Wartości można podać po `=` albo jako
osobny argument. Nie zmieniają klasyfikacji, raportów, coverage ani kodu wyjścia.

`--color=auto` (domyślnie) włącza ANSI tylko w terminalu i wyłącza je przy
ustawionym `NO_COLOR`; `--color=always` wymusza kolory, a `--color=never`
wyłącza je. Przykłady:

```sh
npm run test:ci -- --verbosity=verbose
npm run test:ci -- --verbosity quiet --color never
npm run test:ci -- --verbosity=normal --color=always
```

```sh
npm run test:validate           # tylko schematy i reguły krzyżowe (bez wykonania)
npm run test:matrix             # macierz + coverage + raporty
npm run test:cli                # macierz + coverage + batchowy smoke CLI + raporty
npm run test:report             # odtworzenie Markdown/JUnit z istniejącego matrix.json
npm run test:ci                 # pełny gate: validate + matrix + coverage + CLI smoke + raporty
npm test                        # ten sam pełny gate co test:ci i GitHub Actions
```

Kody zakończenia: `0` — wszystkie wykonane gate zielone; `1` — wymagany FAIL/INFRA, niepoprawne lub niekompletne dane macierzy albo brak wymaganej próbki CLI; `2` — błąd argumentów; `3` — `--report` bez poprawnego, istniejącego `matrix.json`. `--report` nie uruchamia translacji. Błędy infrastruktury (wyjątek, status `error`, exit 1 CLI) są zawsze czerwone i nigdy nie trafiają do kategorii odmów.

Macierz wykonuje zdania kolejno na jednej instancji produkcyjnego serwisu. Smoke CLI uruchamia prawdziwy proces `tools/translate.mjs` dla jednego przypadku, a resztę wykonuje w paczce przez tę samą funkcję CLI i ponownie używane runtime’y dla danego zestawu języków (np. EN→PL i PL→EN współdzielą jedną instancję). Każdy wynik zachowuje kontrolę oczekiwanego kodu wyjścia i pełnego dokumentu względem macierzy. Prawdziwy proces nadal sprawdza pojedynczy dokument JSON na stdout, stderr i limit 30 sekund; timeout, awaria procesu i błędny JSON pozostają INFRA.

Raporty po `test:matrix`, `test:cli` i pełnym przebiegu: `tests/.reports/{matrix.json, summary.md, junit.xml}` (git-ignored). JSON zawiera SHA, tryb, expected, observed i różnice dla każdego przypadku, w tym projekcję typed graph, jeśli przypadek jej oczekuje. Coverage pokazuje CORE ID/type/edge counts, unikalne lemmy NFC + casefold, senses oraz odrębne `dataOnly`, `morphologyReady` (rzeczywiste formy providera) i `sentenceLicensed` (lemma powierzchniowo obecne w udanym, zatwierdzonym required case EN↔PL). Pokazuje osobno liczbę przypadków A1 dla EN↔PL oraz required cases innych kierunków. Podaje liczniki dla każdego kierunku: total, tłumaczenia, odmowy, ambiguity, FAIL/INFRA/NOT RUN, unikalne wejścia i ramy znaczenia. Te liczniki są obserwacją aktualnej bazy, nie zaliczeniem docelowych 1000/500. `test:report` odtwarza dwie prezentacje z tego JSON bez zmiany wyników i bez ponownego wywołania Engine. W akcji repozytorium runner dopisuje `summary.md` do `$GITHUB_STEP_SUMMARY`, a workflow `translation-matrix` publikuje raporty jako artefakt.

**Jak jawnie zademonstrować czerwony stan** (obowiązuje tylko lokalnie, nie commitujemy): tymczasowo zmień jedno pole `expected` w zatwierdzonym przypadku, np. `#/features/tense` w `A1-EN-PL-VISUAL-0001` albo usuń jeden z dwóch sensów w `A1-EN-PL-AMBIGUOUS-0001`, uruchom `npm test` — runner pokazuje FAIL/`GATE: RED` i kod 1; przywróć plik. Prawdziwe czerwone stany pochodzą ze zmian silnika/danych i blokują merge; naprawianie ich przez edycję expected jest zabronione (sekcja powyżej).

GitHub Actions: workflow `.github/workflows/translation-matrix.yml` uruchamia ten sam runner przez `npm test` dla PR do `main`, pusha na `main` i ręcznego `workflow_dispatch` jako jeden wymagany status check o nazwie `translation-matrix`. Brak innych ścieżek testowych; `tests/.reports/` jest ignorowany przez git i nigdy nie jest commitowany.

Przed merge porównaj artefakt `matrix.json` z ostatniego udanego przebiegu `main` na base SHA PR z artefaktem PR. W komentarzu PR podaj oba SHA, nowe/usunięte ID, zmiany `input`, `expected`, `observed` i klasy wyniku dla dawnych required cases, liczbę nowych required i exploratory, rozdział translation/refusal/ambiguity oraz przyrosty inwentarza. Nie zaliczaj odmowy jako nowego tłumaczenia. Workflow nadal uruchamia jeden wymagany runner; porównanie artefaktów jest obowiązkowym krokiem przeglądu, a nie nową ścieżką testową.

## Zgłaszanie regresji

Regresję (FAIL/INFRA na zatwierdzonym wymaganym przypadku) raportuj w GitHub issue z `matrix.json` z `tests/.reports/`, dokładnym SHA, komendą i minimalnym diffem znaczenia. Naprawy silnika to osobne issue/PR; nie modyfikuj expected po to, by PR stał się zielony.
