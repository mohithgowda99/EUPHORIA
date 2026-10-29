import {test,expect} from "bun:test";
import {selectNativeReadOnlyMCP} from "../src/agents/managed-native-mcp";
import type {ManagedNativeMCPStore} from "../src/agents/managed-native-mcp";

function fixture(url="https://docs.example.com/mcp",credential=false){
 const server={id:"docs",title:"Docs",url,hasCredential:credential,
  authScheme:null,accountMode:null,sharedVendorConnected:false,lastError:null,
  toolsRefreshedAt:"2026-10-29T00:00:00Z",tools:[
   {serverId:"docs",name:"search",ref:"docs/search",effect:"read",destructive:false,inputSchema:{}},
   {serverId:"docs",name:"send",ref:"docs/send",effect:"write",destructive:false,inputSchema:{}},
   {serverId:"docs",name:"erase",ref:"docs/erase",effect:"read",destructive:true,inputSchema:{}},
 ]};
 const store={
  async listForAgent(){return{tools:[
   {ref:"docs/search"},{ref:"docs/send"},{ref:"docs/erase"}
  ],skills:[]};},
  async listServers(){return[server];}
 } as unknown as ManagedNativeMCPStore;
 return store;
}
test("only individually granted public reads reach native managed MCP",async()=>{
 const selected=await selectNativeReadOnlyMCP(fixture(),"bot1",["https://docs.example.com"]);
 expect(selected.nativeRefs).toEqual(["docs/search"]);
 expect(selected.tools).toEqual([{type:"mcp",server_label:"docs",connection_origin:"service",
  transport:{type:"http",server_url:"https://docs.example.com/mcp"},
  required:true,allowed_tools:["search"]}]);
});
test("native MCP refuses credentialed private or unapproved endpoints",async()=>{
 for(const url of ["http://docs.example.com/mcp","https://localhost/mcp",
  "https://127.0.0.1/mcp","https://docs.example.com:444/mcp",
  "https://docs.example.com.evil.org/mcp","https://docs.example.com/mcp?token=secret"]){
  expect((await selectNativeReadOnlyMCP(fixture(url),"bot1",["https://docs.example.com"])).tools).toEqual([]);
 }
 expect((await selectNativeReadOnlyMCP(fixture(undefined,true),"bot1",["https://docs.example.com"])).nativeRefs).toEqual([]);
 expect((await selectNativeReadOnlyMCP(fixture(),"bot1",[])).nativeRefs).toEqual([]);
 expect((await selectNativeReadOnlyMCP(fixture(),"bot1",["https://docs.example.com/mcp"])).nativeRefs).toEqual([]);
 const brokered=fixture();
 const original=brokered.listServers.bind(brokered);
 brokered.listServers=async()=>{const rows=await original();return rows.map(s=>({...s,authScheme:"OAUTH2"}));};
 expect((await selectNativeReadOnlyMCP(brokered,"bot1",["https://docs.example.com"])).nativeRefs).toEqual([]);
});
test("revocation applies to newly created agent tool manifests",async()=>{
 const store=fixture();expect((await selectNativeReadOnlyMCP(store,"bot1",["https://docs.example.com"])).nativeRefs.length).toBe(1);
 store.listForAgent=async()=>({tools:[],skills:[]});
 expect((await selectNativeReadOnlyMCP(store,"bot1",["https://docs.example.com"])).nativeRefs).toEqual([]);
});
