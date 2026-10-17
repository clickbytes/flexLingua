# ADR: ogólny kontrakt cech i transferu językowego

**Status: Accepted for the GEN-07+ migration plan**  
**Data decyzji: 2026-10-17**  
**Zakres GEN-06:** decyzja i dokumentacja; bez zmian runtime, danych, schematów ani goldów.

## Decyzja

Zachować semantyczny CORE niezależny od języka i dodać wersjonowany most między
rolami CORE a składnią i morfologią pakietu językowego. Nie rozszerzać globalnego
rejestru o sumę wszystkich cech wszystkich języków. Adapter językowy ma deklarować
własny profil możliwości, mapowanie argumentów dla obsługiwanych konstrukcji oraz
to, jak funkcje składniowe, kontrolery uzgodnienia i cechy formy wynikają z CORE.

Migracja jest opt-in. Istniejące adaptery i dokumenty CORE v1.0 pozostają czytelne
i działają bez nowych pól. Samo wystąpienie wartości w rejestrze nie oznacza, że
jakiś język potrafi ją przeanalizować, wygenerować lub zachować w transferze.

## Słownik i typy

| Pojęcie | Znaczenie kontraktowe |
| --- | --- |
| **CORE meaning** | Wersjonowane zdarzenia, stany, encje, role semantyczne i ich relacje w językowo neutralnym formacie. Nie zawiera docelowego szyku, przypadku ani końcówki. |
| **Semantic role** | Rola uczestnika względem znaczenia, np. `agent`, `theme`, `recipient`. Sama rola nie oznacza podmiotu ani dopełnienia. |
| **Lexical feature** | Trwała cecha danego sensu/leksemu, np. rodzaj gramatyczny rzeczownika lub klasa odmiany. |
| **Form feature** | Cecha konkretnej komórki paradygmatu, np. osoba, liczba lub przypadek formy. Wartość należy do profilu morfologicznego języka. |
| **Syntactic function** | Funkcja argumentu w danej konstrukcji języka, np. subject, object lub oblique. Jest wyznaczana przez transfer, nie przez nazwę roli CORE. |
| **Agreement controller** | Jawna referencja do uczestnika lub argumentu, którego cechy sterują konkretnym uzgodnieniem. Controller może być inny niż podmiot. |
| **Case requirement / exponent** | Wymaganie składniowe wobec argumentu i sposób jego realizacji przez pakiet: odmianę, adpozycję, szyk albo brak jawnego wykładnika. Przypadek nie jest rolą semantyczną. |
| **Language capability profile** | Wersjonowana, skończona deklaracja obsługiwanych konstrukcji i ich dowodów. Nie jest deklaracją kompletności języka. |

`agent = subject`, `theme = object`, `case = role` i `controller = subject` nie
są inwariantami. Każde takie powiązanie należy do konkretnego transferu albo
reguły gramatycznej języka.

## Stany informacji i odmowa

| Stan | Znaczenie | Wymagane zachowanie |
| --- | --- | --- |
| `absent` | Pole lub wymiar nie został podany; nie wynika z tego żadna wartość. | Nie wstawiać domyślnej wartości semantycznej. Pakiet może użyć jawnie zadeklarowanej realizacji domyślnej wraz z ostrzeżeniem. |
| `unknown` | Wymiar jest rozpoznany, ale jego wartość nie jest znana albo nie została ustalona. | Zachować `unknown`, jeśli typ dopuszcza tę wartość; nie zamieniać na `absent` ani na zgadywaną konkretną wartość. |
| `ambiguous` | Istnieje więcej niż jedna zgodna analiza lub realizacja. | Zwrócić ograniczony zbiór alternatyw z osobnymi CORE/planami; nie wybierać jednej bez dowodu. |
| `unsupported` | Dane są poprawnie uformowane, ale konstrukcja lub żądana wartość nie należy do aktywnego profilu. | Zwrócić jawny refusal/diagnostic z identyfikatorem braku capability. |
| `invalid` | Dane naruszają typ, wymagane pole, enum, relację albo wersję kontraktu. | Odrzucić przy walidacji profilu, adaptera lub wejścia; nie próbować naprawy heurystycznej. |

Brak pola, niewiedza i odmowa są odrębnymi stanami. W szczególności brak
kontrolera uzgodnienia nie uprawnia do wyboru podmiotu, a brak mapowania roli nie
uprawnia do zmiany roli w CORE.

## Rozważone strategie

