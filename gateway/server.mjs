// Development launcher only. A production service must inject a verified identity provider.
import {createGateway} from './gateway.mjs';
import {AgentsClient} from './agents-client.mjs';
import {createHash,timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const {OPENAI_API_KEY,EUPHORIA_DEV_TOKEN,EUPHORIA_MODEL}=process.env;
if(!OPENAI_API_KEY||!EUPHORIA_DEV_TOKEN||EUPHORIA_DEV_TOKEN.length<32||!EUPHORIA_MODEL){
  console.error('Configure OPENAI_API_KEY, EUPHORIA_MODEL and a >=32-character EUPHORIA_DEV_TOKEN in this server process.');process.exit(2);
}
const directory=resolve(process.env.EUPHORIA_STATE_DIR||'gateway/.state');mkdirSync(directory,{recursive:true,mode:0o700});
const hash=x=>createHash('sha256').update(x).digest();
const expected=hash('Bearer '+EUPHORIA_DEV_TOKEN);
const server=createGateway({provider:new AgentsClient({apiKey:OPENAI_API_KEY}),model:EUPHORIA_MODEL,
  databasePath:join(directory,'gateway.sqlite'),authenticate:async req=>
    timingSafeEqual(expected,hash(req.headers.authorization||''))?'development-owner':null});
server.listen(Number(process.env.EUPHORIA_PORT||8787),'127.0.0.1',()=>console.log('Development gateway listening on loopback. No production login configured.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

// Explicit opt-in only; managed deployment must keep a worker alive independently of any client.
if(process.env.EUPHORIA_ROUTINES_ENABLED==='1'){
 let active=false;const sweep=async()=>{if(active)return;active=true;try{await server.sweepRoutines();}catch{console.error('Routine sweep failed; inspect durable run state.');}finally{active=false;}};
 const timer=setInterval(sweep,60_000);timer.unref();server.on('close',()=>clearInterval(timer));
}
