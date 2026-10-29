import {createHash,randomUUID} from 'node:crypto';
import {fail,identifier,stable,requiresHumanAction} from './visual-contract.mjs';
import {taskStatus} from '../openbot/server/src/openduet/task-status.ts';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const text=(x,n)=>typeof x==='string'&&!!x.trim()&&x.length<=n;
/** Task metadata only. Execution, visual state, accepted inputs and effects retain their existing authorities. */
export function taskServices({db,provider,create,refresh,conversation,locked}){
 db.exec(`CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,creation_id TEXT NOT NULL,title TEXT NOT NULL,instruction TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,resolved_at TEXT,resolved_turn TEXT,resolved_input INTEGER,UNIQUE(owner,request_id));`);
 const lookup=(owner,id)=>{identifier(id);const r=db.prepare('SELECT * FROM tasks WHERE owner=? AND id=?').get(owner,id);if(!r)fail(404,'Task not found');return r;};
 const creation=row=>{const c=db.prepare('SELECT * FROM creations WHERE owner=? AND request_id=?').get(row.owner,row.creation_id);if(c&&(c.payload!==createHash('sha256').update(row.instruction).digest('hex')||c.phase==='cancelled'))fail(409,'Task creation identity conflicts with an existing request');return c;};
 function forSession(owner,id){const row=db.prepare('SELECT t.*,c.payload AS creation_payload FROM tasks t JOIN creations c ON c.owner=t.owner AND c.request_id=t.creation_id WHERE t.owner=? AND c.session_id=?').get(owner,id);return row&&row.creation_payload===createHash('sha256').update(row.instruction).digest('hex')?row:undefined;}
 async function rootTurn(id){
  let after;for(let i=0;i<10;i++){
   const page=await provider.listTurns(id,{limit:20,order:'desc',...(after?{after}:{})});
   if(!page||!Array.isArray(page.data)||page.data.length>20||typeof page.has_more!=='boolean')fail(502,'Invalid task turn history');
   for(const turn of page.data){if(!turn||turn.session_id!==id||turn.object!=='agent.session.turn'||!['queued','in_progress','waiting','completed','failed','cancelled'].includes(turn.status)||typeof turn.subagent_id!=='string'&&turn.subagent_id!==null)fail(502,'Invalid task turn');identifier(turn.id);}
   const root=page.data.find(t=>t.subagent_id===null);if(root)return{id:root.id,status:root.status};
   if(!page.has_more)return null;if(!page.data.length||!page.last_id||after===page.last_id)fail(502,'Invalid task turn cursor');after=identifier(page.last_id);
  }fail(503,'Task turn history exceeds supported page window');
 }
 const inputs=id=>db.prepare('SELECT rowid AS position,* FROM inputs WHERE session_id=? ORDER BY rowid').all(id);
 async function inspect(row){
  const c=creation(row);const base={id:row.id,title:row.title,instruction:row.instruction,sessionID:c?.session_id??null,createdAt:row.created_at,updatedAt:row.updated_at,resolvedAt:null,deliveryPhase:c?.phase??'not_started',pendingNodeIDs:[],failure:null};
  if(!c?.session_id)return{task:{...base,status:'working'},turn:null,history:null};
  const snap=await refresh(c.session_id,row.owner),turn=await rootTurn(c.session_id),history=await conversation.history(c.session_id,row.owner);
  const accepted=inputs(c.session_id).filter(x=>x.kind==='message'&&x.phase==='accepted');
  const newer=accepted.some(x=>x.position>(row.resolved_input??0));
  const resolved=!!row.resolved_at&&!newer&&row.resolved_turn===(turn?.id??null);
  const pending=inputs(c.session_id).some(x=>['submitting','uncertain'].includes(x.phase));
  const awaiting=accepted.some(x=>x.base_turn_id===(turn?.id??null));
  const needs=snap.phase==='waiting'&&!snap.displayAcknowledged&&snap.surface?.nodes.some(requiresHumanAction);
  const working=pending||awaiting||!['idle','completed','accepted'].includes(snap.phase)||!turn||['queued','in_progress','waiting'].includes(turn.status);
  const matches=e=>e.kind==='message'&&e.role==='assistant'&&e.turnID===turn?.id&&e.status==='completed'&&e.text.trim();
  let hasReply=history.entries.some(matches),page=history,scanned=1;const cursors=new Set();
  while(turn?.status==='completed'&&!hasReply&&page.hasMore){
   if(scanned++>=10||!page.nextCursor||cursors.has(page.nextCursor))fail(503,'Task reply history exceeds supported page window');cursors.add(page.nextCursor);
   page=await conversation.history(c.session_id,row.owner,{after:page.nextCursor});hasReply=page.entries.some(matches);
  }
  const failed=turn&&(['failed','cancelled'].includes(turn.status)||turn.status==='completed'&&!hasReply);
  const status=taskStatus({needsInput:needs,working,resolved,failed:!!failed});
  const task={...base,status,resolvedAt:resolved?row.resolved_at:null,deliveryPhase:pending||snap.phase==='uncertain'?'uncertain':c.phase,pendingNodeIDs:needs?snap.surface.nodes.filter(requiresHumanAction).map(n=>n.id):[],failure:failed?(turn.status==='cancelled'?'The task was stopped.':hasReply?'The task could not finish.':'The task ended without a saved reply.'):null};
  return{task,turn,history};
 }
 async function get(owner,id){const row=lookup(owner,id),sid=creation(row)?.session_id;return sid?locked(sid,async()=> (await inspect(row)).task):(await inspect(row)).task;}
 async function start(owner,input){
  if(!exact(input,['id','title','instruction'])||!text(input.title,160)||!text(input.instruction,4000))fail(422,'Invalid task request');identifier(input.id);
  return locked('tasks:'+owner,async()=>{
   const payload=stable({title:input.title.trim(),instruction:input.instruction.trim()});let row=db.prepare('SELECT * FROM tasks WHERE owner=? AND request_id=?').get(owner,input.id);const fresh=!row;
   if(row&&row.payload!==payload)fail(409,'Task request identity reused');
   if(!row){if(db.prepare('SELECT count(*) AS n FROM tasks WHERE owner=?').get(owner).n>=1000)fail(429,'Task limit reached');const now=new Date().toISOString();const id=randomUUID(),key='task_'+createHash('sha256').update(owner+'\0'+input.id).digest('hex');
    db.prepare('INSERT INTO tasks(id,owner,request_id,payload,creation_id,title,instruction,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,input.id,payload,key,input.title.trim(),input.instruction.trim(),now,now);row=lookup(owner,id);}
   if(!creation(row))await locked('create:'+owner,()=>create(owner,{id:row.creation_id,message:row.instruction}));
   const task=await get(owner,row.id);return[fresh?(task.sessionID?201:202):200,{task}];
  });
 }
 async function mutate(owner,id,kind,input){const row=lookup(owner,id),sid=creation(row)?.session_id;
  if(!sid)fail(409,'Task session creation is not confirmed');
  return locked(sid,async()=>{
   const current=await inspect(row);
   if(['reply','cancel'].includes(kind)){
    const operation=await conversation.submit(sid,owner,kind==='reply'?'message':'cancel',input,{baseTurnID:current.turn?.id??null});
    return[202,{task:(await inspect(lookup(owner,id))).task,operation}];
   }
   if(!exact(input,[]))fail(422,'Invalid task resolution');
   if(kind==='resolve'&&current.task.deliveryPhase==='uncertain')fail(409,'Reconcile uncertain task delivery before resolving');
   const now=new Date().toISOString(),frontier=inputs(sid).filter(x=>x.kind==='message'&&x.phase==='accepted').at(-1)?.position??0;
   db.prepare('UPDATE tasks SET resolved_at=?,resolved_turn=?,resolved_input=?,updated_at=? WHERE id=? AND owner=?').run(kind==='resolve'?now:null,kind==='resolve'?current.turn?.id??null:null,kind==='resolve'?frontier:null,now,id,owner);
   return[200,{task:(await inspect(lookup(owner,id))).task}];
  });
 }
 async function report(owner,id,url=new URL('http://localhost')){const row=lookup(owner,id),sid=creation(row)?.session_id;if(!sid)fail(409,'Task session creation is not confirmed');return locked(sid,async()=>{
  const state=await inspect(row);let cursor=Number.MAX_SAFE_INTEGER;const after=url.searchParams.get('decisionsAfter');
  if(after){identifier(after);const position=db.prepare("SELECT rowid AS position FROM actions WHERE session_id=? AND action_id=? AND phase='accepted' AND result IS NOT NULL").get(sid,after);if(!position)fail(404,'Decision cursor not found');cursor=position.position;}
  const records=db.prepare("SELECT action_id,result FROM actions WHERE session_id=? AND phase='accepted' AND result IS NOT NULL AND rowid<? ORDER BY rowid DESC LIMIT 51").all(sid,cursor);
  const historyAfter=url.searchParams.get('historyAfter');const history=historyAfter?await conversation.history(sid,owner,{after:identifier(historyAfter)}):state.history;
  return{report:{task:state.task,messages:history.entries.filter(e=>e.kind==='message'),historyHasMore:history.hasMore,historyCursor:history.nextCursor,decisions:records.slice(0,50).map(r=>({actionID:r.action_id,result:JSON.parse(r.result)})),decisionsHasMore:records.length>50,decisionsCursor:records.length>50?records[49].action_id:null}};
 });}
 async function list(owner,url){const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20;if(!Number.isInteger(limit)||limit<1||limit>20)fail(422,'Invalid task page size');const after=url.searchParams.get('after');let pos=Number.MAX_SAFE_INTEGER;if(after){lookup(owner,after);pos=db.prepare('SELECT rowid AS p FROM tasks WHERE id=?').get(after).p;}
  const rows=db.prepare('SELECT * FROM tasks WHERE owner=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(owner,pos,limit+1);const tasks=[];for(const row of rows.slice(0,limit))tasks.push(await get(owner,row.id));return{tasks,hasMore:rows.length>limit,nextCursor:rows.length>limit?tasks.at(-1).id:null};
 }
 return{start,get,mutate,report,list,forSession};
}