| Strategia | Zalety | Koszty i ograniczenia | Decyzja |
| --- | --- | --- | --- |
| **Globalna unia cech** w `data/features.json` | Jeden rejestr; szybki start dla kilku małych języków. | Miesza znaczenia CORE, właściwości leksemu i formy; obecność wartości sugeruje fałszywe capability; wprowadza zależności wszystkich pakietów od globalnych enumów i rozgałęzienia walidacji. Nie daje dowodu, że rola zachowała się przez transfer. | Odrzucona jako model rozszerzania. Globalny rejestr może zawierać wyłącznie rzeczywiście wspólne, neutralne pojęcia. |
| **Profil per język bez jawnego mostu** | Izoluje wartości morfologiczne i ogranicza kolizje. | Nadal pozostawia niejawne mapowanie roli CORE na argument, funkcję składniową, przypadek i controller; walidacja nie potrafi wykazać zachowania ról. | Odrzucona jako kompletny kontrakt. Profil pozostaje częścią wybranej strategii. |
| **Profil języka + typowany most semantic→morphosyntax** | Oddziela semantykę od formy; obsługuje różne szyki, case alignment i kontrolery; można walidować zachowanie ról i jawne odmowy. | Wymaga wersjonowanych deklaracji, mapowań per konstrukcja i osobnych dowodów pokrycia. | **Wybrana.** Implementować etapami, bez przepisywania CORE v1.0. |

## Kontrakt rozszerzenia vNext

Poniższe pojęcia są docelowym kontraktem typów, a nie nowym formatem JSON w tym
issue. Właściwy schemat i walidator powstaną w zadaniach implementacyjnych.

1. **`LanguageFeatureProfileV1`** jest własnością pakietu językowego i ma własną
   wersję. Ogranicza wymiary oraz wartości do zakresów: lexical, form,
   syntactic-function, controller i exponence. Opisuje capability konstrukcjami,
   nie samymi nazwami wartości.
2. **`TransferPlanV1`** mapuje role semantyczne CORE do stabilnych identyfikatorów
   argumentów konstrukcji. Każdy argument może zadeklarować funkcję składniową,
   wymaganie przypadku, liniaryzację i zero lub więcej kontrolerów uzgodnienia.
   Mapowanie jest per konstrukcja; nie zakłada jednego globalnego `subjectRole`.
3. **`MorphosyntaxRealizationV1`** wybiera dozwolone cechy formy z profilu,
   leksem i komórkę paradygmatu oraz jawny wykładnik składniowy. Nie przenosi
   cech formy do semantycznego CORE.
4. **`CapabilityEvidence`** wiąże `implemented`, `demo` albo `blocked` z
   identyfikatorem konstrukcji oraz ręcznie zatwierdzonym fixture/case. Enum
   profilu bez takiego powiązania jest tylko inwentarzem, nie dowodem działania.
5. Każdy etap zachowuje identyfikatory i role CORE. Jeśli target nie może ich
   wyrazić, plan zawiera jawny, typowany przypadek utraty albo zwraca refusal;
   nie pomija argumentu po cichu.

Weryfikacja transferu porównuje semantyczne role przed i po przejściu, a osobno
porównuje funkcje składniowe i formy targetu. Przykładowo `recipient` pozostaje
`recipient` w CORE niezależnie od tego, czy profil języka realizuje go jako
podmiot, celownik, adpozycję czy konstrukcję bez wykładnika. Szczegóły wybranej
realizacji muszą pochodzić z deklaracji profilu i testowanego przypadku.

Liczba przypadków nie jest polem sterującym ani numerem pozycyjnym. Profil
deklaruje własne identyfikatory przypadków, ich funkcję w konstrukcjach i
realizację. Dzięki temu inventory może być puste, mieć 2, 7, 10 lub inną liczbę
wartości bez zmiany globalnego CORE; obsługa konkretnego inventory wymaga jednak
oddzielnych komórek, parsera i dowodów.

## Bieżący stan audytu

Statusy odnoszą się do sprawdzonego zakresu repo, nie do kompletności języka.
`IMPLEMENTED` oznacza działający, przetestowany bounded adapter. `DEMO` oznacza
mały, jawnie ograniczony przykład. `BLOCKED` oznacza brak aktywnego kontraktu lub
brak dowodu dla wskazanej zdolności.

