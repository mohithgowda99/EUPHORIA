import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AgentsClient } from '../agents-client.mjs';

// A local provider stub exercises real HTTP; it is not evidence of OpenAI execution.
async function provider(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = { method: req.method, path: req.url, headers: req.headers,
      body: raw ? JSON.parse(raw) : undefined };
    requests.push(request);
    await handler(request, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = new AgentsClient({apiKey: 'test-only-key', fetchImpl: (url, options) => {
    const path = new URL(url).pathname + new URL(url).search;
    return fetch(origin + path, options);
  }});
  return {client, requests};
}
function json(res, value, status = 200) {
  res.writeHead(status, {'content-type': 'application/json'});
  res.end(JSON.stringify(value));
}
const pending = {type:'function_call',turn_id:'turn_test',call_id:'call_test',
  name:'askChoice',arguments:{title:'Deploy?'}};

test('create uses Agents API with explicit model, no environment, and stable submission key', async t => {
  const {client,requests} = await provider(t, (_,res)=>json(res,{id:'sess_test'}));
  assert.deepEqual(await client.createSession({model:'test-model',instructions:'Be useful',
    input:'Help me',tools:[]},'create-1'), {id:'sess_test'});
  assert.equal(requests[0].path,'/v1/agents/sessions');
  assert.equal(requests[0].method,'POST');
  assert.equal(requests[0].headers.authorization,'Bearer test-only-key');
  assert.equal(requests[0].headers['openai-beta'],'agents=v1');
  assert.equal(requests[0].headers['idempotency-key'],'create-1');
  assert.deepEqual(requests[0].body, {agent:{model:'test-model',instructions:'Be useful',tools:[]},
    environment:{type:'none'},input:'Help me',stream:false});
});

test('user messages retain exact content and caller submission key', async t => {
  const {client,requests} = await provider(t, (_,res)=>{res.writeHead(202);res.end();});
  await client.sendMessage('sess_test','Keep my text exactly.','message-1');
  assert.equal(requests[0].path,'/v1/agents/sessions/sess_test/events');
  assert.equal(requests[0].headers['idempotency-key'],'message-1');
  assert.deepEqual(requests[0].body,{events:[{type:'agent.session.input.message',input:[{
    role:'user',content:[{type:'input_text',text:'Keep my text exactly.'}]}]}]});
});

test('tool result copies current required action identity and serializes typed output', async t => {
  const {client,requests} = await provider(t,(req,res)=>{if(req.method==='GET')json(res,{id:'sess_test',required_actions:[pending]});else {res.writeHead(202);res.end();}});
  await client.submitToolResult('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',
    output:{choice:'staging',label:'Staging'}},'action-1');
  assert.equal(requests[0].method,'GET');
  assert.equal(requests[0].path,'/v1/agents/sessions/sess_test');
  assert.equal(requests[1].headers['idempotency-key'],'action-1');
  assert.deepEqual(requests[1].body,{events:[{type:'agent.session.input.tool_result',
    turn_id:'turn_test',call_id:'call_test',success:true,
    output:'{"choice":"staging","label":"Staging"}'}]});
});

for (const [label,session] of [
  ['history alone',{id:'sess_test',items:[pending],required_actions:[]}],
  ['other turn',{id:'sess_test',required_actions:[{...pending,turn_id:'turn_other'}]}],
  ['other tool',{id:'sess_test',required_actions:[{...pending,name:'askApproval'}]}],
  ['other session',{id:'sess_other',required_actions:[pending]}],
]) test(`refuses result from ${label} without POST`, async t => {
  const {client,requests} = await provider(t,(_,res)=>json(res,session));
  await assert.rejects(client.submitToolResult('sess_test',{turnID:'turn_test',callID:'call_test',
    name:'askChoice',output:{}},'action-1'));
  assert.equal(requests.length,1);
});

