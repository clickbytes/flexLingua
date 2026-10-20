# ADR: skalowanie backendu morfologii

**Status:** Accepted dla obecnego kontraktu morfologicznego; lazy/FST odroczone.  
**Data:** 2026-10-17.  
**Baseline:** `main@b080d59357c5f26a5b0e1335aef046f52bcc84aa`.  
**Zakres:** benchmark ograniczonych paradygmatów, aktualne limity i kryteria powrotu do wyboru backendu.  
**Poza zakresem:** pełny FST, SLA dla dowolnego sprzętu.

## Decyzja

Zostajemy przy obecnym **skończonym, prekompilowanym zbiorze relacji**. Syntetyczny układ 10 przypadków × 2 liczby × 3 osoby ma 60 komórek i działa z dużym zapasem wobec limitu 256 komórek na paradygmat. W zmierzonych układach budowa jest szybka i stabilna; nie ma dowodu, że obecnie potrzebujemy cache lazy ani osobnego FST.

Limity pozostają zamknięte. Prototyp odmawia przekroczeń jawnie. Nie zwiększamy limitów tylko na podstawie liczby wymiarów w nowym języku.

## Obecna architektura i limity

`createMorphology()` w `js/core/morphology/engine.js` waliduje pakiet, rozwija każdą zadeklarowaną komórkę dla każdego powiązanego leksemu i równocześnie buduje indeks odwrotny po znormalizowanej formie. `compileMorphology()` w `js/core/morphology/compiler.js` materializuje i deterministycznie sortuje przenośną tabelę `finite-relation-table`.

Limity są stałymi wewnątrz silnika morfologicznego, nie w `js/core/resource-limits.js`:

| Budżet | Limit | Zachowanie |
| --- | ---: | --- |
| Komórki na paradygmat | 256 | większy paradygmat jest odrzucany przy tworzeniu morfologii |
| Powiązane leksemy | 30 000 | większy pakiet jest odrzucany |
| Formy wygenerowane łącznie | 300 000 | tworzenie odmawia przy pierwszej formie ponad limit |
| Odczytania jednej formy | 64 | inverse analysis odmawia przy 65. odczytaniu |
| Poziomy dziedziczenia paradygmatów | 64 | głębszy łańcuch zwraca `PLUGIN_RESOURCE_LIMIT` (`resource_limit`) przez kontrakt LanguagePlugin |
| Kroki operacji w komórce | 16 | operacja odrzuca dłuższą listę |
| Długość tekstu operacji/formy | 120 znaków | niebezpieczny lub nadmierny wynik jest odrzucany |

Wymiar `case` w `data/morphology/features.json` ma obecnie osiem wartości, ale językowy profil morfologii może zadeklarować własny skończony wymiar. Benchmark używa prywatnego, syntetycznego zestawu `case_01`…`case_43` i kopii rejestru; nie zmienia danych języka ani nie twierdzi, że te wartości są rzeczywistymi przypadkami.

## Benchmark

Dodany `tools/benchmark-morphology.mjs` tworzy izolowany proces Node na próbę, mierzy medianę z trzech uruchomień, wymusza GC przed punktem odniesienia, weryfikuje każdy wynik generation/inverse i porównuje SHA artefaktu. Syntetyczne sufiksy są celowo neutralnymi tokenami: mierzą koszt struktur i lookupów, a nie poprawność gramatyczną języka. RSS „po budowie” obejmuje engine i indeks inverse; RSS końcowy obejmuje również tabelę eksportową i przebiegi zapytań. Dla scenariusza 300 001 uruchomień mierzy się odmowę przed utworzeniem eksportowej tabeli.

Środowisko: Node `v24.19.0`, Windows `10.0.19044`, x64, Intel Core i5-12600K, 16 logicznych CPU, 128 GiB RAM. Czasy to mediany z 3 procesów, z wyjątkiem testów przekroczeń także powtórzonych 3 razy. Pamięć to zmiana RSS procesu względem pomiaru przed budową, po wczytaniu kodu i wejść.

