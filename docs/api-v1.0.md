# flexLingua v1.0 — public JS API (MVP)

**v1.01 extension:** [CORE lexical model, PL/EN mapping and CORE JSON as I/O](lexical-core-v1.01.md).

This is a **versioned MVP API**, not a full-coverage machine-translation API. No server, dependencies, or LLM are required.

## Loading

```js
import { Engine } from './js/core/engine.js';
import { createRuleAdapter } from './js/core/grammar.js';

const load = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};
const [ontology, features] = await Promise.all([
  load('./data/concepts.json'), load('./data/features.json')
]);
const engine = new Engine(ontology, features);
for (const code of ['en', 'pl', 'tr']) {
  const [dictionary, grammar] = await Promise.all([
    load(`./data/${code}.json`), load(`./data/grammar/${code}.json`)
  ]);
  engine.registerLanguage(createRuleAdapter(dictionary, grammar));
}
```

The browser UI loads this implementation through ES modules from the local development server. Direct `file://` opening is unsupported because browsers block the module and JSON requests.

## Core methods

| Method | Meaning |
|---|---|
| `registerLanguage(adapter)` | Validate and register one language implementation. Duplicate code is rejected. |
| `capabilities()` | JSON-serializable language inventory, parser/realizer support and schema versions. |
| `analyze({text,from,context?})` | Select one preferred semantic reading; no disambiguation promise. |
| `analyzeCandidates({text,from,context?})` | Return bounded semantic alternatives with scores and lexical senses. |
| `realize({interlingua,to})` | Generate target text, warnings and grammatical alternatives. |
| `translate({text,from,to,context?})` | Analyze → interlingua → realize; return semantic and grammar alternatives. Throws on unsupported input. |
| `tryTranslate(request)` | Same operation with `{ok:true,value}` or `{ok:false,error:{code,message}}`; suitable for UIs. |

```js
const result = engine.tryTranslate({
  text: 'The girl saw the dog.', from: 'en', to: 'tr'
});
if (result.ok) {
  console.log(result.value.text); // Kız köpeği gördü.
  console.log(result.value.interlingua);
} else {
  console.error(result.error.code, result.error.message);
}
```

Error codes are **coarse** categories: `UNSUPPORTED_LANGUAGE`, `UNSUPPORTED_CONSTRUCTION`, `INVALID_INPUT`. They do not provide stable subtypes or offsets. Returned errors are not auto-corrections. `context.topics` provides semantic topic hints and `context.senses` optionally constrains senses in one simple sentence.

## Semantic objects (v1.0)

Earlier event documents (`version: "0.2"`), qualified referents (`"0.5"`), relative clauses and conjunctions (`"0.6"`) remain valid. New nodes:

```json
{
  "version": "1.0", "type": "complement", "concept": "event.belief",
  "features": { "tense": "present" },
  "experiencer": {
    "concept": "person.girl",
    "features": { "number": "singular", "definiteness": "definite" }
  },
  "content": {
    "version": "0.2", "type": "event", "concept": "event.visual_perception",
    "roles": {
      "agent": { "concept": "person.boy", "features": { "number": "singular", "definiteness": "definite" } },
      "theme": { "concept": "animal.dog", "features": { "number": "singular", "definiteness": "definite" } }
    },
    "features": { "tense": "past", "polarity": "positive", "aspect": "unknown" }
  }
}
```

`createComplement(concept, experiencer, content, tense)` constructs this object. `createNegation(operand)` can wrap a complete event, a coordination or a complement as **wide negation**; the event's own `features.polarity` still represents local predicate negation. An explicit universal participant quantifier therefore remains inside or outside the operand as represented, but the project **does not implement general quantifier calculus**, inverse scope, distributivity or scope disambiguation.

Nesting and candidate counts are deliberately bounded. Cross-sentence coreference is never invented. Some source ambiguities or information lost by a target language cannot be restored.

## Adapter contract

`createRuleAdapter(lexiconJSON, grammarJSON)` implements `code`, `analyze`, `analyzeCandidates`, `realize`, `validateOntology`, `describe`, `parseComplementHeads` and `realizeComplement`. Most decisions are declarative. The shared JS interpreter implements syntax search, feature agreement, case selection and realization.

The grammar and lexicon schema is **v1.0** for EN, PL and TR. `data/features.json` stays on its own version (0.3), and the Interlingua nodes keep their individual serialization versions. Adding a new language does not require editing pairwise language translators, but it **does** require lexicon and grammar data, and must be tested for typological coverage.

## Supported constructions by adapter

