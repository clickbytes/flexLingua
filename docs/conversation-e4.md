# E4 — pamięć operacyjna rozmowy (`ConversationContext`)

**Data:** 2026-10-14  
**Status:** mały batch silnika, niezależny od GUI, brak trwałego storage i brak LLM.

## API

```js
import {ConversationContext} from './js/core/conversation.js';

const session=new ConversationContext(engine,{maxEvents:8});
session.translate({text:'The girl sees the dog.',from:'en',to:'pl'});
const result=session.translate({
  text:'She sees the cat.',from:'en',to:'pl',
  pronounRealization:'safe'
});
// result.text === 'Ona widzi kota.'
// result.eventCount === 2
const snapshot=session.snapshot();
session.reset();
```

Obiekt `ConversationContext` istnieje tylko w pamięci pojedynczego procesu i **nie zmienia stanu zwykłego `Engine`**. Dwie instancje sesji nie współdzielą pamięci. `reset()` usuwa historię, `snapshot()` zwraca defensywną kopię neutralnej semantyki CORE (event lub discourse).

## Gwarancje

- Każde wywołanie `translate()` przyjmuje dokładnie **jedno wspierane zdanie oznajmujące** i zwraca wynik dla tej jednej wypowiedzi. Poprzednie zdania są kontekstem wewnętrznym, nie są ponownie zwracane w tekście.
- Stan sesji zawiera 2–8 (domyślnie 8) maksymalnych zdarzeń. Po dojściu do limitu nie ma niejawnej eksmisji ani zapomnienia; `tryTranslate()` zwraca `CONTEXT_LIMIT`, a użytkownik może wywołać `reset()`.
- Nowy zaimek `he/she` lub `on/ona` korzysta tylko z **jednoznacznej istniejącej tożsamości** w poprzednich zdarzeniach. Dwie różne osoby pasujące do tej formy powodują `AMBIGUOUS_ANAPHORA`, a brak poprzednika `UNRESOLVED_ANAPHORA`.
- Zbieżna pisownia rzeczowników nie oznacza współdzielenia tożsamości. Niezależne wywołania `The girl...` tworzą niezależne encje, dopóki nie zbudowano jawnej relacji.
- Wieloznaczny nowy odczyt (`bank`) nie jest cicho zapisywany w pamięci. `AMBIGUOUS_CONVERSATION_READING` wymaga jawnych ograniczeń znaczenia, np. `context:{senses:{theme:'place.financial_institution'}}`.
- Operacja jest **transakcyjna**: przy błędzie analizowania, walidacji lub generowania tekstu nie zmieniamy zapisanej historii. Niebezpieczne i nieobsługiwane linki `context.coreference` między turami nie są przyjmowane w E4.
- Opcjonalna `pronounRealization:'safe'` realizuje zaimek docelowy tylko przy **jednym** jednoznacznym poprzednim ID pasującym do powierzchniowej formy. Domyślny `repeat` pozostaje bez zmian.
- `conversation` w wyniku tłumaczenia i `snapshot().interlingua` to neutralny dokument `discourse`, z oryginalnym znaczeniem i jawnie współdzielonymi rolami. Nie przechowuje tokenów `she` ani `ona` jako encji.

## Ograniczenia

To nie jest długoterminowa pamięć, baza wiedzy, historia czatu ChatGPT, ani pamięć osobowości. Stan nie jest zapisywany na dysk, nie jest automatycznie dostępny innej instancji i nie ma automatycznej dedukcji faktów. Nie ma pytań, wielowyrazowych wypowiedzi zagnieżdżonych ani wielu zdań w jednej turze sesji. Każdy etap zostaje ograniczony do obsługiwanych `event`; nie obejmuje całej gramatyki INTER.

## Testy i publikacja

`tests/conversation-e4.test.js`: 8 niezależnych grup obejmujących polsko-angielskie przełączenia języków, rozstrzyganie antecedensu, brak zgadywania, polisemię, reset, limit, defensywne kopie snapshotu, brak pamięci między sesjami, rollback oraz wejście CORE. **8/8** przeszło w izolowanym środowisku JavaScript.

`npm test`, `npm run check:release` i `check:standalone` pozostają do uruchomienia w rzeczywistym Node 20+ (kontener ma Node, lecz brak DNS do github.com, a wcześniejszy GitHub Actions zwracał `startup_failure`). Synchronizacja offline należy do agenta GUI.
