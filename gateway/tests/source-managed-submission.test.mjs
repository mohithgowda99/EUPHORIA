import test from 'node:test';
import assert from 'node:assert/strict';
import {submitManagedSourceInput} from '../../openbot/server/src/agents/managed-source-submission.ts';
import {AgentsClient} from '../agents-client.mjs';
const scope={ownerUserId:'person1',channelId:'channel1',botId:'bot1',threadId:'thread1'};
const definition={model:'test-model',instructions:'Only do authorized work.',tools:[]};
function links(){
 let session=null, key=null;
 const receipts=new Map();
 return {
  turns:{
   async read(id){return receipts.has(id)?{providerSessionId:receipts.get(id)}:null;},
   async reserve(id,sourceScope,providerSessionId){
    assert.deepEqual(sourceScope,{ownerUserId:scope.ownerUserId,channelId:scope.channelId,
     agentId:scope.botId,threadId:scope.threadId});
    if(receipts.has(id)){
     assert.equal(receipts.get(id),providerSessionId);
     return 'existing';
    }
    receipts.set(id,providerSessionId);
    return 'reserved';
   },
  },
  async reserve(given,creationKey){
   assert.deepEqual(given,scope);
   if(session)return {create:false,providerSessionId:session,creationKey:key};
   if(key)throw Error('uncertain; no second create');
   key=creationKey;
   return {create:true,providerSessionId:null};
  },
  async bind(given,creationKey,id){
   assert.deepEqual(given,scope);assert.equal(creationKey,key);
   session=id;
   return id;
  },
 };
}
function input(storage,provider,runId='run_one'){
 return {scope,runId,message:'Help with today',definition,links:storage,turns:storage.turns,provider};
}
test('source message creates once, then continues same hosted session with original durable key',async()=>{
 const calls=[];
 const transport=new AgentsClient({apiKey:'test-only',fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(options.method==='POST'&&url.endsWith('/events'))return new Response(null,{status:202});
  return Response.json({id:'session_original'});
 }});
 const storage=links();
 assert.deepEqual(await submitManagedSourceInput(input(storage,transport)),{
  sessionID:'session_original',phase:'accepted',
 });
 assert.deepEqual(await submitManagedSourceInput(input(storage,transport,'run_two')),{
  sessionID:'session_original',phase:'accepted',
 });
 assert.equal(calls.length,2);
 assert.equal(calls[0].options.headers['Idempotency-Key'],'source_create_run_one');
 assert.equal(calls[1].options.headers['Idempotency-Key'],'source_input_run_two');
 assert.equal(calls[0].url,'https://api.openai.com/v1/agents/sessions');
 assert.equal(calls[1].url,'https://api.openai.com/v1/agents/sessions/session_original/events');
 const body=JSON.parse(calls[1].options.body);
 assert.equal(body.events[0].type,'agent.session.input.message');
 assert.equal(body.events[0].input[0].content[0].text,'Help with today');
});
test('lost create response leaves original source link uncertain and never silently repeats',async()=>{
 const storage=links();let writes=0;
 const provider={createSession:async()=>{writes++;throw Error('connection lost')},
   sendMessage:async()=>{throw Error('wrong path')}};
 await assert.rejects(submitManagedSourceInput(input(storage,provider)));
 await assert.rejects(submitManagedSourceInput(input(storage,provider)));
 assert.equal(writes,1,'No duplicate provider create after unknown result');
});
test('provider success is only acceptance: source cannot fabricate reply or completed task',async()=>{
 const storage=links();
 const provider={createSession:async()=>({id:'session_a'}),sendMessage:async()=>{}};
 const outcome=await submitManagedSourceInput(input(storage,provider));
 assert.deepEqual(Object.keys(outcome).sort(),['phase','sessionID']);
 assert.equal(outcome.phase,'accepted');
});

test('crash between original session binding and first Inbox receipt cannot replay initial input',async()=>{
 const storage=links();let creates=0,followups=0;
 const provider={createSession:async()=>{creates++;return {id:'session_created'};},
  sendMessage:async()=>{followups++;}};
 // Mimic the link completing with its immutable initial request key,
 // while the process dies before the Inbox receipt is committed.
 const reserved=await storage.reserve(scope,'source_create_run_initial');
 assert.equal(reserved.create,true);
 await storage.bind(scope,'source_create_run_initial','session_created');
 const outcome=await submitManagedSourceInput(input(storage,provider,'run_initial'));
 assert.deepEqual(outcome,{sessionID:'session_created',phase:'accepted'});
 assert.equal(creates,0);
 assert.equal(followups,0);
 assert.equal((await storage.turns.read('run_initial')).providerSessionId,'session_created');
});

test('worker replay of original session creation never becomes a new follow-up input',async()=>{
 const storage=links();let creates=0,followups=0;
 const provider={createSession:async()=>{creates++;return {id:'session_a'};},
  sendMessage:async()=>{followups++;}};
 await submitManagedSourceInput(input(storage,provider,'run_one'));
 await submitManagedSourceInput(input(storage,provider,'run_one'));
 assert.equal(creates,1);
 assert.equal(followups,0);
});

test('ambiguous follow-up is not resent after owner lease loss or a process restart',async()=>{
 const storage=links();let creates=0,followups=0;
 const provider={createSession:async()=>{creates++;return {id:'session_a'};},
  sendMessage:async()=>{followups++;throw Error('HTTP outcome unknown');}};
 await submitManagedSourceInput(input(storage,provider,'run_one'));
 await assert.rejects(submitManagedSourceInput(input(storage,provider,'run_two')));
 assert.deepEqual(await submitManagedSourceInput(input(storage,provider,'run_two')),
  {sessionID:'session_a',phase:'accepted'});
 assert.equal(creates,1);
 assert.equal(followups,1,'One original source Inbox can submit only once');
});
