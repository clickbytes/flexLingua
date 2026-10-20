import {PluginError} from './errors.js';
import {meaningKey} from '../core/translation-result.js';
import {RESOURCE_LIMITS} from '../core/resource-limits.js';
import {snapshotBoundedJsonGraph} from '../core/bounded-json.js';
import {
  isCapabilityId, isConstructionId, isEvidenceId, isRoleId,
  isRolePathId, isSenseId, isVariantId
} from '../core/identifiers.js';

export const LANGUAGE_PLUGIN_CONTRACT_VERSION = '1.0';
export const PLUGIN_RESULT_STATUSES = Object.freeze([
  'ok', 'ambiguous', 'unsupported', 'invalid', 'resource_limit'
]);

const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const VERSION = /^\d+(?:\.\d+){0,2}$/u;
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CHANNEL_OPERATIONS = Object.freeze({
  sentence: new Set(['analyze', 'realize']),
  morphology: new Set(['generate', 'analyze', 'paradigm', 'availability']),
  lexicon: new Set(['lookup']),
  signal: new Set(['decode', 'encode'])
});
const PLUGIN_KEYS = [
  'contractVersion', 'code', 'describe', 'capabilities', 'analyze', 'realize',
  'morphology', 'lexicon', 'signal'
];
const REQUIRED_PLUGIN_KEYS = ['contractVersion', 'code', 'describe', 'capabilities'];
const MORPHOLOGY_METHODS = ['generate', 'analyze', 'paradigm', 'availability'];
const MORPHOLOGY_OPTIONAL_METHODS = ['inventory', 'describe'];
const MAX_CAPABILITIES = 512;
const MAX_EVIDENCE = 32;
const MAX_DIAGNOSTICS = 64;
const MAX_READINGS = 32;
const MAX_ALTERNATIVES = 32;
const MAX_REALIZATIONS = 32;
const MAX_SEGMENTS = 64;

const isRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const owns = (value, key) => Object.hasOwn(value, key);
const hasExactKeys = (value, required, optional = []) => isRecord(value) &&
  required.every(key => owns(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));

function fail(code, message, cause) {
  throw new PluginError(code, message, cause === undefined ? undefined : {cause});
}

function invalid(message, cause) {
  fail('PLUGIN_INVALID', message, cause);
}

function invalidResult(message, cause) {
  fail('PLUGIN_RESULT_INVALID', message, cause);
}

function validatePluginResultGraph(value, operation) {
  try {
    const limits = operation === 'analysis' ? {
      maxDepth: RESOURCE_LIMITS.interlinguaDepth + 3,
      maxNodes: RESOURCE_LIMITS.interlinguaNodes + MAX_READINGS * 3 + MAX_DIAGNOSTICS,
      maxBytes: RESOURCE_LIMITS.jsonGraphBytes
    } : undefined;
    return snapshotBoundedJsonGraph(value, limits);
  } catch (error) {
    if (error?.status === 'resource_limit') {
      fail('PLUGIN_RESOURCE_LIMIT', `Plugin ${operation} result exceeds its safety budget.`, error);
    }
    invalidResult(`Plugin ${operation} result is not a safe JSON-like graph.`, error);
  }
}

function syncCall(fn, name) {
  let result;
  try {
    result = fn();
  } catch (error) {
    invalid(`Plugin ${name}() failed validation.`, error);
  }
  if (result && (typeof result === 'object' || typeof result === 'function') &&
      typeof result.then === 'function') {
    invalid(`Plugin ${name}() must be synchronous.`);
  }
  return result;
}

/** Validate the serializable identity returned by LanguagePlugin.describe(). */
export function validatePluginDescription(description, expectedLanguage) {
  if (!hasExactKeys(description, ['language', 'version']) ||
      typeof description.language !== 'string' || !LANGUAGE_CODE.test(description.language) ||
      typeof description.version !== 'string' || !VERSION.test(description.version)) {
    invalid('Plugin description must contain a valid language and version.');
  }
  if (expectedLanguage !== undefined && description.language !== expectedLanguage) {
    invalid('Plugin description language does not match its code.');
  }
  return {language: description.language, version: description.version};
}

