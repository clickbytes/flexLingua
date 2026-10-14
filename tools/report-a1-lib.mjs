/** G3 report: joins structural inventory to the finite project-authored development oracle. */
import {analyzeCoverage} from './coverage-a1-lib.mjs';
import {evaluateA1Gold} from './a1-gold-lib.mjs';

export function buildA1Report(engine,inventory,corpus){
  const structural=analyzeCoverage(inventory);
  const benchmark=evaluateA1Gold(engine,corpus);
  const listed=structural.pilot.concepts.map(row=>row.id);
  const covered=new Set(corpus.cases.flatMap(row=>
    [row.core.concept,...Object.values(row.core.roles).map(role=>role.concept)]));
  const exercised=listed.filter(id=>covered.has(id));
  const missing=listed.filter(id=>!covered.has(id));
  return {
    schemaVersion:1,
    scope:'finite-project-authored-A1-development-sample-not-cefr',
    outcome:benchmark.status,
    provenance:{lexicalPilot:structural.pilot.source,goldCorpus:corpus.origin,
      corpusLicense:corpus.license,notOfficialOxford:true},
    structural:{
      languages:structural.languages,
      sharedCoreReferences:structural.sharedCoreReferences,
      plOnlyReferences:structural.plOnlyReferences,
      enOnlyReferences:structural.enOnlyReferences,
      pilot:{conceptCount:structural.pilot.conceptCount,
        bilingualConcepts:structural.pilot.bilingualConcepts,
        bilingualMorphologyConcepts:structural.pilot.bilingualMorphologyConcepts,
        constructions:structural.pilot.constructions}
    },
    sampleEvidence:{
      classification:'development',
      declared:{positive:corpus.cases.length,negative:corpus.unsupported.length},
      verified:{positive:benchmark.positive.passed,negative:benchmark.negative.passed,
        status:benchmark.status},
      heldOut:{included:false,source:'data/coverage/a1-heldout-v1.json',
        verification:'npm run check:a1-evidence'},
      pilotConceptsTotal:listed.length,
      pilotConceptsMentionedByGold:exercised.length,
      conceptIdsMentioned:exercised,
      conceptIdsNotMentioned:missing,
      limitations:'This is overlap of two curated samples, not lexical A1 or real-world translation coverage.'
    },
    behavioral:{
      summary:benchmark.summary,
      positive:benchmark.positive,
      negative:benchmark.negative,
      byDirection:benchmark.byDirection,
      byFeature:benchmark.byFeature,
      results:benchmark.results
    },
    cefr:{level:'A1',percentage:null,status:'not-measured',
      reason:'No licensed representative CEFR reference denominator, external evaluation or deployment-wide success rate.'},
    release:{verified:false,
      reason:'A passing sample cannot certify GitHub Actions or the full Node test suite.'}
  };
}
