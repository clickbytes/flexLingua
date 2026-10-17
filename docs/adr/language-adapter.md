# Kontrakt adaptera językowego 1.0

CORE przechowuje niezależną od języka semantykę INTER. `Engine` rejestruje
adaptery po kodzie języka; para języków nie ma osobnego tłumacza. Wszystkie
przejścia wykorzystują analizę źródła do CORE i realizację CORE w celu.

Adapter składniowy tworzony przez `createRuleAdapter(dictionary,grammar)` ma
`contractVersion:'1.0'`, `code`, metody `analyze`, `analyzeCandidates`, `realize`,
`validateOntology` i `describe`. Jego opis musi podać zgodny `language` oraz
`grammarVersion`. Rejestracja odrzuca nieznany kontrakt, brak metod, kod
zarezerwowany `core`, duplikat i leksemy spoza ontologii. Konstruktor adaptera
wcześniej sprawdza zgodność wersji i języka danych gramatycznych, ramy,
linearizacje i inne deklaratywne reguły.

Adapter morfologiczny z `createMorphology(spec,dictionary,features)` ma osobny
`contractVersion:'1.0'`, `language`, `generate`, `analyze`, `paradigm`,
`availability`, `describe` i leksykon z walidacją CORE. Konstruktor kompiluje
paradygmaty i odrzuca nieznane cechy, błędne operacje i brakujące powiązania.
`Engine.morphologyAvailability({language,lexemeId,features,exact?})` raportuje
`supported:false` z powodem `unknown_lexeme`, `unsupported_feature` lub
`missing_or_blocked_cell`; nie tworzy formy na podstawie podobieństwa.

Obecne EN, PL i TR używają tej samej implementacji adaptera. Zakres TR jest
ograniczony do historycznej demonstracji i nie wynika z niego poziom CEFR.

Ten kontrakt opisuje API adapterów v1.0, ale nie mapowanie ról semantycznych CORE
na funkcje składniowe, kontrolery uzgodnienia i cechy formy. Wersjonowany most
oraz profile możliwości języka opisuje
[ADR ogólnego kontraktu cech językowych](generic-language-feature-contract.md).
Kontrakt v1.0 pozostaje kompatybilny; migracja nowej funkcji jest opt-in.

`createRuleAdapter(dictionary, grammar, {featureProfile})` może dodatkowo
otrzymać wersjonowany profil `LanguageFeatureProfile` 1.0. Jeśli definiuje on
`syntactic.case`, gramatyka i morfologia walidują nazwy przypadków względem tego
inwentarza. Jeśli wymiaru brakuje, język jest bezprzypadkowy: szyk ramy
identyfikuje role, a konfiguracja nie wymaga końcówek przypadków.

`createRuleAdapter` deklaruje także `textProfile` w adapterze i jego opisie:
wersję `1.0`, kanoniczne locale BCP 47, normalizację `NFC`, lokalne
`toLocaleLowerCase` oraz segmentację `unicode-whitespace-v1`. Wspólny tokenizer
dzieli tokeny na białych znakach Unicode i zachowuje apostrofy wewnętrzne,
przecinki oraz span UTF-16 względem oryginalnego wejścia. Nie wykonuje
segmentacji słów dla języków bez spacji; nieznany profil segmentacji jest
odrzucany zamiast zastępowany domyślną regułą.

Rama zdarzenia może deklarować lokalne kontrolery uzgodnienia, np.
`"agreement": {"number": "theme.number"}`. Ścieżka `object.number` jest
aliasem `theme.number`. Poza zachowanymi korzeniami `subject` i `event`, ścieżka
musi wskazywać rolę danej ramy albo `possessor` odczytywany z typowanych
posiadaczy NP. Brak kontrolowanej cechy
powoduje odmowę realizacji/analizy, a kilka sprzecznych wartości `possessor`
nie wybiera arbitralnie jednej z nich. Lokalna deklaracja zastępuje kontroler
globalny dla tego samego wymiaru formy w tej ramie.

Ontologia zdarzenia może jawnie oznaczyć podzbiór `roles` jako `optionalRoles`;
pozostałe role są wymagane, a brak pola zachowuje dotychczasową regułę „wszystkie
role wymagane”. Linearizacja może pominąć rolę opcjonalną lub zawierać ją raz.
Obecny CORE zachowuje przekazany argument nawet wtedy, gdy docelowa linearizacja
nie ma dla niego wykładnika. Ponowna analiza samego tekstu może go nie odzyskać.

Rama może zadeklarować składniowy znacznik `@expletive` przez
`formalSubject: {surface, agreement}`. Parser zużywa `surface`, a `agreement`
steruje wyłącznie zgodą formy; żadne z tych pól nie tworzy encji ani referenta
CORE. Nieoznaczony `@expletive` i formalny podmiot bez deklaracji są odrzucane.

Kolejność wewnątrz kwalifikowanej frazy nominalnej jest deklarowana w
`nounPhrase.qualified.layouts`. Każdy layout ma dokładnie jeden slot `noun`;
`modifiers` może stać przed lub po nim. `adjectivePlacement: "layout"` pozwala
poszczególnym layoutom deklarować oba szyki, a `before`/`after` ogranicza je do
jednego. `degreePlacement` wybiera pozycję stopnia względem przymiotnika. Parsowanie
próbuje tylko ograniczoną listę layoutów, a generacja używa domyślnego lub
wybranego przez `layoutByQuantifier`. Starsze `adjectiveOrder` i `degreeOrder`
pozostają zgodne dla istniejących pakietów.
