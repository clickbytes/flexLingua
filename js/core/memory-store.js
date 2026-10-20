import {record} from './features.js';
import {EngineError} from './errors.js';
import {snapshotBoundedJsonGraph,utf8ByteLength} from './bounded-json.js';
import {RESOURCE_LIMITS} from './resource-limits.js';

export const MEMORY_STORE_VERSION=1;
const DEFAULT_KEY='flexlingua.session-memory';
const MAX_BYTES=262144;
// Language snapshot sources store the historical session language code; the
// shape mirrors the LanguagePlugin language-code contract (contract.js,
// registry.js) so future plugin codes stay valid without implying runtime
// availability.
const LANGUAGE_CODE = /^[a-z]{2,8}$/u;
const keys=(value,expected)=>record(value) &&
  Object.keys(value).length===expected.length && expected.every(key=>Object.hasOwn(value,key));

function invalid() {
  throw new EngineError('MEMORY_DOCUMENT_INVALID',
    'Invalid or unsupported memory document.',{status:'invalid'});
}

function preflightSnapshot(snapshot) {
  try {
    if(!record(snapshot))invalid();
    const descriptors=Object.getOwnPropertyDescriptors(snapshot);
    if(Object.keys(descriptors).length!==3 ||
        !['factCount','maxFacts','facts'].every(key=>
          descriptors[key]?.enumerable && Object.hasOwn(descriptors[key],'value')))invalid();
    const {factCount,maxFacts,facts}=Object.fromEntries(
      Object.entries(descriptors).map(([key,descriptor])=>[key,descriptor.value]));
    if(!Number.isInteger(maxFacts)||maxFacts<1||maxFacts>128||
        !Array.isArray(facts)||facts.length>maxFacts||factCount!==facts.length)invalid();
  } catch(error) {
    if(error instanceof EngineError)throw error;
    invalid();
  }
}

export function validateMemorySnapshot(snapshot,{validateProposition}={}) {
  if(validateProposition!==undefined && typeof validateProposition!=='function')invalid();
  preflightSnapshot(snapshot);
  const safe=snapshotBoundedJsonGraph(snapshot,{
    maxDepth:RESOURCE_LIMITS.interlinguaDepth+8,
    maxNodes:RESOURCE_LIMITS.interlinguaNodes,
    maxBytes:MAX_BYTES
  }).value;
  if(!keys(safe,['factCount','maxFacts','facts']) ||
      !Number.isInteger(safe.maxFacts) || safe.maxFacts<1 || safe.maxFacts>128 ||
      !Array.isArray(safe.facts) || safe.facts.length>safe.maxFacts ||
      safe.factCount!==safe.facts.length)invalid();
  const ids=new Set();
  safe.facts.forEach((fact,index)=>{
    if(!record(fact) || fact.id!=='f'+(index+1) || ids.has(fact.id) ||
        typeof fact.referent!=='string' || !fact.referent ||
        !record(fact.proposition) || !['event','state'].includes(fact.proposition.type) ||
        !keys(fact.source,['turnId','language','text']) ||
        !/^t[1-9][0-9]*$/u.test(fact.source.turnId) ||
        !LANGUAGE_CODE.test(fact.source.language) ||
        typeof fact.source.text!=='string' ||
        typeof fact.recordedAt!=='string' || !Number.isFinite(Date.parse(fact.recordedAt)) ||
        fact.scope!=='session' || !record(fact.correction) ||
        fact.correction.policy!=='explicit_supersede' ||
        !Array.isArray(fact.correction.supersedes) ||
        !['active','superseded'].includes(fact.status))invalid();
    ids.add(fact.id);
  });
  for(const fact of safe.facts) {
    if(fact.status==='active' && Object.hasOwn(fact,'supersededBy'))invalid();
    if(fact.status==='superseded' &&
        (!ids.has(fact.supersededBy) || fact.supersededBy===fact.id))invalid();
    if(fact.correction.supersedes.some(id=>!ids.has(id) || id===fact.id))invalid();
  }
  if(validateProposition)for(const fact of safe.facts)validateProposition(fact.proposition);
  return safe;
}

/** Parse both the current envelope and the legacy unversioned snapshot. */
export function parseMemoryDocument(input) {
  if(typeof input!=='string' || utf8ByteLength(input)>MAX_BYTES)invalid();
  let document;
  try{document=JSON.parse(input);}catch{invalid();}
  const snapshot=keys(document,['version','memory']) && document.version===1
    ? document.memory : document;
  if(!keys(document,['version','memory']) &&
      !keys(document,['factCount','maxFacts','facts']))invalid();
  return validateMemorySnapshot(snapshot);
}

export function serializeMemory(snapshot) {
  const text=JSON.stringify({version:MEMORY_STORE_VERSION,memory:validateMemorySnapshot(snapshot)});
  if(utf8ByteLength(text)>MAX_BYTES)invalid();
  return text;
}

/** Storage uses a caller-supplied local getItem/setItem/removeItem adapter. */
export class MemoryStore {
  #storage;
  #key;
  #enabled;

  constructor({storage,key=DEFAULT_KEY,enabled=false}={}) {
    if(storage!==undefined && (!storage ||
        ['getItem','setItem','removeItem'].some(method=>typeof storage[method]!=='function')))
      throw new Error('Memory storage must support getItem, setItem and removeItem.');
    if(typeof key!=='string' || !/^[a-z][a-z0-9.:-]{0,79}$/u.test(key) ||
        typeof enabled!=='boolean' || (enabled && !storage))
      throw new Error('Invalid memory storage configuration.');
    this.#storage=storage;
    this.#key=key;
    this.#enabled=enabled;
  }

  get enabled(){return this.#enabled;}
  enable(){if(!this.#storage)throw new Error('No local storage adapter configured.');this.#enabled=true;}
  disable(){this.#enabled=false;}
  export(snapshot){return serializeMemory(snapshot);}
  import(text){return parseMemoryDocument(text);}
  save(snapshot){
    if(!this.#enabled)return false;
    this.#storage.setItem(this.#key,serializeMemory(snapshot));
    return true;
  }
  load(){
    if(!this.#enabled)return null;
    const text=this.#storage.getItem(this.#key);
    return text===null ? null : parseMemoryDocument(text);
  }
  /** Remove the local copy even when persistence is currently disabled. */
  delete(){if(this.#storage)this.#storage.removeItem(this.#key);}
  reset(){this.delete();}
}
