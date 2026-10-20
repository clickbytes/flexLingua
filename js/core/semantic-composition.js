import {EngineError} from './errors.js';
import {record} from './features.js';
import {MAX_ENTITY_MODIFIERS,MAX_MODIFIER_DEPTH} from './meaning-graph.js';
import {RESOURCE_LIMITS} from './resource-limits.js';
import {TYPED_GRAPH_MATCH_LIMITS} from './typed-graph-match.js';

const DEFAULT_LIMITS = TYPED_GRAPH_MATCH_LIMITS;
const ALLOWED_LIMITS = new Set(['maxNodes','maxEdges','maxDepth']);

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach(item => freezeDeep(item,seen));
  return Object.freeze(value);
}

function fail(code, message, status = 'invalid') {
  throw new EngineError(code,message,{status,diagnostics:[{code,message}]});
}

function resourceLimit(message) {
  fail('TYPED_GRAPH_RESOURCE_LIMIT',message,'resource_limit');
}

function compare(left,right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pointer(path,segment) {
  return `${path}/${String(segment).replace(/~/gu,'~0').replace(/\//gu,'~1')}`;
}

function normalizeLimits(limits) {
  if (limits === undefined) return {...DEFAULT_LIMITS,
    maxNodes:DEFAULT_LIMITS.nodes,maxEdges:DEFAULT_LIMITS.edges,maxDepth:DEFAULT_LIMITS.depth};
  if (!record(limits) || Object.keys(limits).some(key => !ALLOWED_LIMITS.has(key))) {
    fail('TYPED_GRAPH_INVALID','Invalid semantic graph projection limits.');
  }
  const result={
    maxNodes:limits.maxNodes ?? DEFAULT_LIMITS.nodes,
    maxEdges:limits.maxEdges ?? DEFAULT_LIMITS.edges,
    maxDepth:limits.maxDepth ?? DEFAULT_LIMITS.depth
  };
  if (!Number.isSafeInteger(result.maxNodes) || result.maxNodes < 1 ||
      result.maxNodes > DEFAULT_LIMITS.nodes || !Number.isSafeInteger(result.maxEdges) ||
      result.maxEdges < 0 || result.maxEdges > DEFAULT_LIMITS.edges ||
      !Number.isSafeInteger(result.maxDepth) || result.maxDepth < 1 ||
      result.maxDepth > DEFAULT_LIMITS.depth) {
    fail('TYPED_GRAPH_INVALID','Invalid semantic graph projection limits.');
  }
  return result;
}

function requireCore(core) {
  if (!core || typeof core.resolve !== 'function' || !core.ontology ||
      typeof core.ontology.get !== 'function' || typeof core.ontology.isA !== 'function' ||
      typeof core.ontology.projectConceptGraph !== 'function') {
    fail('TYPED_GRAPH_INVALID','Semantic graph composition requires a validated CORE language.');
  }
}

function edgeKey(edge) {
  return JSON.stringify([edge.from,edge.relation,edge.target]);
}

function addSourcePath(target,key,path) {
  let paths=target.get(key);
  if (!paths) target.set(key,paths=new Set());
  paths.add(path);
}

function relationTypesMatch(ontology,edge,fromConcept,targetConcept) {
  if (edge.relation === 'is_a') return ontology.isA(fromConcept,targetConcept);
  const signature=ontology.relationTypes?.[edge.relation];
  return Boolean(signature && ontology.isA(fromConcept,signature.subject) &&
    ontology.isA(targetConcept,signature.object));
}

function projectionDepth(graph,rootId,maxDepth) {
  const outgoing=new Map(graph.nodes.map(node=>[node.id,[]]));
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge.target);
  const depths=new Map([[rootId,0]]), queue=[rootId];
  for (let index=0;index<queue.length;index++) {
    const from=queue[index], depth=depths.get(from);
    for (const target of outgoing.get(from)||[]) {
      const next=depth+1;
      if (next>maxDepth) resourceLimit('Semantic concept graph exceeds the requested depth budget.');
      if (!depths.has(target)) { depths.set(target,next); queue.push(target); }
    }
  }
}

