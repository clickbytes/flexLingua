/** Runtime ceilings shared by source parsing and untrusted CORE document input. */
export const RESOURCE_LIMITS = Object.freeze({
  sourceTextCodeUnits: 16_384,
  coreJsonCodeUnits: 200_000,
  coreJsonDepth: 32,
  coreJsonNodes: 10_000,
  interlinguaDepth: 32,
  interlinguaNodes: 10_000,
  grammarAnalyses: 16,
  grammarSearchNodes: 10_000,
  discourseEvents: 8
});
