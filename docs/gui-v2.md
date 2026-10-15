# flexLingua Studio — GUI v2

**Status:** interfejs użytkownika (bez zmian semantyki, słownika lub zasad gramatycznych).

## Zakładki

1. **Tłumaczenie** — dwa panele (źródło i wynik), jawny wybór języka, zamiana kierunku, opcjonalny kontekst znaczeniowy, ostrzeżenia i alternatywne wyniki. Dawne demonstracje przeniesiono do rozwijanej biblioteki przykładów.
2. **Słownik i odmiany** — podanie **jednego słowa** i **języka PL albo EN**; automatyczne wykrywanie języka celowo nie istnieje. Formularz znajduje kanoniczne hasło albo rozpoznaną formę (np. koty → kot, children → child). Pokazuje wszystkie zadeklarowane komórki paradygmatu w tabelach pogrupowanych po liczbie lub czasie, z cechami gramatycznymi i źródłem formy (reguła/wyjątek).
3. **INTER Explorer** — widok hierarchiczny znaczenia zwróconego przez ostatnie tłumaczenie oraz niezmieniony JSON dostępny do kopiowania. Niczego nie interpretuje ponownie.
4. **Pokrycie reguł** — dynamiczny przegląd paradygmatów PL/EN, ich komórek, leksemów z przypisaną morfologią i wpisów wygenerowanych form, pobierany z aktywnych pakietów. Przycisk przy wzorcu otwiera w słowniku prekonfigurowaną próbę odmiany. To **inwentarz techniczny**, nie certyfikat CEFR ani miernik procentowego pokrycia całego języka.

## Zachowanie wyszukiwarki

- Dopasowanie obejmuje Engine.lookupLexemes({ language, lemma }) i Engine.analyzeForm({ language, text }). Wyniki są deduplikowane po **identyfikatorze leksemu**, dzięki czemu homonimy/sensy nie są arbitralnie łączone.
- Każdy pasujący leksem z dostępną morfologią wyświetla **wszystkie** faktycznie wygenerowane formy z Engine.inspectParadigm({ language, lexemeId }), w tym warianty i wyjątki. Nie ma sztucznego dopisywania nieobsługiwanych komórek.
- Cechy przy formach, w tym **Osoba** i **Liczba**, pochodzą z wyniku Engine i są wyświetlane z polskimi etykietami. Formy 1./2. osoby pojawiają się tylko wtedy, gdy deklaruje je paradygmat danego leksemu.
- Jeśli brak leksemu i brak rozpoznania formy: **Not found in dictionary**. Jeśli leksem istnieje, lecz nie ma przypisanego paradygmatu: wyraźna informacja **Brak paradygmatu**. To dwa różne przypadki.
- Liczba form zależy od danych. Wersja kontrolowana nie jest pełnym słownikiem języka polskiego ani angielskiego.
- Dawny techniczny inspektor morfologii (ID leksemu, konkretna komórka, analiza słowa) pozostaje w sekcji **Zaawansowane**.
- Wyszukiwarka nie modyfikuje żadnego słownika, nie importuje danych, nie wywołuje sieci i nie wpływa na tłumaczenie.

## Eksperymentalna odmiana wyrazów spoza słownika

W zakładce **Słownik i odmiany** checkbox **„Próbuj odmieniać słowa spoza słownika”** jest domyślnie wyłączony. Gdy wyraz nie występuje w słowniku:

1. Włącz checkbox, świadomie wybierz istniejący paradygmat dla wybranego języka (bez automatycznego odgadywania części mowy).
2. Podaj **temat fleksyjny**. To nie zawsze lemat — np. `lampa` wymaga tematu `lamp`. Dla klas z więcej niż jednym tematem (czasowniki, niektóre przymiotniki) pojawiają się dodatkowe pola. Nieuzupełnione komórki są pomijane.
3. Po kliknięciu „Pokaż odmiany” system zastosuje **już zaimplementowane operacje** morfologiczne do wskazanego tematu, ale oznaczy wszystkie wyniki jako **HIPOTEZA · NIEZWERYFIKOWANE**. Nie dopisze nowego leksemu do słownika, nie przypisze mu znaczenia CORE i nie będzie używał próbnych form do tłumaczeń.

Przykłady ograniczone: polskie fikcyjne `fotokot` z `pl.noun.masc_animate` i tematem `fotokot` może wygenerować `fotokota`. Angielskie `widget` z `en.noun.regular` i tematem `widget` może dać `widgets`. To **przykłady zastosowania reguł**, a nie gwarancja poprawności polskiej lub angielskiej fleksji.

**Audyt danych w repozytorium (2026-10-12):** polski: 9 paradygmatów i 30 przypisań leksemów; angielski: 5 paradygmatów i 30 przypisań. Pokrycie nie obejmuje pełnego systemu gramatycznego żadnego z tych języków; szczególnie polskie wyjątki, alternacje tematów, rodzaje i klasy czasowników wymagają dalszych danych. Nie wolno tego trybu traktować jak uniwersalnej odmieniarki.

Generowanie próbnych form korzysta wyłącznie z `executeOperations` i istniejących paradygmatów w `Engine.morphology(language)`. W interfejsie znajdują się wyłącznie kontrolki, ich obsługa i prezentacja. Reguły i słowniki nie są modyfikowane.

## Nawigacja po wzorcach i diagnostyka (GUI)