| Oś / capability | PL | EN | TR | IT | AR |
| --- | --- | --- | --- | --- | --- |
| Aktywny parser/realizer zdaniowy | **IMPLEMENTED** — adapter v1.0 i kontrolowane fixtures. | **IMPLEMENTED** — adapter v1.0 i kontrolowane fixtures. | **DEMO** — mały adapter v1.0, 6 rzeczowników, 2 czasowniki i ograniczone konstrukcje. | **BLOCKED** — plik `data/grammar/it.json` nie jest rejestrowanym adapterem; test capabilities wymienia EN/PL/TR. | **BLOCKED** — brak adaptera zdaniowego. |
| Przypadki w obecnym zakresie | **DEMO** — wspólne syntactic.case ma 5 wartości; morfologia PL ma 7 nazwanych przypadków, ale nie wszystkie alternacje przechodzą przez składnię. | **DEMO** — regularne rzeczowniki używają ścieżki `forms.{number}`; brak uogólnionego paradygmatu przypadków nominalnych. | **DEMO** — 3 przechowywane formy nom/acc/dat w stałym, ograniczonym inwentarzu. | **BLOCKED** — brak aktywnego adaptera i dowodów. | **BLOCKED** — arabski test sprawdza tylko morfologię korzeniową, nie składnię ani transfer przypadków. |
| Profile 0 / 2 / 10 przypadków | **BLOCKED** — bieżący zakres to 5 wspólnych wartości składniowych i 7 nazwanych komórek PL, nie profil 0/2/10. | **DEMO** — brak slotu przypadku dla zwykłych rzeczowników; nie jest to dowód ogólnego kontraktu języka „bez przypadku”. | **BLOCKED** — trzy przypadki w tabeli TR nie są fixture dla inventory 2 ani 10. | **BLOCKED** — brak aktywnego profilu. | **BLOCKED** — brak testu składni/case. |
| Dual w znaczeniu i realizacji | **BLOCKED** — participant number CORE ma singular/plural; brak dual end-to-end. | **BLOCKED** — generator raportuje brak komórki dla `number:dual`. | **BLOCKED** — brak fixture dual. | **BLOCKED** — brak aktywnego profilu. | **BLOCKED** — ogólny enum morfologiczny nie stanowi arabskiego fixture dual. |
| Alignment argumentów / ergative–absolutive | **DEMO** — wybrane ramy mapują role przez linearizację/case; nie ma deklaracji alignment ani erg/abs fixture. | **DEMO** — role, kolejność i wybrane przypadki są lokalne dla ram; nie ma ogólnego alignment profile. | **DEMO** — kontrolowane SOV i nom/acc/dat; brak obsługi lub dowodu erg/abs. | **BLOCKED** — brak aktywnego adaptera. | **BLOCKED** — brak adaptera i alignment testu. |
| Uzgodnienie z kontrolerem innym niż podmiot | **BLOCKED** — parser źródła feature dopuszcza `subject`/`event`; pola object w morfologii nie dają mapowania gramatycznego. | **BLOCKED** — brak end-to-end controller mapping. | **BLOCKED** — brak end-to-end controller mapping. | **BLOCKED** — brak aktywnego adaptera. | **BLOCKED** — brak adaptera zdaniowego. |

Podstawa lokalna: `data/features.json` v0.4 ma participant number singular/plural
i pięć wspólnych wartości syntactic.case; `data/morphology/features.json` v1.02
ma osobny, ograniczony enum, w tym `dual` i osiem nazw przypadków. Polish
morphology documentation opisuje siedem nazwanych przypadków PL. Test
`tests/language-adapter-contract.test.js` rejestruje EN/PL/TR i odrzuca nieznane
kontrakty; `tests/morphology.test.js` pokazuje dual jako brakującą komórkę EN oraz
arabski fixture wyłącznie morfologiczny. `docs/tr-audit.md` opisuje ograniczenia
TR. Żaden z tych inwentarzy nie jest samodzielnym dowodem na pełną typologię.
Obecny enum ośmiu przypadków jest współdzielonym limitem form morfologicznych,
nie profilem języka: nie reprezentuje sam z siebie systemu 10-przypadkowego;
profil vNext ma deklarować lokalny inwentarz. W repo nie ma też end-to-end
fixture dla systemu 2-przypadkowego.

## Wersjonowanie i migracja

1. **Zamrożenie kompatybilności:** zachować Interlingua/CORE v1.0,
   `LANGUAGE_ADAPTER_CONTRACT_VERSION='1.0'`, `MORPHOLOGY_ADAPTER_CONTRACT_VERSION='1.0'`,
   `FEATURE_VERSION='0.4'`, `MORPH_FEATURE_VERSION='1.02'` i grammar v1.0 dla
   obecnych użytkowników.
