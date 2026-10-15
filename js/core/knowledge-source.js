import {record} from './features.js';

const QID=/^Q[1-9][0-9]*$/u;
const PID=/^P[1-9][0-9]*$/u;
const FACT_ID=/^[A-Za-z][A-Za-z0-9_-]{0,79}$/u;
const timestamp=value=>typeof value==='string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value) &&
  Number.isFinite(Date.parse(value));
const exact=(value,fields)=>record(value) &&
  Object.keys(value).length===fields.length && fields.every(key=>Object.hasOwn(value,key));

function fail(code,message) {
  const error=new Error(message);error.code=code;throw error;
}

function validateFact(fact) {
  if(!exact(fact,['id','subject','predicate','object','validFrom','validUntil','provenance']) ||
      !FACT_ID.test(fact.id) || !QID.test(fact.subject) || !PID.test(fact.predicate) ||
      !QID.test(fact.object) || !timestamp(fact.validFrom) ||
      (fact.validUntil!==null && (!timestamp(fact.validUntil) ||
        Date.parse(fact.validUntil)<=Date.parse(fact.validFrom))) ||
      !exact(fact.provenance,['entityId','revisionId','url','license']) ||
      fact.provenance.entityId!==fact.subject ||
      !Number.isSafeInteger(fact.provenance.revisionId) ||
      fact.provenance.revisionId<1 ||
      fact.provenance.url!==`https://www.wikidata.org/wiki/${fact.subject}` ||
      fact.provenance.license!=='CC0-1.0')
    fail('KNOWLEDGE_PROVENANCE_INVALID','A structured fact requires valid Wikidata provenance and time bounds.');
}

/** Offline-only research snapshot; it never feeds facts into translation or dialogue. */
export class KnowledgeSource {
  #snapshot=null;

  importSnapshot(snapshot) {
    if(snapshot?.origin==='external')
      fail('KNOWLEDGE_EXTERNAL_UNAVAILABLE','External knowledge access is unavailable in the offline runtime.');
    if(!exact(snapshot,['version','origin','provider','retrievedAt','facts']) ||
        snapshot.version!=='1.0' || snapshot.origin!=='offline_snapshot' ||
        snapshot.provider!=='wikidata' || !timestamp(snapshot.retrievedAt) ||
        !Array.isArray(snapshot.facts) || snapshot.facts.length>256)
      fail('KNOWLEDGE_SNAPSHOT_INVALID','Invalid offline knowledge snapshot.');
    const ids=new Set();
    for(const fact of snapshot.facts) {
      validateFact(fact);
      if(ids.has(fact.id))fail('KNOWLEDGE_SNAPSHOT_INVALID','Duplicate fact identifier.');
      ids.add(fact.id);
    }
    if(this.#snapshot && Date.parse(snapshot.retrievedAt)<=Date.parse(this.#snapshot.retrievedAt))
      fail('KNOWLEDGE_STALE_SNAPSHOT','An update must have a later retrieval time.');
    this.#snapshot=structuredClone(snapshot);
    return {factCount:ids.size,retrievedAt:snapshot.retrievedAt};
  }

  snapshot(){return this.#snapshot?structuredClone(this.#snapshot):null;}

  query({subject,predicate,asOf}={}) {
    if(!QID.test(subject||'') || !PID.test(predicate||'') || !timestamp(asOf))
      fail('KNOWLEDGE_QUERY_INVALID','Knowledge queries need subject, property and UTC asOf time.');
    if(!this.#snapshot)return {status:'unavailable',facts:[],retrievedAt:null};
    const facts=this.#snapshot.facts.filter(fact=>fact.subject===subject &&
      fact.predicate===predicate && Date.parse(fact.validFrom)<=Date.parse(asOf) &&
      (fact.validUntil===null || Date.parse(asOf)<Date.parse(fact.validUntil)));
    const objects=new Set(facts.map(fact=>fact.object));
    return {status:!facts.length?'unavailable':objects.size>1?'conflict':'available',
      facts:structuredClone(facts),retrievedAt:this.#snapshot.retrievedAt};
  }
}