- Tryb eksperymentalny może filtrować zarejestrowane paradygmaty wg części mowy **NOUN / VERB / ADJ**, aby użytkownik nie musiał przeglądać wszystkich schematów naraz.
- Po ręcznym wyborze wzorca panel pokazuje **przykłady prawdziwych haseł** z tym samym identyfikatorem paradygmatu (`inspectParadigm`), liczbę komórek oraz wymagane dodatkowe tematy fleksyjne. Nie jest to automatyczne przypisywanie nowego słowa do klasy.
- Przy rzeczownikach panel porównuje formę podstawową wygenerowaną przez wybrany wzorzec z wpisanym hasłem i wyświetla ostrzeżenie w razie niezgodności. Zgodność **nie dowodzi poprawności** innych odmian.
- Pominięte komórki mają osobną tabelę z cechami i komunikatem błędu istniejącej operacji. Można skopiować tekst hipotez wraz z cechami (zawsze z adnotacją „niezweryfikowane”).
- INTER Explorer wyświetla teraz także graficzną strukturę pytań `type: question` z treścią `proposition` oraz typem pytania. Biblioteka przykładów tłumaczenia ma przycisk „Pytania · PL/EN”.
- Zsynchronizowano wersję offline z nowym parserem/generatorem pytań znajdującym się na `main`. Synchronizacja artefaktu nie modyfikuje zasad gramatycznych i nie oznacza pełnej walidacji ich poprawności.

**Uwaga:** podpowiedzi w GUI mają charakter *przykładów porównawczych*, a nie predykcji klasy leksykalnej; automatyczny dobór paradygmatu i uzupełnianie nieznanych tematów pozostają pracą silnika językowego.

## Porównywanie dwóch schematów odmiany

Po włączeniu eksperymentalnej odmiany można zaznaczyć **„Porównaj z drugim schematem”** i wskazać drugi paradygmat *tej samej części mowy*. Oba paradygmaty otrzymują ten sam ręcznie podany temat i ewentualne dodatkowe tematy. GUI wywołuje dotychczasowe operacje morfologiczne dla każdego schematu oddzielnie, a następnie zestawia **tylko odpowiadające sobie zestawy cech gramatycznych**:

- **Takie same** — wynik zapisu jest identyczny; nie oznacza to potwierdzenia poprawności formy.
- **Różne** — oba wzorce zwróciły inne formy dla dokładnie tych samych cech.
- **Brak wspólnej formy** — komórka nie występuje w jednym wzorcu albo nie udało się jej wygenerować bez brakującego tematu.

W porównaniu widnieje ostrzeżenie, gdy drugi wzorzec nie odtwarza wpisanego hasła w komórce podstawowej. Nie ma automatycznej identyfikacji części mowy, wyboru najlepszego schematu, poprawiania rdzeni ani importowania hipotez do słownika.

## Pokrycie reguł — znaczenie liczników

W nowej zakładce liczby pochodzą w czasie działania z `Engine.morphology(language).describe()`, `lexicon.entries`, `paradigms` i `Engine.inspectParadigm()`. Nie są ręcznie wpisane do HTML.

- **Paradygmaty** — liczba zarejestrowanych klas odmiany.
- **Leksemy z morfologią** — liczba przypisań leksemów zwracana przez `describe()`.
- **Wpisy wygenerowanych form** — liczba rekordów powierzchniowych, obejmująca komórki i warianty; nie jest to liczba unikatowych słów ani poziom biegłości.
- **Wszystkie leksemy pakietu** — liczba wszystkich leksemów z danych dla danego języka, także bez produktywnej odmiany.
- W tabeli wzorców podano liczbę obsługiwanych komórek i haseł z istniejącymi formami oraz przykłady. Wzorce bez przypisanych haseł również pozostają widoczne.

Akcja **„Przetestuj wzorzec”** otwiera formularz słownika z ręcznie wybranym językiem, częścią mowy i wzorcem. Nie wpisuje automatycznie słowa ani nie twierdzi, że wzorzec będzie dla niego poprawny.

## Podgląd INTER i alternatywnych odczytań

- Inspektor pokazuje niezmieniony graf wybrany przez silnik. W dyskursie rozwija identyfikatory encji do ich pojęć i cech, zachowując widoczny identyfikator referentu przy roli.
- Każdy dostępny alternatywny sens lub czas ma własny graf semantyczny obok wybranego odczytania; dane alternatywy nadal pochodzą z `Engine.translate`.
- Widok pokazuje cechy czasu, aspektu i negacji oraz operator i docelową rolę pytania. Nie wylicza ponownie znaczenia.
- Odmowy silnika z kodem, np. błędny CORE JSON, wyświetlają ten kod obok komunikatu.

## Granica odpowiedzialności

Zmiany GUI dotyczą index.html, js/ui/studio.js i tylko minimalnych wywołań widoku z js/main.js. Nie ingerują w js/core/, js/languages/, data/, API silnika ani algorytmy. Zakładki są dostępne z klawiatury (strzałki, Home, End), pola są opisane, a ekrany responsywne.

## Uruchamianie i walidacja

Interfejs działa przez lokalny serwer HTTP i nie wymaga usług zewnętrznych. Otwieranie `index.html` przez `file://` nie jest obsługiwane. Uruchom `start.bat` w Windows albo `npm run dev`, a następnie wykonaj:

    npm test
    npm run check:release

GUI ma odrębne testy `tests/studio-ui.test.js`, które weryfikują pobieranie rzeczywistych odmian PL/EN, wejściowe formy fleksyjne, brak hasła, zakładki, porównania paradygmatów, pokrycie reguł i wizualizację. Testy istniejących zachowań w `tests/ui.test.js` pozostają aktywne.
