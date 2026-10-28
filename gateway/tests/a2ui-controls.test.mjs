import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import {renderInputSchema,normalizeRenderInput} from '../a2ui-form.mjs';
import {decisionResult} from '../visual-contract.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/a2ui-controls-v09.json',import.meta.url)));
const component=(p,id)=>p.a2ui[1].updateComponents.components.find(c=>c.id===id);
const answer=s=>({id:'answer',surfaceID:s.surfaceID,expectedRevision:s.revision,nodeID:'form',kind:'submitForm',values:{field_0:'Kyoto',field_1:false,field_2:[],field_3:['walk']}});
test('boolean and selection defaults retain types and labels distinct from values',()=>{
  const s=normalizeRenderInput(fixture()),f=s.nodes[0].fields;
  assert.equal(f[1].initialValue,false);assert.equal(f[1].type,'checkbox');
  assert.deepEqual(f[2].initialValue,[]);assert.equal(f[2].allowsMultipleSelection,false);
  assert.deepEqual(f[2].choices[0],{id:'email',label:'Email message'});
  assert.deepEqual(f[3].initialValue,['walk']);assert.equal(f[3].allowsMultipleSelection,true);
  const a=answer(s);a.values.field_1=true;a.values.field_2=['push'];a.values.field_3=['walk','run'];
  assert.deepEqual(decisionResult(s,a).userAction.context,{destination:'Kyoto',notify:true,channel:['push'],activities:['walk','run']});
  a.values.field_1=false;a.values.field_2=[];a.values.field_3=[];
  assert.deepEqual(decisionResult(s,a).userAction.context,{destination:'Kyoto',notify:false,channel:[],activities:[]});
});
test('forged selection types unknown values duplicates and exclusive cardinality fail',()=>{
  const s=normalizeRenderInput(fixture());
  for(const [key,value] of [['field_1','false'],['field_2','email'],['field_2',['email','push']],['field_3',['unknown']],['field_3',['walk','walk']],['field_3',[true]],['field_3',null]]){
    const a=answer(s);a.values[key]=value;assert.throws(()=>decisionResult(s,a));
  }
});
test('invalid source defaults and unsupported control properties never normalize',()=>{
  const changes=[p=>p.a2ui[2].updateDataModel.value.notify='false',p=>p.a2ui[2].updateDataModel.value.channel=['email','push'],
    p=>p.a2ui[2].updateDataModel.value.activities=['missing'],p=>component(p,'activities').options.push({label:'Duplicate',value:'walk'}),
    p=>component(p,'channel').filterable=true,p=>component(p,'channel').displayStyle='chips',
    p=>component(p,'notify').checks=[],p=>component(p,'activities').options[0].label={path:'/destination'},
    p=>component(p,'channel').value={path:'/nested/channel'},p=>component(p,'channel').options[0].value='😀'.repeat(1001)];
  for(const mutate of changes){const p=fixture();mutate(p);assert.throws(()=>normalizeRenderInput(p));}
});
test('omitted choice variant follows pinned renderer multiple-selection behavior',()=>{
  const p=fixture();delete component(p,'channel').variant;p.a2ui[2].updateDataModel.value.channel=['email','push'];
  assert.equal(normalizeRenderInput(p).nodes[0].fields[2].allowsMultipleSelection,true);
});
test('optional choice group label and empty stable option values remain meaningful',()=>{
  const p=fixture();const c=component(p,'channel');delete c.label;c.options.push({label:'No preference',value:''});
  p.a2ui[2].updateDataModel.value.channel=[''];
  const s=normalizeRenderInput(p);assert.equal(s.nodes[0].fields[2].label,'');
  const a=answer(s);a.values.field_2=[''];assert.deepEqual(decisionResult(s,a).userAction.context.channel,['']);
});

test('mixed native fixture is the exact source projection and fits the advertised schema',()=>{
  const s=normalizeRenderInput(fixture()),validate=new Ajv({strict:false}).compile(renderInputSchema);
  assert.equal(validate(s),true);
  assert.deepEqual(JSON.parse(JSON.stringify(s)),JSON.parse(readFileSync(new URL('../../ios/VisualRuntimeCore/Sources/VisualRuntimeCore/Fixtures/a2ui-controls-native.json',import.meta.url))));
});

test('null group labels are rejected rather than treated as absent',()=>{
  const p=fixture();component(p,'channel').label=null;assert.throws(()=>normalizeRenderInput(p));
});
test('canonically equivalent choice values remain distinct exact wire values',()=>{
  const p=fixture();component(p,'activities').options=[{label:'Composed',value:'é'},{label:'Decomposed',value:'e\u0301'}];
  p.a2ui[2].updateDataModel.value.activities=[];
  const s=normalizeRenderInput(p),a=answer(s);a.values.field_3=['é','e\u0301'];
  assert.deepEqual(decisionResult(s,a).userAction.context.activities,['é','e\u0301']);
  const only=fixture();component(only,'activities').options=[{label:'Composed',value:'é'}];only.a2ui[2].updateDataModel.value.activities=[];
  const one=normalizeRenderInput(only),forged=answer(one);forged.values.field_3=['e\u0301'];
  assert.throws(()=>decisionResult(one,forged));
});

test('explicit null event context is rejected rather than dropped',()=>{
  const p=fixture();component(p,'confirm').action.event.context=null;assert.throws(()=>normalizeRenderInput(p));
});
