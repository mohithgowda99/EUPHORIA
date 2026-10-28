// Explicit native QA fixture. Never an inference fallback or a real external action executor.
import {createGateway} from '../gateway.mjs';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const token='euphoria-explicit-local-fixture-token';
const gallery=JSON.parse(readFileSync(new URL('../../ios/VisualRuntimeCore/Sources/VisualRuntimeCore/Fixtures/gallery-v2.json',import.meta.url)));
const sessions=new Map();let serial=0;
function surface(s){return s.step===3?gallery:{schemaVersion:1,surfaceID:'fixture-model-id',revision:0,nodes:[
  s.step===0?{id:'focus',kind:'askChoice',title:'Choose a focus',options:[{id:'training',label:'Training'},{id:'planning',label:'Planning'}]}:
  s.step===1?{id:'details',kind:'askForm',title:'Session details',fields:[{id:'name',label:'Session name',type:'text',required:true}]}:
  {id:'review',kind:'askApproval',title:'Review the plan',summary:'QA fixture only. Approving records a response; no external task runs.'}
]};}
function add(s,item){s.items.push({id:'item_'+s.items.length,status:'completed',...item});}
const provider={
  async createSession(){const id='sess_native_fixture_'+(++serial);sessions.set(id,{step:0,items:[]});return {id};},
  async sendMessage(id,message){const s=sessions.get(id);add(s,{type:'message',role:'user',content:[{type:'input_text',text:message}]});
    add(s,{type:'message',role:'assistant',content:[{type:'output_text',text:'Explicit QA acknowledgement — no inference.'}]});},
  async cancelTurn(id){sessions.get(id).step=4;console.log('QA cancel accepted');},
  async listItems(id,{after,limit,order}){let items=[...sessions.get(id).items];if(order==='desc')items.reverse();
    if(after){const at=items.findIndex(x=>x.id===after);assert.ok(at>=0);items=items.slice(at+1);}
    const data=items.slice(0,limit);return {data,has_more:items.length>limit,first_id:data[0]?.id??null,last_id:data.at(-1)?.id??null};},
  async retrieveSession(id){const s=sessions.get(id);const callID='call_fixture_'+s.step;
    if(s.step<4&&!s.items.some(x=>x.call_id===callID))add(s,{type:'function_call',turn_id:'turn_fixture',call_id:callID,name:'euphoria_render_surface'});
    return {id,status:s.step>=4?'idle':'in_progress',required_actions:s.step>=4?[]:[{
      type:'function_call',turn_id:'turn_fixture',call_id:callID,name:'euphoria_render_surface',arguments:surface(s)}]};},
  async submitToolResult(id,result){const s=sessions.get(id);assert.equal(result.callID,'call_fixture_'+s.step);
    if(s.step===0)assert.deepEqual(result.output,{choice:'training',label:'Training'});
    if(s.step===1){assert.equal(result.output.status,'submitted');assert.equal(typeof result.output.values.name,'string');}
    if(s.step===2)assert.ok(['approved','declined'].includes(result.output.decision));
    if(s.step===3)assert.deepEqual(result.output,{status:'shown'});
    s.step++;console.log('QA result accepted for step',s.step);
  }
};
const directory=mkdtempSync(join(tmpdir(),'euphoria-native-fixture-'));
const server=createGateway({provider,model:'explicit-fixture-no-inference',databasePath:join(directory,'gateway.sqlite'),
  verificationMode:'fixture',authenticate:async req=>req.headers.authorization==='Bearer '+token?'fixture-owner':null});
server.listen(8788,'127.0.0.1',()=>console.log('EXPLICIT LOCAL QA FIXTURE on127.0.0.1:8788; no OpenAI requests. State:',directory));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
