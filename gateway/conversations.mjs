import {createHash} from 'node:crypto';
import {fail,identifier,stable} from './visual-contract.mjs';

export function conversations({db,provider,owned}) {
  db.exec(`CREATE TABLE IF NOT EXISTS inputs(session_id TEXT,input_id TEXT,kind TEXT,payload TEXT,phase TEXT,
    PRIMARY KEY(session_id,input_id));
    CREATE TABLE IF NOT EXISTS surface_versions(session_id TEXT,revision INTEGER,surface TEXT,turn_id TEXT,call_id TEXT,
    PRIMARY KEY(session_id,revision));
    UPDATE inputs SET phase='uncertain' WHERE phase='submitting';`);
  if(!db.prepare('PRAGMA table_info(inputs)').all().some(c=>c.name==='base_turn_id'))db.exec('ALTER TABLE inputs ADD COLUMN base_turn_id TEXT');
  const operations=id=>db.prepare('SELECT input_id AS id,kind,phase FROM inputs WHERE session_id=? ORDER BY rowid').all(id);
  async function submit(id,owner,kind,input,{baseTurnID=null}={}) {
    owned(id,owner);
    const expected=kind==='message'?'id,message':'id';
    if(!input||Object.keys(input).sort().join(',')!==expected)fail(422,'Invalid conversation operation');
    identifier(input.id);
    if(kind==='message'&&(typeof input.message!=='string'||!input.message.trim()||input.message.length>16000))fail(422,'Invalid message');
    const fingerprint=stable({kind,...input});
    const old=db.prepare('SELECT * FROM inputs WHERE session_id=? AND input_id=?').get(id,input.id);
    if(old){
      if(old.phase!=='cancelled'&&old.payload!==fingerprint)fail(409,'Input identity reused');
      return {id:input.id,phase:old.phase};
    }
    if(operations(id).length>=500)fail(429,'Conversation input limit reached');
    db.prepare('INSERT INTO inputs(session_id,input_id,kind,payload,phase,base_turn_id) VALUES(?,?,?,?,?,?)').run(id,input.id,kind,fingerprint,'submitting',baseTurnID);
    const key='input-'+createHash('sha256').update(id+'\0'+input.id).digest('hex');
    let phase='accepted';
    try {
      if(kind==='message')await provider.sendMessage(id,input.message,key);
      else await provider.cancelTurn(id,key);
    }catch(error){phase=error.outcomeUnknown===false?'rejected':'uncertain';}
    db.prepare('UPDATE inputs SET phase=? WHERE session_id=? AND input_id=?').run(phase,id,input.id);
    return {id:input.id,phase};
  }
  function receipts(id,owner){owned(id,owner);return {operations:operations(id)};}
  function resolve(id,owner,input){
    owned(id,owner);
    if(!input||Object.keys(input).join(',')!=='ids'||!Array.isArray(input.ids)||input.ids.length>50)fail(422,'Invalid recovery input');
    input.ids.forEach(identifier);
    if(operations(id).length+input.ids.length>500)fail(429,'Conversation input limit reached');
    for(const key of input.ids)db.prepare('INSERT OR IGNORE INTO inputs(session_id,input_id,kind,payload,phase) VALUES(?,?,NULL,NULL,?)').run(id,key,'cancelled');
    return receipts(id,owner);
  }
  async function history(id,owner,{after,limit=10,signal}={}) {
    owned(id,owner);
    if(!Number.isInteger(limit)||limit<1||limit>10)fail(422,'Invalid history page size');
    if(after!==undefined)identifier(after);
    const page=await provider.listItems(id,{after,limit,order:'desc',signal});
    signal?.throwIfAborted();
    if(!page||!Array.isArray(page.data)||page.data.length>limit||typeof page.has_more!=='boolean')fail(502,'Invalid provider history');
    if(page.has_more)identifier(page.last_id);
    const entries=page.data.map((item,index)=>{
      if(!item||typeof item!=='object')return {id:'unsupported-'+index,kind:'unsupported',status:'unknown',text:'Unreadable history item'};
      const text=x=>typeof x==='string'?x.slice(0,8000):'';
      const legacy=item.id===null;
      const itemID=typeof item.id==='string'&&item.id?item.id:
        'legacy-'+createHash('sha256').update(id+'\0'+(after||'')+'\0'+index+'\0'+stable(item)).digest('hex');
      const common={id:itemID,status:text(item.status)||'unknown',turnID:text(item.turn_id),legacy};
      if(item.type==='message'&&['user','assistant'].includes(item.role)&&Array.isArray(item.content)){
        const parts=item.content.filter(p=>p&&['input_text','output_text'].includes(p.type)&&typeof p.text==='string');
        const unsupportedContent=item.content.some(p=>!p||!['input_text','output_text'].includes(p.type));
        return {...common,kind:'message',role:item.role,text:text(parts.map(p=>p.text).join('\n')),unsupportedContent};
      }
      if(item.type==='function_call'){
        const version=db.prepare('SELECT surface FROM surface_versions WHERE session_id=? AND turn_id=? AND call_id=? ORDER BY revision DESC LIMIT 1').get(id,String(item.turn_id),String(item.call_id));
        return {...common,kind:'function_call',text:text(item.name),surface:version?JSON.parse(version.surface):null};
      }
      // Unknown tools/outputs may contain credentials. Preserve their existence, never forward raw arguments/results.
      return {...common,kind:'unsupported',text:text(item.type)||'Unknown history item'};
    });
    const result={sessionID:id,entries:entries.reverse(),order:'desc',hasMore:page.has_more,nextCursor:page.has_more?page.last_id:null};
    if(Buffer.byteLength(JSON.stringify(result))>900_000)fail(502,'History page too large');
    return result;
  }
  return {submit,receipts,resolve,history};
}
