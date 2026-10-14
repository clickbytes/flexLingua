# flexLingua — roadmap PL ↔ INTER ↔ EN (A1–C2)

**Ustalono:** 2026-10-12  
**Status dokumentu:** plan; nie deklaracja ukończonych poziomów CEFR  
**Bieżący priorytet:** kontrolowane tłumaczenie polski ↔ CORE/INTER ↔ angielski

> Celem jest jeden niezależny od języka silnik znaczeń i osobne pakiety analizy/realizacji gramatycznej. Nie tworzymy słownika gotowych zdań PL→EN ani translatora opartego na dopasowywaniu fraz.

## 1. Cel produktu i granice zakresu

~~~text
polski --(analiza)--> INTER / CORE --(realizacja)--> angielski
polski <--(realizacja)-- INTER / CORE <--(analiza)-- angielski
~~~

1. **Teraz:** rozwój słownictwa, semantyki, morfologii i gramatyki PL/EN na kontrolowanych poziomach od A1 w górę.
2. **Po użytecznym A1, częściowo równolegle z A2+:** Conversation Engine (dialog, kontekst, osobowość przypisana konfiguracją, pamięć krótkoterminowa).
3. **Później:** trwała pamięć i uczenie symboliczne, research ze źródeł takich jak Wikidata/Wikipedia i dokumentacje programowania. To nie jest bieżące zobowiązanie translacyjne.

Dodatkowe języki mają w przyszłości podłączać się do INTER; obecnie pełny zakres roadmapy obejmuje wyłącznie **PL i EN**. Istniejący adapter turecki pozostaje starszą demonstracją, nie trzecim językiem objętym kryteriami A1–C2.

## 2. Jak korzystamy z Oxford i CEFR

- **CEFR:** A1, A2, B1, B2, C1, C2. C3 nie jest standardowym poziomem.
- **Oxford 3000:** referencja do planowania podstawowego zakresu słownictwa (w przybliżeniu A1–B2).
- **Oxford 5000:** rozszerza Oxford 3000 o 2 000 dalszych haseł, w szczególności na poziomach B2–C1; suma to 5 000, nie 8 000.
- **C2:** potrzebuje materiału spoza Oxford 5000 (idiomy, rejestry, wieloznaczność, metafory, pragmatyka, teksty specjalistyczne).
- **Ważne:** hasło słownikowe ≠ sens CORE ≠ forma fleksyjna ≠ zdolność użycia w zdaniu. Nie wolno ogłaszać ukończenia poziomu tylko dlatego, że zaimportowano listę haseł.
- Listy Oxford służą jako **zewnętrzny punkt odniesienia**; nie kopiujemy do repozytorium pełnych chronionych list, definicji ani przykładów bez zweryfikowanych praw/licencji. Tworzymy własne opisy znaczeń, testy i dane lub używamy odpowiednio licencjonowanych źródeł. W rejestrze źródeł zapisujemy licencję i pochodzenie.

Oficjalny punkt odniesienia: https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000

## 3. Etapy rozwoju

| Etap | Co musi działać | Status |
| --- | --- | --- |
| **F0 — fundament** | Zgodność CORE, analiza i realizacja PL/EN, walidacja referencji, obsługa pytań, negacji, podstaw składni, kontekstu, konstrukcji wielowyrazowych | **W toku** — istnieje prototyp; Batch B wymaga implementacji i testów |
| **A1** | Przedstawianie się, osoby i przedmioty, codzienne czynności, podstawowe czasy, pytania, przeczenia, proste opisy, zaimki, liczby i proste dialogi | **Planowane** |
| **A2** | Zdarzenia przeszłe i przyszłe, prośby, porównania, preferencje, zakupy/podróże, łączenie prostych zdań | **Planowane** |
| **B1** | Narracja, przyczyna/skutek, częste zdania podrzędne, modalność, podstawowa referencja między zdaniami i częsta wieloznaczność | **Planowane** |
| **B2** | Złożona argumentacja, strona bierna, okresy warunkowe, kolokacje, częste idiomy, bardziej precyzyjna składnia | **Planowane** |
| **C1** | Szerszy zakres leksyki do Oxford 5000, rejestry formalne, parafraza, subtelne różnice składniowo-semantyczne | **Planowane** |
| **C2** | Rzadkie znaczenia i konstrukcje, trudna frazeologia, rejestry, metafory, niuanse pragmatyczne; materiały poza Oxford 5000 | **Planowane** |

