# flexLingua v0.6 — JSON-driven clause composition

This extends [grammar v0.5](grammar-v0.5.md). Existing declaration-driven noun inflection, verb inflection, NP layouts, agreement and case alternations remain unchanged. Both `data/en.json`, `data/pl.json` and `data/grammar/{en,pl}.json` have version `0.6`; no JS per-language relative-clause rules are required.

## Sentence-level declarations

```json
"sentence": {
  "subjectRole": "agent",
  "terminator": ".",
  "coordination": {
    "and": "and",
    "wideNegation": "it is not true that"
  }
}
```

Polish uses `"and":"i"` and `"wideNegation":"nie jest prawdą, że"`. The interpreter performs bounded top-level splitting into 2–4 **event clauses**; each clause is parsed with the existing language frame rules. `createCoordination()` constructs the language-neutral output. For wide-scope negation, `createNegation()` wraps the `coordination` node. Strings are checked when adapters are created; invalid function-word definitions cause errors.

## Relative markers

```json
"nounPhrase": {
  "relatives": {
    "maxDepth": 2,
    "punctuation": "commas",
    "markers": [
      {"gap":"agent", "text":"która", "when":{"number":"singular", "gender":"feminine"}},
      {"gap":"agent", "text":"którzy", "when":{"number":"plural", "pluralClass":"virile"}},
      {"gap":"theme", "text":"którego", "when":{"number":"singular", "gender":"masculine"}}
    ]
  }
}
```

This is an illustrative subset of the actual Polish table. English has markers `that`, `who` and `which` with `punctuation:"none"`. The included dictionaries supply subject and object markers; new semantic gap roles (for example `recipient`) can be added to JSON without changing the interpreter. Parsing works by skipping the `gap` in a frame's configured linearization. It reuses the SAME verb agreement, noun phrase parsing and role-case rules as an independent sentence. When no valid frame matches, the clause is rejected instead of guessing a syntactic structure.

For Polish, the relative-clause phrase is surrounded by commas. Adjacent nesting levels can legitimately share the same final comma, e.g. *Dziewczynka, która widziała chłopca, który widział psa, dała...*. English examples use restrictive relatives without commas.

The **first matching marker** is used for target generation, while all matching marker alternatives are recognized by the analyzer. Swapping marker order in JSON changes generation without changing JS. Morphological agreement attributes (`number`, `gender`, `pluralClass`) are checked against the existing feature registry.

## Runtime boundaries

- All new code is in `js/core/grammar.js`, `js/core/interlingua.js`, `js/core/engine.js` and safe tokenization. Language-specific adapters remain thin (`js/languages/en.js` and `pl.js`).
- A bounded parse budget and memoization prevent unbounded work on recursive candidates. The prototype is not designed for all complex natural-language sentences.
- Input containing commas is tokenized explicitly; punctuation is not silently dropped. Unsupported commas still fail frame matching.
- The standalone HTML is **generated from the same modules and JSON**. Run `npm run build:standalone` after any source or dictionary change, then `npm test`.
- The test suite includes round-trip EN → PL → semantic graph, localized negation, object-role gaps, depth-two nesting, JSON-only rule changes and a matrix of 48 grammatical combinations.

## Compatibility

The `Engine` constructor, `registerLanguage`, `analyze`, `analyzeCandidates`, `realize` and `translate` APIs remain in place. Older Interlingua 0.2/0.4/0.5 documents remain valid and are generated as such if they do not require a v0.6 operator. Dictionary/grammar schema version is 0.6; update both JSON files of a language together. `data/features.json` remains version 0.3.