test('malformed identifiers and missing keys never make network requests', async () => {
  assert.throws(()=>new AgentsClient({apiKey:''}));
  let calls=0;
  const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  for(const id of ['','..','../other','sess/x','sess?x','https://evil.test'])
    await assert.rejects(client.retrieveSession(id));
  await assert.rejects(client.sendMessage('sess_test','hi',''));
  assert.equal(calls,0);
});

test('HTTP error exposes status but no provider body or secret', async t => {
  const {client,requests}=await provider(t,(_,res)=>json(res,{error:'test-only-key private prompt'},401));
  await assert.rejects(client.retrieveSession('sess_test'),error=>
    error.message==='Agents API request failed (401)' && error.status===401);
  assert.equal(requests.length,1);
});

test('lost write response is uncertain and never automatically retried', async () => {
  let calls=0;
  const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>{calls++;throw Error('secret-url');}});
  await assert.rejects(client.sendMessage('sess_test','hi','message-1'),error=>
    error.message==='Agents API request outcome unknown; reconcile before retrying' && error.outcomeUnknown===true);
  assert.equal(calls,1);
});

test('empty HTTP 202 event responses mean acceptance, never completion', async t => {
  const {client,requests}=await provider(t,(req,res)=> {
    if(req.method==='GET') json(res,{id:'sess_test',required_actions:[pending]});
    else {res.writeHead(202);res.end();}
  });
  assert.equal(await client.sendMessage('sess_test','hi','message-202'),null);
  assert.equal(await client.submitToolResult('sess_test',{turnID:'turn_test',callID:'call_test',
    name:'askChoice',output:{choice:'staging',label:'Staging'}},'action-202'),null);
  assert.equal(requests.length,3);
});

test('error-body cleanup cannot leak a provider exception or lose write uncertainty', async () => {
  const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>({
    ok:false,status:503,body:{cancel:async()=>{throw Error('test-only-key private prompt');}}
  })});
  await assert.rejects(client.sendMessage('sess_test','hi','message-503'),error=>
    error.message==='Agents API request failed (503)' && error.status===503 && error.outcomeUnknown===true);
});

test('saved items retain pagination and cancellation uses the documented event',async t=>{
  const {client,requests}=await provider(t,(req,res)=>{if(req.method==='POST'){res.writeHead(202);res.end();}else json(res,{data:[],has_more:false,last_id:null});});
  await client.listItems('sess_test',{after:'item_before',limit:10});
  assert.equal(requests[0].path,'/v1/agents/sessions/sess_test/items?order=asc&limit=10&after=item_before');
  await client.cancelTurn('sess_test','cancel-1');
  assert.deepEqual(requests[1].body,{events:[{type:'agent.session.input.cancel'}]});
  assert.equal(requests[1].headers['idempotency-key'],'cancel-1');
});

