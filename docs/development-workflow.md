# Jak pracujemy

Instrukcje operacyjne dla agentów repozytorium znajdują się w [AGENTS.md](../AGENTS.md). Ten dokument opisuje wspólny proces i źródła informacji.

## Gdzie znajduje się aktualna informacja

| Informacja | Miejsce |
| --- | --- |
| Zakres, kryteria odbioru, blokery, status i następny krok | GitHub Issue w `clickbytes/flexLingua` |
| Zmiany kodu i testów, przegląd, dokładny SHA i wynik CI | GitHub Pull Request oraz Actions |
| Faktyczny kontrakt produktu, architektura, API, uruchamianie i pochodzenie danych | Kod, testy i właściwy dokument w repozytorium |

GitHub Issues, pull requests i Actions są rejestrem pracy. Repozytorium opisuje działający produkt i trwałe decyzje.

## Przebieg zadania

1. Wybierz jedno gotowe issue. Sprawdź jego epik, zależności, kryteria odbioru i linkowane ADR lub kontrakty.
2. Zacznij od testu najmniejszego pełnego zachowania. Implementuj mały pionowy zakres i sprawdzaj go testem celowanym.
3. Po pierwszym spójnym fragmencie, który przechodzi testy celowane, otwórz draft PR powiązany z issue. Wymień pozostałe kryteria i faktycznie uruchomione testy.
4. Przed zakończeniem uruchom pełny lokalny gate. Sprawdź Actions dla dokładnego SHA PR i przejrzyj zakres zmian.
5. Scal po przejściu wymaganych bramek i przeglądu. Zamknięcie issue powiąż z PR. Jeśli praca jest zablokowana, zapisz dowód, przyczynę i następny krok w issue.

Zależności i kolejność prac prowadzą GitHub Issues.

## Testy

Podczas pracy uruchamiaj testy właściwe dla zmiany. Przed zakończeniem użyj `npm run check:release`; skrypt zawiera `npm test`, więc nie trzeba uruchamiać obu poleceń osobno. Wymagany przez konkretną zmianę dodatkowy gold uruchom wtedy, gdy nie jest częścią release gate. Raportuj wynik hostowanego Actions z dokładnym SHA.

W sesji Codex stosuj repozytoryjne zasady CodeGraph i RTK opisane w [AGENTS.md](../AGENTS.md) oraz obowiązujące instrukcje globalne.

Nie deklaruj PASS dla testu, którego nie uruchomiono. Nie zastępuj pełnego testu lokalnego ani Actions izolowanym fragmentem runtime.

## Kiedy aktualizować dokumentację

Zmień dokument tylko wtedy, gdy zadanie zmienia trwałą informację o zachowaniu produktu, API, schemacie, architekturze, uruchamianiu albo pochodzeniu danych. Zaktualizuj właściwy dokument w tym samym PR.

Nie aktualizuj README, roadmapy ani indeksu dokumentacji tylko po to, by odnotować wykonane zadanie, testy, SHA lub status. Te informacje pozostają w issue, PR i Actions.
