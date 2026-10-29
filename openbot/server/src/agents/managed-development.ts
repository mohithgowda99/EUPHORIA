/** Loopback development assembly of ORIGINAL source stores/routes + managed execution.
 * No CopilotKit Intelligence credential, duplicate task database or local model runner.
 * Deliberately excludes unported tool grants and production identity.
 */
import {Hono, type MiddlewareHandler} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {timingSafeEqual,createHash} from 'node:crypto';
import {and,eq,desc,isNull,isNotNull,sql} from 'drizzle-orm';
import {createDatabase,type Database} from '../db/client';
import {loadTenantPackage,synchronizeTenantPackage} from '../tenant-package';
import {deliveryInbox,managedAgentInboxTurns,managedAgentSessionLinks,workItems} from '../db/schema';
import {DEV_ACTOR,initializeDevActorUser} from '../auth/dev-actor';
import type {AppVariables} from '../auth/guards';
import {createAgentProfileStore} from './profile-store';
import {createRuntimeAgentLoader} from './runtime-agents';
import {standingRoleMessage} from '../copilot';
import {createChannelStore,createChannelRoutes} from '../channels/routes';
import {createThreadIdentity} from '../channels/thread-identity';
import {createAgentRoutes} from './routes';
import {createDeliveryStore} from '../delivery/store';
import {createDeliveryRouter} from '../delivery/router';
import {createDeliveryRoutes} from '../delivery/routes';
import type {DeliveryScope} from '../delivery/types';
import {createWorkQueue} from '../work/queue';
import {repeatAfterEach} from '../work/loop';
import {createApprovalQuestions} from '../approvals/questions';
import {MANAGED_ASK_PERSON_TOOL,parseManagedQuestionCall,parseManagedQuestion,parseManagedCorrelation,pendingManagedQuestion} from './managed-person-questions';
import {createManagedTaskAdapter} from './managed-task-adapter';
import {createManagedHostedCapabilities,parseHostedCapabilities,hostedDefinition,DENIED_HOSTED_CAPABILITIES} from './managed-hosted-capabilities';
import {projectHostedArtifact,attachmentName} from './managed-hosted-artifacts';
import {assertCurrentRootForCancellation} from './managed-hosted-cancel';
import {browserEnvironment,parsePublicBrowserHosts,pendingPublicOrigin} from './managed-hosted-browser';
import {managedSourceSkillContext} from './managed-source-skills';
import {grantedHostedSkillReferences,parseHostedSkillMappings,type HostedSkillMapping} from './managed-hosted-skills';
import {canManageAgent} from './profile-policy';
import {createMemoryStore} from '../memory/store';
import {createMemoryRoutes} from '../memory/routes';
import {managedMemoryContext} from './managed-memory-context';
import {createPluginStore,type PluginStore} from '../plugins/store';
import {createPluginRoutes} from '../plugins/routes';
import {createCredentialStore} from '../credentials';
import {createAuditStore} from '../audit';
import {createPolicyStore,DEFAULT_ACTION_POLICY} from '../computer/policy-store';
import {selectNativeReadOnlyMCP} from './managed-native-mcp';
import {MANAGED_CONNECTED_MCP_TOOL,managedMCPCall,authorizeManagedMCP,approvedWriteDecision,mcpWritePreview,managedMCPInventory,type OriginalPluginBridge} from './managed-connected-mcp';
import {resolveManagedSourceBot} from './managed-source-definition';
import {createManagedSessionLinkStore} from './managed-session-links';
import {createManagedInboxTurnStore} from './managed-inbox-turns';
import {submitManagedSourceInput} from './managed-source-submission';
import {reconcileManagedSourceInbox} from './managed-source-reconciliation';
// Existing tested provider transport; Bun loads this ESM without a second SDK stack.
// @ts-expect-error audited JavaScript boundary
import {AgentsClient} from '../../../../gateway/agents-client.mjs';

// @ts-expect-error existing canonical renderer contract
import {normalizeRenderInput,renderInputSchema} from '../../../../gateway/a2ui-form.mjs';
// @ts-expect-error existing canonical human operation validation
import {decisionResult,stable} from '../../../../gateway/visual-contract.mjs';
// @ts-expect-error existing bounded provider argument validation
import {argumentFingerprint} from '../../../../gateway/provider-arguments.mjs';
// @ts-expect-error stable shared native prompt prefix
import {RENDER_INSTRUCTIONS} from '../../../../gateway/render-prompt.mjs';

