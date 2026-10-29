import {validateGraph,graphResult} from './a2ui-graph.mjs';
import Ajv from 'ajv/dist/2020.js';
import {readFileSync} from 'node:fs';
export const surfaceSchema=JSON.parse(readFileSync(new URL('../docs/agents/visual-surface-v1.schema.json',import.meta.url)));
const validate=new Ajv({strict:false,allErrors:false}).compile(surfaceSchema);
export class GatewayError extends Error {constructor(status,message){super(message);this.status=status;}}
export function fail(status,message){throw new GatewayError(status,message);}
export function identifier(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value))fail(422,'Invalid identifier');return value;
}
export function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const boundedText=x=>typeof x==='string'&&x.length<=2000;
/** Rendering an answer is not a human decision. Only an admitted event can
 * keep a generated composition waiting for a user response. */
export function requiresHumanAction(node){
  if(node.kind==='sourceComposition')return node.composition?.components?.some(c=>c.component==='Button')??false;
  return ['askChoice','askForm','askApproval'].includes(node.kind);
}
const boundedStrings=x=>Array.isArray(x)&&x.length<=20&&new Set(x).size===x.length&&x.every(boundedText);
function sourceValueValid(field,value){
  if(['text','textarea'].includes(field.type))return boundedText(value);
  if(field.type==='checkbox')return typeof value==='boolean';
  if(field.type==='choice')return boundedStrings(value)&&
    (field.allowsMultipleSelection||value.length<=1)&&value.every(v=>field.choices?.some(c=>c.id===v));
  return false;
}
function sourceFieldValid(field){
  if(field.required||field.options!==undefined||field.min!==undefined||field.max!==undefined)return false;
  if(field.type==='choice'){
    if(typeof field.allowsMultipleSelection!=='boolean'||!Array.isArray(field.choices)||field.choices.length>20||
      new Set(field.choices.map(c=>c.id)).size!==field.choices.length||field.choices.some(c=>!boundedText(c.id)||!c.label||c.label.length>100))return false;
  }else if(field.choices!==undefined||field.allowsMultipleSelection!==undefined)return false;
  return sourceValueValid(field,field.initialValue);
}
export function validateSurface(surface){
  const graphs=surface?.nodes?.filter(n=>n.kind==='sourceComposition')??[];
  if(graphs.length){
    if(surface.schemaVersion!==2||surface.nodes.length!==1)fail(502,'Unsupported source surface');
    const n=graphs[0];if(Object.keys(n).sort().join(',')!=='composition,id,kind,title'||n.id!=='composition'||typeof n.title!=='string'||!n.title||n.title.length>120)fail(502,'Invalid source node');
    validateGraph(n.composition);
  }
  const check=graphs.length?{...surface,nodes:[{id:'composition',kind:'showChecklist',title:graphs[0].title,items:[]}]}:surface;
  if(!validate(check))fail(502,'Unsupported visual surface');
  const unique=items=>new Set(items.map(x=>x.id)).size===items.length;
  if(!unique(surface.nodes))fail(502,'Duplicate node identity');
  let decisions=0;
  for(const n of surface.nodes){
    // These IDs participate in local flat binding paths; exclude separators/prototype names.
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(n.id))fail(502,'Unsupported node identity');
    if(requiresHumanAction(n))decisions++;
    if(n.submitLabel!==undefined&&n.kind!=='askForm')fail(502,'Invalid form label');
    if(!n.formEvent&&n.fields?.some(f=>['checkbox','choice'].includes(f.type)||f.choices!==undefined||f.allowsMultipleSelection!==undefined||(f.initialValue!==undefined&&!boundedText(f.initialValue))))fail(502,'Invalid native field');
    if(n.formEvent){
      const e=n.formEvent, fields=n.fields??[];
      const safe=k=>/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(k)&&!['__proto__','prototype','constructor'].includes(k);
      if(surface.schemaVersion!==2||n.kind!=='askForm'||!n.submitLabel||![e.name,e.surfaceID,e.sourceComponentID].every(safe)||
        fields.some(f=>!sourceFieldValid(f))||
        [...Object.keys(e.contextFields),...Object.keys(e.literalContext)].some(k=>!safe(k))||
        Object.keys(e.contextFields).some(k=>Object.hasOwn(e.literalContext,k))||
        Object.values(e.literalContext).some(v=>typeof v==='string'&&v.length>2000)||
        Object.values(e.contextFields).some(id=>!fields.some(f=>f.id===id)))fail(502,'Invalid source form event');
    }
    if(n.kind==='askChoice'&&(!n.options?.length||!unique(n.options)))fail(502,'Invalid choices');
    if(n.kind==='askForm'){
      if(!n.fields?.length||!unique(n.fields))fail(502,'Invalid form');
      for(const f of n.fields){
        if(f.type!=='choice'&&!f.label)fail(502,'Empty field label');
        if(f.min!==undefined&&f.max!==undefined&&f.min>f.max)fail(502,'Invalid field bounds');
        if(f.type==='select'&&(!f.options?.length||new Set(f.options).size!==f.options.length))fail(502,'Invalid field choices');
      }
    }
    if(n.items&&!unique(n.items))fail(502,'Duplicate item identity');
    if(n.kind==='htmlArtifact'&&Buffer.byteLength(n.html)>128000)fail(502,'Artifact too large');
    if(n.kind==='gallery'){
      const g=n.gallery;
      if(!g)fail(502,'Gallery content missing');
      if(g.kind==='record'&&!Array.isArray(g.fields))fail(502,'Record fields missing');
      if(g.kind==='metrics'&&!Array.isArray(g.metrics))fail(502,'Metrics missing');
      if(g.kind==='notice'&&typeof g.body!=='string')fail(502,'Notice body missing');
      if(g.kind==='table'&&(!g.columns||!g.rows||new Set(g.columns).size!==g.columns.length||g.columns.some(c=>!c.trim())||g.rows.some(r=>r.cells.length!==g.columns.length)))fail(502,'Invalid table');
      if(['bar','pie','progress'].includes(g.kind)&&(!g.points||g.points.some(p=>(g.kind==='pie'&&p.value<0)||(g.kind==='progress'&&p.target===undefined))))fail(502,'Invalid chart points');
      if(['line','area'].includes(g.kind)&&(!g.labels||!g.series||new Set(g.series.map(s=>s.name)).size!==g.series.length||g.series.some(s=>s.values.length!==g.labels.length)))fail(502,'Invalid chart series');
    }
    if(n.kind==='pageChecklist')fail(502,'Editable pages are not supported by this tool yet');
  }
  if(decisions>1)fail(502,'This tool supports at most one active decision');
  return surface;
}
export function decisionResult(surface,action){
  if(!action||Array.isArray(action)||Object.keys(action).sort().join(',')!=='expectedRevision,id,kind,nodeID,surfaceID,values')fail(422,'Invalid action');
  identifier(action.id);
  if(action.surfaceID!==surface.surfaceID||action.expectedRevision!==surface.revision)fail(409,'Surface revision changed');
  const node=surface.nodes.find(n=>n.id===action.nodeID),v=action.values;
  if(!node||!v||Array.isArray(v)||typeof v!=='object')fail(422,'Invalid decision');
  const keys=Object.keys(v);
  if(action.kind==='displayed'&&!surface.nodes.some(requiresHumanAction)){
    if(action.nodeID!==surface.nodes[0].id||keys.length)fail(422,'Invalid display receipt');
    return {status:'shown'};
  }
  const text=x=>typeof x==='string'&&x.length<=2000;
  if(node.kind==='sourceComposition'&&action.kind==='submitForm')return graphResult(node.composition,v);
  if(node.kind==='askChoice'&&action.kind==='choose'){
    const option=node.options.find(o=>o.id===v.choice);
    if(keys.length!==2||!option||v.label!==option.label)fail(422,'Invalid choice');
    return {choice:v.choice,label:v.label};
  }
  if(node.kind==='askApproval'&&action.kind==='decide'){
    if(!['approved','declined'].includes(v.decision)||keys.some(k=>!['decision','note'].includes(k))||
      (Object.hasOwn(v,'note')&&!text(v.note)))fail(422,'Invalid approval');
    return Object.hasOwn(v,'note')?{decision:v.decision,note:v.note}:{decision:v.decision};
  }
  if(node.kind==='askForm'&&action.kind==='submitForm'){
    if(node.formEvent){
      if(keys.length!==node.fields.length||node.fields.some(f=>!sourceValueValid(f,v[f.id]))||keys.some(k=>!node.fields.some(f=>f.id===k)))fail(422,'Invalid source form values');
      const e=node.formEvent,context={...e.literalContext};
      for(const [name,field] of Object.entries(e.contextFields))context[name]=v[field];
      return {userAction:{name:e.name,surfaceId:e.surfaceID,sourceComponentId:e.sourceComponentID,context}};
    }
    if(keys.some(k=>!node.fields.some(f=>f.id===k)))fail(422,'Unknown form field');
    for(const f of node.fields){
      if(!Object.hasOwn(v,f.id)){if(f.required)fail(422,'Required field missing');continue;}
      const x=v[f.id];
      if(f.type==='number'){
        if(typeof x!=='number'||!Number.isFinite(x)||(f.min!==undefined&&x<f.min)||(f.max!==undefined&&x>f.max))fail(422,'Invalid number');
      }else{
        if(!text(x)||!x.trim()||x!==x.trim())fail(422,'Invalid field value');
        if(f.type==='select'&&!f.options.includes(x))fail(422,'Invalid selection');
        if(f.type==='email'&&(!x.includes('@')||x.includes(' ')))fail(422,'Invalid email');
      }
    }
    return {status:'submitted',values:v};
  }
  fail(422,'Unsupported operation');
}
