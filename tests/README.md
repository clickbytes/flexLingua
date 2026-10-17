# Kanoniczna macierz testów zdań

`tests/` jest **jedynym** katalogiem testów w repozytorium i jedynym źródłem prawdy o oczekiwanych tłumaczeniach zdań. Status produktu: najpierw pojedyncze zdania poziomu A1 (etykieta autorska planistyczna, bez twierdzeń o pełnym CEFR) dla PL↔EN, z jawnymi odmowami i pilotami innych deklarowanych kierunków. Nie odtwarzamy historycznych unit testów, gold-runnerów CEFR, benchmarków ani testów TUI; jedyne dopuszczone uruchomienie to runner `tests/run.mjs` (`npm test`) oraz workflow `translation-matrix` w GitHub Actions.

## Struktura docelowa

```text
tests/
  README.md
  schemas/{case,catalog}.schema.json   # JSON Schema 2020-12
  catalog/{a1-single,required-ids}.json
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
- `input:{from,to,text}` i `expected:{status,text,meaning,diagnostics,alternatives,informationLoss}`; statusy `ok|unsupported|invalid|ambiguous|resource_limit|...`. Błąd infrastruktury (**`error`/`INFRASTRUCTURE_ERROR`**) **nigdy** nie jest dozwolonym `expected`.
- `review:{status,source,author,reviewedAt,issue}` — tylko `approved` może być w wymaganym gate; `proposed` jest dozwolone wyłącznie dla `tier:"exploratory"` i nie liczy się jako dowód.
- `requirements:{coverageTargetId,capability}` — wiąże przypadek z celem planistycznym z `tests/catalog/a1-single.json`.

W `expected` dla `status:"ok"` wymagane są: `text.accepted[]` (dokładne, ograniczone warianty, porównanie po normalizacji NFC), `meaning.type`, `meaning.concept` (albo `kind` dla stanów), dokładny `meaning.roleSet`, per-role `concept`/`features` oraz `meaning.assert` — mapa JSON-Pointer (prefiks `#/`) → wartość skalar, porównywana dokładnie, nigdy substringiem. `alternatives` i `informationLoss` mają zawsze jawne `required[]` oraz `allowUnexpected` — brak pola nie oznacza zgody na dowolną stratę. Odwołania do alternatyw pasują semantycznie (typ, koncept, role) albo literalnie (tekst), nigdy heurystycznie.

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
- Teksty, koncepcje i diagnozy oczekiwane były pisane przed uruchomieniem; `review.source` dokumentuje niezależne źródło oczekiwań (np. dowody historyczne z issue), a PR pokazują wykonane komendy z SHA.
- Warianty poza wymaganym zakresem mogą być obserwowane, ale nie podnoszą raportowanej jakości A1; deklaracje capabilities bez pozytywnego świadectwa są raportowane oddzielnie (coverage).

## Uruchamianie

```sh
npm run test:validate           # tylko schematy i reguły krzyżowe (bez wykonania)
npm run test:matrix             # macierz + coverage + raporty
npm run test:cli                # macierz + coverage + smoke procesu CLI + raporty
npm run test:report             # odtworzenie Markdown/JUnit z istniejącego matrix.json
npm run test:ci                 # pełny gate: validate + matrix + coverage + CLI smoke + raporty
npm test                        # ten sam pełny gate co test:ci i GitHub Actions
```

Kody zakończenia: `0` — wszystkie wykonane gate zielone; `1` — wymagany FAIL/INFRA, niepoprawne lub niekompletne dane macierzy albo brak wymaganej próbki CLI; `2` — błąd argumentów; `3` — `--report` bez poprawnego, istniejącego `matrix.json`. `--report` nie uruchamia translacji. Błędy infrastruktury (wyjątek, status `error`, exit 1 CLI) są zawsze czerwone i nigdy nie trafiają do kategorii odmów.

Raporty po `test:matrix`, `test:cli` i pełnym przebiegu: `tests/.reports/{matrix.json, summary.md, junit.xml}` (git-ignored). JSON zawiera SHA, tryb, expected, observed i różnice dla każdego przypadku. `test:report` odtwarza dwie prezentacje z tego JSON bez zmiany wyników i bez ponownego wywołania Engine. W akcji repozytorium runner dopisuje `summary.md` do `$GITHUB_STEP_SUMMARY`, a workflow `translation-matrix` publikuje raporty jako artefakt.

**Jak jawnie zademonstrować czerwony stan** (obowiązuje tylko lokalnie, nie commitujemy): tymczasowo zmień jedno pole `expected` w zatwierdzonym przypadku, np. `#/features/tense` w `A1-EN-PL-VISUAL-0001` albo usuń jeden z dwóch sensów w `A1-EN-PL-AMBIGUOUS-0001`, uruchom `npm test` — runner pokazuje FAIL/`GATE: RED` i kod 1; przywróć plik. Prawdziwe czerwone stany pochodzą ze zmian silnika/danych i blokują merge; naprawianie ich przez edycję expected jest zabronione (sekcja powyżej).

GitHub Actions: workflow `.github/workflows/translation-matrix.yml` uruchamia ten sam runner przez `npm test` dla PR do `main`, pusha na `main` i ręcznego `workflow_dispatch` jako jeden wymagany status check o nazwie `translation-matrix`. Brak innych ścieżek testowych; `tests/.reports/` jest ignorowany przez git i nigdy nie jest commitowany.

## Zgłaszanie regresji

Regresję (FAIL/INFRA na zatwierdzonym wymaganym przypadku) raportuj w GitHub issue z `matrix.json` z `tests/.reports/`, dokładnym SHA, komendą i minimalnym diffem znaczenia. Naprawy silnika to osobne issue/PR; nie modyfikuj expected po to, by PR stał się zielony.
