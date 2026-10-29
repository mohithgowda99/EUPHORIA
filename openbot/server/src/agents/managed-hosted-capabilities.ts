import {and,eq} from "drizzle-orm";
import type {Database} from "../db/client";
import {managedBotHostedCapabilities} from "../db/schema/managed-agents";

/** Source-owned Bot permissions. Default is DENY, including for public/team Bots.
 * Not a separate agent runner or provider-side capability journal.
 */
export type HostedCapabilities={sandbox:boolean;delegation:boolean;maxConcurrentSubagents:number};
export const DENIED_HOSTED_CAPABILITIES:HostedCapabilities=Object.freeze({
 sandbox:false,delegation:false,maxConcurrentSubagents:1
});
export function parseHostedCapabilities(value:unknown):HostedCapabilities {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid hosted capabilities");
 const raw=value as Record<string,unknown>;
 if(Object.keys(raw).some(k=>!["sandbox","delegation","maxConcurrentSubagents"].includes(k))||
   typeof raw.sandbox!=="boolean"||typeof raw.delegation!=="boolean"||
   !Number.isInteger(raw.maxConcurrentSubagents)||
   (raw.maxConcurrentSubagents as number)<1||(raw.maxConcurrentSubagents as number)>3||
   (!raw.delegation&&raw.maxConcurrentSubagents!==1))throw Error("Invalid hosted capabilities");
 return{sandbox:raw.sandbox,delegation:raw.delegation,maxConcurrentSubagents:raw.maxConcurrentSubagents as number};
}
export function hostedDefinition(capabilities:HostedCapabilities):{
 environment:{type:"openai_hosted";container_size:"small";network:{access:"disabled"}}|undefined;
 multiAgent:{enabled:true;max_concurrent_subagents:number}|undefined
}{
 return{
  environment:capabilities.sandbox?{type:"openai_hosted",container_size:"small",network:{access:"disabled"}}:undefined,
  multiAgent:capabilities.delegation?{enabled:true,max_concurrent_subagents:capabilities.maxConcurrentSubagents}:undefined
 };
}
export function createManagedHostedCapabilities(database:Database){
 const key=(ownerUserId:string,botId:string)=>and(
   eq(managedBotHostedCapabilities.ownerUserId,ownerUserId),
   eq(managedBotHostedCapabilities.botId,botId));
 return{
  async read(ownerUserId:string,botId:string):Promise<HostedCapabilities>{
   const [row]=await database.select().from(managedBotHostedCapabilities).where(key(ownerUserId,botId)).limit(1);
   return row?{sandbox:row.sandbox,delegation:row.delegation,
    maxConcurrentSubagents:row.maxConcurrentSubagents}:DENIED_HOSTED_CAPABILITIES;
  },
  async write(ownerUserId:string,botId:string,caps:HostedCapabilities):Promise<HostedCapabilities>{
   const value=parseHostedCapabilities(caps);
   await database.insert(managedBotHostedCapabilities).values({
    ownerUserId,botId,...value,updatedAt:new Date()
   }).onConflictDoUpdate({
    target:[managedBotHostedCapabilities.ownerUserId,managedBotHostedCapabilities.botId],
    set:{...value,updatedAt:new Date()}
   });
   return this.read(ownerUserId,botId);
  }
 };
}
