import { test, expect } from "bun:test";
import { createDatabase } from "../src/db/client";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import type { OriginalPluginBridge } from "../src/agents/managed-connected-mcp";
import { and, eq } from "drizzle-orm";
import { workItems } from "../src/db/schema/work";

const url = process.env.TEST_DATABASE_URL;
/**
 * Bounded, credential-free integration using original source profiles, source
 * Inbox, source person questions and deterministic provider/tool fixtures.
 * No paid requests or external side effects.
 */
for (const effect of ["read", "write"] as const)
  test.skipIf(!url)(
    "source MCP " +
      effect +
      " requires exact grant/owner and one provider-correlated continuation",
    async () => {
      const database = createDatabase(url!),
        actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
      const sess = "sess_" + crypto.randomUUID().replaceAll("-"),
        root = "turn_" + crypto.randomUUID().replaceAll("-");
      const callID = "call_" + crypto.randomUUID().replaceAll("-");
      const call = {
        type: "function_call",
        name: "euphoria_connected_mcp",
        turn_id: root,
        call_id: callID,
        arguments: {
          ref: "fixture/doc",
          args: { text: "approved fixture only" },
        },
      };
      let pending = true,
        executions = 0,
        submissions = 0,
        revoked = false;
      const provider = {
        async createSessionStream() {
          return {
            close() {},
            events: (async function* () {
              yield {
                type: "agent.session.created",
                event_id: "evt_" + sess,
                session: { id: sess },
              };
              yield {
                type: "agent.session.turn.created",
                event_id: "evt_" + root,
                session_id: sess,
                turn_id: root,
                turn: { id: root, session_id: sess, subagent_id: null },
              };
            })(),
          };
        },
        async retrieveSession() {
          return {
            id: sess,
            status: pending ? "requires_action" : "idle",
            required_actions: pending ? [call] : [],
          };
        },
        async retrieveTurn() {
          return {
            id: root,
            session_id: sess,
            subagent_id: null,
            status: pending ? "in_progress" : "completed",
          };
        },
        async listTurnItems() {
          return { data: [], has_more: false };
        },
        async listItems() {
          return { data: [], has_more: false };
        },
        async sendMessage() {
          return { accepted: true };
        },
        async submitToolResult(
          session: string,
          out: { turnID: string; callID: string; output: unknown },
        ) {
          expect(session).toBe(sess);
          expect(out.turnID).toBe(root);
          expect(out.callID).toBe(callID);
          submissions++;
          pending = false;
        },
      };
      const plugins = {
        brokerProvider: "composio",
        async listForAgent(_bot: string) {
          return {
            tools: revoked
              ? []
              : [
                  {
                    ref: "fixture/doc",
                    toolName: "fixture__doc",
                    description: "Local test tool",
                    inputSchema: { type: "object" },
                  },
                ],
            skills: [],
          };
        },
        async listServers() {
          return [
            {
              tools: [
                {
                  ref: "fixture/doc",
                  effect,
                  destructive: false,
                  inputSchema: { type: "object" },
                },
              ],
            },
          ];
        },
        async callTool(params: {
          ref: string;
          actorId: string;
          botId: string;
        }) {
          expect(params.ref).toBe("fixture/doc");
          expect(params.actorId).toBe(actor.id);
          executions++;
          return { text: "Fixture complete", isError: false };
        },
      } as unknown as OriginalPluginBridge;
      const token = "euphoria-mcp-integration-token-123456789012";
      try {
        const app = await createManagedDevelopment({
          database,
          provider: provider as unknown as Parameters<
            typeof createManagedDevelopment
          >[0]["provider"],
          plugins: plugins as Parameters<
            typeof createManagedDevelopment
          >[0]["plugins"],
          token,
          model: "fixture",
        });
        const bot = await app.profiles.create(actor, {
          name: "Connected Bot",
          title: "Assistant",
          roleDescription: "Use approved tools",
          systemPrompt: "Use approved tools",
          visibility: "private",
        });
        const channel = await app.channels.create(actor, [bot.id]);
        const headers = {
          cookie: "euphoria-development=" + token,
          "content-type": "application/json",
        };
        const path = "/api/delivery/conversations/" + channel.id;
        expect(
          (
            await app.app.request(path + "/messages", {
              method: "POST",
              headers,
              body: JSON.stringify({
                agentId: bot.id,
                text: "Use the connected test tool",
                externalId: crypto.randomUUID(),
              }),
            })
          ).status,
        ).toBe(202);
        await app.tick();
        if (effect === "write") {
          expect(executions).toBe(0);
          const inbox = await app.app.request("/api/approvals", { headers });
          expect(inbox.status).toBe(200);
          const questions = (await inbox.json()).questions;
          expect(
            questions.some(
              (x: { id: string; approvalKind?: string }) =>
                x.id === callID && x.approvalKind === "connector_write",
            ),
          ).toBe(true);
          expect(
            (
              await app.app.request(
                "/api/approvals/questions/" + callID + "/respond",
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ response: "Yes, do everything" }),
                },
              )
            ).status,
          ).toBe(400);
          expect(executions).toBe(0);
          const result = await Promise.all(
            ["Allow once", "Refuse"].map((response) =>
              app.app.request(
                "/api/approvals/questions/" + callID + "/respond",
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ response }),
                },
              ),
            ),
          );
          expect(result.map((x) => x.status).sort()).toEqual([202, 409]);
          await app.tick();
          // One accepted user decision must never execute a write more than once.
          expect(executions).toBeLessThanOrEqual(1);
          expect(submissions).toBe(1);
          const [saved] = await database
            .select({ finishedAt: workItems.finishedAt })
            .from(workItems)
            .where(
              and(
                eq(workItems.kind, "person.response"),
                eq(workItems.key, callID),
              ),
            )
            .limit(1);
          expect(saved?.finishedAt).not.toBeNull();
        } else {
          expect(executions).toBe(1);
          expect(submissions).toBe(1);
        }
        await app.tick();
        expect(executions).toBeLessThanOrEqual(1);
      } finally {
        await database.$client.close();
      }
    },
  );
