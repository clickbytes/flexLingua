import {PluginError} from './errors.js';
import {validateLanguageGraph} from './graph.js';
import {safeName} from '../core/features.js';
import {normalizeLinearizations, defaultLinearizationId} from '../core/linearization.js';

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const REFERENCE_ID = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/u;
const QUESTION_POLICY_ID = 'question.yes-no.visual-perception.present-positive.nominal-singular';
const LAYERS = Object.freeze([
  'identity', 'signal', 'lexicon', 'morphology', 'syntax', 'bridge', 'pragmatics', 'evidence'
]);
const hasOwn = (value, key) => Object.hasOwn(value, key);
const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const safeId = value => typeof value === 'string' && IDENTIFIER.test(value) &&
  !value.split(/[._-]/u).some(part => ['constructor', 'prototype', '__proto__'].includes(part));
const safeReferenceId = value => typeof value === 'string' && value.length <= 100 &&
  REFERENCE_ID.test(value) &&
  !value.split('.').some(part => ['constructor', 'prototype', '__proto__'].includes(part));

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const inner of Object.values(value)) freezeDeep(inner, seen);
  return Object.freeze(value);
}

function assertJsonValue(value, label, seen = new WeakSet(), depth = 0, budget = {count: 0}) {
  budget.count++;
  if (budget.count > 250000 || depth > 64) fail('PLUGIN_MODULE_MISSING',
    `${label} exceeds the supported module size or nesting limit.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value)) {
    fail('PLUGIN_MODULE_MISSING', `${label} must contain acyclic JSON values only.`);
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    fail('PLUGIN_MODULE_MISSING', `${label} contains a non-JSON object.`);
  }
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    assertJsonValue(child, label, seen, depth + 1, budget);
  }
  seen.delete(value);
}

function resolveConcept(core, conceptId, context) {
  if (typeof conceptId !== 'string' || !conceptId || conceptId.length > 100) {
    fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid concept ID in ${context}.`);
  }
  try {
    return core.resolve({kind: 'concept', id: conceptId});
  } catch (error) {
    fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown CORE concept in ${context}: ${conceptId}.`, error);
  }
}

function scanReferences(value, core, senseIds, label, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 64 || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    if (hasOwn(value, 'conceptId')) resolveConcept(core, value.conceptId, label);
    if (hasOwn(value, 'coreRef')) {
      if (!isRecord(value.coreRef)) fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid CORE reference in ${label}.`);
      try {
        core.resolve(value.coreRef);
      } catch (error) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown CORE reference in ${label}.`, error);
      }
      if (typeof value.id === 'string') {
        if (!safeReferenceId(value.id)) fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid sense ID in ${label}.`);
        const reference = JSON.stringify(value.coreRef);
        if (senseIds.has(value.id) && senseIds.get(value.id) !== reference) {
          fail('PLUGIN_CORE_REFERENCE_INVALID', `Conflicting sense ID: ${value.id}.`);
        }
        senseIds.set(value.id, reference);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'senseId' && !safeReferenceId(child)) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Invalid sense ID in ${label}.`);
      }
      scanReferences(child, core, senseIds, label, seen, depth + 1);
    }
  } else {
    for (const child of value) scanReferences(child, core, senseIds, label, seen, depth + 1);
  }
  seen.delete(value);
}

function checkSenseReferences(value, senseIds, label, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 64 || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) checkSenseReferences(child, senseIds, label, seen, depth + 1);
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'senseId' && !senseIds.has(child)) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown sense ID in ${label}: ${child}.`);
      }
      checkSenseReferences(child, senseIds, label, seen, depth + 1);
    }
  }
  seen.delete(value);
}

function validateCaseExponent(value, context) {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'kind,value' ||
      !['case', 'adposition', 'position', 'zero'].includes(value.kind)) {
    fail('PLUGIN_GRAPH_INVALID', `Invalid case exponent in ${context}.`);
  }
  if (value.kind === 'zero' ? value.value !== null : !safeId(value.value)) {
    fail('PLUGIN_GRAPH_INVALID', `Invalid case exponent value in ${context}.`);
  }
  return {kind: value.kind, value: value.value};
}

