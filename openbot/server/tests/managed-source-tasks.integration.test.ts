import { test, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/db/client";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { and, eq } from "drizzle-orm";
import { deliveryInbox } from "../src/db/schema";

const url = process.env.TEST_DATABASE_URL;
/** Runs only against a disposable PostgreSQL database with migrated source tables.
 * No API key, external tool, or paid inference is involved.
 */
test.skipIf(!url)(
  "native Tasks/Up Next reuse source IDs, avoid duplicate managed inputs and restore",
  async () => {
    const database = createDatabase(url!, { max: 1 });
    const token = "managed-task-receipts-fixture-token-123456";
    let send = 0;
    const provider = {
      async createSessionStream() {
        const id = "sess_" + randomUUID().replaceAll("-", "");
        const root = "turn_" + randomUUID().replaceAll("-", "");
        send++;
        return {
          close() {},
          events: (async function* () {
            yield {
              type: "agent.session.created",
              session: { id },
              event_id: "event_" + id,
            };
            yield {
              type: "agent.session.turn.created",
              session_id: id,
              turn_id: root,
              event_id: "event_" + root,
              turn: { id: root, session_id: id, subagent_id: null },
            };
          })(),
        };
      },
      async retrieveSession(id: string) {
        return { id, status: "idle", required_actions: [] };
      },
      async listTurnItems() {
        return { data: [], has_more: false };
      },
      async retrieveTurn(id: string, root: string) {
        return {
          id: root,
          session_id: id,
          status: "in_progress",
          subagent_id: null,
        };
      },
      async sendMessage() {
        return { accepted: true };
      },
      async createSession() {
        throw Error("Unexpected nonstreaming provider create");
      },
    };
    try {
      const app1 = await createManagedDevelopment({
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        model: "fixture",
        token,
      });
      const actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
      const bot = await app1.profiles.create(actor, {
        name: "Managed Tasks Bot",
        title: "Research",
        roleDescription: "Task executor",
        systemPrompt: "Task executor",
        visibility: "private",
      });
      const headers = {
        cookie: "euphoria-development=" + token,
        "content-type": "application/json",
      };
      const submit = await app1.app.request("/api/openduet/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          botId: bot.id,
          title: "Research standards",
          instruction: "Summarize the standards",
        }),
      });
      expect(submit.status).toBe(201);
      const created = (await submit.json()).task;
      expect(created.botId).toBe(bot.id);
      expect(created.channelId).toBeTruthy();
      const before = await app1.app.request("/api/openduet/tasks", { headers });
      expect(
        (await before.json()).tasks.some(
          (task: { id: string }) => task.id === created.id,
        ),
      ).toBe(true);
      await app1.tick();
      expect(send).toBe(1);
      const saved = await database
        .select()
        .from(deliveryInbox)
        .where(
          and(
            eq(deliveryInbox.channelId, created.channelId),
            eq(deliveryInbox.realm, "managed-task"),
          ),
        );
      expect(saved).toHaveLength(1);
      expect(saved[0].text).toBe("Summarize the standards");
      // Source task still exists after a backend recreation without creating a new provider request.
      const app2 = await createManagedDevelopment({
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        model: "fixture",
        token,
      });
      const reopened = await app2.app.request(
        "/api/openduet/tasks/" + created.id,
        { headers },
      );
      expect(reopened.status).toBe(200);
      expect((await reopened.json()).task.channelId).toBe(created.channelId);
      const messageId = randomUUID();
      const reply = () =>
        app2.app.request("/api/openduet/tasks/" + created.id + "/reply", {
          method: "POST",
          headers,
          body: JSON.stringify({ reply: "Include examples", messageId }),
        });
      expect((await reply()).status).toBe(202);
      expect((await reply()).status).toBe(202);
      const replies = await database
        .select()
        .from(deliveryInbox)
        .where(
          and(
            eq(deliveryInbox.channelId, created.channelId),
            eq(deliveryInbox.realm, "managed-task"),
          ),
        );
      expect(replies).toHaveLength(2);
      const upNext = await app2.app.request("/api/openduet/tasks/up-next", {
        method: "POST",
        headers,
        body: JSON.stringify({
          botId: bot.id,
          title: "Next action",
          instruction: "Prepare follow-up",
        }),
      });
      expect(upNext.status).toBe(201);
      const next = await app2.app.request("/api/proactive/suggestions", {
        headers,
      });
      expect(
        (await next.json()).suggestions.some(
          (item: { title: string }) => item.title === "Next action",
        ),
      ).toBe(true);

      // The ORIGINAL ProactiveStore accepts owner-authorized settings drafts,
      // but must never activate recurring managed inference without a hard cap.
      const draftInput={
        agentId:bot.id,channelId:created.channelId,
        focus:"Track read-only updates",intervalMinutes:240,enabled:false
      };
      const denied=await app2.app.request("/api/proactive/settings",{
        method:"POST",headers,body:JSON.stringify({...draftInput,enabled:true})
      });
      expect(denied.status).toBe(409);
      const original=await app2.app.request("/api/proactive/settings",{headers});
      const existing=(await original.json()).settings.find(
        (setting:{agentId:string})=>setting.agentId===bot.id
      );
      let draftID:string;
      if(existing){
        // Original OpenDuet may have enabled background research by default
        // after first contact. Do not create a duplicate or silently assume
        // that it is managed provider work. Explicitly disable that source row.
        draftID=existing.id;
        const paused=await app2.app.request("/api/proactive/settings/"+draftID,{
          method:"PATCH",headers,
          body:JSON.stringify({focus:draftInput.focus,enabled:false})
        });
        expect(paused.status).toBe(200);
        expect((await paused.json()).setting.enabled).toBe(false);
      }else{
        const draft=await app2.app.request("/api/proactive/settings",{
          method:"POST",headers,body:JSON.stringify(draftInput)
        });
        expect(draft.status).toBe(201);
        draftID=(await draft.json()).setting.id;
      }
      expect((await app2.app.request("/api/proactive/settings",{
        method:"POST",headers,body:JSON.stringify(draftInput)
      })).status).toBe(409);
      const listed=await app2.app.request("/api/proactive/settings",{headers});
      const prefs=await listed.json();
      expect(prefs.autonomousExecution).toBe("blocked_until_verified_execution_and_budget");
      expect(prefs.settings).toHaveLength(1);
      expect(prefs.settings[0].enabled).toBe(false);
      expect((await app2.app.request("/api/proactive/settings/"+draftID,{
        method:"PATCH",headers,body:JSON.stringify({enabled:true})
      })).status).toBe(409);
      const updated=await app2.app.request("/api/proactive/settings/"+draftID,{
        method:"PATCH",headers,body:JSON.stringify({focus:"Only read-only highlights",enabled:false})
      });
      expect(updated.status).toBe(200);
      expect((await updated.json()).setting.enabled).toBe(false);
      expect((await app2.app.request("/api/proactive/settings",{
        headers:{cookie:"wrong"}
      })).status).toBe(401);
      expect((await app2.app.request("/api/proactive/settings/"+draftID,{
        method:"DELETE",headers
      })).status).toBe(204);

      expect(
        (
          await app2.app.request("/api/openduet/tasks", {
            headers: { cookie: "wrong" },
          })
        ).status,
      ).toBe(401);
    } finally {
      await database.$client.close();
    }
  },
);
