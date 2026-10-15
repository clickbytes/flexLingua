# Offline knowledge provenance spike

The translation and conversation engines do not fetch facts. The separate
`KnowledgeSource` research prototype accepts only a caller-supplied, finite
`offline_snapshot` of Wikidata **structured** entity-to-entity claims. It makes
no network requests, executes no downloaded code, and never turns an imported
claim into a CORE assertion. `data/concepts.json` remains the reviewed semantic
inventory; no external ID is mapped to a CORE concept automatically.

Each fact records its Wikidata Q subject, P property, Q object, entity URL,
positive revision ID, CC0 marker, and explicit validity interval. The snapshot
records retrieval time. Import validates the entire replacement before changing
state and rejects older updates. Queries require an `asOf` time; multiple
different current objects are returned as `conflict`, never silently ranked.
An absent snapshot or an expired fact returns `unavailable`. External access
requests are refused with `KNOWLEDGE_EXTERNAL_UNAVAILABLE`.

Source comparison for a future, separately authorized importer:

| Source | Reuse and provenance | Prototype decision |
| --- | --- | --- |
| Wikidata structured data | [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing); retain entity URL, revision ID and retrieval time | Accept only validated local snapshots; source statements may still conflict or be stale |
| Wikipedia article text | [Attribution and share-alike conditions](https://foundation.wikimedia.org/wiki/Terms_of_Use); revision metadata is available through the [MediaWiki revisions API](https://www.mediawiki.org/wiki/API:Revisions) | Do not import article text or treat prose as verified facts |

The source format is deliberately narrow: Q-to-Q statements only, at most 256
facts, no qualifiers or live refresh. A production pipeline would need reviewed
claim selection, reference handling, attribution, conflict policy, temporal
qualifiers, data rights review and explicit CORE mappings before any facts can
answer user questions. This spike makes no freshness or truth guarantee beyond
the stored source metadata.
