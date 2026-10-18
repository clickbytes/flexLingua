/** Assertion engine for the canonical sentence-translation matrix. Never executes translation logic itself. */

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
    if (actual?.referent?.kind !== 'deictic' || nfc(actual?.referent?.anchor) !== nfc(want.target.anchor)) {
      fail(`${path}/referent`, {kind: 'deictic', anchor: want.target.anchor},
        actual?.referent ?? 'none');
    }
    if (nfc(actual?.agreement?.person) !== nfc(want.agreement.person)) {
      fail(`${path}/agreement/person`, want.agreement.person, actual?.agreement?.person ?? 'none');
    }
    if (nfc(actual?.agreement?.number) !== nfc(want.agreement.number)) {
      fail(`${path}/agreement/number`, want.agreement.number, actual?.agreement?.number ?? 'none');
    }
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
export function compareCase(item, document) {
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
  return {pass: failures.length === 0,
    kind: document?.status === 'error' ? 'infra' : (STATUS_KIND[expected.status] ?? 'unknown'),
    failures, observed};
}