/** Validate one construction-level capability declaration and its review evidence. */
export function validateCapability(capability) {
  if (!hasExactKeys(capability,
      ['operation', 'channel', 'construction', 'status', 'evidence']) ||
      typeof capability.channel !== 'string' ||
      !owns(CHANNEL_OPERATIONS, capability.channel) ||
      typeof capability.operation !== 'string' ||
      !CHANNEL_OPERATIONS[capability.channel].has(capability.operation) ||
      typeof capability.construction !== 'string' ||
      !isCapabilityId(capability.construction) ||
      !['implemented', 'unsupported'].includes(capability.status) ||
      !Array.isArray(capability.evidence) || capability.evidence.length < 1 ||
      capability.evidence.length > MAX_EVIDENCE) {
    invalid('Invalid plugin capability declaration.');
  }

  const evidence = [];
  const seenEvidence = new Set();
  for (const item of Array.from(capability.evidence)) {
    if (!hasExactKeys(item, ['kind', 'id']) ||
        !['manual-sentence', 'manual-refusal'].includes(item.kind) ||
        !isEvidenceId(item.id)) {
      invalid('Plugin capability evidence must have a valid kind and stable ID.');
    }
    const key = `${item.kind}\u0000${item.id}`;
    if (seenEvidence.has(key)) invalid('Duplicate plugin capability evidence ID.');
    seenEvidence.add(key);
    evidence.push({kind: item.kind, id: item.id});
  }
  const expectedEvidenceKind = capability.status === 'implemented'
    ? 'manual-sentence' : 'manual-refusal';
  if (!evidence.some(item => item.kind === expectedEvidenceKind)) {
    invalid(`Capability status ${capability.status} requires ${expectedEvidenceKind} evidence.`);
  }
  return {
    operation: capability.operation,
    channel: capability.channel,
    construction: capability.construction,
    status: capability.status,
    evidence
  };
}

