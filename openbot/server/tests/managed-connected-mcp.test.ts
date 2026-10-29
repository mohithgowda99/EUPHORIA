import {test,expect} from "bun:test";
import {authorizeManagedMCP,managedMCPArgs,managedMCPCall,approvedWriteDecision,mcpWritePreview} from "../src/agents/managed-connected-mcp";
import type {OriginalPluginBridge} from "../src/agents/managed-connected-mcp";

function fake(tool:{effect:"read"|"write";destructive?:boolean},allow=true){
 let executed=0;
 const listForAgent=async(_bot:string)=>({tools:allow?[{ref:"docs/read",toolName:"docs__read",description:"Read test document",inputSchema:{type:"object"}}]:[],skills:[]});
 const listServers=async()=>[{tools:[{ref:"docs/read",effect:tool.effect,destructive:tool.destructive??false,inputSchema:{type:"object"}}]}];
 const callTool=async()=>{executed++;return{text:"fixture result",isError:false};};
 return {bridge:{listForAgent,listServers,callTool} as unknown as OriginalPluginBridge,executions:()=>executed};
}
test("MCP parser accepts exact provider call and refuses unbounded/unknown arguments",()=>{
 const call={type:"function_call",name:"euphoria_connected_mcp",turn_id:"turn_1",call_id:"call_1",
  arguments:JSON.stringify({ref:"docs/read",args:{key:"report"}})};
 expect(managedMCPCall(call).call_id).toBe("call_1");
 expect(managedMCPArgs(call.arguments)).toEqual({ref:"docs/read",args:{key:"report"}});
 expect(()=>managedMCPArgs({ref:"docs/read",args:{},extra:"bypass"})).toThrow();
 expect(()=>managedMCPCall({...call,turn_id:"../../"})).toThrow();
 expect(()=>managedMCPArgs({ref:"docs/read",args:{data:"a".repeat(8100)}})).toThrow();
});
test("Original grants and effect prevent unauthorized MCP calls",async()=>{
 const {bridge,executions}=fake({effect:"read"});
 expect((await authorizeManagedMCP(bridge,"bot_A",{ref:"docs/read",args:{key:"x"}})).effect).toBe("read");
 expect(executions()).toBe(0);
 const denied=fake({effect:"read"},false);
 await expect(authorizeManagedMCP(denied.bridge,"bot_B",{ref:"docs/read",args:{}})).rejects.toThrow();
 expect(denied.executions()).toBe(0);
 const destroy=fake({effect:"write",destructive:true});
 await expect(authorizeManagedMCP(destroy.bridge,"bot_A",{ref:"docs/read",args:{}})).rejects.toThrow();
 expect(destroy.executions()).toBe(0);
});
test("Write approval must be a deliberate one-time choice",()=>{
 expect(approvedWriteDecision("Allow once")).toBe("allow");
 expect(approvedWriteDecision("Refuse")).toBe("deny");
 expect(()=>approvedWriteDecision("yes")).toThrow();
 expect(()=>approvedWriteDecision("Allow always")).toThrow();
 const preview=mcpWritePreview("docs/read",{message:"Send once"});
 expect(preview).toContain("Effect: write");
 expect(preview).toContain("Send once");
 expect(()=>mcpWritePreview("docs/read",{data:"a".repeat(4000)})).toThrow();
});
