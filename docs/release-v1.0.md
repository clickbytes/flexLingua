# flexLingua 1.0 MVP — release and verification

This release completes the *proposed prototype roadmap* v0.7–v1.0, not the research goal of unrestricted natural-language translation.

| Milestone | Delivered | Explicit boundary |
|---|---|---|
| v0.7 | Finite propositional complements; nested belief and wider negation operand; semantic distinction between local/wide negation involving universal NP | No unrestricted scope calculus or arbitrary embeddings |
| v0.8 | Third JSON-driven Turkish adapter; SOV, nominative/accusative/dative, case-dependent definiteness and finite negative/positive verbs | Lexicon is small; no Turkish subordinate clauses or complete morphology |
| v0.9 | More case-aware analysis, finite matrix predicate agreement, bounded semantic recursion, structured error API, cross-language and adversarial tests | Not open-domain NLP; no neural disambiguation |
| v1.0 | Versioned API, three-language UI, regenerated file:// standalone HTML, docs and regression suite | Not yet an ISO-standard data schema or broad multilingual corpus |

## Release checklist

```sh
npm test
npm run check:standalone
npm run dev
# open http://127.0.0.1:8000/ or double-click index.html on Windows
```

The package has no install-time or runtime dependencies. The checked-in standalone HTML is generated from source modules and eight JSON data files. A browser file:// redirect avoids blocked cross-origin ES module/JSON loads.

## Scientific / linguistic caution

A passing test verifies only the controlled inputs. There is no claim that the machine translates arbitrary text; syntax, morphology, pragmatics, coreference and quantifier scope are far more complex. The Turkish adapter is intentionally a stress test of sentence order and case marking. Syntax/semantic ambiguities are bounded; only some are represented as alternatives. This is not a reliable machine translator for legal, medical or safety-critical material.
