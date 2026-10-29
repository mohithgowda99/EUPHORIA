import {createHash} from "node:crypto";

/** Bot-authored schedules are NON-AUTHORITATIVE PROPOSALS, not writes.
 * An exact, source-root correlated original person.question is required.
 * A person may authorize creating the schedule ONCE (recurrence is explicit).
 */
export const MANAGED_PROPOSE_SCHEDULE_TOOL={
 type:"function" as const,
 name:"euphoria_propose_schedule",
 description:"Propose a one-time or recurring Bot schedule for a person's explicit approval. This NEVER activates a schedule or grants spending permission.",
 parameters:{
  type:"object",
  properties:{
   instruction:{type:"string",minLength:1,maxLength:2000},
   schedule_type:{type:"string",enum:["once","recurring"]},
   run_at:{type:"integer",description:"Future Unix seconds for a one-time run, at least 15 minutes away."},
   cron:{type:"string",description:"Five-field cron for recurring schedules."},
   timezone:{type:"string",description:"IANA time zone for recurring schedules."}
  },
  required:["instruction","schedule_type"],
  additionalProperties:false
 }
};
export type ManagedScheduleProposal={
 instruction:string; schedule_type:"once"|"recurring";run_at?:number;cron?:string;timezone?:string
};
export type ManagedScheduleCall={
 type:"function_call";name:"euphoria_propose_schedule";call_id:string;turn_id:string;
 arguments:ManagedScheduleProposal;
};
const id=(s:unknown):s is string=>typeof s==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s);
const obj=(o:unknown):o is Record<string,unknown>=>!!o&&typeof o==="object"&&!Array.isArray(o);
export function parseManagedScheduleProposal(raw:unknown,now=Math.floor(Date.now()/1000)):ManagedScheduleProposal{
 const data=typeof raw==="string"?JSON.parse(raw):raw;
 if(!obj(data)||Object.keys(data).some(k=>!["instruction","schedule_type","run_at","cron","timezone"].includes(k))||
   typeof data.instruction!=="string"||!data.instruction.trim()||data.instruction.length>2000)
  throw Error("Invalid Bot schedule proposal");
 if(data.schedule_type==="once"){
  if(!Number.isSafeInteger(data.run_at)||Number(data.run_at)<now+900||
    Number(data.run_at)>now+366*86400||data.cron!==undefined||data.timezone!==undefined)
   throw Error("One-time proposal requires a bounded future Unix timestamp only");
  return {instruction:data.instruction.trim(),schedule_type:"once",run_at:Number(data.run_at)};
 }
 if(data.schedule_type==="recurring"){
  if(typeof data.cron!=="string"||data.cron.length>80||!data.cron.trim()||
   typeof data.timezone!=="string"||data.timezone.length>64||!data.timezone||
   data.run_at!==undefined)
   throw Error("Recurring proposal requires cron and IANA zone only");
  return {instruction:data.instruction.trim(),schedule_type:"recurring",cron:data.cron,timezone:data.timezone};
 }
 throw Error("Unknown schedule type");
}
export function parseManagedScheduleCall(raw:unknown):ManagedScheduleCall{
 if(!obj(raw)||raw.type!=="function_call"||raw.name!==MANAGED_PROPOSE_SCHEDULE_TOOL.name||
  !id(raw.call_id)||!id(raw.turn_id))throw Error("Uncorrelated Bot schedule proposal");
 return {type:"function_call",name:"euphoria_propose_schedule",
  call_id:raw.call_id,turn_id:raw.turn_id,
  arguments:parseManagedScheduleProposal(raw.arguments)};
}
export function scheduleProposalPreview(p:ManagedScheduleProposal){
 return p.schedule_type==="once"
 ?`One-time: ${new Date(p.run_at!*1000).toISOString()}\nInstruction: ${p.instruction}`
 :`Recurring: ${p.cron} (${p.timezone})\nInstruction: ${p.instruction}`;
}
export function scheduleProposalNonce(callID:string){
 if(!id(callID))throw Error("Unverified provider call");
 return createHash("sha256").update("schedule-proposal:"+callID).digest("hex").slice(0,32);
}