**Nie utożsamiamy etapów z formalnym certyfikatem CEFR.** Zakres każdego etapu opisuje zestaw konkretnych funkcji i przypadków testowych. Gdy nie ma pokrycia określonego konstruktu, system powinien raportować ograniczenie zamiast zgadywać.

### F0: łączymy z rozpoczętym Batch B

- **v1.19 / zadania 3–5:** semantyka pytań CORE, kontrolowane parsowanie i realizacja PL/EN oraz przypadki gold obu kierunków **zaimplementowane w źródłach**. [Dokumentacja i ograniczenia](docs/questions-v1.19-pl-en.md). Pełne testy Node, synchronizacja standalone (agent GUI), modalność i formalne wydanie nadal otwarte.
- **v1.20:** parser składniowy z kompozycyjnymi regułami i diagnostyką.
- **v1.21:** kontekst i semantyka (odniesienia, zachowywanie niejednoznaczności).
- **v1.22:** konstrukcje wielowyrazowe, idiomy w kontrolowanym zakresie.
- Każda funkcja ma mieć testy obu kierunków oraz testy negatywne. Status „opisano” ≠ status „zaimplementowano”.

### Zadania F0 / A1.0 — raport realizacji

- **1. Audyt:** skontrolowano istniejące pakiety językowe, numery wersji i skrypty. Brakujące historyczne dokumenty pozostają otwarte; bez modyfikacji GUI.
- **2. Pokrycie:** wprowadzono autorski pilot 13 pojęć / 10 konstrukcji, CLI, testy i [metodologię](docs/coverage-a1.md). Pokrycie A1 jako poziomu **nie jest jeszcze zmierzone**.

### Kamienie milowe A1

1. **A1.0 — audyt:** lista wymaganych funkcji A1 oraz analiza pokrycia istniejących danych PL/EN.
2. **A1.1 — leksyka:** zweryfikowane sensy CORE i mapowania PL/EN, w tym częste homonimy.
3. **A1.2 — morfologia:** generowanie i analiza wymaganych form wybranych haseł, osobne reguły i wyjątki.
4. **A1.3 — konstrukcje:** pytania, przeczenia, zdania oznajmujące, uzgodnienia, podstawowa modalność i czas.
5. **A1.4 — walidacja:** ręcznie oceniane przypadki gold, testy kompozycyjne, publikacja raportu pokrycia i ograniczeń.
6. **A1.5 — punkt integracji dialogu:** prosta konwersacja oparta na wyłącznie udokumentowanych kompetencjach A1; brak deklaracji swobodnej rozmowy.

## 4. Jednostka postępu: znaczenie i konstrukcja

Każda nowa jednostka wymaga:

1. Identyfikatora/hasła w rejestrze pokrycia, poziomu i informacji o źródle/licencji.
2. Jednego lub wielu **odrębnych sensów INTER**; homonimy nie mogą być sztucznie łączone.
3. Leksemów PL i EN odsyłających do tych sensów.
4. Cech fleksyjnych, paradygmatów i jawnych wyjątków w pakietach językowych.
5. Reguł składniowych i ograniczeń semantycznych (walencja, szyk, przypadki, zgodność).
6. Przykładów **PL→INTER→EN oraz EN→INTER→PL** i przypadków, których system nie obsługuje.
7. Testów, które nie polegają wyłącznie na porównaniu zapamiętanych par zdań.

Przykład koncepcyjny: polski **zamek** może mapować do różnych sensów CORE, takich jak **building.castle** i **device.lock**. Angielskie realizacje odpowiednio **castle** i **lock** nie są bezpośrednimi odpowiednikami każdej formy „zamek”.

## 5. Strumienie pracy

| Strumień | Główne artefakty | Co mierzymy |
| --- | --- | --- |
| Leksykon + ontologia | data/pl.json, data/en.json, data/concepts.json | hasła, sensy, pokrycie referencji CORE |
| Morfologia | data/morphology/{pl,en}.json, silnik morfologii | sprawdzone komórki fleksyjne, analiza odwrotna |
| Gramatyka + semantyka | data/grammar/{pl,en}.json, js/core/ | konstrukcje, role, zakres operatorów, przypadki negatywne |
| Testy jakości | tests/, niezależne fixtures | prawidłowość semantyczna w obu kierunkach, regresje |
| Dokumentacja + wydania | README.md, ROADMAP.md, docs/ | status, przykłady, ograniczenia, decyzje, wyniki |

