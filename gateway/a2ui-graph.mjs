import {fail,stable} from './visual-contract.mjs';
export const graphCatalogID='https://a2ui.org/specification/v0_9/basic_catalog.json';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const safe=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(x)&&!['__proto__','prototype','constructor'].includes(x);
const text=x=>typeof x==='string'&&x.length<=2000;
const bad=()=>fail(502,'Unsupported A2UI graph contract');
function shape(x,required,optional=[]){if(!object(x)||required.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>![...required,...optional].includes(k)))bad();}
function bounded(x,depth=0,budget={n:4096}){
 if(--budget.n<0||depth>12)bad();
 if(x===null||typeof x==='boolean'||text(x)||typeof x==='number'&&Number.isFinite(x))return;
 if(Array.isArray(x)){if(x.length>80)bad();for(const v of x)bounded(v,depth+1,budget);return;}
 if(!object(x)||Object.keys(x).length>80)bad();for(const [k,v] of Object.entries(x)){if(!safe(k))bad();bounded(v,depth+1,budget);}
}
function parts(path){if(typeof path!=='string'||path.length>256||!path.startsWith('/')||path==='/')bad();const p=path.slice(1).split('/');if(p.length>8||!p.every(safe))bad();return p;}
function binding(x){if(!object(x))return null;shape(x,['path']);parts(x.path);return x.path;}
function lookup(model,path){let v=model;for(const k of parts(path)){if(!object(v)||!Object.hasOwn(v,k))bad();v=v[k];}return v;}
function replace(model,path,value,hasValue=true){
 if(path==='/'){if(!hasValue||!object(value))bad();return structuredClone(value);}
 let v=model;const p=parts(path);for(const k of p.slice(0,-1)){if(!Object.hasOwn(v,k))v[k]={};if(!object(v[k]))bad();v=v[k];}
 if(hasValue)v[p.at(-1)]=structuredClone(value);else delete v[p.at(-1)];return model;
}
function scalar(v){return text(v)||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||Array.isArray(v)&&v.length<=20&&v.every(text);}
const editable=c=>['TextField','CheckBox','ChoicePicker','Slider','DateTimeInput'].includes(c.component);
const resolve=(raw,model)=>binding(raw)?lookup(model,raw.path):raw;
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))bad();
 const time=Date.parse(value);if(!Number.isFinite(time)||new Date(time).toISOString().replace('.000Z','Z')!==value)bad();return time;
}
function checkChoice(c,v){
 if(!Array.isArray(v)||v.length>20||!v.every(text)||new Set(v).size!==v.length||c.variant==='mutuallyExclusive'&&v.length>1)bad();
 if(v.some(x=>!c.options.some(o=>o.value===x)))bad();
}
/** Same bounded projection rendered by the native study; functions and unsupported presentation are refused. */
export function validateGraph(d){
 shape(d,['version','surfaceId','catalogId','revision','components','dataModel'],['localEdits']);
 if(d.version!=='v0.9'||!safe(d.surfaceId)||d.catalogId!==graphCatalogID||!Number.isSafeInteger(d.revision)||d.revision<0||!object(d.dataModel)||d.localEdits!==undefined&&(!object(d.localEdits)||Object.keys(d.localEdits).length))bad();
 if(!Array.isArray(d.components)||!d.components.length||d.components.length>200)bad();
 const budget={n:4096};bounded(d.dataModel,0,budget);
 const nodes=new Map();for(const c of d.components){if(!object(c)||!safe(c.id)||nodes.has(c.id))bad();nodes.set(c.id,c);const {id,component,...props}=c;bounded(props,0,budget);}
 const seen=new Set();
 function typed(raw,type,optional=false){if(raw===undefined&&optional)return;const v=resolve(raw,d.dataModel);if(type==='string'?!text(v):type==='bool'?typeof v!=='boolean':type==='number'?typeof v!=='number'||!Number.isFinite(v):!Array.isArray(v)||v.length>20||!v.every(text))bad();}
 function visit(id,depth=0){
  const c=nodes.get(id);if(depth>24||!c||seen.has(id))bad();seen.add(id);
  const base=['id','component'];
  switch(c.component){
   case 'Column':case 'Row':case 'List':
    shape(c,[...base,'children'],c.component==='List'?['direction','align']:['justify','align']);
    if(c.align!==undefined&&!['start','center','end','stretch'].includes(c.align)||c.justify!==undefined&&!['start','center','end','spaceBetween','spaceAround','spaceEvenly','stretch'].includes(c.justify)||c.direction!==undefined&&!['vertical','horizontal'].includes(c.direction))bad();
    if(!Array.isArray(c.children)||c.children.length>40)bad();for(const child of c.children){if(!safe(child))bad();visit(child,depth+1);}break;
   case 'Tabs':
    shape(c,[...base,'tabs']);if(!Array.isArray(c.tabs)||!c.tabs.length||c.tabs.length>20)bad();
    for(const tab of c.tabs){shape(tab,['title','child']);typed(tab.title,'string');if(!safe(tab.child))bad();visit(tab.child,depth+1);}break;
   case 'Modal':shape(c,[...base,'trigger','content']);if(!safe(c.trigger)||!safe(c.content))bad();visit(c.trigger,depth+1);visit(c.content,depth+1);break;
   case 'Divider':shape(c,base,['axis']);if(c.axis!==undefined&&!['horizontal','vertical'].includes(c.axis))bad();break;
   case 'Icon':shape(c,[...base,'name']);typed(c.name,'string');if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(resolve(c.name,d.dataModel)))bad();break;
   case 'Card':shape(c,[...base,'child']);visit(c.child,depth+1);break;
   case 'Text':shape(c,[...base,'text'],['variant']);typed(c.text,'string');if(c.variant!==undefined&&!['h1','h2','h3','h4','h5','caption','body'].includes(c.variant))bad();break;
   case 'TextField':shape(c,[...base,'label'],['value']);typed(c.label,'string');typed(c.value,'string',true);break;
   case 'Slider':{
    shape(c,[...base,'value','max'],['label','min']);typed(c.label,'string',true);typed(c.value,'number');
    const min=c.min??0,max=c.max,value=resolve(c.value,d.dataModel);
    if(typeof min!=='number'||!Number.isFinite(min)||typeof max!=='number'||!Number.isFinite(max)||min>=max||value<min||value>max)bad();break;
   }
   case 'DateTimeInput':{
    shape(c,[...base,'value'],['label','enableDate','enableTime','min','max']);typed(c.label,'string',true);typed(c.value,'string');
    if(c.enableDate!==undefined&&typeof c.enableDate!=='boolean'||c.enableTime!==undefined&&typeof c.enableTime!=='boolean'||!(c.enableDate||c.enableTime))bad();
    const value=instant(resolve(c.value,d.dataModel));const min=c.min===undefined?-Infinity:instant(resolve(c.min,d.dataModel)),max=c.max===undefined?Infinity:instant(resolve(c.max,d.dataModel));
    if(min>max||value<min||value>max)bad();break;
   }
   case 'CheckBox':shape(c,[...base,'label','value']);typed(c.label,'string');typed(c.value,'bool');break;
   case 'ChoicePicker':{
    shape(c,[...base,'options','value'],['label','variant']);typed(c.label,'string',true);typed(c.value,'list');
    if(c.variant!==undefined&&!['mutuallyExclusive','multipleSelection'].includes(c.variant)||!Array.isArray(c.options)||!c.options.length||c.options.length>20)bad();
    const options=new Set();for(const o of c.options){shape(o,['label','value']);typed(o.label,'string');const label=resolve(o.label,d.dataModel);if(!label||label.length>100||!text(o.value)||options.has(o.value))bad();options.add(o.value);}
    checkChoice(c,resolve(c.value,d.dataModel));break;
   }
   case 'Button':{
    shape(c,[...base,'child','action'],['variant']);if(c.variant!==undefined&&!['primary','borderless'].includes(c.variant))bad();visit(c.child,depth+1);
    shape(c.action,['event']);const e=c.action.event;shape(e,['name'],['context']);if(!safe(e.name))bad();
    const context=e.context??{};if(!object(context)||Object.keys(context).length>20)bad();for(const [k,v] of Object.entries(context)){if(!safe(k)||!scalar(resolve(v,d.dataModel)))bad();}break;
   }
   default:bad();
  }
 }
 visit('root');if(seen.size!==nodes.size)bad();return d;
}
/** Explicit source operation input; prior authority is the existing persisted surface, never client state. */
export function normalizeGraphInput(input,previous){
 shape(input,['a2uiGraph'],['expectedRevision']);const ops=input.a2uiGraph;
 if(!Array.isArray(ops)||!ops.length||ops.length>40)bad();
 let d,created=false;const old=previous?.nodes?.length===1&&previous.nodes[0].kind==='sourceComposition'?previous.nodes[0].composition:null;
 if(input.expectedRevision!==undefined){if(!old||input.expectedRevision!==previous.revision)fail(409,'Source revision changed');d=structuredClone(old);}
 for(const msg of ops){
  shape(msg,['version'],['createSurface','updateComponents','updateDataModel']);if(msg.version!=='v0.9')bad();
  const kinds=Object.keys(msg).filter(k=>k!=='version');if(kinds.length!==1)bad();const kind=kinds[0],v=msg[kind];
  if(kind==='createSurface'){
   shape(v,['surfaceId','catalogId']);if(d||created||old?.surfaceId===v.surfaceId||!safe(v.surfaceId)||v.catalogId!==graphCatalogID)bad();
   d={version:'v0.9',surfaceId:v.surfaceId,catalogId:v.catalogId,revision:0,components:[],dataModel:{},localEdits:{}};created=true;
  }else{
   if(!d||v?.surfaceId!==d.surfaceId)bad();
   if(kind==='updateComponents'){
    shape(v,['surfaceId','components']);if(!Array.isArray(v.components)||!v.components.length||v.components.length>200)bad();const seen=new Set();
    for(const c of v.components){if(!object(c)||!safe(c.id)||seen.has(c.id))bad();seen.add(c.id);const i=d.components.findIndex(n=>n.id===c.id);if(i<0)d.components.push(structuredClone(c));else d.components[i]=structuredClone(c);}
   }else if(kind==='updateDataModel'){
    shape(v,['surfaceId'],['path','value']);if(Object.hasOwn(v,'value'))bounded(v.value);d.dataModel=replace(d.dataModel,v.path??'/',v.value,Object.hasOwn(v,'value'));
   }else bad();
  }
 }
 validateGraph(d);return {schemaVersion:2,surfaceID:previous?.surfaceID??d.surfaceId,revision:previous?.revision??0,nodes:[{id:'composition',kind:'sourceComposition',title:'Interactive workspace',composition:d}]};
}
/** Exact native submission envelope; supplied context grants no new paths, functions or literals. */
export function graphResult(d,values){
 validateGraph(d);if(!object(values))fail(422,'Invalid source event');
 const button=d.components.find(c=>c.id===values.$button&&c.component==='Button');if(!button)fail(422,'Invalid source button');
 const event=button.action.event,ctx=event.context??{},names=Object.keys(ctx);if(Object.keys(values).length!==names.length+1||Object.keys(values).some(k=>k!=='$button'&&!names.some(n=>'context:'+n===k)))fail(422,'Invalid source event fields');
 const candidate=structuredClone(d),edits=new Map();
 try{
  for(const [k,raw] of Object.entries(ctx)){
   const path=binding(raw),value=values['context:'+k];if(!scalar(value))bad();
   if(path&&d.components.some(c=>editable(c)&&binding(c.value)===path)){
    if(edits.has(path)&&stable(edits.get(path))!==stable(value))bad();edits.set(path,value);
   }else if(stable(resolve(raw,d.dataModel))!==stable(value))bad();
  }
  for(const [path,value] of edits)candidate.dataModel=replace(candidate.dataModel,path,value);
  validateGraph(candidate);const context={};for(const [k,raw] of Object.entries(ctx)){const value=resolve(raw,candidate.dataModel);if(stable(value)!==stable(values['context:'+k]))bad();context[k]=value;}
  return {userAction:{name:event.name,surfaceId:d.surfaceId,sourceComponentId:button.id,context}};
 }catch(error){if(error?.status===502)fail(422,'Invalid source event context');throw error;}
}
