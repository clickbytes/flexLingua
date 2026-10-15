# Jak pracujemy

## Gdzie znajduje się aktualna informacja

| Informacja | Miejsce |
| --- | --- |
| Zakres, kryteria odbioru, blokery, status i następny krok | GitHub Issue w `clickbytes/flexLingua` |
| Zmiany kodu i testów, przegląd, dokładny SHA i wynik CI | GitHub Pull Request oraz Actions |
| Faktyczny kontrakt produktu, architektura, API, uruchamianie i pochodzenie danych | Kod, testy i właściwy dokument w repozytorium |

GitHub Issues, pull requests i Actions są rejestrem pracy. Repozytorium opisuje działający produkt i trwałe decyzje.

## Przebieg zadania

1. Wybierz gotowe issue. Upewnij się, że wynik, kryteria odbioru i zależności są zrozumiałe. Doprecyzuj je w issue, jeśli trzeba.
2. Zrób małą gałąź i implementację. W trakcie uruchamiaj testy dotyczące zmiany.
3. Otwórz PR powiązany z issue. Opisz rezultat i odnotuj faktycznie wykonane testy.
4. Sprawdź Actions dla dokładnego SHA PR. Scal po przejściu wymaganych bramek i przeglądu zmian.
5. Issue zamknij przez PR. Jeśli praca jest zablokowana, zapisz powód i następny krok w issue.

Zależności i kolejność prac prowadzą GitHub Issues.

## Testy

Podczas pracy uruchamiaj testy właściwe dla zmiany. Przed zakończeniem użyj `npm run check:release`; skrypt zawiera `npm test`, więc nie trzeba uruchamiać obu poleceń osobno. Wymagany przez konkretną zmianę dodatkowy gold uruchom wtedy, gdy nie jest częścią release gate. Raportuj wynik hostowanego Actions z dokładnym SHA.

Nie deklaruj PASS dla testu, którego nie uruchomiono. Nie zastępuj pełnego testu lokalnego ani Actions izolowanym fragmentem runtime.

## Wymagane statusy i merge na `main`

Workflow `Core Engine CI` publikuje trzy bramki. W regułach gałęzi `main` wymagaj dokładnie tych statusów:

| Job ID | Nazwa statusu w Actions |
| --- | --- |
| `engine-tests` | `Node unit and regression tests` |
| `lexical-audits` | `Lexicon morphology gold and A1 checks` |
| `release-gate` | `Aggregate release gate` |

Polityka `main` powinna wymagać PR oraz przejścia wszystkich trzech statusów, blokować bezpośredni push, force-push i usunięcie gałęzi. Nie włączaj ogólnego bypassu. Sam workflow uruchamiający testy nie egzekwuje blokady merge — uznaj ją za aktywną dopiero po ustawieniu reguł w GitHub i próbie, w której PR z celowo nieudaną bramką jest rzeczywiście niemergowalny. Sprawdź bieżący status możliwości repozytorium w issue REL-02 (#19).

## Awaria, wyjątek i rollback

- Jeśli wymagany job nie przejdzie albo nie wystartuje, zatrzymaj merge, sprawdź log joba i popraw przyczynę na branchu PR. Ponownie uruchom Actions dla nowego SHA.
- Nie omijaj nieudanego ani pominiętego statusu przez bezpośredni push, force-push lub ręczne oznaczenie testu jako zaliczonego.
- Wyjątek awaryjny wymaga issue powiązanego z PR: zapisz powód, dokładnie pominięty status, zakres ryzyka, osobę zatwierdzającą, termin wygaśnięcia oraz plan przywrócenia reguły. Jeśli polityka GitHub nie pozwala na kontrolowany wyjątek, nie obchodź jej — napraw bramkę albo wstrzymaj merge.
- Rollback wykonuj nowym PR z `git revert` wskazanego merge commita; nie przepisuj historii `main`. Uruchom wymagane bramki na PR rollbackowym, zmerguj po ich przejściu i dopisz SHA revertu do incydentu oraz pierwotnego issue.
- Po wyjątku lub rollbacku potwierdź stan reguł `main` i zapisz wynik w powiązanym issue. Nie publikuj ponownie wydania, dopóki jego bramki nie przejdą.

## Kiedy aktualizować dokumentację

Zmień dokument tylko wtedy, gdy zadanie zmienia trwałą informację o zachowaniu produktu, API, schemacie, architekturze, uruchamianiu albo pochodzeniu danych. Zaktualizuj właściwy dokument w tym samym PR.

Nie aktualizuj README, roadmapy ani indeksu dokumentacji tylko po to, by odnotować wykonane zadanie, testy, SHA lub status. Te informacje pozostają w issue, PR i Actions.
