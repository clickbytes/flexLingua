# Jak pracujemy

## Źródła statusu

Zakres, kryteria odbioru, zależności i blokery są zapisane w GitHub Issue. Pull request zawiera zmianę, wykonane komendy, ręczny wynik oraz dokładny SHA. README i roadmap opisują trwały produkt, nie postęp pojedynczych zadań. Nie prowadzimy pliku `HANDOFF.MD`.

## Przydział i zakres

1. Przed pracą skomentuj issue właścicielem, zakresem plików, bazowym SHA i zależnościami. Dla pracy w epiku pokaż aktywne przydziały również w issue epiku.
2. Prowadź jedno issue i jeden PR naraz. Po merge następne zadanie bazuj na świeżym `main` i zapisz jego SHA w przydziale.
3. Zanim edytujesz, zaplanuj wszystkie podoperacje dla danego pliku i wprowadź je łącznie. Nie zmieniaj niezwiązanych danych, UI ani wspólnych plików przypisanych innemu zadaniu.
4. Powiąż PR z jednym issue i zapisz w nim zmienione zachowanie, exact commit SHA, wykonane sprawdzenia oraz ograniczenia.

## Ręczny odbiór przez CLI

CLI jest jedyną ścieżką akceptacji zdań. Sprawdź dostępne pakiety, a potem uruchom rzeczywiste zdania w każdym zmienionym kierunku:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
```

Przed uruchomieniem określ oczekiwany tekst i sens CORE niezależnie od silnika. Ręcznie porównaj tekst, role i referenty, czas, aspekt, polaryzację, liczbę, relacje, alternatywy, utratę informacji i diagnostykę. Dla odmowy zanotuj powód i kod wyjścia. Nie interpretuj tekstu z `unsupported` jako tłumaczenia.

W issue lub PR zapisz każdą komendę, kierunek, oczekiwane i rzeczywiste znaczenie, zwrócony tekst albo odmowę, CORE/diagnostykę, exit code i SHA. [Przykłady](../examples/cli-sentences.md) są instrukcjami dla człowieka, nie runnerem ani oracle do automatycznego odtwarzania.

Dla zmian, które nie dotyczą zachowania językowego, wykonuj tylko kontrole składni, importów, referencji lub CLI potrzebne do sprawdzenia zakresu. Automatyczne suite i GitHub Actions nie są bramką odbioru. Zapisz dokładne komendy; nie deklaruj wykonania komend pominiętych.

## Zakończenie pracy

Po przeglądzie diffu i wyników otwórz jeden PR powiązany z issue. Scal go po spełnieniu kryteriów i ręcznym sprawdzeniu wyniku. Nie przedstawiaj ograniczonego przykładu jako miary jakości całego języka ani poziomu CEFR. Przy blockerze opisz konkretny brak i następny krok w issue.
