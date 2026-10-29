import {and,eq,sql} from "drizzle-orm";
import type {Database} from "../db/client";
import {managedBotHostedCapabilities,managedAgentSessionLinks} from "../db/schema/managed-agents";

/** Source-owned Bot permissions. Default is DENY, including for public/team Bots.
 * Not a separate agent runner or provider-side capability journal.
 */
export type HostedCapabilities={sandbox:boolean;delegation:boolean;maxConcurrentSubagents:number;webSearch:boolean;browser:boolean};
export const DENIED_HOSTED_CAPABILITIES:HostedCapabilities=Object.freeze({
 sandbox:false,delegation:false,maxConcurrentSubagents:1,webSearch:false,browser:false
});
export function parseHostedCapabilities(value:unknown):HostedCapabilities {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid hosted capabilities");
 const raw=value as Record<string,unknown>;
 if(Object.keys(raw).some(k=>!["sandbox","delegation","maxConcurrentSubagents","webSearch","browser"].includes(k))||
   typeof raw.sandbox!=="boolean"||typeof raw.delegation!=="boolean"||typeof raw.webSearch!=="boolean"||typeof raw.browser!=="boolean"||
   !Number.isInteger(raw.maxConcurrentSubagents as number)||
   (raw.maxConcurrentSubagents as number)<1||(raw.maxConcurrentSubagents as number)>3||
   (!raw.delegation&&raw.maxConcurrentSubagents!==1))throw Error("Invalid hosted capabilities");
 return{sandbox:raw.sandbox,delegation:raw.delegation,maxConcurrentSubagents:raw.maxConcurrentSubagents as number,webSearch:raw.webSearch,browser:raw.browser};
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
    maxConcurrentSubagents:row.maxConcurrentSubagents,webSearch:row.webSearch,browser:row.browser}:DENIED_HOSTED_CAPABILITIES;
  },
  async write(ownerUserId:string,botId:string,caps:HostedCapabilities):Promise<HostedCapabilities>{
   const value=parseHostedCapabilities(caps);
   // Same transaction-scoped advisory key as managed session reservation.
   // This closes the race between enabling a tool and the first paid session
   // adopting a different immutable manifest on another process.
   return database.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerUserId+":"+botId}, 0))`);
    const [reserved]=await tx.select({ownerUserId:managedAgentSessionLinks.ownerUserId})
      .from(managedAgentSessionLinks)
      .where(and(eq(managedAgentSessionLinks.ownerUserId,ownerUserId),
        eq(managedAgentSessionLinks.botId,botId))).limit(1);
    if(reserved)throw Object.assign(Error("Hosted capability manifest is locked after the first session reservation"),{status:409});
    await tx.insert(managedBotHostedCapabilities).values({
      ownerUserId,botId,...value,updatedAt:new Date()
    }).onConflictDoUpdate({
      target:[managedBotHostedCapabilities.ownerUserId,managedBotHostedCapabilities.botId],
      set:{...value,updatedAt:new Date()}
    });
    return value;
   });
  }
 };
}
