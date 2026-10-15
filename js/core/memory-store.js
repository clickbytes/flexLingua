import {record} from './features.js';

export const MEMORY_STORE_VERSION=1;
const DEFAULT_KEY='flexlingua.session-memory';
const MAX_BYTES=262144;
const keys=(value,expected)=>record(value) &&
  Object.keys(value).length===expected.length && expected.every(key=>Object.hasOwn(value,key));

function invalid() {
  const error=new Error('Invalid or unsupported memory document.');
  error.code='MEMORY_DOCUMENT_INVALID';
  throw error;
}

export function validateMemorySnapshot(snapshot) {
  if(!keys(snapshot,['factCount','maxFacts','facts']) ||
      !Number.isInteger(snapshot.maxFacts) || snapshot.maxFacts<1 || snapshot.maxFacts>128 ||
      !Array.isArray(snapshot.facts) || snapshot.facts.length>snapshot.maxFacts ||
      snapshot.factCount!==snapshot.facts.length)invalid();
  const ids=new Set();
  snapshot.facts.forEach((fact,index)=>{
    if(!record(fact) || fact.id!=='f'+(index+1) || ids.has(fact.id) ||
        typeof fact.referent!=='string' || !fact.referent ||
        !record(fact.proposition) || !['event','state'].includes(fact.proposition.type) ||
        !keys(fact.source,['turnId','language','text']) ||
        !/^t[1-9][0-9]*$/u.test(fact.source.turnId) ||
        !['pl','en','tr'].includes(fact.source.language) ||
        typeof fact.source.text!=='string' ||
        typeof fact.recordedAt!=='string' || !Number.isFinite(Date.parse(fact.recordedAt)) ||
        fact.scope!=='session' || !record(fact.correction) ||
        fact.correction.policy!=='explicit_supersede' ||
        !Array.isArray(fact.correction.supersedes) ||
        !['active','superseded'].includes(fact.status))invalid();
    ids.add(fact.id);
  });
  for(const fact of snapshot.facts) {
    if(fact.status==='active' && Object.hasOwn(fact,'supersededBy'))invalid();
    if(fact.status==='superseded' &&
        (!ids.has(fact.supersededBy) || fact.supersededBy===fact.id))invalid();
    if(fact.correction.supersedes.some(id=>!ids.has(id) || id===fact.id))invalid();
  }
  return structuredClone(snapshot);
}

/** Parse both the current envelope and the legacy unversioned snapshot. */
export function parseMemoryDocument(input) {
  if(typeof input!=='string' || input.length>MAX_BYTES)invalid();
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
  if(text.length>MAX_BYTES)invalid();
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
