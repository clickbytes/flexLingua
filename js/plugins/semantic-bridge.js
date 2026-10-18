import {PluginError} from './errors.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const QUESTION_POLICY_ID = 'question.yes-no.visual-perception.present-positive.nominal-singular';
const QUESTION_EVENT_VERSION = '0.2';
const hasExactKeys = (value, keys) =>
  isRecord(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

/**
 * ADR person-deixis deictic participant contract, identical to the state-role
 * branch in validateMeaning: `{referent:{kind:"deictic",anchor},agreement:{person,number}}`
 * with anchor/person consistency (speaker↔first, addressee↔second,
 * demonstrative↔third/singular). Anaphoric participants are deliberately not
 * accepted here; unresolved anaphora keeps its own bounded refusal behavior.
 */
function holdsDeicticParticipantContract(participant) {
  if (!isRecord(participant) ||
      Object.keys(participant).sort().join(',') !== 'agreement,referent' ||
      !isRecord(participant.referent) || !isRecord(participant.agreement) ||
      Object.keys(participant.referent).sort().join(',') !== 'anchor,kind' ||
      participant.referent.kind !== 'deictic' ||
      Object.keys(participant.agreement).sort().join(',') !== 'number,person' ||
      !['speaker', 'addressee', 'demonstrative'].includes(participant.referent.anchor) ||
      !['first', 'second', 'third'].includes(participant.agreement.person) ||
      !['singular', 'plural'].includes(participant.agreement.number)) {
    return false;
  }
  if (participant.referent.anchor === 'speaker') {
    return participant.agreement.person === 'first';
  }
  if (participant.referent.anchor === 'addressee') {
    return participant.agreement.person === 'second';
  }
  return participant.agreement.person === 'third' &&
    participant.agreement.number === 'singular';
}

/**
 * Resolves the verb-agreement number for an exact-quantity participant from the
 * language quantity profile (`nounPhrase.quantity`), mirroring the CORE
 * `numberForQuantity`/`agreementNumberForQuantity` chain: an agreement override
 * for the value wins, otherwise the profile maps the value (or the default
 * number) to a grammatical number. Quantity participants carry no number
 * feature in CORE meanings, so controllers for them resolve from the profile.
 */
function quantityAgreementNumber(participant, quantityModel) {
  const quantity = participant?.quantity;
  if (!isRecord(quantity) || quantity.kind !== 'exact' ||
      !Number.isInteger(quantity.value) || quantity.value < 0 || quantity.value > 20 ||
      !isRecord(quantityModel)) {
    return null;
  }
  const mapped = isRecord(quantityModel.exactNumber) &&
      typeof quantityModel.exactNumber[String(quantity.value)] === 'string'
    ? quantityModel.exactNumber[String(quantity.value)]
    : quantityModel.defaultNumber;
  if (typeof mapped !== 'string' || !mapped) return null;
  const override = Array.isArray(quantityModel.agreementOverrides)
    ? quantityModel.agreementOverrides.find(rule => isRecord(rule) && Array.isArray(rule.values) &&
        rule.values.includes(quantity.value))
    : null;
  return typeof override?.number === 'string' && override.number ? override.number : mapped;
}

function agreementControllerValue(participant, feature, quantityModel) {
  const direct = participant?.features?.[feature] ?? participant?.agreement?.[feature] ?? null;
  if (direct !== null && direct !== undefined) return direct;
  return feature === 'number' ? quantityAgreementNumber(participant, quantityModel) : null;
}


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
  const quantityModel = Object.values(plan.modules)
    .map(module => isRecord(module) ? module?.nounPhrase?.quantity : null)
    .find(isRecord) ?? null;

  function transferFor(meaning, construction) {
    const candidates = transferPlans.filter(item => {
      const matchesMeaning = item.kind === 'question'
        ? meaning?.type === 'question' && meaning.questionType === item.questionType &&
          meaning.proposition?.type === 'event' &&
          meaning.proposition.concept === item.propositionTransfer?.conceptId
        : item.stateKind !== undefined
          ? meaning?.type === 'state' && meaning.kind === item.stateKind
          : meaning?.type === 'event' && meaning?.concept === item.conceptId;
      return matchesMeaning && (construction === undefined || construction === item.construction);
    });
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
    if (transfer?.kind === 'question') {
      if (transfer.policyId !== QUESTION_POLICY_ID ||
          transfer.construction !== 'question.yes-no' || transfer.questionType !== 'yes_no' ||
          transfer.propositionConstruction !== 'event.visual_perception' ||
          transfer.propositionTransfer?.construction !== transfer.propositionConstruction ||
          transfer.propositionTransfer?.conceptId !== 'event.visual_perception' ||
          transfer.propositionTransfer?.kind === 'question') {
        fail('PLUGIN_GRAPH_INVALID', 'Compiled question transfer violates its declared policy.');
      }
      const proposition = meaning?.proposition;
      if (!hasExactKeys(meaning, ['proposition', 'questionType', 'type', 'version']) ||
          meaning.version !== '1.19' || meaning.type !== 'question' ||
          meaning.questionType !== 'yes_no' ||
          !hasExactKeys(proposition, ['concept', 'features', 'roles', 'type', 'version']) ||
          proposition.version !== QUESTION_EVENT_VERSION || proposition.type !== 'event' ||
          proposition.concept !== 'event.visual_perception' ||
          !hasExactKeys(proposition.features, ['aspect', 'polarity', 'tense']) ||
          proposition.features.tense !== 'present' || proposition.features.polarity !== 'positive' ||
          !['unknown', 'imperfective'].includes(proposition.features.aspect) ||
          !hasExactKeys(proposition.roles, ['agent', 'theme'])) {
        fail('PLUGIN_CAPABILITY_UNAVAILABLE', 'Question is outside the bounded visual-perception policy.');
      }
      for (const role of ['agent', 'theme']) {
        const participant = proposition.roles[role];
        if (!hasExactKeys(participant, ['concept', 'features']) ||
            typeof participant.concept !== 'string' ||
            !hasExactKeys(participant.features, ['definiteness', 'number']) ||
            participant.features.number !== 'singular' ||
            !['definite', 'indefinite', 'unknown'].includes(participant.features.definiteness)) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE',
            `Question participant is outside the bounded nominal policy for ${role}.`);
        }
        let participantConcept;
        try {
          participantConcept = core.resolve({kind: 'concept', id: participant.concept});
        } catch (error) {
          fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown CORE reference for ${role}.`, error);
        }
        if (participantConcept.type !== 'entity' || !core.ontology.isA(participant.concept, 'entity')) {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE',
            `Question participant is not a nominal CORE entity for ${role}.`);
        }
      }
      validateMeaning(proposition, transfer.propositionTransfer);
      return true;
    }
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
          Object.keys(meaning.features).sort().join(',') !== 'polarity,tense' ||
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
        // ADR person-deixis: event roles may carry deictic participants without a
        // CORE concept; they are identity anchors, not entity references.
        if (!holdsDeicticParticipantContract(participant)) {
          fail('PLUGIN_CORE_REFERENCE_INVALID', `Participant has no typed CORE reference for role ${role}.`);
        }
        continue;
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
    if (transfer.kind === 'question') {
      return {
        kind: 'question',
        construction: transfer.construction,
        questionType: transfer.questionType,
        propositionConstruction: transfer.propositionConstruction,
        policyId: transfer.policyId,
        meaning: structuredClone(meaning),
        propositionTransfer: projectMeaning(meaning.proposition,
          transfer.propositionTransfer, senses)
      };
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
          value: agreementControllerValue(controlledParticipant, controller.feature, quantityModel)
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
    const semanticMeaning = transfer.kind === 'question' ? meaning.proposition : meaning;
    const prefix = transfer.kind === 'question' ? '#/proposition' : '#';
    collect(semanticMeaning.features, `${prefix}/features`);
    for (const [role, participant] of Object.entries(semanticMeaning.roles || {})) {
      const rolePath = role.replace(/~/gu, '~0').replace(/\//gu, '~1');
      collect(participant?.features, `${prefix}/roles/${rolePath}/features`);
      if (participant?.quantity !== undefined) {
        semanticFeatures.push({path: `${prefix}/roles/${rolePath}/quantity`, feature: 'quantity'});
      }
    }
    if (semanticMeaning.quantity !== undefined) {
      semanticFeatures.push({path: `${prefix}/quantity`, feature: 'quantity'});
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
