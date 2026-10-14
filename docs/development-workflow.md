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

## Kiedy aktualizować dokumentację

Zmień dokument tylko wtedy, gdy zadanie zmienia trwałą informację o zachowaniu produktu, API, schemacie, architekturze, uruchamianiu albo pochodzeniu danych. Zaktualizuj właściwy dokument w tym samym PR.

Nie aktualizuj README, roadmapy ani indeksu dokumentacji tylko po to, by odnotować wykonane zadanie, testy, SHA lub status. Te informacje pozostają w issue, PR i Actions.
