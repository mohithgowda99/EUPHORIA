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
    UPDATE actions SET phase='uncertain' WHERE phase='submitting';`);
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='active')) db.exec('ALTER TABLE sessions ADD COLUMN active INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='title'))db.exec('ALTER TABLE sessions ADD COLUMN title TEXT');
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='publication'))db.exec('ALTER TABLE sessions ADD COLUMN publication INTEGER NOT NULL DEFAULT 0');
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
    if(actions.some(a=>['uncertain','submitting'].includes(a.phase)))phase='uncertain';
    return {sessionID:row.id,title:row.title,phase,verificationMode,publication,surface:row.surface?JSON.parse(row.surface):null,
      acknowledgedActionIDs:actions.filter(a=>a.phase==='accepted').map(a=>a.action_id),
      rejectedActionIDs:actions.filter(a=>a.phase==='cancelled').map(a=>a.action_id),
      displayAcknowledged:!row.active||actions.some(a=>a.call_id===row.call_id&&a.phase==='accepted'),
      resolvedNodeIDs:row.active?actions.filter(a=>a.call_id===row.call_id&&a.phase==='accepted'&&JSON.parse(row.surface).nodes.some(n=>n.id===a.node_id&&['askChoice','askForm','askApproval'].includes(n.kind))).map(a=>a.node_id):
        (row.surface?JSON.parse(row.surface).nodes.filter(n=>['askChoice','askForm','askApproval'].includes(n.kind)).map(n=>n.id):[])};
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
      const normalized=normalizeRenderInput(call.arguments);
      const fingerprint=stable(call.arguments);
      if(row.call_id===call.call_id&&row.turn_id===call.turn_id){
        if(row.call_payload!==fingerprint)fail(502,'Provider mutated a published call');
      }else{
        // Provider controls call IDs; the gateway owns surface identity and revision.
        const surface={...normalized,surfaceID:row.surface_id,revision:row.revision+1};
        db.prepare('UPDATE sessions SET surface=?,revision=?,turn_id=?,call_id=?,call_payload=? WHERE id=?')
          .run(JSON.stringify(surface),surface.revision,call.turn_id,call.call_id,fingerprint,id);
      }
    }
    db.prepare('UPDATE sessions SET provider_phase=?,active=? WHERE id=?').run(typeof current.status==='string'?current.status:'unknown',calls.length?1:0,id);
    row=owned(id,owner);
    if(row.surface)db.prepare('INSERT OR IGNORE INTO surface_versions VALUES(?,?,?,?,?)').run(row.id,row.revision,row.surface,row.turn_id,row.call_id);
    return snapshot(row);
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
        instructions:'Use euphoria_render_surface to present native gallery results, isolated htmlArtifact content, or one askChoice/askForm/askApproval decision. Use schemaVersion2 for gallery/htmlArtifact nodes. Do not invent a question when showing a result; display-only surfaces receive a native display receipt. Generated HTML has no external network, file, form submission, media permission or native tool authority. Follow its native JSON schema. Alternatively submit {a2ui:[...]} with v0.9 createSurface/updateComponents/updateDataModel messages using the basic catalog. Supported source shape only: Card root, Column, one Text heading,1-8 bound TextField/CheckBox/ChoicePicker controls, one Button with Text label and event action. Values use distinct flat model paths: strings for TextField, booleans for CheckBox, arrays of supported strings for ChoicePicker. Choice variants mutuallyExclusive or multipleSelection are supported. Filters/chip layouts are not supported. No other components, functions or attributes. A source form returns a userAction event with current bound context. Supply a temporary surfaceID and revision 0; the gateway assigns authoritative identity and revisions. After the human answers, continue the task and use a fresh tool call for another decision. Do not execute external effects or claim an approval executed anything.',
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
    // Assigned once before journalling/sending. Repeated action IDs return the existing receipt, never a new event.
    if(output.userAction)output.userAction.timestamp=new Date().toISOString();
    if(db.prepare('SELECT 1 FROM actions WHERE session_id=? AND call_id=?').get(row.id,row.call_id))fail(409,'Decision already submitted');
    db.prepare('INSERT INTO actions VALUES(?,?,?,?,?,?)').run(row.id,action.id,payload,'submitting',action.nodeID,row.call_id);
    try{
      await provider.submitToolResult(row.id,{turnID:row.turn_id,callID:row.call_id,name:'euphoria_render_surface',output},
        'action-'+createHash('sha256').update(row.id+'\0'+action.id).digest('hex'));
      db.prepare("UPDATE actions SET phase='accepted' WHERE session_id=? AND action_id=?").run(row.id,action.id);
    }catch{
      // Even a crash after provider acceptance must not cause a blind replay.
      db.prepare("UPDATE actions SET phase='uncertain' WHERE session_id=? AND action_id=?").run(row.id,action.id);
    }
    return snapshot(owned(row.id,owner));
  }
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
      if(path==='/v1/sessions'&&req.method==='POST'){
        const input=await body(req);
        [status,result]=await locked('create:'+owner,()=>create(owner,input));
      }else if(path==='/v1/sessions'&&req.method==='GET'){
        result={sessions:db.prepare('SELECT * FROM sessions WHERE owner=? ORDER BY rowid DESC LIMIT 50').all(owner).map(snapshot)};
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/events$/.test(path)&&req.method==='GET'){
        await live.serve(path.split('/')[3],owner,req,res);return;
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+$/.test(path)&&req.method==='GET'){
        const id=path.split('/')[3];result=await locked(id,()=>refresh(id,owner));
      }else if(/^\/v1\/sessions\/[A-Za-z0-9_-]+\/(messages|cancel)$/.test(path)&&req.method==='POST'){
        const id=path.split('/')[3];owned(id,owner);const input=await body(req);
        result=await locked(id,()=>conversation.submit(id,owner,path.endsWith('/messages')?'message':'cancel',input));status=202;
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
          for(const id of input.pendingActionIDs)db.prepare('INSERT OR IGNORE INTO actions VALUES(?,?,NULL,?,NULL,NULL)').run(row.id,id,'cancelled');
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
