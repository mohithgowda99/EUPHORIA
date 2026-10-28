import {fail} from './visual-contract.mjs';
const bad=()=>fail(502,'Unsupported A2UI form model');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safe=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(x)&&!['__proto__','prototype','constructor'].includes(x);
const text=x=>typeof x==='string'&&x.length<=2000;
export function sourcePath(value){
  if(!object(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'path')||typeof value.path!=='string'||!value.path.startsWith('/'))bad();
  const parts=value.path.slice(1).split('/');
  if(parts.length>8||!parts.every(safe))bad();
  return value.path;
}
function copy(value,depth=0,budget={entries:0}){
  if(depth>8)bad();
  if(text(value)||typeof value==='boolean')return value;
  if(Array.isArray(value)){
    if(value.length>20||!value.every(text)||new Set(value).size!==value.length)bad();
    return [...value];
  }
  if(!object(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))bad();
  const entries=Object.entries(value);budget.entries+=entries.length;
  if(entries.length>32||budget.entries>128)bad();
  const result=Object.create(null);
  for(const [key,v] of entries){if(!safe(key))bad();result[key]=copy(v,depth+1,budget);}
  return result;
}
/** Temporary source-packet normalization only; persisted authority remains the native form projection. */
export class SourceFormModel {
  #root=Object.create(null);
  set(path,value){
    if(path==='/'){
      if(!object(value))bad();
      this.#root=copy(value);return;
    }
    const parts=sourcePath({path}).slice(1).split('/');
    const candidate=copy(this.#root);let current=candidate;
    for(const part of parts.slice(0,-1)){
      if(!Object.hasOwn(current,part))current[part]=Object.create(null);
      if(!object(current[part]))bad();
      current=current[part];
    }
    current[parts.at(-1)]=copy(value);
    this.#root=copy(candidate);
  }
  get(path){
    let value=this.#root;
    for(const part of sourcePath({path}).slice(1).split('/')){
      if(!object(value)||!Object.hasOwn(value,part))bad();
      value=value[part];
    }
    if(object(value))bad();
    return value;
  }
}
