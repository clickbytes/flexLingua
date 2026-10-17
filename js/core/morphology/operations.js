import { record } from '../features.js';

const OPERATION_FIELDS = Object.freeze({
  append:{required:['op','value']},
  prepend:{required:['op','value']},
  appendStem:{required:['op','key']},
  stripSuffix:{required:['op','value']},
  replaceSuffix:{required:['op','from','to']},
  selectStem:{required:['op','key']},
  harmonicSuffix:{required:['op','template']},
  softenFinal:{required:['op']},
  rootTemplate:{required:['op','template']},
  reduplicate:{required:['op','mode'],optional:['value']}
});
const OPERATIONS = new Set(Object.keys(OPERATION_FIELDS));
const MAX_STEPS=16;
const MAX_LENGTH=120;
const LAST_VOWEL=/[aeıioöuü]/giu;
const HIGH_VOWELS={a:'ı',ı:'ı',o:'u',u:'u',e:'i',i:'i',ö:'ü',ü:'ü'};
const LOW_VOWELS={a:'a',ı:'a',o:'a',u:'a',e:'e',i:'e',ö:'e',ü:'e'};
const SOFT={p:'b',t:'d',ç:'c',k:'ğ'};
const SAFE_STRING=s=>typeof s==='string' && s.length <= MAX_LENGTH && !/[<>\x00-\x1f]/u.test(s);

export function validateOperations(steps) {
  if (!Array.isArray(steps) || steps.length > MAX_STEPS) throw new Error('Invalid morphology operation list.');
  for (const step of steps) {
    if (!record(step) || !OPERATIONS.has(step.op)) throw new Error(`Unknown morphology operation: ${step?.op}`);
    const fields=OPERATION_FIELDS[step.op];
    const allowed=new Set([...fields.required,...(fields.optional||[])]);
    const unexpected=Object.keys(step).find(key=>!allowed.has(key));
    if (unexpected) throw new Error(`Unexpected morphology operation field: ${unexpected}.`);
    if (fields.required.some(key=>!Object.hasOwn(step,key))) {
      throw new Error(`Invalid morphology operation fields for ${step.op}.`);
    }
    if (['append','prepend','stripSuffix'].includes(step.op) &&
        (!SAFE_STRING(step.value) || !step.value)) throw new Error('Invalid morphology operation value.');
    if (step.op === 'replaceSuffix' && (!SAFE_STRING(step.from) || !SAFE_STRING(step.to) || !step.from)) {
      throw new Error('Invalid replacement suffix.');
    }
    if (['selectStem','appendStem'].includes(step.op) &&
        (typeof step.key!=='string' || !/^[A-Za-z][A-Za-z0-9_]*$/u.test(step.key))) {
      throw new Error('Invalid morphology stem key.');
    }
    if (step.op === 'harmonicSuffix' && (!SAFE_STRING(step.template) ||
        !/^[AIaeıioöuüçğştnmyrl]+$/u.test(step.template))) {
      throw new Error('Invalid vowel-harmony template.');
    }
    if (step.op === 'rootTemplate' && (!SAFE_STRING(step.template) ||
        !/^(?:[^{}]|\{[123]\})+$/u.test(step.template) || !step.template.includes('{1}'))) {
      throw new Error('Invalid root-template operation.');
    }
    if (step.op === 'reduplicate' && (!['whole','firstSyllable'].includes(step.mode) ||
        step.value !== undefined && !SAFE_STRING(step.value))) {
      throw new Error('Invalid reduplication operation.');
    }
  }
  return true;
}

export function executeOperations({stem,stems={},steps=[]}) {
  validateOperations(steps);
  if (!SAFE_STRING(stem) || !stem) throw new Error('Missing or invalid lexical stem.');
  let text=stem;
  const trace=[];
  for (const step of steps) {
    const before=text;
    switch(step.op) {
      case 'append': text+=step.value; break;
      case 'appendStem':
        if (!SAFE_STRING(stems[step.key]) || !stems[step.key]) throw new Error(`Unknown lexical stem ${step.key}.`);
        text+=stems[step.key]; break;
      case 'prepend': text=step.value+text; break;
      case 'stripSuffix':
        if (!text.endsWith(step.value) || !step.value) throw new Error(`Stem does not end in ${step.value}.`);
        text=text.slice(0,-step.value.length); break;
      case 'replaceSuffix':
        if (!text.endsWith(step.from)) throw new Error(`Stem does not end in ${step.from}.`);
        text=text.slice(0,-step.from.length)+step.to; break;
      case 'selectStem':
        if (!SAFE_STRING(stems[step.key]) || !stems[step.key]) throw new Error(`Unknown lexical stem ${step.key}.`);
        text=stems[step.key]; break;
      case 'softenFinal':
        if (!SOFT[text.at(-1)]) throw new Error('No softening alternation for final consonant.');
        text=text.slice(0,-1)+SOFT[text.at(-1)]; break;
      case 'harmonicSuffix': {
        const vowels=[...text.matchAll(LAST_VOWEL)];
        const vowel=vowels.at(-1)?.[0]?.toLocaleLowerCase('tr');
        if (!vowel) throw new Error('Cannot infer vowel harmony from stem.');
        text+=step.template.replace(/[AI]/gu, token => (token==='A'?LOW_VOWELS:HIGH_VOWELS)[vowel]);
        break;
      }
      case 'rootTemplate': {
        const root=stems.root;
        if (typeof root !== 'string' || [...root].length!==3) throw new Error('Consonantal root must have three letters.');
        const letters=[...root];
        text=step.template.replace(/\{([123])\}/gu, (_whole,n)=>letters[Number(n)-1]);
        break;
      }
      case 'reduplicate': {
        if (step.mode==='whole') text=text+(step.value ?? '')+text;
        else {
          const match=text.match(/^[^aeiouıöü]*[aeiouıöü][^aeiouıöü]*/iu);
          if (!match) throw new Error('Cannot locate first syllable for reduplication.');
          text=match[0]+(step.value ?? '')+text;
        }
        break;
      }
    }
    if (!SAFE_STRING(text) || text.length>MAX_LENGTH) throw new Error('Morphological output exceeds length limit.');
    trace.push({op:step.op,before,after:text});
  }
  return {text,trace};
}
