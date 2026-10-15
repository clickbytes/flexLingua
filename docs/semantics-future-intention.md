# Future events, aspect and intention

The event feature `tense` includes `future`, independently of `aspect`. A future
event can be asserted (`will` / a Polish future form) or placed under
`modality.intention` (English `be going to`, Polish `zamierzać`). Intention
wraps an affirmative future event; it is not another tense or an aspect value.

```js
const future = createEvent('event.read', roles, {
  tense: 'future', polarity: 'positive', aspect: 'imperfective'
});
const plan = createModality('modality.intention', future);
```

The bounded Polish future rules use the lexeme's declared aspect: imperfective
events use `będę` + infinitive; perfective events use the configured finite
forms. English `will` does not encode Polish aspect. Therefore English-to-Polish
asserted futures are refused when the source leaves aspect unknown. The engine
does not choose `will` or `be going to` on its own: intention is retained only
when that construction is present in the source.

Only configured lexemes and agreement forms are covered. This is not a complete
account of Polish aspect, all English future readings, predictions, promises,
conditional plans, or tense backshift.
