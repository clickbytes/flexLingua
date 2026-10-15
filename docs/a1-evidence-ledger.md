# A1 Batch 8 — wspólny rejestr zestawów gold

**Aktywne repozytorium:** https://github.com/clickbytes/flexLingua

## Cel

Rejestr obejmuje wcześniejsze próbki, gold stanów STATE-05 i osobny korpus VAL-02 H1. G2 pozostaje zestawem rozwojowym; H1 ma własne stabilne ID, statyczny gold i testy w obu kierunkach. Autor H1 nie był niezależny od implementacji — rozdzielenie autorów nie było dostępne — więc zestaw nie jest ślepą ani niezależną oceną. `tools/a1-evidence-ledger.mjs` łączy katalog dowodów z **rzeczywiście wykonanymi** testami Node.

## Zestawy i zakres

### VAL-03 — integralność i stabilne wydanie

Każde źródło ma klasyfikację `development`, `regression` albo `held-out`. Raport pokazuje osobno próbki zadeklarowane i próbki z potwierdzonym przejściem testu. H1 jest poza zestawem rozwojowym, ale nie jest niezależną ewaluacją: autorem fixture był implementer.

Ledger przypina SHA-256 do wszystkich trzynastu plików gold i sprawdza je przed uruchomieniem któregokolwiek zestawu. Zmianę gold należy połączyć z ponownym przeglądem i aktualizacją digestu w `tools/a1-evidence-ledger-lib.mjs`. Brak pliku, niepoprawny JSON albo rozbieżny digest kończy CLI błędem przed zapisem raportu. `tools/report-a1.mjs` sprawdza w ten sam sposób G2.

`sampleQuality.declared` i `sampleQuality.verified` zawierają osobne liczniki EN→PL i PL→EN dla próbek pozytywnych i negatywnych. Morfologia jest rozbita według języka. Duplikaty są wykrywane po normalizacji Unicode NFC, wielkości liter i białych znaków; raport podaje powtórzone obserwacje, grupy z powtórzeniami wewnątrz źródeł i grupy obejmujące wiele źródeł. Te kategorie mogą się pokrywać. `release.id` jest skrótem przypiętych wejść i definicji zestawów, więc nie zmienia się między powtórzeniami przy tych samych danych. Zapis przez `--output` jest atomowy.

Każde uruchomienie zestawu gold ma status, faktyczny PID procesu Node, wersję i ścieżkę runtime, argumenty oraz kod wyjścia. W trybie katalogowym zestawy pozostają `not-run`, mają `exitCode: null` i nie udają uruchomionych procesów. `cefr.percentage` pozostaje `null`, bo repozytorium nie deklaruje licencjonowanego, reprezentatywnego mianownika.

| Zestaw | Pozytywne próbki | Odmowy | Komórki morfologii |
| --- | ---: | ---: | ---: |
| G2 | 32 | 8 | 0 |
| Rodzina/czynności | 16 | 4 | 18 |
| Ojciec/father | 16 | 4 | 16 |
| Ruch iść/go | 18 | 4 | 11 |
| Czynności i predykaty (w tym 2 productive-only) | 22 | 5 | 15 |
| Kompozycja/dyskurs | 46 | 1 | 0 |
| Osoba/deiksy PERS-06 | 40 | 10 | 0 |
| Stany STATE-05 | 48 | 7 | 0 |
| Napoje bez rodzajnika A1-ENPL-03 | 8 | 5 | 0 |
| Egzystencjalne lokatywy A1-ENPL-04 | 4 | 6 | 0 |
| Predykacja stanu w czasie przeszłym A1-ENPL-05 | 10 | 7 | 0 |
| Przestrzeń i czas | 64 | 9 | 0 |
| Held-out VAL-02 H1 | 200 (100 na kierunek) | 20 | 0 |
| **Razem** | **524** | **90** | **60** |

To **przypadki kontrolowane**, nie wymierny procent pokrycia CEFR. Każdy przypadek jest przypisany do własnego pliku źródłowego i testu. W porównaniu przypadków sprawdzamy tylko **jawnie opisane** znaczenia CORE (pojęcie predykatu i te role, które fixture wyraźnie deklaruje); nie wnioskujemy obecności haseł z samej pisowni ani z analizy silnika, aby uniknąć tautologii. Nakładanie się autorstwa, projektowania reguł i oceny nie gwarantuje testu niewidzianych wcześniej zdań.

