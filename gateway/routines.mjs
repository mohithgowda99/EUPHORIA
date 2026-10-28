import {CronExpressionParser} from 'cron-parser';
import {createHash,randomUUID} from 'node:crypto';
import {fail,identifier,stable} from './visual-contract.mjs';
const FLOOR=900000,GRACE=600000;
export function nextRoutineRun(cron,timezone,after){
 if(typeof cron!=='string'||cron.length>200||cron.trim().split(/\s+/).length!==5||typeof timezone!=='string'||timezone.length>100||!Number.isFinite(after))fail(422,'Invalid routine schedule');
 try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{fail(422,'Unknown routine timezone');}
 try{
  const scan=CronExpressionParser.parse(cron,{tz:timezone,currentDate:new Date('2024-01-01T00:00:00Z')});let previous=scan.next().getTime();
  for(let i=1;i<200;i++){const n=scan.next().getTime();if(n-previous<FLOOR)fail(422,'Routines may run at most every15 minutes');previous=n;}
  const expression=CronExpressionParser.parse(cron,{tz:timezone,currentDate:new Date(after)}),first=expression.next().getTime();if(expression.next().getTime()-first<FLOOR)fail(422,'Routines may run at most every15 minutes');return first;
 }catch(e){if(e.status)throw e;fail(422,'Unreadable routine schedule');}
}
const frame=instruction=>'One of your routines is firing right now, on its schedule, and this is that firing.\nCarry out the instruction below in this turn: do the work now, then say what happened.\nDo not create, list or change any routine unless the instruction itself asks you to.\n\n'+instruction;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
export function routineServices({db,tasks,locked,clock,shouldStop=()=>false}){
 db.exec(`CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,title TEXT NOT NULL,instruction TEXT NOT NULL,cron TEXT NOT NULL,timezone TEXT NOT NULL,enabled INTEGER NOT NULL,revision INTEGER NOT NULL,next_run INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT0,UNIQUE(owner,request_id));
 CREATE TABLE IF NOT EXISTS routine_runs(routine_id TEXT,due INTEGER,revision INTEGER,phase TEXT NOT NULL,task_id TEXT,PRIMARY KEY(routine_id,due));
 CREATE TABLE IF NOT EXISTS routine_worker(id INTEGER PRIMARY KEY,last_sweep INTEGER);
 UPDATE routine_runs SET phase='uncertain' WHERE phase='dispatching';`.replace('DEFAULT0','DEFAULT 0'));
 if(!db.prepare('PRAGMA table_info(routine_runs)').all().some(c=>c.name==='request_id'))db.exec('ALTER TABLE routine_runs ADD COLUMN request_id TEXT');
 db.exec("UPDATE routine_runs SET task_id=(SELECT t.id FROM tasks t JOIN routines r ON t.owner=r.owner WHERE r.id=routine_runs.routine_id AND t.request_id=routine_runs.request_id) WHERE task_id IS NULL AND request_id IS NOT NULL");
 const lookup=(owner,id)=>{identifier(id);const r=db.prepare('SELECT * FROM routines WHERE id=? AND owner=? AND deleted=0').get(id,owner);if(!r)fail(404,'Routine not found');return r;};
 const view=r=>({id:r.id,title:r.title,instruction:r.instruction,cron:r.cron,timezone:r.timezone,enabled:!!r.enabled,revision:r.revision,nextRunAt:new Date(r.next_run).toISOString()});
 const cap=owner=>{if(db.prepare('SELECT count(*) AS n FROM routines WHERE owner=? AND enabled=1 AND deleted=0').get(owner).n>=20)fail(429,'At most20 enabled routines per owner');};
 function validate(input){if(!text(input.title,160)||!text(input.instruction,3500)||typeof input.enabled!=='boolean')fail(422,'Invalid routine');return nextRoutineRun(input.cron,input.timezone,clock());}
 async function create(owner,input){
  if(!object(input)||Object.keys(input).sort().join(',')!=='cron,enabled,id,instruction,timezone,title')fail(422,'Invalid routine request');identifier(input.id);const next=validate(input),payload=stable(input);
  return locked('routines:'+owner,async()=>{let row=db.prepare('SELECT * FROM routines WHERE owner=? AND request_id=?').get(owner,input.id);if(row){if(row.payload!==payload||row.deleted)fail(409,'Routine identity reused');return[200,{routine:view(row)}];}
   if(input.enabled)cap(owner);if(db.prepare('SELECT count(*) AS n FROM routines WHERE owner=?').get(owner).n>=1000)fail(429,'Routine record limit reached');
   const id=randomUUID();db.prepare('INSERT INTO routines(id,owner,request_id,payload,title,instruction,cron,timezone,enabled,revision,next_run) VALUES(?,?,?,?,?,?,?,?,?,1,?)').run(id,owner,input.id,payload,input.title,input.instruction,input.cron,input.timezone,input.enabled?1:0,next);return[201,{routine:view(lookup(owner,id))}];
  });
 }
 async function change(owner,id,input,remove=false){return locked('routines:'+owner,async()=>{const row=lookup(owner,id);if(!object(input)||!Number.isInteger(input.expectedRevision)||Object.keys(input).some(k=>!['expectedRevision','title','instruction','cron','timezone','enabled'].includes(k)))fail(422,'Invalid routine update');if(input.expectedRevision!==row.revision)fail(409,'Routine revision changed');if(remove&&Object.keys(input).length!==1)fail(422,'Invalid routine deletion');const next={...row,...input,enabled:remove?false:(input.enabled??!!row.enabled)};validate(next);if(next.enabled&&!row.enabled)cap(owner);
   const stamp=next.enabled&&(!row.enabled||input.cron!==undefined||input.timezone!==undefined)?nextRoutineRun(next.cron,next.timezone,clock()):row.next_run;
   db.prepare('UPDATE routines SET title=?,instruction=?,cron=?,timezone=?,enabled=?,revision=revision+1,next_run=?,deleted=? WHERE id=? AND owner=? AND revision=?').run(next.title,next.instruction,next.cron,next.timezone,next.enabled?1:0,stamp,remove?1:0,id,owner,row.revision);return{routine:view({...next,revision:row.revision+1,next_run:stamp}),deleted:remove};
 });}
 function worker(){const r=db.prepare('SELECT last_sweep FROM routine_worker WHERE id=1').get();return{phase:!r?'never_seen':clock()-r.last_sweep>FLOOR?'stale':'active',lastSweepAt:r?new Date(r.last_sweep).toISOString():null};}
 function list(owner){return{routines:db.prepare('SELECT * FROM routines WHERE owner=? AND deleted=0 ORDER BY rowid DESC').all(owner).map(view),worker:worker()};}
 function runs(owner,id,url){lookup(owner,id);const before=url.searchParams.get('before'),limit=50;let cursor=Number.MAX_SAFE_INTEGER;if(before!==null){cursor=Number(before);if(!Number.isSafeInteger(cursor)||cursor<0)fail(422,'Invalid run cursor');}
  const rows=db.prepare('SELECT * FROM routine_runs WHERE routine_id=? AND due<? ORDER BY due DESC LIMIT ?').all(id,cursor,limit+1);return{runs:rows.slice(0,limit).map(r=>({dueAt:new Date(r.due).toISOString(),revision:r.revision,phase:r.phase,taskID:r.task_id})),hasMore:rows.length>limit,nextCursor:rows.length>limit?String(rows[limit-1].due):null};}
 async function sweep(){const now=clock();if(!Number.isFinite(now))throw Error('Invalid worker clock');db.prepare('INSERT INTO routine_worker VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_sweep=excluded.last_sweep').run(now);const rows=db.prepare('SELECT * FROM routines WHERE enabled=1 AND deleted=0 AND next_run<=? ORDER BY next_run LIMIT50'.replace('LIMIT50','LIMIT 50')).all(now);const result={dispatched:[],skipped:[],uncertain:[]};
  for(const prior of rows){if(shouldStop())break;await locked('routines:'+prior.owner,async()=>{
   if(shouldStop())return;const claimTime=clock();if(!Number.isFinite(claimTime))throw Error('Invalid worker clock');
   const row=db.prepare('SELECT * FROM routines WHERE id=? AND enabled=1 AND deleted=0 AND next_run=? AND revision=?').get(prior.id,prior.next_run,prior.revision);if(!row)return;
   let next;try{next=nextRoutineRun(row.cron,row.timezone,claimTime);}catch{db.prepare('UPDATE routines SET enabled=0,revision=revision+1 WHERE id=?').run(row.id);return;}
   const phase=claimTime-row.next_run>GRACE?'skipped':'dispatching';
   const key='routine_'+createHash('sha256').update(row.id+'\0'+new Date(row.next_run).toISOString().slice(0,16)+'Z').digest('hex');
   db.exec('BEGIN IMMEDIATE');try{const claim=db.prepare('UPDATE routines SET next_run=? WHERE id=? AND next_run=? AND revision=? AND enabled=1 AND deleted=0').run(next,row.id,row.next_run,row.revision);if(!claim.changes){db.exec('ROLLBACK');return;}db.prepare('INSERT INTO routine_runs(routine_id,due,revision,phase,request_id) VALUES(?,?,?,?,?)').run(row.id,row.next_run,row.revision,phase,key);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   if(phase==='skipped'){result.skipped.push(row.id);return;}

   try{const [,response]=await tasks.start(row.owner,{id:key,title:row.title,instruction:frame(row.instruction)});const known=!!response.task.sessionID;db.prepare('UPDATE routine_runs SET phase=?,task_id=? WHERE routine_id=? AND due=?').run(known?'dispatched':'uncertain',response.task.id,row.id,row.next_run);result[known?'dispatched':'uncertain'].push(row.id);}catch{const task=db.prepare('SELECT id FROM tasks WHERE owner=? AND request_id=?').get(row.owner,key);db.prepare("UPDATE routine_runs SET phase='uncertain',task_id=? WHERE routine_id=? AND due=?").run(task?.id??null,row.id,row.next_run);result.uncertain.push(row.id);}
  });}return result;
 }
 return{create,change,list,runs,sweep,get:(owner,id)=>({routine:view(lookup(owner,id))})};
}