| Capability | EN | PL | TR |
|---|---|---|---|
| Controlled 3rd-person subject/verb, basic past and present | Yes | Yes | Yes |
| SVO / case marking / SOV | SVO | SVO with limited alternatives | SOV |
| Negative finite clauses | Yes | Yes | Yes |
| Definite vs indefinite object marking | Articles | No article contrast | Case distinction, where configured |
| Quantified and modified noun phrases | Limited | Limited | Not yet |
| Bounded relative clauses | Limited | Limited | Not yet |
| Finite content complements (`believe/wierzyć`) | Yes | Yes | Not yet |
| Coordination | Yes | Yes | Limited |
| Explicit wide-scope negation | Yes | Yes | Not yet |

PL/EN complements are declaratively configured for the present/past belief predicate. PL past agreement accounts for feminine, masculine and plural classes. The v1.0 release did not implement matrix negation, speech reports, passives, questions or arbitrary nested constructions; later controlled question support is documented in the v1.19 extension below. Turkish suffixes in this prototype are **stored as forms in JSON**, not generated by a complete Turkish morphophonology engine.

## v1.19 extension — question documents in CORE JSON (semantic only)

The new `question` document has `version:'1.19'`, `questionType:'yes_no'|'wh'` and `proposition`. WH questions additionally declare `targetRole`; that role is **omitted** from `proposition.roles`. The validator checks ontology role typing and required participants. Tasks 4–5 now also implement controlled Polish/English interrogative surface parsing and realization over single-event propositions. Unsupported roles, free-form questions and non-event interrogative realization still report diagnostics.

API: `createQuestion(proposition, {questionType, targetRole})`, `validateInterlingua(question,...)`, `engine.analyze({from:'core',text:json})`, `engine.realize({to:'core',interlingua:question})`. Capability detection: `engine.capabilities().questionDocumentVersion === '1.19'`.

[Semantic question contract](questions-v1.19-semantic.md) · [PL/EN parser and generator, limits, tests](questions-v1.19-pl-en.md).

## v1.24 extension — dialogue acts in CORE JSON

The versioned dialogue_act envelope separates assert, ask, answer, confirm,
clarify and refuse from event semantics. Replies carry their question context
and typed content. DialogueContext checks bounded in-memory turn order. The
contract is advertised as
engine.capabilities().dialogueActDocumentVersion === '1.24'.

The schema and runtime accept CORE JSON only. This extension does not add PL/EN
speech-act parsing or direct dialogue-act realization. See the
[dialogue-act contract and limits](adr/dialogue-acts.md).

## v1.0 extension — deterministic response planning

`engine.planResponse({question,facts,clarifyQuestion?})` accepts a validated
CORE question (or an `ask` act) plus up to 32 validated CORE propositions,
`assert` acts, or discourse documents. It returns a versioned response plan
with a typed dialogue act, a CORE proposition to realize when one is supported,
and indices for the facts used. Planning is local and deterministic; it does
not call a network service or language model. `engine.respond({...request,to})`
adds target-language realization through the registered grammar. An unknown
answer has a typed `refuse` act and no fabricated sentence. A caller may supply
a semantic `clarifyQuestion`; it becomes a typed clarification and is realized
as a question.

The initial rule set matches complete semantic propositions. Yes/no answers
need an explicit matching or polarity-opposite fact; absence never means
"no". WH answers fill one declared event-role gap when the remaining event
semantics match exactly. Conflicting facts produce `ambiguous`; unsupported
questions and missing facts remain unknown. This is a bounded rule subset, not
general inference. The capability is advertised as
`engine.capabilities().responsePlannerVersion === '1.0'`. See the
[response-planner contract and limits](adr/response-planner.md).

## Session context for dialogue turns

ConversationContext keeps a bounded in-memory turn history with reset and
defensive snapshots. It classifies supported declarative turns as assert and
controlled yes/no or WH turns as ask; callers can append validated structured
answers, confirmations, clarifications, or refusals. Snapshots record intent,
surface input/output, focus, participant references, and unresolved questions.
An optional participants: {speakerId, addresseeId} mapping explicitly reuses
stable actor IDs across turns. Without that mapping, deictic speaker/addressee
references remain turn-scoped, and repeated noun strings do not create identity.
When existing discourse CORE cannot represent multiple deictic turns without
guessing identity, the aggregate interlingua snapshot is null while each
validated turn remains available in turns.

`ConversationContext.planResponse()` uses its latest pending question and
explicit prior assert turns. `ConversationContext.respond({to,...})` plans,
realizes and appends the typed reply; the pending question is resolved only
after a successful plan and realization.
