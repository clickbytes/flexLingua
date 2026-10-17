import lexicon from './lexicon.json' with {type: 'json'};
import grammar from './grammar.json' with {type: 'json'};
import morphology from './morphology.json' with {type: 'json'};
import features from './features.json' with {type: 'json'};
import signal from './signal.json' with {type: 'json'};
import bridge from './bridge.json' with {type: 'json'};
import {defineDeclarativeLanguagePlugin} from '../../js/plugins/declarative.js';

/** The trusted loader supplies the validated identity, graph, CORE and provenance. */
export default function createPolishPlugin({manifest, graph, core, provenance}) {
  return defineDeclarativeLanguagePlugin({manifest, graph, core, modules: {
    identity: manifest, signal, lexicon, features, morphology, grammar, bridge,
    evidence: provenance
  }});
}