/** Validate a LanguagePlugin before registration; returns its checked description. */
export function validateLanguagePlugin(plugin) {
  if (!hasExactKeys(plugin, REQUIRED_PLUGIN_KEYS,
      PLUGIN_KEYS.filter(key => !REQUIRED_PLUGIN_KEYS.includes(key)))) {
    invalid('Invalid LanguagePlugin object or unknown plugin field.');
  }
  if (plugin.contractVersion !== LANGUAGE_PLUGIN_CONTRACT_VERSION) {
    fail('PLUGIN_VERSION_UNSUPPORTED', 'Unsupported LanguagePlugin contract version.');
  }
  if (typeof plugin.code !== 'string' || !LANGUAGE_CODE.test(plugin.code) ||
      typeof plugin.describe !== 'function' || typeof plugin.capabilities !== 'function') {
    invalid('LanguagePlugin requires a valid code, describe(), and capabilities().');
  }

  for (const name of ['analyze', 'realize']) {
    if (owns(plugin, name) && typeof plugin[name] !== 'function') {
      invalid(`LanguagePlugin ${name} must be a function when provided.`);
    }
  }
  for (const name of ['lexicon', 'signal']) {
    if (owns(plugin, name) && (!isRecord(plugin[name]) || !Object.keys(plugin[name]).length)) {
      invalid(`LanguagePlugin ${name} provider must be a non-empty object.`);
    }
  }

  const description = validatePluginDescription(
    syncCall(() => plugin.describe(), 'describe'), plugin.code);
  const rawCapabilities = syncCall(() => plugin.capabilities(), 'capabilities');
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length < 1 ||
      rawCapabilities.length > MAX_CAPABILITIES) {
    invalid(`Plugin capabilities() must return 1 to ${MAX_CAPABILITIES} declarations.`);
  }
  const capabilities = Array.from(rawCapabilities, validateCapability);
  const seen = new Set();
  for (const capability of capabilities) {
    const key = `${capability.channel}\u0000${capability.operation}\u0000${capability.construction}`;
    if (seen.has(key)) invalid('Duplicate plugin capability declaration.');
    seen.add(key);
  }

  for (const operation of ['analyze', 'realize']) {
    const rows = capabilities.filter(item => item.channel === 'sentence' &&
      item.operation === operation);
    const implemented = rows.some(item => item.status === 'implemented');
    if (implemented && typeof plugin[operation] !== 'function') {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Plugin declares implemented sentence ${operation} without a provider.`);
    }
    if (!rows.length && typeof plugin[operation] === 'function') {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        `Plugin provides sentence ${operation} without a capability declaration.`);
    }
  }

  const morphologyRows = capabilities.filter(item => item.channel === 'morphology');
  const morphologyImplemented = morphologyRows.some(item => item.status === 'implemented');
  if (morphologyImplemented && !owns(plugin, 'morphology')) {
    fail('PLUGIN_CAPABILITY_UNAVAILABLE',
      'Plugin declares implemented morphology without a morphology provider.');
  }
  if (owns(plugin, 'morphology')) {
    const provider = plugin.morphology;
    if (!isRecord(provider) || !hasExactKeys(provider, MORPHOLOGY_METHODS,
        MORPHOLOGY_OPTIONAL_METHODS) ||
        MORPHOLOGY_METHODS.some(method => typeof provider[method] !== 'function') ||
        MORPHOLOGY_OPTIONAL_METHODS.some(method => owns(provider, method) &&
          typeof provider[method] !== 'function')) {
      invalid('Morphology provider requires generate(), analyze(), paradigm(), and availability().');
    }
    if (!morphologyRows.length) {
      fail('PLUGIN_CAPABILITY_UNAVAILABLE',
        'Plugin provides morphology without a morphology capability declaration.');
    }
  }

  return description;
}

function validateDiagnosticList(diagnostics, resultName) {
  if (!Array.isArray(diagnostics) || diagnostics.length > MAX_DIAGNOSTICS) {
    invalidResult(`${resultName} diagnostics must be an array of at most ${MAX_DIAGNOSTICS} items.`);
  }
  return Array.from(diagnostics, item => {
    if (!hasExactKeys(item, ['code', 'message']) ||
        typeof item.code !== 'string' || !DIAGNOSTIC_CODE.test(item.code) ||
        typeof item.message !== 'string' || !item.message.trim() || item.message.length > 1024) {
      invalidResult(`${resultName} diagnostic requires a stable code and message.`);
    }
    return {code: item.code, message: item.message};
  });
}

function validateStringList(value, name, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    invalidResult(`${name} must be an array of at most ${maximum} strings.`);
  }
  const values = Array.from(value);
  if (values.some(item => typeof item !== 'string' || !item.trim() || item.length > 4096)) {
    invalidResult(`${name} contains an invalid string.`);
  }
  if (new Set(values).size !== values.length) invalidResult(`${name} contains duplicates.`);
  return values;
}

function validateSpan(value, name) {
  if(!hasExactKeys(value,['start','end'])||!Number.isSafeInteger(value.start)||
      !Number.isSafeInteger(value.end)||value.start<0||value.end<=value.start||value.end>4096) {
    invalidResult(`${name} must be a bounded UTF-16 span.`);
  }
  return {start:value.start,end:value.end};
}

function validateRealizationSegments(value,text) {
  if(!Array.isArray(value)||value.length>MAX_SEGMENTS)
    invalidResult('Realization segments must be a bounded array.');
  let formerEnd=0;
  return Array.from(value,(item,index)=>{
    if(!hasExactKeys(item,['text','targetSpan','meaningPaths','sources','decision'])||
        typeof item.text!=='string'||!item.text.trim()||item.text.length>4096||
        !Array.isArray(item.meaningPaths)||item.meaningPaths.length>16||
        !Array.isArray(item.sources)||item.sources.length>16||
        !hasExactKeys(item.decision,['kind','id'])||
        typeof item.decision.kind!=='string'||!item.decision.kind.trim()||
        typeof item.decision.id!=='string'||!item.decision.id.trim()) {
      invalidResult('Invalid realization segment.');
    }
    const targetSpan=validateSpan(item.targetSpan,'Segment targetSpan');
    if(targetSpan.start<formerEnd||text.slice(targetSpan.start,targetSpan.end)!==item.text)
      invalidResult('Realization segment target spans must match the output text in order.');
    formerEnd=targetSpan.end;
    const meaningPaths=validateStringList(item.meaningPaths,'segment meaningPaths',16);
    if(meaningPaths.some(path=>!path.startsWith('#/')))
      invalidResult('Segment meaningPaths must be MeaningGraph pointers.');
    const sources=Array.from(item.sources,source=>{
      if(!isRecord(source)||!meaningPaths.includes(source.meaningPath)||
          !['aligned','unavailable'].includes(source.status))
        invalidResult('Invalid segment source link.');
      if(source.status==='aligned') {
        if(!hasExactKeys(source,['meaningPath','status','span']))invalidResult('Aligned source links require a span.');
        return {meaningPath:source.meaningPath,status:source.status,
          span:validateSpan(source.span,'Segment source span')};
      }
      if(!hasExactKeys(source,['meaningPath','status','reason'])||
          typeof source.reason!=='string'||!source.reason.trim()||source.reason.length>128)
        invalidResult('Unavailable source links require a reason.');
      return {meaningPath:source.meaningPath,status:source.status,reason:source.reason};
    });
    return {text:item.text,targetSpan,meaningPaths,sources,
      decision:{kind:item.decision.kind,id:item.decision.id}};
  });
}

function validateRealizations(value) {
  if(!Array.isArray(value)||value.length>MAX_REALIZATIONS)
    invalidResult('Realizations must be a bounded array.');
  return Array.from(value,item=>{
    if(!hasExactKeys(item,['text','kind','assumptions','informationLoss'],['segments'])||
        typeof item.text!=='string'||!item.text.trim()||item.text.length>4096||
        !['equivalent_expression','additional_assumption'].includes(item.kind)||
        !Array.isArray(item.assumptions)||item.assumptions.length>16)
      invalidResult('Invalid complete realization.');
    const assumptions=Array.from(item.assumptions,assumption=>{
      if(!hasExactKeys(assumption,['path','feature','reason'])||
          typeof assumption.path!=='string'||!assumption.path.startsWith('#/')||
          typeof assumption.feature!=='string'||!assumption.feature.trim()||
          typeof assumption.reason!=='string'||!assumption.reason.trim()||assumption.reason.length>240)
        invalidResult('Invalid realization assumption.');
      return {path:assumption.path,feature:assumption.feature,reason:assumption.reason};
    });
    const informationLoss=validateInformationLoss(item.informationLoss);
    const segments=owns(item,'segments')?validateRealizationSegments(item.segments,item.text):undefined;
    if(item.kind==='additional_assumption'&&!assumptions.length&&!informationLoss.some(loss=>loss.status==='ambiguous'))
      invalidResult('An additional-assumption realization must explain its assumption.');
    return {text:item.text,kind:item.kind,assumptions,informationLoss,
      ...(segments===undefined?{}:{segments})};
  });
}

/** `incomplete` preserves licensed readings while diagnostics account for
 * distinct unsupported readings. A consumer must not treat one such reading
 * as a unique source meaning. Realization results do not use this status. */
export function normalizeAnalysisResult(result) {
  ({value: result} = validatePluginResultGraph(result, 'analysis'));
  if (!hasExactKeys(result, ['status', 'readings', 'diagnostics']) ||
      !(PLUGIN_RESULT_STATUSES.includes(result.status) || result.status === 'incomplete') ||
      !Array.isArray(result.readings) ||
      result.readings.length > MAX_READINGS) {
    invalidResult('Invalid language analysis result shape or status.');
  }
  const diagnostics = validateDiagnosticList(result.diagnostics, 'Analysis');
  const readings = Array.from(result.readings, reading => {
    if (!hasExactKeys(reading, ['meaning'], ['analysis']) || !isRecord(reading.meaning) ||
        (owns(reading, 'analysis') && !isRecord(reading.analysis))) {
      invalidResult('Analysis readings require an object meaning and optional object analysis.');
    }
    const normalized = {meaning: reading.meaning};
    if (owns(reading, 'analysis')) normalized.analysis = validateAnalysisMetadata(
      reading.analysis,reading.meaning);
    return normalized;
  });
  let meaningKeys;
  try {
    meaningKeys = readings.map(reading => meaningKey(reading.meaning));
  } catch (error) {
    if (error?.status === 'resource_limit') {
      fail('PLUGIN_RESOURCE_LIMIT', 'Plugin analysis meaning exceeds its safety budget.', error);
    }
    invalidResult('Plugin analysis meaning is not a safe JSON-like graph.', error);
  }
  if (new Set(meaningKeys).size !== meaningKeys.length) {
    invalidResult('Analysis readings must represent distinct MeaningGraphs.');
  }

  if (result.status === 'ok' && readings.length !== 1) {
    invalidResult('Successful analysis must contain exactly one distinct reading.');
  }
  if (result.status === 'ok' && diagnostics.length) {
    invalidResult('Successful analysis cannot contain refusal diagnostics.');
  }
  if (result.status === 'ambiguous' && readings.length < 2) {
    invalidResult('Ambiguous analysis must contain at least two readings.');
  }
  if (result.status === 'incomplete' && (!readings.length ||
      !diagnostics.some(item=>item.code==='PLUGIN_ANALYSIS_READING_UNSUPPORTED'))) {
    invalidResult('Incomplete analysis needs a licensed reading and unsupported-reading evidence.');
  }
  if (result.status !== 'ok' && result.status !== 'incomplete' &&
      (!diagnostics.length || (result.status !== 'ambiguous' && readings.length !== 0))) {
    invalidResult('Analysis refusal must include diagnostics and no successful readings.');
  }
  if (result.status === 'ambiguous' && !diagnostics.length) {
    invalidResult('Ambiguous analysis must include diagnostics.');
  }
  return {status: result.status, readings, diagnostics};
}

function transferEvidence(value, meaning) {
  if(!isRecord(value)||!isRecord(meaning)||!isConstructionId(value.construction))
    invalidResult('Analysis transfer does not match its reading MeaningGraph.');
  // Engine normalizes a plugin result a second time; the public projection must
  // satisfy the same contract without reintroducing private runtime fields.
  if(!owns(value,'meaning')) {
    if(value.kind==='question') {
      if(!hasExactKeys(value,['kind','construction','questionType',
          'propositionConstruction','policyId','propositionTransfer'])||
          value.questionType!=='yes_no'||!isConstructionId(value.propositionConstruction)||
          !isConstructionId(value.policyId)||!isRecord(meaning.proposition))
        invalidResult('Invalid projected question transfer evidence.');
      const propositionTransfer=transferEvidence(value.propositionTransfer,meaning.proposition);
      if(propositionTransfer.construction!==value.propositionConstruction)
        invalidResult('Projected question transfer proposition does not match its construction.');
      return Object.freeze({kind:'question',construction:value.construction,
        questionType:value.questionType,
        propositionConstruction:value.propositionConstruction,policyId:value.policyId,
        propositionTransfer});
    }
    const event=owns(value,'conceptId'),state=owns(value,'stateKind');
    if(event===state||!hasExactKeys(value,['construction',event?'conceptId':'stateKind','roles'])||
        !isConstructionId(event?value.conceptId:value.stateKind)||
        (event?value.conceptId!==meaning.concept:value.stateKind!==meaning.kind)||
        !Array.isArray(value.roles)||value.roles.length>32)
      invalidResult('Invalid projected transfer evidence.');
    const roles=new Set(),argumentsById=new Set();
    const mapped=value.roles.map(item=>{
      if(!hasExactKeys(item,['semanticRole','argument','syntacticFunction'])||
          !isRoleId(item.semanticRole)||!isRoleId(item.argument)||
          !isRoleId(item.syntacticFunction)||roles.has(item.semanticRole)||
          argumentsById.has(item.argument)||!Object.hasOwn(meaning.roles??{},item.semanticRole))
        invalidResult('Projected transfer has an invalid role mapping.');
      roles.add(item.semanticRole);argumentsById.add(item.argument);
      return Object.freeze({semanticRole:item.semanticRole,argument:item.argument,
        syntacticFunction:item.syntacticFunction});
    });
    return Object.freeze({construction:value.construction,
      ...(event?{conceptId:value.conceptId}:{stateKind:value.stateKind}),
      roles:Object.freeze(mapped)});
  }
  if(!isRecord(value.meaning)||meaningKey(value.meaning)!==meaningKey(meaning))
    invalidResult('Analysis transfer does not match its reading MeaningGraph.');
  if(value.kind==='question') {
    if(!hasExactKeys(value,['kind','construction','questionType',
        'propositionConstruction','policyId','meaning','propositionTransfer'])||
        value.questionType!=='yes_no'||!isConstructionId(value.propositionConstruction)||
        !isConstructionId(value.policyId)||!isRecord(meaning.proposition))
      invalidResult('Invalid question transfer evidence.');
    const propositionTransfer=transferEvidence(value.propositionTransfer,meaning.proposition);
    if(propositionTransfer.construction!==value.propositionConstruction)
      invalidResult('Question transfer proposition does not match its construction.');
    return Object.freeze({kind:'question',construction:value.construction,
      questionType:value.questionType,propositionConstruction:value.propositionConstruction,
      policyId:value.policyId,propositionTransfer});
  }
  const event=owns(value,'conceptId'),state=owns(value,'stateKind');
  if(event===state||!hasExactKeys(value,['construction',event?'conceptId':'stateKind',
      'meaning','features','arguments'])||
      !isConstructionId(event?value.conceptId:value.stateKind)||
      (event?value.conceptId!==meaning.concept:value.stateKind!==meaning.kind)||
      !isRecord(value.features)||meaningKey(value.features)!==meaningKey(meaning.features)||
      !Array.isArray(value.arguments)||value.arguments.length>32)
    invalidResult('Invalid event or state transfer evidence.');
  const roles=new Set(),argumentsById=new Set();
  const mapped=value.arguments.map(item=>{
    if(!hasExactKeys(item,['argument','semanticRole','syntacticFunction',
        'caseExponent','participant','lexicalSense','agreementControllers'])||
        !isRoleId(item.argument)||!isRoleId(item.semanticRole)||
        !isRoleId(item.syntacticFunction)||roles.has(item.semanticRole)||
        argumentsById.has(item.argument)||!Object.hasOwn(meaning.roles??{},item.semanticRole)||
        !isRecord(item.participant)||
        meaningKey(item.participant)!==meaningKey(meaning.roles[item.semanticRole])||
        !Array.isArray(item.agreementControllers)||item.agreementControllers.length>16)
      invalidResult('Analysis transfer has an invalid role mapping.');
    if(item.caseExponent!==null&&(!hasExactKeys(item.caseExponent,['kind','value'])||
        !['case','adposition','position','zero'].includes(item.caseExponent.kind)||
        (item.caseExponent.kind==='zero'?item.caseExponent.value!==null:
          typeof item.caseExponent.value!=='string')))
      invalidResult('Analysis transfer has an invalid case exponent.');
    if(item.lexicalSense!==null&&(!isRecord(item.lexicalSense)||
        typeof item.lexicalSense.kind!=='string'||typeof item.lexicalSense.id!=='string'))
      invalidResult('Analysis transfer has an invalid lexical reference.');
    for(const controller of item.agreementControllers)if(!hasExactKeys(controller,
        ['argument','feature','value'])||!isRoleId(controller.argument)||
        !isRoleId(controller.feature)||
        !(controller.value===null||typeof controller.value==='string'||
          Number.isFinite(controller.value)))
      invalidResult('Analysis transfer has an invalid agreement controller.');
    roles.add(item.semanticRole);argumentsById.add(item.argument);
    return Object.freeze({semanticRole:item.semanticRole,argument:item.argument,
      syntacticFunction:item.syntacticFunction});
  });
  return Object.freeze({construction:value.construction,
    ...(event?{conceptId:value.conceptId}:{stateKind:value.stateKind}),
    roles:Object.freeze(mapped)});
}

function validateAnalysisMetadata(value, meaning) {
  const allowed = ['lexicalSenses','score','transfer','sourceSegments','surface','evidence'];
  if (!isRecord(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    invalidResult('Analysis metadata contains an unsupported field.');
  }
  const normalized = {};
  if (owns(value,'lexicalSenses')) normalized.lexicalSenses = validateLexicalSenses(value.lexicalSenses);
  if (owns(value,'score')) {
    if (!Number.isFinite(value.score)) invalidResult('Analysis score must be finite.');
    normalized.score = value.score;
  }
  if (owns(value,'transfer')) {
    normalized.transfer = transferEvidence(value.transfer,meaning);
  }
  if (owns(value,'sourceSegments')) normalized.sourceSegments = validateSourceSegments(value.sourceSegments,meaning);
  if (owns(value,'surface')) normalized.surface = validateSurface(
    value.surface,normalized.transfer?.construction);
  if (owns(value,'evidence')) normalized.evidence = validateAnalysisEvidence(
    value.evidence,meaning,normalized.transfer?.construction,normalized.surface?.variants);
  return normalized;
}

function validateAnalysisEvidence(value, meaning, construction, surfaceVariants) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_EVIDENCE) {
    invalidResult('Analysis evidence must contain two to 32 distinct traces.');
  }
  const traces=value.map(item => {
    if (!hasExactKeys(item,['lexicalSenses','score','transferSourceId','sourceSegments'],
        ['surfaceVariant']) || !Number.isFinite(item.score) ||
        !(item.transferSourceId === null ||
          (isConstructionId(item.transferSourceId) &&
            (construction === undefined || item.transferSourceId === construction)))) {
      invalidResult('Analysis evidence contains an invalid trace.');
    }
    const normalized={lexicalSenses:validateLexicalSenses(item.lexicalSenses),
      score:item.score,transferSourceId:item.transferSourceId,
      sourceSegments:validateSourceSegments(item.sourceSegments,meaning)};
    if (owns(item,'surfaceVariant')) {
      normalized.surfaceVariant =
        validateSurface({variants:[item.surfaceVariant]},construction).variants[0];
      if (surfaceVariants && !surfaceVariants.some(variant =>
          meaningKey(variant) === meaningKey(normalized.surfaceVariant))) {
        invalidResult('Analysis evidence surface variant is not in the reading surface.');
      }
    }
    return normalized;
  });
  const unique=new Map(traces.map(item=>[meaningKey(item),item]));
  if(unique.size!==traces.length)invalidResult('Analysis evidence repeats a trace.');
  return [...unique.entries()].sort(([left],[right])=>left<right?-1:left>right?1:0)
    .map(([,item])=>item);
}

function validateLexicalSenses(value) {
  if (!isRecord(value) || Object.keys(value).length > MAX_EVIDENCE) {
    invalidResult('Analysis lexical senses must be a bounded record.');
  }
  return Object.fromEntries(Object.entries(value).sort(([left],[right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([role,sense]) => {
      if (!isRolePathId(role) || !(sense === null ||
          isSenseId(sense) ||
          (Array.isArray(sense) && sense.length <= MAX_EVIDENCE && sense.every(item =>
            item === null || isSenseId(item))))) {
        invalidResult('Analysis lexical sense entry is invalid.');
      }
      return [role, Array.isArray(sense) ? [...sense] : sense];
    }));
}

function meaningPathExists(meaning, path) {
  if (!path.startsWith('#/') || path.length > 512) return false;
  let current = meaning;
  for (const part of path.slice(2).split('/')) {
    if (/~(?![01])/u.test(part)) return false;
    const key = part.replace(/~1/gu,'/').replace(/~0/gu,'~');
    if (!isRecord(current) || !owns(current,key)) return false;
    current = current[key];
  }
  return true;
}

function validateSourceSegments(value, meaning) {
  if (!Array.isArray(value) || value.length > MAX_SEGMENTS) {
    invalidResult('Analysis source segments must be a bounded array.');
  }
  return Array.from(value, item => {
    if (!isRecord(item) || typeof item.path !== 'string' ||
        !meaningPathExists(meaning,item.path)) {
      invalidResult('Analysis source segment path does not resolve in MeaningGraph.');
    }
    if (owns(item,'span')) {
      if (!hasExactKeys(item,['path','span'])) invalidResult('Aligned source segments require a path and span.');
      return {path:item.path,span:validateSpan(item.span,'Analysis source span')};
    }
    if (!hasExactKeys(item,['path','status','reason']) || item.status !== 'unavailable' ||
        typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 128) {
      invalidResult('Unavailable source segments require a bounded reason.');
    }
    return {path:item.path,status:item.status,reason:item.reason};
  });
}

function validateSurface(value, construction) {
  if (!hasExactKeys(value,['variants']) || !Array.isArray(value.variants) ||
      value.variants.length < 1 || value.variants.length > MAX_EVIDENCE) {
    invalidResult('Analysis surface evidence requires a bounded variants array.');
  }
  const variants = Array.from(value.variants,item => {
    if (!hasExactKeys(item,['id','construction','slots'],['markedness']) ||
        !isVariantId(item.id) || !isConstructionId(item.construction) ||
        (construction !== undefined && item.construction !== construction) ||
        (owns(item,'markedness') && item.markedness !== 'unknown') || !Array.isArray(item.slots) ||
        item.slots.length < 1 || item.slots.length > 16) {
      invalidResult('Analysis surface variant contains invalid or unsupported fields.');
    }
    const slots = Array.from(item.slots,slot => {
      if (!hasExactKeys(slot,['name','start','end']) ||
          !(isRoleId(slot.name) || ['@verb','@auxiliary'].includes(slot.name))) {
        invalidResult('Analysis surface slot is invalid.');
      }
      const span = validateSpan({start:slot.start,end:slot.end},'Analysis surface slot span');
      return {name:slot.name,...span};
    }).sort((left,right)=>left.start-right.start || left.end-right.end ||
      (left.name<right.name?-1:left.name>right.name?1:0));
    if (new Set(slots.map(slot=>slot.name)).size !== slots.length) {
      invalidResult('Analysis surface variant repeats a slot.');
    }
    for (let index=1; index<slots.length; index++) {
      if (slots[index].start < slots[index-1].end) {
        invalidResult('Analysis surface slots cannot overlap.');
      }
    }
    return {id:item.id,construction:item.construction,slots,
      ...(owns(item,'markedness')?{markedness:item.markedness}:{})};
  });
  const unique = [...new Map(variants.map(variant=>[meaningKey(variant),variant]))]
    .sort(([left],[right])=>left<right?-1:left>right?1:0).map(([,variant])=>variant);
  if (unique.length !== variants.length) invalidResult('Analysis surface variants cannot repeat.');
  return {variants:unique};
}

function validateInformationLoss(value) {
  if (!Array.isArray(value) || value.length > MAX_DIAGNOSTICS) {
    invalidResult('informationLoss must be a bounded array.');
  }
  return Array.from(value, item => {
    if (!hasExactKeys(item, ['cause', 'feature', 'path', 'status']) ||
        typeof item.cause !== 'string' || !item.cause.trim() ||
        typeof item.feature !== 'string' || !item.feature.trim() ||
        typeof item.path !== 'string' || !item.path.startsWith('#/') ||
        !['unavoidable', 'unsupported', 'ambiguous'].includes(item.status)) {
      invalidResult('Invalid information-loss entry.');
    }
    return {cause: item.cause, feature: item.feature, path: item.path, status: item.status};
  });
}

/** Validate and normalize the single public realization result shape. */
export function normalizeRealizationResult(result) {
  ({value: result} = validatePluginResultGraph(result, 'realization'));
  if (!hasExactKeys(result, ['status', 'text', 'alternatives', 'warnings',
      'informationLoss', 'diagnostics'], ['realizations','truncation']) ||
      !PLUGIN_RESULT_STATUSES.includes(result.status) ||
      (result.text !== null && typeof result.text !== 'string')) {
    invalidResult('Invalid language realization result shape or status.');
  }
  const diagnostics = validateDiagnosticList(result.diagnostics, 'Realization');
  const alternatives = validateStringList(result.alternatives, 'alternatives', MAX_ALTERNATIVES);
  const warnings = validateStringList(result.warnings, 'warnings', MAX_DIAGNOSTICS);
  const informationLoss = validateInformationLoss(result.informationLoss);
  const realizations=owns(result,'realizations')?validateRealizations(result.realizations):undefined;
  const truncation=result.truncation;
  if(truncation!==undefined&&(!hasExactKeys(truncation,['alternatives','realizations'])||
      typeof truncation.alternatives!=='boolean'||typeof truncation.realizations!=='boolean'||
      (!truncation.alternatives&&!truncation.realizations)))
    invalidResult('Invalid realization truncation metadata.');
  const text = result.text;

  if (result.status === 'ok') {
    if (typeof text !== 'string' || !text.trim() || text.length > 4096) {
      invalidResult('Successful realization must contain non-empty text.');
    }
    if (diagnostics.length) {
      invalidResult('Successful realization cannot contain refusal diagnostics.');
    }
    if (alternatives.includes(text)) invalidResult('Primary realization is duplicated as an alternative.');
    if (realizations !== undefined) {
      if (!realizations.length) {
        invalidResult('Successful realization with segments must include its primary realization.');
      }
      if (realizations[0].text !== text) {
        invalidResult('Primary realization text must match the realization result text.');
      }
    }
  } else {
    if (text !== null || !diagnostics.length) {
      invalidResult('Realization refusal must not contain text and must include diagnostics.');
    }
    if (realizations !== undefined) {
      invalidResult('Realization refusal must not include realizations.');
    }
    if(truncation!==undefined)invalidResult('Realization refusal cannot truncate alternatives.');
    if (result.status === 'ambiguous' && alternatives.length < 2) {
      invalidResult('Ambiguous realization must include at least two alternatives.');
    }
    if (result.status !== 'ambiguous' && alternatives.length) {
      invalidResult('Only ambiguous realization may include alternatives.');
    }
    if (warnings.length || informationLoss.length) {
      invalidResult('Refusal results cannot claim successful warnings or information transfer.');
    }
  }
  return {status: result.status, text, alternatives, warnings, informationLoss, diagnostics,
    ...(realizations?{realizations}:{}),
    ...(truncation?{truncation:{alternatives:truncation.alternatives,
      realizations:truncation.realizations}}:{})};
}
