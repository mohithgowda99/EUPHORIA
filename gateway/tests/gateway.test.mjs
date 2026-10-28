import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGateway} from '../gateway.mjs';

const choice = () => ({schemaVersion:1,surfaceID:'model-id',revision:0,nodes:[{
  id:'deploy',kind:'askChoice',title:'Deploy where?',options:[{id:'staging',label:'Staging'}]}]});
function sourceProvider(surface=choice()) {
  const p={creates:0,results:[],current:{id:'sess_test',status:'in_progress',required_actions:[{
    type:'function_call',turn_id:'turn_test',call_id:'call_test',name:'euphoria_render_surface',arguments:surface}]},
    async createSession(){this.creates++;return {id:'sess_test'};},
    async retrieveSession(){return structuredClone(this.current);},
    async submitToolResult(id,result,key){this.results.push({id,result,key});},
  };return p;
}
async function setup(t,provider=sourceProvider()) {
  const directory=await mkdtemp(join(tmpdir(),'euphoria-gateway-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const databasePath=join(directory,'gateway.sqlite');
  let server;
  async function reopen(){
    if(server) await new Promise(resolve=>server.close(resolve));
    server=createGateway({provider,databasePath,model:'test-model',authenticate:async req=>
      ({'Bearer alice':'alice','Bearer bob':'bob'})[req.headers.authorization] ?? null});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  let origin=await reopen();
  t.after(async()=>{if(server?.listening)await new Promise(resolve=>server.close(resolve));});
  async function request(path,{method='GET',body,user='alice'}={}) {
    const res=await fetch(origin+path,{method,headers:{'authorization':'Bearer '+user,
      'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,body:await res.json()};
  }
  async function start(){
    assert.equal((await request('/v1/sessions',{method:'POST',body:{id:'create-1',message:'Help me deploy'}})).status,201);
    const response=await request('/v1/sessions/sess_test');assert.equal(response.status,200);return response.body;
  }
  return {provider,request,start,reopen:async()=>{origin=await reopen();}};
}
function answer(snapshot,id='answer-1'){return {id,surfaceID:snapshot.surface.surfaceID,
  expectedRevision:snapshot.surface.revision,nodeID:'deploy',kind:'choose',values:{choice:'staging',label:'Staging'}};}

test('authentication is mandatory; one account cannot list or access another account session/surface',async t=>{
  const {request,start,provider}=await setup(t);
  assert.equal((await request('/v1/sessions',{user:'unknown'})).status,401);
  const s=await start();
  assert.equal((await request('/v1/sessions/sess_test',{user:'bob'})).status,404);
  assert.deepEqual((await request('/v1/sessions',{user:'bob'})).body,{sessions:[]});
  assert.equal((await request(`/v1/surfaces/${s.surface.surfaceID}/actions`,{user:'bob',method:'POST',body:answer(s)})).status,404);
  assert.equal(provider.results.length,0);
});

test('creation is durable and idempotent, with conflicting reuse refused',async t=>{
  const {request,start,provider,reopen}=await setup(t);await start();await reopen();
  const same=await request('/v1/sessions',{method:'POST',body:{id:'create-1',message:'Help me deploy'}});
  assert.equal(same.status,200);assert.equal(same.body.sessionID,'sess_test');assert.equal(provider.creates,1);
  assert.equal((await request('/v1/sessions',{method:'POST',body:{id:'create-1',message:'Something else'}})).status,409);
});

test('publishes validated model nodes under gateway-owned surface identity and revision',async t=>{
  const {start,request}=await setup(t);const s=await start();
  assert.notEqual(s.surface.surfaceID,'model-id');assert.equal(s.surface.revision,1);
  assert.equal(s.surface.nodes[0].title,'Deploy where?');assert.equal(s.phase,'waiting');
  assert.deepEqual((await request('/v1/sessions/sess_test')).body.surface,s.surface);
});

for(const [name,change] of [
  ['unknown kind',s=>s.nodes[0].kind='script'],
  ['duplicate IDs',s=>s.nodes.push(structuredClone(s.nodes[0]))],
  ['too many active decisions',s=>s.nodes.push({...structuredClone(s.nodes[0]),id:'second'})],
  ['missing choice options',s=>delete s.nodes[0].options],
])test(`invalid model output: ${name} never published`,async t=>{
  const s=choice();change(s);const {request}=await setup(t,sourceProvider(s));
  await request('/v1/sessions',{method:'POST',body:{id:'create-1',message:'hi'}});
  assert.equal((await request('/v1/sessions/sess_test')).status,502);
});

test('exact choice result, accepted intent receipt, repeated and concurrent taps never repeat provider write',async t=>{
  const {start,request,provider,reopen}=await setup(t);const s=await start();const a=answer(s);
  const path=`/v1/surfaces/${s.surface.surfaceID}/actions`;
  const [first,again]=await Promise.all([request(path,{method:'POST',body:a}),request(path,{method:'POST',body:a})]);
  assert.equal(first.status,202);assert.equal(again.status,202);
  assert.equal(provider.results.length,1);
  assert.deepEqual(provider.results[0].result,{turnID:'turn_test',callID:'call_test',name:'euphoria_render_surface',
    output:{choice:'staging',label:'Staging'}});
  assert.deepEqual(again.body.acknowledgedActionIDs,['answer-1']);
  assert.deepEqual(again.body.resolvedNodeIDs,['deploy']);
  await reopen();assert.equal((await request(path,{method:'POST',body:a})).status,202);
  assert.equal(provider.results.length,1);
  assert.equal((await request(path,{method:'POST',body:answer(s,'other-id')})).status,409);
});

test('stale revision, extra fields and altered labels are refused before provider write',async t=>{
  const {start,request,provider}=await setup(t);const s=await start();const a=answer(s),path=`/v1/surfaces/${s.surface.surfaceID}/actions`;
  assert.equal((await request(path,{method:'POST',body:{...a,expectedRevision:0}})).status,409);
  assert.equal((await request(path,{method:'POST',body:{...a,values:{...a.values,label:'Invented'}}})).status,422);
  assert.equal((await request(path,{method:'POST',body:{...a,values:{...a.values,secret:'bad'}}})).status,422);
  assert.equal(provider.results.length,0);
});

test('form submission preserves numeric types and exact OpenDuet submitted wrapper',async t=>{
  const s=choice();s.nodes=[{id:'brief',kind:'askForm',title:'Details',fields:[
    {id:'team',label:'Team',type:'text',required:true},{id:'seats',label:'Seats',type:'number',required:true,min:1,max:10}]}];
  const {start,request,provider}=await setup(t,sourceProvider(s));const snap=await start();
  const a={id:'form-1',surfaceID:snap.surface.surfaceID,expectedRevision:1,nodeID:'brief',kind:'submitForm',values:{team:'Euphoria',seats:4}};
  assert.equal((await request(`/v1/surfaces/${snap.surface.surfaceID}/actions`,{method:'POST',body:a})).status,202);
  assert.deepEqual(provider.results[0].result.output,{status:'submitted',values:{team:'Euphoria',seats:4}});
});

test('approval decline with note does not execute a business effect',async t=>{
  const s=choice();s.nodes=[{id:'approval',kind:'askApproval',title:'Proceed?'}];
  const {start,request,provider}=await setup(t,sourceProvider(s));const snap=await start();
  assert.equal((await request(`/v1/surfaces/${snap.surface.surfaceID}/actions`,{method:'POST',body:{
    id:'decline-1',surfaceID:snap.surface.surfaceID,expectedRevision:1,nodeID:'approval',kind:'decide',values:{decision:'declined',note:'Review first'}}})).status,202);
  assert.deepEqual(provider.results[0].result.output,{decision:'declined',note:'Review first'});
});

test('uncertain provider result survives restart and is never replayed',async t=>{
  const p=sourceProvider();p.submitToolResult=async function(){this.results.push({});throw Error('private provider detail');};
  const {start,request,provider,reopen}=await setup(t,p);const s=await start();const a=answer(s),path=`/v1/surfaces/${s.surface.surfaceID}/actions`;
  const first=await request(path,{method:'POST',body:a});assert.equal(first.status,202);
  assert.equal(first.body.phase,'uncertain');assert.deepEqual(first.body.acknowledgedActionIDs,[]);
  await reopen();assert.equal((await request(path,{method:'POST',body:a})).body.phase,'uncertain');
  assert.equal(provider.results.length,1);
});

test('a new model call advances revision while acknowledgments remain recoverable',async t=>{
  const {start,request,provider}=await setup(t);const s=await start();
  await request(`/v1/surfaces/${s.surface.surfaceID}/actions`,{method:'POST',body:answer(s)});
  provider.current.required_actions=[{...provider.current.required_actions[0],call_id:'call_next',
    arguments:{...choice(),nodes:[{id:'confirm',kind:'askApproval',title:'Review complete?'}]}}];
  const next=(await request('/v1/sessions/sess_test')).body;
  assert.equal(next.surface.revision,2);assert.equal(next.surface.surfaceID,s.surface.surfaceID);
  assert.deepEqual(next.acknowledgedActionIDs,['answer-1']);assert.deepEqual(next.resolvedNodeIDs,[]);
});

test('provider with no pending call makes the previous decision inactive',async t=>{
  const {start,request,provider}=await setup(t);const s=await start();
  provider.current.required_actions=[];provider.current.status='idle';
  const refreshed=await request('/v1/sessions/sess_test');
  assert.equal(refreshed.body.phase,'idle');assert.deepEqual(refreshed.body.resolvedNodeIDs,['deploy']);
  assert.equal((await request(`/v1/surfaces/${s.surface.surfaceID}/actions`,{method:'POST',body:answer(s)})).status,409);
  assert.equal(provider.results.length,0);
});

test('cancel absent create atomically blocks late delivery without executing a new session',async t=>{
  const {request,provider}=await setup(t);
  assert.equal((await request('/v1/requests/not-delivered',{method:'DELETE'})).body.phase,'cancelled');
  assert.equal((await request('/v1/sessions',{method:'POST',body:{id:'not-delivered',message:'A late request'}})).status,409);
  assert.equal(provider.creates,0);
});

test('resolve unrecorded action tombstones its ID before allowing another decision',async t=>{
  const {start,request,provider}=await setup(t);const s=await start(),path=`/v1/surfaces/${s.surface.surfaceID}`;
  const resolved=await request(path+'/reconcile',{method:'POST',body:{pendingActionIDs:['unsent']}});
  assert.equal(resolved.status,200);assert.deepEqual(resolved.body.rejectedActionIDs,['unsent']);
  await request(path+'/actions',{method:'POST',body:answer(s,'unsent')});
  assert.equal(provider.results.length,0);
  assert.equal((await request(path+'/actions',{method:'POST',body:answer(s,'fresh')})).status,202);
  assert.equal(provider.results.length,1);
});
