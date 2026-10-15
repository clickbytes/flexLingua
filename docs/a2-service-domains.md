# A2 controlled service interactions

The service vocabulary is a project-authored, bilingual extension for bounded
shopping and travel examples. It is not an official CEFR vocabulary list.

Purchase events preserve the requested item and exact count. Price events pair
an item with a typed currency participant that must carry an exact numeric
quantifier. The supported amount is the existing whole-number range 0–20;
decimal prices, exchange rates, taxes, and unmentioned currency are outside the
model. An absent price is rejected instead of inferred.

Travel examples reuse the existing typed destination, direction, and temporal
reference structures. A route destination and a bounded term such as
`tomorrow` remain explicit in CORE. Polite requests keep their request act and
addressee actor, while preferences use their distinct A2-02 event type.
