# v1.19 — zadania 4 i 5: pytania PL ↔ INTER ↔ EN

**Status:** implementacja kontrolowanych konstrukcji pytających w pakietach PL i EN.  
**Nie oznacza:** pełnego parsera swobodnej mowy ani zamknięcia całego Batch B / wydania v1.19.  
**Odpowiedzialność:** tylko silnik, konfiguracja gramatyczna, testy i dokumentacja; GUI należy do drugiego agenta.

## Cel i architektura

Przykładowy przepływ:

~~~text
Does the girl see the dog?
  → {type:"question",questionType:"yes_no",proposition:{...}}
  → Czy dziewczynka widzi psa?

Co widzi dziewczynka?
  → {type:"question",questionType:"wh",targetRole:"theme",proposition:{...}}
  → What does a girl see? (alternatywa: What does the girl see?)
~~~

Tłumaczenie zachodzi **wyłącznie przez INTER**. Gramatyka PL/EN nie przechowuje par gotowych przetłumaczonych zdań. Reużywa wspólnego parsera ról, słownika CORE, reguł odmiany czasowników, fleksji rzeczowników i realizatora fraz nominalnych.

## Aktualny zakres

| Forma | Angielski | Polski | Znaczenie INTER |
| --- | --- | --- | --- |
| Pytanie tak/nie | Does the girl see the dog? | Czy dziewczynka widzi psa? | `yes_no`, present |
| Pytanie o agenta | Who sees the dog? | Kto widzi psa? | `wh`, `targetRole:agent` |
| Pytanie o temat | What does the girl see? | Co widzi dziewczynka? | `wh`, `targetRole:theme` |
| Przeszłość | Did the girl see the dog? | Czy dziewczynka widziała psa? | `yes_no`, past |
| Przeczenie | Does the girl not see the dog? | Czy dziewczynka nie widzi psa? | `yes_no`, negative |
| Negowane pytanie o temat | What does the girl not see? | Czego nie widzi dziewczynka? | `wh`, `targetRole:theme`, negative |
| Liczba mnoga | Do the girls see the dog? | Czy dziewczynki widzą psa? | plural |
| Więcej ról | What did the boy give the girl? | Co dał chłopiec dziewczynce? | `theme` w 3-argumentowym zdarzeniu |

Wszystkie przykłady wymagają **zdefiniowanych leksemów oraz wspieranych paradygmatów i ram zdarzeń**; nie wspierają automatycznie dowolnego słowa ani pytania.

### Polski

Deklaratywna konfiguracja `data/grammar/pl.json` określa:

- partykułę `czy` przed zdaniem bazowym;
- znacznik `kto` dla pytania o `agent`, wraz z syntaktyczną zgodą trzeciej osoby liczby pojedynczej;
- znaczniki `co` (biernik) i `czego` (dopełniacz, np. pod negacją) dla `theme`;
- kontrolowany szyk pytania o obiekt: znacznik + czasownik + podmiot (+ inne role).

Brakująca pytana rola jest syntaktycznym `gap`; nie zapisujemy w CORE fikcyjnego przedmiotu ani osoby. Zgodność rodzaju gramatycznego dla `kto` służy **wyłącznie odmianie polskiego orzeczenia**, nie jest odgadywaniem płci niewiadomej osoby.

### Angielski

`data/grammar/en.json` określa:

- `do/does/did` i formę bazową czasownika dla pytań tak/nie oraz `what` jako pytania o obiekt;
- brak `do` w prostym, dodatnim pytaniu o podmiot: `Who sees ...?`;
- negację bez skrótów: `Does the girl not see ...?` / `Who does not see ...?`;
- zależność `does`/`do` od liczby podmiotu.

Rozpoznawanie i realizacja pytań korzystają z tej samej ontologii zdarzeń co zdania oznajmujące. Odrzucamy błędną zgodność `Does the girls ...?` zamiast ukrycie jej poprawiać.

## Określoność i niejednoznaczność

Polskie `Czy dziewczynka widzi psa?` nie rozstrzyga, czy po angielsku potrzebne jest `a` czy `the`. Dlatego obecny jawny **domyślny wybór prezentacyjny** to:

~~~text
Czy dziewczynka widzi psa?
→ Does a girl see a dog?
Alternatywa: Does the girl see the dog?
~~~

INTER nadal przechowuje `definiteness:'unknown'`, a API zwraca informację o niepewności; to nie jest nowe przypisanie znaczenia. Analogicznie zachowywane są alternatywne znaczenia słów takich jak `bank`.

## Co nie jest obsługiwane

- `where`, `when`, `how`, `which`, `whom`, pytania pośrednie i wielokrotne luki typu „kto co...”;
- język naturalny wokół złożonych `scope`, `coordination` i `complement` jako propozycji pytania (sam typ CORE może je reprezentować, realizator zdań pytających obsługuje na razie tylko pojedynczy `event`);
- pytania z czasem przyszłym, modalnością, skróty angielskie (`doesn't`) i potoczne niekanoniczne szyki;
- dowolne wielozdaniowe ciągi mieszające `?` oraz `.` jako jedną wypowiedź;
- nieudokumentowane angielskie `who` w roli dopełnienia, np. `Who does the girl see?` (to nadal luka dla kolejnego etapu).

Niekompatybilna składnia daje **diagnostykę nieobsługiwanej konstrukcji**. Przykładowe pytania nie są dowodem pełnego pokrycia A1 ani Oxford 3000.

## API i kompatybilność

~~~js
engine.analyze({text:'Who sees the dog?',from:'en'}); // question -> wh targetRole agent
engine.translate({text:'Co widzi dziewczynka?',from:'pl',to:'en'});
engine.realize({interlingua:question,to:'core'}); // JSON
engine.capabilities().languages; // support.questions dla PL/EN
~~~

Dodatkowe funkcje adaptera: `analyzeQuestionCandidates(text)` i `realizeQuestion(node)`. Poprzednie `analyzeCandidates`, `analyze`, `realize`, `translate`, `tryTranslate` i CORE JSON nadal działają. Gramatyka turecka nie otrzymała pytań w tym batchu.

## Testy i status weryfikacji

~~~sh
npm run check:questions
npm test
npm run check:release
~~~

- `tests/fixtures/gold-questions-v1.19.json`: 12 przypadków EN→PL, 10 PL→EN, 9 świadomie odrzucanych przykładów; autorski materiał testowy.
- `tests/questions-translation.test.js`: złote przykłady, rolę pytaną, czas, polaryzację, zgodność semantyczną po analizie wyniku, niepewność rodzajników, wieloznaczność, walidację reguł i niewspierane pytania.
- `tests/question-semantics.test.js`: kontrakt CORE i nowe możliwości realizacji pytań.
- Przed publikacją kod i konfigurację wykonano w izolowanym środowisku JS z aktualnymi źródłami repozytorium: **16 przykładów podstawowych, 10 dodatkowych pozytywnych, 11 negatywnych oraz 8 z pełną morfologią** zwróciło oczekiwane wyniki. To **nie jest** wynik pełnego uruchomienia Node `npm test`.

**Ważne dla GUI/offline:** nie zmieniamy `index.html`, `index-standalone.html` ani modułów GUI. Właściciel GUI musi zsynchronizować standalone z nowym silnikiem i wykonać jego testy przed pełnym wydaniem offline. Dlatego całe v1.19 pozostaje etapem w toku.

Powiązane: [semantyczny kontrakt pytań](questions-v1.19-semantic.md) · [kryteria Batch B](batch-b-v1.19.md) · [ROADMAP](../ROADMAP.md).
