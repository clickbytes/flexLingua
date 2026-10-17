# Jak pracujemy

## Źródła informacji

| Informacja | Miejsce |
| --- | --- |
| Zakres, kryteria odbioru, zależności, blokery i następny krok | Issue w `clickbytes/flexLingua` |
| Diff, przegląd, SHA i wynik lokalnych testów | Pull request |
| Oczekiwane znaczenie zdań i odmowy | Wersjonowane goldy oraz testy |
| Faktyczny kontrakt produktu i uruchamiania | Kod i właściwy dokument w repozytorium |

Nie prowadzimy osobnego `HANDOFF.MD`. GitHub Actions nie uruchamiają testów ani nie stanowią bramki merge.

## Jednorazowe ustawienie lokalne

Po sklonowaniu repozytorium uruchom `npm run setup:local-hooks`. Skrypt ustawia `core.hooksPath=.githooks` w lokalnej konfiguracji Git. Wersjonowane hooki działają przy kolejnych commitach i pushach z tego klona. Nie instaluj zależności: projekt nie ma pakietów runtime.

`pre-commit` uruchamia `node tools/a1-evidence-ledger.mjs --catalog-only`: sprawdza deklaracje, integralność przypiętych goldów i rejestr konstrukcji bez wykonywania suite'ów. `pre-push` uruchamia `npm run check:release` na zapisanym HEAD. Polecenie zawiera walidatory, wszystkie testy Node oraz A1 H1. Lokalny raport i pełny log powstają w ignorowanym katalogu `.local-checks/<SHA>.json` i `.log`. Hook blokuje push po błędzie albo gdy śledzone pliki są niezapisane. Każdy push sprawdza tylko własny HEAD; inne referencje wypychaj osobno.

Podczas edycji uruchamiaj celowany `node --test tests/<plik>.test.js` i właściwy walidator danych. Nie powtarzaj pełnego `npm test` obok `check:release`. Lokalny raport z hooka nie jest commitem ani publikacją; wpisz jego wynik, komendę, liczbę przypadków i dokładny SHA do PR. Jeśli hook nie uruchomił się lub test się nie powiódł, wpisz `NOT RUN` albo `FAIL` i zatrzymaj merge. Nie oznaczaj wyniku jako PASS na podstawie samego istnienia golda.

## Macierz zdań A1

Pilotażowa macierz jest w zamrożonym `data/coverage/a1-heldout-v1.json`: 100 autorskich par zdań daje 100 wejść EN→PL i 100 PL→EN oraz 20 jawnych odmów. `tests/a1-heldout.test.js` sprawdza powierzchnię, CORE źródła i celu oraz serializację CORE; jest częścią `npm test` uruchamianego przez hook. Expected zapisano niezależnie od wyniku silnika. Autor fixture'a był także autorem implementacji, więc próbka nie stanowi niezależnego benchmarku ani reprezentatywnego pomiaru CEFR A1.

Nowe zdania redaguj partiami według konstrukcji. Dla każdego przypadku ustal przed uruchomieniem silnika: ID, kierunek, wejście, oczekiwany cel, CORE lub jawny powód odmowy. Przejrzyj polską składnię, przypadki, zgodę, role, czas, aspekt, polarność i analizę odwrotną. Nie przepisuj expected z rezultatu implementacji. H1 pozostaje zamrożony; kolejne partie prowadź w osobnych wersjonowanych goldach. Cel 1000 wejść na język jest planem rozbudowy macierzy, a nie obecnym wynikiem ani procentem CEFR.

## Przebieg zadania

1. Wybierz issue i ustal jego kryteria odbioru. Dla nowej konstrukcji przygotuj mały ręczny gold przed kodem.
2. Zmień tylko potrzebne pliki. W trakcie używaj celowanych testów CLI.
3. Zapisz commit; `pre-commit` zweryfikuje katalog goldów. Push uruchomi pełne lokalne sprawdzenie i zapisze raport SHA.
4. Otwórz PR powiązany z issue. Wklej wynik lokalny dla dokładnego head SHA i wskaż nowe lub zmienione ID goldów. W issue albo epiku umieść krótkie podsumowanie z linkiem do PR.
5. Scal po sprawdzeniu diffu, kryteriów odbioru i wyniku lokalnego. Zamknij issue przez PR. Przy blokadzie zapisz powód i następny krok w issue.

Zmiana po ostatnim przebiegu wymaga nowego testu na końcowym commicie. Commit hook uruchamia kontrole lokalnie; GitHub nie weryfikuje ich zdalnie. Raport w PR jest zatem obowiązkowym dowodem przeglądu.

## Wydanie i rollback

`npm run check:core-gates` pozostaje ręcznym poleceniem wydania dla czystego checkoutu. Uruchamia `check:release` jeden raz i wypisuje deterministyczny raport: SHA, wersję, manifest śledzonych plików z SHA-256, runtime i wyniki testów. Nie uruchamiaj go dodatkowo po przejściu identycznego pełnego przebiegu, chyba że wymaga tego wydanie lub zmienił się commit z wersją.

Po błędzie lokalnym popraw przyczynę i ponów odpowiednią kontrolę. Rollback wykonuj przez PR z `git revert <merge-sha>`, przepuść lokalny hook i zapisz SHA revertu w pierwotnym issue. Nie przepisuj historii `main`.

Dokumentację aktualizuj wyłącznie po trwałej zmianie zachowania, API, schematu, architektury, poleceń albo provenance. Postęp i wyniki testów należą do issue i PR.
