# Comparisons, preferences and polite requests

`comparison` keeps the compared subject, standard, property and relation in a
language-neutral structure. Surface order and comparative inflection are
configured in each language's lexicon and grammar. The current controlled
inventory covers greater/less comparisons for `quality.big` and `quality.small`
in the present tense.

```js
createComparison('quality.big', dog, cat, 'greater');
```

Likes, wants and preferences are separate event concepts. `event.liking` and
`event.desire` have an experiencer (`agent`) and target (`theme`);
`event.preference` adds explicit `preferred` and `alternative` participants.
They do not collapse into a generic positive/negative sentiment.

A polite request is a `dialogue_act.request` whose `action` is an affirmative
event addressed to the listener and whose politeness marker is explicit. The
configured forms are English `Please ...` and Polish `Proszę ...`. An
`modality.obligation` remains a command/requirement and cannot be passed as a
request action. Unsupported aspect or action forms are refused.

The parser does not cover all gradable properties, irregular comparative
paradigms, conditional requests, negative requests, or every social nuance of
`like`, `want` and `prefer`.
