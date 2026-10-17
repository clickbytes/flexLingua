import lexicon from './lexicon.json' with {type: 'json'};
import grammar from './grammar.json' with {type: 'json'};
import features from './features.json' with {type: 'json'};
import signal from './signal.json' with {type: 'json'};
import bridge from './bridge.json' with {type: 'json'};
import {defineDeclarativeLanguagePlugin} from '../../js/plugins/declarative.js';

/** Only Italian declarations; interpretation is owned by the shared runtime. */
export default function createItalianPlugin({manifest, graph, core, provenance}) {
  return defineDeclarativeLanguagePlugin({manifest, graph, core, modules: {
    identity: manifest, lexicon, grammar, features, signal, bridge, evidence: provenance
  }});
}
