import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentsClient} from '../agents-client.mjs';

function fixture(handler=async()=>Response.json({id:'auto_1'})){
 const sent=[];
 const client=new AgentsClient({apiKey:'fixture-only',fetchImpl:async(url,options)=>{
  const request={url:String(url),method:options.method,headers:options.headers,
   body:options.body?JSON.parse(options.body):undefined};
  sent.push(request);return handler(request);
 }});
 return{client,sent};
}
test('periodic schedules use managed automation API with bounded existing session',async()=>{
 const {client,sent}=fixture();
 const out=await client.createAutomation({name:'Morning briefing',sessionID:'sess_source',
  instructions:'Summarize current information',expression:'0 10 * * *',
  timezone:'Asia/Kolkata'},'native-auto-once');
 assert.equal(out.id,'auto_1');
 assert.equal(sent.length,1);
 assert.equal(sent[0].url,'https://api.openai.com/v1/agents/automations');
 assert.equal(sent[0].headers['Idempotency-Key'],'native-auto-once');
 assert.deepEqual(sent[0].body,{type:'periodic',name:'Morning briefing',
  expression:'0 10 * * *',timezone:'Asia/Kolkata',
  target:{type:'existing_session',session_id:'sess_source',
   instructions:'Summarize current information'}});
});
test('once schedules use future timestamp and no second scheduler',async()=>{
 const {client,sent}=fixture();
 const runAt=Math.floor(Date.now()/1000)+4000;
 await client.createAutomation({name:'Follow up',sessionID:'sess_1',instructions:'Ask for update',runAt},'auto-once');
 assert.equal(sent[0].body.type,'once');
 assert.equal(sent[0].body.run_at,runAt);
});
test('reject malformed, unbounded or minute-by-minute schedules before a provider request',async()=>{
 const {client,sent}=fixture();
 const base={name:'Briefing',sessionID:'sess_1',instructions:'Summarize'};
 for(const bad of [
  {...base,expression:'* * * * *',timezone:'UTC'},
  {...base,expression:'*/1 * * * *',timezone:'UTC'},
  {...base,expression:'0 10 * * *',timezone:'Not/A/TimeZone'},
  {...base,expression:'0 10 * * *',timezone:'UTC',runAt:Math.floor(Date.now()/1000)+3600},
  {...base,runAt:Math.floor(Date.now()/1000)-30},
  {...base,runAt:Math.floor(Date.now()/1000)+500*86400},
  {...base,expression:'0 10 * * *',timezone:'UTC',sessionID:'../other'},
 ])await assert.rejects(client.createAutomation(bad,'bounded-auto'));
 assert.equal(sent.length,0);
});
test('read invocation delivery independently from agent task result',async()=>{
 const {client,sent}=fixture(async({url})=>Response.json(url.endsWith('/invocations')?
  {data:[{id:'ainv_1',status:'completed',session_id:'sess_1'}]}:{id:'auto_1'}));
 const listing=await client.listAutomationInvocations('auto_1');
 assert.equal(listing.data[0].status,'completed');
 assert.equal(sent[0].method,'GET');
 assert.equal(sent[0].url,'https://api.openai.com/v1/agents/automations/auto_1/invocations?limit=50');
});
test('pause and resume preserve submission keys; remote outage never replays automatically',async()=>{
 const {client,sent}=fixture(async()=>Response.json({id:'auto_1'}));
 await client.pauseAutomation('auto_1','pause_once');
 await client.resumeAutomation('auto_1','resume_once');
 assert.equal(sent[0].headers['Idempotency-Key'],'pause_once');
 assert.equal(sent[1].headers['Idempotency-Key'],'resume_once');
 assert.equal(sent.length,2);
 const failing=fixture(async()=>{throw Error('socket vanished')});
 await assert.rejects(failing.client.pauseAutomation('auto_1','do_not_replay'),
  error=>error.outcomeUnknown===true);
 assert.equal(failing.sent.length,1);
});

test('list, get, edit, manual invoke and retrieve invocation use correct provider paths',async()=>{
 const {client,sent}=fixture(async request=>{
  if(request.url.includes('/invocations/ainv_7'))return Response.json({id:'ainv_7',session_id:'sess_1',status:'completed'});
  if(request.method==='GET'&&request.url.includes('?'))return Response.json({data:[]});
  return Response.json({id:'auto_1'});
 });
 await client.listAutomations({sessionID:'sess_1',limit:10});
 await client.retrieveAutomation('auto_1');
 await client.updateAutomation('auto_1',{expression:'0 8 * * MON-FRI',timezone:'Asia/Kolkata'},'edit-1');
 await client.invokeAutomation('auto_1','run-once');
 const invocation=await client.retrieveAutomationInvocation('auto_1','ainv_7');
 assert.equal(invocation.session_id,'sess_1');
 assert.equal(sent[0].url,'https://api.openai.com/v1/agents/automations?limit=10&session_id=sess_1');
 assert.equal(sent[1].url,'https://api.openai.com/v1/agents/automations/auto_1');
 assert.equal(sent[2].method,'POST');
 assert.equal(sent[2].body.expression,'0 8 * * MON-FRI');
 assert.equal(sent[3].url,'https://api.openai.com/v1/agents/automations/auto_1/invocations');
 assert.equal(sent[3].headers['Idempotency-Key'],'run-once');
});
test('reject unsafe target, weak cron, malformed updates and bad pagination before wire',async()=>{
 const {client,sent}=fixture();
 const source={name:'Bounded',instructions:'Summarize',sessionID:'sess_1',timezone:'UTC'};
 for(const expression of ['*/5 * * * *','0,10 * * * *','15-30 * * * *','0 * * * * *'])
  await assert.rejects(client.createAutomation({...source,expression},'reject'));
 await assert.rejects(client.createAutomation({...source,expression:'0 8 * * *',
  target:{type:'existing_session',session_id:'sess_2',instructions:'a',credentials:'secret'}},'reject'));
 await assert.rejects(client.updateAutomation('auto_1',{instructions:'update only'},'reject'));
 await assert.rejects(client.listAutomations({limit:999}));
 await assert.rejects(client.retrieveAutomationInvocation('auto_1','../evil'));
 assert.equal(sent.length,0);
});
test('new-session input is validated without accepting arbitrary agent tools',async()=>{
 const {client,sent}=fixture();
 await client.createAutomation({name:'Independent',runAt:Math.floor(Date.now()/1000)+3600,
   target:{type:'new_session',agent_id:'agent_1',input:[{role:'user',content:'Prepare brief'}]}},'new-session');
 assert.equal(sent[0].body.target.type,'new_session');
 await assert.rejects(client.createAutomation({name:'Bad',runAt:Math.floor(Date.now()/1000)+3600,
   target:{type:'new_session',agent_id:'agent_1',input:[{role:'system',content:'bypass'}]}},'bad-session'));
 assert.equal(sent.length,1);
});
test('unknown manual invocation outcome is not retried',async()=>{
 const {client,sent}=fixture(async()=>{throw Error('lost provider reply')});
 await assert.rejects(client.invokeAutomation('auto_1','manual-once'),e=>e.outcomeUnknown===true);
 assert.equal(sent.length,1);
});