/** Build a stable concept graph view without changing the MeaningGraph document. */
export function composeMeaningGraph({meaning,core,limits} = {}) {
  requireCore(core);
  if (!record(meaning) || typeof meaning.version!=='string' || typeof meaning.type!=='string') {
    fail('TYPED_GRAPH_INVALID','MeaningGraph must have a recognized version and type.');
  }
  const budget=normalizeLimits(limits);
  const ontology=core.ontology;
  const nodes=new Map(), edges=new Map();
  const nodeSourcePaths=new Map(), edgeSourcePaths=new Map();
  const meaningRoots=new Set();
  const unresolved=[];
  const active=new WeakSet();
  const countedInputNodes=new WeakSet();
  const inputEdges=new WeakMap();
  let inputNodeCount=0,inputEdgeCount=0;

  function reserveInputNode(value) {
    if (!value || typeof value!=='object' || countedInputNodes.has(value)) return;
    countedInputNodes.add(value);
    if (++inputNodeCount>RESOURCE_LIMITS.interlinguaNodes) {
      resourceLimit('MeaningGraph projection input node limit exceeded.');
    }
  }

  function reserveInputEdge(parent,key) {
    let keys=inputEdges.get(parent);
    if (!keys) inputEdges.set(parent,keys=new Set());
    if (keys.has(key)) return;
    keys.add(key);
    if (++inputEdgeCount>RESOURCE_LIMITS.interlinguaNodes) {
      resourceLimit('MeaningGraph projection input edge limit exceeded.');
    }
  }

  function addNode(id,conceptId,sourcePath) {
    const concept=ontology.get(conceptId);
    if (!concept) fail('TYPED_GRAPH_INVALID',`Unknown CORE concept in semantic projection: ${conceptId}.`);
    const current=nodes.get(id);
    if (current && (current.conceptId!==conceptId || current.type!==concept.type)) {
      fail('TYPED_GRAPH_INVALID',`Semantic projection node ID collision: ${id}.`);
    }
    if (!current) {
      nodes.set(id,{id,conceptId,type:concept.type});
      if (nodes.size>budget.maxNodes) resourceLimit('Semantic graph node limit exceeded.');
    }
    addSourcePath(nodeSourcePaths,id,sourcePath);
  }

  function addEdge(raw,sourcePath) {
    const from=nodes.get(raw.from), target=nodes.get(raw.target);
    if (!from || !target || !relationTypesMatch(ontology,raw,from.conceptId,target.conceptId)) {
      fail('TYPED_GRAPH_INVALID',`Semantic graph edge violates CORE types: ${raw.relation}.`);
    }
    const key=edgeKey(raw), current=edges.get(key);
    if (!current) {
      edges.set(key,{from:raw.from,relation:raw.relation,target:raw.target,constraint:raw.constraint,
        ...(raw.weight===undefined?{}:{weight:raw.weight})});
      if (edges.size>budget.maxEdges) resourceLimit('Semantic graph edge limit exceeded.');
    } else if (current.constraint==='typical' && raw.constraint==='typical' &&
        current.weight!==raw.weight) {
      fail('TYPED_GRAPH_WEIGHT_CONFLICT',
        `Conflicting typical weights for semantic edge ${raw.relation}.`);
    } else if (raw.constraint==='required' && current.constraint!=='required') {
      edges.set(key,{from:raw.from,relation:raw.relation,target:raw.target,constraint:'required'});
    }
    addSourcePath(edgeSourcePaths,key,sourcePath);
  }

  function resolveConcept(conceptId) {
    try {
      const concept=core.resolve({kind:'concept',id:conceptId});
      if (!concept || !ontology.get(conceptId)) throw new Error('Unknown concept.');
      return concept;
    } catch (error) {
      if (error instanceof EngineError) throw error;
      fail('TYPED_GRAPH_INVALID',`Invalid CORE reference in semantic graph: ${conceptId}.`);
    }
  }

  function addConceptGraph(conceptId,rootNodeId,sourcePath) {
    resolveConcept(conceptId);
    let graph;
    try {
      graph=ontology.projectConceptGraph(conceptId,{includeTypical:true,maxEdges:budget.maxEdges});
    } catch (error) {
      if (error?.code==='RESOURCE_LIMIT') resourceLimit(error.message||'Concept graph resource limit exceeded.');
      throw error;
    }
    projectionDepth(graph,conceptId,budget.maxDepth);
    const mapId=id=>id===conceptId?rootNodeId:id;
    for (const node of graph.nodes) addNode(mapId(node.id),node.id,sourcePath);
    for (const edge of graph.edges) addEdge({from:mapId(edge.from),relation:edge.relation,
      target:mapId(edge.target),constraint:edge.constraint,
      ...(edge.weight===undefined?{}:{weight:edge.weight})},sourcePath);
    return ontology.get(conceptId);
  }

  function unresolvedAt(path,conceptId,reason,operators) {
    unresolved.push({path,conceptId,reason,
      ...(operators?.length?{operators:operators.map(operator=>({...operator}))}:{})});
  }

  function operatorScope(value,inherited) {
    let operator;
    if (value.type==='question') {
      operator={type:'question',questionType:value.questionType||'unknown'};
    } else if (value.type==='scope') {
      operator={type:'scope',operator:value.operator||'unknown'};
    } else if (value.type==='conditional') {
      operator={type:'conditional',kind:value.kind||'unknown'};
    } else if (value.type==='modality') {
      operator={type:'modality',operator:value.operator||'unknown'};
    } else if (value.type==='complement') {
      operator={type:'complement',concept:value.concept||'unknown'};
    } else if (['event','state'].includes(value.type) && value.features?.polarity==='negative') {
      operator={type:'polarity',value:'negative'};
    }
    return operator?[...inherited,operator]:inherited;
  }

  function scopeReason(operators) {
    const types=operators.map(operator=>operator.type);
    if (types.includes('question')) return 'QUESTION_CONTENT_NOT_ASSERTED';
    if (types.includes('conditional') || types.includes('modality')) {
      return 'HYPOTHETICAL_CONTENT_NOT_ASSERTED';
    }
    if (types.includes('complement')) return 'EMBEDDED_CONTENT_NOT_ASSERTED';
    if (types.includes('scope') || types.includes('polarity')) {
      return 'NEGATED_CONTENT_NOT_PROJECTED';
    }
    return 'UNASSERTED_CONTENT_NOT_PROJECTED';
  }

  function applyEffect(property,propertyId,participantRootId,participantConceptId,path) {
    // A property without a declared relation effect remains in MeaningGraph,
    // but contributes no edge to the typed relation projection.
    if (!property.semanticEffect) return;
    if (!property.appliesTo?.some(type=>ontology.isA(participantConceptId,type))) {
      fail('TYPED_GRAPH_INVALID',`Property ${propertyId} does not apply to ${participantConceptId}.`);
    }
    const effect=property.semanticEffect;
    const relation=ontology.relationTypes?.[effect.relation];
    if (effect.operation!=='add_relation' || !relation ||
        !ontology.isA(participantConceptId,relation.subject) ||
        !ontology.isA(effect.target,relation.object)) {
      fail('TYPED_GRAPH_INVALID',`Property ${propertyId} has an invalid semantic effect.`);
    }
    addConceptGraph(effect.target,effect.target,path);
    addEdge({from:participantRootId,relation:effect.relation,target:effect.target,
      constraint:'required'},path);
  }

  function applyModifier(node,path,participantRootId,participantConceptId,topLevel,
      modifierDepth,inputDepth,state,operators) {
    if (node && typeof node==='object' && active.has(node)) {
      fail('TYPED_GRAPH_INVALID','MeaningGraph contains a reference cycle.');
    }
    if (!record(node) || typeof node.concept!=='string') {
      fail('TYPED_GRAPH_INVALID',`Invalid modifier in semantic graph at ${path}.`);
    }
    if (modifierDepth>MAX_MODIFIER_DEPTH || inputDepth>RESOURCE_LIMITS.interlinguaDepth) {
      resourceLimit('MeaningGraph modifier depth limit exceeded.');
    }
    reserveInputNode(node);
    if (!state.nodes.has(node)) {
      state.nodes.add(node);
      if (++state.count>MAX_ENTITY_MODIFIERS*MAX_ENTITY_MODIFIERS) {
        resourceLimit('MeaningGraph modifier node limit exceeded for a referent.');
      }
    }
    active.add(node);
    try {
      const property=resolveConcept(node.concept);
      if (!['property','degree'].includes(property.type)) {
        fail('TYPED_GRAPH_INVALID',`Modifier ${node.concept} is not a property or degree.`);
      }
      if (operators.length) {
        unresolvedAt(path,node.concept,scopeReason(operators),operators);
      } else if (!topLevel) {
        unresolvedAt(path,node.concept,'NESTED_MODIFIER_SCOPE_UNSUPPORTED');
      } else {
        applyEffect(property,node.concept,participantRootId,participantConceptId,path);
      }
      if (node.modifiers!==undefined) {
        if (!Array.isArray(node.modifiers)) {
          fail('TYPED_GRAPH_INVALID',`Invalid nested modifiers at ${path}.`);
        }
        if (node.modifiers.length>MAX_ENTITY_MODIFIERS) {
          resourceLimit('MeaningGraph modifier breadth limit exceeded.');
        }
        reserveInputNode(node.modifiers);
        reserveInputEdge(node,'modifiers');
        if (active.has(node.modifiers)) {
          fail('TYPED_GRAPH_INVALID','MeaningGraph contains a reference cycle.');
        }
        active.add(node.modifiers);
        try {
          node.modifiers.forEach((child,index)=>{
            reserveInputEdge(node.modifiers,index);
            applyModifier(child,pointer(pointer(path,'modifiers'),index),
              participantRootId,participantConceptId,false,modifierDepth+1,inputDepth+2,state,operators);
          });
        } finally {
          active.delete(node.modifiers);
        }
      }
    } finally {
      active.delete(node);
    }
  }

  function visit(value,path,depth,parent=null,key=null,inheritedOperators=[]) {
    if (depth>RESOURCE_LIMITS.interlinguaDepth) {
      resourceLimit('MeaningGraph projection nesting limit exceeded.');
    }
    if (parent) reserveInputEdge(parent,key);
    if (Array.isArray(value)) {
      if (active.has(value)) fail('TYPED_GRAPH_INVALID','MeaningGraph contains a reference cycle.');
      reserveInputNode(value);
      active.add(value);
      try {
        value.forEach((item,index)=>visit(item,pointer(path,index),depth+1,value,index,inheritedOperators));
      } finally {
        active.delete(value);
      }
      return;
    }
    if (!record(value)) return;
    if (active.has(value)) fail('TYPED_GRAPH_INVALID','MeaningGraph contains a reference cycle.');
    reserveInputNode(value);
    active.add(value);
    const currentOperators=operatorScope(value,inheritedOperators);

    const hasConcept=Object.hasOwn(value,'concept');
    if (hasConcept && typeof value.concept!=='string') {
      fail('TYPED_GRAPH_INVALID',`Invalid concept reference in MeaningGraph at ${path}.`);
    }
    const concept=hasConcept?ontology.get(value.concept):undefined;
    if (hasConcept && !concept) {
      fail('TYPED_GRAPH_INVALID',`Unknown concept in MeaningGraph at ${path}: ${value.concept}.`);
    }
    if (concept?.type==='entity' && !record(value.features)) {
      fail('TYPED_GRAPH_INVALID',`Entity participant is missing features at ${path}.`);
    }
    if (concept?.type==='event' && value.type!=='event') {
      fail('TYPED_GRAPH_INVALID',`Event concept is used by a non-event node at ${path}.`);
    }
    const isParticipant=concept?.type==='entity' && record(value.features);
    const isEvent=concept?.type==='event' && value.type==='event';
    if (isParticipant) {
      meaningRoots.add(path);
      addConceptGraph(value.concept,path,path);
      if (Array.isArray(value.modifiers)) {
        if (value.modifiers.length>MAX_ENTITY_MODIFIERS) {
          resourceLimit('MeaningGraph modifier breadth limit exceeded.');
        }
        reserveInputNode(value.modifiers);
        reserveInputEdge(value,'modifiers');
        if (active.has(value.modifiers)) {
          fail('TYPED_GRAPH_INVALID','MeaningGraph contains a reference cycle.');
        }
        active.add(value.modifiers);
        const modifierState={nodes:new WeakSet(),count:0};
        try {
          value.modifiers.forEach((item,index)=>{
            reserveInputEdge(value.modifiers,index);
            applyModifier(item,pointer(pointer(path,'modifiers'),index),
              path,value.concept,true,1,depth+2,modifierState,currentOperators);
          });
        } finally {
          active.delete(value.modifiers);
        }
      }
    } else if (isEvent) {
      const rootId=pointer(path,'concept');
      meaningRoots.add(rootId);
      addConceptGraph(value.concept,rootId,rootId);
    } else if (value.referent && typeof value.concept!=='string') {
      unresolvedAt(path,null,'REFERENT_WITHOUT_CONCEPT');
    }

    if (value.predicate!==undefined) {
      if (typeof value.predicate!=='string' || ontology.get(value.predicate)?.type!=='property') {
        fail('TYPED_GRAPH_INVALID',`Invalid property predicate in MeaningGraph at ${path}.`);
      }
      const predicate=resolveConcept(value.predicate), predicatePath=pointer(path,'predicate');
      const subject=value.type==='state' && value.kind==='predication' ? value.roles?.subject : null;
      if (record(subject) && typeof subject.concept==='string' && ontology.get(subject.concept)?.type==='entity') {
        const subjectPath=pointer(pointer(path,'roles'),'subject');
        meaningRoots.add(subjectPath);
        addConceptGraph(subject.concept,subjectPath,subjectPath);
        if (!currentOperators.length) {
          applyEffect(predicate,value.predicate,subjectPath,subject.concept,predicatePath);
        } else {
          unresolvedAt(predicatePath,value.predicate,scopeReason(currentOperators),currentOperators);
        }
      } else {
        unresolvedAt(predicatePath,value.predicate,'PREDICATE_SCOPE_UNSUPPORTED');
      }
    }

    for (const [key,item] of Object.entries(value)) {
      if (key==='features' || key==='concept' || (isParticipant && key==='modifiers')) continue;
      visit(item,pointer(path,key),depth+1,value,key,currentOperators);
    }
    active.delete(value);
  }

  visit(meaning,'#',0);
  const projectedGraph={nodes:[...nodes.values()],edges:[...edges.values()]};
  for (const rootId of meaningRoots) projectionDepth(projectedGraph,rootId,budget.maxDepth);
  const orderedNodes=[...nodes.values()].sort((left,right)=>compare(left.id,right.id));
  const orderedEdges=[...edges.values()].sort((left,right)=>compare(left.from,right.from) ||
    compare(left.relation,right.relation) || compare(left.target,right.target) ||
    compare(left.constraint,right.constraint) || (left.weight??0)-(right.weight??0));
  const sourcePaths={
    nodes:Object.fromEntries([...nodeSourcePaths].sort(([left],[right])=>compare(left,right))
      .map(([id,paths])=>[id,[...paths].sort(compare)])),
    edges:Object.fromEntries([...edgeSourcePaths].sort(([left],[right])=>compare(left,right))
      .map(([key,paths])=>[key,[...paths].sort(compare)]))
  };
  unresolved.sort((left,right)=>compare(left.path,right.path) || compare(left.reason,right.reason) ||
    compare(left.conceptId||'',right.conceptId||''));
  return freezeDeep({nodes:orderedNodes,edges:orderedEdges,sourcePaths,unresolved});
}
