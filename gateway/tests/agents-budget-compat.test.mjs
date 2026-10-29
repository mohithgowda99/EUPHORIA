import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentsClient} from '../agents-client.mjs';

const incompatible=()=>Response.json({error:{type:'invalid_request_error',
  code:'unknown_parameter',param:'spend_control',message:'Unknown parameter'}},
  {status:400});

for(const streaming of [true,false])test('unsupported spend_control rejects without uncapped retry ('+
 String(streaming? 'SSE':'JSON')+')',async()=>{
 let calls=0,body;
 const client=new AgentsClient({apiKey:'test-only-key',sessionSpendLimitCents:25,
  fetchImpl:async(_url,opts)=>{calls++;body=JSON.parse(opts.body);return incompatible();}});
 const input={model:'test-model',instructions:'Use hard session budget',input:'Hi'};
 const create=streaming?client.createSessionStream(input,'compat_sse_1'):
  client.createSession(input,'compat_json_1');
 await assert.rejects(create,error=>
  error.code==='PROVIDER_SPEND_CONTROL_UNSUPPORTED' &&
  error.outcomeUnknown===false && !error.message.includes('Unknown parameter'));
 assert.equal(calls,1);
 assert.deepEqual(body.spend_control,{limit:25});
});
test('ordinary failures do not reveal provider response bodies',async()=>{
 const client=new AgentsClient({apiKey:'test-only-key',fetchImpl:async()=>
  Response.json({error:{message:'private key fixture: SECRET'}},{status:403})});
 await assert.rejects(client.createSession({model:'test',instructions:'Safe',input:'Hi'},'safe_request'),
  error=>!error.message.includes('SECRET'));
});
