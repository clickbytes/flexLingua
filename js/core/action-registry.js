import {record,safeName} from './features.js';

const plain=value=>record(value) &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
const exact=(value,fields)=>plain(value) &&
  Object.keys(value).length===fields.length && fields.every(key=>Object.hasOwn(value,key));
const scalar=value=>value===null || typeof value==='boolean' ||
  typeof value==='string' || (typeof value==='number'&&Number.isFinite(value));

function fail(message) {
  const error=new Error(message);error.code='ACTION_INVALID';throw error;
}

function parameter(spec) {
  if(!plain(spec) || !['string','integer','boolean'].includes(spec.type))fail('Invalid action parameter declaration.');
  if(spec.type==='string') {
    if(!exact(spec,['type','enum']) || !Array.isArray(spec.enum) || !spec.enum.length ||
        spec.enum.length>32 || spec.enum.some(value=>!safeName(value)))
      fail('String parameters require a bounded safe allowlist.');
  } else if(spec.type==='integer') {
    if(!exact(spec,['type','min','max']) || !Number.isSafeInteger(spec.min) ||
        !Number.isSafeInteger(spec.max) || spec.min>spec.max)
      fail('Integer parameters require safe bounds.');
  } else if(!exact(spec,['type']))fail('Invalid boolean parameter.');
}

function valueMatches(value,spec) {
  if(spec.type==='string')return spec.enum.includes(value);
  if(spec.type==='integer')return Number.isSafeInteger(value)&&
    value>=spec.min&&value<=spec.max;
  return typeof value==='boolean';
}

/** A finite, declarative local action script. It never evaluates code or opens I/O. */
export class ActionRegistry {
  #state;
  #actions=new Map();

  constructor(initialState={}) {
    if(!plain(initialState) || Object.entries(initialState).some(([key,value])=>
        !safeName(key) || !scalar(value)))fail('Invalid local action state.');
    this.#state=structuredClone(initialState);
  }

  snapshot(){return structuredClone(this.#state);}

  register(definition) {
    if(!exact(definition,['id','parameters','effects']) || !safeName(definition.id) ||
        this.#actions.has(definition.id) || !plain(definition.parameters) ||
        Object.keys(definition.parameters).length>16 ||
        !Array.isArray(definition.effects) || !definition.effects.length ||
        definition.effects.length>16)fail('Invalid or duplicate action declaration.');
    for(const [key,spec] of Object.entries(definition.parameters)) {
      if(!safeName(key))fail('Invalid action parameter name.');
      parameter(spec);
    }
    for(const effect of definition.effects) {
      if(!plain(effect) || !['set','increment'].includes(effect.op) ||
          !safeName(effect.key) || !Object.hasOwn(this.#state,effect.key))
        fail('Action effect is outside declared local state.');
      if(effect.op==='set') {
        if(!exact(effect,['op','key','from']) ||
            !Object.hasOwn(definition.parameters,effect.from))
          fail('Set effect must use a declared parameter.');
        const stateType=typeof this.#state[effect.key];
        const parameterType=definition.parameters[effect.from].type;
        if((stateType==='number'?'integer':stateType)!==parameterType)
          fail('Set effect type differs from local state.');
      } else if(!exact(effect,['op','key','by']) ||
          typeof this.#state[effect.key]!=='number' ||
          !Number.isSafeInteger(this.#state[effect.key]) ||
          !Number.isSafeInteger(effect.by) || Math.abs(effect.by)>1000000)
        fail('Increment effect requires a bounded integer delta.');
    }
    this.#actions.set(definition.id,structuredClone(definition));
    return definition.id;
  }

  plan({id,args={},decision}={}) {
    const action=this.#actions.get(id);
    if(!action)fail('Action is not allowlisted.');
    if(!exact(decision,['version','type','outcome','question','act','realization',
      'evidence','reason','confidence']) || decision.version!=='1.0' ||
        decision.type!=='response_plan' || decision.outcome!=='answer' ||
        !['answer','confirm'].includes(decision.act?.act) ||
        decision.confidence?.level!=='grounded')
      fail('Action requires a grounded Conversation Engine decision.');
    if(!plain(args) || Object.keys(args).length!==Object.keys(action.parameters).length ||
        Object.entries(action.parameters).some(([key,spec])=>
          !Object.hasOwn(args,key)||!valueMatches(args[key],spec)))
      fail('Action arguments do not match the allowlist.');
    const after=this.snapshot();
    for(const effect of action.effects) {
      if(effect.op==='set')after[effect.key]=args[effect.from];
      else {
        const next=after[effect.key]+effect.by;
        if(!Number.isSafeInteger(next))fail('Action integer overflow.');
        after[effect.key]=next;
      }
    }
    return {id,arguments:structuredClone(args),effects:structuredClone(action.effects),
      before:this.snapshot(),after};
  }

  execute({id,args={},decision,authorized=false,dryRun=false}={}) {
    const plan=this.plan({id,args,decision});
    if(dryRun===true)return {...plan,applied:false};
    if(authorized!==true)fail('Action execution requires explicit authorization.');
    this.#state=structuredClone(plan.after);
    return {...plan,applied:true};
  }
}
