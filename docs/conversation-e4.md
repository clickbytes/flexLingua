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

## Opcjonalny lokalny zapis faktów

`MemoryStore` z `js/core/memory-store.js` wymaga lokalnego adaptera `getItem`/`setItem`/`removeItem` (np. `localStorage`). Zapis i odczyt są domyślnie wyłączone; wywołanie `enable()` lub konstrukcja z `enabled:true` oznacza świadome włączenie. `save(snapshot)` zapisuje wyłącznie `snapshot().memory`, `load()` zwraca zwalidowany snapshot, a `delete()` usuwa lokalną kopię również po `disable()`. Runtime nie tworzy adaptera sieciowego i niczego nie wysyła ani nie loguje.

```js
import {MemoryStore} from './js/core/memory-store.js';
const store=new MemoryStore({storage:localStorage});
store.enable();
store.save(session.snapshot().memory);
const saved=store.load();
if(saved)session.importMemory(store.export(saved));
store.delete();
session.clearMemory();
```

`session.exportMemory()` i `session.importMemory(json)` obsługują przeniesienie samych faktów; historia tur pozostaje w bieżącej sesji. Import jest atomowy, wymaga zgodnego `maxFacts` i odrzuca nieznane wersje. Bieżąca wersja formatu to `1`; import rozpoznaje też starszy, bezwersyjny snapshot `{factCount,maxFacts,facts}`. Plik może zawierać tekst wypowiedzi użytkownika, dlatego zapis powinien być włączany tylko świadomie. `clearMemory()` usuwa fakty z sesji, a `delete()` usuwa kopię z adaptera; gwarancja fizycznego usunięcia nośnika zależy od adaptera.

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

W chwili sporządzenia tego raportu `npm test` i `npm run check:release` nie były dostępne w lokalnym środowisku; późniejsze pełne release runy przeszły. Kontrola standalone i synchronizacja offline zostały wycofane.
