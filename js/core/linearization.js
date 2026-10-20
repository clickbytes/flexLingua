import {isRoleId, isVariantId} from './identifiers.js';

const LITERAL = /^@[\p{L}]+$/u;
const MAX_LINEARIZATIONS_PER_FRAME = 8;
const MAX_LINEARIZATION_SLOTS = 16;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate source slot declarations once, before a language plan is published. */
export function normalizeLinearizations(entries, label = 'frame') {
  if (!Array.isArray(entries) || entries.length < 1 ||
      entries.length > MAX_LINEARIZATIONS_PER_FRAME) {
    throw new Error(`Invalid linearization count for ${label}.`);
  }
  const defaultSequences = [];
  const variants = [];
  const seenIds = new Set();
  const seenSequences = new Set();
  for (const entry of entries) {
    const descriptor = !Array.isArray(entry);
    let sequence;
    let variantId;
    let realizationPreference;
    if (!descriptor) {
      sequence = entry;
    } else {
      const prototype = entry && typeof entry === 'object' ? Object.getPrototypeOf(entry) : undefined;
      if (!record(entry) || (prototype !== Object.prototype && prototype !== null) ||
          Object.keys(entry).sort().join(',') !== 'realizationPreference,sequence,variantId') {
        throw new Error(`Invalid linearization variant descriptor for ${label}.`);
      }
      ({sequence,variantId,realizationPreference} = entry);
      if (!isVariantId(variantId) || seenIds.has(variantId) ||
          !Number.isInteger(realizationPreference) || realizationPreference < 1 ||
          realizationPreference > 100) {
        throw new Error(`Invalid or duplicate linearization variant ID or preference for ${label}.`);
      }
      seenIds.add(variantId);
    }
    if (!Array.isArray(sequence) || sequence.length < 1 ||
        sequence.length > MAX_LINEARIZATION_SLOTS) {
      throw new Error(`Invalid linearization sequence length for ${label}.`);
    }
    const normalizedSequence = Array.from(sequence);
    if (normalizedSequence.some(step => typeof step !== 'string' ||
        !(isRoleId(step) || step === '@verb' || LITERAL.test(step))) ||
        normalizedSequence.filter(step => step === '@verb').length !== 1) {
      throw new Error(`Invalid linearization slot or @verb count for ${label}.`);
    }
    const roles = normalizedSequence.filter(step => !step.startsWith('@'));
    if (new Set(roles).size !== roles.length) {
      throw new Error(`Duplicate role slot in linearization for ${label}.`);
    }
    const sequenceKey = JSON.stringify(normalizedSequence);
    if (seenSequences.has(sequenceKey)) {
      throw new Error(`Duplicate linearization sequence for ${label}.`);
    }
    seenSequences.add(sequenceKey);
    if (descriptor) variants.push({variantId,sequence:normalizedSequence,realizationPreference});
    else defaultSequences.push(normalizedSequence);
  }
  if (variants.length && !defaultSequences.length) {
    throw new Error(`Linearization variants require an existing array default for ${label}.`);
  }
  return {sequences:[...defaultSequences,...variants.map(variant=>variant.sequence)],
    defaultSequences,variants};
}

/** Keep published default IDs stable when unrelated layouts are reordered. */
export function defaultLinearizationId(sequence, reservedIds = new Set(), primary = false) {
  if(primary&&!reservedIds.has('default'))return 'default';
  const signature=JSON.stringify(sequence);
  const hashOf=value=>{
    let hash=2166136261;
    for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619);
    return (hash>>>0).toString(16).padStart(8,'0');
  };
  let salt=0,id;
  do { id=`default-${hashOf(salt?`${signature}:${salt}`:signature)}`; salt++; }
  while(reservedIds.has(id));
  return id;
}
