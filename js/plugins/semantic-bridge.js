import {PluginError} from './errors.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function collectSenseReferences(value, core, senses, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) collectSenseReferences(child, core, senses, seen);
  } else {
    if (isRecord(value.coreRef) && typeof value.coreRef.kind === 'string' &&
        typeof value.id === 'string') {
      try {
        core.resolve(value.coreRef);
      } catch (error) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid lexical sense mapping: ${value.id}.`, error);
      }
      const previous = senses.get(value.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(value.coreRef)) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Conflicting lexical sense mapping: ${value.id}.`);
      }
      senses.set(value.id, structuredClone(value.coreRef));
    }
    for (const child of Object.values(value)) collectSenseReferences(child, core, senses, seen);
  }
  seen.delete(value);
}

function cloneLexicalSenses(value, senseReferences, path = 'lexicalSenses') {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (!senseReferences.has(value)) {
      fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown lexical sense at ${path}: ${value}.`);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) =>
    cloneLexicalSenses(item, senseReferences, `${path}[${index}]`));
  if (!isRecord(value)) fail('PLUGIN_RESULT_INVALID', `Invalid lexical sense record at ${path}.`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, cloneLexicalSenses(item, senseReferences, `${path}.${key}`)]));
}

/** Build a checked, non-mutating bridge from parser readings to the LanguageGraph transfer plan. */
export function createSemanticBridge({plan, core} = {}) {
  if (!isRecord(plan) || !Array.isArray(plan.transferPlans) ||
      !core || typeof core.resolve !== 'function' || !isRecord(plan.modules)) {
    fail('PLUGIN_GRAPH_INVALID', 'Semantic bridge requires a compiled graph and CORE.');
  }
  const senseReferences = new Map();
  for (const module of Object.values(plan.modules)) {
    collectSenseReferences(module, core, senseReferences);
  }
  const transferPlans = plan.transferPlans.map(item => structuredClone(item));

  function transferFor(meaning, construction) {
    if (meaning?.type === 'state' && meaning.kind === 'classification') {
      const stateConstruction = 'state.classification';
      if (construction !== undefined && construction !== stateConstruction) {
        fail('PLUGIN_CAPABILITY_UNAVAILABLE',
          `State classification does not match construction ${construction}.`);
      }
      return {construction: stateConstruction, stateKind: 'classification'};
    }
    const conceptId = meaning?.concept;
    const candidates = transferPlans.filter(item => item.conceptId === conceptId &&
      (construction === undefined || construction === item.construction));
    if (candidates.length !== 1) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE', candidates.length
        ? `Meaning ${conceptId} has multiple transfer plans; specify a construction.`
        : `No semantic transfer is declared for ${String(conceptId)}.`);
    }
    return candidates[0];
  }

  function validateMeaning(meaning, transfer) {
    if (transfer?.stateKind === 'classification') {
      const frame = core.ontology?.stateFrames?.classification;
      if (!isRecord(meaning) || meaning.type !== 'state' ||
          meaning.kind !== transfer.stateKind || meaning.version !== '1.31' ||
          !isRecord(meaning.roles) || !isRecord(meaning.features) ||
          Object.keys(meaning).sort().join(',') !== 'features,kind,roles,type,version' ||
          Object.keys(meaning.features).sort().join(',') !== 'polarity,tense' ||
          !frame || Object.keys(meaning.roles).length !== frame.roles.length ||
          frame.roles.some(role => !Object.hasOwn(meaning.roles, role))) {
        fail('PLUGIN_RESULT_INVALID', 'Invalid classification state or role frame.');
      }
      for (const role of frame.roles) {
        const participant = meaning.roles[role];
        const referent = participant?.referent;
        const agreement = participant?.agreement;
        const deictic = isRecord(participant) &&
          Object.keys(participant).sort().join(',') === 'agreement,referent' &&
          isRecord(referent) && Object.keys(referent).sort().join(',') === 'anchor,kind' &&
          referent.kind === 'deictic' &&
          ['speaker', 'addressee', 'demonstrative'].includes(referent.anchor) &&
          isRecord(agreement) && Object.keys(agreement).sort().join(',') === 'number,person' &&
          ['singular', 'plural'].includes(agreement.number) &&
          (referent.anchor === 'speaker' ? agreement.person === 'first' :
            referent.anchor === 'addressee' ? agreement.person === 'second' :
              agreement.person === 'third' && agreement.number === 'singular');
        const conceptId = deictic ? 'person' : participant?.concept;
        if (!isRecord(participant) || (Object.hasOwn(participant, 'referent') && !deictic) ||
            typeof conceptId !== 'string' ||
            !core.ontology.isA(conceptId, frame.roleTypes[role])) {
          fail('PLUGIN_RESULT_INVALID', `Invalid classification participant: ${role}.`);
        }
        if (deictic) continue;
        const reference = isRecord(participant.coreRef) ? participant.coreRef :
          {kind: 'concept', id: participant.concept};
        if (reference.kind !== 'concept' || reference.id !== participant.concept) {
          fail('PLUGIN_CORE_REFERENCE_INVALID', `Conflicting CORE reference for ${role}.`);
        }
        try { core.resolve(reference); }
        catch (error) {
          fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown CORE reference for ${role}.`, error);
        }
      }
      return true;
    }
    if (!isRecord(meaning) || !isRecord(meaning.roles) || !transfer ||
        meaning.concept !== transfer.conceptId) {
      fail('PLUGIN_RESULT_INVALID', 'Meaning does not match its declared semantic transfer.');
    }
    let concept;
    try {
      concept = core.resolve({kind: 'concept', id: meaning.concept});
    } catch (error) {
      fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown meaning concept: ${String(meaning.concept)}.`, error);
    }
    const mappedRoles = new Set(transfer.arguments.map(item => item.semanticRole));
    const omittedRoles = new Set(Array.isArray(meaning.omittedRoles) ? meaning.omittedRoles : []);
    const optionalRoles = new Set([...(concept.optionalRoles || []), ...omittedRoles]);
    for (const [role, participant] of Object.entries(meaning.roles)) {
      if (!Array.isArray(concept.roles) || !concept.roles.includes(role) || !mappedRoles.has(role)) {
        fail('PLUGIN_CAPABILITY_UNAVAILABLE', `Semantic role is not mapped: ${role}.`);
      }
      if (!isRecord(participant)) {
        fail('PLUGIN_RESULT_INVALID', `Invalid participant for semantic role ${role}.`);
      }
      const reference = isRecord(participant.coreRef) ? participant.coreRef
        : typeof participant.concept === 'string'
          ? {kind: 'concept', id: participant.concept} : null;
      if (!reference) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Participant has no typed CORE reference for role ${role}.`);
      }
      try {
        core.resolve(reference);
      } catch (error) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid CORE reference for role ${role}.`, error);
      }
      if (typeof participant.concept === 'string' && reference.kind === 'concept' &&
          reference.id !== participant.concept) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Conflicting CORE references for role ${role}.`);
      }
    }
    for (const argument of transfer.arguments) {
      if (!Object.hasOwn(meaning.roles, argument.semanticRole) &&
          !optionalRoles.has(argument.semanticRole)) {
        fail('PLUGIN_RESULT_INVALID', `Required semantic role is missing: ${argument.semanticRole}.`);
      }
    }
    return true;
  }

  function validateReading(reading, transfer) {
    if (!isRecord(reading) || !isRecord(reading.interlingua)) {
      fail('PLUGIN_RESULT_INVALID', 'Parser returned an invalid semantic reading.');
    }
    validateMeaning(reading.interlingua, transfer);
    return {
      meaning: structuredClone(reading.interlingua),
      lexicalSenses: cloneLexicalSenses(reading.lexicalSenses || {}, senseReferences),
      score: Number.isFinite(reading.score) ? reading.score : 0
    };
  }

  function coreRefForSense(senseId) {
    const reference = senseReferences.get(senseId);
    if (!reference) fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown lexical sense: ${String(senseId)}.`);
    return structuredClone(reference);
  }

  function projectMeaning(meaning, transfer, lexicalSenses = {}) {
    validateMeaning(meaning, transfer);
    const senses = cloneLexicalSenses(lexicalSenses, senseReferences);
    if (transfer.stateKind === 'classification') {
      for (const [role, participant] of Object.entries(meaning.roles)) {
        const senseId = senses?.[role];
        if (typeof senseId === 'string') {
          const reference = coreRefForSense(senseId);
          if (reference.kind === 'concept' && reference.id !== participant.concept) {
            fail('PLUGIN_CORE_REFERENCE_INVALID',
              `Lexical sense does not match classification role ${role}.`);
          }
        }
      }
      return {construction: transfer.construction, stateKind: transfer.stateKind,
        roles: Object.fromEntries(Object.entries(meaning.roles).map(([role, participant]) =>
          [role, {participant: structuredClone(participant),
            coreRef: typeof participant.concept === 'string' ?
              {kind: 'concept', id: participant.concept} : null,
            lexicalSense: typeof senses?.[role] === 'string' ?
              coreRefForSense(senses[role]) : null}]))};
    }
    const runtimeArguments = transfer.arguments.map(item => {
      const participant = meaning.roles[item.semanticRole] ?? null;
      const senseId = senses?.[item.semanticRole] ?? null;
      const senseReference = typeof senseId === 'string' ? coreRefForSense(senseId) : null;
      if (participant && senseReference?.kind === 'concept' &&
          typeof participant.concept === 'string' && senseReference.id !== participant.concept) {
        fail('PLUGIN_CORE_REFERENCE_INVALID',
          `Lexical sense does not match semantic role ${item.semanticRole}.`);
      }
      const agreementControllers = item.agreementControllers.map(controller => {
        const target = transfer.arguments.find(candidate => candidate.argument === controller.argument);
        const controlledParticipant = target ? meaning.roles[target.semanticRole] : null;
        return {
          argument: controller.argument,
          feature: controller.feature,
          value: controlledParticipant?.features?.[controller.feature] ?? null
        };
      });
      return {
        argument: item.argument,
        semanticRole: item.semanticRole,
        syntacticFunction: item.syntacticFunction,
        caseExponent: item.caseExponent ? structuredClone(item.caseExponent) : null,
        participant: participant ? structuredClone(participant) : null,
        lexicalSense: senseReference,
        agreementControllers
      };
    });
    return {
      construction: transfer.construction,
      conceptId: transfer.conceptId,
      arguments: runtimeArguments
    };
  }

  return Object.freeze({transferFor, validateMeaning, validateReading, projectMeaning, coreRefForSense});
}
