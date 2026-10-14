# Audyt spójności dokumentacji i repozytorium

**Data inspekcji:** 2026-10-12  
**Stan bazowy:** `main` @ `8b3fe6905a8f758f64e9c7178806312bd8ddd01c` (przed korektą odnośników)  
**Charakter:** kontrola istnienia plików i deklarowanych skryptów, **nie** pełny audyt działania ani wyniki testów.

## Wykryte rozbieżności

| Element | Opis w historycznym README | Co potwierdza drzewo repozytorium | Kolejny krok |
| --- | --- | --- | --- |
| Inspektor odmiany | Strony `odmiana.html` i `odmiana-standalone.html` gotowe do otwarcia | Oba pliki **nieobecne na main** | Odtworzyć funkcję i dodać testy albo trwale ograniczyć opis wydania |
| Dokument Batch A | `docs/batch-a-v1.18.md` | Brak pliku | Odtworzyć ze sprawdzonej implementacji/wyników, bez zmyślania pomiarów |
| Dokument v1.14 | `docs/person-future-v1.14.md` | Brak pliku | Odtworzyć lub pozostawić historię oznaczoną jako niezweryfikowaną |
| Dokument v1.13 | `docs/verbs-v1.13.md` | Brak pliku | Odtworzyć lub pozostawić historię oznaczoną jako niezweryfikowaną |
| Weryfikacja odmiany czasowników | `npm run check:gold-verbs` | Brak skryptu w bieżącym `package.json` | Dodać realny walidator lub usunąć historyczną deklarację |
| Wersja repozytorium | README opisuje Batch A v1.18 | `package.json` ma wersję `1.12.0` | Uzgodnić wersjonowanie przy następnym zweryfikowanym wydaniu |

## Co zostało poprawione w dokumentacji

- Główny README nie odsyła już do nieistniejących plików jako dostępnych zasobów.
- Wzmianki o brakujących stronach i historycznych liczbach są wyraźnie oznaczone jako **niezweryfikowane w aktualnej gałęzi**.
- README odsyła do [roadmapy](../ROADMAP.md), [procesu rozwoju](development-workflow.md) i [indeksu dokumentacji](README.md).

## Warunek zamknięcia audytu

Każdy brak wymaga albo przywrócenia odpowiedniego pliku/kodu wraz z testami, albo rzetelnej korekty zakresu funkcji i historii projektu. **Samo utworzenie pustego dokumentu nie oznacza przywrócenia funkcjonalności.**

W każdym przyszłym wydaniu warto automatycznie sprawdzać lokalne linki Markdown, spójność numerów wersji oraz obecność deklarowanych skryptów CLI.

> Ten dokument nie stanowi dowodu, że dana funkcja nigdy nie istniała; stwierdza jedynie, co było dostępne w sprawdzonym stanie bieżącej gałęzi.

## Audyt F0 / A1.0 — 2026-10-12

- Skontrolowano strukturę PL/EN, słownik CORE, przypisania paradygmatów i ramy gramatyczne potrzebne do pomiaru pokrycia.
- Dodano CLI, oryginalny manifest pilotażowy i testy regresji do raportu strukturalnego A1.
- Brakujące pliki historyczne i niespójne numerowanie wersji pozostają otwarte; nie zostały oznaczone jako naprawione bez faktycznej implementacji.
- Drugi agent odpowiada za GUI, dlatego ten batch nie zmienia HTML ani kodu interfejsu.
- Pełny `npm test` wymaga uruchomienia w Node w checkout repozytorium; tego dokumentu nie należy traktować jako wyniku testu.

## Koordynacja wersji modularnej i offline (zadania 4–5)

Nowy parser/generator pytań PL/EN został dodany w kodzie modułowym i pakietach `data/grammar/{pl,en}.json`. **Agent silnika nie zmieniał GUI**. W kolejnym batchu Studio zsynchronizowano `index-standalone.html` z aktualnym parserem i regułami pytań oraz dodano wizualizację `question` w INTER Explorer. Sprawdzono zachowanie aplikacji offline bez sieci, w tym pytania PL↔EN i dotychczasowe tłumaczenie. **Pełny `npm run check:standalone`, `npm test` i `npm run check:release` nie zostały uruchomione w lokalnym checkout i nadal wymagają weryfikacji przed formalnym wydaniem.**
