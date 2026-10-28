import {taskServices} from './tasks.mjs';
import {argumentFingerprint} from './provider-arguments.mjs';
import {liveSnapshots} from './live-snapshots.mjs';
import {normalizeRenderInput,renderInputSchema} from './a2ui-form.mjs';
import {conversations} from './conversations.mjs';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {chmodSync} from 'node:fs';
import {GatewayError,fail,identifier,stable,decisionResult} from './visual-contract.mjs';

/** Single-process gateway. Authentication is mandatory and injected, never inferred from a client owner field. */
export function createGateway({provider,authenticate,databasePath,model,verificationMode="unverified"}){
  if(typeof authenticate!=='function'||!model||!databasePath)throw Error('Gateway configuration required');
  const db=new DatabaseSync(databasePath);
  if(databasePath!==':memory:')chmodSync(databasePath,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,surface_id TEXT UNIQUE NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,surface TEXT,turn_id TEXT,call_id TEXT,call_payload TEXT,provider_phase TEXT,active INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS creations(owner TEXT,request_id TEXT,payload TEXT,phase TEXT,session_id TEXT,PRIMARY KEY(owner,request_id));
    CREATE TABLE IF NOT EXISTS actions(session_id TEXT,action_id TEXT,payload TEXT,phase TEXT,node_id TEXT,call_id TEXT,
      PRIMARY KEY(session_id,action_id),UNIQUE(session_id,call_id));
    UPDATE creations SET phase='uncertain' WHERE phase='creating';
    UPDATE actions SET phase='uncertain' WHERE phase='submitting';
    UPDATE actions SET phase='refusal_uncertain' WHERE phase='refusing';`);
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='active')) db.exec('ALTER TABLE sessions ADD COLUMN active INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='title'))db.exec('ALTER TABLE sessions ADD COLUMN title TEXT');
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='publication'))db.exec('ALTER TABLE sessions ADD COLUMN publication INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(actions)').all().some(c=>c.name==='failure'))db.exec('ALTER TABLE actions ADD COLUMN failure TEXT');
  if(!db.prepare('PRAGMA table_info(actions)').all().some(c=>c.name==='result'))db.exec('ALTER TABLE actions ADD COLUMN result TEXT');
  const locks=new Map();
  async function locked(id,fn){
    const prior=locks.get(id)||Promise.resolve();let release;
    const next=new Promise(r=>release=r);locks.set(id,next);await prior;
    try{return await fn();}finally{release();if(locks.get(id)===next)locks.delete(id);}
  }
  const owned=(id,owner)=>{
    const row=db.prepare('SELECT * FROM sessions WHERE id=? AND owner=?').get(id,owner);
    if(!row)fail(404,'Session not found');return row;
  };
  const conversation=conversations({db,provider,owned});
  function snapshot(row){
    const publication=db.prepare('UPDATE sessions SET publication=publication+1 WHERE id=? RETURNING publication').get(row.id).publication;
    const actions=db.prepare('SELECT * FROM actions WHERE session_id=? ORDER BY rowid').all(row.id);
    let phase=row.active?'waiting':row.provider_phase||'unknown';
    if(row.active&&actions.some(a=>a.call_id===row.call_id&&a.phase==='accepted'))phase='accepted';
    if(row.provider_phase==='render_failed'||actions.some(a=>a.call_id===row.call_id&&['not_sent','rejected'].includes(a.phase)))phase='render_failed';
    if(actions.some(a=>['uncertain','submitting','refusing','refusal_uncertain'].includes(a.phase)))phase='uncertain';
    const failed=phase==='uncertain'?actions.findLast(a=>['uncertain','submitting','refusing','refusal_uncertain'].includes(a.phase)):
      actions.findLast(a=>['refusal_not_sent','refusal_rejected','not_sent','rejected'].includes(a.phase));
    const failure=['uncertain','render_failed'].includes(phase)&&failed?
      (failed.failure?JSON.parse(failed.failure):(JSON.parse(failed.payload)?.failure??{kind:'uncertain',stage:'unknown'})):undefined;
    return {sessionID:row.id,title:row.title,phase,verificationMode,publication,failure,surface:row.surface?JSON.parse(row.surface):null,
      acknowledgedActionIDs:actions.filter(a=>a.phase==='accepted').map(a=>a.action_id),
      rejectedActionIDs:actions.filter(a=>a.phase==='cancelled').map(a=>a.action_id),
      displayAcknowledged:!row.active||actions.some(a=>a.call_id===row.call_id&&a.phase==='accepted'),
      resolvedNodeIDs:row.active?actions.filter(a=>a.call_id===row.call_id&&a.phase==='accepted'&&JSON.parse(row.surface).nodes.some(n=>n.id===a.node_id&&['askChoice','askForm','askApproval','sourceComposition'].includes(n.kind))).map(a=>a.node_id):
        (row.surface?JSON.parse(row.surface).nodes.filter(n=>['askChoice','askForm','askApproval','sourceComposition'].includes(n.kind)).map(n=>n.id):[])};
  }
  async function refresh(id,owner,{signal}={}){
    signal?.throwIfAborted();
    let row=owned(id,owner);
    const current=await provider.retrieveSession(id,{signal});
    signal?.throwIfAborted();
    if(current.id!==id)fail(502,'Provider session mismatch');
    const calls=(current.required_actions||[]).filter(a=>a.type==='function_call');
    if(calls.length>1||calls.some(a=>a.name!=='euphoria_render_surface'))fail(502,'Unsupported pending tool');
    if(calls.length){
      const call=calls[0];identifier(call.turn_id);identifier(call.call_id);
      const fingerprint=argumentFingerprint(call.arguments);
      if(row.call_id===call.call_id&&row.turn_id===call.turn_id&&row.call_payload!==fingerprint)fail(502,'Provider mutated a published call');
      const journalCall=db.prepare('SELECT * FROM actions WHERE session_id=? AND call_id=?').get(id,call.call_id);
      if(journalCall?.phase.startsWith('refus')){
        const recorded=JSON.parse(journalCall.payload);
        if(recorded.turnID!==call.turn_id||recorded.fingerprint!==fingerprint)fail(502,'Provider mutated a refused call');
        return refuseRender(row,call,owner);
      }
      let normalized;
      try{
        let args=call.arguments;if(typeof args==='string'){if(Buffer.byteLength(args)>128*1024)fail(502,'Render arguments too large');try{args=JSON.parse(args);}catch{fail(502,'Invalid render JSON');}}
        normalized=row.call_id===call.call_id&&row.turn_id===call.turn_id?JSON.parse(row.surface):normalizeRenderInput(args,row.surface?JSON.parse(row.surface):undefined);}catch(error){
        if(!(error instanceof GatewayError)||![409,502].includes(error.status)||typeof provider.rejectToolCall!=='function')throw error;
        return refuseRender(row,call,owner,error.status===409?(row.surface&&JSON.parse(row.surface).nodes.some(n=>n.kind==='sourceComposition')?`Source revision changed; nothing was rendered or approved. Use a new call with expectedRevision ${row.revision} for the current source surface.`:'No current source graph exists; nothing was rendered or approved. Use a new call with createSurface, complete updateComponents and updateDataModel, without expectedRevision.'):undefined);
      }
      if(row.call_id===call.call_id&&row.turn_id===call.turn_id){
        if(row.call_payload!==fingerprint)fail(502,'Provider mutated a published call');
      }else{
        // Provider controls call IDs; the gateway owns surface identity and revision.
        const surface={...normalized,surfaceID:row.surface_id,revision:row.revision+1};
        for(const node of surface.nodes)if(node.kind==='sourceComposition')node.composition.revision=surface.revision;
        db.prepare('UPDATE sessions SET surface=?,revision=?,turn_id=?,call_id=?,call_payload=? WHERE id=?')
          .run(JSON.stringify(surface),surface.revision,call.turn_id,call.call_id,fingerprint,id);
      }
    }
    db.prepare('UPDATE sessions SET provider_phase=?,active=? WHERE id=?').run(typeof current.status==='string'?current.status:'unknown',calls.length?1:0,id);
    row=owned(id,owner);
    if(row.surface)db.prepare('INSERT OR IGNORE INTO surface_versions VALUES(?,?,?,?,?)').run(row.id,row.revision,row.surface,row.turn_id,row.call_id);
    return snapshot(row);
  }
  async function refuseRender(row,call,owner,correction){
    const records=db.prepare('SELECT * FROM actions WHERE session_id=?').all(row.id);
    const previous=records.find(a=>a.call_id===call.call_id);
    if(previous){
      if(!['refused','refusing','refusal_uncertain','refusal_not_sent','refusal_rejected'].includes(previous.phase))fail(502,'Invalid published tool contract');
    }else{
      if(records.length>=500||records.filter(a=>a.phase.startsWith('refus')&&JSON.parse(a.payload).turnID===call.turn_id).length>=3)fail(502,'Unsupported render correction limit reached');
      const actionID='refusal-'+createHash('sha256').update(row.id+'\0'+call.turn_id+'\0'+call.call_id).digest('hex');
      const payload=stable({turnID:call.turn_id,fingerprint:argumentFingerprint(call.arguments)});
      const refusal={success:false,error:correction??'Unsupported UI contract; nothing was rendered or approved. Use canonical native JSON, not a mixture of A2UI and native formats. Example: {"schemaVersion":1,"surfaceID":"temporary","revision":0,"nodes":[{"id":"choice","kind":"askChoice","title":"Choose","options":[{"id":"first","label":"First"}]}]}. Use a new tool call with valid arguments.'};
      db.prepare('INSERT INTO actions(session_id,action_id,payload,phase,node_id,call_id,result) VALUES(?,?,?,?,?,?,?)').run(row.id,actionID,payload,'refusing',null,call.call_id,JSON.stringify(refusal));
      try{
        await provider.rejectToolCall(row.id,{turnID:call.turn_id,callID:call.call_id,name:'euphoria_render_surface',error:refusal.error},actionID,{expectedArguments:call.arguments});
        db.prepare("UPDATE actions SET phase='refused' WHERE session_id=? AND action_id=?").run(row.id,actionID);
      }catch(error){
        const stage=['validation','pending_lookup','submission','response','read'].includes(error?.failureStage)?error.failureStage:'unknown';
        const notSent=error?.outcomeUnknown===false&&['validation','pending_lookup','read'].includes(stage);
        const rejected=error?.outcomeUnknown===false&&stage==='submission'&&Number.isInteger(error.status)&&error.status>=400&&error.status<500&&error.status!==408;
        const kind=notSent?'not_sent':rejected?'rejected':'uncertain';
        const failure={kind,stage};
        if(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599)failure.status=error.status;
        db.prepare('UPDATE actions SET phase=?,payload=? WHERE session_id=? AND action_id=?')
          .run('refusal_'+kind,stable({...JSON.parse(payload),failure}),row.id,actionID);
      }
    }
    const saved=db.prepare('SELECT phase FROM actions WHERE session_id=? AND call_id=?').get(row.id,call.call_id);
    const phase=['refusal_not_sent','refusal_rejected'].includes(saved.phase)?'render_failed':'in_progress';
    db.prepare('UPDATE sessions SET active=0,provider_phase=? WHERE id=?').run(phase,row.id);
    return snapshot(owned(row.id,owner));
  }
  async function body(req){
    let size=0,chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>128*1024)fail(413,'Request too large');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON');}
  }
  async function create(owner,input){
    if(!input||Object.keys(input).sort().join(',')!=='id,message'||typeof input.message!=='string'||!input.message.trim()||input.message.length>16000)fail(422,'Invalid session request');
    identifier(input.id);
    const payload=createHash('sha256').update(input.message).digest('hex');
    const old=db.prepare('SELECT * FROM creations WHERE owner=? AND request_id=?').get(owner,input.id);
    if(old){
      if(old.phase==='cancelled')fail(409,'Submission was cancelled');
      if(old.payload!==payload)fail(409,'Submission key reused with different content');
      return [old.session_id?200:202,old.session_id?snapshot(owned(old.session_id,owner)):{sessionID:null,phase:old.phase,surface:null,acknowledgedActionIDs:[],resolvedNodeIDs:[]}];
    }
    db.prepare('INSERT INTO creations VALUES(?,?,?,?,NULL)').run(owner,input.id,payload,'creating');
    const submissionKey='create-'+createHash('sha256').update(owner+'\0'+input.id).digest('hex');
    let session;
    try{
      session=await provider.createSession({model,input:input.message,
        instructions:'Use euphoria_render_surface to present native gallery results, isolated htmlArtifact content, or one askChoice/askForm/askApproval decision. Prefer canonical native JSON for decisions. An askChoice call uses {"schemaVersion":1,"surfaceID":"temporary","revision":0,"nodes":[{"id":"choice","kind":"askChoice","title":"Choose","options":[{"id":"first","label":"First"}]}]}. Do not put native node definitions inside createSurface. A2UI bound forms and explicit nested a2uiGraph operations are supported alternatives, not a mixture with native nodes. Use schemaVersion2 for gallery/htmlArtifact nodes. Do not invent a question when showing a result; display-only surfaces receive a native display receipt. Generated HTML has no external network, file, form submission, media permission or native tool authority. Follow its native JSON schema. Alternatively submit {a2ui:[...]} with v0.9 createSurface/updateComponents/updateDataModel messages using the basic catalog. Supported source shape only: Card root, Column, one Text heading,1-8 bound TextField/CheckBox/ChoicePicker controls, one Button with Text label and event action. Values use distinct absolute model paths with up to8 safe named segments: strings for TextField, booleans for CheckBox, arrays of supported strings for ChoicePicker. Choice variants mutuallyExclusive or multipleSelection are supported. Filters/chip layouts are not supported. No other components, functions or attributes. A source form returns a userAction event with current bound context. Supply a temporary surfaceID and revision 0; the gateway assigns authoritative identity and revisions. For nested native graphs use {a2uiGraph:[v0.9 createSurface/updateComponents/updateDataModel messages]}; supported components are Column, Row, Card, Text, TextField, CheckBox, ChoicePicker and Button with event-only action. Static child references must form one tree rooted at root. Shared absolute object bindings are supported; text/boolean/choice controls only. No layout attributes beyond those described by the supported component contract, functions, scripts or dynamic lists. Every graph must include a Button. Subsequent partial updates use {expectedRevision:current_revision,a2uiGraph:[updateComponents upserts or updateDataModel subtree replacements]}; source surfaceId stays fixed and the gateway assigns outer identity/revision. No client localEdits or approval actions. A graph result preserves the exact userAction and includes sibling euphoria metadata with surfaceID, revision, and sourceSurfaceID; use its revision as expectedRevision on the next partial update. After the human answers, continue the task and use a fresh tool call for another decision. Do not execute external effects or claim an approval executed anything.',
        tools:[{type:'function',name:'euphoria_render_surface',description:'Present a native choice, form or approval and wait for the human response.',parameters:renderInputSchema}]},submissionKey);
      identifier(session.id);
      db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('INSERT INTO sessions(id,owner,surface_id,provider_phase,title) VALUES(?,?,?,?,?)').run(session.id,owner,randomUUID(),'in_progress',input.message.slice(0,120));
        db.prepare("UPDATE creations SET phase='accepted',session_id=? WHERE owner=? AND request_id=?").run(session.id,owner,input.id);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }catch{
      db.prepare("UPDATE creations SET phase='uncertain' WHERE owner=? AND request_id=?").run(owner,input.id);
      return [202,{sessionID:null,phase:'uncertain',surface:null,acknowledgedActionIDs:[],resolvedNodeIDs:[]}];
    }
    return [201,snapshot(owned(session.id,owner))];
  }
  async function act(owner,surfaceID,action){
    const row=db.prepare('SELECT * FROM sessions WHERE surface_id=? AND owner=?').get(surfaceID,owner);
    if(!row)fail(404,'Surface not found');
    if(!row.surface)fail(409,'No active surface');
    const payload=stable(action);
    const previous=db.prepare('SELECT * FROM actions WHERE session_id=? AND action_id=?').get(row.id,String(action?.id));
    if(previous){if(previous.phase==='cancelled')return snapshot(row);if(previous.payload!==payload)fail(409,'Action key reused with different content');return snapshot(row);}
    if(!row.active)fail(409,'Decision is no longer active');
    if(db.prepare('SELECT count(*) AS n FROM actions WHERE session_id=?').get(row.id).n>=500)fail(429,'Session action limit reached');
    const output=decisionResult(JSON.parse(row.surface),action);
    // Recheck the actual pending call before journalling a human result. History never authorizes writes.
    let current;try{current=await provider.retrieveSession(row.id);}catch{fail(503,'Could not verify pending call; nothing was submitted');}
    if(current?.id!==row.id||!(current.required_actions??[]).some(c=>c.type==='function_call'&&c.name==='euphoria_render_surface'&&c.turn_id===row.turn_id&&c.call_id===row.call_id&&argumentFingerprint(c.arguments)===row.call_payload))fail(409,'Pending call changed; nothing was submitted');
    // Assigned once before journalling/sending. Repeated action IDs return the existing receipt, never a new event.
    if(output.userAction)output.userAction.timestamp=new Date().toISOString();
    const graph=JSON.parse(row.surface).nodes.find(n=>n.id===action.nodeID&&n.kind==='sourceComposition');
    if(graph)output.euphoria={contractVersion:1,surfaceID:row.surface_id,revision:row.revision,sourceSurfaceID:graph.composition.surfaceId};
    if(db.prepare('SELECT 1 FROM actions WHERE session_id=? AND call_id=?').get(row.id,row.call_id))fail(409,'Decision already submitted');
    db.prepare('INSERT INTO actions(session_id,action_id,payload,phase,node_id,call_id,result) VALUES(?,?,?,?,?,?,?)').run(row.id,action.id,payload,'submitting',action.nodeID,row.call_id,JSON.stringify(output));
    try{
      await provider.submitToolResult(row.id,{turnID:row.turn_id,callID:row.call_id,name:'euphoria_render_surface',output},
        'action-'+createHash('sha256').update(row.id+'\0'+action.id).digest('hex'),{expectedArguments:JSON.parse(row.call_payload)});
      db.prepare("UPDATE actions SET phase='accepted' WHERE session_id=? AND action_id=?").run(row.id,action.id);
    }catch(error){
      // Keep payload immutable for idempotency; store only bounded certainty metadata separately.
      const failure=classifyFailure(error);
      db.prepare('UPDATE actions SET phase=?,failure=? WHERE session_id=? AND action_id=?').run(failure.kind,JSON.stringify(failure),row.id,action.id);
    }
    return snapshot(owned(row.id,owner));
  }
  const tasks=taskServices({db,provider,create,refresh,conversation,locked});
  const live=liveSnapshots({provider,owned,authenticate,
    readProjection:(id,owner,signal)=>locked(id,async()=>{
      const snapshot=await refresh(id,owner,{signal});
      const history=await conversation.history(id,owner,{signal});
      signal.throwIfAborted();return {snapshot,history,inputs:conversation.receipts(id,owner)};
    })});
  const server=createServer(async(req,res)=>{
    try{
      let owner;try{owner=await authenticate(req);}catch{fail(401,'Authentication required');}
      if(typeof owner!=='string'||!owner||owner.length>256)fail(401,'Authentication required');
      const path=new URL(req.url,'http://localhost').pathname;
      let result,status=200;
      if(path==='/v1/tasks'&&req.method==='POST'){
        [status,result]=await tasks.start(owner,await body(req));
      }else if(path==='/v1/tasks'&&req.method==='GET'){
        result=await tasks.list(owner,new URL(req.url,'http://localhost'));
      }else if(/^\/v1\/tasks\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='GET'){
        result={task:await tasks.get(owner,path.split('/')[3])};
      }else if(/^\/v1\/tasks\/[A-Za-z0-9_-]+\/report$/.test(path)&&req.method==='GET'){
        result=await tasks.report(owner,path.split('/')[3],new URL(req.url,'http://localhost'));
      }else if(/^\/v1\/tasks\/[A-Za-z0-9_-]+\/(reply|cancel|resolve|reopen)$/.test(path)&&req.method==='POST'){
        [status,result]=await tasks.mutate(owner,path.split('/')[3],path.split('/')[4],await body(req));
      }else if(path==='/v1/sessions'&&req.method==='POST'){
        const input=await body(req);
        [status,result]=await locked('create:'+owner,()=>create(owner,input));
      }else if(path==='/v1/sessions'&&req.method==='GET'){
        const url=new URL(req.url,'http://localhost'),limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50;
        if(!Number.isInteger(limit)||limit<1||limit>50)fail(422,'Invalid session page size');
        const after=url.searchParams.get('after');let rows;
        if(after!==null){
          identifier(after);const cursor=db.prepare('SELECT rowid AS position FROM sessions WHERE id=? AND owner=?').get(after,owner);
          if(!cursor)fail(404,'Session not found');
          rows=db.prepare('SELECT * FROM sessions WHERE owner=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(owner,cursor.position,limit+1);
        }else rows=db.prepare('SELECT * FROM sessions WHERE owner=? ORDER BY rowid DESC LIMIT ?').all(owner,limit+1);
        const hasMore=rows.length>limit,visible=rows.slice(0,limit);
        result={sessions:visible.map(snapshot),hasMore,nextCursor:hasMore?visible.at(-1).id:null};
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/events$/.test(path)&&req.method==='GET'){
        await live.serve(path.split('/')[3],owner,req,res);return;
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='GET'){
        const id=path.split('/')[3];result=await locked(id,()=>refresh(id,owner));
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/(messages|cancel)$/.test(path)&&req.method==='POST'){
        const id=path.split('/')[3];owned(id,owner);const input=await body(req);
        const task=tasks.forSession(owner,id);
        if(task){const response=await tasks.mutate(owner,task.id,path.endsWith('/messages')?'reply':'cancel',input);status=response[0];result=response[1].operation;}
        else{result=await locked(id,()=>conversation.submit(id,owner,path.endsWith('/messages')?'message':'cancel',input));status=202;}
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/inputs$/.test(path)&&req.method==='GET'){
        result=conversation.receipts(path.split('/')[3],owner);
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/inputs\/reconcile$/.test(path)&&req.method==='POST'){
        const id=path.split('/')[3];owned(id,owner);const input=await body(req);
        result=await locked(id,()=>conversation.resolve(id,owner,input));
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/items$/.test(path)&&req.method==='GET'){
        const url=new URL(req.url,'http://localhost');
        result=await conversation.history(path.split('/')[3],owner,{after:url.searchParams.get('after')??undefined,
          limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):10});
      }else if(/^\/v1\/requests\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='DELETE'){
        const requestID=identifier(path.split('/')[3]);
        result=await locked('create:'+owner,async()=>{
          const old=db.prepare('SELECT * FROM creations WHERE owner=? AND request_id=?').get(owner,requestID);
          if(!old)db.prepare('INSERT INTO creations VALUES(?,?,NULL,?,NULL)').run(owner,requestID,'cancelled');
          if(old?.session_id)return snapshot(owned(old.session_id,owner));
          return {sessionID:null,phase:old?.phase||'cancelled',surface:null,acknowledgedActionIDs:[],resolvedNodeIDs:[]};
        });
      }else if(/^\/v1\/surfaces\/[A-Za-z0-9_-]+\/reconcile$/.test(path)&&req.method==='POST'){
        const surfaceID=path.split('/')[3];
        const row=db.prepare('SELECT id FROM sessions WHERE surface_id=? AND owner=?').get(surfaceID,owner);
        if(!row)fail(404,'Surface not found');
        const input=await body(req);
        if(!input||Object.keys(input).join(',')!=='pendingActionIDs'||!Array.isArray(input.pendingActionIDs)||input.pendingActionIDs.length>50)fail(422,'Invalid recovery request');
        input.pendingActionIDs.forEach(identifier);
        result=await locked(row.id,async()=>{
          if(db.prepare('SELECT count(*) AS n FROM actions WHERE session_id=?').get(row.id).n+input.pendingActionIDs.length>500)fail(429,'Session action limit reached');
          for(const id of input.pendingActionIDs)db.prepare('INSERT OR IGNORE INTO actions(session_id,action_id,payload,phase,node_id,call_id) VALUES(?,?,NULL,?,NULL,NULL)').run(row.id,id,'cancelled');
          return snapshot(owned(row.id,owner));
        });
      }else if(/^\/v1\/requests\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='GET'){
        const row=db.prepare('SELECT * FROM creations WHERE owner=? AND request_id=?').get(owner,path.split('/')[3]);
        if(!row)fail(404,'Request not found');
        result=row.session_id?snapshot(owned(row.session_id,owner)):{sessionID:null,phase:row.phase,surface:null,acknowledgedActionIDs:[],resolvedNodeIDs:[]};
      }else if(/^\/v1\/surfaces\/[A-Za-z0-9_-]+\/actions$/.test(path)&&req.method==='POST'){
        const surfaceID=path.split('/')[3];
        const row=db.prepare('SELECT id FROM sessions WHERE surface_id=? AND owner=?').get(surfaceID,owner);
        if(!row)fail(404,'Surface not found');
        const input=await body(req);result=await locked(row.id,()=>act(owner,surfaceID,input));status=202;
      }else fail(404,'Route not found');
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
    }catch(error){
      const status=error instanceof GatewayError?error.status:502;
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({error:error instanceof GatewayError?error.message:'Gateway could not complete the request'}));
    }
  });
  server.requestTimeout=35_000;server.headersTimeout=10_000;
  const close=server.close.bind(server);server.close=(...args)=>{live.closeAll();return close(...args);};
  server.on('close',()=>db.close());
  return server;
}

function classifyFailure(error){
 const stage=['validation','pending_lookup','submission','response','read'].includes(error?.failureStage)?error.failureStage:'unknown';
 const notSent=error?.outcomeUnknown===false&&['validation','pending_lookup','read'].includes(stage);
 const rejected=error?.outcomeUnknown===false&&stage==='submission'&&Number.isInteger(error.status)&&error.status>=400&&error.status<500&&error.status!==408;
 const failure={kind:notSent?'not_sent':rejected?'rejected':'uncertain',stage};
 if(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599)failure.status=error.status;
 return failure;
}
