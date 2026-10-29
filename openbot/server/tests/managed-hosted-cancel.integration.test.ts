import {test,expect} from "bun:test";
import {createDatabase} from "../src/db/client";
import {createManagedDevelopment} from "../src/agents/managed-development";
import {DEV_ACTOR} from "../src/auth/dev-actor";

const dbUrl=process.env.TEST_DATABASE_URL;
/** Original source owner, Inbox and provider root; no paid provider call. */
test.skipIf(!dbUrl)("hosted cancellation binds exactly one source root and never replays",async()=>{
 const database=createDatabase(dbUrl!);
 const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
 const sessionID="sess_"+crypto.randomUUID().replaceAll("-","");
 const rootID="turn_"+crypto.randomUUID().replaceAll("-","");
 let cancelCalls=0;
 let state="in_progress";
 const mock={
  async createSessionStream(){return{close(){},events:(async function*(){
   yield{type:"agent.session.created",event_id:"evtsess_"+rootID,
    session:{id:sessionID}};
   yield{type:"agent.session.turn.created",event_id:"evtturn_"+rootID,
    session_id:sessionID,turn_id:rootID,
    turn:{id:rootID,session_id:sessionID,subagent_id:null}};
  })()};},
  async retrieveSession(){return{id:sessionID,status:"idle",required_actions:[]};},
  async retrieveTurn(){return{id:rootID,session_id:sessionID,
   subagent_id:null,status:state};},
  async listTurns(){return{data:[{id:rootID,session_id:sessionID,
   subagent_id:null,status:state}],has_more:false};},
  async listTurnItems(){return{data:[],has_more:false};},
  async listArtifacts(){return{data:[],has_more:false};},
  async cancelTurn(id:string,key:string){
   expect(id).toBe(sessionID);
   expect(key).toStartWith("source_cancel_");
   cancelCalls++;return null; // 202 accepted, no completed-root claim
  }
 };
 const token="euphoria-hosted-cancel-test-only-abcdef123456";
 try{
  const service=await createManagedDevelopment({database,model:"fixture",token,
   provider:mock as unknown as Parameters<typeof createManagedDevelopment>[0]["provider"]});
  const bot=await service.profiles.create(actor,{
   name:"Cancelable Bot",title:"Test",roleDescription:"A valid Bot",
   systemPrompt:"Handle work",visibility:"private"
  });
  const channel=await service.channels.create(actor,[bot.id]);
  const headers={cookie:"euphoria-development="+token,"content-type":"application/json"};
  const route="/api/delivery/conversations/"+channel.id;
  const query="?agentId="+bot.id;
  const opened=await service.app.request(route+"/messages",{
   method:"POST",headers,body:JSON.stringify({
    agentId:bot.id,text:"Do work",externalId:crypto.randomUUID()})
  });
  expect(opened.status).toBe(202);
  await service.tick();
  const activity=await service.app.request(route+"/hosted-activity"+query,{headers});
  expect(activity.status).toBe(200);
  const current=await activity.json();
  expect(current.rootTurnId).toBe(rootID);
  expect(current.canCancel).toBe(true);
  const invalid=await service.app.request(route+"/hosted-cancel"+query,{
   method:"POST",headers,body:JSON.stringify({rootTurnId:"turn_wrong"})});
  expect(invalid.status).toBe(409);
  expect(cancelCalls).toBe(0);
  const success=await service.app.request(route+"/hosted-cancel"+query,{
   method:"POST",headers,body:JSON.stringify({rootTurnId:rootID})});
  expect(success.status).toBe(202);
  expect((await success.json()).phase).toBe("requested");
  const duplicate=await service.app.request(route+"/hosted-cancel"+query,{
   method:"POST",headers,body:JSON.stringify({rootTurnId:rootID})});
  expect(duplicate.status).toBe(409);
  expect(cancelCalls).toBe(1);
  const observed=await service.app.request(route+"/hosted-activity"+query,{headers});
  expect((await observed.json()).cancelRequested).toBe(true);
  // A new handler over the same original DB sees the single immutable receipt.
  const restarted=await createManagedDevelopment({database,model:"fixture",token,
   provider:mock as unknown as Parameters<typeof createManagedDevelopment>[0]["provider"]});
  const again=await restarted.app.request(route+"/hosted-cancel"+query,{
   method:"POST",headers,body:JSON.stringify({rootTurnId:rootID})});
  expect(again.status).toBe(409);
  expect(cancelCalls).toBe(1);
  state="cancelled";
 }finally{await database.$client.close();}
});
