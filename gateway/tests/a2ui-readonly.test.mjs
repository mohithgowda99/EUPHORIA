import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRenderInput} from '../a2ui-form.mjs';
import {decisionResult} from '../visual-contract.mjs';

const catalogId='https://a2ui.org/specification/v0_9/basic_catalog.json';
const packet={a2uiGraph:[
  {version:'v0.9',createSurface:{surfaceId:'research',catalogId}},
  {version:'v0.9',updateComponents:{surfaceId:'research',components:[
    {id:'root',component:'Column',children:['heading','finding']},
    {id:'heading',component:'Text',variant:'h2',text:'Research findings'},
    {id:'finding',component:'Text',text:{path:'/finding'}}]}},
  {version:'v0.9',updateDataModel:{surfaceId:'research',value:{finding:'A source-backed result'}}}
]};

test('read-only composition requires no invented decision and accepts an exact shown receipt',()=>{
  const surface=normalizeRenderInput(packet);
  assert.equal(surface.nodes[0].composition.components.length,3);
  const action={id:'shown_1',surfaceID:surface.surfaceID,expectedRevision:surface.revision,
    nodeID:'composition',kind:'displayed',values:{}};
  assert.deepEqual(decisionResult(surface,action),{status:'shown'});
  assert.throws(()=>decisionResult(surface,{...action,values:{execute:true}}));
  assert.throws(()=>decisionResult(surface,{...action,expectedRevision:surface.revision+1}));
  assert.throws(()=>decisionResult(surface,{...action,kind:'submitForm',values:{$button:'finding'}}));
});
