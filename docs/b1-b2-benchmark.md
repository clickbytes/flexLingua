# B1 and B2 finite development samples

`data/coverage/b1-targets.json` and `data/coverage/b2-targets.json` are separate
target matrices. The project-authored fixture `tests/fixtures/gold-b1-b2.json`
contains **100 unique cases per level**: 50 EN→PL and 50 PL→EN. Each level has
five construction groups of 20 cases. Source sentences were expanded from
manually specified templates and lexical slots; this is not an independent
author split or a representative CEFR sample.

| Level | Construction groups | Expected negative cases |
| --- | --- | ---: |
| B1 | event relations, finite complements, discourse, polysemy, phraseology | 20 idiom refusals |
| B2 | passive, real conditionals, event relations, polysemy, phraseology | 20 idiom refusals |

`node --test tests/b1-b2-benchmarks.test.js` prints pass and total counts for
each construction and direction. A **pass** means the declared expectation was
met: semantic node/concept/relation or voice retained, two declared senses
exposed, or an unsupported idiom refused. It does **not** mean every input was
translated. The fixture checks bounded semantic behavior, not exact wording
quality, pragmatic adequacy, independent rater agreement or a full CEFR level.
The denominator for whole-level proficiency remains unknown.
