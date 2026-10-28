import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentsClient } from '../agents-client.mjs';
import {
  resolveManagedSourceBot,
  ManagedSourceBotRefusal,
} from '../../openbot/server/src/agents/managed-source-definition.ts';

// Deterministic provider HTTP contract; no paid API traffic or live credentials.
// Exactly the original source identity is mapped into the ONE existing
// EUPHORIA Agents transport. Does not invent a second execution runner.
const actor={id:'owner_1',role:'user'};
const profile={id:'bot_1',name:'Daily Bot',title:'Assistant',
  roleDescription:'Help with daily work',deletedAt:null};
function source({access=true,registered=true,remote=false}={}){
  return {actor,botId:'bot_1',model:'test-model',
    profiles:{get:async (requestedActor,id)=>{
      assert.deepEqual(requestedActor,actor);assert.equal(id,'bot_1');
      return access?profile:null;
    }},
    registered:async (requestedActor)=>{
      assert.deepEqual(requestedActor,actor);
      return registered?[remote?{id:'bot_1',name:'Daily Bot',type:'remote_ag_ui',endpoint:'https://external.test'}
        :{id:'bot_1',name:'Daily Bot',type:'built_in',systemPrompt:'Respect the user.'}]:[];
    },
    roleMessage:role=>({content:'Original OpenDuet role: '+role.name}),
  };
}

test('source-owned Bot authorizes the managed Agents session with no unapproved tools',async()=>{
  const requests=[];
  const client=new AgentsClient({apiKey:'fake-key',sessionSpendLimitCents:10,fetchImpl:async(url,opts)=>{
    requests.push({url,opts});
    return Response.json({id:'sess_source'});
  }});
  const binding=await resolveManagedSourceBot(source());
  assert.equal(binding.ownerUserId,'owner_1');
  assert.equal(binding.botId,'bot_1');
  const response=await client.createSession({...binding.agent,input:'Read my agenda'},'source-intent_1');
  assert.equal(response.id,'sess_source');
  assert.equal(requests.length,1);
  assert.deepEqual(JSON.parse(requests[0].opts.body),{
    agent:{model:'test-model',instructions:
      'Original OpenDuet role: Daily Bot\n\nRespect the user.',tools:[]},
    environment:{type:'none'},input:'Read my agenda',stream:false,
    spend_control:{limit:10},
  });
  assert.equal(requests[0].opts.headers['Idempotency-Key'],'source-intent_1');
  assert.equal(requests[0].opts.headers.Authorization,'Bearer fake-key');
});

test('foreign/unregistered/remote Bots never send a managed API request',async()=>{
  let sends=0;
  const client=new AgentsClient({apiKey:'fake-key',fetchImpl:async()=>{
    sends++;throw Error('should not be called');
  }});
  for(const options of [{access:false},{registered:false},{remote:true}]){
    await assert.rejects(
      async()=>client.createSession({
        ...(await resolveManagedSourceBot(source(options))).agent,input:'Go'
      },'request_1'),
      error=>error instanceof ManagedSourceBotRefusal,
    );
  }
  assert.equal(sends,0);
});