export async function createManagedDevelopment(input:{database:Database;provider:AgentsClient;token:string;model:string;plugins?:PluginStore;nativeReadOnlyMCPOrigins?:readonly string[];allowWebSearch?:boolean;hostedSkillMappings?:HostedSkillMapping;browserHosts?:readonly string[]}) {
 if(input.token.length<32)throw Error('Development token must contain at least32 characters');
 const {database,provider}=input;
 await initializeDevActorUser(database,true);
 const profiles=createAgentProfileStore(database,undefined);
 const channels=createChannelStore(database,profiles,createThreadIdentity('euphoria-managed-development'));
 const store=createDeliveryStore(database),queue=createWorkQueue(database);
 const links=createManagedSessionLinkStore(database),turns=createManagedInboxTurnStore(database,links);
 const registered=createRuntimeAgentLoader(database);
 const memory=createMemoryStore(database);
 const hosted=createManagedHostedCapabilities(database);
 const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
 const scopeFor=async(owner:string,channelId:string,agentId:string)=>{
  if(owner!==actor.id)return null;
  const channel=await channels.get(actor,channelId);
  if(!channel||!channel.agentIds.includes(agentId)||!await profiles.get(actor,agentId))return null;
  return {ownerUserId:owner,channelId,agentId,threadId:channel.threadId};
 };
 const authorised=async(scope:DeliveryScope)=>(await scopeFor(scope.ownerUserId,scope.channelId,scope.agentId))?.threadId===scope.threadId;
 const questions=createApprovalQuestions(database,async question=>{
  const current=await scopeFor(question.actorId,question.channelId??'',question.botId);
  if(!current||current.threadId!==question.threadId)throw Error('Question owner, Bot or channel access revoked');
 });
 const router=createDeliveryRouter({store,queue,owner:'managed-development-delivery',providers:{},authoriseScope:authorised,
  runTurn:async scope=>{
   if(!await authorised(scope))throw Error('Source access revoked');
   const resolved=await resolveManagedSourceBot({actor,botId:scope.agentId,profiles,registered,model:input.model,roleMessage:standingRoleMessage});
   const approvedMemory=managedMemoryContext(await memory.list(scope.ownerUserId),scope.agentId);
   // Source ownership is stricter than merely having a team-visible Bot.
   // Missing grant DENIES sandbox/delegation. Existing sessions keep their
   // creation manifest, so changing these grants is forbidden after binding.
   const activeProfile=await profiles.get(actor,scope.agentId);
   const caps=activeProfile?.ownerUserId===scope.ownerUserId&&
     !activeProfile.systemOwned?await hosted.read(scope.ownerUserId,scope.agentId):DENIED_HOSTED_CAPABILITIES;
   const managedHosted=hostedDefinition(caps);
   const hostedSkillRefs=input.plugins&&caps.sandbox?
     await grantedHostedSkillReferences(input.plugins,scope.agentId,input.hostedSkillMappings??{}):[];
   const hostedEnvironment=caps.browser?
     browserEnvironment(input.browserHosts??[]):
     managedHosted.environment?
     {...managedHosted.environment,...(hostedSkillRefs.length?{skills:hostedSkillRefs}:{})}:undefined;
   const hostedGuidance=caps.sandbox?
     "\\n\\nYou have an isolated OpenAI-hosted sandbox with network disabled. Read uploaded files only under /workspace; never claim a file was opened unless you actually processed it. Save final user-downloadable files under /workspace/outputs with a concise, accurate filename, and describe what you produced. Published artifacts are available to the user only after the original source turn is completed.":'';
   const browserGuidance=caps.browser?
     "\\n\\nBrowser use is restricted to approved public documentation domains. Never sign in, submit forms, modify a website, post data, or perform other external writes. Origin access requires a separate user choice. If a site needs authentication or writable interaction, ask the user to use the source-approved connector instead.":'';
   const delegationGuidance=caps.delegation?
     "\\n\\nFor independent, useful parallel work you may delegate to provider-managed subagents within the configured bound. Subagents are not separate EUPHORIA Bots or authorized to gain new source permissions. Do not report their work as finished before the main root turn actually verifies it.":'';
   const nativeMCP=input.plugins?await selectNativeReadOnlyMCP(input.plugins,scope.agentId,input.nativeReadOnlyMCPOrigins??[]):{tools:[],nativeRefs:[]};
   const connectedInventory=input.plugins?await managedMCPInventory(input.plugins,scope.agentId,nativeMCP.nativeRefs):'';
   const grantedSkills=input.plugins?await managedSourceSkillContext(input.plugins,scope.agentId):'';

   // A provider session retains immutable hosted skill bundles. Revoking the
   // ORIGINAL source skill grant must NEVER silently allow a later user turn
   // to reuse that provider session with a now-unapproved skill still mounted.
   // No new provider session, runner or skill store is created here.
   if(caps.sandbox){
    const currentLink=await links.read({ownerUserId:scope.ownerUserId,
      channelId:scope.channelId,botId:scope.agentId,threadId:scope.threadId});
    if(currentLink?.providerSessionId){
     const old=await provider.retrieveSession(currentLink.providerSessionId);
     if(old.id!==currentLink.providerSessionId)throw Error('Managed skill session identity changed');
     const installed=(old.environment?.skills??[]) as unknown;
     if(!Array.isArray(installed))throw Error('Managed environment skill inventory unavailable');
     const want=hostedSkillRefs.map(x=>x.skill_id+':'+x.version).sort();
     const have=installed.filter(x=>x&&typeof x==='object'&&
       (x as any).type==='skill_reference').map(x=>
        String((x as any).skill_id)+':'+String((x as any).version)).sort();
     if(JSON.stringify(want)!==JSON.stringify(have))
      throw Error('Hosted skill grants changed. Reusing the original session could expose revoked skills; use a new Bot');
    }
   }

   await channels.recordActivity(actor,scope.channelId,{text:scope.text,agentId:null,at:new Date()},{id:'delivery-input:'+scope.runId});
   await submitManagedSourceInput({scope:{ownerUserId:scope.ownerUserId,channelId:scope.channelId,botId:scope.agentId,threadId:scope.threadId},
    runId:scope.runId,message:scope.text,definition:{...resolved.agent,reasoningEffort:'low',verbosity:'low',instructions:RENDER_INSTRUCTIONS+"\n\n"+resolved.agent.instructions+approvedMemory+connectedInventory+grantedSkills+hostedGuidance+browserGuidance+delegationGuidance,tools:[{type:"function",name:"euphoria_render_surface",description:"Present supported native content or ask one human decision.",parameters:renderInputSchema},MANAGED_ASK_PERSON_TOOL,...(input.plugins?[MANAGED_CONNECTED_MCP_TOOL]:[]),
       ...(input.allowWebSearch&&caps.webSearch?[{type:'web_search',mode:'live',context_size:'low'}]:[]),...(caps.browser?[{type:'computer_use',include_screenshots:true}]:[]),...nativeMCP.tools],
       ...managedHosted,environment:hostedEnvironment},links,turns,provider});
   return {replyText:'',pending:true};
  }});
 const app=new Hono<{Variables:AppVariables}>();
 const digest=(v:string)=>createHash('sha256').update(v).digest();
 const expected=digest('euphoria-development='+input.token);
 const requireUser:MiddlewareHandler<{Variables:AppVariables}>=async(c,next)=>{
  if(!timingSafeEqual(expected,digest(c.req.header('cookie')??'')))return c.json({error:'Development authentication required'},401);
  c.set('actor',DEV_ACTOR);await next();
 };
 app.use('*',bodyLimit({maxSize:2*1024*1024})); // Hosted 1MiB file upload, still bounded per route.
 app.onError((error,c)=>{if('status' in error && [409,422,502].includes(Number(error.status)))return c.json({error:error.message},Number(error.status) as 409|422|502);console.error(JSON.stringify({type:'managed-development-error',name:error.name}));return c.json({error:'Managed source operation unavailable'},503);});
 app.get('/api/auth/get-session',requireUser,c=>c.json({user:{...DEV_ACTOR,name:'Development'}}));
 // Original OpenDuet questions, accepted through its transactional one-winner
 // person.response store. The native Approvals tab already uses these paths.
 app.get('/api/approvals',requireUser,async c=>{
  const owner=c.var.actor.id;
  const recoveries=await database.select({id:workItems.key,error:workItems.lastError}).from(workItems)
    .where(and(eq(workItems.kind,'person.response'),isNull(workItems.finishedAt),
      eq(workItems.attempts,100),sql`${workItems.payload}->>'ownerUserId' = ${owner}`))
    .orderBy(desc(workItems.createdAt)).limit(100);
  return c.json({requests:[],questions:await questions.list(owner),
    recoveries:recoveries.map(r=>({...r,canContinue:r.error?.startsWith('Provider question closed;')??false}))});
 });
 app.post('/api/approvals/questions/:id/respond',requireUser,async c=>{
  let body:unknown;
  try{body=await c.req.json();}catch{return c.json({error:'Invalid answer'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>k!=='response')||
    typeof (body as {response?:unknown}).response!=='string'||
    !(body as {response:string}).response.trim()||
    (body as {response:string}).response.length>6000)return c.json({error:'Invalid answer'},400);
  const [savedQuestion]=await database.select({payload:workItems.payload}).from(workItems).where(and(
    eq(workItems.kind,'person.question'),eq(workItems.key,c.req.param('id')),
    sql`${workItems.payload}->>'actorId' = ${c.var.actor.id}`)).limit(1);
  if(savedQuestion?.payload&&typeof savedQuestion.payload==='object'&&
    (savedQuestion.payload as {managed?:{kind?:string}}).managed?.kind==='connector_write'){
    try{approvedWriteDecision((body as {response:string}).response);}
    catch{return c.json({error:'Choose Allow once or Refuse'},400);}
  }
  try{return c.json(await questions.respond(c.var.actor.id,c.req.param('id'),(body as {response:string}).response),202);}
  catch{return c.json({error:'Question already answered, missing or unauthorized'},409);}
 });
 // Only a CLOSED, ordinary question can become an explicitly requested new
 // source user message. An uncertain HTTP POST or connector write is not
 // recoverable by replay. The original response remains immutable for audit.
 app.post('/api/approvals/recovery/:id/continue',requireUser,async c=>{
  const owner=c.var.actor.id,id=c.req.param('id');
  const [response]=await database.select().from(workItems)
   .where(and(eq(workItems.kind,'person.response'),eq(workItems.key,id),
     isNull(workItems.finishedAt),eq(workItems.attempts,100),
     sql`${workItems.payload}->>'ownerUserId' = ${owner}`)).limit(1);
  if(!response?.lastError?.startsWith('Provider question closed;'))
   return c.json({error:'No safely recoverable expired question'},409);
  const stored=response.payload as {ownerUserId?:string;question?:{question?:string};response?:string};
  const [source]=await database.select({payload:workItems.payload}).from(workItems)
   .where(and(eq(workItems.kind,'person.question'),eq(workItems.key,id))).limit(1);
  const q=source?.payload as {actorId?:string;botId?:string;channelId?:string;threadId?:string;managed?:unknown}|undefined;
  if(!q||q.actorId!==owner||typeof stored.question?.question!=='string'||
    typeof stored.response!=='string'||q.managed===undefined)
   return c.json({error:'Saved question identity unavailable'},409);
  let correlation;
  try{correlation=parseManagedCorrelation(q.managed);}catch{
   return c.json({error:'Connector approvals cannot be recovered as a user message'},409);
  }
  const scope=correlation.scope;
  if(scope.ownerUserId!==owner||scope.channelId!==q.channelId||
    scope.agentId!==q.botId||scope.threadId!==q.threadId||!await authorised(scope))
   return c.json({error:'Bot or channel permission revoked'},403);
  const requestID='manual-question-recovery:'+id;
  const text='The previous provider function call expired; do not assume any tool result. I explicitly authorize a NEW turn using this saved response.\nQuestion: '+
    stored.question.question+'\nMy answer: '+stored.response;
  if(text.length>16000)return c.json({error:'Saved context exceeds provider input limit'},413);
  const queued=await store.offerInbox({...scope,bindingId:null,source:'native',
    realm:'question-recovery',externalId:requestID,text});
  if(!queued.queued){
   const [existing]=await database.select().from(deliveryInbox).where(and(
    eq(deliveryInbox.source,'native'),eq(deliveryInbox.realm,'question-recovery'),
    eq(deliveryInbox.externalId,requestID))).limit(1);
   if(!existing||existing.ownerUserId!==owner||existing.channelId!==scope.channelId||
     existing.agentId!==scope.agentId||existing.text!==text)
    return c.json({error:'Recovery identity collision'},409);
  }
  return c.json({accepted:true,queued:queued.queued},202);
 });
 const managedTasks=createManagedTaskAdapter({
  database,channels,delivery:store,requireUser,
  actorFor:async owner=>{
   if(owner!==actor.id)throw Error('Development actor unavailable');
   return actor;
  },
  scopeFor,
  authorizeBot:async(owner,botID)=>{
   if(owner!==actor.id)throw Error('Managed Bot owner unavailable');
   await resolveManagedSourceBot({
    actor,botId:botID,profiles,registered,model:input.model,
    roleMessage:standingRoleMessage,
   });
  },
 });
 if(input.plugins)app.route('/api/plugins',createPluginRoutes(input.plugins,requireUser,
   async (requester,bot)=>!!await profiles.get(requester,bot)));
 app.route('/api/memory',createMemoryRoutes(memory,null,requireUser));
 app.route('/api/openduet/tasks',managedTasks.routes);
 app.route('/api/openduet/tasks',managedTasks.extras);
 app.route('/api/proactive/suggestions',managedTasks.suggestions);
 // Hosted code execution and managed delegation are OPT-IN on an original
 // source-owned Bot, never inferred from a chat prompt or A2UI action.
 const hostedOwner=async(userID:string,botID:string)=>{
  const profile=await profiles.get(actor,botID);
  return userID===actor.id&&profile?.id===botID&&
    profile.ownerUserId===userID&&canManageAgent(actor,profile);
 };
 const hostedLocked=async(owner:string,botID:string)=>{
  const [row]=await database.select({session:managedAgentSessionLinks.providerSessionId})
    .from(managedAgentSessionLinks)
    .where(and(eq(managedAgentSessionLinks.ownerUserId,owner),eq(managedAgentSessionLinks.botId,botID))).limit(1);
  // Even a null session is a pending create and cannot safely be reconfigured.
  return !!row;
 };
 app.get('/api/agents/:id/hosted-capabilities',requireUser,async c=>{
  const botID=c.req.param('id');
  if(!await hostedOwner(c.var.actor.id,botID))return c.json({error:'Bot cannot be managed'},403);
  return c.json({capabilities:await hosted.read(c.var.actor.id,botID),
    locked:await hostedLocked(c.var.actor.id,botID),
    browserAvailable:!!input.browserHosts?.length});
 });
 app.put('/api/agents/:id/hosted-capabilities',requireUser,async c=>{
  const botID=c.req.param('id'),owner=c.var.actor.id;
  if(!await hostedOwner(owner,botID))return c.json({error:'Bot cannot be managed'},403);
  let config;
  try{config=parseHostedCapabilities(await c.req.json());}
  catch{return c.json({error:'Invalid hosted tool configuration'},400);}
  if(config.browser&&!input.browserHosts?.length)return c.json({error:'Public browser operator host list is not configured'},409);
  if(await hostedLocked(owner,botID))return c.json({error:
   'Existing hosted session is immutable. Configure a new Bot before enabling or revoking hosted capabilities.'},409);
  return c.json({capabilities:await hosted.write(owner,botID,config),locked:false});
 });


 // The provider cancel event applies to the SESSION, not an arbitrary client
 // turn id. A source-owned, exactly-correlated active root is required, and
 // a work receipt is persisted BEFORE any remote cancel. A lost HTTP response
 // is NEVER retried under a new request id.
 async function activeHostedRoot(owner:string,channelID:string,botID:string){
  const scope=await scopeFor(owner,channelID,botID);
  if(!scope)return null;
  const link=await links.read({ownerUserId:owner,channelId:channelID,
   botId:botID,threadId:scope.threadId});
  if(!link?.providerSessionId)return null;
  const [latest]=await database.select({
   inbox:deliveryInbox,receipt:managedAgentInboxTurns
  }).from(deliveryInbox)
   .leftJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,owner),eq(deliveryInbox.channelId,channelID),
     eq(deliveryInbox.agentId,botID),eq(deliveryInbox.threadId,scope.threadId)))
   .orderBy(desc(deliveryInbox.createdAt)).limit(1);
  if(!latest||!["accepted","running"].includes(latest.inbox.state)||
     !latest.receipt?.rootTurnId||
     latest.receipt.providerSessionId!==link.providerSessionId)return null;
  return{scope,sessionID:link.providerSessionId,inbox:latest.inbox,
   root:latest.receipt.rootTurnId};
 }

 // OpenAI owns the browser runtime. EUPHORIA only presents native, exact
 // current provider origin requests with ORIGINAL owner/Bot/root authority.
 // Browser origins cannot authorize writes, login, extra domains or credentials.
 async function currentBrowser(owner:string,channelID:string,botID:string){
  const active=await activeHostedRoot(owner,channelID,botID);
  if(!active)return null;
  const caps=await hosted.read(owner,botID);
  if(!caps.browser)return null;
  const session=await provider.retrieveSession(active.sessionID);
  if(session.id!==active.sessionID||
     session.environment?.desktop?.enabled!==true||
     session.environment?.network?.access!=='restricted')
   return null;
  const hosts=input.browserHosts??[];
  const actual=session.environment.network.allowed_domains as unknown;
  if(!Array.isArray(actual)||actual.length!==hosts.length||
     actual.some(x=>typeof x!=='string'||!hosts.includes(x)))return null;
  const [root,turns]=await Promise.all([
   provider.retrieveTurn(active.sessionID,active.root),
   provider.listTurns(active.sessionID,{limit:100,order:'desc'})
  ]);
  try{assertCurrentRootForCancellation(active.root,active.sessionID,root,turns,active.inbox.state);}
  catch{return null;}
  if(!await authorised(active.scope))return null;
  return{...active,session};
 }
 app.get('/api/delivery/conversations/:id/browser-approvals',requireUser,async c=>{
  const current=await currentBrowser(c.var.actor.id,c.req.param('id'),c.req.query('agentId')??'');
  if(!current)return c.json({requests:[]});
  const pending=pendingPublicOrigin(current.session.required_actions??[],input.browserHosts??[]);
  const pendingAuth=(current.session.required_actions??[] as unknown[]).filter(a=>
   a&&typeof a==='object'&&(a as any).type==='computer_use_approval_request'&&
   (a as any).request?.type==='browser_authentication'&&
   typeof (a as any).request_id==='string'&&
   /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test((a as any).request_id));
  const records=await database.select({key:workItems.key,finished:workItems.finishedAt,
   lastError:workItems.lastError}).from(workItems)
   .where(eq(workItems.kind,'managed.browser-decision')).limit(100);
  const recorded=new Map(records.map(x=>[x.key,x]));
  return c.json({requests:[
   ...pending.map(p=>({id:p.request_id,kind:'origin',origin:p.request.origin,
    reason:p.request.reason??null,canApprove:p.allowed,
    submitted:recorded.has(p.request_id),
    uncertain:!!recorded.get(p.request_id)?.lastError})),
   ...pendingAuth.map(a=>({id:(a as any).request_id,kind:'authentication',
    origin:null,reason:'Browser sign-in is not allowed for a public read-only Bot',
    canApprove:false,submitted:recorded.has((a as any).request_id),
    uncertain:!!recorded.get((a as any).request_id)?.lastError}))
   ]});
 });
 app.post('/api/delivery/conversations/:id/browser-approvals/:requestId',requireUser,async c=>{
  const owner=c.var.actor.id,channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  const id=c.req.param('requestId');
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))return c.json({error:'Invalid provider request'},400);
  let raw:unknown;
  try{raw=await c.req.json();}catch{return c.json({error:'Invalid browser decision'},400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).length!==1||!['approve','deny','cancel'].includes(
     String((raw as {decision?:unknown}).decision)))
   return c.json({error:'Invalid browser decision'},400);
  const choice=(raw as {decision:'approve'|'deny'|'cancel'}).decision;
  const current=await currentBrowser(owner,channelID,botID);
  if(!current)return c.json({error:'Browser source root or grant unavailable'},409);
  const pending=pendingPublicOrigin(current.session.required_actions??[],input.browserHosts??[]);
  const origin=pending.find(p=>p.request_id===id);
  const auth=(current.session.required_actions??[] as unknown[]).some(a=>
   a&&typeof a==='object'&&(a as any).type==='computer_use_approval_request'&&
   (a as any).request_id===id&&(a as any).request?.type==='browser_authentication');
  if(!origin&&!auth)return c.json({error:'Browser request no longer pending'},409);
  if((auth&&choice!=='cancel')||(origin&&choice==='approve'&&!origin.allowed))
    return c.json({error:'Browser origin or sign-in is outside the public read-only policy'},403);
  const [prior]=await database.select({id:workItems.key}).from(workItems).where(and(
    eq(workItems.kind,'managed.browser-decision'),eq(workItems.key,id))).limit(1);
  if(prior)return c.json({error:'Browser decision already submitted or uncertain'},409);
  if(!await authorised(current.scope))return c.json({error:'Bot access revoked'},403);
  const receipt={ownerUserId:owner,channelID,botID,threadID:current.scope.threadId,
   sessionID:current.sessionID,inboxID:current.inbox.id,rootTurnID:current.root,
   requestID:id,kind:auth?'authentication':'origin',
   origin:origin?.request.origin??null,decision:choice};
  const [winner]=await database.insert(workItems).values({
   kind:'managed.browser-decision',key:id,payload:receipt
  }).onConflictDoNothing().returning();
  if(!winner)return c.json({error:'Browser decision was already reserved'},409);
  try{
   if(auth)await provider.cancelBrowserAuthentication(current.sessionID,id,
      'source_browser_'+id);
   else await provider.respondBrowserApproval(current.sessionID,id,choice,
      'source_browser_'+id);
   await database.update(workItems).set({finishedAt:new Date()}).where(and(
    eq(workItems.kind,'managed.browser-decision'),eq(workItems.key,id)));
   return c.json({accepted:true,phase:'submitted'},202);
  }catch{
   await database.update(workItems).set({attempts:100,
    lastError:'Browser request decision outcome uncertain; inspect provider before resubmission'})
    .where(and(eq(workItems.kind,'managed.browser-decision'),eq(workItems.key,id)));
   return c.json({error:'Browser approval acknowledgement uncertain; no automatic replay'},503);
  }
 });

 app.get('/api/delivery/conversations/:id/hosted-activity',requireUser,async c=>{
  const active=await activeHostedRoot(c.var.actor.id,c.req.param('id'),
   c.req.query('agentId')??'');
  if(!active)return c.json({rootTurnId:null,canCancel:false,cancelRequested:false});
  const [record]=await database.select({id:workItems.key,finishedAt:workItems.finishedAt,
    error:workItems.lastError}).from(workItems).where(and(
     eq(workItems.kind,'managed.hosted-cancel'),eq(workItems.key,active.inbox.id))).limit(1);
  let canCancel=false;
  if(!record){
   const current=await provider.retrieveTurn(active.sessionID,active.root);
   canCancel=current.id===active.root&&
    current.session_id===active.sessionID&&current.subagent_id===null&&
    ['in_progress','requires_action','queued','pending'].includes(current.status);
  }
  if(!await authorised(active.scope))return c.json({error:'Source access revoked'},403);
  return c.json({rootTurnId:active.root,canCancel,cancelRequested:!!record,
    requestConfirmed:!!record?.finishedAt,
    outcomeUncertain:!!record?.error});
 });
 app.post('/api/delivery/conversations/:id/hosted-cancel',requireUser,async c=>{
  const owner=c.var.actor.id,channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  let raw:unknown;
  try{raw=await c.req.json();}catch{return c.json({error:'Invalid cancel request'},400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).length!==1||typeof (raw as {rootTurnId?:unknown}).rootTurnId!=='string')
   return c.json({error:'Invalid cancel request'},400);
  const requested=(raw as {rootTurnId:string}).rootTurnId;
  const active=await activeHostedRoot(owner,channelID,botID);
  if(!active||requested!==active.root)return c.json({error:'Turn no longer cancellable'},409);
  const [previous]=await database.select().from(workItems).where(and(
    eq(workItems.kind,'managed.hosted-cancel'),eq(workItems.key,active.inbox.id))).limit(1);
  if(previous)return c.json({error:previous.finishedAt?
    'Cancellation already requested. Refresh to verify final turn state.':
    'Cancellation outcome uncertain. Do not resend.'},409);
  const [session,turns,root]=await Promise.all([
   provider.retrieveSession(active.sessionID),
   provider.listTurns(active.sessionID,{limit:100,order:'desc'}),
   provider.retrieveTurn(active.sessionID,active.root)
  ]);
  if(session.id!==active.sessionID)return c.json({error:'Provider session identity mismatch'},409);
  try{assertCurrentRootForCancellation(active.root,active.sessionID,root,turns,active.inbox.state);}
  catch{return c.json({error:'Provider root is no longer uniquely active'},409);}
  if(!await authorised(active.scope))return c.json({error:'Source access revoked'},403);
  const receipt={ownerUserId:owner,channelId:channelID,botId:botID,
   threadId:active.scope.threadId,inboxID:active.inbox.id,
   sessionID:active.sessionID,rootTurnID:active.root};
  const [winner]=await database.insert(workItems).values({
   kind:'managed.hosted-cancel',key:active.inbox.id,payload:receipt
  }).onConflictDoNothing().returning();
  if(!winner)return c.json({error:'Cancellation already reserved; no automatic replay'},409);
  try{
   // HTTP 202 means event accepted, NOT that the worker or root is stopped.
   await provider.cancelTurn(active.sessionID,'source_cancel_'+active.inbox.id);
   await database.update(workItems).set({finishedAt:new Date()}).where(and(
    eq(workItems.kind,'managed.hosted-cancel'),eq(workItems.key,active.inbox.id)));
   return c.json({accepted:true,phase:'requested',rootTurnId:active.root},202);
  }catch{
   await database.update(workItems).set({
    attempts:100,lastError:'Provider cancel outcome uncertain; inspect original root before any retry'
   }).where(and(eq(workItems.kind,'managed.hosted-cancel'),eq(workItems.key,active.inbox.id)));
   return c.json({error:'Cancellation outcome uncertain; inspect work status'},503);
  }
 });

 // Real provider-managed subagents, scoped to the original Bot/channel's
 // immutable session link. No synthetic tasks, progress percentages, or
 // exposure of their underlying instructions to unrelated team members.
 app.get('/api/delivery/conversations/:id/subagents',requireUser,async c=>{
  const channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  const scope=await scopeFor(c.var.actor.id,channelID,botID);
  if(!scope)return c.json({error:'Source Bot access revoked'},403);
  const link=await links.read({ownerUserId:scope.ownerUserId,channelId:scope.channelId,
    botId:scope.agentId,threadId:scope.threadId});
  if(!link?.providerSessionId)return c.json({subagents:[]});
  const session=await provider.retrieveSession(link.providerSessionId);
  if(session.id!==link.providerSessionId||session.agent?.multi_agent?.enabled!==true)
    return c.json({subagents:[]});
  const result=await provider.listSubagents(link.providerSessionId,{limit:100,order:'desc'});
  if(result.has_more)return c.json({error:'Subagent roster exceeds bounded page'},409);
  const subagents=(result.data as unknown[]).flatMap(raw=>{
   if(!raw||typeof raw!=='object')return[];
   const x=raw as Record<string,unknown>;
   if(x.session_id!==link.providerSessionId||typeof x.id!=='string'||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x.id)||
      !['active','closed'].includes(String(x.status)))return[];
   return[{id:x.id,name:typeof x.name==='string'?x.name.slice(0,80):null,
     status:x.status,openedAt:typeof x.opened_at==='number'?x.opened_at:null}];
  });
  if(!await authorised(scope))return c.json({error:'Source Bot access revoked'},403);
  return c.json({subagents});
 });
 // Read the provider's coordinator work for precisely ONE original source
 // Inbox root. No second agent journal or fabricated percent-progress field.
 app.get('/api/delivery/conversations/:id/delegation-activity',requireUser,async c=>{
  const owner=c.var.actor.id,channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  const scope=await scopeFor(owner,channelID,botID);
  if(!scope)return c.json({error:'Bot unavailable'},403);
  const link=await links.read({ownerUserId:owner,channelId:channelID,
   botId:botID,threadId:scope.threadId});
  if(!link?.providerSessionId)return c.json({rootTurnId:null,events:[],complete:false});
  const [latest]=await database.select({inbox:deliveryInbox,receipt:managedAgentInboxTurns})
   .from(deliveryInbox)
   .innerJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,owner),eq(deliveryInbox.channelId,channelID),
    eq(deliveryInbox.agentId,botID),eq(deliveryInbox.threadId,scope.threadId)))
   .orderBy(desc(deliveryInbox.createdAt)).limit(1);
  if(!latest?.receipt?.rootTurnId||
     latest.receipt.providerSessionId!==link.providerSessionId)
   return c.json({rootTurnId:null,events:[],complete:false});
  const root=await provider.retrieveTurn(link.providerSessionId,latest.receipt.rootTurnId);
  if(root.id!==latest.receipt.rootTurnId||root.session_id!==link.providerSessionId||
     root.subagent_id!==null)return c.json({error:'Invalid delegated root identity'},409);
  const items=await readTurnItems(link.providerSessionId,latest.receipt.rootTurnId);
  const types=new Set(['create_subagent_call','send_subagent_input_call',
   'wait_for_subagents_call','interrupt_subagent_call']);
  const events=items.filter(x=>x&&types.has(x.type)&&
    x.turn_id===latest.receipt.rootTurnId).slice(-50).map(x=>({
     id:typeof x.id==='string'?x.id:null,type:x.type,
     status:typeof x.status==='string'?x.status:null
   }));
  if(!await authorised(scope))return c.json({error:'Original access revoked'},403);
  return c.json({rootTurnId:root.id,events,sourceState:latest.inbox.state,
    providerStatus:root.status,
    complete:latest.inbox.state==='sent'&&root.status==='completed'});
 });
 // Artifacts are read from provider, but source identity and root turn are
 // verified against original Inbox first. No provider URL or credential leaves
 // this endpoint; unsupported provider artifact shapes are not exposed.
 async function sourceArtifacts(owner:string,channelID:string,botID:string){
  const scope=await scopeFor(owner,channelID,botID);
  if(!scope)throw Error('Original source Bot or channel access revoked');
  const link=await links.read({ownerUserId:owner,channelId:channelID,botId:botID,threadId:scope.threadId});
  if(!link?.providerSessionId)return{items:[],sessionID:null};
  const roots=await database.select({root:managedAgentInboxTurns.rootTurnId})
    .from(managedAgentInboxTurns).innerJoin(deliveryInbox,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
    .where(and(eq(deliveryInbox.ownerUserId,owner),eq(deliveryInbox.channelId,channelID),
      eq(deliveryInbox.agentId,botID),eq(deliveryInbox.threadId,scope.threadId),
      eq(managedAgentInboxTurns.providerSessionId,link.providerSessionId),eq(deliveryInbox.state,'sent')))
    .limit(1000);
  const allowedRoots=new Set(roots.flatMap(x=>x.root?[x.root]:[]));
  if(!allowedRoots.size)return{items:[],sessionID:link.providerSessionId};
  const items:ReturnType<typeof projectHostedArtifact>[]=[];
  let after:string|undefined;
  for(let pageNo=0;pageNo<10;pageNo++){
   const page=await provider.listArtifacts(link.providerSessionId,{limit:100,order:'desc',after});
   if(!Array.isArray(page?.data)||page.data.length>100)throw Error('Invalid hosted artifact listing');
   for(const raw of page.data){const artifact=projectHostedArtifact(raw,allowedRoots,link.providerSessionId);
    if(artifact)items.push(artifact);}
   if(!page.has_more){
    if(!await authorised(scope))throw Error('Original Bot permission revoked');
    return{items:items.slice(0,200),sessionID:link.providerSessionId};
   }
   if(typeof page.last_id!=='string'||page.last_id===after)throw Error('Invalid hosted artifact cursor');
   after=page.last_id;
  }
  throw Error('Artifact listing incomplete; refusing truncated authorization');
 }
 // One source-owned, pre-reserved upload, delivered into an existing
 // OpenAI-hosted environment strictly BETWEEN user turns. Never duplicate
 // an uncertain provider POST, including if its HTTP response is lost.
 app.post('/api/delivery/conversations/:id/hosted-files',requireUser,async c=>{
  const channelID=c.req.param('id'),owner=c.var.actor.id,botID=c.req.query('agentId')??'';
  const scope=await scopeFor(owner,channelID,botID);
  if(!scope)return c.json({error:'Bot or conversation unavailable'},403);
  const bot=await profiles.get(actor,botID);
  if(!bot||bot.ownerUserId!==owner||bot.systemOwned||
    !(await hosted.read(owner,botID)).sandbox)
    return c.json({error:'Hosted sandbox is not granted to this Bot'},403);
  let raw:unknown;
  try{raw=await c.req.json();}catch{return c.json({error:'Invalid hosted file payload'},400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return c.json({error:'Invalid hosted file payload'},400);
  const body=raw as Record<string,unknown>;
  const uploadId=body.uploadId,filename=body.filename,data=body.data;
  if(Object.keys(body).some(k=>!['uploadId','filename','data'].includes(k))||
    typeof uploadId!=='string'||!/^[-A-Za-z0-9_]{10,96}$/.test(uploadId)||
    typeof filename!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(filename)||
    filename==='.'||filename==='..'||filename.includes('..')||
    typeof data!=='string'||data.length>1_400_000||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
    return c.json({error:'Invalid or oversized hosted file'},400);
  const bytes=Buffer.from(data,'base64');
  if(bytes.length<1||bytes.length>1024*1024||bytes.toString('base64')!==data)
    return c.json({error:'Invalid hosted file bytes'},400);
  const link=await links.read({ownerUserId:owner,channelId:channelID,botId:botID,threadId:scope.threadId});
  if(!link?.providerSessionId)return c.json({error:'Start a Bot session before uploading files'},409);
  const session=await provider.retrieveSession(link.providerSessionId);
  const env=session.environment as {type?:unknown;id?:unknown;network?:{access?:unknown}}|undefined;
  if(session.id!==link.providerSessionId||session.status!=='idle'||
    Array.isArray(session.required_actions)&&session.required_actions.length>0||
    env?.type!=='openai_hosted'||typeof env.id!=='string'||env.network?.access!=='disabled')
    return c.json({error:'Hosted sandbox not idle or unavailable'},409);
  const environment=await provider.retrieveEnvironment(env.id);
  if(environment?.id!==env.id||environment?.status!=='connected'||environment?.type!=='openai_hosted')
    return c.json({error:'Sandbox environment not connected'},409);
  if(!await authorised(scope))return c.json({error:'Source permission revoked'},403);
  const providerPath='/workspace/'+uploadId+'_'+filename;
  if(providerPath.length>180)return c.json({error:'Invalid hosted file path'},400);
  const integrity=createHash('sha256').update(bytes).digest('hex');
  const receipt={ownerUserId:owner,channelId:channelID,botId:botID,threadId:scope.threadId,
    sessionID:link.providerSessionId,environmentID:env.id,path:providerPath,
    sha256:integrity,bytes:bytes.length};
  const [winner]=await database.insert(workItems).values({kind:'managed.hosted-upload',key:uploadId,payload:receipt})
    .onConflictDoNothing().returning();
  if(!winner){
   // Same client idempotency key is never retransmitted to the provider.
   const [prior]=await database.select().from(workItems).where(and(
     eq(workItems.kind,'managed.hosted-upload'),eq(workItems.key,uploadId))).limit(1);
   if(!prior||stable(prior.payload)!==stable(receipt))
    return c.json({error:'Hosted file identity collision'},409);
   if(prior.finishedAt)return c.json({path:providerPath,bytes:bytes.length,status:'uploaded'});
   return c.json({error:'Previous hosted file submission needs reconciliation; not replayed'},409);
  }
  try{
   // The original source work item was saved BEFORE any remote side effect.
   await provider.createEnvironmentFile(env.id,{path:providerPath,data},'hosted_file_'+uploadId);
   await database.update(workItems).set({finishedAt:new Date()}).where(and(
     eq(workItems.kind,'managed.hosted-upload'),eq(workItems.key,uploadId)));
   return c.json({path:providerPath,bytes:bytes.length,status:'uploaded'},201);
  }catch{
   await database.update(workItems).set({
     attempts:100,lastError:'Hosted file provider outcome uncertain; manual reconciliation required'
   }).where(and(eq(workItems.kind,'managed.hosted-upload'),eq(workItems.key,uploadId)));
   return c.json({error:'Hosted file submission outcome unconfirmed; do not retry with a new ID'},503);
  }
 });
 // A lost upload HTTP receipt is NOT permission to retry. Query OpenAI's own
 // environment file index and compare original immutable path and size. The
 // index does not contain content hashes, so presence is not called success.
 app.get('/api/delivery/conversations/:id/hosted-uploads/:uploadId',requireUser,async c=>{
  const owner=c.var.actor.id,channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  const uploadID=c.req.param('uploadId');
  if(!/^[A-Za-z0-9_-]{10,96}$/.test(uploadID))return c.json({error:'Invalid upload identity'},400);
  const scope=await scopeFor(owner,channelID,botID);
  if(!scope)return c.json({error:'Source Bot access revoked'},403);
  const [receipt]=await database.select().from(workItems).where(and(
    eq(workItems.kind,'managed.hosted-upload'),eq(workItems.key,uploadID))).limit(1);
  const saved=receipt?.payload as {ownerUserId?:string;channelId?:string;botId?:string;
   threadId?:string;environmentID?:string;sessionID?:string;path?:string;bytes?:number}|undefined;
  if(!saved||saved.ownerUserId!==owner||saved.channelId!==channelID||
     saved.botId!==botID||saved.threadId!==scope.threadId)
   return c.json({error:'Source upload not found'},404);
  if(receipt.finishedAt)return c.json({status:'confirmed',path:saved.path,bytes:saved.bytes});
  const link=await links.read({ownerUserId:owner,channelId:channelID,
    botId:botID,threadId:scope.threadId});
  if(!link?.providerSessionId||link.providerSessionId!==saved.sessionID||
    !saved.environmentID||!saved.path)return c.json({status:'unknown',reason:'Source identity changed'});
  const session=await provider.retrieveSession(saved.sessionID);
  if(session.id!==saved.sessionID||session.environment?.id!==saved.environmentID)
   return c.json({status:'unknown',reason:'Environment identity changed'});
  let page:string|undefined;
  for(let i=0;i<10;i++){
   const listed=await provider.listEnvironmentFiles(saved.environmentID,{limit:100,page,path:'/workspace'});
   const matches=(listed.data as unknown[]).filter(v=>
    !!v&&typeof v==='object'&&(v as any).environment_id===saved.environmentID&&
    (v as any).path===saved.path&&(v as any).size_bytes===saved.bytes);
   if(matches.length){
    if(!await authorised(scope))return c.json({error:'Original source grant revoked'},403);
    return c.json({status:'present_unverified',path:saved.path,bytes:saved.bytes,
      reason:'Provider path and size match, but no content checksum is available'});
   }
   if(!listed.has_more)break;
   if(typeof listed.next!=='string'||listed.next===page)
    return c.json({status:'unknown',reason:'Provider file page cursor invalid'});
   page=listed.next;
  }
  return c.json({status:'unknown',reason:'Provider file inventory did not establish upload'});
 });
 app.get('/api/delivery/conversations/:id/artifacts',requireUser,async c=>{
  const channelID=c.req.param('id'),botID=c.req.query('agentId')??'';
  const found=await sourceArtifacts(c.var.actor.id,channelID,botID);
  return c.json({artifacts:found.items});
 });
 app.get('/api/delivery/conversations/:id/artifacts/:artifactId/content',requireUser,async c=>{
  const channelID=c.req.param('id'),botID=c.req.query('agentId')??'',artifactID=c.req.param('artifactId');
  const found=await sourceArtifacts(c.var.actor.id,channelID,botID);
  const owned=found.items.find(x=>x?.id===artifactID);
  if(!owned||!found.sessionID)return c.json({error:'Artifact not available in this original conversation'},404);
  const remote=await provider.retrieveArtifact(found.sessionID,artifactID);
  if(remote?.turn_id!==owned.turnId||remote?.session_id!==found.sessionID||remote?.id!==owned.id||remote?.size_bytes!==owned.sizeBytes)
   return c.json({error:'Artifact provider identity changed'},409);
  const scope=await scopeFor(c.var.actor.id,channelID,botID);
  if(!scope)return c.json({error:'Original access revoked'},403);
  const content=await provider.retrieveArtifactContent(found.sessionID,artifactID,{maxBytes:owned.sizeBytes||8*1024*1024});
  if(!await authorised(scope))return c.json({error:'Access revoked during provider read'},403);
  if(content.bytes.length!==owned.sizeBytes)
   return c.json({error:'Hosted artifact bytes differ from immutable provider metadata'},502);
  return new Response(new Uint8Array(content.bytes),{
   status:200,headers:{'Content-Type':'application/octet-stream',
    'Content-Disposition':'attachment; filename="'+attachmentName(owned.filename)+'"',
    'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store',
    'Content-Security-Policy':"default-src 'none'; sandbox"}
  });
 });
 app.route('/api/agents',createAgentRoutes(profiles,requireUser,false,undefined,undefined,undefined,true));
 app.route('/api/channels',createChannelRoutes(channels,requireUser));
 app.route('/api/delivery',createDeliveryRoutes({store,router,requireUser,scopeFor,
  listConversations:async(owner,cursor)=>{if(owner!==actor.id)throw Error('Unknown owner');return channels.list(actor,{cursor});},
  history:async scope=>{
   if(!await authorised(scope))throw Error('Source access revoked');
   const link=await links.read({ownerUserId:scope.ownerUserId,channelId:scope.channelId,botId:scope.agentId,threadId:scope.threadId});

   // Original Inbox identities gate history. Never expose a session-global
   // message from an incomplete, foreign or uncorrelated provider root.
   const rows=await database.select({inbox:deliveryInbox,receipt:managedAgentInboxTurns})
    .from(deliveryInbox).leftJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
    .where(and(eq(deliveryInbox.ownerUserId,scope.ownerUserId),eq(deliveryInbox.channelId,scope.channelId),eq(deliveryInbox.agentId,scope.agentId)))
    .orderBy(desc(deliveryInbox.createdAt)).limit(100);
   const messages:unknown[]=[];
   for(const {inbox,receipt} of rows.reverse()){
    messages.push({id:inbox.id,type:'message',role:'user',status:'completed',content:[{type:'input_text',text:inbox.text}]});
    if(inbox.state!=='sent'||!receipt?.rootTurnId||receipt.providerSessionId!==link?.providerSessionId)continue;
    const state=receipt.completedOutput;
    if(state?.replyText)messages.push({id:'reply_'+inbox.id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:state.replyText}]});
   }
   if(!await authorised(scope))throw Error('Source access revoked');return{messages};
  }}));

 async function readTurnItems(sessionID:string,turnID:string){
  const items:any[]=[];let after:string|undefined;
  for(let i=0;i<10;i++){
   const page=await provider.listTurnItems(sessionID,turnID,{limit:100,order:'asc',after});
   if(!Array.isArray(page.data))throw Error('Invalid managed turn items');items.push(...page.data);
   if(!page.has_more)return items;
   if(!page.last_id||page.last_id===after)throw Error('Invalid turn cursor');after=page.last_id;
  }throw Error('Managed turn exceeds development history limit');
 }

 // Completed choices are read from the ORIGINAL, finished response work item,
 // never inferred from a rendered button, model text, or unacknowledged iOS draft.
 async function completedSelectionLabel(surface:unknown,owner:{ownerUserId:string;channelId:string;agentId:string}):Promise<string|null>{
  if(!surface||typeof surface!=='object')return null;
  const view=surface as {surfaceID?:string;nodes?:{id:string;kind:string;options?:{id:string;label:string}[]}[]};
  if(typeof view.surfaceID!=='string'||!Array.isArray(view.nodes)||!view.nodes.some(n=>n.kind==='askChoice'))return null;
  const [row]=await database.select({payload:workItems.payload}).from(workItems)
   .where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,view.surfaceID),isNotNull(workItems.finishedAt))).limit(1);
  const receipt=row?.payload as {scope?:{ownerUserId?:string;channelId?:string;agentId?:string};action?:{kind?:string;nodeID?:string;values?:{choice?:string;label?:string}}}|undefined;
  if(receipt?.scope?.ownerUserId!==owner.ownerUserId||receipt.scope?.channelId!==owner.channelId||
     receipt.scope?.agentId!==owner.agentId||receipt.action?.kind!=='choose')return null;
  const node=view.nodes.find(n=>n.kind==='askChoice'&&n.id===receipt.action?.nodeID);
  return node?.options?.find(o=>o.id===receipt.action?.values?.choice&&o.label===receipt.action?.values?.label)?.label??null;
 }

 const visualPath='/api/delivery/conversations/:id/visual';
 async function pendingVisual(owner:string,channelId:string,botId:string,sourceInboxID?:string){
  const scope=await scopeFor(owner,channelId,botId);if(!scope)throw Error('Source access revoked');
  const link=await links.read({ownerUserId:owner,channelId,botId,threadId:scope.threadId});
  if(!link?.providerSessionId)return{surface:null};
  const [current]=await database.select({inbox:deliveryInbox,receipt:managedAgentInboxTurns}).from(deliveryInbox)
   .leftJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,owner),eq(deliveryInbox.channelId,channelId),eq(deliveryInbox.agentId,botId),
    ...(sourceInboxID?[eq(deliveryInbox.id,sourceInboxID)]:[])))
   .orderBy(desc(deliveryInbox.createdAt)).limit(1);
  if(!current||!['accepted','running'].includes(current.inbox.state)||!current.receipt?.rootTurnId||current.receipt.providerSessionId!==link.providerSessionId)return{surface:null};
  const session=await provider.retrieveSession(link.providerSessionId);
  if(session.id!==link.providerSessionId)throw Error('Provider identity mismatch');
  // OpenAI computer-origin and sign-in approvals have their own native
  // source-authorized route. They must not be mistaken for renderer tool calls.
  const calls=(session.required_actions??[]).filter((call:any)=>
    call.turn_id===current.receipt!.rootTurnId&&call.type!=='computer_use_approval_request');
  if(!calls.length)return{surface:null};
  if(calls.length!==1||calls[0].type!=='function_call')throw Error('Unsupported managed tool');
  const call=calls[0];const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  argumentFingerprint(args); // Bound size/depth before rendering.
  if(call.name==='euphoria_connected_mcp'){
   if(!input.plugins)throw Error('MCP access is not configured in this product assembly');
   const exact=managedMCPCall(call);
   if(exact.turn_id!==current.receipt.rootTurnId)throw Error('MCP turn root mismatch');
   const native=await selectNativeReadOnlyMCP(input.plugins,botId,input.nativeReadOnlyMCPOrigins??[]);
   const granted=await authorizeManagedMCP(input.plugins,botId,exact.arguments,native.nativeRefs);
   if(granted.effect==='write'){
    const preview=mcpWritePreview(granted.input.ref,granted.input.args);
    const payload={actorId:owner,botId,threadId:scope.threadId,runId:current.inbox.id,
     channelId,mode:'completed_question' as const,
     question:'Allow this Bot to perform the specified connector write once?',
     why:preview,
     managed:{kind:'connector_write',sessionID:session.id,call:exact,scope}};
    await queue.offer({kind:'person.question',key:exact.call_id,payload});
    const [saved]=await database.select({payload:workItems.payload}).from(workItems)
     .where(and(eq(workItems.kind,'person.question'),eq(workItems.key,exact.call_id))).limit(1);
    if(!saved||stable(saved.payload)!==stable(payload))throw Error('MCP approval identity collision');
   }else{
    const payload={sessionID:session.id,scope,call:exact};
    await queue.offer({kind:'managed.connector-read',key:exact.call_id,payload});
    const [saved]=await database.select({payload:workItems.payload}).from(workItems)
     .where(and(eq(workItems.kind,'managed.connector-read'),eq(workItems.key,exact.call_id))).limit(1);
    if(!saved||stable(saved.payload)!==stable(payload))throw Error('MCP read identity collision');
   }
   return{surface:null};
  }
  if(call.name==='euphoria_ask_person'){
   const savedCall=parseManagedQuestionCall(call);
   if(savedCall.turn_id!==current.receipt.rootTurnId)throw Error('Question root correlation mismatch');
   const ask=parseManagedQuestion(savedCall.arguments);
   const payload={actorId:owner,botId,threadId:scope.threadId,runId:current.inbox.id,
     channelId,mode:'completed_question' as const,...ask,
     managed:{sessionID:session.id,call:savedCall,scope}};
   await queue.offer({kind:'person.question',key:savedCall.call_id,payload});
   const [existing]=await database.select({payload:workItems.payload}).from(workItems)
    .where(and(eq(workItems.kind,'person.question'),eq(workItems.key,savedCall.call_id))).limit(1);
   if(!existing||stable(existing.payload)!==stable(payload))throw Error('Question call identity collision');
   return{surface:null};
  }
  if(call.name!=='euphoria_render_surface')throw Error('Unsupported managed tool');
  let surface;
  try{surface={...normalizeRenderInput(args),surfaceID:call.call_id,revision:0};}
  catch{throw Object.assign(Error('The generated interface did not satisfy the native contract'),{status:502,renderCall:call,renderScope:scope,renderSessionID:session.id});}
  if(!await authorised(scope))throw Error('Source access revoked');
  const [response]=await database.select({error:workItems.lastError}).from(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,call.call_id))).limit(1);
  return{surface,sessionID:session.id,call,scope,submissionUncertain:!!response?.error};
 }
 app.get(visualPath,requireUser,async c=>{
  const result=await pendingVisual(c.var.actor.id,c.req.param('id')??'',c.req.query('agentId')??'');
  const [latest]=await database.select({state:deliveryInbox.state,error:deliveryInbox.error,
    rootTurnID:managedAgentInboxTurns.rootTurnId,providerSessionID:managedAgentInboxTurns.providerSessionId})
   .from(deliveryInbox).leftJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,c.var.actor.id),eq(deliveryInbox.channelId,c.req.param('id')??''),eq(deliveryInbox.agentId,c.req.query('agentId')??'')))
   .orderBy(desc(deliveryInbox.createdAt)).limit(1);
  const saved=await database.select({inboxID:deliveryInbox.id,output:managedAgentInboxTurns.completedOutput}).from(deliveryInbox)
   .innerJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,c.var.actor.id),eq(deliveryInbox.channelId,c.req.param('id')??''),eq(deliveryInbox.agentId,c.req.query('agentId')??''),eq(deliveryInbox.state,'sent')))
   .orderBy(desc(deliveryInbox.createdAt)).limit(100);
  // A closed provider call can leave a source-accepted decision unresolved.
  // Read the original durable work receipt rather than presenting endless Thinking.
  const [unresolved]=await database.select({error:workItems.lastError}).from(workItems)
   .where(and(eq(workItems.kind,'managed.native-response'),isNull(workItems.finishedAt),
    eq(workItems.attempts,100),
    sql`jsonb_typeof(${workItems.payload}->'action') = 'object'`,
    sql`${workItems.payload}->'call'->>'turn_id' = ${latest?.rootTurnID??''}`,
    sql`${workItems.payload}->>'sessionID' = ${latest?.providerSessionID??''}`,
    sql`${workItems.payload}->'scope'->>'ownerUserId' = ${c.var.actor.id}`,
    sql`${workItems.payload}->'scope'->>'channelId' = ${c.req.param('id')??''}`,
    sql`${workItems.payload}->'scope'->>'agentId' = ${c.req.query('agentId')??''}`))
   .orderBy(desc(workItems.createdAt)).limit(1);
  const completedSurfaces=[];
  for(const row of saved.reverse())for(const surface of row.output?.surfaces??[]){
   const selectedLabel=row.output?.selectedLabels?.[(surface as {surfaceID?:string}).surfaceID??'']??
    await completedSelectionLabel(surface,{ownerUserId:c.var.actor.id,channelId:c.req.param('id')??'',agentId:c.req.query('agentId')??''});
   // The choice occurred during this source turn, BEFORE its final assistant reply.
   completedSurfaces.push({afterMessageID:row.inboxID,surface,selectedLabel});
  }
  const visibleScope=result.scope??await scopeFor(c.var.actor.id,c.req.param('id')??'',c.req.query('agentId')??'');
  const pendingQuestion=(await questions.list(c.var.actor.id)).some(q=>q.threadId===visibleScope?.threadId&&
   q.conversationBotId===(c.req.query('agentId')??''));
  return c.json({surface:result.surface,completedSurfaces,pendingQuestion,submissionUncertain:result.submissionUncertain??false,
   deliveryState:latest?.state??null,deliveryError:latest?.error??null,
   decisionRecoveryRequired:latest?.state==='sent'?null:unresolved?.error??null});
 });
 app.post(visualPath+'/actions',requireUser,async c=>{
  const action=await c.req.json();
  const result=await pendingVisual(c.var.actor.id,c.req.param('id')??'',c.req.query('agentId')??'');
  if(!result.surface||!result.call||!result.scope) return c.json({error:'Decision no longer pending'},409);
  if(result.submissionUncertain)return c.json({error:'Previous response outcome uncertain; automatic retry disabled'},503);
  const output=decisionResult(result.surface,action);
  const payload={scope:result.scope,sessionID:result.sessionID,call:result.call,output,action};
  const key=result.call.call_id;
  const [previous]=await database.select().from(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,key))).limit(1);
  if(previous&&stable(previous.payload)!==stable(payload))return c.json({error:'Decision already submitted with different content'},409);
  await queue.offer({kind:'managed.native-response',key,payload});
  const [winner]=await database.select().from(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,key))).limit(1);
  if(!winner||stable(winner.payload)!==stable(payload))return c.json({error:'Decision already submitted with different content'},409);
  return c.json({phase:'accepted'},202);
 });

 // Recovery scans ORIGINAL accepted inbox receipts. Only provider reads and original
 // deduplicated replies happen here; a lost submission is never re-executed.
 async function tick(){
  await router.sweep('delivery.inbound');
  // The phone may be terminated. Inspect ORIGINAL accepted source receipts
  // for newly required person questions in the server worker, not just when
  // a SwiftUI screen happens to GET /visual. Read-only provider inspection
  // never sends a second turn or spends model inference.
  const accepted=await database.select({
    id:deliveryInbox.id,owner:deliveryInbox.ownerUserId,
    channelId:deliveryInbox.channelId,agentId:deliveryInbox.agentId,
  }).from(deliveryInbox)
   .where(eq(deliveryInbox.state,'accepted'))
   .orderBy(desc(deliveryInbox.createdAt)).limit(25);
  for(const inbox of accepted){
   const [openQuestion]=await database.select({id:workItems.key}).from(workItems).where(and(
    eq(workItems.kind,'person.question'),isNull(workItems.finishedAt),
    sql`${workItems.payload}->>'runId' = ${inbox.id}`)).limit(1);
   if(openQuestion)continue;
   try{
    if(await scopeFor(inbox.owner,inbox.channelId,inbox.agentId))
      await pendingVisual(inbox.owner,inbox.channelId,inbox.agentId,inbox.id);
   }catch{
    // Exact provider action cannot yet be read or is invalid. Do not guess
    // a human question or fabricate a provider tool result.
    console.error('Managed accepted turn awaits valid provider question projection');
   }
  }
  for(const item of await queue.claim({kind:'managed.native-response',owner:'managed-native-response',leaseMs:60000,limit:10,maxAttempts:100})){
   // A reclaimed claim may have sent a result before a crash. Never resend it.
   try{
    if(item.attempts!==1)throw Error('Previous response dispatch outcome uncertain');
    const payload=item.payload as unknown as {scope:DeliveryScope;sessionID:string;call:{turn_id:string;call_id:string;name:string;arguments:unknown};output:unknown;refusal?:string};
    if(!await authorised(payload.scope))throw Error('Source access revoked');
    // Only the CURRENT required action authorizes a tool result. A historical
    // function_call in items is not sufficient after provider expiry/cancel.
    const fresh=await provider.retrieveSession(payload.sessionID);
    if(fresh.id!==payload.sessionID)throw Error('Provider session identity mismatch');
    const required=(fresh.required_actions??[]).find((a:any)=>
      a?.type==='function_call'&&a.turn_id===payload.call.turn_id&&
      a.call_id===payload.call.call_id&&a.name===payload.call.name);
    if(!required){
      await database.update(workItems).set({
        attempts:100,
        lastError:'Provider action closed before the accepted answer could be delivered. Decision preserved; a separately authorized continuation is required.'
      }).where(and(eq(workItems.kind,item.kind),eq(workItems.key,item.key)));
      continue; // Never send a fabricated result to a closed provider action.
    }
    const currentArguments=typeof required.arguments==='string'?JSON.parse(required.arguments):required.arguments;
    const acceptedArguments=typeof payload.call.arguments==='string'?JSON.parse(payload.call.arguments):payload.call.arguments;
    if(stable(currentArguments)!==stable(acceptedArguments))throw Error('Pending provider action arguments changed');
    if(payload.refusal)await provider.rejectToolCall(payload.sessionID,{turnID:payload.call.turn_id,callID:payload.call.call_id,name:payload.call.name,error:payload.refusal},'source_action_'+item.key,{expectedArguments:payload.call.arguments});
    else await provider.submitToolResult(payload.sessionID,{turnID:payload.call.turn_id,callID:payload.call.call_id,name:payload.call.name,output:payload.output},'source_action_'+item.key,{expectedArguments:payload.call.arguments});
    await queue.finish({kind:item.kind,key:item.key,owner:'managed-native-response'});
   }catch{
    // Retain a visible unresolved receipt, never finish or replay an uncertain write.
    await database.update(workItems).set({attempts:100,lastError:'Provider response outcome uncertain; manual reconciliation required'})
     .where(and(eq(workItems.kind,item.kind),eq(workItems.key,item.key)));
    console.error('Native result outcome uncertain; original receipt retained');
   }
  }
  // A second process may claim this only after the first lease expires.
  // If the first process crashed after HTTP POST, attempts>1 cannot be
  // replayed, even with the same provider idempotency key.
  // Source-bound read-only MCP calls. The original PluginStore enforces grants,
  // credential access and audits the outcome. A reclaimed claim after an
  // ambiguous provider acknowledgement is NOT executed a second time.
  if(input.plugins)for(const item of await queue.claim({kind:'managed.connector-read',owner:'managed-connector-read',
    leaseMs:60000,limit:10,maxAttempts:100})){
   try{
    if(item.attempts!==1)throw Error('Previous connector read dispatch is uncertain');
    const payload=item.payload as unknown as {sessionID:string;scope:DeliveryScope;call:unknown};
    if(!await authorised(payload.scope))throw Error('MCP Bot or channel revoked');
    const call=managedMCPCall(payload.call);
    const fresh=await provider.retrieveSession(payload.sessionID);
    const current=(fresh.required_actions??[]).find((v:any)=>v.call_id===call.call_id&&v.turn_id===call.turn_id);
    if(fresh.id!==payload.sessionID||!current||(current.name!==call.name||stable(typeof current.arguments==='string'?JSON.parse(current.arguments):current.arguments)!==stable(typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments)))
      throw Error('Provider connector call is no longer pending or has changed');
    const native=await selectNativeReadOnlyMCP(input.plugins,payload.scope.agentId,input.nativeReadOnlyMCPOrigins??[]);
    const granted=await authorizeManagedMCP(input.plugins,payload.scope.agentId,call.arguments,native.nativeRefs);
    if(granted.effect!=='read')throw Error('Connector effect changed; write not permitted in read path');
    const result=await input.plugins.callTool({ref:granted.input.ref,args:granted.input.args,
      botId:payload.scope.agentId,actorId:payload.scope.ownerUserId});
    await provider.submitToolResult(payload.sessionID,{turnID:call.turn_id,callID:call.call_id,
      name:call.name,output:{text:result.text,isError:result.isError}},
      'managed_connector_read_'+item.key,{expectedArguments:call.arguments});
    if(!await queue.finish({kind:item.kind,key:item.key,owner:'managed-connector-read'}))
      throw Error('Connector read lease lost after provider acknowledgement');
   }catch{
    await database.update(workItems).set({attempts:100,
      lastError:'Connector outcome uncertain, revoked or provider action expired; no automatic replay'})
     .where(and(eq(workItems.kind,item.kind),eq(workItems.key,item.key)));
   }
  }
  for(const item of await queue.claim({kind:'person.response',owner:'managed-person-response',
    leaseMs:60000,limit:10,maxAttempts:100})){
   try{
    if(item.attempts!==1)throw Error('Prior person answer dispatch is uncertain');
    const received=item.payload as {ownerUserId?:string;response?:string};
    const [question]=await database.select({payload:workItems.payload,finishedAt:workItems.finishedAt})
     .from(workItems).where(and(eq(workItems.kind,'person.question'),eq(workItems.key,item.key))).limit(1);
    if(!question?.finishedAt||typeof received.response!=='string'||!received.response.trim())
      throw Error('Source decision receipt missing');
    const raw=question.payload as {actorId?:string;botId?:string;channelId?:string;threadId?:string;managed?:unknown};
    const connector=raw.managed&&typeof raw.managed==='object'&&
      'kind' in raw.managed&&(raw.managed as {kind?:unknown}).kind==='connector_write';
    const correlation=connector?null:parseManagedCorrelation(raw.managed);
    const scope=connector?(raw.managed as {scope:DeliveryScope}).scope:correlation!.scope;
    if(received.ownerUserId!==raw.actorId||raw.actorId!==scope.ownerUserId||
      raw.botId!==scope.agentId||raw.channelId!==scope.channelId||
      raw.threadId!==scope.threadId||!await authorised(scope))
      throw Error('Source person answer no longer authorized');
    if(connector){
      if(!input.plugins)throw Error('Original connector store unavailable');
      const source=raw.managed as {sessionID:string;call:unknown;scope:DeliveryScope};
      const call=managedMCPCall(source.call);
      const fresh=await provider.retrieveSession(source.sessionID);
      const current=(fresh.required_actions??[]).find((v:any)=>v.call_id===call.call_id&&v.turn_id===call.turn_id);
      if(fresh.id!==source.sessionID||!current||stable(current)!==stable(call))
       throw Error('Provider connector approval expired or changed');
      const decision=approvedWriteDecision(received.response);
      let result:{text:string;isError:boolean};
      if(decision==='deny')result={text:'User refused this write. No connector effect executed.',isError:true};
      else{
       const grant=await authorizeManagedMCP(input.plugins,scope.agentId,call.arguments);
       if(grant.effect!=='write')throw Error('Connector grant or effect changed after approval');
       result=await input.plugins.callTool({ref:grant.input.ref,args:grant.input.args,
        botId:scope.agentId,actorId:scope.ownerUserId});
      }
      await provider.submitToolResult(source.sessionID,{turnID:call.turn_id,callID:call.call_id,
       name:call.name,output:result},'person_connector_'+item.key,{expectedArguments:call.arguments});
    }else{
      const fresh=await provider.retrieveSession(correlation!.sessionID);
      if(fresh.id!==correlation!.sessionID)throw Error('Provider session identity mismatch');
      const pending=pendingManagedQuestion(fresh.required_actions??[],correlation!);
      if(pending!=='pending')throw Error(pending==='closed'?
        'Provider question closed; human answer saved, authorized new continuation required':
        'Provider question changed; human answer saved, no tool result submitted');
      await provider.submitToolResult(correlation!.sessionID,{
        turnID:correlation!.call.turn_id,callID:correlation!.call.call_id,
        name:correlation!.call.name,output:{answer:received.response}
      },'person_answer_'+item.key,{expectedArguments:correlation!.call.arguments});
    }
    if(!await queue.finish({kind:item.kind,key:item.key,owner:'managed-person-response'}))
      throw Error('Person answer lease lost after submission');
   }catch(error){
    await database.update(workItems).set({attempts:100,
      lastError:error instanceof Error&&(
        error.message.startsWith('Provider question closed')||
        error.message.startsWith('Provider question changed')||
        error.message.startsWith('Source person answer no longer authorized'))
        ?error.message:'Human answer provider dispatch uncertain; manual reconciliation required'
    }).where(and(eq(workItems.kind,item.kind),eq(workItems.key,item.key)));
   }
  }
  const pending=await database.select({inboxId:deliveryInbox.id,sessionID:managedAgentInboxTurns.providerSessionId,rootTurnID:managedAgentInboxTurns.rootTurnId})
   .from(deliveryInbox).innerJoin(managedAgentInboxTurns,eq(deliveryInbox.id,managedAgentInboxTurns.inboxId))
   .where(and(eq(deliveryInbox.ownerUserId,actor.id),eq(deliveryInbox.state,'accepted'))).limit(20);
  for(const row of pending){if(!row.rootTurnID)continue;
   const original=await store.inbox(row.inboxId);
   if(original){try{await pendingVisual(original.ownerUserId,original.channelId,original.agentId);}catch(error){
    const invalid=error as {renderCall?:unknown;renderScope?:unknown;renderSessionID?:string};
    if(invalid.renderCall){
     const key='repair_'+row.rootTurnID;
     const [previous]=await database.select().from(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,key))).limit(1);
     if(previous){await store.setInbox(row.inboxId,'accepted','The generated interface is still unsupported after one correction. No further model retry was made.');continue;}
     await queue.offer({kind:'managed.native-response',key,payload:{scope:invalid.renderScope,sessionID:invalid.renderSessionID,call:invalid.renderCall,
      refusal:'Interface rejected; no user decision occurred. Reissue euphoria_render_surface with valid structured content for the CURRENT user request only. Native surfaces require schemaVersion 1, a valid node graph, and supported node properties. A2UI v0.9 requires catalogId https://a2ui.org/specification/v0_9/basic_catalog.json, a reachable root, and initial bound data. Do not invent options, effects, or human answers.'}});continue;
    }
   }}
   try{await reconcileManagedSourceInbox({...row,rootTurnID:row.rootTurnID,inbox:store,links,provider,
    turnBelongsToInbox:turns.turnBelongsToInbox,authorise:authorised,botAvailable:authorised,
    recordSourceReply:async(scope,text,id)=>{
     const items=await readTurnItems(row.sessionID,row.rootTurnID!);
     const surfaces=items.filter(v=>v.type==='function_call'&&v.name==='euphoria_render_surface'&&v.turn_id===row.rootTurnID).map(call=>{
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;argumentFingerprint(args);
      return{...normalizeRenderInput(args),surfaceID:call.call_id,revision:0};
     });
     const selectedLabels:Record<string,string>={};
     for(const surface of surfaces){
      const selected=await completedSelectionLabel(surface,{ownerUserId:scope.ownerUserId,channelId:scope.channelId,agentId:scope.agentId});
      if(selected)selectedLabels[surface.surfaceID]=selected;
     }
     await database.update(managedAgentInboxTurns).set({completedOutput:{replyText:text,surfaces,selectedLabels}})
      .where(and(eq(managedAgentInboxTurns.inboxId,row.inboxId),eq(managedAgentInboxTurns.rootTurnId,row.rootTurnID!),isNull(managedAgentInboxTurns.completedOutput)));
     await channels.recordActivity(actor,scope.channelId,{text,agentId:scope.agentId,at:new Date()},{id});
    }});}catch{console.error('Managed source receipt awaiting reconciliation');}
  }
 }
 return{app,tick,profiles,channels,store,links,turns};
}