| Inwentarz syntetyczny | Leksemy | Komórki | Formy | Budowa engine (ms) | Eksport tabeli (ms) | Generation (ms / zapytania) | Inverse (ms / zapytania) | JSON tabeli | RSS delta po engine / końcowa |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 przypadków × 2 liczby | 10 | 20 | 200 | 8,991 | 1,122 | 99,391 / 20 000 | 84,541 / 20 000 | 37 608 B | 1,75 / 7,30 MiB |
| 10 przypadków × 2 liczby × 3 osoby | 10 | 60 | 600 | 12,514 | 2,613 | 137,628 / 20 400 | 88,680 / 20 400 | 123 128 B | 3,66 / 11,92 MiB |
| Granica komórek | 10 | 256 | 2 560 | 24,304 | 10,206 | 340,435 / 25 600 | 108,046 / 25 600 | 525 991 B | 14,61 / 23,73 MiB |

Artefakty były identyczne we wszystkich próbach danego scenariusza. Benchmark sprawdza poprawne odtworzenie każdej komórki i zachowanie jej analizy odwrotnej.

Próby graniczne na tych samych limitach:

| Próba | Wynik z 3 niezależnych procesów | Mediana czasu | RSS delta przy odmowie |
| --- | --- | ---: | ---: |
| 257 komórek w jednym paradygmacie | stabilna odmowa `Invalid paradigm bench.noun` | 1,445 ms | 0,16 MiB |
| 65 odczytań homograficznej formy | stabilna odmowa `Excessive morphology ambiguity.` | 3,243 ms | 0,46 MiB |
| 300 001. wygenerowana forma | stabilna odmowa `Morphology compilation exceeds form limit.`; 1 172 × 256 = 300 032 potencjalnych komórek, licznik zatrzymuje się na pierwszej ponad limit | 1 523,109 ms | 451,40 MiB |

To są pomiary syntetycznego inwentarza i jednego hosta. Nie przewidują kosztu wszystkich rzeczywistych profili, runtime’ów ani systemów operacyjnych. Przekroczenie limitu form jest najbardziej kosztowną odmową: wzrost RSS pokazuje, dlaczego nie należy traktować go jako normalnej ścieżki produkcyjnej.

Celowany przebieg regresji: `node --test tests/resource-bounds.test.js tests/morphology.test.js` — **PASS, 21/21**.

## Operacje morfologiczne i granice

`executeOperations()` w `js/core/morphology/operations.js` wykonuje zwalidowaną, skończoną sekwencję do 16 kroków: m.in. append/prepend, wybór lub dołączenie stemu, strip/replace suffix, jawne `softenFinal`, `harmonicSuffix`, `rootTemplate` oraz reduplikację. To mały interpreter operacji danych, nie ogólny proces fonologiczny ani kompilator FST.

`rootTemplate` podstawia `{1}`, `{2}`, `{3}` z `stems.root`; runtime sprawdza dokładnie trzy Unicode code points, lecz nie sprawdza, czy są spółgłoskami. Udowodniony przypadek z pakietu/testu arabskiego to regularny szablon literalny dla rdzenia `كتب`, który daje `كَتَبَ`. Ta operacja nie opisuje automatycznie słabych lub podwojonych rdzeni, alternacji kontekstowych, pełnego systemu form wewnętrznych ani produktywnych broken plurals. To wymagałoby jawnych reguł, danych wyjątków i osobnych goldów; sama nazwa „root template” nie jest takim dowodem.

`harmonicSuffix` odczytuje ostatnią samogłoskę spośród ośmiu tureckich samogłosek i mapuje symbole `A`/`I` w podanym sufiksie; może być łączone z osobnym krokiem `softenFinal`. Testy potwierdzają przykłady `kitap + I → kitabı`, `kitap + A → kitaba` i `gör + I → görü`. Nie jest to ogólna harmonia wszystkich języków, inferencja alternacji spółgłoskowych ani model wyjątków poza jawnie zadeklarowanymi operacjami i override’ami.