Rozwój PL i EN powinien być zsynchronizowany na poziomie znaczeń CORE, ale dopuszcza różne środki gramatyczne po obu stronach. Nie wolno „dopowiadać” nieznanych informacji (np. rodzaju osoby mówiącej) tylko po to, by wygenerować pojedyncze tłumaczenie.

## 6. Kryteria zakończenia poziomu (Definition of Done)

Wartości poniżej to **proponowane cele jakości**, a nie wynik obecnych testów:

- **100%** aktywnych wpisów etapu przechodzi walidację schematów i referencji CORE.
- **100%** ręcznie zatwierdzonych komórek gold w zadeklarowanych paradygmatach przechodzi test.
- **Co najmniej 95%** semantycznie poprawnych odpowiedzi na **zamrożonym zbiorze niewidzianych wcześniej zdań kontrolowanych**, osobno PL→EN i EN→PL; zbiór nie służy do projektowania reguł.
- Wszystkie obowiązkowe konstrukcje etapu przechodzą testy kompozycyjne oraz zestaw testów negatywnych (brak cichego fabrykowania odpowiedzi).
- Zapis i odczyt INTER zachowują role, relacje, negację, czas oraz istotną niepewność. „Round-trip” oceniamy semantycznie, **nie** przez identyczność słów.
- Testy regresyjne, walidacje danych oraz oba artefakty offline przechodzą kontrolę.
- Raport poziomu publikuje: **liczbę sprawdzonych haseł, sensów, form, konstrukcji, testów, odsetek poprawności w każdą stronę, wyłączenia i znane ograniczenia**.
- Nie nazywamy poziomu ukończonym bez jawnego zestawu wymagań, zbioru testowego i wyników.

## 7. Rozmowa i osobowość (następny cel produktowy)

Po demonstracji stabilnej rozmowy na A1 dołączamy do istniejącego INTER:

- **Dialogue Manager:** stan, cel wypowiedzi, pytania doprecyzowujące, podstawowa referencja.
- **Personality Engine:** zewnętrzny profil cech i sposobu reagowania, niezależny od języka.
- **Short-term Memory:** fakty podane w rozmowie wraz z kontekstem; możliwość korekty.
- **Response Planner:** wybór intencji odpowiedzi; realizacja przez pakiety PL i EN.

Osobowość wpływa na zachowanie i styl, a nie zamienia się w bibliotekę gotowych odpowiedzi. Zdolność rozumienia i generowania zdań pozostaje ograniczona faktyczną kompetencją językową silnika.

## 8. Odległe rozszerzenia — poza bieżącym zakresem

- Pamięć długoterminowa z pochodzeniem wiedzy i możliwością aktualizacji.
- Symboliczne uczenie relacji i reguł bez sieci neuronowych.
- Research poprzez zaufane źródła i weryfikację twierdzeń.
- Nauka składni/operacji języków programowania ze źródeł i testów w izolowanym środowisku.
- Kolejne pakiety językowe bez mnożenia translatorów parowych.

Nie deklarujemy osiągnięcia tych celów przed implementacją i oddzielnymi kryteriami odbioru.

## 9. Zarządzanie roadmapą

- **README.md** — krótki aktualny obraz projektu, punkt startowy i linki.
- **ROADMAP.md** — cele, kolejność, etapy CEFR, bramki jakości.
- **docs/development-workflow.md** — proces pracy, testy, wersjonowanie, reguły dokumentowania.
- **docs/README.md** — indeks dokumentacji.
- **docs/batch-*.md / docs/release-*.md** — kontrakty i wyniki poszczególnych wydań.
- Po każdej wdrożonej funkcji aktualizujemy odpowiednie dokumenty **w tym samym commicie**, a wyniki testów opisujemy wyłącznie wtedy, gdy rzeczywiście je uruchomiono.
- Zmiana priorytetu, zakresu lub bramki jakości wymaga aktualizacji tego pliku i wpisu w historii zmian.

## Etap 1 — C/D/E/F: stan eksperymentalny (`v1.20`)

