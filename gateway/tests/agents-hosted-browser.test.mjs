import {test} from "node:test";
import assert from "node:assert/strict";
import {AgentsClient} from "../agents-client.mjs";
test("OpenAI hosted read-only browser restricts network and opts into native tool",async()=>{
 const requests=[];
 const client=new AgentsClient({apiKey:"fixture",sessionSpendLimitCents:2,fetchImpl:async(url,options)=>{
  requests.push({url,options});
  return new Response('data: {"type":"agent.session.created","event_id":"evt_a","session":{"id":"sess_a"}}\n\n',{headers:{"content-type":"text/event-stream"}});
 }});
 const environment={type:"openai_hosted",container_size:"small",desktop:{enabled:true},
  network:{access:"restricted",allowed_domains:["developers.openai.com"]}};
 const result=await client.createSessionStream({
  model:"fixture",instructions:"Read public pages only",input:"Visit docs",
  tools:[{type:"computer_use",include_screenshots:true}],environment
 },"browser_1");
 result.close();
 assert.deepEqual(JSON.parse(requests[0].options.body).environment,environment);
 const before=requests.length;
 for(const forbidden of [
  {...environment,network:{access:"enabled"}},
  {...environment,network:{access:"restricted",allowed_domains:["private.example.com"]}},
  {...environment,skills:[{type:"skill_reference",skill_id:"skill_ABCDEF0123",version:"1"}]},
  {...environment,desktop:{enabled:false}}
 ])await assert.rejects(client.createSessionStream({
   model:"fixture",instructions:"Read",input:"Visit",tools:[],environment:forbidden
 },"browser_bad"));
 assert.equal(requests.length,before);
});
test("only a pending provider origin may be approved; login can only be cancelled",async()=>{
 const requests=[];
 const client=new AgentsClient({apiKey:"fixture",sessionSpendLimitCents:2,fetchImpl:async(url,options)=>{
  requests.push({url,options});
  if(options.method==="GET")return Response.json({id:"sess_1",required_actions:[
   {type:"computer_use_approval_request",request_id:"req_1",request:{type:"browser_origin_access",origin:"https://developers.openai.com"}},
   {type:"computer_use_approval_request",request_id:"auth_1",request:{type:"browser_authentication"}}
  ]});
  return new Response(null,{status:202});
 }});
 await client.respondBrowserApproval("sess_1","req_1","approve","source_browser_req_1");
 await client.cancelBrowserAuthentication("sess_1","auth_1","source_browser_auth_1");
 assert.equal(requests.filter(x=>x.options.method==="POST").length,2);
 assert.deepEqual(JSON.parse(requests[1].options.body).events[0].response,
  {type:"browser_origin_access",decision:"approve"});
 assert.deepEqual(JSON.parse(requests[3].options.body).events[0].response,
  {type:"browser_authentication",action:"cancel"});
 await assert.rejects(client.respondBrowserApproval("sess_1","auth_1","approve","bad"));
});
