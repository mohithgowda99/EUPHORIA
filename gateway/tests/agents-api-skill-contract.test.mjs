import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentsClient} from '../agents-client.mjs';

test('Agents API refuses Responses-only skill references before any provider request', async () => {
  let calls=0;
  const client=new AgentsClient({apiKey:'fixture',sessionSpendLimitCents:2,
    fetchImpl:async()=>{ calls++; return new Response('data: {}\n\n',{
      headers:{'content-type':'text/event-stream'}}); }});
  await assert.rejects(client.createSessionStream({model:'fixture',instructions:'Analyze',
    input:'Use approved source instructions',tools:[],environment:{type:'openai_hosted',
      container_size:'small',network:{access:'disabled'},
      skills:[{type:'skill_reference',skill_id:'skill_ABCDEF0123',version:'3'}]}},
    'skill_contract_1'),/capability directories/);
  assert.equal(calls,0);
});