[PR #1](https://github.com/ppotepa/flexLingua/pull/1) został scalony do `main` jako `2933cfa`. Zawiera implementacje: **C** modalność i rozdzielone zakresy negacji; **D** parser koordynacji oparty o sprawdzanie gramatycznie poprawnych fragmentów; **E** jedynie jawne wiązanie encji między zdaniami (bez automatycznej obsługi zaimków); **F** pierwsze dwa wielowyrazowe sensy (`look at`, `pick up`) i ich odpowiedniki PL. Szczegółowy kontrakt, negatywne przypadki i wymogi publikacji w [docs/stage1-batches-c-f-v1.20.md](docs/stage1-batches-c-f-v1.20.md). Zestaw `npm test` oraz `check:release` **nie został uruchomiony** (GitHub Actions: `startup_failure`). Zgodnie z kryteriami bramki jakości Batch C/D/E/F **nie są oznaczone jako ukończone ani wydane**; aktualizacja GUI standalone pozostaje w gestii osobnego agenta.

### Mikrobatch F2 — pytania z przyimkiem (2026-10-13)

Dla `event.visual_attention` z deklaratywnie wskazanym polskim przyimkiem `na` dołączono kontrolowane pytania o lukę `theme`: angielskie `what ... look at` i polskie `na co ... patrzy`. Zakres obejmuje również wybrane pytania modalne i pytania przeczące, a błędny szyk lub brak przyimka ma zwracać diagnostykę. To rozszerzenie częściowego Batch F, nie deklaracja całościowego pokrycia konstrukcji przyimkowych. Bramka: testy `tests/prepositional-wh-v1.21.test.js`, regresje i aktualizacja `HANDOFF.md`.

### Mikrobatch E1 — jawne powiązania encji (2026-10-13)

W ramach częściowego Batch E dodano walidację i diagnostykę `context.coreference`, deterministyczne filtrowanie niezgodnych kombinacji znaczeń oraz zachowanie poprawnych alternatyw interpretacji dla polisemiczych leksemów (np. `bank`). Ściśle rozdzielamy tożsamość encji od samej zbieżności słów. Brak obsługi zaimków, domniemanych poprzedników i pamięci między wywołaniami. Specyfikacja: [docs/context-coreference-e1.md](docs/context-coreference-e1.md); kolejne zadanie: E2 — ograniczona i jednoznaczna anafora.

### Mikrobatch E2a — źródłowe zaimki podmiotu (2026-10-13)

Dodano kontrolowany parser zaimków `he/she` oraz `on/ona` w drugim z dwóch zdań, dla znanych leksemów `person.boy` i `person.girl`. Poprzednik musi być jednoznaczny na poziomie ról semantycznych; błędne i niejednoznaczne odwołania skutkują diagnostyką, nie zgadywaniem. Dokumenty CORE wykorzystują wspólne ID encji; docelowa realizacja na razie powtarza rzeczownik. [Kontrakt E2a](docs/anaphora-e2a.md). Kolejne E2b: ostrożne generowanie zaimka w języku docelowym, bez zmieniania dawnych zachowań.

### E2b — bezpieczna realizacja zaimka docelowego (2026-10-14)

W silniku dodano opcjonalne `pronounRealization: 'safe'` dla `translate()` i `realize()`. Zaimek `she/he` albo `ona/on` jest realizowany wyłącznie na podstawie wspólnej encji CORE, przy jednoznacznej referencji i konfiguracji docelowej gramatyki. Domyślny tryb `repeat` zachowuje wszystkie wcześniejsze wyniki; przy niejednoznaczności następuje jawne powtórzenie rzeczownika. Szczegóły: [docs/anaphora-e2b.md](docs/anaphora-e2b.md). Następny etap E3 to kontekst 3–8 zdań.

### E3 — dyskurs 3–8 zdań (2026-10-14)

Rozszerzono śledzenie jednej wcześniej potwierdzonej encji poprzez kolejne niezależne zdania. Każdy nowy zaimek podmiotu musi mieć jeden unikalny referent CORE spośród wcześniejszych tożsamości, nie tylko najbliższy rzeczownik; wiele różnych pasujących encji daje jawną odmowę. Ograniczona analiza 16-kandydatową wiązką, bez trwałej pamięci i bez zmian dla niezwiązanych wypowiedzi. Rozszerzono opcjonalną realizację zaimków E2b. [Kontrakt E3](docs/anaphora-e3.md). Kolejny mikrobatch E4: pamięć operacyjna rozmowy między wywołaniami API.

### E4 — pamięć kontekstu między wywołaniami silnika (2026-10-14)

Dodano ograniczoną do 8 wydarzeń pamięć **operacyjną** `ConversationContext`, bez trwałego zapisu i bez ingerencji w stateless `Engine`. Klauzula z zaimkiem może odnosić się do jednoznacznej wcześniejszej encji w sesji; błąd, niejednoznaczność, limit lub brak realizacji powodują odmowę bez modyfikowania stanu. API: [docs/conversation-e4.md](docs/conversation-e4.md). Po E4 następny mikrobatch F3 obejmuje osobne znaczenia konstrukcji wielowyrazowych; pamięć trwała / personality engine są późniejszym etapem.

### F3 — trzy nowe pojęcia dla wyrażeń wielowyrazowych (2026-10-14)

Dodano odrębne sensy CORE: `event.search` (`look for/szukać`), `event.auditory_attention` (`listen to/słuchać`) oraz `event.wait_for_entity` (`wait for/czekać na`). Rozbudowano słowniki i ramki PL/EN z kontrolowaną odmianą czasów, negacją, pytaniami i wybranymi modalnościami. Pierwotnie nie dodano produktywnej morfologii; została ona uzupełniona w późniejszym [mikrobatchu F3b](docs/multiword-morphology-f3.md) dla pięciu par czasowników, ale pełna walidacja wydania nadal jest otwarta. [Kontrakt F3](docs/multiword-f3.md). Po zakończeniu etapu 1 następne G1: pełny audit CI, prawdziwe `npm test` i synchronizacja offline z osobnym agentem GUI.


### G1a — poprawiona konfiguracja CI, ale blokada runnerów (2026-10-14)

Zmodyfikowano wyzwalacze GitHub Actions na `main`, gałęzie `core/**`, PR i ręczne uruchamianie, rozdzielono testy silnika, leksykonu/morfologii/gold/A1, kontroli standalone i agregat `check:release`. W ramach audytu raport A1 uwzględnia teraz lexemes `modals`, a referencje CORE operator/funkcja są sprawdzane. Testy konfiguracji CI w Node 22: **4/4**. Izolowane testy raportu A1: **4/4**. GitHub Actions dla nowego workflow nadal: `startup_failure` przed utworzeniem jobs — [issue #9](https://github.com/ppotepa/flexLingua/issues/9). Pełne `npm test`, `check:release` i parytet GUI **niewykonane**. Szczegóły: [docs/g1-ci-audit.md](docs/g1-ci-audit.md). G1 nie jest jeszcze ukończony; wymagane rozwiązanie blokady Actions i prawdziwy raport Node.

### F3b — produktywna morfologia wyrażeń wielowyrazowych (2026-10-14)

Dodano wspólne reguły `appendStem`, paradygmaty `en.verb.regular_particle` i `pl.verb.third_person_particle`, dziesięć wiązań leksemów oraz **55 jawnie ocenionych form gold** (4 EN i 7 PL na parę). Izolowane testy silnika: **6/6 grup**. Szczegóły w [F3b](docs/multiword-morphology-f3.md). `npm test`, `check:release` i parytet standalone nadal niezweryfikowane (GitHub Actions `startup_failure`, issue #9). GUI prowadzi oddzielny agent. Brak deklaracji ukończenia A1.

## G2 — niezależny pilot zdań (14.10.2026)

Przygotowano autorski oracle 32 zdań PL/EN w obu kierunkach i 8 odmów, weryfikujący również semantykę CORE. Jest to pilot o ograniczonym zakresie, nie ukończony A1 ani potwierdzenie CI. Zob. [G2](docs/g2-a1-gold.md). G3: raport jakości w granicach jawnego zestawu.

## G3 — kontrolowana ewaluacja A1 (14.10.2026)

Do strukturalnego audytu dołącza deterministyczny, wykonywalny raport z wynikiem skończonej próbki zdań i odmów. Zestaw obejmuje oba kierunki oraz semantykę INTER, nie przekłada się automatycznie na procent A1. Niezależnym warunkiem wydania jest odblokowanie GitHub Actions i pełny Node/release/standalone gate. Zob. [G3](docs/g3-a1-report.md).

## G1b — dowodowa diagnoza Actions (14.10.2026)

Dodano niezależny minimalny smoke workflow do odróżnienia awarii startu runnera od regresji w `Core Engine CI`. Nie usuwa to znanej blokady `startup_failure`; warunek odbioru G1b to rzeczywiste zakończone jobs i pełny Node/release/offline gate. Zob. [G1b](docs/g1b-startup-probe.md).

## G1b/G2/G3 — stan odbioru po drugim smoke (14.10.2026)

G2/G3 mają wdrożone testy, raport i zestaw gold w repo, lecz pełny CI/release pozostaje niezweryfikowany przez `startup_failure` (issue #9). Workflow probe G1b był wdrażany dwukrotnie; odrębny run nie został potwierdzony. GUI standalone ma oddzielne zadanie #16. Po przywróceniu zadań GitHub Actions dokończyć pełną walidację.

## F0 Batch 1 (14.10.2026)

Dodano lokalny runner pełnych bramek (bez GUI build i bez ukrytego omijania błędów). Weryfikacja GitHub-hosted wciąż zablokowana; procedura i ograniczenia w [docs/f0-local-gates.md](docs/f0-local-gates.md).

## A1 Batch 2 — autorska lista braków (14.10.2026)

Wersjonowany zestaw 22 celów w sześciu obszarach uzupełnia raport strukturalny i gold; wykazuje niezależnie missing ontology/lexicon/morphology/frame/evidence. To lista projektowa, nie cały CEFR A1. [Metodologia](docs/a1-gap-audit.md).

## A1 Batch 3 — nowe elementy CORE (14.10.2026)

`person.sister`, `person.brother`, `event.read`, `event.help` dodano z niezależną leksyką PL/EN, produktywną odmianą i testami gold, w tym polskim celownikiem przy `pomagać`. Nie kończy to poziomu A1. Zob. [opis](docs/a1-family-actions.md).

## A1 Batch 4 (14.10.2026)

`person.father` jest teraz modelowane, z PL/EN `ojciec/father` oraz dwukierunkowymi testami. Pozostałe kategorie audytu A1 nie są automatycznie uznane za kompletne. [Zakres](docs/a1-father.md).

## A1 Batch 5 (14.10.2026)

Dołączono PL `iść` do `event.movement`, ograniczona, intransitive gramatyka bez celu. [Dokumentacja](docs/a1-movement.md).

## A1 Batch 6 (14.10.2026)

Dołączono znaczenia pisania i otwierania, ich morfologię, testy semantyczne i autorską listę 23 celów (nie kompletny CEFR). [Dokumentacja](docs/a1-daily-actions.md).

## Aktywne repozytorium po migracji (14.10.2026)

**Tylko [clickbytes/flexLingua](https://github.com/clickbytes/flexLingua)** przyjmuje nowe commity, PR, issues i wyniki CI. Kod źródłowy historycznie rozwijano w ppotepa; dotychczasowe linki PR pozostają historią. [Migracja i walidacja Actions](docs/migration-clickbytes.md). CORE/GUI to odrębne zadania. Po odblokowaniu runnerów trwa usuwanie realnych regresji Node i synchronizacja standalone przez agenta GUI.

## A1 Batch 7 (14.10.2026)

Scalanie dowodów z sześciu niezależnych fixture'ów: 115 przykładów pozytywnych, 25 odmów, 60 komórek; `check:a1-evidence` uruchamia rzeczywiste testy, a `report:a1-evidence` nie udaje ich wykonania. Pomiar całego CEFR nadal niedostępny. [Opis](docs/a1-evidence-ledger.md). Kolejne batche: osoba 1/2, `być/mieć`, relacje miejsca i kierunku. GUI osobny agent.

## Backlog egzekwowalny i epiki (14.10.2026)

Otwarto **14 epików / 67 tasków** w `clickbytes/flexLingua`; każde ma rodzica, AC i kontrakt plików oraz checklistę. [BACKLOG](docs/planning/BACKLOG.md), [ISSUE_MAP](docs/planning/ISSUE_MAP.json), [EXECUTION_ORDER](docs/planning/EXECUTION_ORDER.md). Epik A1 nie jest certyfikacją CEFR. Release nadal zablokowany przez GUI #1 (histor. 398/401 pass); nowe PR muszą mieć realny Node Actions run i HANDOFF.
