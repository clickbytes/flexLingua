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
| `realize({interlingua,to,lexicalRegister?})` | Generate target text, warnings and grammatical alternatives. `lexicalRegister` accepts `neutral` (default), `formal` or `plain` for event nouns. |
| `translate({text,from,to,context?,lexicalRegister?})` | Analyze → interlingua → realize; return semantic and grammar alternatives. Throws on unsupported input. The register option controls target event nouns only. |
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

Version `1.26` adds an optional typed `possessor` to an entity referent. Its value is a deictic owner with the same `{referent, agreement}` shape used for first- and second-person pronouns. Possessive information stays separate from the entity's CORE concept; `my book` still refers to `object.book`. Possessive state constructions use state version `1.26`. Earlier documents remain valid without the field.

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

## Closed-world CORE validation

CORE JSON is validated against the exact fields declared for each node version.
Unknown properties on discourse documents, event records, feature bundles,
roles, relations, states, questions and wrappers are rejected; normalization
must not silently discard them. A discourse document has only `version`,
`type`, `entities`, `events` and `relations`. A normalized discourse event has
`id`, `concept`, `roles` and `features`, with optional `timeReference`,
`clockTime`, `calendarDate`, `voice` and `omittedRoles` when their event
contract permits them. Its feature bundle contains only `tense`, `polarity`
and `aspect`. New semantic properties require an explicit versioned contract.

## Adapter contract

`createRuleAdapter(lexiconJSON, grammarJSON)` implements `code`, `analyze`, `analyzeCandidates`, `realize`, `validateOntology`, `describe`, `parseComplementHeads` and `realizeComplement`. Most decisions are declarative. The shared JS interpreter implements syntax search, feature agreement, case selection and realization.

Registration enforces [language adapter contract 1.0](adr/language-adapter.md).
Morphology adapters expose `availability()`, and
`engine.morphologyAvailability({language,lexemeId,features,exact?})` reports
unsupported lexemes, features and paradigm cells without guessing a form.

The grammar and lexicon schema is **v1.0** for EN, PL and TR. `data/features.json` stays on its own version (0.4), and the Interlingua nodes keep their individual serialization versions. Adding a new language does not require editing pairwise language translators, but it **does** require lexicon and grammar data, and must be tested for typological coverage.

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
indices for the facts used, and a categorical `confidence` record. `grounded`
means the answer has matching explicit evidence; `ambiguous` means evidence
conflicts; `none` means no supported answer was found. This is an evidence
status, not a calibrated probability. Planning is local and deterministic; it does
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

## v1.0 extension — DialogueEngine orchestration

`engine.createDialogueEngine()` returns an offline facade advertised by
`engine.capabilities().dialogueEngineVersion === '1.0'`. Create a bounded
session with `dialogue.createSession()`. `dialogue.nextTurn({session,utterance,
language,to,...})` parses, translates, and records one utterance. `language`
names the source language; `from` is an explicit alias, and `to` defaults to
the source language. `utterance` may be a string or `{text,language}`. A
successful result contains `core`, `dialogueAct`, target `text`, warnings,
diagnostics, and a defensive conversation snapshot.

`dialogue.tryNextTurn(request)` returns `{ok:true,value}` or
`{ok:false,error,diagnostics}`. Parsing ambiguity, unsupported constructions,
invalid language codes, and context limits leave the session unchanged.
`dialogue.respond({session,to,...})` answers the latest pending question with
the CORE response planner and records its typed reply; `tryRespond()` provides
the same safe error envelope. Pass `participants: {speakerId,addresseeId}` to
retain explicitly selected speaker/addressee identity across turns. The API
uses only the registered local language adapters and makes no network calls.

## MEM-03 extension — explicit session facts

`ConversationContext.remember({turnId,referent,recordedAt?,scope?,supersedes?})`
stores an assertion only after the caller explicitly approves it. `referent` is
a participant path from that source turn, such as `proposition.roles.agent`;
the selected reference must actually occur in the turn. Each bounded fact keeps
its CORE proposition, reference ID, source turn/language/text, UTC `recordedAt`,
`session` scope, and `explicit_supersede` correction rule. The default store
holds 32 facts and rejects overflow without eviction. Contradictory polarity
requires `supersedes` to name the active fact IDs being corrected. Invalid turns,
referents, timestamps, or conflicts leave memory unchanged. `snapshot().memory`
returns defensive copies, and `reset()` clears both turns and facts. Facts are
in-memory only and are never inferred from an assertion automatically.

## v1.0 extension — personality realization profiles

Pass a validated profile as `profile` to `engine.realize()`, `engine.translate()`,
`dialogue.nextTurn()`, or `dialogue.respond()`. The default profile is
`data/personality/default.json`; validate or construct profiles with
`engine.validatePersonalityProfile(profile)`. The versioned closed schema is
[`schemas/personality.schema.json`](../schemas/personality.schema.json), and
the runtime advertises `personalityProfileVersion === '1.0'`.

Version 1.0 exposes only current adapter controls: `pronounRealization` (`repeat`
or `safe`) and `outputVariant` (`preferred` or `first_alternative`). Profiles
may change target wording while preserving the CORE object. If an alternate
wording does not exist, the preferred output is kept with a warning. Unknown
fields and unsupported options fail validation. See the
[profile contract and semantic boundary](adr/personality.md).
