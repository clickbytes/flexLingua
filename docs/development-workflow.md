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

W issue lub PR zapisz każdą komendę, kierunek, oczekiwane i rzeczywiste znaczenie, zwrócony tekst albo odmowę, CORE i diagnostykę, exit code oraz SHA. [Przykłady](../examples/cli-sentences.md) są instrukcją dla człowieka, nie drugim oracleniem — jedyne zatwierdzone oczekiwania tłumaczeń żyją w `tests/cases/**` (patrz `tests/README.md`).

## Dwa etapy zatwierdzania oczekiwań

Rozdzielamy dwie czynności, które nigdy nie mogą się zastępować:

1. **Ręczne zatwierdzenie nowego oczekiwania przez człowieka.** Nowy przypadek w `tests/cases/**` powstaje w stanie `review.status=proposed`, a `expected` (tekst, MeaningGraph, roles, features, diagnostyka, utrata informacji) jest pisany niezależnie przed uruchomieniem silnika. Kopiowanie aktualnego outputu Engine do `expected` nie jest zatwierdzaniem. Po niezależnym przeglądzie znaczenia sprawa przechodzi w `approved`; tylko zatwierdzone przypadki mogą należeć do wymaganego gate (`tests/catalog/required-ids.json`).
2. **Automatyczne uruchomienie zatwierdzonej macierzy na PR i `main`.`** Runner `tests/run.mjs` (lokalne `npm test`) oraz workflow `translation-matrix` w GitHub Actions uruchamiają tą samą macierzą i blokują regresje required-case. Actions nie zatwierdza nowych oczekiwań — tylko egzekwuje te, które człowiek już zatwierdził. Celowe zmiany oczekiwań wymagają ręcznego review i nie mogą być maskowane jako `unsupported`.

Przy zmianie CORE, bridge lub zachowania konstrukcji wymagaj dla zmienionej pary kierunków: pozytywnego zdania w OBU kierunkach oraz oczekiwanej kontrolowanej odmowy albo przypadku z wielu znaczeń (ambiguity), jeśli taka sytuacja występuje. Wyniki raportuj jako autorski zakres (np. liczbę zatwierdzonych przypadków w macierzy), **nigdy jako procent pełnego CEFR A1**; poziom „A1" jest etykietą planistyczną, nie certyfikacją.

## Ręczny odbiór aplikacji terminalowej

Uruchom `npm run tui` w interaktywnym terminalu; na Windows można użyć `start.bat`. Sprawdź trzy tryby Translate/Chat/Forms, klawiaturę, drafty, Unicode, zmianę rozmiaru, mały terminal i odzyskanie terminala po wyjściu. `/help` pokazuje bieżące sterowanie; pełna specyfikacja redesignu jest w [issue #324](https://github.com/clickbytes/flexLingua/issues/324). Nie oznaczaj nieuruchomionego scenariusza jako zaliczonego. Jeśli środowisko nie udostępnia interaktywnego TTY albo drugiej platformy, zapisz `NOT RUN` i nazwij ograniczenie.

## Odbiór infrastruktury i zakończenie

Dla zmian poza macierzą tłumaczeń (infrastruktura, dokumentacja) wykonuj tylko kontrole składni, importów, referencji lub CLI potrzebne do sprawdzenia zakresu; inne automatyczne suite nie są bramką odbioru. Zmiany tłumaczeń, CORE i danych językowych uruchamiają obowiązkowo macierz `tests/` (lokalnie `npm test`, w CI check `translation-matrix`) — szczegóły w [`tests/README.md`](../tests/README.md). Zapisz dokładne komendy; nie deklaruj wykonania komend pominiętych.

Po przeglądzie diffu i wyników otwórz jeden PR powiązany z issue. Scal go po spełnieniu kryteriów i ręcznym sprawdzeniu wyniku. Nie przedstawiaj ograniczonego przykładu jako miary jakości całego języka ani poziomu CEFR. Przy blockerze opisz konkretny brak i następny krok w issue.
