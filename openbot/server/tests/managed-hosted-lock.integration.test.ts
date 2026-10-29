import {expect,test} from 'bun:test';
import {createDatabase} from '../src/db/client';
import {createManagedDevelopment} from '../src/agents/managed-development';
import {createManagedHostedCapabilities,DENIED_HOSTED_CAPABILITIES} from '../src/agents/managed-hosted-capabilities';
import {createManagedSessionLinkStore} from '../src/agents/managed-session-links';
import {DEV_ACTOR} from '../src/auth/dev-actor';

const url=process.env.TEST_DATABASE_URL;
test.skipIf(!url)('cross-process revocation between capability read and first reservation prevents provider creation',async()=>{
 const database=createDatabase(url!);
 try{
  const service=await createManagedDevelopment({database,token:'fixture-grant-race-only-1234567890123456',model:'fixture',provider:{} as Parameters<typeof createManagedDevelopment>[0]['provider']});
  const actor={id:DEV_ACTOR.id,role:DEV_ACTOR.role};
  const bot=await service.profiles.create(actor,{name:'Grant race',title:'Test',roleDescription:'Test',systemPrompt:'Test',visibility:'private'});
  const channel=await service.channels.create(actor,[bot.id]);
  const scope={ownerUserId:actor.id,botId:bot.id,channelId:channel.id,threadId:channel.threadId};
  const grants=createManagedHostedCapabilities(database);
  await grants.write(actor.id,bot.id,{...DENIED_HOSTED_CAPABILITIES,sandbox:true});
  const stale=await grants.read(actor.id,bot.id);
  // A distinct backend process commits revocation after this worker read its
  // manifest, before this worker reserves the first provider session.
  const code=`import {createDatabase} from ${JSON.stringify(new URL('../src/db/client.ts',import.meta.url).pathname)};
   import {createManagedHostedCapabilities,DENIED_HOSTED_CAPABILITIES} from ${JSON.stringify(new URL('../src/agents/managed-hosted-capabilities.ts',import.meta.url).pathname)};
   const db=createDatabase(process.env.TEST_DATABASE_URL);
   try {await createManagedHostedCapabilities(db).write(process.env.RACE_OWNER,process.env.RACE_BOT,DENIED_HOSTED_CAPABILITIES);}finally{await db.$client.close();}`;
  const child=Bun.spawn([process.execPath,'--eval',code],{env:{...process.env,RACE_OWNER:actor.id,RACE_BOT:bot.id},stdout:'pipe',stderr:'pipe'});
  const diagnostics=await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(diagnostics).not.toContain('error:');
  const links=createManagedSessionLinkStore(database);
  await expect(links.reserve(scope,'cross_process_stale_manifest',stale)).rejects.toThrow('capabilities changed');
  expect(await links.read(scope)).toBeNull();
  const denied=await grants.read(actor.id,bot.id);
  expect(denied.sandbox).toBe(false);
  expect((await links.reserve(scope,'cross_process_current_manifest',denied)).create).toBe(true);
  await expect(grants.write(actor.id,bot.id,{...denied,sandbox:true})).rejects.toThrow('locked');
 }finally{await database.$client.close();}
});
