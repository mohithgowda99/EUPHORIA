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
 assert.equal(sent[0].url,'https://api.openai.com/v1/agents/automations/auto_1/invocations');
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
