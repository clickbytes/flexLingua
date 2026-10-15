# Kontrolowane akcje lokalne

`ActionRegistry` w `js/core/action-registry.js` przechowuje wyłącznie jawnie
zarejestrowane, deklaratywne skrypty lokalne. Definicja zawiera identyfikator,
zamknięty opis parametrów i sekwencję efektów `set` lub `increment` na kluczach
stanu przekazanych do konstruktora. Schemat JSON: `schemas/action.schema.json`.
Nie ma callbacków, `eval`, poleceń powłoki ani dostępu do sieci i systemu plików.
Nieznane pola i efekty są odrzucane przy rejestracji; tekstowe argumenty muszą
należeć do jawnej listy bez znaków poleceń.

`plan({id,args,decision})` wymaga ugruntowanego planu odpowiedzi z Conversation
Engine i zwraca przewidywany stan przed i po akcji. `execute()` przelicza ten
plan ponownie. `dryRun:true` zwraca plan bez zmiany stanu; rzeczywista zmiana
wymaga `authorized:true`. To jawny sygnał aplikacji wywołującej, nie system
tożsamości. Wynik oraz `snapshot()` są defensywnymi kopiami. Sam silnik nie
uruchamia akcji automatycznie na podstawie wypowiedzi lub tłumaczenia.

```js
const registry=new ActionRegistry({mode:'normal'});
registry.register({id:'setMode',
  parameters:{mode:{type:'string',enum:['normal','quiet']}},
  effects:[{op:'set',key:'mode',from:'mode'}]});
registry.execute({id:'setMode',args:{mode:'quiet'},decision:response.plan,
  dryRun:true});
registry.execute({id:'setMode',args:{mode:'quiet'},decision:response.plan,
  authorized:true});
```
