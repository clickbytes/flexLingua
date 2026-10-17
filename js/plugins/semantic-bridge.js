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
    const candidates = transferPlans.filter(item =>
      (item.stateKind !== undefined
        ? meaning?.type === 'state' && meaning.kind === item.stateKind
        : meaning?.concept === item.conceptId) &&
      (construction === undefined || construction === item.construction));
    if (candidates.length !== 1) {
      const identity = meaning?.type === 'state' ? `state.${String(meaning.kind)}` :
        String(meaning?.concept);
      fail('PLUGIN_CAPABILITY_UNAVAILABLE', candidates.length
        ? `Meaning ${identity} has multiple transfer plans; specify a construction.`
        : `No semantic transfer is declared for ${identity}.`);
    }
    return candidates[0];
  }

  function validateMeaning(meaning, transfer) {
    if (transfer?.stateKind !== undefined) {
      const frame = core.ontology?.stateFrames?.[transfer.stateKind];
      const stateFields = new Set(['features', 'kind', 'roles', 'type', 'version']);
      if (transfer.stateKind === 'predication') stateFields.add('predicate');
      if (['location', 'existence'].includes(transfer.stateKind)) stateFields.add('relation');
      const stateFieldsMatch = isRecord(meaning) &&
        Object.keys(meaning).length === stateFields.size &&
        Object.keys(meaning).every(key => stateFields.has(key));
      const hasAnaphoricReferent = isRecord(meaning?.roles) &&
        Object.values(meaning.roles).some(participant => participant?.referent?.kind === 'anaphoric');
      const hasPossessor = isRecord(meaning?.roles) &&
        Object.values(meaning.roles).some(participant =>
          isRecord(participant) && Object.hasOwn(participant, 'possessor'));
      const supportedStateVersion = typeof meaning?.version === 'string' &&
        ['1.3', '1.5', '1.31', '1.6', '1.8'].includes(meaning.version) &&
        (meaning.version === '1.6') === (meaning.kind === 'existence') &&
        (meaning.version === '1.8') === hasAnaphoricReferent &&
        (meaning.kind === 'classification'
          ? meaning.version === '1.31' || (meaning.version === '1.8' && hasAnaphoricReferent)
          : meaning.version !== '1.31') &&
        (!hasPossessor || meaning.version === '1.5');
      if (!isRecord(meaning) || meaning.type !== 'state' ||
          meaning.kind !== transfer.stateKind || !supportedStateVersion ||
          !isRecord(meaning.roles) || !isRecord(meaning.features) ||
          !stateFieldsMatch || !frame ||
          Object.keys(meaning.roles).length !== frame.roles.length ||
          frame.roles.some(role => !Object.hasOwn(meaning.roles, role)) ||
          transfer.arguments.length !== frame.roles.length ||
          frame.roles.some(role => !transfer.arguments.some(item => item.semanticRole === role))) {
        fail('PLUGIN_RESULT_INVALID', 'Invalid state or role frame.');
      }
      for (const role of frame.roles) {
        const participant = meaning.roles[role];
        const referent = participant?.referent;
        const agreement = participant?.agreement;
        const typedReferent = isRecord(participant) &&
          Object.keys(participant).sort().join(',') === 'agreement,referent' &&
          isRecord(referent) && isRecord(agreement) &&
          ['first', 'second', 'third'].includes(agreement.person) &&
          ['singular', 'plural'].includes(agreement.number) &&
          (Object.keys(referent).sort().join(',') === 'anchor,kind' &&
            referent.kind === 'deictic' &&
            Object.keys(agreement).sort().join(',') === 'number,person' &&
            ['speaker', 'addressee', 'demonstrative'].includes(referent.anchor) &&
            (referent.anchor === 'speaker' ? agreement.person === 'first' :
              referent.anchor === 'addressee' ? agreement.person === 'second' :
                agreement.person === 'third' && agreement.number === 'singular') ||
           Object.keys(referent).sort().join(',') === 'kind,resolution' &&
            referent.kind === 'anaphoric' && referent.resolution === 'unresolved' &&
            agreement.person === 'third' && agreement.number === 'singular' &&
            Object.keys(agreement).sort().join(',') === 'gender,number,person' &&
            ['feminine', 'masculine'].includes(agreement.gender));
        const conceptId = typedReferent ? 'person' : participant?.concept;
        if (!isRecord(participant) || (Object.hasOwn(participant, 'referent') && !typedReferent) ||
            typeof conceptId !== 'string' || !core.ontology.isA(conceptId, frame.roleTypes[role])) {
          fail('PLUGIN_RESULT_INVALID', `Invalid state participant for semantic role ${role}.`);
        }
        if (typedReferent) continue;
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
      ...(transfer.stateKind === undefined ? {conceptId: transfer.conceptId} :
        {stateKind: transfer.stateKind}),
      meaning: structuredClone(meaning),
      features: structuredClone(meaning.features),
      arguments: runtimeArguments
    };
  }

  function realizationTrace(meaning, transfer, informationLoss) {
    const projection = projectMeaning(meaning, transfer);
    if (!Array.isArray(informationLoss)) {
      fail('PLUGIN_RESULT_INVALID', 'Realizer informationLoss trace must be an array.');
    }

    const semanticFeatures = [];
    const collect = (value, path) => {
      if (!isRecord(value)) return;
      for (const [key, item] of Object.entries(value)) {
        const segment = key.replace(/~/gu, '~0').replace(/\//gu, '~1');
        const itemPath = `${path}/${segment}`;
        if (isRecord(item)) collect(item, itemPath);
        else semanticFeatures.push({path: itemPath, feature: key});
      }
    };
    collect(meaning.features, '#/features');
    for (const [role, participant] of Object.entries(meaning.roles || {})) {
      const rolePath = role.replace(/~/gu, '~0').replace(/\//gu, '~1');
      collect(participant?.features, `#/roles/${rolePath}/features`);
      if (participant?.quantity !== undefined) {
        semanticFeatures.push({path: `#/roles/${rolePath}/quantity`, feature: 'quantity'});
      }
    }
    if (meaning.quantity !== undefined) {
      semanticFeatures.push({path: '#/quantity', feature: 'quantity'});
    }

    const losses = new Map();
    for (const item of informationLoss) {
      if (!isRecord(item) || typeof item.path !== 'string' ||
          typeof item.feature !== 'string' || typeof item.cause !== 'string' ||
          !['unavoidable', 'unsupported', 'ambiguous'].includes(item.status) ||
          losses.has(item.path)) {
        fail('PLUGIN_RESULT_INVALID', 'Realizer supplied an invalid or duplicate informationLoss trace.');
      }
      if (!semanticFeatures.some(feature =>
        feature.path === item.path && feature.feature === item.feature)) {
        fail('PLUGIN_RESULT_INVALID', `Realizer informationLoss does not match a meaning feature: ${item.path}.`);
      }
      losses.set(item.path, item);
    }

    if (JSON.stringify(projection.meaning) !== JSON.stringify(meaning)) {
      fail('PLUGIN_RESULT_INVALID', 'Semantic bridge dropped meaning during realization projection.');
    }
    return semanticFeatures.map(feature => {
      const loss = losses.get(feature.path);
      return {...feature, status: !loss ? 'preserved'
        : loss.status === 'unsupported' ? 'unsupported' : 'neutralized'};
    });
  }

  return Object.freeze({transferFor, validateMeaning, validateReading, projectMeaning,
    realizationTrace, coreRefForSense});
}
