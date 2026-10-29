import { test, expect } from "bun:test";
import { createDatabase } from "../src/db/client";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";
const url = process.env.TEST_DATABASE_URL;

test.skipIf(!url)(
  "hosted browser approval belongs to exact original source root and is one-shot",
  async () => {
    const database = createDatabase(url!);
    const actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
    const sid = "sess_" + crypto.randomUUID().replaceAll("-", "");
    const rid = "root_" + crypto.randomUUID().replaceAll("-", "");
    const requestID = "browser_" + crypto.randomUUID().replaceAll("-", "");
    let submissions = 0;
    const provider = {
      async createSessionStream() {
        return {
          close() {},
          events: (async function* () {
            yield {
              type: "agent.session.created",
              event_id: "evt_s_" + rid,
              session: { id: sid },
            };
            yield {
              type: "agent.session.turn.created",
              event_id: "evt_t_" + rid,
              session_id: sid,
              turn_id: rid,
              turn: { id: rid, session_id: sid, subagent_id: null },
            };
          })(),
        };
      },
      async retrieveSession() {
        return {
          id: sid,
          status: "requires_action",
          environment: {
            type: "openai_hosted",
            desktop: { enabled: true },
            network: {
              access: "restricted",
              allowed_domains: ["developers.openai.com"],
            },
          },
          required_actions: [
            {
              type: "computer_use_approval_request",
              request_id: requestID,
              turn_id: rid,
              request: {
                type: "browser_origin_access",
                origin: "https://developers.openai.com",
                reason: "Read docs",
              },
            },
          ],
        };
      },
      async retrieveTurn() {
        return {
          id: rid,
          session_id: sid,
          subagent_id: null,
          status: "requires_action",
        };
      },
      async listTurns() {
        return {
          data: [
            {
              id: rid,
              session_id: sid,
              subagent_id: null,
              status: "requires_action",
            },
          ],
          has_more: false,
        };
      },
      async listItems() {
        return { data: [], has_more: false };
      },
      async listTurnItems() {
        return { data: [], has_more: false };
      },
      async respondBrowserApproval(s: string, id: string, decision: string) {
        expect(s).toBe(sid);
        expect(id).toBe(requestID);
        expect(decision).toBe("approve");
        submissions++;
      },
      async cancelBrowserAuthentication() {
        throw Error("No authentication should occur");
      },
    };
    const token = "euphoria-test-browser-canonical-auth-123456";
    try {
      const app = await createManagedDevelopment({
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        model: "fixture",
        token,
        browserHosts: ["developers.openai.com"],
      });
      const bot = await app.profiles.create(actor, {
        name: "Browser Bot",
        title: "Docs reader",
        roleDescription: "Read public docs",
        systemPrompt: "Read public documentation only",
        visibility: "private",
      });
      const channel = await app.channels.create(actor, [bot.id]);
      const headers = {
        cookie: "euphoria-development=" + token,
        "content-type": "application/json",
      };
      const capsPath = "/api/agents/" + bot.id + "/hosted-capabilities";
      expect(
        (
          await app.app.request(capsPath, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              sandbox: false,
              browser: true,
              delegation: false,
              maxConcurrentSubagents: 1,
              webSearch: false,
            }),
          })
        ).status,
      ).toBe(200);
      const route = "/api/delivery/conversations/" + channel.id;
      const query = "?agentId=" + bot.id;
      expect(
        (
          await app.app.request(route + "/messages", {
            method: "POST",
            headers,
            body: JSON.stringify({
              agentId: bot.id,
              text: "Read the docs",
              externalId: crypto.randomUUID(),
            }),
          })
        ).status,
      ).toBe(202);
      await app.tick();
      const listed = await app.app.request(
        route + "/browser-approvals" + query,
        { headers },
      );
      expect(listed.status).toBe(200);
      const list = await listed.json();
      expect(list.requests).toHaveLength(1);
      expect(list.requests[0].canApprove).toBe(true);
      expect(
        (
          await app.app.request(
            route + "/browser-approvals/" + requestID + query,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ decision: "approve" }),
            },
          )
        ).status,
      ).toBe(202);
      expect(
        (
          await app.app.request(
            route + "/browser-approvals/" + requestID + query,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ decision: "approve" }),
            },
          )
        ).status,
      ).toBe(409);
      expect(submissions).toBe(1);
    } finally {
      await database.$client.close();
    }
  },
);
