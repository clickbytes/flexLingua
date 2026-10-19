# ADR: warianty szyku sterowane cechami i równoważność semantyczna

- **Status:** Accepted by owner for the bounded FWO-07 opt-in in #460; independent review was explicitly waived.
- **Data:** 2026-10-19
- **Zakres:** bounded, opt-in warianty szyku w istniejących pakietach LanguagePlugin; bez zmian runtime w tym ADR.

## Kontekst

Jeden MeaningGraph może być realizowany przez więcej niż jedną kolejność składników. Przykładowo polskie „Dziewczynka widzi psa” i „Psa widzi dziewczynka” mogą zachować role agent=dziewczynka i theme=pies, ponieważ bieżący bridge i przypadki PL wiążą role z argumentami niezależnie od ich pozycji. Zamiana uczestników („Kot widzi psa” / „Pies widzi kota”) zmienia przypisanie ról i znaczenie.

Wariant szyku nie jest dowodem równoważności. Fronting może współwystępować z informacją prezentacyjną, ale bez osobnego, jawnego dowodu nie określa topic ani focus. Nie należy też generalizować z PL na EN: ograniczony kontrakt EN pozostaje przy swoich zadeklarowanych kolejnościach. „This cat is green” nie staje się automatycznie równoważne z „Green is the cat”. Ruch pojazdu wymaga poprawnego, licencjonowanego sensu „jechać”; nie wolno użyć „iść” ani ogólnego „go” jako obejścia.

Przykłady podlegające kontraktowi:

| Język / wejścia | Relacja CORE |
| --- | --- |
| PL: „Dziewczynka widzi psa” / „Psa widzi dziewczynka” | same-core, jeżeli oba odczytania przypisują agent=dziewczynka i theme=pies oraz zachowują te same cechy. |
| PL: „Kot widzi psa” / „Pies widzi kota” | different-core: koncepty w rolach agent i theme są zamienione. |
| EN: „The dog sees the girl” / „The girl sees the dog” | different-core; obie formy SVO mają jawne, różne przypisania agent/theme. OVS nie jest przez ten ADR dodawane do gramatyki EN. |
| transfer_possession z jawnym żądaniem topic=agent, focus=theme / focus=recipient | same-core-with-presentation-difference; to istniejące, ograniczone API caller request, nie wniosek z rozpoznanej kolejności. |
| EN: „This cat is green” / „Green is the cat” | nie uznawaj automatycznie za równoważne; deiksa i konstrukcja predykatywna wymagają własnego dowodu. |

Polskie rzeczowniki bez rodzajnika pozostawiają określoność nieznaną. Angielski rodzajnik wybrany przez politykę wyświetlania może więc wiązać się z jawnie raportowaną informationLoss; sam tekst pary PL/EN nie dowodzi ścisłej równości określoności. Gdy analiza ma dwa różne, nadal zgodne przypisania ról i brak dowodu rozstrzygającego, wynik jest ambiguous z obiema MeaningGraphami.

Decyzja rozwija istniejące frame.linearizations, role mapping w bridge i walidację MeaningGraph. Nie tworzy drugiego parsera, globalnego zbioru cech ani nowego grafu semantycznego. Rozdział CORE, funkcji składniowej, przypadku i cech formy pozostaje zgodny z [ADR kontraktu cech i transferu](generic-language-feature-contract.md) oraz [ADR typowanego grafu](typed-semantic-graph.md).

## Decyzja: trzy odrębne warstwy

1. **Surface evidence** należy do analizy LanguagePlugin. Może opisać konstrukcję, ID zadeklarowanego wariantu, mapowanie slotów na ścieżki MeaningGraph, zakresy tekstowe i rozpoznane dowody składniowe. Nie jest częścią CORE i nie zmienia semantycznego odczytania.
2. **Truth-conditional MeaningGraph** przechowuje koncept/typ, role semantyczne i ich uczestników, jawne referenty, cechy uczestników oraz cechy zdarzenia lub stanu, w tym czas, aspekt, polaryzację i scope. Nie przechowuje wariantu szyku, funkcji składniowej ani wykładnika przypadku.
3. **Discourse / presentation** obejmuje topic, focus, kontrast, prozodię i wiedzę z wcześniejszego kontekstu. To osobna, przyszła warstwa. W tym bounded zakresie topic/focus może być podane przez jawne, obsługiwane żądanie; nie wynika samo z VS, OVS ani z ID wariantu.

