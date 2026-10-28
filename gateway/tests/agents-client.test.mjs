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
    environment:{type:'none'},input:'Help me',stream:false,spend_control:{limit:50}});
});

test('managed spending limits are bounded before any API request', async () => {
  for (const invalid of [0, -1, NaN, 1.2, 501, Infinity, '100']) {
    assert.throws(() => new AgentsClient({apiKey:'test-only-key',sessionSpendLimitCents:invalid}));
  }
  let calls=0;
  const client=new AgentsClient({apiKey:'test-only-key',sessionSpendLimitCents:25,
    fetchImpl:async(url, options)=>{calls++;return Response.json({id:'sess_test'});}});
  await client.createSession({model:'test',instructions:'Do safe work',input:'Hello'},'stable-request');
  assert.equal(calls,1);
});

test('hosted compute is opt-in, small, with network access disabled', async t => {
  const {client, requests} = await provider(t, (_,res) => json(res,{id:'sess_hosted'}));
  const reply = await client.createSession({
    model:'test-model', instructions:'Produce offline results', input:'Create a local summary',
    environment:{type:'openai_hosted',container_size:'small',network:{access:'disabled'}},
  }, 'create-hosted-1');
  assert.equal(reply.id,'sess_hosted');
  assert.deepEqual(requests[0].body.environment,
    {type:'openai_hosted',container_size:'small',network:{access:'disabled'}});
  assert.deepEqual(requests[0].body.agent.tools, []);
});

test('managed subagent delegation is opt-in, capped, and not a second Bot registry', async t => {
  const {client,requests} = await provider(t, (_,res)=>json(res,{id:'sess_delegated'}));
  await client.createSession({model:'test-model',instructions:'Review independent sections',
    input:'Summarize documents',multiAgent:{enabled:true,max_concurrent_subagents:2}}, 'delegate-1');
  assert.deepEqual(requests[0].body.agent.multi_agent,{enabled:true,max_concurrent_subagents:2});
  assert.deepEqual(requests[0].body.environment,{type:'none'});
});

test('unsafe sandbox or delegation options fail closed without a provider request', async () => {
  let calls=0;
  const client=new AgentsClient({apiKey:'test-only-key',
    fetchImpl:async()=>{calls++;throw Error('unexpected provider call');}});
  const unsafe = [
    {environment:{type:'openai_hosted'}},
    {environment:{type:'openai_hosted',network:{access:'enabled'}}},
    {environment:{type:'openai_hosted',network:{access:'restricted',allowed_domains:['example.com']}}},
    {environment:{type:'openai_hosted',network:{access:'disabled'},container_size:'large'}},
    {environment:{type:'openai_hosted',network:{access:'disabled'},files:[]}},
    {environment:{type:'self_hosted',workspace_directory:'/workspace'}},
    {environment:{type:'none',tools:[]}},
    {multiAgent:{enabled:true,max_concurrent_subagents:12}},
    {multiAgent:{enabled:true}},
    {multiAgent:{enabled:false,max_concurrent_subagents:2}},
    {multiAgent:{enabled:true,max_concurrent_subagents:2,tools:['secret']}},
  ];
  for (const options of unsafe) {
    await assert.rejects(client.createSession({
      model:'test-model',instructions:'Follow product permissions',input:'Hello',...options,
    },'stable-1'));
  }
  assert.equal(calls,0,'Invalid options must never incur a model call or hosted environment charge');
});

test('hosted artifacts use provider-owned immutable metadata and bounded read routes',async t=>{
 const {client,requests}=await provider(t,(_,res)=>{
  json(res,requests.length===1?{data:[{id:'art_completed',turn_id:'turn_done',path:'/workspace/outputs/summary.json'}],has_more:false}:
   {id:'art_completed',turn_id:'turn_done',path:'/workspace/outputs/summary.json'});
 });
 const list=await client.listArtifacts('sess_hosted',{limit:5,order:'desc'});
 assert.equal(list.data[0].id,'art_completed');
 assert.equal(requests[0].method,'GET');
 assert.equal(requests[0].path,'/v1/agents/sessions/sess_hosted/artifacts?limit=5&order=desc');
 const artifact=await client.retrieveArtifact('sess_hosted','art_completed');
 assert.equal(artifact.turn_id,'turn_done');
 assert.equal(requests[1].path,'/v1/agents/sessions/sess_hosted/artifacts/art_completed');
});

test('artifact requests reject untrusted session, IDs and cursor before HTTP',async()=>{
 let calls=0;const client=new AgentsClient({apiKey:'test-only-key',
  fetchImpl:async()=>{calls++;throw Error('unexpected');}});
 await assert.rejects(client.listArtifacts('../other'));
 await assert.rejects(client.listArtifacts('sess_ok',{after:'../other'}));
 await assert.rejects(client.listArtifacts('sess_ok',{limit:101}));
 await assert.rejects(client.retrieveArtifact('sess_ok','../other'));
 assert.equal(calls,0);
});

test('single initial managed session stream carries real session-created then root-turn-created events',async t=>{
 const events=[
  {type:'agent.session.created',event_id:'evt_created',session:{id:'sess_new'}},
  {type:'agent.session.turn.created',event_id:'evt_turn',session_id:'sess_new',
   turn_id:'turn_root',turn:{id:'turn_root',session_id:'sess_new',subagent_id:null}},
 ];
 const {client,requests}=await provider(t,(_,res)=>{
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
 });
 const stream=await client.createSessionStream({model:'test-model',instructions:'Work',
  input:'Hello'},'stream_create_1');
 const seen=[];
 for await(const event of stream.events){
  seen.push(event);
  if(seen.length===2)break;
 }
 assert.deepEqual(seen,events);
 assert.equal(requests[0].headers['idempotency-key'],'stream_create_1');
 assert.equal(requests[0].body.stream,true);
 assert.equal(requests[0].body.spend_control.limit,50);
 assert.equal(requests[0].body.environment.type,'none');
});

