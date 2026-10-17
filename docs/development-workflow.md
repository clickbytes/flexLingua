# Jak pracujemy

## Źródła informacji

| Informacja | Miejsce |
| --- | --- |
| Zakres, kryteria odbioru, zależności, blokery i następny krok | Issue w `clickbytes/flexLingua` |
| Diff, przegląd, SHA i wynik lokalnej macierzy | Pull request |
| Oczekiwane znaczenie zdań i odmowy | Wersjonowane goldy |
| Faktyczny kontrakt produktu i uruchamiania | Kod i właściwy dokument w repozytorium |

Nie prowadzimy osobnego `HANDOFF.MD`. GitHub Actions nie uruchamiają testów ani nie stanowią bramki merge.

## Lokalne sprawdzanie zmian językowych

Nie instalujemy hooków Git. Commit i push nie uruchamiają testów automatycznie. Repozytorium nie ma aktywnych workflowów GitHub Actions.

Macierz zdań jest podstawowym narzędziem odbioru dla zmian tłumaczenia, gramatyki, parsera, leksykonu i semantyki. Uruchom:

```powershell
node tools/review-sentences.mjs --input tests/fixtures/gold-a1-enpl-composition-v2.json
```

CLI wypisuje dla każdego wiersza wejście, expected, actual, wynik, CORE lub odmowę. Przejrzyj każdy zmieniony wiersz pod względem naturalności, gramatyki, ról, czasu, aspektu, polaryzacji, liczby, relacji i sensu. Status `match` potwierdza tylko zgodność tekstu z zapisanym expected; nie zastępuje oceny językowej.

Expected i CORE zapisuj ręcznie przed uruchomieniem silnika. Nie kopiuj wyniku engine do golda bez niezależnej decyzji, że jest poprawny. Goldy rosną partiami tematycznymi w kierunku 1000 zdań na kierunek; nie uruchamiaj całej macierzy po każdej zmianie.

Zapisz w PR/issue plik macierzy, komendę, liczbę przejrzanych wierszy, mismatche i SHA commita. Gdy zmiana zachowania wymaga mechanicznej regresji, uruchom jeden pasujący `node --test tests/<plik>.test.js`. Przy zmianie danych wybierz jeden właściwy walidator.

Pełne `npm run check:core-gates` jest jawnym poleceniem wydaniowym albo pełnej weryfikacji na żądanie; zwykły batch go nie uruchamia. Nie dubluj kontroli pokrytych przez pełny gate.

## Macierz zdań A1

Pilotażowa macierz jest w zamrożonym `data/coverage/a1-heldout-v1.json`: 100 autorskich par zdań daje 100 wejść EN→PL i 100 PL→EN oraz 20 jawnych odmów. `tests/a1-heldout.test.js` sprawdza powierzchnię, CORE źródła i celu oraz serializację CORE jako jawny test regresyjny. Expected zapisano niezależnie od wyniku silnika. Autor fixture'a był także autorem implementacji, więc próbka nie stanowi niezależnego benchmarku ani reprezentatywnego pomiaru CEFR A1.

Nowe zdania redaguj partiami według konstrukcji. Dla każdego przypadku ustal ID, kierunek, wejście, oczekiwany cel i CORE albo jawny powód odmowy. Przejrzyj polską składnię, przypadki, zgodę, role, czas, aspekt, polarność i analizę odwrotną. H1 pozostaje zamrożony; kolejne partie prowadź w osobnych wersjonowanych goldach. Cel 1000 wejść na język jest planem rozbudowy macierzy, a nie obecnym wynikiem ani procentem CEFR A1.

## Przebieg zadania

1. Wybierz issue i ustal jego kryteria odbioru. Dla nowej konstrukcji przygotuj mały ręczny gold przed kodem.
2. Zmień tylko potrzebne pliki. Uruchom lokalny CLI dla zmienionego pliku gold i przejrzyj wyniki.
3. Uruchom jeden celowany test lub walidator, jeśli jest potrzebny do sprawdzenia zmienionego kontraktu.
4. Zapisz commit i otwórz PR powiązany z issue. Umieść w PR wynik przeglądu zdań i SHA.
5. Scal po sprawdzeniu diffu, kryteriów odbioru i wyniku lokalnego. Zamknij issue przez PR. Przy blokadzie zapisz powód i następny krok w issue.

Jeśli plik gold lub implementacja zmieniły się po ostatnim przeglądzie, ponownie uruchom CLI na końcowym commicie i przejrzyj zmienione wiersze. CI nie jest uruchamiane.

## Wydanie i rollback

`npm run check:core-gates` uruchamiaj wyłącznie na jawne żądanie pełnej weryfikacji albo wydania. Uruchamia `check:release` jeden raz i wypisuje deterministyczny raport: SHA, wersję, manifest śledzonych plików z SHA-256, runtime i wyniki testów. Wymaga czystego checkoutu.

Po błędzie lokalnym popraw przyczynę i powtórz odpowiedni przegląd lub kontrolę. Rollback wykonuj przez PR z `git revert <merge-sha>` i zapisz SHA revertu w pierwotnym issue. Nie przepisuj historii `main`.

Dokumentację aktualizuj wyłącznie po trwałej zmianie zachowania, API, schematu, architektury, poleceń albo provenance. Postęp i wyniki należą do issue i PR.
