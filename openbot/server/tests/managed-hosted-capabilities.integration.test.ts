import { test, expect } from "bun:test";
import { createDatabase } from "../src/db/client";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";

const dbUrl = process.env.TEST_DATABASE_URL;
/** This test uses a freshly migrated, disposable PostgreSQL instance.
 * No paid provider, vendor auth, or network calls.
 */
test.skipIf(!dbUrl)(
  "source owner controls hosted tool grants before session reservation",
  async () => {
    const database = createDatabase(dbUrl!);
    const provider = {
      async createSessionStream() {
        return {
          close() {},
          events: (async function* () {
            yield {
              type: "agent.session.created",
              event_id: "evtsess_1",
              session: { id: "sess_hosted_1" },
            };
            yield {
              type: "agent.session.turn.created",
              event_id: "evtroot_1",
              session_id: "sess_hosted_1",
              turn_id: "turn_hosted_1",
              turn: {
                id: "turn_hosted_1",
                session_id: "sess_hosted_1",
                subagent_id: null,
              },
            };
          })(),
        };
      },
      async retrieveSession() {
        return {
          id: "sess_hosted_1",
          status: "idle",
          environment: {
            type: "openai_hosted",
            id: "env_hosted_1",
            network: { access: "disabled" },
          },
          agent: { multi_agent: { enabled: true } },
          required_actions: [],
        };
      },
      async retrieveEnvironment() {
        return {
          id: "env_hosted_1",
          type: "openai_hosted",
          status: "connected",
        };
      },
      async createEnvironmentFile() {
        return {
          environment_id: "env_hosted_1",
          path: "/workspace/upload_test.txt",
          size_bytes: 2,
        };
      },
      async listSubagents() {
        return { data: [], has_more: false };
      },
      async listArtifacts() {
        return { data: [], has_more: false };
      },
      async listTurnItems() {
        return { data: [], has_more: false };
      },
      async retrieveTurn() {
        return {
          id: "turn_hosted_1",
          session_id: "sess_hosted_1",
          subagent_id: null,
          status: "in_progress",
        };
      },
    };
    const actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
    const token = "euphoria-hosted-test-only-token-long-long-098";
    try {
      const service = await createManagedDevelopment({
        database,
        token,
        model: "fixture",
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
      });
      const bot = await service.profiles.create(actor, {
        name: "Sandbox Bot",
        title: "Analysis",
        roleDescription: "Analyze user files",
        systemPrompt: "Use the sandbox if enabled",
        visibility: "private",
      });
      const channel = await service.channels.create(actor, [bot.id]);
      const headers = {
        cookie: "euphoria-development=" + token,
        "content-type": "application/json",
      };
      const endpoint = "/api/agents/" + bot.id + "/hosted-capabilities";
      const initial = await service.app.request(endpoint, { headers });
      expect(initial.status).toBe(200);
      const initialBody = await initial.json();
      expect(initialBody.capabilities).toEqual({
        sandbox: false,
        delegation: false,
        maxConcurrentSubagents: 1,
        webSearch: false,
        browser: false,
      });
      expect(initialBody.locked).toBe(false);
      const good = {
        sandbox: true,
        delegation: true,
        maxConcurrentSubagents: 2,
        webSearch: true,
        browser: false,
      };
      expect(
        (
          await service.app.request(endpoint, {
            method: "PUT",
            headers,
            body: JSON.stringify(good),
          })
        ).status,
      ).toBe(200);
      expect((await service.app.request(endpoint, { headers })).status).toBe(
        200,
      );
      expect(
        (
          await service.app.request(endpoint, {
            method: "PUT",
            headers,
            body: JSON.stringify({ ...good, maxConcurrentSubagents: 20 }),
          })
        ).status,
      ).toBe(400);
      expect((await service.app.request(endpoint)).status).toBe(401);
      const path = "/api/delivery/conversations/" + channel.id;
      const submit = await service.app.request(path + "/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          agentId: bot.id,
          text: "Analyze this task",
          externalId: crypto.randomUUID(),
        }),
      });
      expect(submit.status).toBe(202);
      await service.tick();
      const locked = await service.app.request(endpoint, { headers });
      expect((await locked.json()).locked).toBe(true);
      expect(
        (
          await service.app.request(endpoint, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              ...good,
              delegation: false,
              maxConcurrentSubagents: 1,
            }),
          })
        ).status,
      ).toBe(409);
      // Only an existing owned Bot's connected environment can receive uploads.
      const nope = await service.app.request(
        path + "/hosted-files?agentId=" + bot.id,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            uploadId: "test_untrusted_01",
            filename: "../secrets",
            data: "dGVzdA==",
          }),
        },
      );
      expect(nope.status).toBe(400);
    } finally {
      await database.$client.close();
    }
  },
);
