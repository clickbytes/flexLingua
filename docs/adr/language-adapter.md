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

Rama zdarzenia może deklarować lokalne kontrolery uzgodnienia, np.
`"agreement": {"number": "theme.number"}`. Ścieżka `object.number` jest
aliasem `theme.number`. Poza zachowanymi korzeniami `subject` i `event`, ścieżka
musi wskazywać rolę danej ramy albo `possessor` odczytywany z typowanych
posiadaczy NP. Brak kontrolowanej cechy
powoduje odmowę realizacji/analizy, a kilka sprzecznych wartości `possessor`
nie wybiera arbitralnie jednej z nich. Lokalna deklaracja zastępuje kontroler
globalny dla tego samego wymiaru formy w tej ramie.
