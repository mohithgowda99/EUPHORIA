import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRenderInput} from '../a2ui-form.mjs';
import {decisionResult,validateSurface} from '../visual-contract.mjs';
const doc=(name='trip')=>JSON.parse(readFileSync(new URL(`./fixtures/a2ui-graph-${name}-v09.json`,import.meta.url)));
const packet=(d=doc())=>({a2uiGraph:[{version:'v0.9',createSurface:{surfaceId:d.surfaceId,catalogId:d.catalogId}},{version:'v0.9',updateComponents:{surfaceId:d.surfaceId,components:d.components}},{version:'v0.9',updateDataModel:{surfaceId:d.surfaceId,path:'/',value:d.dataModel}}]});
const action=(s,values)=>({id:'answer',surfaceID:s.surfaceID,expectedRevision:s.revision,nodeID:'composition',kind:'submitForm',values});
test('source graph renders nested shared controls without flattening into a form',()=>{
 const s=normalizeRenderInput(packet()); assert.equal(s.nodes[0].kind,'sourceComposition');
 assert.deepEqual(s.nodes[0].composition.components,doc().components);validateSurface(s);
 assert.deepEqual(decisionResult(s,action(s,{'$button':'submit','context:destination':'Kyoto','context:notify':true,'context:source':'native'})),{userAction:{name:'confirm_trip',surfaceId:'trip',sourceComponentId:'submit',context:{destination:'Kyoto',notify:true,source:'native'}}});
});
test('graph events refuse invented button context literals read-only bindings and conflicting shared edits',()=>{
 const d=doc();d.components.find(c=>c.id==='submit').action.event.context.alias={path:'/trip/destination'};
 const s=normalizeRenderInput(packet(d)),v={'$button':'submit','context:destination':'Kyoto','context:alias':'Kyoto','context:notify':true,'context:source':'native'};
 assert.doesNotThrow(()=>decisionResult(s,action(s,v)));
 for(const change of [{'$button':'field'},{'context:alias':'Paris'},{'context:source':'invented'},{extra:true},{'context:notify':'true'}])assert.throws(()=>decisionResult(s,action(s,{...v,...change})));
 delete v['context:alias'];assert.throws(()=>decisionResult(s,action(s,v)));
 const q=doc();q.dataModel.fixed='server';q.components.find(c=>c.id==='submit').action.event.context.fixed={path:'/fixed'};
 const r=normalizeRenderInput(packet(q));assert.throws(()=>decisionResult(r,action(r,{'$button':'submit','context:destination':'Kyoto','context:notify':true,'context:source':'native','context:fixed':'forged'})));
 assert.throws(()=>decisionResult(s,{...action(s,v),kind:'displayed',values:{}}));
});
test('revision-checked partial source operations upsert components and replace/delete model subtrees atomically',()=>{
 const s=normalizeRenderInput(packet());s.revision=7;s.nodes[0].composition.revision=7;
 const input={expectedRevision:7,a2uiGraph:[{version:'v0.9',updateComponents:{surfaceId:'trip',components:[{id:'title',component:'Text',text:'Revised'}]}},{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/trip/destination',value:'Rome'}}]};
 const n=normalizeRenderInput(input,s);assert.equal(n.nodes[0].composition.components.find(c=>c.id==='title').text,'Revised');assert.equal(n.nodes[0].composition.dataModel.trip.destination,'Rome');assert.equal(s.nodes[0].composition.dataModel.trip.destination,'Paris');
 assert.throws(()=>normalizeRenderInput({...input,expectedRevision:6},s));assert.throws(()=>normalizeRenderInput(input));
 assert.throws(()=>normalizeRenderInput({expectedRevision:7,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'other',path:'/',value:{}}}]},s));
 const hidden=doc();hidden.dataModel.unused='drop';const p=normalizeRenderInput(packet(hidden));
 const removed=normalizeRenderInput({expectedRevision:0,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/unused'}}]},p);assert.equal(Object.hasOwn(removed.nodes[0].composition.dataModel,'unused'),false);
});
for(const [name,change] of [
 ['catalog',d=>d.catalogId='https://attacker.test/catalog'],['cycle',d=>d.components[0].children.push('root')],
 ['reuse',d=>d.components[0].children.push('title')],['orphan',d=>d.components.push({id:'orphan',component:'Text',text:'hidden'})],
 ['function',d=>d.components.find(c=>c.id==='submit').action={functionCall:{name:'delete'}}],
 ['bounds',d=>d.dataModel.trip.destination='😀'.repeat(1001)],['props',d=>d.components[0].align='teleport'],
 ['unbound',d=>d.components.find(c=>c.id==='field').value={path:'/missing'}],['prototype',d=>d.dataModel=JSON.parse('{"__proto__":{}}')],
 ['bad initial choice',d=>{const q=doc('deployment');Object.assign(d,q);const c=d.components.find(c=>c.component==='ChoicePicker');let m=d.dataModel;const parts=c.value.path.slice(1).split('/');for(const k of parts.slice(0,-1))m=m[k];m[parts.at(-1)]=['forged'];}],
])test(`graph safely refuses ${name}`,()=>{const d=doc();change(d);assert.throws(()=>normalizeRenderInput(packet(d)));});
test('hidden oversized properties and data, unsafe identities, excessive depth and extra operation keys fail closed',()=>{
 for(const change of [d=>d.components[0].id='root.foo',d=>d.dataModel.huge=Array(81).fill('x'),d=>d.components[0].children=Array(41).fill('title'),d=>d.localEdits={'/trip/destination':'forged'}]){
  const d=doc();change(d);if(d.localEdits&&Object.keys(d.localEdits).length)assert.throws(()=>normalizeRenderInput({schemaVersion:2,surfaceID:'x',revision:0,nodes:[{id:'composition',kind:'sourceComposition',title:'x',composition:d}]}));else assert.throws(()=>normalizeRenderInput(packet(d)));
 }
 const p=packet();p.a2uiGraph[0].deleteSurface={surfaceId:'trip'};assert.throws(()=>normalizeRenderInput(p));
});

test('source omitted data path means root replacement and existing source identity requires revisioned updates',()=>{
 const p=packet();delete p.a2uiGraph[2].updateDataModel.path;assert.equal(normalizeRenderInput(p).nodes[0].composition.dataModel.trip.destination,'Paris');
 const s=normalizeRenderInput(packet());assert.throws(()=>normalizeRenderInput(packet(),s));
});
test('deployment choices preserve UTF16 identity and enforce every shared picker constraint',()=>{
 const d=doc('deployment'),c=d.components.find(c=>c.component==='ChoicePicker');
 c.options=[{label:'Composed',value:'é'},{label:'Decomposed',value:'e\u0301'}];
 let model=d.dataModel;const p=c.value.path.slice(1).split('/');for(const k of p.slice(0,-1))model=model[k];model[p.at(-1)]=['é'];
 const s=normalizeRenderInput(packet(d)),button=d.components.find(c=>c.component==='Button'),event=button.action.event;
 const values={'$button':button.id};for(const [k,v] of Object.entries(event.context??{}))values['context:'+k]=v.path===c.value.path?['e\u0301']:v;
 assert.deepEqual(decisionResult(s,action(s,values)).userAction.context,Object.fromEntries(Object.entries(values).filter(([k])=>k!=='$button').map(([k,v])=>[k.slice(8),v])));
 values[Object.keys(values).find(k=>k!=='$button'&&Array.isArray(values[k]))]=['e\u0301','é'];assert.throws(()=>decisionResult(s,action(s,values)));
});

test('advertised tool schema describes graph operations instead of admitting arbitrary message objects',async()=>{
 const {default:Ajv}=await import('ajv/dist/2020.js');const {renderInputSchema}=await import('../a2ui-form.mjs');const validate=new Ajv({strict:false}).compile(renderInputSchema);
 assert.equal(validate(packet()),true);assert.equal(validate({a2uiGraph:[{script:'arbitrary'}]}),false);assert.equal(validate({a2uiGraph:[{version:'v0.9',updateComponents:{surfaceId:'trip',components:[{id:'x',component:'Script',code:'bad'}]}}]}),false);
});

test('versioned exchange schemas accept native-compatible synthetic surface action and provider result fixtures',async()=>{
 const {default:Ajv}=await import('ajv/dist/2020.js');const load=name=>JSON.parse(readFileSync(new URL('../../docs/contracts/'+name,import.meta.url)));
 const ajv=new Ajv({strict:false});ajv.addSchema(load('a2ui-graph-input-v1.schema.json'));const validate=ajv.compile(load('a2ui-graph-exchange-v1.schema.json'));
 const f=load('fixtures/a2ui-graph-v1.json');for(const v of [f.surface,f.action,f.toolResult])assert.equal(validate(v),true,JSON.stringify(validate.errors));
});

test('v2 provider envelope preserves exact v1 event and exposes explicit revision metadata without changing v1 schema',async()=>{
 const {default:Ajv}=await import('ajv/dist/2020.js');const load=name=>JSON.parse(readFileSync(new URL('../../docs/contracts/'+name,import.meta.url)));
 const ajv=new Ajv({strict:false});ajv.addSchema(load('a2ui-graph-input-v1.schema.json'));ajv.addSchema(load('a2ui-graph-exchange-v1.schema.json'));
 const valid=ajv.compile(load('a2ui-graph-result-v2.schema.json')),f=load('fixtures/a2ui-graph-result-v2.json');assert.equal(valid(f.toolResult),true,JSON.stringify(valid.errors));
 assert.deepEqual(f.toolResult.userAction,load('fixtures/a2ui-graph-v1.json').toolResult.userAction);assert.equal(f.nextPartialUpdate.expectedRevision,f.toolResult.euphoria.revision);
 assert.equal(valid({...f.toolResult,euphoria:{...f.toolResult.euphoria,revision:0}}),false);
});

test('pinned component updates may omit an existing type but replace rather than merge properties',async()=>{
 const s=normalizeRenderInput(packet());
 const update={expectedRevision:s.revision,a2uiGraph:[{version:'v0.9',updateComponents:{surfaceId:'trip',components:[{id:'title',text:'Revised heading'}]}}]};
 const n=normalizeRenderInput(update,s),title=n.nodes[0].composition.components.find(c=>c.id==='title');
 assert.deepEqual(title,{id:'title',component:'Text',text:'Revised heading'});
 assert.deepEqual(s.nodes[0].composition.components,doc().components);
 const {default:Ajv}=await import('ajv/dist/2020.js');const {renderInputSchema}=await import('../a2ui-form.mjs');const check=new Ajv({strict:false}).compile(renderInputSchema);assert.equal(check(update),true,JSON.stringify(check.errors));
 for(const components of [[{id:'brandNew',text:'Unknown type'}],[{id:'title',variant:'h1'}],[{id:'title',text:'x',script:'bad'}]])assert.throws(()=>normalizeRenderInput({expectedRevision:0,a2uiGraph:[{version:'v0.9',updateComponents:{surfaceId:'trip',components}}]},s));
});
