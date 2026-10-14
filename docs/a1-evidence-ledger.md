# A1 Batch 7 — wspólny rejestr niezależnych zestawów gold

**Aktywne repozytorium:** https://github.com/clickbytes/flexLingua

## Cel

Od Batch G2 i Batch 3–6 istnieje sześć osobnych autorskich fixture'ów, zweryfikowanych w odrębnych testach. Historyczny `npm run audit:a1-gaps` wykazuje jedynie dowody z zamrożonego G2 i słusznie nie powinien ich automatycznie łączyć. Nowe, niezależne narzędzie `tools/a1-evidence-ledger.mjs` łączy *katalog* dowodów z **rzeczywiście wykonanymi** testami Node, zachowując stary raport bez zmian.

## Zestawy i zakres

| Zestaw | Pozytywne próbki | Odmowy | Komórki morfologii |
| --- | ---: | ---: | ---: |
| G2 | 32 | 8 | 0 |
| Rodzina/czynności | 16 | 4 | 18 |
| Ojciec/father | 16 | 4 | 16 |
| Ruch iść/go | 18 | 4 | 11 |
| Pisać/otwierać | 22 (w tym 2 productive-only) | 5 | 15 |
| Kompozycja/dyskurs | 11 | 0 | 0 |
| **Razem** | **115** | **25** | **60** |

To **przypadki kontrolowane**, nie wymierny procent pokrycia CEFR. Każdy przypadek jest przypisany do własnego pliku źródłowego i testu. W porównaniu przypadków sprawdzamy tylko **jawnie opisane** znaczenia CORE (pojęcie predykatu i te role, które fixture wyraźnie deklaruje); nie wnioskujemy obecności haseł z samej pisowni ani z analizy silnika, aby uniknąć tautologii. Nakładanie się autorstwa, projektowania reguł i oceny nie gwarantuje testu niewidzianych wcześniej zdań.

## Uruchomienie

```sh
npm run report:a1-evidence      # sam katalog, bez testów — verification.status = not-run
npm run check:a1-evidence       # 6 prawdziwych procesów Node, fail-closed
npm run check:release          # wymaga także GUI/standalone i pełnego npm test
```

`check:a1-evidence` uruchamia kolejno:
- istniejące `tools/report-a1.mjs --strict` dla G2;
- testy Node dla rodziny, ojca, ruchu, codziennych czynności i kompozycji.

Raport zawiera statusy `pass`, `fail`, `not-run` wraz z faktycznym kodem wyjścia oraz oddzielne `annotatedCases` i `verifiedCases`. Jeżeli choć jedna grupa nie przechodzi, CLI zwraca kod 1; jeśli nie uruchomiono żadnej, nie raportuje sukcesu. Dodatkowo raportuje duplikaty wejściowych zdań między zestawami bez udawania, że zbiory są reprezentatywne.

W izolowanym teście funkcji na obecnych fixture'ach, przy **symulowanych pozytywnych wynikach sześciu grup**, 14 z 23 celów ma jawne dowody w obu kierunkach, 2 w jednym kierunku, a 7 nie jest jawnie opisanych w gold. Są to liczby autorskiej listy 23 celów, **nie** procent CEFR, a przed realnym wykonaniem `check:a1-evidence` żaden stan symulowany nie jest zweryfikowanym testem. `cefr.percentage:null` pozostaje obowiązkowe.

## Połączenie z CI i własność kodu

`check:a1-evidence` jest częścią `lexical-audits` oraz `check:release`. Zadania GUI wciąż są prowadzone niezależnie w [issue #1](https://github.com/clickbytes/flexLingua/issues/1); brak zielonego standalone uniemożliwia ogłoszenie całego wydania jako gotowego. CORE-agent nie dotyka HTML, CSS, `js/ui` ani `index-standalone.html`.
