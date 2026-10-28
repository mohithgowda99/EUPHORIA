import {test} from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderInputSchema,normalizeRenderInput} from '../a2ui-form.mjs';
import {decisionResult} from '../visual-contract.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/a2ui-trip-v09.json',import.meta.url)));
const components=p=>p.a2ui[1].updateComponents.components;
test('source trip form becomes native defaults and returns edited A2UI context',()=>{
  const surface=normalizeRenderInput(fixture()),node=surface.nodes[0];
  assert.equal(surface.schemaVersion,2);assert.equal(node.title,'Trip preferences');
  assert.equal(node.fields[0].initialValue,'Paris');assert.equal(node.submitLabel,'Confirm');
  const action={id:'answer',surfaceID:surface.surfaceID,expectedRevision:surface.revision,nodeID:node.id,kind:'submitForm',values:{field_0:'Kyoto'}};
  assert.deepEqual(decisionResult(surface,action),{userAction:{name:'confirm_trip',surfaceId:'trip',sourceComponentId:'confirm',context:{destination:'Kyoto'}}});
  action.values.field_0='  ';assert.equal(decisionResult(surface,action).userAction.context.destination,'  ');
  action.values.field_0='';assert.equal(decisionResult(surface,action).userAction.context.destination,'');
});
test('source event scalar literals coexist with edited bindings',()=>{
  const p=fixture();components(p)[4].action.event.context.count=3;
  const s=normalizeRenderInput(p);assert.equal(decisionResult(s,{id:'a',surfaceID:s.surfaceID,expectedRevision:0,nodeID:'form',kind:'submitForm',values:{field_0:'Kyoto'}}).userAction.context.count,3);
});
test('unknown versions catalogs components attributes aliases and dangling bindings fail explicitly',()=>{
  const mutations=[p=>p.a2ui[0].version='v0.8',p=>p.a2ui[0].createSurface.catalogId='unknown',
    p=>components(p)[1].component='Row',p=>components(p)[3].validationRegexp='.*',
    p=>components(p)[3].variant='obscured',p=>components(p)[4].action.event.context.destination.path='/missing',
    p=>components(p)[1].children.push('title'),p=>components(p)[1].children.push('missing'),
    p=>components(p)[0].child='root',p=>components(p).push({id:'hidden',component:'Text',text:'Not reachable'}),
    p=>components(p)[3].value.path='/nested/path',p=>p.a2ui[2].updateDataModel.value.destination=4,
    p=>p.a2ui.push(p.a2ui[0]),p=>p.a2ui[2].updateDataModel.surfaceId='other',
    p=>components(p)[4].action.event.context.destination={function:'getSecret'},
    p=>components(p).push({...components(p)[3],id:'destination'}),
    p=>{components(p)[1].children.splice(2,0,'alias');components(p).push({...components(p)[3],id:'alias'});}];
  for(const mutate of mutations){const p=fixture();mutate(p);assert.throws(()=>normalizeRenderInput(p));}
});

test('advertised tool schema and bundled native projection match the source fixture',()=>{
  const validate=new Ajv({strict:false}).compile(renderInputSchema);
  assert.equal(validate(fixture()),true);
  const normalized=normalizeRenderInput(fixture());assert.equal(validate(normalized),true);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)),JSON.parse(readFileSync(new URL('../../ios/VisualRuntimeCore/Sources/VisualRuntimeCore/Fixtures/a2ui-trip-native.json',import.meta.url))));
});

test('source native projection refuses strings over the shared UTF-16 limit',()=>{
  for(const field of ['initial','literal']){
    const s=JSON.parse(JSON.stringify(normalizeRenderInput(fixture())));
    if(field==='initial')s.nodes[0].fields[0].initialValue='😀'.repeat(1001);
    else s.nodes[0].formEvent.literalContext.extra='😀'.repeat(1001);
    assert.throws(()=>normalizeRenderInput(s));
  }
});
