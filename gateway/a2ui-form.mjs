import {fail,validateSurface,surfaceSchema} from './visual-contract.mjs';

export const basicCatalogID='https://a2ui.org/specification/v0_9/basic_catalog.json';
const bad=()=>fail(502,'Unsupported A2UI form contract');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const key=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(x)&&!['__proto__','prototype','constructor'].includes(x);
const text=(x,max=2000)=>typeof x==='string'&&x.length<=max;
const modelValue=x=>text(x)||typeof x==='boolean'||(Array.isArray(x)&&x.length<=20&&new Set(x).size===x.length&&x.every(v=>text(v)));
function shape(x,required,optional=[]){
  if(!object(x)||required.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>![...required,...optional].includes(k)))bad();
}
function path(x){
  shape(x,['path']);
  if(typeof x.path!=='string'||!x.path.startsWith('/')||!key(x.path.slice(1)))bad();
  return x.path.slice(1);
}

/** Translate only the source-tested form tree. Unknown features fail; nothing is silently flattened. */
export function normalizeRenderInput(input){
  if(!object(input)||!Object.hasOwn(input,'a2ui'))return validateSurface(input);
  shape(input,['a2ui']);
  if(!Array.isArray(input.a2ui)||input.a2ui.length<3||input.a2ui.length>20)bad();
  let surfaceID;const components=new Map(),model=Object.create(null);
  for(const message of input.a2ui){
    if(!object(message)||message.version!=='v0.9')bad();
    const operation=Object.keys(message).filter(k=>k!=='version');
    if(operation.length!==1)bad();
    const kind=operation[0],value=message[kind];
    if(kind==='createSurface'){
      shape(value,['surfaceId','catalogId']);
      if(surfaceID!==undefined||!key(value.surfaceId)||value.catalogId!==basicCatalogID)bad();
      surfaceID=value.surfaceId;
    }else{
      if(surfaceID===undefined||value?.surfaceId!==surfaceID)bad();
      if(kind==='updateComponents'){
        shape(value,['surfaceId','components']);
        if(!Array.isArray(value.components)||!value.components.length||value.components.length>32)bad();
        for(const c of value.components){
          if(!object(c)||!key(c.id)||components.has(c.id))bad();
          components.set(c.id,c);
        }
      }else if(kind==='updateDataModel'){
        shape(value,['surfaceId','path','value']);
        if(value.path==='/'){
          if(!object(value.value)||Object.keys(value.value).length>32)bad();
          for(const [k,v] of Object.entries(value.value)){if(!key(k)||!modelValue(v))bad();model[k]=v;}
        }else{
          const k=path({path:value.path});if(!modelValue(value.value))bad();model[k]=value.value;
        }
      }else bad();
    }
  }
  if(components.size>32)bad();
  const seen=new Set();
  function take(id,type){
    const c=components.get(id);
    if(!c||c.component!==type||seen.has(id))bad();seen.add(id);return c;
  }
  const root=take('root','Card');shape(root,['id','component','child']);
  const column=take(root.child,'Column');shape(column,['id','component','children']);
  if(!Array.isArray(column.children)||column.children.length<3||column.children.length>10)bad();
  const ids=column.children;
  const heading=take(ids[0],'Text');shape(heading,['id','component','text'],['variant']);
  if(!text(heading.text,120)||!heading.text||(heading.variant!==undefined&&!['h1','h2','h3','h4','h5','h6'].includes(heading.variant)))bad();
  const fields=[],bindingFields=new Map();
  for(const id of ids.slice(1,-1)){
    const type=components.get(id)?.component;
    if(!['TextField','CheckBox','ChoicePicker'].includes(type))bad();
    const c=take(id,type);
    if(type==='ChoicePicker')shape(c,['id','component','options','value'],['label','variant','displayStyle','filterable']);
    else shape(c,['id','component','label','value'],type==='TextField'?['variant']:[]);
    const label=Object.hasOwn(c,'label')?c.label:'';
    if(!text(label,100)||(type!=='ChoicePicker'&&!label))bad();
    const binding=path(c.value);
    if(bindingFields.has(binding)||!Object.hasOwn(model,binding))bad();
    const fieldID='field_'+fields.length;bindingFields.set(binding,fieldID);
    const field={id:fieldID,label,type:'text',required:false,initialValue:model[binding]};
    if(type==='TextField'){
      if(![undefined,'shortText','longText'].includes(c.variant))bad();
      field.type=c.variant==='longText'?'textarea':'text';
    }else if(type==='CheckBox')field.type='checkbox';
    else{
      if(![undefined,'mutuallyExclusive','multipleSelection'].includes(c.variant)||![undefined,'checkbox'].includes(c.displayStyle)||![undefined,false].includes(c.filterable)||!Array.isArray(c.options)||c.options.length>20)bad();
      field.type='choice';field.allowsMultipleSelection=c.variant!=='mutuallyExclusive';
      field.choices=c.options.map(option=>{
        shape(option,['label','value']);
        if(!text(option.value)||!text(option.label,100)||!option.label)bad();
        return {id:option.value,label:option.label};
      });
    }
    fields.push(field);
  }
  if(fields.length<1||fields.length>8)bad();
  const button=take(ids.at(-1),'Button');shape(button,['id','component','child','action'],['variant']);
  if(![undefined,'primary','borderless'].includes(button.variant))bad();
  const label=take(button.child,'Text');shape(label,['id','component','text']);
  if(!text(label.text,100)||!label.text)bad();
  shape(button.action,['event']);const event=button.action.event;shape(event,['name'],['context']);
  const context=Object.hasOwn(event,'context')?event.context:{};
  if(!key(event.name)||!object(context)||Object.keys(context).length>20)bad();
  const contextFields=Object.create(null),literalContext=Object.create(null);
  for(const [k,v] of Object.entries(context)){
    if(!key(k))bad();
    if(object(v)){
      const field=bindingFields.get(path(v));if(!field)bad();contextFields[k]=field;
    }else if(text(v)||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))literalContext[k]=v;
    else bad();
  }
  if(seen.size!==components.size)bad();
  return validateSurface({schemaVersion:2,surfaceID,revision:0,nodes:[{id:'form',kind:'askForm',title:heading.text,fields,
    submitLabel:label.text,formEvent:{name:event.name,surfaceID,sourceComponentID:button.id,contextFields,literalContext}}]});
}

// The single render tool accepts canonical native data or a source packet. Native validation remains separate.
const { $id, $schema, $defs, ...nativeSchema }=surfaceSchema;
export const renderInputSchema={type:'object',oneOf:[nativeSchema,{
  type:'object',additionalProperties:false,required:['a2ui'],properties:{a2ui:{type:'array',minItems:3,maxItems:20,items:{
    type:'object',required:['version'],properties:{version:{const:'v0.9'},createSurface:{type:'object'},updateComponents:{type:'object'},updateDataModel:{type:'object'}},additionalProperties:false
  }}}
}],$defs};
