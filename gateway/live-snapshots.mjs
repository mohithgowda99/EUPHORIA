import {fail} from './visual-contract.mjs';

/** Live notifications project existing authoritative records; never forward provider bodies or replay inputs. */
export function liveSnapshots({provider,owned,readProjection,authenticate}){
  const active=new Map();
  async function serve(id,owner,req,res){
    owned(id,owner);
    if(typeof provider.openEventStream!=='function')fail(503,'Live updates unavailable');
    const key=owner+'\0'+id,count=active.get(key)?.size??0;
    if(count>=2)fail(429,'Too many live connections');
    const controller=new AbortController(),set=active.get(key)??new Set();set.add(controller);active.set(key,set);
    const signal=controller.signal;let upstream,tick,heartbeat,task=Promise.resolve(),publishing=false,dirty=false;
    const abort=()=>controller.abort();
    res.once('close',abort);req.once('aborted',abort);
    const lease=setTimeout(abort,55_000);
    async function authorize(){if(await authenticate(req)!==owner)throw Error('Access changed');signal.throwIfAborted();owned(id,owner);}
    async function send(event,value){
      signal.throwIfAborted();
      const data='event: '+event+'\ndata: '+JSON.stringify(value)+'\n\n';
      if(Buffer.byteLength(data)>1024*1024)throw Error('Live update exceeds bound');
      if(!res.write(data))await new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);res.off('drain',drain);res.off('close',closed);signal.removeEventListener('abort',closed);};
        const drain=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(Error('Connection closed'));};
        const timer=setTimeout(closed,2000);res.once('drain',drain);res.once('close',closed);signal.addEventListener('abort',closed,{once:true});
      });
    }
    async function publish(){
      await authorize();
      const projection=await readProjection(id,owner,signal);
      signal.throwIfAborted();await authorize();await send('update',projection);
    }
    function flush(){
      if(publishing||!dirty||signal.aborted)return;
      dirty=false;publishing=true;
      task=publish().catch(()=>controller.abort()).finally(()=>{publishing=false;});
    }
    try{
      // Subscribe before reading restoration state; notifications arriving during reads remain dirty.
      upstream=await provider.openEventStream(id,{signal});signal.throwIfAborted();
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'});res.flushHeaders();
      // Start consuming immediately while initial canonical reads are in flight.
      const pump=(async()=>{for await(const event of upstream.events){signal.throwIfAborted();if(event.session_id!==id)throw Error('Foreign event');dirty=true;}})();
      // Attach a rejection handler immediately; the consumer is awaited below.
      pump.catch(()=>controller.abort());
      await publish();
      tick=setInterval(flush,250);
      heartbeat=setInterval(()=>{if(!signal.aborted&&!res.writableNeedDrain)res.write(': heartbeat\n\n');},10_000);
      await pump;
      if(!signal.aborted){await task;await publish();}
    }catch{
      if(!res.headersSent&&!res.destroyed)throw Error('Live updates unavailable');
    }finally{
      clearTimeout(lease);clearInterval(tick);clearInterval(heartbeat);
      controller.abort();upstream?.close();await task;
      if(res.headersSent&&!res.destroyed&&!res.writableEnded)res.end('event: reconnect\ndata: {}\n\n');
      set.delete(controller);if(!set.size)active.delete(key);
      res.off('close',abort);req.off('aborted',abort);
    }
  }
  function closeAll(){for(const set of active.values())for(const controller of set)controller.abort();}
  return {serve,closeAll};
}
