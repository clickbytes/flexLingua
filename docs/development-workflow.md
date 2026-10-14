# Proces rozwoju flexLingua i utrzymania dokumentacji

**Status:** obowiązujące wytyczne projektowe od 2026-10-12  
**Zakres:** kod, dane językowe, testy, interfejs webowy uruchamiany lokalnie i dokumentacja.

**Podział odpowiedzialności:** prace tego agenta dotyczą silnika CORE, danych PL/EN, narzędzi, testów i dokumentacji. GUI rozwija odrębny agent; nie modyfikujemy tutaj HTML/CSS/UI.

## 1. Zasady architektoniczne

1. **Meaning-first:** języki wejścia i wyjścia komunikują się przez INTER/CORE, a nie bezpośrednio przez listę par zdań.
2. **Neutralny CORE:** sensy, role i operatory semantyczne są niezależne od polskiego i angielskiego; kolejność słów, odmiana, przypadki i wyjątki należą do pakietów językowych.
3. **Jawna niepewność:** zachowujemy alternatywne odczytania; nie uzupełniamy znaczenia bez przesłanek. Nieobsługiwane struktury zwracają diagnostykę.
4. **Rosnąca kompozycyjność:** nowe funkcje muszą działać na nowych kombinacjach pojęć i konstrukcji; unikamy „hardcode” pojedynczych zdań.
5. **Lokalne działanie:** silnik i interfejs nie wymagają usług zewnętrznych; aplikację uruchamiamy przez loopback HTTP, bez ukrytego zależnego od sieci procesu tłumaczenia.
6. **Brak nieautoryzowanego importu:** nie kopiujemy pełnych chronionych list słownikowych ani cudzych definicji bez weryfikacji licencji.

## 2. Pętla rozwoju jednej funkcji

1. **Wymaganie:** opisz znaczenie, przykłady PL/EN, dozwolone niejednoznaczności, granice obsługi i oczekiwane zachowanie przy błędach.
2. **Model CORE:** zdecyduj, czy potrzeba nowego typu węzła, operatora, relacji lub cechy. Zadbaj o kompatybilność istniejących dokumentów.
3. **Pakiety językowe:** wprowadź reguły i leksemy osobno dla PL i EN, bez tłumaczenia parowego.
4. **Testy:** dodaj pozytywne w obu kierunkach, gold dla odmiany, kontrprzykłady, błędy diagnostyczne, regresje.
5. **Offline:** zregeneruj samodzielne pliki HTML, gdy zmienia się kod, dane lub UI, i sprawdź spójność artefaktów.
6. **Dokumentacja:** uaktualnij README (jeśli zmienia się zachowanie użytkownika), odpowiednie dokumenty techniczne, ograniczenia i roadmapę/status.
7. **Weryfikacja:** zapisz polecenia i rzeczywiste wyniki; nie podawaj wymyślonych liczb przechodzących testów.
8. **Publikacja:** preferuj logiczny, spójny commit lub PR obejmujący kod, testy, build i dokumentację.

Nie publikujemy jako „ukończone” funkcji, dla której dostępna jest wyłącznie specyfikacja.

## 3. Przed wdrożeniem — polecenia weryfikacyjne

Repozytorium korzysta z Node.js 20+ i aktualnie nie wymaga instalowania pakietów runtime.

~~~sh
npm test
npm run check:lexicon
npm run check:morphology
npm run check:gold
npm run check:questions
npm run check:release
~~~

Wywołujemy tylko polecenia dostępne w aktualnym **package.json**. Interfejs sprawdzamy przez lokalny serwer i testy UI; nie utrzymujemy samodzielnego pliku HTML. Dodatkowe testy specyficzne dla wydania wymieniamy we właściwym dokumencie wydania. Jeśli nie można wykonać sprawdzenia lokalnie, zapisujemy stan **niezweryfikowane** — nie „pass”.

**Uwaga na stan wersjonowania:** README dokumentuje etapy do Batch A v1.18, a package.json nadal deklaruje 1.12.0. Rozbieżność powinna zostać uporządkowana w osobnym, sprawdzonym wydaniu; aktualizacja roadmapy jej nie rozwiązuje.

## 4. Wymagany pakiet dokumentacyjny zmiany

| Rodzaj zmiany | Pliki, które należy ocenić / aktualizować |
| --- | --- |
| Nowa funkcja tłumaczenia | README.md, odpowiedni docs/grammar-* lub docs/semantics-*, przykłady, ograniczenia, testy |
| Nowe hasło / sens / paradygmat | dokument leksykonu/morfologii, gold fixtures, rejestr pokrycia i pochodzenia |
| Nowy poziom CEFR | ROADMAP.md, raport pokrycia danego poziomu, testy dwukierunkowe |
| Zmiana API lub schematu | docs/api-*, dokumenty formatu, kompatybilność i migracja |
| Naprawa błędu | test regresji, istotna korekta opisów i ograniczeń |
| Wydanie | README status, docs/release-*, ROADMAP status, wyniki testów i artefakty wydania |
| Rozwój osobowości / dialogu | kontrakt Dialogue Manager, profil osobowości, zasady pamięci i oceny rozmowy |

