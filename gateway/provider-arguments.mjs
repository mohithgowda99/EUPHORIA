import {fail,stable} from './visual-contract.mjs';
/** Bound decoded and wire arguments before recursive canonicalization or any refusal journal. */
export function argumentFingerprint(raw){
 const stack=[{value:raw,depth:0}];let entries=0,bytes=0;
 while(stack.length){
  const {value,depth}=stack.pop();if(++entries>20000||depth>48)fail(502,'Provider arguments exceed supported bounds');
  if(typeof value==='string'){bytes+=Buffer.byteLength(value);}
  else if(value&&typeof value==='object'){
   const keys=Object.keys(value);if(keys.length>1000)fail(502,'Provider arguments exceed supported bounds');
   for(const key of keys){bytes+=Buffer.byteLength(key);stack.push({value:value[key],depth:depth+1});}
  }else if(value!==null&&!['boolean','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))fail(502,'Invalid provider argument value');
  if(bytes>128*1024)fail(502,'Provider arguments exceed supported bounds');
 }
 const fingerprint=stable(raw);if(Buffer.byteLength(fingerprint)>128*1024)fail(502,'Provider arguments exceed supported bounds');return fingerprint;
}
