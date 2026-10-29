import type {PluginStore, ServerRecord, ToolRecord} from "../plugins/store";

/**
 * Direct Agents MCP has no pre-execution callback to EUPHORIA's approval store.
 * Only explicitly operator-allowlisted, credential-free public READ services
 * may use this native path. All writes, credentialed servers, private network
 * servers and unrecognized effects stay on original source PluginStore.
 *
 * This builder is called for EVERY new session, not cached globally. Existing
 * sessions must be cancelled/retired on grant or Bot revocation; never
 * advertise immediate revocation of a server-side managed MCP connection.
 */
export type ManagedNativeMCPStore=Pick<PluginStore,"listForAgent"|"listServers">;
export type NativeMCPSelection={
  tools: Array<{
    type:"mcp";server_label:string;transport:{type:"http";server_url:string};
    connection_origin:"service";required:true;allowed_tools:string[];
  }>;
  nativeRefs:string[];
};

function trustedPublicOrigin(urlString:string, origins:readonly string[]):boolean {
  try {
    const u=new URL(urlString);
    if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port) return false;
    if(!/^[a-z0-9.-]+$/i.test(u.hostname)||u.hostname==="localhost"||
       u.hostname.endsWith(".local")||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||
       u.hostname.includes(":"))return false;
    return origins.some(origin=>{
      try {
        const approved=new URL(origin);
        return approved.protocol==="https:"&&!approved.username&&!approved.password&&
          !approved.search&&!approved.hash&&!approved.port&&
          approved.origin===u.origin;
      }catch{return false;}
    });
  }catch{return false;}
}

export async function selectNativeReadOnlyMCP(
  store:ManagedNativeMCPStore,botID:string,allowedOrigins:readonly string[]
):Promise<NativeMCPSelection>{
  if(!botID||!allowedOrigins.length)return{tools:[],nativeRefs:[]};
  const [grants,servers]=await Promise.all([store.listForAgent(botID),store.listServers()]);
  const granted=new Set(grants.tools.map(t=>t.ref));
  const tools:NativeMCPSelection["tools"]=[];
  const nativeRefs:string[]=[];
  for(const server of servers as ServerRecord[]){
    if(tools.length>=4)break;
    if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(server.id)||
      !trustedPublicOrigin(server.url,allowedOrigins)||server.hasCredential||
      server.lastError||!server.toolsRefreshedAt)continue;
    const reads=(server.tools as ToolRecord[]).filter(t=>
      t.serverId===server.id&&t.ref===server.id+"/"+t.name&&
      granted.has(t.ref)&&t.effect==="read"&&!t.destructive&&
      /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(t.name)
    ).slice(0,16);
    if(!reads.length)continue;
    tools.push({
      type:"mcp",server_label:server.id,
      transport:{type:"http",server_url:server.url},
      connection_origin:"service",required:true,
      allowed_tools:reads.map(t=>t.name)
    });
    nativeRefs.push(...reads.map(t=>t.ref));
  }
  return{tools,nativeRefs};
}
