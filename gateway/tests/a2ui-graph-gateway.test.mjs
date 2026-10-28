import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGateway} from '../gateway.mjs';
const d=JSON.parse(readFileSync(new URL('./fixtures/a2ui-graph-trip-v09.json',import.meta.url)));
const packet=()=>({a2uiGraph:[{version:'v0.9',createSurface:{surfaceId:d.surfaceId,catalogId:d.catalogId}},{version:'v0.9',updateComponents:{surfaceId:d.surfaceId,components:d.components}},{version:'v0.9',updateDataModel:{surfaceId:d.surfaceId,path:'/',value:d.dataModel}}]});
async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'euphoria-graph-'));let server,origin;
 const p={writes:[],current:{id:'session',status:'in_progress',required_actions:[{type:'function_call',name:'euphoria_render_surface',turn_id:'turn',call_id:'call',arguments:packet()}]},async createSession(){return{id:'session'};},async retrieveSession(){return structuredClone(this.current);},async submitToolResult(id,result,key){this.writes.push({id,result,key});if(this.error)throw this.error;}};
 async function reopen(){if(server)await new Promise(r=>server.close(r));server=createGateway({provider:p,databasePath:join(dir,'db.sqlite'),model:'test',authenticate:async req=>req.headers.authorization==='Bearer alice'?'alice':req.headers.authorization==='Bearer bob'?'bob':null});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;}
 await reopen();t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 async function request(path,{method='GET',body,user='alice'}={}){const r=await fetch(origin+path,{method,headers:{authorization:'Bearer '+user,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
 await request('/v1/sessions',{method:'POST',body:{id:'create',message:'Plan a trip'}});return{p,request,reopen,databasePath:join(dir,'db.sqlite')};
}
const answer=s=>({id:'answer',surfaceID:s.surface.surfaceID,expectedRevision:s.surface.revision,nodeID:'composition',kind:'submitForm',values:{'$button':'submit','context:destination':'Kyoto','context:notify':true,'context:source':'native'}});
test('real gateway admits pending function graph, owns identity, authorizes exactly one event and restores receipt',async t=>{
 const {p,request,reopen}=await setup(t),s=(await request('/v1/sessions/session')).body;
 assert.equal(s.surface.nodes[0].kind,'sourceComposition');assert.equal(s.surface.nodes[0].composition.revision,1);
 const path=`/v1/surfaces/${s.surface.surfaceID}/actions`,a=answer(s);
 assert.equal((await request(path,{method:'POST',body:a,user:'bob'})).status,404);
 assert.equal((await request(path,{method:'POST',body:{...a,expectedRevision:0}})).status,409);
 assert.equal((await request(path,{method:'POST',body:{...a,kind:'displayed',values:{}}})).status,422);
 const r=await request(path,{method:'POST',body:a});assert.equal(r.status,202);assert.deepEqual(r.body.resolvedNodeIDs,['composition']);assert.equal(p.writes.length,1);
 const result=p.writes[0].result.output.userAction;assert.equal(result.name,'confirm_trip');assert.equal(result.surfaceId,'trip');assert.deepEqual(result.context,{destination:'Kyoto',notify:true,source:'native'});assert.ok(Number.isFinite(Date.parse(result.timestamp)));
 await reopen();await request(path,{method:'POST',body:a});assert.equal(p.writes.length,1);
 p.current.required_actions=[{...p.current.required_actions[0],call_id:'call2',arguments:{expectedRevision:1,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/trip/destination',value:'Kyoto'}}]}}];
 const next=await request('/v1/sessions/session');assert.equal(next.status,200);assert.equal(next.body.surface.revision,2);assert.equal(next.body.surface.nodes[0].composition.revision,2);assert.equal(next.body.surface.nodes[0].composition.dataModel.trip.destination,'Kyoto');assert.deepEqual(next.body.resolvedNodeIDs,[]);
 await request(path,{method:'POST',body:{...a,id:'stale'}});assert.equal(p.writes.length,1);
});
for(const mutation of ['gone','changed'])test(`pending ${mutation} call cannot authorize an old graph action`,async t=>{
 const {p,request}=await setup(t),s=(await request('/v1/sessions/session')).body;
 if(mutation==='gone')p.current.required_actions=[];else p.current.required_actions[0].arguments.a2uiGraph[2].updateDataModel.value.trip.notify=true;
 const r=await request(`/v1/surfaces/${s.surface.surfaceID}/actions`,{method:'POST',body:answer(s)});assert.equal(r.status,409);assert.equal(p.writes.length,0);
});
test('unknown submission survives restart without replay while definite no-send retains safe failure classification',async t=>{
 const {p,request,reopen}=await setup(t),s=(await request('/v1/sessions/session')).body,path=`/v1/surfaces/${s.surface.surfaceID}/actions`,a=answer(s);
 p.error=Error('private');let r=await request(path,{method:'POST',body:a});assert.equal(r.body.phase,'uncertain');await reopen();r=await request(path,{method:'POST',body:a});assert.equal(r.body.phase,'uncertain');assert.equal(p.writes.length,1);
});

test('provider JSON-string function arguments normalize as graphs without losing raw pending identity',async t=>{
 const {p,request}=await setup(t);p.current.required_actions[0].arguments=JSON.stringify(packet());
 const r=await request('/v1/sessions/session');assert.equal(r.status,200);assert.equal(r.body.surface.nodes[0].kind,'sourceComposition');
 assert.equal((await request(`/v1/surfaces/${r.body.surface.surfaceID}/actions`,{method:'POST',body:answer(r.body)})).status,202);assert.equal(p.writes.length,1);
});
for(const [kind,error] of [['not_sent',{outcomeUnknown:false,failureStage:'pending_lookup'}],['rejected',{outcomeUnknown:false,failureStage:'submission',status:400}],['uncertain',{outcomeUnknown:true,failureStage:'submission',status:503}]])test(`human graph ${kind} outcome is sanitized durable and never blindly replayed`,async t=>{
 const {p,request,reopen}=await setup(t),s=(await request('/v1/sessions/session')).body,path=`/v1/surfaces/${s.surface.surfaceID}/actions`,a=answer(s);p.error=Object.assign(Error('secret raw message'),error);
 let r=await request(path,{method:'POST',body:a});assert.equal(r.body.failure.kind,kind);assert.ok(!JSON.stringify(r.body).includes('secret'));await reopen();r=await request(path,{method:'POST',body:a});assert.equal(r.body.failure.kind,kind);assert.equal(p.writes.length,1);
});

test('decoded provider graph arguments are bounded before recursive fingerprinting',async t=>{
 const {p,request}=await setup(t);let deep={};let x=deep;for(let i=0;i<800;i++){x.child={};x=x.child;}p.current.required_actions[0].arguments=deep;
 let tailReads=0;Object.defineProperty(x,'tail',{enumerable:true,get(){tailReads++;return 'never read';}});p.retrieveSession=async()=>p.current;
 let refusals=0;p.rejectToolCall=async()=>{refusals++;};const r=await request('/v1/sessions/session');assert.equal(r.status,502);assert.equal(refusals,0);assert.equal(tailReads,0);assert.equal(p.writes.length,0);
});

test('owned HTTP graph loop uses the actual AgentsClient event serialization and verified 202 transport',async t=>{
 const {AgentsClient}=await import('../agents-client.mjs');const {p,request,reopen}=await setup(t);const posts=[];
 const client=new AgentsClient({apiKey:'offline-only',fetchImpl:async(url,options)=>{
  if(options.method==='GET')return Response.json(p.current);
  posts.push(JSON.parse(options.body));return new Response(null,{status:202});
 }});
 p.retrieveSession=client.retrieveSession.bind(client);p.submitToolResult=client.submitToolResult.bind(client);
 const r=await request('/v1/sessions/session');assert.equal(r.status,200);const s=r.body,path=`/v1/surfaces/${s.surface.surfaceID}/actions`;
 const sent=await request(path,{method:'POST',body:answer(s)});assert.equal(sent.status,202);assert.deepEqual(sent.body.acknowledgedActionIDs,['answer']);assert.equal(posts.length,1);
 const event=posts[0].events[0];assert.equal(event.type,'agent.session.input.tool_result');assert.equal(event.turn_id,'turn');assert.equal(event.call_id,'call');assert.equal(event.success,true);
 const output=JSON.parse(event.output);assert.deepEqual(output.userAction.context,{destination:'Kyoto',notify:true,source:'native'});
 await reopen();await request(path,{method:'POST',body:answer(s)});assert.equal(posts.length,1);
});

test('cancelled provider turn revokes graph response authority and stale partial operations cannot publish',async t=>{
 const {p,request,reopen}=await setup(t),s=(await request('/v1/sessions/session')).body;
 p.cancelTurn=async()=>{p.current.required_actions=[];p.current.status='idle';};
 assert.equal((await request('/v1/sessions/session/cancel',{method:'POST',body:{id:'cancel'}})).body.phase,'accepted');
 const path=`/v1/surfaces/${s.surface.surfaceID}/actions`;assert.equal((await request(path,{method:'POST',body:answer(s)})).status,409);assert.equal(p.writes.length,0);
 await reopen();p.current.required_actions=[{type:'function_call',name:'euphoria_render_surface',turn_id:'newturn',call_id:'newcall',arguments:{expectedRevision:0,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/trip/destination',value:'bad'}}]}}];
 assert.equal((await request('/v1/sessions/session')).status,409);const listed=await request('/v1/sessions');assert.equal(listed.body.sessions[0].surface.nodes[0].composition.dataModel.trip.destination,'Paris');assert.equal(listed.body.sessions[0].surface.revision,1);
});

test('graph result returns authoritative revision beside unchanged event and journals exact bytes before delivery',async t=>{
 const {DatabaseSync}=await import('node:sqlite');const {p,request,reopen,databasePath}=await setup(t);const s=(await request('/v1/sessions/session')).body;
 let stored;
 p.submitToolResult=async(id,result,key)=>{const db=new DatabaseSync(databasePath,{readOnly:true});stored=JSON.parse(db.prepare('SELECT result FROM actions WHERE session_id=? AND action_id=?').get('session','answer').result);db.close();p.writes.push({id,result,key});assert.deepEqual(stored,result.output);};
 const path=`/v1/surfaces/${s.surface.surfaceID}/actions`;const r=await request(path,{method:'POST',body:answer(s)});assert.equal(r.body.phase,'accepted');
 assert.deepEqual(stored.euphoria,{contractVersion:1,surfaceID:s.surface.surfaceID,revision:1,sourceSurfaceID:'trip'});
 assert.equal(stored.userAction.name,'confirm_trip');assert.ok(Number.isFinite(Date.parse(stored.userAction.timestamp)));
 await reopen();await request(path,{method:'POST',body:answer(s)});assert.equal(p.writes.length,1);
 p.current.required_actions=[{...p.current.required_actions[0],call_id:'partial',arguments:{expectedRevision:stored.euphoria.revision,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:stored.euphoria.sourceSurfaceID,path:'/trip/destination',value:'Kyoto'}}]}}];
 const next=await request('/v1/sessions/session');assert.equal(next.status,200);assert.equal(next.body.surface.revision,2);
});
test('unpublished stale graph call receives durable revision correction without human approval or graph replacement',async t=>{
 const {p,request,reopen}=await setup(t);const s=(await request('/v1/sessions/session')).body;const calls=[];p.rejectToolCall=async(...args)=>calls.push(args);
 p.current.required_actions=[{...p.current.required_actions[0],call_id:'stale',arguments:{expectedRevision:0,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/trip/destination',value:'Wrong'}}]}}];
 const r=await request('/v1/sessions/session');assert.equal(r.status,200);assert.equal(r.body.surface.revision,1);assert.equal(r.body.surface.nodes[0].composition.dataModel.trip.destination,'Paris');assert.equal(calls.length,1);assert.match(calls[0][1].error,/expectedRevision.*1/);assert.deepEqual(r.body.acknowledgedActionIDs,[]);
 await reopen();await request('/v1/sessions/session');assert.equal(calls.length,1);assert.equal(p.writes.length,0);
});

test('missing graph correction asks for creation and journals the exact refusal before sending',async t=>{
 const {DatabaseSync}=await import('node:sqlite');const {p,request,reopen,databasePath}=await setup(t);let record;
 p.current.required_actions[0].arguments={expectedRevision:0,a2uiGraph:[{version:'v0.9',updateDataModel:{surfaceId:'trip',path:'/trip/destination',value:'Kyoto'}}]};
 p.rejectToolCall=async(id,result)=>{const db=new DatabaseSync(databasePath,{readOnly:true});record=db.prepare("SELECT result FROM actions WHERE phase='refusing'").get();db.close();assert.deepEqual(JSON.parse(record.result),{success:false,error:result.error});assert.match(result.error,/createSurface/);assert.doesNotMatch(result.error,/with expectedRevision/);};
 const r=await request('/v1/sessions/session');assert.equal(r.status,200);assert.equal(r.body.phase,'in_progress');assert.ok(record.result);assert.deepEqual(r.body.acknowledgedActionIDs,[]);
 await reopen();const db=new DatabaseSync(databasePath,{readOnly:true});assert.deepEqual(db.prepare('SELECT result FROM actions').get(),record);db.close();
});
