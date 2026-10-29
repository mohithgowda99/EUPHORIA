import {test,expect} from 'bun:test';
import {createDatabase} from '../src/db/client';
import {createManagedDevelopment} from '../src/agents/managed-development';
import {DEV_ACTOR} from '../src/auth/dev-actor';
import {and,eq} from 'drizzle-orm';
import {workItems} from '../src/db/schema/work';
const address=process.env.TEST_DATABASE_URL;
test.skipIf(!address)('original stores and queue execute managed delivery and restore actual history without Intelligence',async()=>{
 const database=createDatabase(address!);let creates=0,offline=false;
 const sessionID='sess_'+crypto.randomUUID().replaceAll('-',''),rootID='turn_'+crypto.randomUUID().replaceAll('-','');
 const provider={
  async createSessionStream(){creates++;return{close(){},events:(async function*(){
   yield{type:'agent.session.created',event_id:'evt_'+sessionID,session:{id:sessionID}};
   yield{type:'agent.session.turn.created',event_id:'evt_'+rootID,session_id:sessionID,turn_id:rootID,turn:{id:rootID,session_id:sessionID,subagent_id:null}};
  })()};},
  async retrieveSession(){if(offline)throw Error('Provider unavailable');return{id:sessionID,status:'idle',required_actions:[]};},
  async retrieveTurn(){if(offline)throw Error('Provider unavailable');return{id:rootID,session_id:sessionID,subagent_id:null,status:'completed'};},
  async listTurnItems(){return{data:[{id:'answer',turn_id:rootID,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Verified answer'}]}],has_more:false};},
  async listItems(){return this.listTurnItems();},
 };
 const token='development-test-only-12345678901234567890';
 try{
 const source=await createManagedDevelopment({database,provider,token,model:'test-only'});
 const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
 const bot=await source.profiles.create(actor,{name:'Proof',title:'Assistant',roleDescription:'Answer correctly',systemPrompt:'Answer correctly',visibility:'private'});
 const channel=await source.channels.create(actor,[bot.id]);
 const headers={'cookie':'euphoria-development='+token,'content-type':'application/json'};
 const path='/api/delivery/conversations/'+channel.id;
 expect((await source.app.request(path+'/history?agentId='+bot.id)).status).toBe(401);
 const externalId=crypto.randomUUID();
 const post=()=>source.app.request(path+'/messages',{method:'POST',headers,body:JSON.stringify({agentId:bot.id,text:'Explain the result',externalId})});
 expect((await post()).status).toBe(202);await source.tick();expect(creates).toBe(1);
 expect((await post()).status).toBe(202);await source.tick();expect(creates).toBe(1);
 offline=true;
 const reopened=await createManagedDevelopment({database,provider,token,model:'test-only'});
 const response=await reopened.app.request(path+'/history?agentId='+bot.id,{headers});
 expect(response.status).toBe(200);
 expect((await response.json()).history.messages.find((v:any)=>v.role==='assistant').content[0].text).toBe('Verified answer');
 }finally{await database.$client.close();}
});

for(const fails of [false,true])test.skipIf(!address)('native decision uses original receipts; uncertain='+fails,async()=>{
 const database=createDatabase(address!);const sessionID='sess_'+crypto.randomUUID().replaceAll('-','');
 const callID='call_'+crypto.randomUUID().replaceAll('-','');
 let results=0;let pending=true;
 const args={schemaVersion:1,surfaceID:'temporary',revision:0,nodes:[{id:'choice',kind:'askChoice',title:'Choose a plan',options:[{id:'pull',label:'Pull day'}]}]};
 const call={type:'function_call',name:'euphoria_render_surface',turn_id:'turn_native',call_id:callID,arguments:args};
 const provider={
  async createSessionStream(){return{close(){},events:(async function*(){yield{type:'agent.session.created',event_id:'evt_'+sessionID,session:{id:sessionID}};yield{type:'agent.session.turn.created',event_id:'evt_'+callID,session_id:sessionID,turn_id:'turn_native',turn:{id:'turn_native',session_id:sessionID,subagent_id:null}};})()};},
  async retrieveSession(){return{id:sessionID,status:pending?'waiting':'idle',required_actions:pending?[call]:[]};},
  async retrieveTurn(){return{id:'turn_native',session_id:sessionID,subagent_id:null,status:pending?'waiting':'completed'};},
  async listTurnItems(){return{data:pending?[]:[call,{type:'message',role:'assistant',status:'completed',turn_id:'turn_native',content:[{type:'output_text',text:'Pull day saved'}]}],has_more:false};},
  async listItems(){return this.listTurnItems();},
  async submitToolResult(_session:unknown,result:{output:unknown}){expect(result.output).toEqual({choice:'pull',label:'Pull day'});results++;if(fails)throw Error('Response lost after dispatch');pending=false;},
 };
 const token='development-test-only-12345678901234567890';
 try{
 const source=await createManagedDevelopment({database,provider,token,model:'test-only'});
 const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
 const bot=await source.profiles.create(actor,{name:'Interactive',title:'Assistant',roleDescription:'Ask for a choice',systemPrompt:'Ask for a choice',visibility:'private'});
 const channel=await source.channels.create(actor,[bot.id]);
 const headers={cookie:'euphoria-development='+token,'content-type':'application/json'};
 const path='/api/delivery/conversations/'+channel.id;
 await source.app.request(path+'/messages',{method:'POST',headers,body:JSON.stringify({agentId:bot.id,text:'Help choose a plan',externalId:crypto.randomUUID()})});
 await source.tick();
 const visual=await source.app.request(path+'/visual?agentId='+bot.id,{headers});expect(visual.status).toBe(200);
 const surface=(await visual.json()).surface;expect(surface.nodes[0].title).toBe('Choose a plan');
 // A second server instance must still expose the exact pending provider call.
 // This is a restart test, NOT evidence the provider preserves it for hours.
 const beforeAnswerRestart=await createManagedDevelopment({database,provider,token,model:'test-only'});
 const restoredPending=await beforeAnswerRestart.app.request(path+'/visual?agentId='+bot.id,{headers});
 expect(restoredPending.status).toBe(200);
 expect((await restoredPending.json()).surface.surfaceID).toBe(callID);
 const before=await source.app.request(path+'/history?agentId='+bot.id,{headers});
 const originalHistory=(await before.json()).history.messages;
 expect(originalHistory.some((v:any)=>v.role==='assistant')).toBe(false);
 const action={id:crypto.randomUUID(),surfaceID:surface.surfaceID,expectedRevision:surface.revision,nodeID:'choice',kind:'choose',values:{choice:'pull',label:'Pull day'}};
 const submit=(value:unknown)=>source.app.request(path+'/visual/actions?agentId='+bot.id,{method:'POST',headers,body:JSON.stringify(value)});
 expect((await submit({...action,values:{choice:'invented',label:'Bad'}})).status).toBe(422);
 expect(results).toBe(0);
 expect((await submit(action)).status).toBe(202);
 expect((await submit(action)).status).toBe(202);
 await source.tick();expect(results).toBe(1);
 const restored=await createManagedDevelopment({database,provider,token,model:'test-only'});
 await restored.tick();expect(results).toBe(1);
 // Simulate queue retention for an accepted decision: the completed source
 // projection, not a temporary work item, must retain the chosen label.
 if(!fails)await database.delete(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,callID)));
 const reopened=await restored.app.request(path+'/visual?agentId='+bot.id,{headers});expect(reopened.status).toBe(200);
 const saved=await reopened.json();
 if(fails)expect(saved.surface.surfaceID).toBe(callID);
 else {
  expect(saved.completedSurfaces[0].surface.surfaceID).toBe(callID);
  expect(saved.completedSurfaces[0].afterMessageID).toBe(originalHistory[0].id);
  expect(saved.completedSurfaces[0].selectedLabel).toBe('Pull day');
 }
 if(fails){expect(saved.submissionUncertain).toBe(true);expect((await submit(action)).status).toBe(503);}
 else expect(saved.surface).toBeNull();
 }finally{await database.$client.close();}
});

test.skipIf(!address)('a definitive provider rejection stops working and preserves the original user message',async()=>{
 const database=createDatabase(address!);const token='development-test-only-12345678901234567890';
 const provider={async createSessionStream(){const error=Object.assign(Error('Agents request rejected (400)'),{status:400,outcomeUnknown:false});throw error;}};
 try{
  const source=await createManagedDevelopment({database,provider,token,model:'test-only'});
  const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
  const bot=await source.profiles.create(actor,{name:'Rejected',title:'Assistant',roleDescription:'Test rejection',systemPrompt:'Test rejection',visibility:'private'});
  const channel=await source.channels.create(actor,[bot.id]);
  const headers={cookie:'euphoria-development='+token,'content-type':'application/json'};const path='/api/delivery/conversations/'+channel.id;
  await source.app.request(path+'/messages',{method:'POST',headers,body:JSON.stringify({agentId:bot.id,text:'Keep this request',externalId:crypto.randomUUID()})});
  await source.tick().catch(()=>{});
  const response=await source.app.request(path+'/visual?agentId='+bot.id,{headers});const result=await response.json();
  expect(result.deliveryState).toBe('failed');expect(result.deliveryError).toBeTruthy();
  const history=await source.app.request(path+'/history?agentId='+bot.id,{headers});
  expect((await history.json()).history.messages[0].content[0].text).toBe('Keep this request');
 }finally{await database.$client.close();}
});

test.skipIf(!address)('invalid native generation receives at most one durable correction and never becomes a human decision',async()=>{
 const database=createDatabase(address!);let corrected=false,rejects=0;
 const sessionID='sess_'+crypto.randomUUID().replaceAll('-',''),rootID='turn_'+crypto.randomUUID().replaceAll('-','');
 const call=()=>({type:'function_call',turn_id:rootID,call_id:corrected?'call_valid':'call_invalid',name:'euphoria_render_surface',arguments:corrected?{schemaVersion:1,surfaceID:'temp',revision:0,nodes:[{id:'day',kind:'askChoice',title:'Choose',options:[{id:'pull',label:'Pull day'}]}]}:{a2uiGraph:[]}});
 const provider={
  async createSessionStream(){return{close(){},events:(async function*(){yield{type:'agent.session.created',event_id:'evt_'+sessionID,session:{id:sessionID}};yield{type:'agent.session.turn.created',event_id:'evt_'+rootID,session_id:sessionID,turn_id:rootID,turn:{id:rootID,session_id:sessionID,subagent_id:null}};})()};},
  async retrieveSession(){return{id:sessionID,status:'requires_action',required_actions:[call()]};},
  async retrieveTurn(){return{id:rootID,session_id:sessionID,subagent_id:null,status:'in_progress'};},
  async listTurnItems(){return{data:[],has_more:false};},
  async rejectToolCall(_session:unknown,input:{error:string}){expect(input.error).toContain('no user decision');expect(input.error).not.toContain('Choose a workout day');rejects++;corrected=true;},
 };
 const token='development-test-only-12345678901234567890';
 try{
  const source=await createManagedDevelopment({database,provider,token,model:'test-only'}),actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
  const bot=await source.profiles.create(actor,{name:'Repair',title:'Assistant',roleDescription:'Ask a choice',systemPrompt:'Ask a choice',visibility:'private'});
  const channel=await source.channels.create(actor,[bot.id]);const headers={cookie:'euphoria-development='+token,'content-type':'application/json'},path='/api/delivery/conversations/'+channel.id;
  await source.app.request(path+'/messages',{method:'POST',headers,body:JSON.stringify({agentId:bot.id,text:'Ask once',externalId:crypto.randomUUID()})});
  await source.tick();await source.tick();expect(rejects).toBe(1);
  const response=await source.app.request(path+'/visual?agentId='+bot.id,{headers});expect((await response.json()).surface.nodes[0].kind).toBe('askChoice');
  await source.tick();expect(rejects).toBe(1);
 }finally{await database.$client.close();}
});

test.skipIf(!address)('closed provider action preserves one decision without sending a stale tool result',async()=>{
 const database=createDatabase(address!);
 const sessionID='sess_'+crypto.randomUUID().replaceAll('-',''),rootID='turn_'+crypto.randomUUID().replaceAll('-',''),callID='call_'+crypto.randomUUID().replaceAll('-','');
 const token='development-test-only-12345678901234567890';
 let pending=true,remoteSubmissions=0;
 const args={schemaVersion:1,surfaceID:'temporary',revision:0,nodes:[{id:'choice',kind:'askChoice',title:'Which?',options:[{id:'yes',label:'Yes'}]}]};
 const call={type:'function_call',name:'euphoria_render_surface',turn_id:rootID,call_id:callID,arguments:args};
 const provider={
  async createSessionStream(){return{close(){},events:(async function*(){
   yield{type:'agent.session.created',event_id:'evt_'+sessionID,session:{id:sessionID}};
   yield{type:'agent.session.turn.created',event_id:'evt_'+rootID,session_id:sessionID,turn_id:rootID,turn:{id:rootID,session_id:sessionID,subagent_id:null}};
  })()};},
  async retrieveSession(){return{id:sessionID,status:pending?'requires_action':'idle',required_actions:pending?[call]:[]};},
  async retrieveTurn(){return{id:rootID,session_id:sessionID,subagent_id:null,status:pending?'in_progress':'completed'};},
  async listTurnItems(){return{data:[],has_more:false};},
  async listItems(){return this.listTurnItems();},
  async submitToolResult(){remoteSubmissions++;},
 };
 try{
  const source=await createManagedDevelopment({database,provider,token,model:'fixture-only'});
  const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
  const bot=await source.profiles.create(actor,{name:'Closed action',title:'Assistant',roleDescription:'Ask once',systemPrompt:'Ask once',visibility:'private'});
  const channel=await source.channels.create(actor,[bot.id]);
  const path='/api/delivery/conversations/'+channel.id;
  const headers={cookie:'euphoria-development='+token,'content-type':'application/json'};
  const query='?agentId='+bot.id;
  expect((await source.app.request(path+'/messages',{method:'POST',headers,body:JSON.stringify({agentId:bot.id,text:'Ask something',externalId:crypto.randomUUID()})})).status).toBe(202);
  await source.tick();
  const saved=(await (await source.app.request(path+'/visual'+query,{headers})).json()).surface;
  expect(saved.surfaceID).toBe(callID);
  const action={id:crypto.randomUUID(),surfaceID:callID,expectedRevision:0,nodeID:'choice',kind:'choose',values:{choice:'yes',label:'Yes'}};
  expect((await source.app.request(path+'/visual/actions'+query,{method:'POST',headers,body:JSON.stringify(action)})).status).toBe(202);
  pending=false; // The exact required_action closed while the original answer was queued.
  await source.tick();
  expect(remoteSubmissions).toBe(0);
  const [receipt]=await database.select().from(workItems).where(and(eq(workItems.kind,'managed.native-response'),eq(workItems.key,callID)));
  expect(receipt.finishedAt).toBeNull();
  expect((receipt.payload as { action: { values: { choice: string } } }).action.values.choice).toBe('yes');
  expect(receipt.lastError).toContain('Provider action closed');
  const reboot=await createManagedDevelopment({database,provider,token,model:'fixture-only'});
  await reboot.tick();
  expect(remoteSubmissions).toBe(0);
  const recovery=await reboot.app.request(path+'/visual'+query,{headers});
  expect(recovery.status).toBe(200);
  expect((await recovery.json()).decisionRecoveryRequired).toContain('Provider action closed');
  expect((await reboot.app.request(path+'/visual/actions'+query,{method:'POST',headers,body:JSON.stringify(action)})).status).toBe(409);
 }finally{await database.$client.close();}
});
