import {record,safeName} from './features.js';

const clone=value=>structuredClone(value);
const canonical=value=>{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(record(value))return '{'+Object.keys(value).sort().map(key=>
    JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
};

function withoutPolarity(proposition) {
  const value=clone(proposition);
  if(record(value.features))delete value.features.polarity;
  return value;
}

function contradicts(left,right) {
  return left.type===right.type && ['event','state'].includes(left.type) &&
    left.features?.polarity!==right.features?.polarity &&
    canonical(withoutPolarity(left))===canonical(withoutPolarity(right));
}

function fail(code,message) {
  const error=new Error(message);error.code=code;throw error;
}

/** Explicit, bounded, session-only facts with provenance and correction history. */
export class SessionMemory {
  #facts=[];
  #nextId=1;
  #maxFacts;

  constructor({maxFacts=32}={}) {
    if(!Number.isInteger(maxFacts)||maxFacts<1||maxFacts>128)
      throw new Error('Session memory limit must be between 1 and 128 facts.');
    this.#maxFacts=maxFacts;
  }

  snapshot() {
    return {factCount:this.#facts.length,maxFacts:this.#maxFacts,
      facts:clone(this.#facts)};
  }

  reset() {this.#facts=[];this.#nextId=1;return this.snapshot();}

  remember({turn,referent,recordedAt=new Date().toISOString(),scope='session',supersedes=[]}={}) {
    if(!record(turn)||turn.intent!=='assert'||!/^t[1-9][0-9]*$/u.test(turn.id||''))
      fail('MEMORY_SOURCE_INVALID','Memory facts must come from an existing assertion turn.');
    const proposition=turn.interlingua?.payload?.proposition;
    if(!record(proposition)||!['event','state'].includes(proposition.type))
      fail('MEMORY_FACT_UNSUPPORTED','Only validated event or state assertions can be stored.');
    if(typeof referent!=='string'||!/^proposition\.roles\.[a-zA-Z][a-zA-Z0-9_]*$/u.test(referent)||
        !referent.split('.').every(safeName))
      fail('MEMORY_REFERENT_INVALID','A fact requires an explicit participant reference path.');
    const sourceReference=turn.references?.find(item=>item.role===referent);
    if(!sourceReference || !sourceReference.referenceId)
      fail('MEMORY_REFERENT_MISMATCH','The selected referent is not present in the source turn.');
    if(typeof recordedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(recordedAt)||
        !Number.isFinite(Date.parse(recordedAt)) || scope!=='session')
      fail('MEMORY_TIME_SCOPE_INVALID','Memory needs a UTC timestamp and session scope.');
    if(!Array.isArray(supersedes)||supersedes.length>this.#maxFacts ||
        new Set(supersedes).size!==supersedes.length || supersedes.some(id=>typeof id!=='string'))
      fail('MEMORY_CORRECTION_INVALID','Invalid explicit fact correction rule.');
    const superseded=new Set(supersedes);
    const selected=this.#facts.filter(fact=>superseded.has(fact.id));
    if(selected.length!==superseded.size || selected.some(fact=>fact.status!=='active' ||
        fact.referent!==sourceReference.referenceId))
      fail('MEMORY_CORRECTION_INVALID','Corrections must name active facts about the same referent.');
    const conflicts=this.#facts.filter(fact=>fact.status==='active' &&
      fact.referent===sourceReference.referenceId && contradicts(fact.proposition,proposition));
    if(conflicts.some(fact=>!superseded.has(fact.id)))
      fail('MEMORY_FACT_CONFLICT','Conflicting facts require an explicit supersedes rule.');
    if(this.#facts.length>=this.#maxFacts)
      fail('MEMORY_LIMIT','Session memory is full; reset the session explicitly.');
    const surface=turn.surface?.source;
    if(!record(surface)||typeof surface.language!=='string'||typeof surface.text!=='string')
      fail('MEMORY_PROVENANCE_MISSING','Memory facts require source language and utterance text.');

    const id='f'+this.#nextId;
    const next=this.#facts.map(fact=>superseded.has(fact.id)?
      {...fact,status:'superseded',supersededBy:id}:fact);
    const entry={id,referent:sourceReference.referenceId,proposition:clone(proposition),
      source:{turnId:turn.id,language:surface.language,text:surface.text},
      recordedAt,scope,
      correction:{policy:'explicit_supersede',supersedes:[...supersedes]},status:'active'};
    this.#facts=[...next,entry];
    this.#nextId++;
    return clone(entry);
  }
}
