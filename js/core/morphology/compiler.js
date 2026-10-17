/** An intentionally finite precomputed relation table; this is NOT a full FST.
 * A language package can be shipped with the table and used without re-running rules.
 */
export function compileMorphology(morphology) {
  const readings=[];
  for (const lex of morphology.lexicon.entries) {
    if (morphology.has(lex.id)) {
      for(const form of morphology.paradigm({lexemeId:lex.id})) {
        readings.push({text:form.text,lexemeId:form.lexemeId,features:form.features,
          coreRefs:form.coreRefs,variant:form.variant,source:form.source});
      }
    }
  }
  readings.sort((a,b)=>a.text.localeCompare(b.text,morphology.language) ||
    a.lexemeId.localeCompare(b.lexemeId) ||
    JSON.stringify(a.features).localeCompare(JSON.stringify(b.features)) ||
    a.variant.localeCompare(b.variant) || a.source.localeCompare(b.source));
  return {version:'1.11',language:morphology.language,kind:'finite-relation-table',
    stats:morphology.describe(),readings};
}

export function morphologyCoverage(morphology) {
  const eligible=morphology.lexicon.entries.filter(e=>['nouns','verbs','adjectives'].includes(e.category));
  const bound=eligible.filter(e=>morphology.has(e.id));
  const missing=eligible.filter(e=>!morphology.has(e.id)).map(e=>e.id);
  return {language:morphology.language,coveredLexemes:bound.length,
    eligibleLexemes:eligible.length,
    percentage:eligible.length?Number((100*bound.length/eligible.length).toFixed(2)):100,
    missingLexemes:missing,forms:morphology.describe().forms};
}
