import {Hono, type MiddlewareHandler} from "hono";
import {z} from "zod";
import {and,eq,desc,sql} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import type {Database} from "../db/client";
import type {AgentActor} from "../agents/profile-types";
import type {ChannelStore} from "../channels/routes";
import type {DeliveryStore} from "../delivery/store";
import type {DeliveryScope} from "../delivery/types";
import type {AppVariables} from "../auth/guards";
import {deliveryInbox,managedAgentInboxTurns,proactiveSuggestions} from "../db/schema";
import {createTaskStore,createTaskRoutes} from "../openduet/task-store";
import {createTaskThreads} from "../openduet/task-threads";
import {createTaskIntake} from "../openduet/wiring";
import {createProactiveStore} from "../proactive/store";

/**
 * Managed execution adapter for ORIGINAL OpenDuet Tasks. TaskStore owns task
 * records/status; ChannelStore owns the task's channel; DeliveryStore owns
 * managed turn idempotency. No second task runner, state table or scheduler.
 *
 * All actions are server-side, owner-checked, and a provider-accepted Inbox
 * receipt is not treated as completed agent work.
 */
export function createManagedTaskAdapter(deps:{
 database:Database;
 actorFor(owner:string):Promise<AgentActor>;
 channels:ChannelStore;
 delivery:Pick<DeliveryStore,"offerInbox">;
 scopeFor(owner:string,channelID:string,botID:string):Promise<DeliveryScope|null>;
 authorizeBot(owner:string,botID:string):Promise<void>;
 requireUser:MiddlewareHandler<{Variables:AppVariables}>;
}) {
 const {database,channels,requireUser}=deps;
 const tasks=createTaskStore(database);
 const proactive=createProactiveStore(database);
 const threads=createTaskThreads({
  database,store:tasks,channels,actorFor:deps.actorFor,
  scopeFor:deps.scopeFor,
 });
 async function enqueue(owner:string,channelID:string,botID:string,text:string,externalID:string) {
  const scope=await deps.scopeFor(owner,channelID,botID);
  if(!scope||scope.ownerUserId!==owner||scope.agentId!==botID)
    throw Error("Managed task channel or Bot access revoked");
  const result=await deps.delivery.offerInbox({
   ...scope,bindingId:null,source:"native",realm:"managed-task",externalId:externalID,text,
  });
  if(!result.queued){
   // The original dedupe receipt may exist. Do not manufacture a second turn.
   const [receipt]=await database.select().from(deliveryInbox).where(and(
    eq(deliveryInbox.source,"native"),eq(deliveryInbox.realm,"managed-task"),
    eq(deliveryInbox.externalId,externalID))).limit(1);
   if(!receipt||receipt.ownerUserId!==owner||receipt.channelId!==channelID||
     receipt.agentId!==botID||receipt.text!==text)
    throw Error("Task input idempotency collision");
  }
 }
 async function start(input:{
  ownerUserId:string;agentId:string;
  task:{title:string;instruction:string;why?:string;source?:string;link?:string;fromChannelId?:string|null};
 }) {
  await deps.authorizeBot(input.ownerUserId,input.agentId);
  const opened=await threads.open({
   ownerUserId:input.ownerUserId,agentId:input.agentId,title:input.task.title,
   why:input.task.why??null,origin:"asked",suggestionId:null,
   sourceApp:input.task.source??null,sourceLink:input.task.link??null,
   fromChannelId:input.task.fromChannelId??null,
  });
  await enqueue(input.ownerUserId,opened.channelId,input.agentId,
   input.task.instruction,"task:"+opened.id);
  return opened;
 }
 const intake=createTaskIntake({
  database,
  directChannel:async(owner,bot)=>{
   await deps.authorizeBot(owner,bot);
   const channel=await channels.direct(await deps.actorFor(owner),bot);
   const scope=await deps.scopeFor(owner,channel.id,bot);
   if(!scope)throw Error("Cannot use Bot's direct channel");
   return {id:channel.id,threadId:scope.threadId};
  },
  startTask:start,
 });
 const report=async(owner:string,task:Awaited<ReturnType<typeof tasks.get>>)=>{
  const rows=await database.select({
   id:deliveryInbox.id,createdAt:deliveryInbox.createdAt,
   text:deliveryInbox.text,state:deliveryInbox.state,
   completed:managedAgentInboxTurns.completedOutput,
  }).from(deliveryInbox)
   .leftJoin(managedAgentInboxTurns,eq(managedAgentInboxTurns.inboxId,deliveryInbox.id))
   .where(and(eq(deliveryInbox.ownerUserId,owner),eq(deliveryInbox.channelId,task.channelId),
     eq(deliveryInbox.realm,"managed-task")))
   .orderBy(deliveryInbox.createdAt).limit(200);
  const entries:({kind:"reply"|"update";id:string;text:string;at:string})[]=[];
  for(const row of rows){
   entries.push({kind:"reply",id:row.id+":input",text:row.text,at:row.createdAt.toISOString()});
   if(row.state==="sent"&&row.completed&&typeof row.completed==="object"&&
      "replyText" in row.completed&&typeof row.completed.replyText==="string")
    entries.push({kind:"update",id:row.id+":output",
      text:row.completed.replyText,at:row.createdAt.toISOString()});
  }
  return {taskId:task.id,entries,resources:[]};
 };
 const routes=createTaskRoutes(tasks,requireUser,undefined,intake,report);
 const extras=new Hono<{Variables:AppVariables}>();
 extras.use("*",requireUser);
 const replySchema=z.strictObject({
  reply:z.string().trim().min(1).max(4000),
  messageId:z.string().uuid(),
 });
 extras.post("/:id/reply",async c=>{
  const body=replySchema.safeParse(await c.req.json().catch(()=>null));
  if(!body.success)return c.json({error:"Invalid task reply or immutable message identity"},400);
  const task=await tasks.get(c.var.actor.id,c.req.param("id")).catch(()=>null);
  if(!task)return c.json({error:"Task not found"},404);
  if(task.status==="resolved")return c.json({error:"Reopen this task before replying"},409);
  await deps.authorizeBot(c.var.actor.id,task.botId);
  try{
   await enqueue(c.var.actor.id,task.channelId,task.botId,body.data.reply,
    "task-reply:"+task.id+":"+body.data.messageId);
  }catch{return c.json({error:"Task reply could not be verified; check the saved Inbox before retry"},503);}
  return c.json({task:await tasks.get(c.var.actor.id,task.id)},202);
 });
 const suggestions=new Hono<{Variables:AppVariables}>();
 suggestions.use("*",requireUser);
 suggestions.get("/",async c=>c.json({suggestions:await proactive.suggestions(c.var.actor.id)}));
 suggestions.post("/:id/dismiss",async c=>{
  try{return c.json({suggestion:await proactive.resolveSuggestion(c.var.actor.id,c.req.param("id"),"dismissed")});}
  catch{return c.json({error:"Suggestion already handled or unavailable"},409);}
 });
 suggestions.post("/:id/start",async c=>{
  const owner=c.var.actor.id,id=c.req.param("id");
  const row=await proactive.suggestion(owner,id).catch(()=>null);
  if(!row||row.status!=="open")return c.json({error:"Suggestion already handled or unavailable"},409);
  await deps.authorizeBot(owner,row.agentId);
  // Source suggestion decision and task/channel creation commit atomically,
  // including across simultaneous devices. No duplicate Task or bot effect.
  const created=await database.transaction(async tx=>{
   const [winner]=await tx.update(proactiveSuggestions)
    .set({status:"started",resolvedAt:sql`now()`})
    .where(and(eq(proactiveSuggestions.ownerUserId,owner),
       eq(proactiveSuggestions.id,id),eq(proactiveSuggestions.status,"open")))
    .returning();
   if(!winner)return null;
   const channel=await channels.create(await deps.actorFor(owner),[winner.agentId],tx);
   const task=await tasks.create({
    ownerUserId:owner,botId:winner.agentId,channelId:channel.id,
    title:winner.title,why:winner.detail??null,origin:"suggestion",suggestionId:id,
    sourceApp:winner.sourceApp??null,sourceLink:winner.sourceLink??null,
    fromChannelId:winner.fromChannelId??null,
   },tx);
   return{task,channelID:channel.id,winner};
  });
  if(!created)return c.json({error:"Suggestion already started elsewhere"},409);
  try{await enqueue(owner,created.channelID,created.winner.agentId,
    created.winner.detail||created.winner.title,"task:"+created.task.id);}
  catch{return c.json({error:"Task saved but execution receipt unconfirmed. Inspect Tasks before retry"},503);}
  return c.json({suggestion:created.winner,task:{id:created.task.id}},202);
 });
 return {routes,extras,suggestions,tasks};
}
