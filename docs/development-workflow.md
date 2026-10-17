# Jak pracujemy

## Źródła statusu

Zakres, kryteria odbioru, zależności i blokery są zapisane w GitHub Issue. Pull request zawiera zmianę, wykonane komendy, ręczny wynik oraz dokładny SHA. README i roadmap opisują trwały produkt, nie postęp pojedynczych zadań. Nie prowadzimy pliku `HANDOFF.MD`.

## Przydział i zakres

1. Przed pracą skomentuj issue z ownerem, zakresem plików, bazowym SHA i zależnościami. Dla pracy w epiku pokaż aktywne przydziały również w issue epiku.
2. Prowadź jedno issue i jeden PR naraz. Po merge następne zadanie bazuj na świeżym `main` i zapisz jego SHA w przydziale.
3. Zanim edytujesz, zaplanuj wszystkie zmiany dla danego pliku i wprowadź je łącznie. Nie zmieniaj niezwiązanych danych ani wspólnych plików przypisanych innemu zadaniu.
4. Powiąż PR z jednym issue i zapisz w nim zmienione zachowanie, dokładny commit SHA, wykonane sprawdzenia oraz ograniczenia.

## Ręczny odbiór zachowania językowego

CLI jest ścieżką akceptacji zachowania tłumaczeń. Sprawdź pakiety, a potem uruchom rzeczywiste zdania w każdym zmienionym kierunku:

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
```

Przed uruchomieniem określ oczekiwany tekst i sens CORE niezależnie od silnika. Ręcznie porównaj tekst, role i referenty, czas, aspekt, polaryzację, liczbę, relacje, alternatywy, utratę informacji i diagnostykę. Dla odmowy zanotuj powód i kod wyjścia. Nie interpretuj tekstu z `unsupported` jako tłumaczenia.

W issue lub PR zapisz każdą komendę, kierunek, oczekiwane i rzeczywiste znaczenie, zwrócony tekst albo odmowę, CORE i diagnostykę, exit code oraz SHA. [Przykłady](../examples/cli-sentences.md) są instrukcjami dla człowieka, nie runnerem ani oracle do automatycznego odtwarzania.

## Ręczny odbiór aplikacji terminalowej

Uruchom `npm run tui` w interaktywnym terminalu; na Windows można użyć `start.bat`. Sprawdź trzy zakładki, klawiaturę, drafty, Unicode, zmianę rozmiaru, mały terminal, widoki Translate/Chat/Forms i odzyskanie terminala po wyjściu. Nie oznaczaj nieuruchomionego scenariusza jako zaliczonego. Jeśli środowisko nie udostępnia interaktywnego TTY albo drugiej platformy, zapisz `NOT RUN` i nazwij ograniczenie.

## Odbiór infrastruktury i zakończenie

Dla zmian, które nie dotyczą zachowania językowego, wykonuj tylko kontrole składni, importów, referencji lub CLI potrzebne do sprawdzenia zakresu. Automatyczne suite i GitHub Actions nie są bramką odbioru. Zapisz dokładne komendy; nie deklaruj wykonania komend pominiętych.

Po przeglądzie diffu i wyników otwórz jeden PR powiązany z issue. Scal go po spełnieniu kryteriów i ręcznym sprawdzeniu wyniku. Nie przedstawiaj ograniczonego przykładu jako miary jakości całego języka ani poziomu CEFR. Przy blockerze opisz konkretny brak i następny krok w issue.