if(import.meta.main){
 if(process.env.NODE_ENV==='production')throw Error('This assembly is loopback development only');
 const {DATABASE_URL,OPENAI_API_KEY,EUPHORIA_DEV_TOKEN}=process.env;
 if(!DATABASE_URL||!OPENAI_API_KEY||!EUPHORIA_DEV_TOKEN)throw Error('Configure development database, server API key and local token');
 const database=createDatabase(DATABASE_URL);
 await synchronizeTenantPackage(database,await loadTenantPackage(new URL('../../../examples/openduet',import.meta.url).pathname));
 const uncapped=process.env.EUPHORIA_ALLOW_ONE_UNCAPPED_JOURNEY==='1';
 const existing=await database.select().from(managedAgentSessionLinks).where(isNotNull(managedAgentSessionLinks.providerSessionId)).limit(1);
 let creations=existing.length;
 const provider=new AgentsClient({apiKey:OPENAI_API_KEY,sessionSpendLimitCents:uncapped?null:25,allowUncappedSession:uncapped,
  fetchImpl:async(url:string,options:RequestInit)=>{
   if(uncapped&&options.method==='POST'&&url==='https://api.openai.com/v1/agents/sessions'){
    if(creations>=1)throw Error('The one authorised development session was already attempted');creations++;
   }
   const response=await fetch(url,options);
   if(!response.ok){const body=await response.clone().json().catch(()=>({}));console.error(JSON.stringify({type:'managed-provider-rejection',status:response.status,code:body.error?.code,param:body.error?.param}));}
   return response;
  }});
 // The original PluginStore/vault is optional in loopback dev, but when it
 // is enabled it is the SAME grant/policy/credential implementation as the
 // production source. A missing or invalid encryption key never leads to a
 // dummy tool or a credential exposed to the managed agent.
 let plugins:PluginStore|undefined;
 if(process.env.EUPHORIA_ENABLE_SOURCE_MCP==='1'){
   const encryptionKey=process.env.KEY_ENCRYPTION_KEY??'';
   const decoded=Buffer.from(encryptionKey,'base64');
   if(decoded.length!==32||decoded.toString('base64')!==encryptionKey)
    throw Error('KEY_ENCRYPTION_KEY must be a base64-encoded 32-byte vault key');
   const policy=createPolicyStore(DEFAULT_ACTION_POLICY,database);
   await policy.load();
   plugins=createPluginStore({
     database,auditStore:createAuditStore(database),
     credentials:createCredentialStore(database),encryptionKey,
     policy:()=>policy.get(),
     brokerProvider:process.env.OPENBOT_BROKER_PROVIDER==='arcade'?'arcade':'composio'
   });
 }
 const skillMappings=parseHostedSkillMappings(process.env.EUPHORIA_HOSTED_SKILL_REFERENCES_JSON);
 const source=await createManagedDevelopment({
   database,provider,token:EUPHORIA_DEV_TOKEN,model:process.env.EUPHORIA_MODEL??'gpt-6-luna',
   plugins,
   nativeReadOnlyMCPOrigins:(process.env.EUPHORIA_NATIVE_READ_MCP_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean),
   allowWebSearch:process.env.EUPHORIA_MANAGED_WEB_SEARCH==='1',
   hostedSkillMappings:skillMappings,
   browserHosts:parsePublicBrowserHosts(process.env.EUPHORIA_PUBLIC_BROWSER_HOSTS)
 });
 const server=Bun.serve({hostname:'127.0.0.1',port:8788,fetch:source.app.fetch});
 const worker=repeatAfterEach(async()=>{try{await source.tick();}catch{console.error('Managed source work awaits recovery');}},1000);
 console.info('Managed source development service listening on loopback:8788');
 for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{worker.stop();server.stop();process.exit(0);});
}
