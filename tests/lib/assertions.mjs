/** Canonical sentence assertions and checks of the production public entry points. */

const STATUS_KIND = Object.freeze({
  ok: 'translation',
  unsupported: 'refusal',
  invalid: 'refusal',
  resource_limit: 'refusal',
  ambiguous: 'ambiguity'
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nfc(value) {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

function deepScalarEqual(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.normalize('NFC') === b.normalize('NFC');
  return a === b;
}

/** Resolve a `#/a/b/0/c` pointer (repo convention: RFC 6901 segments with a leading `#`). Fails closed. */
export function resolvePointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return {missing: true, at: pointer};
  const segments = pointer.slice(2).split('/').map(segment =>
    segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return {missing: true, at: segment};
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return {missing: true, at: segment};
      }
      current = current[index];
    } else if (isRecord(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return {missing: true, at: segment};
      current = current[segment];
    } else {
      return {missing: true, at: segment};
    }
  }
  return {missing: false, value: current};
}

function featureMismatch(wanted, got) {
  if (typeof wanted === 'string') {
    return typeof got !== 'string' || got.normalize('NFC') !== wanted.normalize('NFC');
  }
  return !deepScalarEqual(got, wanted);
}

function compareFeatures(want, actual, path, fail, {extraAllowed, exact}) {
  for (const [key, value] of Object.entries(want)) {
    if (featureMismatch(value, actual?.[key])) {
      fail(`${path}/${key}`, value, actual?.[key] ?? 'none');
    }
  }
  const wantedKeys = Object.keys(want);
  const gotKeys = Object.keys(actual ?? {});
  if (exact) {
    if (wantedKeys.length !== gotKeys.length) {
      fail(`${path} (exact feature keys)`, wantedKeys.sort().join(','), gotKeys.sort().join(','));
    }
  } else if (!extraAllowed) {
    const unexpected = gotKeys.filter(key => !(key in want));
    if (unexpected.length) {
      fail(`${path} (no unexpected features)`, `only ${wantedKeys.sort().join(',')}`,
        unexpected.sort().join(','));
    }
  }
}

function compareModifiers(wantModifiers, actual, path, fail, {exact}) {
  const wanted = wantModifiers.map(entry => nfc(entry.concept)).sort().join(',');
  const got = (Array.isArray(actual?.modifiers) ? actual.modifiers : [])
    .map(entry => nfc(entry?.concept)).sort().join(',');
  if (got !== wanted) {
    fail(`${path}/modifiers`, wanted, got || 'none');
  }
  if (exact && (Array.isArray(actual?.modifiers) ? actual.modifiers.length : 0) !== wantModifiers.length) {
    fail(`${path}/modifiers (exact)`, wantModifiers.length, got ? got.split(',').length : 0);
  }
}

function compareParticipant(want, actual, path, fail, meaning) {
  if (want.concept !== undefined) {
    if (nfc(actual?.concept) !== nfc(want.concept)) {
      fail(`${path}/concept`, want.concept, actual?.concept ?? 'none');
    }
  } else if (want.target !== undefined) {
    compareFeatures(want.target, actual?.referent ?? {}, `${path}/referent`, fail,
      {extraAllowed: false, exact: true});
    compareFeatures(want.agreement, actual?.agreement ?? {}, `${path}/agreement`, fail,
      {extraAllowed: false, exact: true});
  }
  if (want.features && (Object.keys(want.features).length || meaning.roleFeaturesExact === true)) {
    compareFeatures(want.features, actual?.features ?? {}, `${path}/features`, fail, {
      extraAllowed: true,
      exact: meaning.roleFeaturesExact === true
    });
  }
  if (Array.isArray(want.modifiers)) {
    compareModifiers(want.modifiers, actual, path, fail, {exact: meaning.modifiersExact === true});
  }
  if (want.quantity !== undefined) {
    if (actual?.quantity?.kind !== want.quantity.kind || actual?.quantity?.value !== want.quantity.value) {
      fail(`${path}/quantity`, want.quantity, actual?.quantity ?? 'none');
    }
  }
}

/**
 * Compare an expected meaning against an actual MeaningGraph. `partial` (used for
 * alternative semantic readings) keeps subset semantics: unconstrained features
 * and feature extras are treated the same as when `featuresAllowExtra` is set.
 */
function compareMeaning(want, actual, fail, {partial = false} = {}) {
  if (!isRecord(actual)) {
    fail('#/meaning', 'a MeaningGraph object', 'none');
    return;
  }
  if (want.type !== undefined && actual.type !== want.type) {
    fail('#/type', want.type, actual.type ?? 'none');
  }
  if (want.type === 'question') {
    if (actual.type !== 'question') return;
    if (want.questionType !== undefined && actual.questionType !== want.questionType) {
      fail('#/questionType', want.questionType, actual.questionType ?? 'none');
    }
    const allowedFields = new Set(['version', 'type', 'questionType', 'proposition']);
    for (const key of Object.keys(actual)) {
      if (!allowedFields.has(key)) {
        fail(`#/unexpected/${key}`, 'no additional question field', actual[key]);
      }
    }
    const nestedFail = (path, expected, observed) => {
      if (path.startsWith('assert #/')) {
        fail(`assert #/proposition/${path.slice('assert #/'.length)}`, expected, observed);
      } else if (path.startsWith('#/')) {
        fail(`#/proposition${path.slice(1)}`, expected, observed);
      } else {
        fail(`#/proposition/${path}`, expected, observed);
      }
    };
    if (!isRecord(want.proposition)) {
      fail('#/proposition', 'an expected event proposition', 'none');
    } else {
      compareMeaning(want.proposition, actual.proposition, nestedFail, {partial});
    }
    if (!partial) {
      for (const [pointer, value] of Object.entries(want.assert ?? {})) {
        const resolved = resolvePointer(actual, pointer);
        if (resolved.missing) fail(`assert ${pointer}`, value, `missing at ${resolved.at}`);
        else if (!deepScalarEqual(resolved.value, value)) fail(`assert ${pointer}`, value, resolved.value);
      }
    }
    return;
  }
  if (want.concept !== undefined && nfc(actual.concept) !== nfc(want.concept)) {
    fail('#/concept', want.concept, actual.concept ?? 'none');
  }
  if (want.kind !== undefined && nfc(actual.kind) !== nfc(want.kind)) {
    fail('#/kind', want.kind, actual.kind ?? 'none');
  }
  const roleKeys = Object.keys(actual.roles ?? {});
  const declared = (want.roleSet ?? []).slice();
  if (partial) {
    const absent = declared.filter(name => !roleKeys.includes(name));
    if (absent.length) fail('#/roleSet', declared.join(','), `missing ${absent.join(',')}`);
  } else if (roleKeys.slice().sort().join('\u0000') !== declared.slice().sort().join('\u0000')) {
    fail('#/roleSet', declared.join(','), roleKeys.slice().sort().join(','));
  }
  for (const [name, participant] of Object.entries(want.roles ?? {})) {
    if (partial && !(name in (actual.roles ?? {}))) continue;
    compareParticipant(participant, actual.roles?.[name], `#/roles/${name}`, fail,
      {...want, roleFeaturesExact: partial ? false : want.roleFeaturesExact === true});
  }
  if (want.features) {
    compareFeatures(want.features, actual.features ?? {}, '#/features', fail, {
      extraAllowed: partial || want.featuresAllowExtra === true,
      exact: false
    });
  }
  if (!partial) {
    for (const [pointer, value] of Object.entries(want.assert ?? {})) {
      const resolved = resolvePointer(actual, pointer);
      if (resolved.missing) {
        fail(`assert ${pointer}`, value, `missing at ${resolved.at}`);
      } else if (!deepScalarEqual(resolved.value, value)) {
        fail(`assert ${pointer}`, value, resolved.value);
      }
    }
  }
}

/** Multiset matching for diagnostics / information-loss lists; items match fieldwise exactly. */
function compareMultiset(requiredItems, observedItems, match, fail, basePath, {allowUnexpected}) {
  const unused = [...observedItems];
  requiredItems.forEach((required, position) => {
    const hit = unused.findIndex(entry => match(required, entry));
    if (hit === -1) {
      fail(`${basePath}/required[${position}]`, required, 'no matching entry');
    } else {
      unused.splice(hit, 1);
    }
  });
  if (!allowUnexpected) {
    for (const entry of unused) {
      fail(`${basePath} (unexpected)`, 'no extra entries', entry);
    }
  }
}

function sameDiagnosticsCode(required, observed) {
  return typeof observed?.code === 'string' &&
    observed.code.normalize('NFC') === required.code.normalize('NFC');
}

function sameInformationLossItem(required, observed) {
  if (!isRecord(observed)) return false;
  return Object.entries(required).every(([key, value]) => nfc(observed[key]) === nfc(value));
}

/**
 * Compare one approved case expectation against the returned service document.
 * Returns {pass, kind, failures[], observed} — the runner decides gating and printing.
 */
function graphAssertionKey(assertion) {
  return JSON.stringify([assertion.fromPath, assertion.relation, assertion.toConcept]);
}

function meaningValueAtPath(meaning, path) {
  if (typeof path !== 'string' || !path.startsWith('#/')) return undefined;
  let value = meaning;
  for (const rawSegment of path.slice(2).split('/')) {
    if (/~(?![01])/u.test(rawSegment)) return undefined;
    const segment = rawSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    if (!Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

function resolvesMeaningPath(meaning, path) {
  return meaningValueAtPath(meaning, path) !== undefined;
}

function effectOwnerPath(path) {
  const modifier = path.match(/^(.*)\/modifiers\/[0-9]+$/u);
  if (modifier) return modifier[1];
  return path.endsWith('/predicate') ? `${path.slice(0, -'/predicate'.length)}/roles/subject` : null;
}

function compareTypedGraph(policy, document, engine, fail, observed) {
  if (!engine || typeof engine.projectMeaningGraph !== 'function') {
    fail('/graph/projection', 'production Engine.projectMeaningGraph', 'unavailable');
    return 'infra';
  }
  // An expected success that receives a controlled refusal already fails its
  // status/text/meaning assertions. Do not relabel that translation failure as
  // infrastructure just because there is no successful MeaningGraph to project.
  if (document?.status !== 'ok') return null;

  let graph;
  try {
    graph = engine.projectMeaningGraph(document?.meaning);
  } catch (error) {
    fail('/graph/projection', 'a valid typed graph projection',
      `${error?.code ?? error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
    return 'infra';
  }
  if (!isRecord(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) ||
      !isRecord(graph.sourcePaths) || !isRecord(graph.sourcePaths.edges) ||
      !Array.isArray(graph.unresolved)) {
    fail('/graph/projection', 'bounded graph with nodes, edges, sourcePaths and unresolved', graph);
    return 'infra';
  }

  observed.typedGraph = graph;
  const nodes = new Map();
  let malformedGraph = false;
  for (const node of graph.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id ||
        typeof node.conceptId !== 'string' || !node.conceptId || nodes.has(node.id)) {
      fail('/graph/nodes', 'unique nodes with string id and conceptId', node);
      malformedGraph = true;
      continue;
    }
    nodes.set(node.id, node);
  }
  const actual = new Set();
  let malformedSourcePaths = false;
  for (const edge of graph.edges) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.relation !== 'string' ||
        typeof edge.target !== 'string' || !nodes.has(edge.from)) {
      fail('/graph/edges', 'typed edges with known source and target nodes', edge);
      malformedGraph = true;
      continue;
    }
    const target = nodes.get(edge.target);
    const key = JSON.stringify([edge?.from, edge?.relation, edge?.target]);
    const paths = graph.sourcePaths.edges[key];
    if (!target) {
      fail('/graph/edges', 'typed edges with known source and target nodes', edge);
      malformedGraph = true;
      continue;
    }
    if (!Array.isArray(paths) || paths.length === 0 ||
        paths.some(path => !resolvesMeaningPath(document.meaning, path))) {
      fail('/graph/sourcePaths', 'at least one valid MeaningGraph path for every projected edge',
        {edge, paths});
      malformedSourcePaths = true;
      continue;
    }
    for (const fromPath of paths) {
      const ownerPath = effectOwnerPath(fromPath);
      const property = meaningValueAtPath(document.meaning, fromPath);
      const effect = engine.ontology?.get?.(property?.concept)?.semanticEffect;
      if (ownerPath && effect?.operation === 'add_relation' &&
          effect.relation === edge.relation && effect.target === target.conceptId &&
          edge.from !== ownerPath) {
        fail('/graph/scope', ownerPath, edge.from);
      }
      actual.add(JSON.stringify([fromPath, edge.relation, target.conceptId]));
    }
  }

  const required = new Set(policy.requiredEdges.map(graphAssertionKey));
  policy.requiredEdges.forEach((assertion, index) => {
    if (!actual.has(graphAssertionKey(assertion))) {
      fail(`/graph/requiredEdges/${index}`, assertion, 'edge not projected at this source path');
    }
  });
  policy.forbiddenEdges.forEach((assertion, index) => {
    if (actual.has(graphAssertionKey(assertion))) {
      fail(`/graph/forbiddenEdges/${index}`, 'edge absent', assertion);
    }
  });
  if (graph.unresolved.length) {
    fail('/graph/unresolved', 'no unresolved semantic graph paths', graph.unresolved);
  }
  if (!policy.allowUnexpected) {
    for (const assertion of actual) {
      if (!required.has(assertion)) {
        fail('/graph (unexpected)', 'only the declared required edges', assertion);
      }
    }
  }
  return malformedGraph || malformedSourcePaths ? 'infra' : null;
}

export function compareCase(item, document, {engine, analysisOnly = false} = {}) {
  const failures = [];
  const format = value => isRecord(value) || Array.isArray(value)
    ? JSON.stringify(value) : value === undefined ? 'none' : String(value);
  const fail = (path, expected, actual) => {
    if (failures.length < 24) {
      failures.push({path,
        expected: isRecord(expected) || Array.isArray(expected) ? JSON.stringify(expected) : String(expected),
        actual: actual === undefined || typeof actual === 'symbol'
          ? String(actual) : isRecord(actual) || Array.isArray(actual) ? JSON.stringify(actual) : String(actual)});
    }
  };
  const expected = item.expected;
  const observed = {
    status: document?.status ?? null,
    text: document?.text ?? null,
    alternativeCount: Array.isArray(document?.alternatives) ? document.alternatives.length : 0,
    diagnosticCodes: (Array.isArray(document?.diagnostics) ? document.diagnostics : [])
      .map(entry => entry?.code).filter(code => typeof code === 'string').sort(),
    informationLossCount: Array.isArray(document?.informationLoss) ? document.informationLoss.length : 0
  };

  if (!Array.isArray(document?.uncertainties)) {
    fail('/uncertainties', 'an uncertainty array', document?.uncertainties);
  } else if (expected.uncertainties) {
    compareMultiset(expected.uncertainties.required, document.uncertainties,
      (wanted, got) => isRecord(got) && Object.entries(wanted)
        .every(([key, value]) => sameJson(value, got[key])),
      fail, '/uncertainties', {allowUnexpected: expected.uncertainties.allowUnexpected});
  }
  if (!analysisOnly) compareInterpretations(expected.interpretations, document, fail);

  if (nfc(document?.status) !== nfc(expected.status)) {
    fail('status', expected.status, document?.status ?? 'none');
    return {pass: false,
      kind: document?.status === 'error' ? 'infra' : (STATUS_KIND[expected.status] ?? 'unknown'),
      failures, observed};
  }

  if (expected.status === 'ok') {
    const actualText = nfc(document.text);
    if (typeof actualText !== 'string' ||
        !expected.text.accepted.map(value => value.normalize('NFC')).includes(actualText)) {
      fail('text', `one of ${JSON.stringify(expected.text.accepted)}`,
        typeof actualText === 'string' ? actualText : 'none');
    }
    compareMeaning(expected.meaning, document.meaning, fail);
    const pool = (document.alternatives ?? []).map(value =>
      typeof value === 'string' ? value.normalize('NFC') : JSON.stringify(value));
    const requiredTexts = expected.alternatives.required
      .filter(entry => typeof entry === 'string').map(value => value.normalize('NFC'));
    const consumed = [...pool];
    requiredTexts.forEach((text, position) => {
      const index = consumed.indexOf(text);
      if (index === -1) fail(`alternatives/required[${position}]`, text, 'not returned');
      else consumed.splice(index, 1);
    });
    if (!expected.alternatives.allowUnexpected && consumed.length) {
      fail('alternatives (unexpected)', 'no extra surface alternatives',
        `${consumed.length} extra: ${consumed.slice(0, 2).join(' | ')}`);
    }
    compareMultiset(expected.informationLoss.required, document.informationLoss ?? [],
      sameInformationLossItem, fail, '/informationLoss',
      {allowUnexpected: expected.informationLoss.allowUnexpected});
    compareMultiset(expected.diagnostics.required, document.diagnostics ?? [],
      sameDiagnosticsCode, fail, '/diagnostics',
      {allowUnexpected: expected.diagnostics.allowUnexpected});
  } else {
    if (document.text !== null) fail('text', null, document.text);
    if (document.meaning !== null) fail('meaning', null, document.meaning);
    if (expected.status !== 'ambiguous' && (document.alternatives ?? []).length) {
      fail('alternatives', '[]', document.alternatives);
    }
    if (expected.status === 'ambiguous') {
      const bindings = [...(document.alternatives ?? [])];
      const requiredMeanings = expected.alternatives.required.filter(isRecord);
      requiredMeanings.forEach((required, position) => {
        const index = bindings.findIndex(candidate => {
          let strict = true;
          compareMeaning(required.meaning, candidate?.meaning, () => { strict = false; }, {partial: true});
          return strict;
        });
        if (index === -1) {
          fail(`alternatives/required[${position}]`, 'matching semantic reading',
            format(required.meaning));
        } else {
          bindings.splice(index, 1);
        }
      });
      if (!expected.alternatives.allowUnexpected && bindings.length) {
        fail('alternatives (unexpected)', requiredMeanings.length,
          `${(document.alternatives ?? []).length} readings returned`);
      }
    }
    compareMultiset(expected.diagnostics.required, document.diagnostics ?? [],
      sameDiagnosticsCode, fail, '/diagnostics',
      {allowUnexpected: expected.diagnostics.allowUnexpected});
    compareMultiset(expected.informationLoss.required, document.informationLoss ?? [],
      sameInformationLossItem, fail, '/informationLoss',
      {allowUnexpected: expected.informationLoss.allowUnexpected});
  }
  let graphKind = null;
  if (expected.graph) graphKind = compareTypedGraph(expected.graph, document, engine, fail, observed);
  return {pass: failures.length === 0,
    kind: graphKind ?? (document?.status === 'error' ? 'infra' : (STATUS_KIND[expected.status] ?? 'unknown')),
    failures, observed};
}

/** Exercise actual public APIs with the same independently authored sentence oracle. */
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
function canonical(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])]));
  return value;
}

function compareInterpretations(policy, document, fail) {
  const interpretations = document?.interpretations;
  if (!Array.isArray(interpretations)) {
    fail('/interpretations', 'an array of complete readings', interpretations);
    return;
  }
  const ids = new Set();
  const realizations = interpretations.flatMap(item => item.realizations ?? []);
  for (const item of [...interpretations, ...realizations]) {
    if (typeof item.id !== 'string' || ids.has(item.id)) fail('/interpretations/id', 'unique stable ID', item.id);
    ids.add(item.id);
  }
  for (const interpretation of interpretations) {
    for (const realization of interpretation.realizations ?? []) {
      if (realization.interpretationId !== interpretation.id) {
        fail('/interpretations/link', interpretation.id, realization.interpretationId);
      }
    }
  }
  const preview = realizations.find(item => item.id === document.previewId);
  if (document.previewId !== null && !preview) fail('/previewId', 'an available whole-sentence realization or null', document.previewId);
  if (!policy) return;
  compareMultiset(policy.required, interpretations, (wanted, actual) => {
    const problems = [];
    compareMeaning(wanted.meaning, actual.meaning, (...args) => problems.push(args));
    return !problems.length && wanted.status === actual.status &&
      sameJson([...wanted.texts].map(nfc).sort(), actual.realizations.map(item => nfc(item.text)).sort()) &&
      (wanted.rank === undefined || wanted.rank === actual.rank) &&
      (wanted.assumptions === undefined || (actual.score.assumptions === wanted.assumptions &&
        actual.realizations.every(item => item.assumptions.length === wanted.assumptions &&
          item.kind === (wanted.assumptions ? 'additional_assumption' : 'equivalent_expression')))) &&
      (wanted.ruleIds ?? []).every(id => actual.ruleIds.includes(id) && actual.reasons.some(reason => reason.ruleId === id)) &&
      (wanted.diagnosticCodes === undefined || sameJson(wanted.diagnosticCodes.slice().sort(), actual.diagnostics.map(item => item.code).sort()));
  }, fail, '/interpretations', {allowUnexpected:policy.allowUnexpected});
  if (policy.preview === null) {
    if (document.previewId !== null) fail('/previewId', null, document.previewId);
  } else if (!policy.preview.accepted.map(nfc).includes(nfc(preview?.text))) {
    fail('/preview/text', policy.preview.accepted, preview?.text);
  }
  const tied = interpretations.length > 1 && interpretations[0].rank === interpretations[1].rank;
  if (tied !== policy.tied) fail('/interpretations/tied', policy.tied, tied);
}

export function comparePublicEntryPoints(item, document, engine) {
  const failures = [];
  const checks = {};
  let infra = false;
  const add = (api, path, expected, actual) => failures.push({path: `api/${api}/${path}`,
    expected: JSON.stringify(expected), actual: JSON.stringify(actual) ?? 'none'});
  for (const api of ['translate', 'tryTranslate', 'analyze']) {
    const before = failures.length;
    try {
      if (api === 'analyze') {
        let meaning;
        let error;
        try { meaning = engine.analyze(item.input); } catch (caught) { error = caught; }
        if (item.expected.status === 'ok') {
          if (error) throw error;
          compareMeaning(item.expected.meaning, meaning,
            (path, expected, actual) => add(api, path, expected, actual));
        } else if (item.expected.status === 'ambiguous') {
          if (error?.status !== 'ambiguous' || error?.code !== 'AMBIGUOUS_MEANING') {
            add(api, 'refusal', 'typed semantic ambiguity', error?.code ?? meaning);
          }
          for (const failure of compareCase(item, error?.result, {engine, analysisOnly:true}).failures) {
            add(api, failure.path, failure.expected, failure.actual);
          }
        } else if (!error || error.status !== item.expected.status ||
          !item.expected.diagnostics.required.some(entry => entry.code === error.code)) {
          if (error && !error.status) throw error;
          add(api, 'refusal', item.expected.status, error?.status ?? meaning);
        }
      } else {
        const response = engine[api](item.input);
        const value = api === 'tryTranslate' ? response.value : response;
        if (api === 'tryTranslate' && response.ok !== (item.expected.status === 'ok')) {
          add(api, 'ok', item.expected.status === 'ok', response.ok);
        }
        for (const failure of compareCase(item, value, {engine}).failures) {
          add(api, failure.path, failure.expected, failure.actual);
        }
        for (const field of ['status','text','meaning','alternatives','informationLoss','uncertainties','interpretations','previewId']) {
          if (!sameJson(value?.[field], document?.[field])) {
            add(api, field, document?.[field], value?.[field]);
          }
        }
        if (!sameJson(value?.interlingua, value?.meaning)) {
          add(api, 'interlingua', value?.meaning, value?.interlingua);
        }
      }
    } catch (error) {
      infra = true;
      add(api, 'exception', 'a domain result', error?.message ?? String(error));
    }
    checks[api] = failures.length === before ? 'PASS' : infra ? 'INFRA' : 'FAIL';
  }
  return {failures, checks, infra};
}
