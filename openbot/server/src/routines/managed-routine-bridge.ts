import {and,eq,isNull,sql} from "drizzle-orm";
import type {Database} from "../db/client";
import {managedAgentSessionLinks,managedRoutineInvocations,routineRuns,routines} from "../db/schema";
import {nextOccurrence} from "./schedule";
import {RoutineNotFoundError,RoutineRefusedError} from "./store";

/** Explicit bridge, not a new scheduler. Existing source RoutineStore and
 * routine_runs remain authoritative. The cloud creates invocations. */
export type ManagedAutomationProvider={
  createAutomation(input:{name:string;sessionID:string;instructions:string;expression:string;timezone:string},
    key:string):Promise<{id?:string}>;
  retrieveAutomation(id:string):Promise<{id?:string;status?:string;target?:{session_id?:string}}>;
  retrieveAutomationInvocation(automationID:string,invocationID:string):Promise<unknown>;
  listAutomations(options?:{sessionID?:string;after?:string;limit?:number}):Promise<{data:unknown[];has_more?:boolean;last_id?:string}>;
  updateAutomation(id:string,patch:Record<string,unknown>,key:string):Promise<unknown>;
  pauseAutomation(id:string,key:string):Promise<unknown>;
  resumeAutomation(id:string,key:string):Promise<unknown>;
  deleteAutomation(id:string):Promise<unknown>;
  invokeAutomation(id:string,key:string):Promise<{id?:string;session_id?:string;status?:string}>;
  listAutomationInvocations(id:string,options?:{after?:string;limit?:number}):Promise<{data:unknown[];has_more?:boolean;last_id?:string}>;
  retrieveSession(id:string):Promise<{id?:string;status?:unknown;required_actions?:unknown[]}>;
  retrieveTurn(id:string,turnID:string):Promise<{id?:string;session_id?:string;status?:string;subagent_id?:string|null}>;
  listTurnItems(id:string,turnID:string,options:{order:"asc";limit:100;after?:string}):
    Promise<{data?:{type?:string;role?:string;status?:string;turn_id?:string;content?:unknown}[];has_more?:boolean;last_id?:string|null}>;
};
const validID=(value:string)=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const bounded=(value:string,n:number)=>typeof value==="string"&&value.trim().length>0&&value.length<=n;

/** A source routine can become provider-owned only with a saved exact Bot
 * session, current channel permission and a separately VERIFIED hard budget.
 * The latter is deliberately an injected DENY gate by default. */