function collectFeatureDimensions(modules) {
  const dimensions = new Map();
  for (const [moduleName, data] of Object.entries(modules)) {
    const sources = [data.dimensions, data.featureProfile?.dimensions].filter(value => value !== undefined);
    for (const source of sources) {
      if (!isRecord(source)) fail('PLUGIN_GRAPH_INVALID', `Invalid feature dimensions in ${moduleName}.`);
      for (const [dimension, rawValues] of Object.entries(source)) {
        if (!safeName(dimension)) fail('PLUGIN_GRAPH_INVALID', `Invalid feature dimension in ${moduleName}.`);
        const values = Array.isArray(rawValues) ? rawValues
          : isRecord(rawValues) && Array.isArray(rawValues.values) ? rawValues.values : null;
        if (!values || values.some(value => !safeName(value)) || new Set(values).size !== values.length) {
          fail('PLUGIN_GRAPH_INVALID', `Invalid values for feature dimension ${dimension}.`);
        }
        const normalized = [...values].sort();
        if (dimensions.has(dimension) &&
            JSON.stringify(dimensions.get(dimension)) !== JSON.stringify(normalized)) {
          fail('PLUGIN_GRAPH_INVALID', `Conflicting declarations for feature dimension ${dimension}.`);
        }
        dimensions.set(dimension, normalized);
      }
    }
  }
  return dimensions;
}

