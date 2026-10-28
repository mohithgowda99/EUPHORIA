import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRenderInput} from '../a2ui-form.mjs';
import {decisionResult} from '../visual-contract.mjs';
const original=()=>JSON.parse(readFileSync(new URL('./fixtures/a2ui-controls-v09.json',import.meta.url)));
function nested(){
  const p=original(),components=p.a2ui[1].updateComponents.components;
  for(const c of components){
    if(c.value?.path)c.value.path='/trip'+c.value.path;
    if(c.action)for(const v of Object.values(c.action.event.context))v.path='/trip'+v.path;
  }
  p.a2ui[2].updateDataModel.value={trip:p.a2ui[2].updateDataModel.value};return p;
}
const update=(p,path,value)=>p.a2ui.push({version:'v0.9',updateDataModel:{surfaceId:'trip-controls',path,value}});
const result=p=>normalizeRenderInput(p).nodes[0];
test('nested text boolean and selection defaults normalize to existing native fields and edited context',()=>{
  const s=normalizeRenderInput(nested()),node=s.nodes[0];
  assert.deepEqual(node.fields.map(f=>f.initialValue),['Paris',false,[],['walk']]);
  assert.deepEqual(decisionResult(s,{id:'nested-answer',surfaceID:s.surfaceID,expectedRevision:0,nodeID:'form',kind:'submitForm',values:{field_0:'Kyoto',field_1:true,field_2:['push'],field_3:[]}}).userAction.context,
    {destination:'Kyoto',notify:true,channel:['push'],activities:[]});
});
test('subtree updates replace values and leaf updates create absent object parents',()=>{
  const p=nested();p.a2ui[2].updateDataModel.value={};
  update(p,'/trip/destination','Rome');update(p,'/trip/notify',true);update(p,'/trip/channel',[]);update(p,'/trip/activities',[]);
  assert.deepEqual(result(p).fields.map(f=>f.initialValue),['Rome',true,[],[]]);
  update(p,'/trip',{destination:'Tokyo',notify:false,channel:['email'],activities:['run']});
  assert.equal(result(p).fields[0].initialValue,'Tokyo');
  update(p,'/trip',{destination:'Missing siblings'});assert.throws(()=>result(p));
});
test('root data updates replace the previous root rather than retaining missing keys',()=>{
  const p=original();update(p,'/',{destination:'Rome'});assert.throws(()=>result(p));
});
test('new root can change containers while child writes refuse primitive traversal',()=>{
  const p=nested();update(p,'/trip','blocked');update(p,'/trip/destination','Kyoto');assert.throws(()=>result(p));
  const q=nested();update(q,'/trip','blocked');update(q,'/',{trip:original().a2ui[2].updateDataModel.value});assert.equal(result(q).fields[0].initialValue,'Paris');
});
test('nested bindings reject missing nodes null objects non-leaves and ambiguous paths',()=>{
  for(const path of ['/missing/destination','/trip','/trip//destination','trip/destination','/trip/../destination','/trip/0','/trip/~1destination','/trip/__proto__','/trip/constructor']){
    const p=nested();p.a2ui[1].updateComponents.components.find(c=>c.id==='destination').value.path=path;assert.throws(()=>result(p),path);
  }
  for(const value of [null,42,{bad:null},JSON.parse('{"__proto__":{"polluted":true}}')]){
    const p=nested();update(p,'/hidden',value);assert.throws(()=>result(p));
  }
  assert.equal({}.polluted,undefined);
});
test('nested model depth width and total entries are bounded before publication',()=>{
  for(const value of [Object.fromEntries(Array.from({length:33},(_,i)=>['k'+i,'x'])),
    {a:{b:{c:{d:{e:{f:{g:{h:{i:'too deep'}}}}}}}}},
    Object.fromEntries(Array.from({length:5},(_,i)=>['group'+i,Object.fromEntries(Array.from({length:26},(_,j)=>['k'+j,'x']))]))]){
    const p=nested();update(p,'/extra',value);assert.throws(()=>result(p));
  }
  const p=nested();update(p,'/trip/destination','😀'.repeat(1001));assert.throws(()=>result(p));
});
test('same-looking keys remain exact and unrelated hidden data cannot satisfy a binding',()=>{
  const p=nested();p.a2ui[2].updateDataModel.value.trip.destinatión='Madrid';delete p.a2ui[2].updateDataModel.value.trip.destination;
  assert.throws(()=>result(p));
});

test('native-only composition studies are not advertised or accepted as live graph delivery',()=>{
  assert.throws(()=>normalizeRenderInput({schemaVersion:2,surfaceID:'offline-study',revision:1,nodes:[{
    id:'composition',kind:'sourceComposition',title:'Offline composition',composition:{version:'v0.9',components:[]}
  }]}));
});
