# ADR: time deixis is separate from event tense

## Decision

Keep grammatical event tense in `event.features.tense`. Store an optional, independently validated `timeReference` on the event for a small deictic set: `today`, `tomorrow`, `yesterday`, and `unspecified`. These values map to the ontology concepts `time.today`, `time.tomorrow`, `time.yesterday`, and `time.unspecified`.

Language packages declare the surface words. English uses `today/tomorrow/yesterday`; Polish accepts `dziś/dzisiaj`, `jutro`, and `wczoraj`, and realizes the first accepted spelling. Parsing a time word does not infer past or future tense. An absent time reference means the source did not specify one; unrecognized time expressions are refused. An adapter that cannot express a known reference refuses realization rather than dropping it.

## Consequences

An event can retain present tense with `tomorrow`, or past tense with `yesterday`, without conflating morphology and calendar deixis. The field is optional, so older event documents retain their current shape. This controlled set does not model dates, clock times, durations, zones, or absolute anchors.