test('event transport opens authenticated SSE before consuming and preserves session boundaries',async t=>{
  const {client,requests}=await provider(t,(_,res)=>{
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.end('data: '+JSON.stringify({type:'agent.session.idle',event_id:'e1',session_id:'sess_test'})+'\n\n');
  });
  const stream=await client.openEventStream('sess_test');const events=[];for await(const event of stream.events)events.push(event);
  assert.equal(requests[0].path,'/v1/agents/sessions/sess_test/events?stream=true');
  assert.equal(requests[0].headers.accept,'text/event-stream');assert.equal(requests[0].headers.authorization,'Bearer test-only-key');
  assert.equal(events[0].type,'agent.session.idle');assert.equal(requests.length,1);
});
test('event transport rejects foreign events and never leaks provider errors',async t=>{
  const {client}=await provider(t,(_,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: {"type":"agent.session.idle","session_id":"sess_other","secret":"private"}\n\n');});
  const stream=await client.openEventStream('sess_test');
  await assert.rejects(async()=>{for await(const event of stream.events)void event;},e=>!e.message.includes('private')&&!e.message.includes('sess_other'));
});

test('event transport cancellation stops an active provider connection without replay',async t=>{
  const {client,requests}=await provider(t,(_,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': connected\n\n');});
  const controller=new AbortController();const stream=await client.openEventStream('sess_test',{signal:controller.signal});
  const consumption=(async()=>{for await(const event of stream.events)void event;})();controller.abort();
  await assert.rejects(consumption,/interrupted/);assert.equal(requests.length,1);
});
test('event transport refuses non-SSE responses and malformed payloads',async t=>{
  const a=await provider(t,(_,res)=>json(res,{secret:'private'}));
  await assert.rejects(a.client.openEventStream('sess_test'),/unavailable/);
  const b=await provider(t,(_,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: private-invalid-json\n\n');});
  const stream=await b.client.openEventStream('sess_test');
  await assert.rejects(async()=>{for await(const event of stream.events)void event;},/interrupted/);
});

test('rejected UI calls return a provider error with exact pending identity and no success output',async t=>{
  const {client,requests}=await provider(t,(req,res)=>{if(req.method==='GET')json(res,{id:'sess_test',required_actions:[pending]});else{res.writeHead(202);res.end();}});
  await client.rejectToolCall('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',error:'Unsupported UI contract'},'refuse-1');
  assert.deepEqual(requests[1].body,{events:[{type:'agent.session.input.tool_result',turn_id:'turn_test',call_id:'call_test',success:false,error:'Unsupported UI contract'}]});
});

test('render refusal pending lookup failure proves no write was attempted',async()=>{
  let calls=0;const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>{calls++;throw Error('private transport text');}});
  await assert.rejects(client.rejectToolCall('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',error:'Unsupported'},'refuse-1'),e=>e.outcomeUnknown===false&&e.failureStage==='pending_lookup'&&!e.message.includes('private'));
  assert.equal(calls,1);
});
test('render refusal distinguishes rejected HTTP from uncertain submission and response decoding',async t=>{
  for(const status of [400,401,403,422,408,500,503]){
    const {client}=await provider(t,(req,res)=>json(res,req.method==='GET'?{id:'sess_test',required_actions:[pending]}:{private:'never expose'},req.method==='GET'?200:status));
    await assert.rejects(client.rejectToolCall('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',error:'Unsupported'},'refuse-1'),e=>e.failureStage==='submission'&&e.status===status&&e.outcomeUnknown===(status>=500||status===408));
  }
  const {client}=await provider(t,(req,res)=>{if(req.method==='GET')json(res,{id:'sess_test',required_actions:[pending]});else{res.writeHead(200);res.end('invalid');}});
  await assert.rejects(client.rejectToolCall('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',error:'Unsupported'},'refuse-1'),e=>e.failureStage==='response'&&e.outcomeUnknown===true);
});

test('human result refuses mutated pending arguments before any POST',async()=>{
 let writes=0;const client=new AgentsClient({apiKey:'secret',fetchImpl:async(url,options)=>{if(options.method==='POST')writes++;return Response.json({id:'sess_test',required_actions:[{type:'function_call',turn_id:'turn_test',call_id:'call_test',name:'render',arguments:{changed:true}}]});}});
 await assert.rejects(client.submitToolResult('sess_test',{turnID:'turn_test',callID:'call_test',name:'render',output:{ok:true}},'human-key',{expectedArguments:{changed:false}}),e=>e.outcomeUnknown===false&&e.failureStage==='pending_lookup');assert.equal(writes,0);
});

for(const [status,value] of [[200,{}],[200,null],[200,{session_id:'foreign',call_id:'foreign'}],[204,null]])test(`event status ${status} with ${JSON.stringify(value)} cannot fabricate acceptance`,async()=>{
 const client=new AgentsClient({apiKey:'secret',fetchImpl:async(url,options)=>options.method==='GET'?Response.json({id:'sess_test',required_actions:[pending]}):status===204?new Response(null,{status}):Response.json(value,{status})});
 await assert.rejects(client.submitToolResult('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',output:{choice:'stage'}},'event-key'),e=>e.outcomeUnknown===true&&e.failureStage==='response');
});
