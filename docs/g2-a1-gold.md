# G2 — kontrolowane próbki zdań A1 (PL ↔ INTER ↔ EN)

**Data:** 2026-10-14. **Status:** zestaw do weryfikacji; nie jest certyfikacją CEFR.

Plik `data/coverage/a1-gold-g2.json` zawiera **32 autorskie przykłady** (16 EN→PL i 16 PL→EN), a także **8 niepoprawnych konstrukcji** wymagających odmowy z diagnostyką. Zostały oddzielnie określone oczekiwane teksty, pojęcia CORE, role, liczby, czasy, polarność i kolejność operatorów. Nie są wyprowadzane przez generator podczas testu i nie pochodzą z Oxford.

`tools/a1-gold-lib.mjs` sprawdza oczekiwany tekst i reprezentację CORE po analizie źródła, ponownej analizie tłumaczenia oraz serializacji/odczycie INTER. Celowo nie porównuje określoności rodzajników angielskich z polską nieoznaczoną określonością; nie usuwa pojęcia, roli, liczby ani zakresu negacji/modalności. `tests/a1-gold-g2.test.js` zawiera walidację schematu, przypadki odmowy i mutację sztucznie uszkadzającą gold oracle.

**Granica:** zdania twierdzące, przeczenia, pytania, modale oraz kilka predykatów wielowyrazowych nie pokrywają pełnych kompetencji A1. Brak reprezentatywnego mianownika; raport CEFR pozostaje `null`. W chwili sporządzenia raportu pełny Node checkout i Actions nie były dostępne; późniejsze pełne testy i hosted release runy przeszły. Synchronizacja standalone została wycofana.

Od VAL-02 G2 jest jawnie oznaczony jako zestaw rozwojowy, a nie held-out. Nowe przykłady ocenia osobny, zamrożony korpus `data/coverage/a1-heldout-v1.json`; walidacja G2 nie wczytuje ani nie modyfikuje H1.

Raport `npm run report:a1` i `npm run check:a1-gold` opisane w [G3](g3-a1-report.md) nadal używają wyłącznie G2. VAL-02 H1 jest oddzielną bramką dla nowych przykładów.
