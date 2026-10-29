/** OFFLINE acceptance fixture only. Start against a freshly migrated, disposable local evs1_ database.
 * No OpenAI client or API key is used. The app shell and original source stores are real.
 * The provider replies, files and timing are deterministic test data, never live acceptance. */
import {createDatabase} from '../../../../openbot/server/src/db/client.ts';
import {createManagedDevelopment} from '../../../../openbot/server/src/agents/managed-development.ts';
import {DEV_ACTOR} from '../../../../openbot/server/src/auth/dev-actor.ts';
import {createManagedHostedCapabilities,DENIED_HOSTED_CAPABILITIES} from '../../../../openbot/server/src/agents/managed-hosted-capabilities.ts';
const databaseURL=process.env.TEST_DATABASE_URL!;
const target=new URL(databaseURL);
if(!['127.0.0.1','localhost'].includes(target.hostname)||!target.pathname.startsWith('/evs1_')||process.env.NODE_ENV==='production')throw Error('Dedicated local validation DB required');
const database=createDatabase(databaseURL);
const sessions=new Map<string,any>();
const content=new TextEncoder().encode('EUPHORIA Section 1 validation fixture. No live inference.\n');
const args={schemaVersion:1,surfaceID:'native_validation',revision:0,nodes:[{id:'choice',kind:'askChoice',title:'Choose a training day',options:[{id:'pull',label:'Pull day'},{id:'legs',label:'Leg day'}]}]};
const provider={
 async createSessionStream(input:any){const id='sess_'+crypto.randomUUID().replaceAll('-','');const root='root_'+crypto.randomUUID().replaceAll('-','');const mode=input.input.includes('file')?'file':input.input.includes('cancel')?'cancel':'choice';sessions.set(id,{id,root,mode,pending:mode==='choice',cancelled:false});return{close(){},events:(async function*(){yield{type:'agent.session.created',event_id:'evt_'+id,session:{id}};yield{type:'agent.session.turn.created',event_id:'evt_'+root,session_id:id,turn_id:root,turn:{id:root,session_id:id,subagent_id:null}};})()};},
 async retrieveSession(id:string){const s=sessions.get(id);return{id,status:s.pending?'requires_action':s.mode==='cancel'&&!s.cancelled?'working':'idle',environment:{type:'openai_hosted',id:'env_'+id,network:{access:'disabled'},skills:[]},required_actions:s.pending?[{type:'function_call',name:'euphoria_render_surface',call_id:'call_'+s.root,turn_id:s.root,arguments:args}]:[]};},
 async retrieveTurn(id:string,root:string){const s=sessions.get(id);return{id:root,session_id:id,subagent_id:null,status:s.cancelled?'cancelled':s.pending?'requires_action':s.mode==='cancel'?'in_progress':'completed'};},
 async listTurnItems(id:string){const s=sessions.get(id);return{data:s.pending||s.mode==='cancel'?[]:[...(s.mode==='choice'?[{type:'function_call',name:'euphoria_render_surface',turn_id:s.root,call_id:'call_'+s.root,arguments:args}]:[]),{type:'message',id:'answer_'+s.root,turn_id:s.root,role:'assistant',status:'completed',content:[{type:'output_text',text:s.mode==='file'?'Your validation file is ready.':'Pull day saved in the original source conversation.'}]}],has_more:false};},
 async listItems(id:string){return this.listTurnItems(id);},
 async listTurns(id:string){const s=sessions.get(id);return{data:[await this.retrieveTurn(id,s.root)],has_more:false};},
 async submitToolResult(id:string){sessions.get(id).pending=false;},
 async listSubagents(){return{data:[],has_more:false};},
 async listArtifacts(id:string){const s=sessions.get(id);return{data:s.mode==='file'?[{id:'artifact_'+s.root,session_id:id,turn_id:s.root,environment_id:'env_'+id,path:'/workspace/outputs/validation.txt',size_bytes:content.length}]:[],has_more:false};},
 async retrieveArtifact(id:string){return(await this.listArtifacts(id)).data[0];},
 async retrieveArtifactContent(){return {bytes:content};},
 async cancelTurn(id:string){sessions.get(id).cancelled=true;return{};},
 async retrieveEnvironment(id:string){return{id,type:'openai_hosted',status:'connected'};}
};
const token=process.env.EUPHORIA_VALIDATION_TOKEN??'';
if(token.length<32)throw Error('Set an ephemeral EUPHORIA_VALIDATION_TOKEN of at least 32 characters');
const service=await createManagedDevelopment({database,provider:provider as any,token,model:'offline-fixture'});
const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
for(const mode of ['choice','file','cancel']){
 const bot=await service.profiles.create(actor,{name:'Validation '+mode,title:'Offline fixture',roleDescription:'Validation only',systemPrompt:'Local deterministic fixture, no live inference.',visibility:'private'});
 await createManagedHostedCapabilities(database).write(actor.id,bot.id,{...DENIED_HOSTED_CAPABILITIES,sandbox:true});
 const channel=await service.channels.create(actor,[bot.id]);
 const r=await service.app.request('/api/delivery/conversations/'+channel.id+'/messages',{method:'POST',headers:{cookie:'euphoria-development='+token,'content-type':'application/json'},body:JSON.stringify({agentId:bot.id,text:'Validate '+mode,externalId:crypto.randomUUID()})});
 if(r.status!==202)throw Error('Unable to seed native fixture');
 await service.tick();
}
setInterval(()=>service.tick().catch(()=>console.error('Fixture tick failed')),1000);
const port=Number(process.env.EUPHORIA_VALIDATION_PORT??8793);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local fixture port');
Bun.serve({hostname:'127.0.0.1',port,fetch:service.app.fetch});
console.log('Section 1 OFFLINE native fixture ready on loopback port '+port);
