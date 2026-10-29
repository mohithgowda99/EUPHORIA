import type {PluginStore} from "../plugins/store";
import {inspectToolArguments} from "../plugins/content-governance";

/** Thin bridge: the existing PluginStore remains responsible for grants,
 * credential isolation, policy, MCP transport and audit. This is NOT an MCP
 * executor, runner, or credential store.
 */
export const MANAGED_CONNECTED_MCP_TOOL={
 type:"function" as const,
 name:"euphoria_connected_mcp",
 description:"Invoke only a tool currently granted to this Bot through the owner's EUPHORIA Connections. Write actions always require a fresh human decision before execution.",
 parameters:{
  type:"object",
  properties:{
   ref:{type:"string",description:"Exact granted MCP tool reference, such as server/tool"},
   args:{type:"object",description:"Arguments matching that tool's advertised input schema",additionalProperties:true}
  },
  required:["ref","args"],
  additionalProperties:false
 }
};
export type ManagedMCPCall={
 type:"function_call";name:"euphoria_connected_mcp";
 turn_id:string;call_id:string;arguments:unknown;
};
export type ManagedMCPArgs={ref:string;args:Record<string,unknown>};
export type OriginalPluginBridge=Pick<PluginStore,"listForAgent"|"listServers"|"callTool">;
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const validID=(s:unknown)=>typeof s==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s);
export function managedMCPArgs(raw:unknown):ManagedMCPArgs{
 const value=typeof raw==="string"?JSON.parse(raw):raw;
 if(!isRecord(value)||Object.keys(value).some(k=>k!=="ref"&&k!=="args")||
  typeof value.ref!=="string"||!/^[a-zA-Z0-9._-]{1,120}\/[a-zA-Z0-9._-]{1,120}$/.test(value.ref)||
  !isRecord(value.args))throw Error("Invalid managed MCP arguments");
 const encoded=JSON.stringify(value.args);
 if(!encoded||encoded.length>8000)throw Error("Managed MCP arguments exceed limit");
 return{ref:value.ref,args:value.args};
}
export function managedMCPCall(raw:unknown):ManagedMCPCall{
 if(!isRecord(raw)||raw.type!=="function_call"||raw.name!=="euphoria_connected_mcp"||
  !validID(raw.turn_id)||!validID(raw.call_id))throw Error("Invalid managed MCP provider correlation");
 managedMCPArgs(raw.arguments);
 return{type:"function_call",name:"euphoria_connected_mcp",
  turn_id:raw.turn_id as string,call_id:raw.call_id as string,arguments:raw.arguments};
}
/** A missing tool, revoked grant, unknown effect, destructive action or
 * missing credential is a refusal, never read-only by default.
 */
export async function authorizeManagedMCP(
 plugins:OriginalPluginBridge,botId:string,raw:unknown
):Promise<{input:ManagedMCPArgs;effect:"read"|"write";description:string}>{
 const input=managedMCPArgs(raw);
 const [grants,servers]=await Promise.all([plugins.listForAgent(botId),plugins.listServers()]);
 const granted=grants.tools.find(t=>t.ref===input.ref);
 const advertised=servers.flatMap(server=>server.tools).find(t=>t.ref===input.ref);
 if(!granted||!advertised||!granted.inputSchema||!advertised.inputSchema)
  throw Error("MCP tool not currently granted or advertised to this Bot");
 if(advertised.effect!=="read"&&advertised.effect!=="write")
  throw Error("Unknown MCP effect");
 if(advertised.destructive)throw Error("Destructive MCP tools require a separate dedicated policy");
 if(!inspectToolArguments(input.args).safe)throw Error("Sensitive MCP tool arguments refused");
 return{input,effect:advertised.effect,description:granted.description};
}
export function approvedWriteDecision(response:string):"allow"|"deny"{
 if(response==="Allow once")return"allow";
 if(response==="Refuse")return"deny";
 throw Error("Write approval requires explicit Allow once or Refuse");
}
export function mcpWritePreview(ref:string,args:Record<string,unknown>):string{
 const value=JSON.stringify(args,null,2);
 if(value.length>3500)throw Error("MCP write cannot be previewed safely");
 return "Connector: "+ref+"\nEffect: write\nExact arguments:\n"+value;
}