`tests/morphology.test.js` już pokrywa dokładny trójliterowy przykład arabskiego, turecką harmonię, ograniczenia list kroków oraz pełną odwrotną analizę bounded inventories. Nie ma powodu dodawać runtime’owego FST wyłącznie dlatego, że język ma dziesięć przypadków albo nie konkatenacyjną rodzinę form.

## Ocena backendów

| Backend | Zalety | Koszt / ryzyko | Decyzja |
| --- | --- | --- | --- |
| Skończona tabela obecna | deterministyczna, audytowalna, wszystkie dozwolone formy i readings dostępne od razu; prosty artefakt do dystrybucji | czas i pamięć rosną wraz z leksemami × komórkami × wariantami; twardy pułap 300 000 form | **Zostaje.** Mierzone przykłady 20 i 60 komórek są daleko od limitu. |
| Generation lazy + bounded inverse/cache | może ograniczyć cold start i pamięć, gdy konkretne użycie dotyka małej części komórek | nie usuwa kosztu, jeśli klient przejdzie cały inwentarz; inverse nadal musi znaleźć kandydatów i zachować wszystkie homografy; wymaga limitu cache i deterministycznego usuwania wpisów | **Odroczone.** Najpierw potrzebny rzeczywisty trace zapytań pokazujący rzadkie użycie komórek i mierzalny problem startu/RSS. |
| FST / two-level / weighted FST | potencjalnie zwarty zapis produktywnych relacji i naturalna inwersja regułowa | nowy kompilator/runtime lub zależność, migracja override’ów, semantyka rankingów i ryzyko utraty readings; nie ma implementacji do porównania na tych samych goldach | **Odroczone.** Rozpatrzyć dopiero przy realnym przekroczeniu budżetu lub wymaganej morfologii niemożliwej do zapisania obecnym bezpiecznym zestawem operacji. |

Nie raportujemy porównawczej przewagi lazy lub FST, bo w repo nie istnieje ich implementacja i benchmark nie może jej uczciwie zmierzyć. Tabela porównuje ich konsekwencje architektoniczne, a czasy/RSS dotyczą wyłącznie obecnego backendu.

## Progi powrotu do decyzji

Otworzyć nowe issue, jeśli rzeczywisty, wymagany pakiet osiągnie **80%** któregokolwiek limitu: co najmniej 205/256 komórek w paradygmacie, 240 000/300 000 wygenerowanych form lub 52/64 readings jednej formy. To zapas na nowe klasy i warianty, nie obietnica SLA. Sam benchmark 10×2×3 ma 60 komórek, czyli 23,4% limitu paradygmatu.

- Lazy cache badać, jeśli zebrany trace właściwego workloadu pokazuje użycie najwyżej 20% zadeklarowanych komórek oraz pomiar lokalny potwierdza, że eager build lub RSS jest realnym wąskim gardłem. Prototyp musi mieć limit i deterministyczne zachowanie; inverse nadal ma zachować wszystkie dopuszczone analizy.
- FST badać, gdy pakiet przekracza próg budżetu albo wymagana, produktywna alternacja nie mieści się w kontrakcie kroków/override’ów. Kandydat musi wykazać pełną równość generate/analyze na goldach i materialną korzyść, docelowo co najmniej 2× mniejszy artefakt albo peak RSS dla tego samego inwentarza.
- Nie ustanawiamy bezwzględnego czasu cold-start jako SLA bez zdefiniowanego sprzętu i scenariusza użytkownika. Mierzymy porównania na tym samym hoście, z powtarzalnym inputem i pełną kontrolą inverse readings.

## Źródła kodu i testów

- `js/core/morphology/engine.js` — limity i eager build/inverse index.
- `js/core/morphology/compiler.js` — eksport deterministycznej finite relation table.
- `js/core/morphology/operations.js` — dostępne operacje i limity kroków/tekstu.
- `data/morphology/ar.json` — użycie `rootTemplate` w danych arabskich.
- `tests/morphology.test.js` — root template, Turkish harmony, inverse parity i refusals.
- `tools/benchmark-morphology.mjs` — powtarzalne synthetic inventories oraz pomiar czasu, RSS/heap i stabilności.
