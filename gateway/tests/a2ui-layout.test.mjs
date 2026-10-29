import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateGraph} from '../a2ui-graph.mjs';
import {renderInputSchema} from '../a2ui-form.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/a2ui-layout-v09.json',import.meta.url)));
test('native layout composition admits bounded lists tabs modal details icons and exact upstream alignment',async()=>{
 const d=fixture();assert.equal(validateGraph(d),d);
 const {default:Ajv}=await import('ajv/dist/2020.js');const check=new Ajv({strict:false}).compile(renderInputSchema);
 assert.equal(check({a2uiGraph:[{version:'v0.9',createSurface:{surfaceId:d.surfaceId,catalogId:d.catalogId}},{version:'v0.9',updateComponents:{surfaceId:d.surfaceId,components:d.components}},{version:'v0.9',updateDataModel:{surfaceId:d.surfaceId,value:d.dataModel}}]}),true,JSON.stringify(check.errors));
});
test('layout relations retain tree ownership and refuse unsupported properties enum fallbacks and unsafe icons',()=>{
 for(const mutate of [d=>d.components[0].align='left',d=>d.components[0].justify='space-between',d=>d.components.find(c=>c.id==='list').direction='diagonal',d=>d.components.find(c=>c.id==='rule').axis='depth',d=>d.components.find(c=>c.id==='tabs').tabs=[],d=>d.components.find(c=>c.id==='tabs').tabs[1].child='first',d=>d.components.find(c=>c.id==='modal').content='root',d=>d.components.find(c=>c.id==='icon').name={path:'/missing'},d=>d.components.find(c=>c.id==='icon').name={svg:'arbitrary'},d=>d.components.find(c=>c.id==='modal').action={event:{name:'bypass'}}]){
  const d=fixture();mutate(d);assert.throws(()=>validateGraph(d));
 }
});
