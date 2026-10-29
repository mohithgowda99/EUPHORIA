import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentsClient} from '../agents-client.mjs';

const base={apiKey:'test-only',sessionSpendLimitCents:5};
test('managed sandbox is small, offline; bounded subagents are in original create manifest',async()=>{
 const sent=[];
 const client=new AgentsClient({...base,fetchImpl:async(url,init)=>{
  sent.push({url,init});return new Response('data: {"type":"agent.session.created","event_id":"evt_a","session":{"id":"sess_a"}}\n\n',{headers:{'content-type':'text/event-stream'}});
 }});
 const stream=await client.createSessionStream({
  model:'fixture',instructions:'Do the task',input:'Analyze this',
  tools:[],environment:{type:'openai_hosted',container_size:'small',network:{access:'disabled'}},
  multiAgent:{enabled:true,max_concurrent_subagents:2}
 },'source_create_1');
 stream.close();
 const body=JSON.parse(sent[0].init.body);
 assert.deepEqual(body.environment,{type:'openai_hosted',container_size:'small',network:{access:'disabled'}});
 assert.deepEqual(body.agent.multi_agent,{enabled:true,max_concurrent_subagents:2});
 assert.equal(sent.length,1);
});
test('dangerous sandbox and unbounded delegation rejected before a paid call',async()=>{
 let calls=0;
 const client=new AgentsClient({...base,fetchImpl:async()=>{calls++;return Response.json({id:'s'});}});
 const common={model:'fixture',instructions:'Work',input:'Analyze',tools:[]};
 for(const extra of [
  {environment:{type:'openai_hosted',network:{access:'enabled'}}},
  {environment:{type:'openai_hosted',container_size:'large',network:{access:'disabled'}}},
  {multiAgent:{enabled:true,max_concurrent_subagents:5}},
  {multiAgent:{enabled:true,max_concurrent_subagents:0}}
 ])await assert.rejects(client.createSession({...common,...extra},'test_1'));
 assert.equal(calls,0);
});
test('artifact download streams bounded bytes and never redirects credentials',async()=>{
 const requested=[];
 const client=new AgentsClient({...base,fetchImpl:async(url,init)=>{
  requested.push({url,init});
  return new Response('artifact bytes',{headers:{'content-type':'application/octet-stream','content-length':'14'}});
 }});
 const result=await client.retrieveArtifactContent('sess_1','art_1');
 assert.equal(result.bytes.toString(),'artifact bytes');
 assert.equal(requested[0].init.redirect,'error');
 assert.equal(requested[0].url,'https://api.openai.com/v1/agents/sessions/sess_1/artifacts/art_1/content');
});
test('artifact content enforces streaming size, not just Content-Length',async()=>{
 const client=new AgentsClient({...base,fetchImpl:async()=>new Response(new Uint8Array(24))});
 await assert.rejects(client.retrieveArtifactContent('sess_a','art_b',{maxBytes:8}),/unavailable/);
});