test('initial stream transport outage is uncertain and must not authorize a second provider create',async()=>{
 let requests=0;
 const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>{
  requests++;throw Error('interrupted connection');
 }});
 await assert.rejects(client.createSessionStream({model:'test',instructions:'Work',
  input:'Hello'},'stream_create_1'),error=>error.outcomeUnknown===true&&error.failureStage==='submission');
 assert.equal(requests,1);
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

test('render rejection checks exact pending arguments and never sends errors to a mutated call',async()=>{
 let posts=0;const client=new AgentsClient({apiKey:'offline',fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return Response.json({id:'sess_test',required_actions:[pending]});}});
 await assert.rejects(client.rejectToolCall('sess_test',{turnID:'turn_test',callID:'call_test',name:'askChoice',error:'bad'},'reject-key',{expectedArguments:{different:true}}),e=>e.outcomeUnknown===false&&e.failureStage==='pending_lookup');assert.equal(posts,0);
});

test('turn history uses the official owned session endpoint and bounded descending pagination',async t=>{
 const {client,requests}=await provider(t,(_,res)=>json(res,{data:[],has_more:false}));await client.listTurns('sess_test',{limit:20,order:'desc',after:'turn_old'});assert.equal(requests[0].path,'/v1/agents/sessions/sess_test/turns?order=desc&limit=20&after=turn_old');await assert.rejects(client.listTurns('sess_test',{limit:101}));assert.equal(requests.length,1);
});


test('explicit reasoning and verbosity reach both session creation paths; cache fields stay provider-owned', async () => {
 const bodies=[];
 const client=new AgentsClient({apiKey:'test-only',fetchImpl:async(url,options)=>{
  bodies.push(JSON.parse(options.body));
  if(bodies.at(-1).stream)return new Response('data: '+JSON.stringify({type:'agent.session.created',event_id:'evt_1',session:{id:'sess_1'}})+'\n\n',{headers:{'content-type':'text/event-stream'}});
  return Response.json({id:'sess_1'});
 }});
 const config={model:'gpt-6-luna',instructions:'Stable instructions',input:'Hello',reasoningEffort:'low',verbosity:'low'};
 await client.createSession(config,'create_settings');
 const stream=await client.createSessionStream(config,'stream_settings');stream.close();
 for(const body of bodies){
  assert.deepEqual(body.agent.reasoning,{effort:'low'});
  assert.deepEqual(body.agent.text,{verbosity:'low'});
  assert.equal('prompt_cache_options' in body,false);
  assert.equal('prompt_cache_retention' in body,false);
 }
 let calls=0;
 const invalid=new AgentsClient({apiKey:'test-only',fetchImpl:async()=>{calls++;}});
 await assert.rejects(invalid.createSession({...config,reasoningEffort:'minimal'},'invalid_settings'));
 await assert.rejects(invalid.createSession({...config,verbosity:'unlimited'},'invalid_verbosity'));
 assert.equal(calls,0);
});


test('serialized continuation observes a new root and rejects an unresolved previous root before spending',async()=>{
 let writes=0,opened=0,bound;
 const client=new AgentsClient({apiKey:'test-only',fetchImpl:async(url,options)=>{
  if(url.includes('/turns?'))return Response.json({data:[{id:'old',subagent_id:null,status:'completed'}],has_more:false});
  if(options.method==='GET'){opened++;return new Response(new ReadableStream({start(c){setTimeout(()=>c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'agent.session.turn.created',event_id:'evt_new',session_id:'sess_test',turn_id:'new',turn:{id:'new',session_id:'sess_test',subagent_id:null}})+'\n\n')),5);}}),{headers:{'content-type':'text/event-stream'}});}
  writes++;return new Response(null,{status:202});
 }});
 await client.sendMessageAndObserve('sess_test','Follow up','stable_follow',async event=>{bound=event.turn_id;});
 assert.equal(bound,'new');assert.equal(writes,1);assert.equal(opened,1);
 const blocked=new AgentsClient({apiKey:'test-only',fetchImpl:async()=>Response.json({data:[{id:'old',status:'in_progress',subagent_id:null}],has_more:false})});
 await assert.rejects(blocked.sendMessageAndObserve('sess_test','Follow up','stable_block',async()=>{}),/unresolved/);
});

test('a definite session HTTP rejection preserves its status and never claims execution may have succeeded',async()=>{
 const client=new AgentsClient({apiKey:'test-only',fetchImpl:async()=>Response.json({error:{message:'private provider body'}},{status:400})});
 await assert.rejects(client.createSessionStream({model:'test',instructions:'Work',input:'Hello'},'rejected_1'),e=>e.status===400&&e.outcomeUnknown===false&&!e.message.includes('private'));
});


test('uncapped sessions require explicit opt-in and omit unsupported budget fields only then',async()=>{
 assert.throws(()=>new AgentsClient({apiKey:'test',sessionSpendLimitCents:null}));
 let body;
 const client=new AgentsClient({apiKey:'test',sessionSpendLimitCents:null,allowUncappedSession:true,fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return Response.json({id:'sess_test'});}});
 await client.createSession({model:'test',instructions:'Work',input:'One test'},'explicit_test');
 assert.equal(Object.hasOwn(body,'spend_control'),false);
});
