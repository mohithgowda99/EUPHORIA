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

test('hosted environment file upload uses verified session/environment target, bounded base64 and stable idempotency key',async()=>{
 const sent=[];
 const bytes=Buffer.from('hello input');
 const client=new AgentsClient({...base,fetchImpl:async(url,init)=>{
  sent.push({url,init});
  return Response.json({object:'agent.environment.file',environment_id:'env_1',
   path:'/workspace/upload_test.txt',size_bytes:bytes.length},{status:201});
 }});
 const result=await client.createEnvironmentFile('env_1',{
  path:'/workspace/upload_test.txt',data:bytes.toString('base64')
 },'hosted_file_uuid_1');
 assert.equal(result.size_bytes,bytes.length);
 assert.equal(sent[0].url,'https://api.openai.com/v1/agents/environments/env_1/files');
 assert.equal(sent[0].init.headers['Idempotency-Key'],'hosted_file_uuid_1');
 assert.deepEqual(JSON.parse(sent[0].init.body),{
  type:'inline',path:'/workspace/upload_test.txt',data:bytes.toString('base64')
 });
});
test('sandbox inputs reject path traversal, noncanonical bytes and oversized input without provider call',async()=>{
 let calls=0;
 const client=new AgentsClient({...base,fetchImpl:async()=>{calls++;return Response.json({});}});
 for(const [path,data] of [
  ['/workspace/../../.ssh/key','dGVzdA=='],['/workspace/hi','dGVzdA==='],
  ['/workspace/name.txt',''],['/tmp/file','dGVzdA=='],
  ['/workspace/file',Buffer.alloc(1024*1024+1).toString('base64')]
 ])await assert.rejects(client.createEnvironmentFile('env_1',{path,data},'key_1'));
 assert.equal(calls,0);
});
test('subagent roster is read from original managed session, never invented from progress text',async()=>{
 const called=[];
 const client=new AgentsClient({...base,fetchImpl:async(url,init)=>{
  called.push({url,init});
  return Response.json({data:[{id:'sub_1',session_id:'sess_1',status:'active'}],
   has_more:false});
 }});
 const page=await client.listSubagents('sess_1',{limit:50});
 assert.equal(page.data[0].id,'sub_1');
 assert.equal(called[0].url,'https://api.openai.com/v1/agents/sessions/sess_1/subagents?order=desc&limit=50');
 assert.equal(called[0].init.method,'GET');
});