## Uruchomienie

```sh
npm run report:a1-evidence      # sam katalog, bez testów — verification.status = not-run
npm run check:a1-evidence       # 13 procesów Node, fail-closed
npm run check:release           # pełny zestaw kontroli CORE i testów Node
```

`check:a1-evidence` uruchamia kolejno:
- istniejące `tools/report-a1.mjs --strict` dla G2;
- testy Node dla rodziny, ojca, ruchu, codziennych czynności i kompozycji;
- test Node dla 40 przypadków osoby/deiksów oraz 10 błędnych form;
- `tests/a1-state-gold.test.js` dla 40 zdań stanów i 8 odmów;
- `tests/a1-past-state-predication.test.js` dla 10 dwukierunkowych przypadków predykacji przeszłej i 7 odmów;
- `tests/a1-heldout.test.js` dla 200 zdań dwukierunkowych i 20 odmów.

Raport zawiera statusy `pass`, `fail`, `not-run` wraz z faktycznym kodem wyjścia oraz oddzielne `annotatedCases` i `verifiedCases`. Jeżeli choć jedna grupa nie przechodzi, CLI zwraca kod 1; jeśli nie uruchomiono żadnej, nie raportuje sukcesu. Dodatkowo raportuje duplikaty wejściowych zdań między zestawami bez udawania, że zbiory są reprezentatywne.

Rejestr oddziela liczbę jawnie oznaczonych przykładów od rzeczywistych wyników testów. `cefr.percentage:null` pozostaje obowiązkowe.

## Połączenie z CI i własność kodu

`check:a1-evidence` jest częścią `lexical-audits` oraz `check:release`. Osobny person gold także jest wykonywany przez `check:gold-person` w `lexical-audits` i `check:release`. Lokalny UI uruchamia się przez HTTP.

## Wynik prawdziwego CI po Batch 7

Historyczny [GitHub Actions run #38609956499](https://github.com/clickbytes/flexLingua/actions/runs/38609956499) (gałąź PR #3) wykonał 401 testów Node: 398 pass i 3 fail w dawnym zakresie offline/Studio. Te regresje naprawiono w [PR #84](https://github.com/clickbytes/flexLingua/pull/84); późniejszy pełny release run #38625444693 był zielony. Dawny wynik nie opisuje aktualnego statusu.

## Wynik po PERS-06

[PR #93](https://github.com/clickbytes/flexLingua/pull/93) dodał siódmy fixture osoby/deiksów. Hosted [Actions #38639074374](https://github.com/clickbytes/flexLingua/actions/runs/38639074374) na merge SHA `04aeaa811453e8aa8054779af6a903e24dd4e953` zakończył sukcesem wszystkie trzy jobs; rejestr wykazał 7/7 suite pass, 155 prób pozytywnych i 35 odmów. Pełny zestaw Node przeszedł 429/429, a coverage 4/4. CEFR nadal nie jest mierzony.

## VAL-02 H1

`data/coverage/a1-heldout-v1.json` zawiera 100 ręcznie napisanych par PL/EN, ocenianych w obu kierunkach (200 wejść) oraz 20 jawnych odmów. Każdy przykład opisuje role, liczbę, czas, polarność i operatory. Zestaw jest wykonywany z produktywnymi adapterami morfologii potrzebnymi dla użytych haseł; pięć przykładów `open/house` o niezgodnym typie roli poprawiono po pierwszym pilotażu. Teksty docelowe nie były kopiowane z odpowiedzi parsera. Fixture jest statyczny i ma wersję `H1-v1`; test nie aktualizuje oczekiwanego tekstu ani CORE. Hash SHA-256: `2913b8ea0451ee51b321342336a310f5d1f2b2743a8e6b22999ef7e818f3fee3`. Commit zamrażający: `2d58a65c8b4bef711bb3b72f1bb508518a2a4723`. Ponieważ autor gold implementował też reguły, wyniki są dowodem na ustalonym korpusie projektu, nie niezależną ewaluacją ani procentem CEFR.