function compileTransfers(graph, modules, core, senseIds, capabilities, featureDimensions) {
  const transferPlans = [];
  const questionDeclarations = [];
  const seen = new Set();
  const bridgeNodes = graph.nodes.filter(node => node.type === 'bridge');
  const compiledBridgeModules = new Set();
  for (const node of bridgeNodes) {
    if (compiledBridgeModules.has(node.module)) continue;
    compiledBridgeModules.add(node.module);
    const data = modules[node.module];
    if (!Array.isArray(data.transfers)) {
      if (graph.nodes.some(item => item.type === 'syntax' && item.capability &&
          graph.edges.some(edge => edge.relation === 'maps-to' && edge.from === node.id && edge.to === item.id))) {
        fail('PLUGIN_GRAPH_INVALID', `Bridge module ${node.module} requires a transfers array.`);
      }
      continue;
    }
    for (const [index, transfer] of data.transfers.entries()) {
      const label = `${node.module}.transfers[${index}]`;
      if (isRecord(transfer) && hasOwn(transfer, 'questionType')) {
        const fields = ['construction', 'policyId', 'propositionConstruction', 'questionType'];
        if (Object.keys(transfer).length !== fields.length ||
            fields.some(key => !hasOwn(transfer, key)) ||
            !safeId(transfer.construction) || transfer.construction !== 'question.yes-no' ||
            transfer.questionType !== 'yes_no' ||
            transfer.propositionConstruction !== 'event.visual_perception' ||
            transfer.policyId !== QUESTION_POLICY_ID) {
          fail('PLUGIN_GRAPH_INVALID', `Invalid bounded question transfer at ${label}.`);
        }
        const duplicateKey = `${transfer.construction}\u0000question:${transfer.questionType}`;
        if (seen.has(duplicateKey)) fail('PLUGIN_GRAPH_INVALID', `Duplicate transfer plan at ${label}.`);
        seen.add(duplicateKey);
        for (const operation of ['analyze', 'realize']) {
          if (!capabilities.some(item => item.channel === 'sentence' && item.operation === operation &&
              item.status === 'implemented' && item.construction === transfer.construction)) {
            fail('PLUGIN_GRAPH_INVALID',
              `Question transfer lacks an implemented ${operation} capability at ${label}.`);
          }
          if (!capabilities.some(item => item.channel === 'sentence' && item.operation === operation &&
              item.status === 'implemented' && item.construction === transfer.propositionConstruction)) {
            fail('PLUGIN_GRAPH_INVALID',
              `Question proposition lacks an implemented ${operation} capability at ${label}.`);
          }
        }
        questionDeclarations.push({
          construction: transfer.construction,
          questionType: transfer.questionType,
          propositionConstruction: transfer.propositionConstruction,
          policyId: transfer.policyId,
          label
        });
        continue;
      }
      const required = ['construction', 'arguments'];
      const optional = ['conceptId', 'stateKind', 'senseId'];
      const hasConcept = isRecord(transfer) && hasOwn(transfer, 'conceptId');
      const hasState = isRecord(transfer) && hasOwn(transfer, 'stateKind');
      if (!isRecord(transfer) || required.some(key => !hasOwn(transfer, key)) ||
          Object.keys(transfer).some(key => !required.includes(key) && !optional.includes(key)) ||
          hasConcept === hasState ||
          !safeId(transfer.construction) || !Array.isArray(transfer.arguments) ||
          !transfer.arguments.length || transfer.arguments.length > 32) {
        fail('PLUGIN_GRAPH_INVALID', `Invalid transfer plan at ${label}.`);
      }
      const capability = capabilities.find(item => item.channel === 'sentence' &&
        item.status === 'implemented' && item.construction === transfer.construction);
      if (!capability) fail('PLUGIN_GRAPH_INVALID', `Transfer has no implemented capability at ${label}.`);
      const stateFrame = hasState ? core.ontology?.stateFrames?.[transfer.stateKind] : null;
      if (hasState && (!safeId(transfer.stateKind) || !stateFrame)) {
        fail('PLUGIN_GRAPH_INVALID', `Unknown CORE state kind at ${label}: ${String(transfer.stateKind)}.`);
      }
      const concept = hasConcept ? resolveConcept(core, transfer.conceptId, label) : null;
      const semanticRoles = stateFrame?.roles ?? concept?.roles;
      const transferTarget = hasState ? `state:${transfer.stateKind}` : transfer.conceptId;
      const syntaxFrame = graph.nodes.filter(item => item.type === 'syntax')
        .map(item => hasState ? modules[item.module]?.states?.frames?.[transfer.stateKind]
          : modules[item.module]?.frames?.[transfer.conceptId]).find(isRecord);
      const duplicateKey = `${transfer.construction}\u0000${transferTarget}`;
      if (seen.has(duplicateKey)) fail('PLUGIN_GRAPH_INVALID', `Duplicate transfer plan at ${label}.`);
      seen.add(duplicateKey);
      if (transfer.senseId !== undefined && !senseIds.has(transfer.senseId)) {
        fail('PLUGIN_CORE_REFERENCE_INVALID', `Unknown sense ID at ${label}: ${transfer.senseId}.`);
      }
      const roles = new Set(), argumentsById = new Set();
      const args = transfer.arguments.map((argument, argumentIndex) => {
        const at = `${label}.arguments[${argumentIndex}]`;
        const requiredFields = ['role', 'argument', 'syntacticFunction'];
        const optionalFields = ['caseExponent', 'agreementControllers'];
        if (!isRecord(argument) || requiredFields.some(key => !hasOwn(argument, key)) ||
            Object.keys(argument).some(key => !requiredFields.includes(key) && !optionalFields.includes(key)) ||
            typeof argument.role !== 'string' || !argument.role || argument.role.length > 64 ||
            !safeId(argument.argument) ||
            !safeId(argument.syntacticFunction) || !Array.isArray(semanticRoles) ||
            !semanticRoles.includes(argument.role)) {
          fail('PLUGIN_GRAPH_INVALID', `Invalid semantic role or argument at ${at}.`);
        }
        if (roles.has(argument.role) || argumentsById.has(argument.argument)) {
          fail('PLUGIN_GRAPH_INVALID', `Duplicate role or syntactic argument at ${at}.`);
        }
        roles.add(argument.role);
        argumentsById.add(argument.argument);
        const caseExponent = hasOwn(argument, 'caseExponent')
          ? validateCaseExponent(argument.caseExponent, at) : null;
        if (caseExponent?.kind === 'case' &&
            !featureDimensions.get('case')?.includes(caseExponent.value)) {
          fail('PLUGIN_GRAPH_INVALID', `Unknown grammatical case exponent at ${at}.`);
        }
        if (caseExponent?.kind === 'adposition') {
          fail('PLUGIN_CAPABILITY_UNAVAILABLE',
            `Adposition case exponent has no compiled parse/realize strategy at ${at}.`);
        }
        if (caseExponent?.kind === 'position') {
          const sequences = syntaxFrame?.linearizations;
          if (caseExponent.value !== argument.syntacticFunction ||
              !Array.isArray(sequences) || !sequences.length ||
              sequences.some(sequence => !Array.isArray(sequence) ||
                !sequence.includes(argument.role)) ||
              hasOwn(syntaxFrame.cases ?? {}, argument.role)) {
            fail('PLUGIN_GRAPH_INVALID',
              `Position case exponent is not licensed by the syntax frame at ${at}.`);
          }
        }
        const rawControllers = hasOwn(argument, 'agreementControllers')
          ? argument.agreementControllers : [];
        if (!Array.isArray(rawControllers) || rawControllers.length > 16) {
          fail('PLUGIN_GRAPH_INVALID', `Invalid agreement controllers at ${at}.`);
        }
        const agreementControllers = rawControllers.map(controller => {
          if (!isRecord(controller) || Object.keys(controller).sort().join(',') !== 'argument,feature' ||
              !safeId(controller.argument) || !safeId(controller.feature) ||
              !featureDimensions.has(controller.feature)) {
            fail('PLUGIN_GRAPH_INVALID', `Invalid agreement controller at ${at}.`);
          }
          return {argument: controller.argument, feature: controller.feature};
        });
        return {
          semanticRole: argument.role,
          argument: argument.argument,
          syntacticFunction: argument.syntacticFunction,
          caseExponent,
          agreementControllers
        };
      });
      for (const argument of args) {
        for (const controller of argument.agreementControllers) {
          if (!argumentsById.has(controller.argument)) {
            fail('PLUGIN_GRAPH_INVALID',
              `Controller refers to an unknown argument in ${label}: ${controller.argument}.`);
          }
        }
      }
      if (stateFrame && stateFrame.roles.some(role => !roles.has(role))) {
        fail('PLUGIN_GRAPH_INVALID', `State transfer does not map every required CORE role at ${label}.`);
      }
      transferPlans.push({
        construction: transfer.construction,
        ...(hasConcept ? {conceptId: transfer.conceptId} : {stateKind: transfer.stateKind}),
        ...(transfer.senseId === undefined ? {} : {senseId: transfer.senseId}),
        arguments: args
      });
    }
  }

  for (const declaration of questionDeclarations) {
    const candidates = transferPlans.filter(item =>
      item.construction === declaration.propositionConstruction &&
      item.conceptId === 'event.visual_perception' && item.kind !== 'question');
    if (candidates.length !== 1) {
      fail('PLUGIN_GRAPH_INVALID',
        `Question proposition transfer is missing or ambiguous at ${declaration.label}.`);
    }
    const propositionTransfer = candidates[0];
    if (propositionTransfer.construction === declaration.construction ||
        propositionTransfer.kind === 'question') {
      fail('PLUGIN_GRAPH_INVALID', `Cyclic or nested question transfer at ${declaration.label}.`);
    }
    transferPlans.push({
      kind: 'question',
      construction: declaration.construction,
      questionType: declaration.questionType,
      propositionConstruction: declaration.propositionConstruction,
      policyId: declaration.policyId,
      propositionTransfer: structuredClone(propositionTransfer)
    });
  }

  const expected = new Set(capabilities.filter(item => item.channel === 'sentence' &&
    item.status === 'implemented').map(item => item.construction));
  const compiled = new Set(transferPlans.map(item => item.construction));
  for (const construction of expected) {
    if (!compiled.has(construction)) {
      fail('PLUGIN_GRAPH_INVALID', `Implemented sentence capability has no semantic transfer: ${construction}.`);
    }
  }
  return transferPlans.sort((a, b) => {
    const left = a.policyId ?? a.conceptId ?? a.stateKind;
    const right = b.policyId ?? b.conceptId ?? b.stateKind;
    return a.construction < b.construction ? -1 : a.construction > b.construction ? 1 :
      left < right ? -1 : left > right ? 1 : 0;
  });
}

