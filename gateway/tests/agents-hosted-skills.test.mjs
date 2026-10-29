import {test} from "node:test";
import assert from "node:assert/strict";
import {AgentsClient} from "../agents-client.mjs";

test("pinned provider skill manifests, but no arbitrary zip/vault/unknown fields",async()=>{
 const called=[];
 const client=new AgentsClient({apiKey:"test",sessionSpendLimitCents:2,fetchImpl:async(url,init)=>{
  called.push({url,body:JSON.parse(init.body)});
  return new Response('data: {"type":"agent.session.created","event_id":"evt_s","session":{"id":"sess_s"}}\\n\\n',{
   headers:{"content-type":"text/event-stream"}
  });
 }});
 const base={model:"fixture",instructions:"Work",input:"Analyze",tools:[]};
 const approved={type:"openai_hosted",container_size:"small",
  network:{access:"disabled"},
  skills:[{type:"skill_reference",skill_id:"skill_ABCDEF0123",version:"3"}]};
 await assert.rejects(client.createSessionStream({...base,environment:approved},"approved_skill_1"), /capability directories/);
 assert.equal(called.length,0);
 let issued=called.length;
 for(const skills of [
  [{type:"skill_reference",skill_id:"skill_ABCDEF0123",version:"latest"}],
  [{type:"inline",name:"unapproved",source:{type:"base64",data:"abc"}}],
  [{type:"skill_reference",skill_id:"skill_ABCDEF0123",version:"3"},
   {type:"skill_reference",skill_id:"skill_ABCDEF0123",version:"4"}]
 ])await assert.rejects(client.createSessionStream({...base,
   environment:{...approved,skills}},"invalid_skill_1"));
 assert.equal(called.length,issued);
});