2. **Profil osobną wersją:** pierwsza jawna `LanguageFeatureProfileV1` ma
   niezależną wersję, niezależną od semantic registry, morphology registry,
   grammar JSON i wire-formatu CORE. Nie dopisuje wartości językowych do
   globalnego rejestru semantic features.
3. **Kompatybilny pilot:** stare adaptery v1.0 otrzymują jawny legacy projection
   z ograniczonym statusem `demo`; nowe mapowanie transferu jest dodawane
   opt-in. Nie wolno po cichu udawać, że adapter v1.0 ma nową capability.
4. **Wersja adaptera:** podnieść adapter contract do 2.0 dopiero, gdy nowy profil
   i typowany transfer stają się wymagane przez metody rejestracji/analizy.
   `Engine` ma wtedy jawnie obsłużyć v1 przez shim albo odmówić w sposób
   wersjonowany; nie akceptować częściowego kontraktu.
5. **Niezależne zmiany:** zwiększać wersję CORE/Interlingua tylko po zmianie
   semantycznej serializacji; morphology version tylko po zmianie morfologicznego
   formatu; grammar version tylko po zmianie jego JSON kontraktu. Dodawanie
   profilu języka nie uzasadnia globalnego bumpu tych formatów.
6. **Kolejność:** dodać profil i walidację → pilotować jeden role/case/controller
   transfer → dodać transitive proof w dwóch kierunkach → dopiero potem rozszerzać
   importer lub następne języki. Historyczne goldy pozostają niezależnym oracle.

## Konkretne kotwice implementacji

### GEN-07: kształt profilu uruchomieniowego

Pierwszy kontrakt wykonawczy `LanguageFeatureProfile` ma wersję `1.0` i pola
`language`, `syntactic` oraz `morphology`. Każda domena jest mapą nazw wymiarów
na niepuste, unikalne listy wartości. Brak wymiaru oznacza, że kategoria nie
występuje; wartość spoza zadeklarowanej listy jest nieznana. Puste listy są
niepoprawne. Profil składniowy może więc deklarować zero przypadków przez brak
`syntactic.case`, a profile 2- i 10-przypadkowe podają własne inwentarze.

Profil jest opcjonalny dla istniejących adapterów i pakietów morfologii.
Po jego podaniu rejestracja adaptera porównuje inwentarz z deklaracjami
gramatyki, a rejestr morfologii ogranicza obsługiwane cechy do jego domeny.
`Engine.capabilities()` ujawnia profil tylko dla pakietów, które go deklarują.
Globalne `data/features.json` v0.4, `data/morphology/features.json` v1.02,
CORE v1.0 i kontrakty adapterów v1.0 pozostają bez migracji. Brak kategorii,
nieznana wartość, niepoprawna kombinacja i brak komórki formy są osobnymi
wynikami dostępności.

| Kotwica | Wpływ kontraktu |
| --- | --- |
| `js/core/features.js`: `createFeatureRegistry`, `featureSource`, `valueAt`, `unifyFeatures`, `validateFeatureBundle` | `featureSource` ogranicza dziś źródła do `subject`/`event`; zachować bezpieczne ścieżki, ale zastąpić twarde założenia typowaną referencją do kontrolera w opt-in kontrakcie. |
| `js/core/morphology/features.js`: `MORPH_FEATURE_VERSION`, `createMorphFeatureRegistry`, `flattenMorphFeatures` | Oddzielić inwentarz profilu od wymiarów CORE; hierarchiczne kontrolery nie mogą same tworzyć capability. |
| `js/core/grammar.js`: `validateGrammar`, `roleCase`, `frame.cases`, `linearizations`, `createRuleAdapter` | Najważniejsze miejsce transferu semantycznej roli na funkcję/case/szyk; walidacja ma kontrolować role, controller i wspólną kompletność mapowania. |
| `js/core/nominals.js`: `createNominalInterpreter`, `featuresFor`, `parseProperties`, `readProperty` | Konsumuje wybrane cechy i układ nominalny; nie powinien zmieniać CORE ani wnioskować roli z samego przypadku. |
| `js/core/adapter-contract.js`: `LANGUAGE_ADAPTER_CONTRACT_VERSION`, `validateLanguageAdapter`, `validateMorphologyAdapter`; `js/core/engine.js`: `registerLanguage`, `capabilities` | Miejsce dla jawnego opt-in profilu, zgodności wersji i capability inventory. |
| `data/features.json`, `data/morphology/features.json`, `data/grammar/{en,pl,tr}.json` | Zachować oddzielne zakresy semantyczne, morfologiczne i językowo-składniowe. Nie edytowano ich w GEN-06. |

