# flexLingua — product roadmap

This document records product direction and quality principles. Current task priorities, dependencies, progress, and validation evidence live in [GitHub Issues](https://github.com/clickbytes/flexLingua/issues), pull requests, and Actions.

## Product goal

Build one language-independent meaning engine with separate language packages for analysis and realization:

```text
Polish  ⇄  CORE / INTER  ⇄  English
```

The product is a controlled-language prototype. It is not a phrase-pair translator, a general free-text translator, or a claim of CEFR certification.

The initial product scope is Polish and English. Other language packages may be explored after the shared semantic and adapter contracts are stable.

## Product principles

- Keep meaning separate from language-specific words, inflection, and syntax.
- Give distinct meanings distinct CORE identifiers; do not collapse homonyms.
- Preserve ambiguity when the input supports multiple readings.
- Refuse unsupported or underspecified input explicitly instead of guessing.
- Keep language-specific case, agreement, word order, and realization rules in the relevant language package.
- Record data sources and licenses. Use Oxford and CEFR as planning references; do not copy protected lists, definitions, or examples without permission.
- Treat gold examples as checks of their declared scope, not as proof of complete language proficiency.

## Product stages

### 1. Semantic and language foundations

Maintain a stable CORE representation and clear contracts for lexical meanings, semantic roles, events, states, and operators. Polish and English adapters should analyze and realize the same meaning while retaining the differences in their grammar.

### 2. Controlled language competence

Expand vocabulary, inflection, and compositional grammar in small, independently testable slices. Each supported construction should define its roles, permitted forms, positive examples, and explicit refusal cases.

The level labels A1, A2, B1, B2, C1, and C2 organize the intended breadth of the product. A level is not complete until a separately reviewed benchmark supports that claim.

### 3. Quality and evidence

Keep unit and regression tests, independent gold examples, data validation, and held-out evaluation. Measure Polish-to-English and English-to-Polish separately. Report the tested scope, exclusions, and known limitations with each quality result.

### 4. Conversation

After controlled sentence handling is reliable enough for the intended scope, add a rule-based conversation layer over CORE. The planned direction includes dialog acts, explicit speaker and addressee state, clarification, and bounded session memory.

Conversation behavior must use declared language capabilities. It must not invent facts or silently widen the underlying grammar.

### 5. Longer-term exploration

Possible later work includes persistent memory with provenance and user control, symbolic learning, trusted knowledge sources, programming-language support, and additional language adapters. Each requires its own scope and evidence before becoming a product commitment.

## Unit of language capability

A language slice should connect:

1. A distinct semantic meaning and its typed roles.
2. Lexical mappings in the supported languages.
3. Required inflection and inverse analysis.
4. Grammar and realization rules.
5. Positive, negative, and cross-language tests.
6. Verified data provenance where external material is used.

Prefer compositional rules over stored sentence pairs. Keep the tests independent enough to catch errors in the rules they check.

## Quality direction

The project should grow only when its contracts and evidence grow with it:

- Validate schemas, references, and data provenance.
- Check declared inflection cells in both generation and inverse analysis.
- Test semantic preservation in both translation directions.
- Include unsupported, ambiguous, and malformed inputs.
- Keep structural coverage distinct from language proficiency.
- Keep each controlled level's gold scope separate, and report sample counts by construction and direction. A finite project-authored A2 sample is not a representative CEFR benchmark; leave the full-level percentage unknown.
- Do not announce CEFR completion without a documented benchmark and reviewed results.

## Work tracking

GitHub Issues are the source for task scope, acceptance criteria, priority, dependencies, and status. Pull requests hold code changes and review; Actions records checks for the exact commit. Update this roadmap only when product direction or these durable quality principles change.