Przepływ jest następujący:

~~~text
source text + morphology
  → LanguagePlugin.analyze (bounded grammar variant + optional surface evidence)
  → bridge maps syntax to semantic roles
  → validated MeaningGraph
  → distinct semantic readings
  → target LanguagePlugin.realize (target's own licensed default)
~~~

Wariant źródłowy nie wybiera kolejności docelowej. Analiza, która nie potrafi uzasadnić przypisania ról albo cech formy, zwraca kontrolowaną niejednoznaczność lub odmowę zamiast zgadywać.

## Ścisła równoważność CORE

Relacje poniżej są klasyfikacją porównania zaakceptowanych MeaningGraphów; nie są klasyfikacją samych tekstów.

| Relacja | Kryterium |
| --- | --- |
| same-core | Walidowane MeaningGraphy mają ten sam typ i całe to samo znaczenie po kanonicznym uporządkowaniu kluczy. Zmiana kolejności słów, formy gramatycznej albo trace surface nie zmienia tej relacji. |
| same-core-with-presentation-difference | CORE jest identyczny, a niezależnie podane żądanie lub dowód presentation różni się między realizacjami. Sama pozycja składnika nie wystarcza do stwierdzenia różnicy topic/focus. W przyszłej macierzy pozostaje to same-core; presentation jest osobnym świadectwem, a nie nową relacją semantyczną. |
| different-core | Różni się choć jeden materialny element MeaningGraph, np. koncept/typ, mapowanie roli na uczestnika, jawny referent, liczba, określoność, deixis, czas, aspekt, negacja, voice albo scope. Zamiana agent/theme jest different-core, nawet gdy teksty zawierają te same leksemy. |
| ambiguous | Wejście ma co najmniej dwa różne, nadal zgodne MeaningGraphy i brak dowodu, który wybrałby jeden. Zwróć ograniczone alternatywy. To stan analizy, nie synonim wielu kolejności dla jednego CORE. |

Porównanie jest ścisłe: absent, unknown i jawna wartość nie są zamienne; unsupported i invalid nie są odczytaniami znaczenia. Brak jawnego identyfikatora referenta nie dowodzi, że dwie wzmianki odnoszą się do tego samego obiektu w świecie. Zgodność konceptu lub słowa nie wystarcza do połączenia referentów.

eventSemanticSignature kanonicznie porządkuje pola jednego eventu i pomija wyłącznie pole wersji. Jest użyteczny do porównania eventów o zwalidowanym kształcie, ale nie jest ogólnym dowodem równoważności logicznej dla stanów, pytań, scope ani wszystkich przyszłych rodzajów MeaningGraph. Surface evidence i żądanie presentation pozostają poza eventem; nie wolno dopisywać ich jako pól zmieniających semantyczną sygnaturę.

Jeżeli dwie analizy mają ten sam ścisły CORE, tworzą jeden odczyt semantyczny. Różne poprawne ślady wariantów nie mogą same powodować AMBIGUOUS_MEANING; powinny pozostać ograniczonym surface evidence. Jeśli grafy różnią się materialnie, scoring lub preferencja wariantu nie mogą ich scalić ani wybrać jednego bez dowodu.

## Opt-in format wariantu

Jedyną deklaracją szyku pozostaje frame.linearizations w istniejącym grammar.json. Obecne wpisy, czyli tablice slotów, zachowują znaczenie i kolejność. Nowy, jawny wariant jest obiektowym wpisem w tej samej tablicy; nie ma osobnego sidecar grammar ani listy wszystkich permutacji.

~~~json
{
  "language": "pl",
  "version": "1.0",
  "frames": {
    "event.visual_perception": {
      "linearizations": [
        ["agent", "@verb", "theme"],
        {
          "variantId": "theme-fronted",
          "sequence": ["theme", "@verb", "agent"],
          "realizationPreference": 20
        }
      ],
      "cases": {"agent": "nom", "theme": "acc"}
    }
  }
}
~~~

FWO-02 implements validation and compiled-plan output for this RFC. FWO-07 opts into the `ovs-theme-verb-agent` variant for the existing Polish `event.visual_perception` and `event.read` frames. This adds only those bounded Polish input forms; it does not change manifest capabilities or the default SVO realization. English has no opt-in object variants. The compiled plan stores explicit variants as an immutable construction index:

~~~json
{
  "language": "pl",
  "linearizationPlans": {
    "event.visual_perception": {
      "theme-fronted": {
        "sequence": ["theme", "@verb", "agent"],
        "realizationPreference": 20
      }
    }
  }
}
~~~

Each compiled language plan carries its language code and maps constructions to stable variant IDs, sequences, and preferences. The entire compiled plan, including this index, is deeply frozen. Runtime grammar frames retain their original array defaults. The analyzer reads opt-in sequences from the compiled construction index and applies them by named role slots; realization uses the first legacy array as its default. The compiler leaves the manifest and capabilities unchanged. Field shape and limits are:

- variantId jest jawnym, stabilnym ID wewnątrz pary język + konstrukcja; nie jest indeksem tablicy ani hashem zawartości. Pasuje do ^[a-z][a-z0-9.-]{0,63}$; zastrzeżone nazwy constructor i prototype są odrzucane. ID jest unikalne w ramie, a pełna tożsamość planu to language + construction + variantId.
- sequence zawiera 1–16 slotów już zdefiniowanych przez daną ramę i dozwolonych literałów gramatycznych. Wariant nie może dodać roli ani zmienić bridge mapping, przypadku, agreement, czasu, polaryzacji lub capability.
- realizationPreference to liczba całkowita 1–100; niższa liczba porządkuje alternatywne realizacje opt-in, gdy żądanie realizacji wymaga sekwencji bez zgodnego wariantu legacy. Nie rankinguje odczytań semantycznych i nie zastępuje domyślnej pierwszej tablicy. Remisy rozstrzyga stabilne variantId, nie pozycja wpisu.
- Wpis obiektowy ma dokładnie te trzy pola. Powtórzone ID, powtórzona sekwencja, nieznany slot, brak dokładnie jednego wymaganego @verb, powtórzona rola, niepoprawny token lub przekroczony limit to błąd walidacji. Deskryptor musi przestawiać sloty istniejącej tablicy w tej samej ramie; nie może dodawać ani usuwać roli, znacznika ani zmieniać mapowania bridge.
- Maksymalnie 8 wpisów linearization na jedną ramę, licząc wpisy stare i obiektowe. Nie generuje się permutacji kartezjańskich. Całe parsowanie nadal podlega istniejącym limitom: 16 analiz, 10 000 węzłów wyszukiwania i 16 384 jednostki UTF-16 tekstu. Wyczerpanie zwraca resource_limit, bez cichego ucięcia.

Malformed descriptors, duplicate IDs/sequences, invalid slots and inconsistent bridge roles fail compilation with `PLUGIN_GRAPH_INVALID`; a descriptor on a frame without an implemented semantic transfer fails with `PLUGIN_CAPABILITY_UNAVAILABLE`. Descriptor variants are indexed only under constructions with matching bridge transfer plans. The runtime plan stores `{sequence, realizationPreference}` by construction and variant ID; analysis reads those immutable sequences while role case and agreement remain tied to named frame roles.

## Target realization policy (FWO-06)

The target language always supplies its own realization order. A recognized source `analysis.surface` variant is evidence about the source parse; it is never forwarded as a target-order request. For an ordinary event, state, request, or modal clause, the first legacy array remains the preferred default, even when opt-in parser variants are declared. Realization does not emit every parser variant as target text.

An explicit supported information-structure request may select a compatible target sequence. For transfer-possession focus, the interpreter first chooses the earliest compatible legacy array. If none matches, it chooses a compatible opt-in variant by ascending `realizationPreference`, then stable `variantId`. Relation- and question-specific sequences use the same legacy-first rule and use the declared preference only when a compatible legacy sequence is absent. Unsupported requests retain a typed `INFORMATION_STRUCTURE_UNSUPPORTED` refusal; they never silently change the requested meaning or presentation.

Wariant opisuje kolejność powierzchniową, a nie temat, focus, subject ani rolę CORE. Funkcja składniowa i przypadek nadal wynikają z językowego bridge/gramatyki. Jeśli przypadek nie rozróżnia kandydatów i nie ma innego dowodu, parser zachowuje różne MeaningGraphy jako ambiguitet.

## Opcjonalny ślad analizy LanguagePlugin

`analysis.surface` jest opcjonalnym, ściśle walidowanym polem metadanych analizy. Nie jest MeaningGraphem, nie deklaruje capability i nie zatwierdza oczekiwanego wyniku. Jego publiczny kształt to:

~~~json
{
  "analysis": {
    "surface": {
      "variants": [{
        "id": "theme-fronted",
        "construction": "event.visual_perception",
        "slots": [
          {"name": "theme", "start": 0, "end": 3},
          {"name": "@verb", "start": 4, "end": 9},
          {"name": "agent", "start": 10, "end": 21}
        ],
        "markedness": "unknown"
      }]
    }
  }
}
~~~

`id` pochodzi z jawnego deskryptora albo ze stabilnego ID linearizacji domyślnej; nigdy z indeksu tablicy. `slots` zawiera dopasowane nazwy ról, `@verb` lub `@auxiliary`. Zakresy są półotwarte i liczone w jednostkach UTF-16 tekstu źródłowego, więc dla wejścia „Psa widzi dziewczynka.” oznaczają `Psa` 0–3, `widzi` 4–9 i `dziewczynka` 10–21. Kontrakt ogranicza ślad do 32 wariantów oraz 16 slotów na wariant. `markedness` można pominąć albo podać jako `unknown`; kolejność nie jest dowodem topic ani focus. Brak śladu oznacza „nie podano”, a jego obecność nie zmienia równoważności CORE.

## Warianty rozważone

| Wariant | Decyzja |
| --- | --- |
| Dowolna permutacja slotów | Odrzucona: rośnie koszt wyszukiwania i liczba fałszywych odczytań; szyk nie zastępuje walencji, przypadka ani agreement. |
| Osobny rejestr wariantów | Odrzucony: dublowałby ramy i wymagałby uzgadniania dwóch źródeł prawdy. |
| Zastąpienie każdej tablicy linearizations nowym obiektem | Odrzucone: wymusza migrację istniejących pakietów. |
| Szyk, topic/focus albo case jako pola MeaningGraph | Odrzucone: miesza trace i składnię z neutralnym znaczeniem oraz może tworzyć fałszywą nierównoważność. |
| Ranking parsera wybiera jeden z różnych grafów | Odrzucony: ranking porządkuje wyłącznie odczytania o zachowanym dowodzie; nie jest rozstrzygnięciem semantycznym. |

## Testy, approvals i migracja

Expected MeaningGraph jest niezależnym oracle zapisanym wyłącznie w tests/cases/**. Review oczekiwanego znaczenia poprzedza uruchomienie silnika; output silnika nie zatwierdza sam siebie. FWO-09 może grupować zatwierdzone przypadki jako same-core albo different-core, porównując pełne znaczenie i wskazując różniące się ścieżki. Presentation trace jest osobnym świadectwem; nie osłabia porównania ani ochrony istniejących goldów. ambiguous, unsupported, znane luki, INFRA i NOT RUN raportuje się oddzielnie.

Migracja jest opt-in. Nie zmienia się obecnych wpisów tablicowych, manifestów, LanguagePlugin 1.0, globalnego CORE ani schematu profilu cech. Kompilator późniejszego zadania ma normalizować oba wpisy w jednej ramie i sprawdzać ich sloty względem istniejącej gramatyki oraz bridge. Samo dodanie wariantu nie aktywuje capability; do tego potrzebny jest działający analyze/realize, most ról i niezależne świadectwo. FWO-08 dostarcza ograniczony dowód ruchu: polskie „Samochód jedzie” i „Jedzie samochód” oraz angielskie „A car is moving” / „The car is moving”, wyłącznie dla `object.car`, 3. osoby liczby pojedynczej, czasu teraźniejszego i niedokonanego `jechać` oraz angielskiego present progressive. Polszczyzna nie koduje tu określoności, więc przekład PL→EN zachowuje alternatywy rodzajnika i jawnie raportuje utratę informacji. Nie wynika z tego obsługa innych sprawców, liczby mnogiej, angielskiego simple present ani nieograniczonego `event.movement`.

FWO-01 nie zmienia runtime, danych, schematów ani testów. Kompilacja i matrix dla tego zadania nie są uruchamiane; weryfikacją jest review ADR i zgodności RFC z aktualnymi grammar.json, bridge.json i profilem językowym.

## Wykonalność kolejnych zadań i granice A1

Opisany kontrakt daje ograniczony punkt wejścia dla sekwencji FWO bez migracji obecnych ramek:

- FWO-02 kompiluje wpisy tablicowe i obiektowe do jednego zamrożonego planu, waliduje ID i sloty oraz nie aktywuje capability samą obecnością wariantu. Żaden obecny pakiet PL/EN nie deklaruje jeszcze deskryptora.
- FWO-03 używa bieżącego bridge do przypisania ról CORE, funkcji składniowych, przypadków i agreement; kolejność slotów nie zmienia mapowania ról.
- FWO-04 porównuje kompletne, zwalidowane znaczenia. Zgodne grafy tworzą jeden odczyt z zachowanymi, ograniczonymi wariantami surface; różne grafy pozostają odrębnymi odczytaniami lub ambiguous.
- FWO-05 przekazuje opcjonalne `analysis.surface` przez LanguagePlugin i Engine bez nowego wymaganego interfejsu.
- FWO-06 realizuje domyślną kolejność docelową niezależnie od kolejności źródłowej. Jawny, obsługiwany wybór presentation pozostaje osobnym żądaniem.
- FWO-07 dodaje tylko lingwistycznie zatwierdzone warianty PL w już wspieranych ramach i zachowuje przypadek/agreement.
- FWO-08 utrzymuje ograniczenia EN; ruch pojazdu jest obsługiwany wyłącznie dla `object.car`, EN present progressive i PL `jechać/jedzie`, z działającym bridge, wariantem polskiego szyku S-V/V-S oraz zatwierdzonym dowodem capability.
- FWO-09 porównuje wyłącznie niezależnie zatwierdzone przypadki przez relacje same-core i different-core. Różnica presentation nie tworzy trzeciego semantycznego comparatora.
- FWO-10 może rozszerzyć macierz o wymagane przypadki i grupy, ale każdy expected MeaningGraph i każda decyzja o odmowie wymagają osobnego review. Sam kontrakt nie dowodzi realizacji DoD ani minimalnej liczby przypadków.

Poza bounded A1 pozostają dowolne permutacje szyku, automatyczne odgadywanie topic/focus z kolejności lub prozodii, pełne wnioskowanie dyskursowe/coreference, przypadkowe inwersje EN, konstrukcje bez capability i pełne pokrycie CEFR A1. Referenty, aspekt, określoność i informacja o stracie pozostają jawne także wtedy, gdy target nie może ich naturalnie wyrazić.

## Źródła inspiracji (bez zależności i kopiowania zasobów)

- [Universal Dependencies: simple clauses](https://universaldependencies.org/u/overview/simple-syntax.html) — relacje składniowe i przypisanie argumentów pozostają zależne od kryteriów języka.
- [Grammatical Framework tutorial](https://www.grammaticalframework.org/doc/tutorial/gf-tutorial.html) — rozdział abstract syntax i concrete linearization.
- [Abstract Meaning Representation](https://amr.isi.edu/) i [FrameNet](https://framenet.icsi.berkeley.edu/) — wyłącznie punkty odniesienia podane w planie; nie importujemy typów, danych ani licencji.
- [Prague Dependency Treebank](https://ufal.mff.cuni.cz/pdt2.0/doc/manuals/en/t-layer/html/index.html) — topic/focus jest osobno anotowanym wymiarem, a nie domyślnym polem szyku w MeaningGraph.

Wzorce te nie są runtime dependency, deklaracją pokrycia flexLingua ani zgodą na kopiowanie ich korpusów lub schematów.