export function createManagedRoutineBridge(input:{
  database:Database;provider:ManagedAutomationProvider;
  authorise(scope:{ownerUserId:string;channelId:string;agentId:string;threadId:string}):Promise<boolean>;
  assertSpendingBoundary():Promise<void>;
  publishResult?(scope:{ownerUserId:string;channelId:string;agentId:string;threadId:string},
    text:string,receiptId:string):Promise<void>;
}) {
 const {database:db,provider}=input;
 async function owned(owner:string,id:string) {
  if(!validID(id)||!owner)throw new RoutineNotFoundError();
  const [row]=await db.select().from(routines)
    .where(and(eq(routines.id,id),eq(routines.ownerUserId,owner))).limit(1);
  if(!row)throw new RoutineNotFoundError();
  const [link]=await db.select().from(managedAgentSessionLinks).where(and(
    eq(managedAgentSessionLinks.ownerUserId,owner),
    eq(managedAgentSessionLinks.channelId,row.channelId),
    eq(managedAgentSessionLinks.botId,row.agentId))).limit(1);
  const scope={ownerUserId:owner,channelId:row.channelId,agentId:row.agentId,
    threadId:link?.sourceThreadId??""};
  if(!link?.providerSessionId||!await input.authorise(scope))
    throw new RoutineRefusedError("Start an authorized managed Bot conversation before migrating this routine.");
  if(row.providerSessionId&&row.providerSessionId!==link.providerSessionId)
    throw new RoutineRefusedError("The original Bot session changed; managed schedule is frozen.");
  return {row,scope,sessionID:link.providerSessionId};
 }
 async function claim(owner:string,id:string,backend:"source"|"managed",
    operation:string,key:string) {
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"routine-run-"+id}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"managed-routine:"+id},0))`);
    const [row]=await tx.select().from(routines)
      .where(and(eq(routines.id,id),eq(routines.ownerUserId,owner))).limit(1);
    if(!row)throw new RoutineNotFoundError();
    if(row.executionBackend!==backend)
      throw new RoutineRefusedError("Routine is already moving between execution backends. Reconcile it first.");
    if(backend==="source"){
      const [active]=await tx.select({id:routineRuns.id}).from(routineRuns).where(and(
        eq(routineRuns.routineId,id),isNull(routineRuns.status),
        sql`${routineRuns.startedAt} > now() - interval '10 minutes'`)).limit(1);
      if(active)throw new RoutineRefusedError("Wait for the original source run to finish before migrating.");
    }
    const [changed]=await tx.update(routines).set({
      executionBackend:backend==="source"?"provisioning":"sync_unknown",
      providerSyncOperation:operation,providerSyncKey:key,providerSyncAt:new Date()
    }).where(and(eq(routines.id,id),eq(routines.ownerUserId,owner),
      eq(routines.executionBackend,backend))).returning({id:routines.id});
    if(!changed)throw new RoutineRefusedError("Concurrent schedule transition; reconcile first.");
    return row;
  });
 }
 function keyFor(id:string,operation:string,nonce:string) {
  if(!validID(nonce))throw new RoutineRefusedError("Invalid request idempotency key");
  return "source_"+operation+"_"+id+"_"+nonce;
 }
 async function settle(owner:string,id:string,key:string,patch:Record<string,unknown>) {
  const [changed]=await db.update(routines).set({
    ...patch,executionBackend:"managed",providerSyncKey:null,
    providerSyncOperation:null,providerSyncAt:null,updatedAt:new Date()
  }).where(and(eq(routines.ownerUserId,owner),eq(routines.id,id),
    eq(routines.providerSyncKey,key))).returning({id:routines.id});
  if(!changed)throw new Error("Provider accepted request but source mapping is uncertain; reconcile, never retry");
 }
 async function migrate(owner:string,id:string,nonce:string) {
  const {row,sessionID}=await owned(owner,id);
  if(row.executionBackend!=="source")throw new RoutineRefusedError("This routine has already been migrated or reserved.");
  if(!row.enabled)throw new RoutineRefusedError("Enable the original routine before migrating, or leave it paused.");
  await input.assertSpendingBoundary();
  const key=keyFor(id,"create",nonce);
  await claim(owner,id,"source","create",key); // Disable source sweep before provider create.
  // Stable provider name supports recovery if its POST response disappears.
  const response=await provider.createAutomation({name:"EUPHORIA:"+id,sessionID,
    instructions:row.instruction,expression:row.cron,timezone:row.timezone},key);
  if(!response?.id||!validID(response.id))
    throw new Error("Automation creation outcome unverified; source scheduler remains stopped");
  await settle(owner,id,key,{providerAutomationId:response.id,providerSessionId:sessionID});
  return {automationId:response.id,state:"managed"};
 }
 async function change(owner:string,id:string,operation:"pause"|"resume"|"delete",
    nonce:string) {
  const {row}=await owned(owner,id);
  if(row.executionBackend!=="managed"||!row.providerAutomationId)
    throw new RoutineRefusedError("Provider mapping is not ready; reconcile before modifying.");
  if(operation==="resume")await input.assertSpendingBoundary();
  const key=keyFor(id,operation,nonce);
  await claim(owner,id,"managed",operation,key);
  if(operation==="pause")await provider.pauseAutomation(row.providerAutomationId,key);
  if(operation==="resume")await provider.resumeAutomation(row.providerAutomationId,key);
  if(operation==="delete"){
    await provider.deleteAutomation(row.providerAutomationId);
    // Original deletion semantics cascade original run history. Do not
    // delete until provider confirms future invocations are stopped.
    const deleted=await db.delete(routines).where(and(eq(routines.id,id),
      eq(routines.ownerUserId,owner),eq(routines.providerSyncKey,key))).returning({id:routines.id});
    if(!deleted.length)throw new Error("Provider deleted, original schedule deletion requires reconciliation");
    return {deleted:true};
  }
  await settle(owner,id,key,{enabled:operation==="resume"});
  return {enabled:operation==="resume"};
 }
 async function edit(owner:string,id:string,patch:{
   instruction?:string;cron?:string;timezone?:string},nonce:string) {
  const {row,sessionID}=await owned(owner,id);
  if(row.executionBackend!=="managed"||!row.providerAutomationId)
    throw new RoutineRefusedError("Managed mapping is not ready; reconcile before editing.");
  if(!patch||Object.keys(patch).some(k=>!["instruction","cron","timezone"].includes(k)))
    throw new RoutineRefusedError("Unsupported routine edit");
  const instruction=patch.instruction??row.instruction;
  const cron=patch.cron??row.cron,timezone=patch.timezone??row.timezone;
  if(!bounded(instruction,2000)||!bounded(cron,80)||!bounded(timezone,64))
    throw new RoutineRefusedError("Invalid routine edit");
  // Reuse original five-field cron and 15-minute cadence validation.
  const next=nextOccurrence(cron,timezone,new Date());
  await input.assertSpendingBoundary(); // A changed schedule can incur future charges.
  const key=keyFor(id,"edit",nonce);
  await claim(owner,id,"managed","edit",key);
  await provider.updateAutomation(row.providerAutomationId,{
    expression:cron,timezone,
    target:{type:"existing_session",session_id:sessionID,instructions:instruction}
  },key);
  await settle(owner,id,key,{instruction,cron,timezone,nextRunAt:next});
  return {updated:true};
 }
 async function manual(owner:string,id:string,nonce:string) {
  const {row}=await owned(owner,id);
  if(row.executionBackend!=="managed"||!row.providerAutomationId||!row.enabled)
    throw new RoutineRefusedError("Manual run requires an enabled, reconciled managed routine.");
  await input.assertSpendingBoundary();
  const key=keyFor(id,"manual",nonce);
  const runID="routine_run_"+crypto.randomUUID();
  const reserved=await db.transaction(async tx=>{
    const [fresh]=await tx.select({executionBackend:routines.executionBackend,
      enabled:routines.enabled}).from(routines).where(and(eq(routines.id,id),
      eq(routines.ownerUserId,owner))).limit(1);
    if(fresh?.executionBackend!=="managed"||!fresh.enabled)
      throw new RoutineRefusedError("Schedule changed; refresh before running.");
    // Serialize the original source run with its provider receipt so the FK
    // exists before insertion and duplicate requests cannot create extra runs.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const [previous]=await tx.select({key:managedRoutineInvocations.receiptKey})
      .from(managedRoutineInvocations).where(eq(managedRoutineInvocations.receiptKey,key)).limit(1);
    if(previous)return false;
    await tx.insert(routineRuns).values({id:runID,routineId:id,source:"run_now"});
    await tx.insert(managedRoutineInvocations).values({
      receiptKey:key,routineId:id,source:"run_now",originalRunId:runID,
      deliveryStatus:"unknown",executionStatus:"unverified"
    });
    return true;
  });
  if(!reserved)return {accepted:false,receiptKey:key,uncertain:true}; // never replay.
  const response=await provider.invokeAutomation(row.providerAutomationId,key);
  if(!response.id||!validID(response.id))throw new Error("Manual invocation outcome unknown; inspect provider");
  await db.update(managedRoutineInvocations).set({providerInvocationId:response.id,
    providerSessionId:response.session_id??null,deliveryStatus:response.status??"unknown",
    updatedAt:new Date()}).where(eq(managedRoutineInvocations.receiptKey,key));
  return {accepted:true,receiptKey:key,invocationId:response.id};
 }
 /** Provider invocations report DELIVERY only. The published API has no
  * invocation-to-root-turn key, and session turns can be unrelated to a
  * schedule. This ledger MUST NOT infer execution success or output.
  * Recover every page using a durable cursor and reread pending receipts. */
 async function sync(owner:string,id:string) {
  const {row,sessionID}=await owned(owner,id);
  if(!row.providerAutomationId||row.executionBackend!=="managed")
   return {inspected:0,unverified:0,reason:"No active managed provider mapping"};
  const automationID=row.providerAutomationId;
  const cursor=row.providerInvocationCursor??undefined;
  const page=await provider.listAutomationInvocations(automationID,{
   limit:30,...(cursor?{after:cursor}:{})
  });
  if(!page||!Array.isArray(page.data)||page.data.length>30)
   throw new Error("Invalid provider invocation page");
  let inspected=0,unverified=0;
  async function observe(raw:unknown) {
   if(!raw||typeof raw!=="object")throw new Error("Invalid provider invocation");
   const item=raw as {id?:string;automation_id?:string;session_id?:string|null;
    status?:string;source?:{type?:string};skip_reason?:string|null;turn_id?:string};
   if(!item.id||!validID(item.id)||item.automation_id!==automationID)
    throw new Error("Provider automation/invocation identity mismatch");
   if(!["queued","completed","failed","skipped"].includes(item.status??""))
    throw new Error("Unknown provider invocation delivery state");
   if(item.session_id && item.session_id!==sessionID)
    throw new Error("Automation delivered into an unapproved source session");
   const manual=item.source?.type==="manual";
   if(!manual && item.source?.type!=="automation")
    throw new Error("Unknown provider invocation source");
   const [existing]=await db.select().from(managedRoutineInvocations).where(
    eq(managedRoutineInvocations.providerInvocationId,item.id)).limit(1);
   if(existing && existing.routineId!==id)
    throw new Error("Invocation receipt belongs to another source routine");
   if(manual&&!existing){
    // No API field binds an ambiguous manual POST to its source reservation.
    // It is unsafe to invent another run or guess which reservation owns it.
    unverified++;return;
   }
   const receiptKey=existing?.receiptKey??"provider_"+item.id;
   const runID=existing?.originalRunId??"routine_run_"+item.id;
   if(!existing){
    await db.transaction(async tx=>{
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"provider-invocation:"+item.id},0))`);
     const [previous]=await tx.select({id:managedRoutineInvocations.receiptKey})
      .from(managedRoutineInvocations)
      .where(eq(managedRoutineInvocations.providerInvocationId,item.id)).limit(1);
     if(previous)return;
     await tx.insert(routineRuns).values({id:runID,routineId:id,source:"schedule"});
     await tx.insert(managedRoutineInvocations).values({
      receiptKey,routineId:id,providerInvocationId:item.id,
      providerSessionId:item.session_id??null,source:"schedule",
      originalRunId:runID,deliveryStatus:item.status!,
      executionStatus:"unverified"
     });
    });
   }
   // Only the original provider delivery result can close a failed or
   // skipped invocation. A completed delivery NEVER closes an execution run.
   const terminal=item.status==="failed"||item.status==="skipped";
   await db.transaction(async tx=>{
    if(terminal)await tx.update(routineRuns).set({
     status:item.status==="failed"?"failed":"skipped",
     error:item.status==="failed"?"Provider delivery failed":"Provider skipped delivery",
     finishedAt:new Date()
    }).where(and(eq(routineRuns.id,runID),isNull(routineRuns.status)));
    await tx.update(managedRoutineInvocations).set({
     deliveryStatus:item.status!,
     providerSessionId:item.session_id??null,
     executionStatus:terminal?(item.status==="failed"?"delivery_failed":"delivery_skipped"):"unverified",
     updatedAt:new Date()
    }).where(eq(managedRoutineInvocations.receiptKey,receiptKey));
   });
   inspected++;
   if(!terminal)unverified++;
  }
  for(const invocation of page.data)await observe(invocation);
  // Inspect older unresolved receipts independently of the discovery cursor,
  // so queued->delivered and provider failures are recovered after restarts.
  const pending=await db.select().from(managedRoutineInvocations).where(and(
   eq(managedRoutineInvocations.routineId,id),
   eq(managedRoutineInvocations.executionStatus,"unverified"),
   sql`${managedRoutineInvocations.providerInvocationId} IS NOT NULL`
  )).orderBy(managedRoutineInvocations.updatedAt).limit(10);
  for(const receipt of pending) {
   if(!receipt.providerInvocationId)continue;
   const found=await provider.retrieveAutomationInvocation(automationID,receipt.providerInvocationId);
   await observe(found);
  }
  if(page.has_more&&(!page.last_id||!validID(page.last_id)||page.last_id===cursor))
   throw new Error("Provider pagination did not advance; retaining cursor");
  // Advance only after the complete page was durably projected. A racing
  // worker can repeat this page harmlessly; it must not roll the cursor back.
  await db.update(routines).set({
   providerInvocationCursor:page.has_more?page.last_id??null:null,
   providerLastScannedAt:new Date()
  }).where(and(eq(routines.id,id),eq(routines.ownerUserId,owner),
   eq(routines.executionBackend,"managed"),
   ...(cursor?[eq(routines.providerInvocationCursor,cursor)]:[isNull(routines.providerInvocationCursor)])
  ));
  return {inspected,unverified,more:Boolean(page.has_more),
   identity:"unverified",reason:"OpenAI AutomationInvocation contains no root turn identity"};
 }
 async function repair(owner:string,id:string) {
  const {row,sessionID}=await owned(owner,id);
  if(!["provisioning","sync_unknown"].includes(row.executionBackend))
    return {reconciled:false,reason:"No uncertain provider mutation"};
  const op=row.providerSyncOperation,key=row.providerSyncKey;
  if(!op||!key)throw new RoutineRefusedError("Source has no recorded provider mutation to reconcile.");
  if(op==="create") {
    let after:string|undefined;
    const matches:{id:string}[]=[];
    let exhausted=false;
    for(let i=0;i<5;i++){
      const page=await provider.listAutomations({sessionID,limit:100,...(after?{after}:{})});
      for(const value of page.data){
        if(!value||typeof value!=="object")continue;
        const candidate=value as {id?:string;name?:string;target?:{session_id?:string}};
        if(candidate.name==="EUPHORIA:"+id&&candidate.target?.session_id===sessionID&&
           candidate.id&&validID(candidate.id))
          matches.push({id:candidate.id});
      }
      if(!page.has_more){exhausted=true;break;}
      if(!page.last_id||!validID(page.last_id)||page.last_id===after)break;
      after=page.last_id;
    }
    if(!exhausted||matches.length!==1)
      return {reconciled:false,reason:"Provider creation remains ambiguous; source scheduling stays frozen"};
    await settle(owner,id,key,{providerAutomationId:matches[0].id,providerSessionId:sessionID});
    return {reconciled:true,operation:op};
  }
  if(!row.providerAutomationId)
    return {reconciled:false,reason:"Provider automation ID missing"};
  if(op==="delete"){
    try{
      await provider.retrieveAutomation(row.providerAutomationId);
      return {reconciled:false,reason:"Provider still holds schedule; don't replay delete"};
    }catch(error){
      if(!(error instanceof Error)||!("status" in error)||error.status!==404)
        return {reconciled:false,reason:"Provider deletion cannot be verified"};
    }
    const deleted=await db.delete(routines).where(and(eq(routines.id,id),
      eq(routines.ownerUserId,owner),eq(routines.providerSyncKey,key)))
      .returning({id:routines.id});
    return {reconciled:deleted.length===1,operation:op};
  }
  const providerRow=await provider.retrieveAutomation(row.providerAutomationId);
  if(providerRow.id!==row.providerAutomationId||
     providerRow.target?.session_id!==sessionID)
    throw new RoutineRefusedError("Remote automation is no longer correlated with original Bot");
  if(op==="pause"&&providerRow.status==="paused"){
    await settle(owner,id,key,{enabled:false});
    return {reconciled:true,operation:op};
  }
  if(op==="resume"&&providerRow.status==="active"){
    await settle(owner,id,key,{enabled:true});
    return {reconciled:true,operation:op};
  }
  // Editing intent is NOT stored in a second config journal; a remote update
  // must be reviewed explicitly if it had an unknown acknowledgement.
  return {reconciled:false,reason:"Provider change remains uncertain; do not re-enable source"};
 }
 async function state(owner:string,id:string) {
  const {row}=await owned(owner,id);
  const invocations=await db.select().from(managedRoutineInvocations)
    .where(eq(managedRoutineInvocations.routineId,id))
    .orderBy(sql`${managedRoutineInvocations.createdAt} desc`).limit(50);
  return {backend:row.executionBackend,automationId:row.providerAutomationId,
    syncOperation:row.providerSyncOperation,
    invocations:invocations.map(x=>({
      id:x.receiptKey,invocationId:x.providerInvocationId,
      sessionId:x.providerSessionId,rootTurnId:x.rootTurnId,
      deliveryStatus:x.deliveryStatus,executionStatus:x.executionStatus,
      originalRunId:x.originalRunId,source:x.source,createdAt:x.createdAt.toISOString()
    }))};
 }
 return {migrate,change,edit,manual,sync,owned,state,repair};
}

export type ManagedRoutineBridge=ReturnType<typeof createManagedRoutineBridge>;