Zależne zadania: GEN-07 #185 jest pierwszym konsumentem profilu. GEN-08–11
#186–189 zużywają jego morfologię, case, kontrolery i brakujące argumenty.
GEN-12–15 #190–193 uzupełniają szyk, tokeny, import i capability manifest.
GEN-20 #198 ma sprawdzać macierz i dowody, nie tworzyć globalnego union. GEN-14
#192 może mapować UniMorph tylko do lokalnego profilu leksemu/formy. ADR o
tożsamości wzmianki #194 i ADR liczności #195 pozostają odrębne; ich semantyk
nie jest częścią tego kontraktu.

### GEN-09: mapowanie ról na przypadki

Gdy profil zawiera `syntactic.case`, wartości `frame.cases`, alternacji oraz
znaczników pytań muszą należeć do tego inwentarza. To samo nazewnictwo jest
dostępne w domenie morfologii pakietu, a analiza i realizacja korzystają z tych
samych deklaracji ramy. Przypadek pozostaje wykładnikiem języka; nie jest
dodawany do ról ani referentów CORE.

Jeśli profil pomija `syntactic.case`, język jest bezprzypadkowy: szyk w
`linearizations` rozróżnia role, rzeczowniki nie mają placeholdera `{case}`,
a `frame.cases` można pominąć. Ramy stanów, które wymagają jawnego pola,
używają `null`, aby oznaczyć brak wykładnika przypadku. Nie wprowadza się
sztucznej końcówki ani domyślnego przypadku.

`tests/generic-case-systems.test.js` przeprowadza ręcznie opisane mini-pipeline
EN → CORE → język testowy → CORE dla profili 0-, 2- i 10-przypadkowego.
Wariant 10-przypadkowy sprawdza dwadzieścia komórek liczby i przypadku dla
leksemu, dwa przyporządkowania ról oraz round-trip składni.

## Testy i dowody do zachowania

GEN-06 nie zmienia runtime, więc nie uruchamia testów. Przy wdrażaniu profilu
pozostają obowiązkowe: `tests/features.test.js` (rejestr, źródła i unifikacja),
`tests/language-adapter-contract.test.js` (wersje, rejestracja i capability) oraz
`tests/morphology.test.js` (typowane cechy i granica fixture AR). Ręczne goldy
pozostają niezależnym dowodem transferu ról; nie wolno generować ich oczekiwanych
CORE z silnika.

## Źródła zewnętrzne i ograniczenia ich użycia

- [UniMorph Schema](https://unimorph.github.io/schema/) opisuje bundlowanie cech
  morfologicznych dla formy leksemu i zaznacza word-based reprezentację bez
  segmentacji morfemów. Inspiruje `FormFeatureProfile`, ale nie wyznacza ról
  składniowych ani capability adaptera.
- [Universal Dependencies: Features](https://universaldependencies.org/u/feat/index.html)
  definiuje zestaw cech wielojęzycznego schematu adnotacji; „universal” oznacza
  tu poświadczone w więcej niż jednym języku, a nie obecne we wszystkich
  językach. Dokumentacja dopuszcza udokumentowane rozszerzenia językowe. To
  referencja dla inwentarzy i zakresów, nie model transferu CORE.
- [Grammatical Framework Tutorial](https://www.grammaticalframework.org/doc/tutorial/gf-tutorial.html)
  rozdziela abstract syntax od concrete syntax i pokazuje różne linearizacje
  wspólnego znaczenia, w tym zmianę szyku/argumentów. Jest precedensem rozdziału
  semantyki i realizacji; nie kopiujemy jego typów ani nie deklarujemy pokrycia
  GF dla naszego silnika.
- [DELPH-IN MRS RFC](https://github.com/delph-in/docs/wiki/MrsRFC) opisuje płaską
  reprezentację semantyczną z underspecification. Jest przydatnym punktem
  odniesienia dla zachowania niejednoznaczności; MRS nie jest profilem
  morfologii ani kontraktem możliwości języka.

Korzystamy wyłącznie z publicznych opisów formatów i idei architektonicznych;
żadnych chronionych korpusów, list lexemes ani oczekiwanych zdań z tych projektów
nie kopiujemy.
