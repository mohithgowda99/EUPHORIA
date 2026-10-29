import { test, expect } from "bun:test";
import { createDatabase } from "../src/db/client";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { and, eq } from "drizzle-orm";
import { workItems } from "../src/db/schema/work";
import {parseManagedQuestion, pendingManagedQuestion, parseManagedCorrelation} from "../src/agents/managed-person-questions";

test("question correlation rejects altered tools, arguments and malformed payloads",()=>{
 const scope={ownerUserId:"u",channelId:"c",agentId:"b",threadId:"t"};
 const call={type:"function_call",name:"euphoria_ask_person",turn_id:"turn_1",call_id:"call_1",arguments:{question:"Approve the plan?"}};
 const saved=parseManagedCorrelation({sessionID:"sess_1",call,scope});
 expect(parseManagedQuestion(call.arguments).question).toBe("Approve the plan?");
 expect(pendingManagedQuestion([call],saved)).toBe("pending");
 expect(pendingManagedQuestion([],saved)).toBe("closed");
 expect(pendingManagedQuestion([{...call,arguments:{question:"Different approval"}}],saved)).toBe("changed");
 expect(pendingManagedQuestion([{...call,name:"wrong"}],saved)).toBe("changed");
 expect(()=>parseManagedQuestion({question:"",extra:"yes"})).toThrow();
 expect(()=>parseManagedCorrelation({sessionID:"",call,scope})).toThrow();
});

const url=process.env.TEST_DATABASE_URL;
for(const expires of [false,true])test.skipIf(!url)(
 "original person.question is restorable and one answer "+(expires?"preserves expired provider state":"continues the exact call"),
 async()=>{
 const db=createDatabase(url!), actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
 const sess="sess_"+crypto.randomUUID().replaceAll("-","");
 const root="turn_"+crypto.randomUUID().replaceAll("-","");
 const callID="call_"+crypto.randomUUID().replaceAll("-","");
 const call={type:"function_call",name:"euphoria_ask_person",turn_id:root,
   call_id:callID,arguments:{question:"Which report should I draft?",why:"Need the owner's selection"}};
 let pending=true,posts=0;
 const provider={
  async createSessionStream(){return {close(){},events:(async function*(){
   yield{type:"agent.session.created",event_id:"evt_"+sess,session:{id:sess}};
   yield{type:"agent.session.turn.created",event_id:"evt_"+root,session_id:sess,turn_id:root,
     turn:{id:root,session_id:sess,subagent_id:null}};
  })()};},
  async retrieveSession(){return {id:sess,status:pending?"requires_action":"idle",
    required_actions:pending?[call]:[]};},
  async retrieveTurn(){return{id:root,session_id:sess,subagent_id:null,status:pending?"in_progress":"completed"};},
  async listTurnItems(){return {data:[],has_more:false};},
  async listItems(){return{data:[],has_more:false};},
  async submitToolResult(_session:string,result:{turnID:string;callID:string;output:unknown}){
   expect(_session).toBe(sess);
   expect(result.turnID).toBe(root);expect(result.callID).toBe(callID);
   expect(result.output).toEqual({answer:"A weekly report"});
   posts++;pending=false;
  }
 };
 const token="managed-question-fixture-test-token-12345678901234";
 try{
  const first=await createManagedDevelopment({database:db,provider:provider as unknown as Parameters<typeof createManagedDevelopment>[0]["provider"],token,model:"fixture"});
  const bot=await first.profiles.create(actor,{name:"Question Bot",title:"Assistant",
   roleDescription:"Ask before writing",systemPrompt:"Ask before writing",visibility:"private"});
  const channel=await first.channels.create(actor,[bot.id]);
  const headers={cookie:"euphoria-development="+token,"content-type":"application/json"};
  const target="/api/delivery/conversations/"+channel.id;
  expect((await first.app.request("/api/approvals")).status).toBe(401);
  const submitted=await first.app.request(target+"/messages",{method:"POST",headers,body:JSON.stringify({
   agentId:bot.id,text:"Ask for the report type",externalId:crypto.randomUUID()
  })});
  expect(submitted.status).toBe(202);
  await first.tick();
  const before=await first.app.request("/api/approvals",{headers});
  expect(before.status).toBe(200);
  const inbox=await before.json();
  expect(inbox.questions).toHaveLength(1);
  expect(inbox.questions[0].id).toBe(callID);
  expect(inbox.questions[0].question).toBe("Which report should I draft?");
  // Server restart and a second authenticated client, without a second provider submission.
  const second=await createManagedDevelopment({database:db,provider,token,model:"fixture"});
  const reopened=await second.app.request("/api/approvals",{headers});
  expect((await reopened.json()).questions[0].id).toBe(callID);
  if(expires)pending=false;
  const answer=()=>second.app.request("/api/approvals/questions/"+callID+"/respond",{
   method:"POST",headers,body:JSON.stringify({response:"A weekly report"})
  });
  const response=await answer();expect(response.status).toBe(202);
  expect((await answer()).status).toBe(409);
  await second.tick();await first.tick();
  expect(posts).toBe(expires?0:1);
  const [saved]=await db.select().from(workItems)
    .where(and(eq(workItems.kind,"person.response"),eq(workItems.key,callID))).limit(1);
  expect(saved).toBeDefined();
  if(expires){
   expect(saved?.finishedAt).toBeNull();
   expect(saved?.lastError).toContain("Provider question closed");
   const recovered=await second.app.request("/api/approvals",{headers});
   expect((await recovered.json()).recoveries[0].id).toBe(callID);
  } else expect(saved?.finishedAt).not.toBeNull();
 }finally{await db.$client.close();}
});