function compileLinearizationPlans(graph, modules, transferPlans, core) {
  const framePlans = Object.create(null);
  const constructions = Object.create(null);
  const seenSyntaxModules = new Set();
  const addFrames = (frames, kind, moduleName) => {
    if (!isRecord(frames)) return;
    for (const [frameId, frame] of Object.entries(frames).sort(([left],[right]) =>
      left < right ? -1 : left > right ? 1 : 0)) {
      if (!isRecord(frame) || !Array.isArray(frame.linearizations)) continue;
      const transfers = transferPlans.filter(item => kind === 'event'
        ? item.conceptId === frameId : item.stateKind === frameId);
      let normalized;
      try {
        normalized = normalizeLinearizations(frame.linearizations, `${moduleName}.${frameId}`);
      } catch (error) {
        fail('PLUGIN_GRAPH_INVALID',
          `Invalid linearizations for ${moduleName}.${frameId} (${transfers.map(item=>
            item.construction).join(', ') || 'no transfer'}): ${error.message}`, error);
      }
      const surfaceEnabled=normalized.variants.length>0;
      const reservedIds=new Set(normalized.variants.map(variant=>variant.variantId));
      const defaults=normalized.defaultSequences.map((sequence,index)=>{
        const id=surfaceEnabled?defaultLinearizationId(sequence,reservedIds,index===0):null;
        if(id)reservedIds.add(id);
        return {sequence,id,surfaceEnabled,isDefault:true,realizationPreference:null};
      });
      const variants=normalized.variants.slice().sort((left,right)=>
        left.variantId<right.variantId?-1:left.variantId>right.variantId?1:0)
        .map(variant=>({sequence:variant.sequence,id:variant.variantId,
          surfaceEnabled:true,isDefault:false,
          realizationPreference:variant.realizationPreference}));
      const frameKey=`${kind}:${frameId}`;
      const plans=[...defaults,...variants];
      framePlans[frameKey]=plans;
      if (!transfers.length) {
        if (normalized.variants.length) fail('PLUGIN_CAPABILITY_UNAVAILABLE',
          `No implemented semantic transfer licenses variants for ${moduleName}.${frameId}.`);
        continue;
      }
      for (const transfer of transfers) {
        const semanticFrame = kind === 'event' ? core.ontology.get(frameId)
          : core.ontology.stateFrames[frameId];
        const requiredRoles = (semanticFrame?.roles ?? []).filter(role =>
          !(semanticFrame?.optionalRoles ?? []).includes(role));
        const mappedRoles = new Set(transfer.arguments.map(argument => argument.semanticRole));
        for (const [index, sequence] of normalized.sequences.entries()) {
          const variantId = index < normalized.defaultSequences.length
            ? `default:${index + 1}`
            : normalized.variants[index - normalized.defaultSequences.length].variantId;
          const label = `${transfer.construction}/${variantId} (${moduleName}.${frameId})`;
          const slots = sequence.filter(step => !step.startsWith('@'));
          if (slots.some(role => !mappedRoles.has(role)) ||
              requiredRoles.some(role => slots.filter(slot => slot === role).length !== 1) ||
              new Set(slots).size !== slots.length ||
              sequence.filter(step => step === '@verb').length !== 1) {
            fail('PLUGIN_GRAPH_INVALID', `Linearization roles do not match transfer at ${label}.`);
          }
        }
      }
      for (const variant of normalized.variants) {
        const slots = JSON.stringify(variant.sequence.slice().sort());
        if (!normalized.defaultSequences.some(sequence =>
            JSON.stringify(sequence.slice().sort()) === slots)) {
          fail('PLUGIN_GRAPH_INVALID',
            `Variant ${variant.variantId} must reorder an existing slot sequence at ${moduleName}.${frameId}.`);
        }
        const roleSlots = variant.sequence.filter(step => !step.startsWith('@'));
        for (const transfer of transfers) {
          const transferRoles = new Set(transfer.arguments.map(argument => argument.semanticRole));
          const unmappedRole = roleSlots.find(role => !transferRoles.has(role));
          if (unmappedRole) {
            fail('PLUGIN_GRAPH_INVALID',
              `Variant ${variant.variantId} has no bridge mapping for ${frameId}.${unmappedRole}.`);
          }
        }
      }
      for(const transfer of transfers) {
        const byFrame=constructions[transfer.construction] ??
          (constructions[transfer.construction]=Object.create(null));
        if(hasOwn(byFrame,frameKey))fail('PLUGIN_GRAPH_INVALID',
          `Duplicate linearization frame for ${transfer.construction}: ${frameKey}.`);
        byFrame[frameKey]={byVariant:Object.fromEntries(plans.flatMap((plan,index)=>
          plan.id?[ [plan.id,index] ]:[]))};
      }
    }
  };

  for (const node of graph.nodes.filter(item => item.type === 'syntax')) {
    if (seenSyntaxModules.has(node.module)) continue;
    seenSyntaxModules.add(node.module);
    const grammar = modules[node.module];
    if (!isRecord(grammar)) continue;
    addFrames(grammar.frames, 'event', node.module);
    addFrames(grammar.states?.frames, 'state', node.module);
  }

  return {frames:framePlans,constructions};
}

