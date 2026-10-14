# v1.19 / zadanie 3 — struktury pytań w INTER

**Stan:** typ pytania, walidator i wejście/wyjście CORE są wdrożone. Zadania 4–5 dodały również [kontrolowany parser i generator PL/EN](questions-v1.19-pl-en.md). Nadal nie ogłaszamy kompletnego wydania v1.19 ani swobodnego rozumienia dowolnych pytań.

## Format dokumentu

Pytanie jest osobnym węzłem INTER (`version:'1.19', type:'question'`), a nie zwykłym zdaniem ze znakiem `?`.

| Właściwość | Typ | Uwagi |
| --- | --- | --- |
| `questionType` | `yes_no` lub `wh` | Odrębny cel pytania |
| `proposition` | zdarzenie/wyrażenie semantyczne | Zachowuje czas, aspekt, negację i uczestników |
| `targetRole` | rola semantyczna | Występuje wyłącznie dla `wh`; np. `agent`, `theme` |

Pytania `yes_no` wymagają poprawnej, pełnej propozycji typu `event`, `coordination`, `scope` lub `complement`. Pytania `wh` wymagają zdarzenia, w którym **dokładnie jedna rola `targetRole` jest niewypełniona**. Pozostałe role muszą być poprawne ontologicznie. `targetRole` nie może pojawić się w `proposition.roles` jako fałszywa encja lub gotowa odpowiedź.

### Przykład — pytanie yes/no

~~~js
import {createEvent,createQuestion,participant} from './js/core/interlingua.js';

const features={tense:'past',polarity:'negative',aspect:'unknown'};
const full=createEvent('event.visual_perception',{
  agent:participant('person.girl','definite'),
  theme:participant('animal.dog','definite')
},features);
const didSheNotSeeTheDog=createQuestion(full);
~~~

### Przykład — pytanie o obiekt czynności

~~~js
const partial=createEvent('event.visual_perception',{
  agent:participant('person.girl','definite')
},features);
const whatWasNotSeen=createQuestion(partial,{
  questionType:'wh',targetRole:'theme'
});
~~~

Dla `wh` nie tworzymy sztucznej wartości `theme`; brak dokładnie tej roli jest jawnie zdefiniowaną niewiadomą. Można analogicznie pytać o `agent` lub inne role, **o ile są zadeklarowane w ramie ontologicznej danego zdarzenia**. Obecna ontologia nie gwarantuje obsługi wszystkich pytań „where/when”.

## API i ograniczenia

- `validateInterlingua(question,ontology,registry)` sprawdza wersję, dozwolone pola, kompletność ról, ontologię uczestników i zgodność cech.
- `engine.realize({interlingua:question,to:'core'})` serializuje pytanie do JSON.
- `engine.analyze({text:json,from:'core'})` waliduje odtworzony dokument.
- `engine.tryTranslate({text:json,from:'core',to:'en'})` realizuje obsługiwane pytania o pojedyncze zdarzenie. Pozostałe konstrukcje zwracają `UNSUPPORTED_CONSTRUCTION`.
- `engine.capabilities().questionDocumentVersion` wskazuje wersję `1.19`; dotychczasowy `interlinguaVersion:'1.0'` pozostaje zachowany dla starszych konsumentów API.
- Językowe `czy/kto/co/czego`, `do/does/did` i szyk słów są teraz regułami pakietów PL i EN, a nie polami semantyki CORE. Zakres jest kontrolowany, zobacz [zadania 4–5](questions-v1.19-pl-en.md).

## Testy i publikacja

Testy `tests/question-semantics.test.js` sprawdzają semantykę CORE, zakres operatorów, typy ról, JSON i integrację językową. Dodatkowe testy dwukierunkowe: `tests/questions-translation.test.js` oraz niezależne dane gold.

~~~sh
node --test tests/question-semantics.test.js
npm test
~~~

**Nie deklarujemy przejścia całego npm test bez wykonania go w Node.** Semantyka walidowana izolowanymi kontrolami nie jest zamiennikiem kompletnego testu regresji.

**Aktualizacja procesu:** dawny `index-standalone.html`, generator i kontrola parytetu zostały wycofane. UI działa przez lokalny HTTP; walidację silnika prowadzą testy i `npm run check:release`.

Powiązane: [kontrakt Batch B](batch-b-v1.19.md) i [roadmapa](../ROADMAP.md).