Nie każda zmiana musi dotykać wszystkich plików; autor jawnie ustala, które dokumenty zostały przejrzane i dlaczego inne są bez zmian.

## 5. Standard dokumentu funkcji / wydania

Dokument powinien zawierać następujące sekcje:

- **Status:** planowane / w toku / zaimplementowane / zweryfikowane / wydane.
- **Problem i zakres:** co funkcja rozwiązuje i czego nie obsługuje.
- **Semantyka CORE:** kontrakt, identyfikatory, pola, role, ograniczenia.
- **Realizacja PL i EN:** reguły w obu kierunkach oraz niejednoznaczności.
- **Przykłady i kontrprzykłady:** wejście, CORE, wyjście, komunikat o braku obsługi.
- **Testy i środowisko:** polecenia oraz faktyczne wyniki; data i ewentualnie commit.
- **Kompatybilność i migracja:** sposób zachowania starszych danych/API.
- **Licencje/źródła:** przy danych pochodzących z zewnątrz.
- **Ograniczenia i kolejne kroki.**

Rozdzielamy **projektowane zachowanie** od **obserwowanego wyniku**. Sformułowanie „powinno tłumaczyć” nie jest równoznaczne z „tłumaczy”.

## 6. Jak mierzymy postęp

Raporty podają co najmniej:

- liczba zaakceptowanych haseł i **odrębnych sensów CORE** (nie utożsamiać);
- liczba sprawdzonych form fleksyjnych i paradygmatów;
- liczba obsługiwanych, zdefiniowanych konstrukcji;
- poprawność semantyczna osobno PL→EN i EN→PL na niezależnych przypadkach;
- obsługa negatywnych/niejednoznacznych przypadków;
- status testów regresji, działania przez lokalny serwer i znane ograniczenia.

Wyniki powinny mieć identyfikator zestawu testowego, datę i commit. **Bez audytu nie publikujemy procentu ukończenia poziomu A1–C2.** Kryteria odbioru są w [ROADMAP.md](../ROADMAP.md).

## 7. Aktualizacje w repozytorium

- Rozwijamy małe funkcjonalnie spójne partie zmian; dla większego batcha preferujemy jeden scalający commit po lokalnej walidacji.
- Chronimy główną gałąź przed nadpisaniem historii; przy aktualizacji używamy zwykłego fast-forward lub PR.
- Opisy commitów mówią, czego dotyczą, np. **feat(grammar): ...**, **test(morphology): ...**, **docs(roadmap): ...**.
- README pozostaje punktem wejścia, nie pełnym dziennikiem zmian. Szczegóły są w docs/, a lista strategicznych celów w ROADMAP.md.
- Każde zakończone wydanie: zakres, znane braki, komendy i wyniki testów, instrukcja lokalnego uruchomienia, spójność numeracji wersji.
- Niedokończone etapy pozostają jawnie oznaczone „w toku”.

## 8. Rozwój po stabilnym A1

Moduł rozmowy i osobowości ma korzystać z tej samej INTER; dane osobowości nie stanowią alternatywnego silnika tłumaczeń. Przyszłe uczenie, research i interpretowanie dokumentacji wymagają osobnych specyfikacji bezpieczeństwa, źródeł, pamięci oraz weryfikacji i nie są elementem bieżącego zakresu A1.

## 9. Aktualność dokumentacji

Przy każdej zmianie w kodzie:

1. Sprawdź, czy README nadal opisuje uruchomienie i obecny stan bez zawyżania możliwości.
2. Przejrzyj [indeks dokumentacji](README.md); dodaj link do nowych plików.
3. Zweryfikuj, czy opisy przykładów odpowiadają rzeczywistej implementacji.
4. Aktualizuj statusy w ROADMAP tylko na podstawie zaimplementowanych i zweryfikowanych funkcji.
5. Usuń lub oznacz stare, sprzeczne treści; dokumenty historyczne zachowaj jako archiwum z informacją o dacie/wersji.

**Dokumentacja jest częścią Definition of Done — nie zadaniem „na później”.**

## Status pracy i dowody

Nie prowadzimy osobnego, obowiązkowego checkpointu `HANDOFF.md`; plik pozostaje archiwum. GitHub issue jest miejscem na status, kryteria i zależności, a PR na zakres zmian, SHA, rzeczywiste wyniki testów i linki do Actions. Bieżący blocker oraz następny krok zapisuj w powiązanym issue/PR. Dokumentację repozytorium aktualizuj dla trwałych decyzji i zachowań produktu, nie dla powielania statusu.

Nie wolno przedstawiać izolowanego interpretera JS jako pełnego `npm test` lub wydania offline. PR należy scalać bez force push.