/** Compile validated graph declarations and independent module data into an immutable runtime plan. */
export function compileLanguageGraph(input = {}) {
  if (!isRecord(input) || Object.keys(input).some(key =>
      !['manifest', 'graph', 'modules', 'core'].includes(key)) ||
      !['manifest', 'graph', 'modules', 'core'].every(key => hasOwn(input, key))) {
    fail('PLUGIN_GRAPH_INVALID', 'Compiler requires manifest, graph, modules, and CORE input.');
  }
  const {manifest, graph, modules, core} = input;
  if (!isRecord(modules) || core === null || typeof core !== 'object' ||
      typeof core.resolve !== 'function') {
    fail('PLUGIN_GRAPH_INVALID', 'Compiler requires module records and a resolvable CORE.');
  }
  const normalizedGraph = validateLanguageGraph(graph, manifest);
  const normalizedModules = Object.create(null);
  for (const node of normalizedGraph.nodes) {
    if (!safeId(node.module) || !hasOwn(modules, node.module)) {
      fail('PLUGIN_MODULE_MISSING', `Missing graph module: ${node.module}.`);
    }
    if (!isRecord(modules[node.module])) {
      fail('PLUGIN_MODULE_MISSING', `Graph module must be a JSON object: ${node.module}.`);
    }
    if (!hasOwn(normalizedModules, node.module)) {
      assertJsonValue(modules[node.module], node.module);
      try {
        normalizedModules[node.module] = structuredClone(modules[node.module]);
      } catch (error) {
        fail('PLUGIN_MODULE_MISSING', `Cannot clone graph module: ${node.module}.`, error);
      }
    }
  }

  const senseIds = new Map();
  for (const moduleName of Object.keys(normalizedModules)) {
    scanReferences(normalizedModules[moduleName], core, senseIds, moduleName);
  }
  for (const moduleName of Object.keys(normalizedModules)) {
    checkSenseReferences(normalizedModules[moduleName], senseIds, moduleName);
  }
  const capabilities = Array.from(manifest.capabilities);
  const featureDimensions = collectFeatureDimensions(normalizedModules);
  const transferPlans = compileTransfers(normalizedGraph, normalizedModules, core,
    senseIds, capabilities, featureDimensions);
  const linearizationPlans = compileLinearizationPlans(normalizedGraph,
    normalizedModules, transferPlans, core);
  const layers = Object.create(null);
  for (const layer of LAYERS) {
    layers[layer] = normalizedGraph.nodes.filter(node => node.type === layer)
      .map(node => ({...node}));
  }
  return freezeDeep({
    schemaVersion: normalizedGraph.schemaVersion,
    language: normalizedGraph.language,
    capabilities: structuredClone(capabilities),
    nodes: normalizedGraph.nodes.map(node => ({...node})),
    edges: normalizedGraph.edges.map(edge => ({...edge})),
    layers,
    modules: normalizedModules,
    transferPlans,
    linearizationPlans
  });
}
