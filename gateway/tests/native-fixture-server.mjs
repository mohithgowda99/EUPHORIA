// Explicit native QA fixture, never selected by the real server or used as an inference fallback.
import {createGateway} from '../gateway.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const token='euphoria-explicit-local-fixture-token';
let step=0;
const surface=()=>({schemaVersion:1,surfaceID:'fixture-model-id',revision:0,nodes:[
  step===0?{id:'focus',kind:'askChoice',title:'Choose a focus',options:[{id:'training',label:'Training'},{id:'planning',label:'Planning'}]}:
  step===1?{id:'details',kind:'askForm',title:'Session details',fields:[{id:'name',label:'Session name',type:'text',required:true}]}:
  {id:'review',kind:'askApproval',title:'Review the plan',summary:'QA fixture only. Approving records a response; no external task runs.'}
]});
const provider={
  async createSession(){step=0;return {id:'sess_native_fixture'};},
  async retrieveSession(){return {id:'sess_native_fixture',status:step>=3?'idle':'in_progress',required_actions:step>=3?[]:[{
    type:'function_call',turn_id:'turn_fixture',call_id:'call_fixture_'+step,name:'euphoria_render_surface',arguments:surface()}]};},
  async submitToolResult(id,result){
    assert.equal(id,'sess_native_fixture');assert.equal(result.callID,'call_fixture_'+step);
    if(step===0)assert.deepEqual(result.output,{choice:'training',label:'Training'});
    if(step===1){assert.equal(result.output.status,'submitted');assert.equal(typeof result.output.values.name,'string');}
    if(step===2)assert.ok(['approved','declined'].includes(result.output.decision));
    step++;console.log('QA result accepted for step',step);
  }
};
const directory=mkdtempSync(join(tmpdir(),'euphoria-native-fixture-'));
const server=createGateway({provider,model:'explicit-fixture-no-inference',databasePath:join(directory,'gateway.sqlite'),
  verificationMode:'fixture',authenticate:async req=>req.headers.authorization==='Bearer '+token?'fixture-owner':null});
server.listen(8788,'127.0.0.1',()=>console.log('EXPLICIT LOCAL QA FIXTURE on127.0.0.1:8788; no OpenAI requests. State:',directory));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
