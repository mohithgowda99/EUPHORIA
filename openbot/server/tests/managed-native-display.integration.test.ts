import { expect, test } from "bun:test";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { createDatabase } from "../src/db/client";

const url = process.env.TEST_DATABASE_URL;
test.skipIf(!url)(
  "read-only native composition completes through original source receipts and reopens without provider access",
  async () => {
    const database = createDatabase(url!);
    const sid = "sess_" + crypto.randomUUID().replaceAll("-", "");
    const root = "root_" + crypto.randomUUID().replaceAll("-", "");
    const callID = "call_" + crypto.randomUUID().replaceAll("-", "");
    let pending = true,
      offline = false,
      submissions = 0;
    const args = {
      a2uiGraph: [
        {
          version: "v0.9",
          createSurface: {
            surfaceId: "research",
            catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
          },
        },
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: "research",
            components: [
              { id: "root", component: "Text", text: { path: "/finding" } },
            ],
          },
        },
        {
          version: "v0.9",
          updateDataModel: {
            surfaceId: "research",
            value: { finding: "A verified research result" },
          },
        },
      ],
    };
    const call = {
      type: "function_call",
      name: "euphoria_render_surface",
      call_id: callID,
      turn_id: root,
      arguments: args,
    };
    const provider = {
      async createSessionStream() {
        return {
          close() {},
          events: (async function* () {
            yield {
              type: "agent.session.created",
              event_id: "evt_" + sid,
              session: { id: sid },
            };
            yield {
              type: "agent.session.turn.created",
              event_id: "evt_" + root,
              session_id: sid,
              turn_id: root,
              turn: { id: root, session_id: sid, subagent_id: null },
            };
          })(),
        };
      },
      async retrieveSession() {
        if (offline) throw Error("Provider offline");
        return {
          id: sid,
          status: pending ? "waiting" : "idle",
          required_actions: pending ? [call] : [],
        };
      },
      async retrieveTurn() {
        if (offline) throw Error("Provider offline");
        return {
          id: root,
          session_id: sid,
          subagent_id: null,
          status: pending ? "waiting" : "completed",
        };
      },
      async listTurnItems() {
        if (offline) throw Error("Provider offline");
        return {
          data: pending
            ? []
            : [
                call,
                {
                  id: "reply_" + root,
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  turn_id: root,
                  content: [{ type: "output_text", text: "Research complete" }],
                },
              ],
          has_more: false,
        };
      },
      async listItems() {
        return this.listTurnItems();
      },
      async submitToolResult(
        _sid: string,
        result: { output: { status?: string; userAction?: unknown } },
      ) {
        expect(result.output.status).toBe("shown");
        expect(result.output.userAction).toBeUndefined();
        submissions++;
        pending = false;
      },
    };
    const token = "offline-native-display-fixture-123456789012345";
    try {
      const service = await createManagedDevelopment({
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        token,
        model: "offline-fixture",
      });
      const actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
      const bot = await service.profiles.create(actor, {
        name: "Research",
        title: "Test",
        roleDescription: "Research",
        systemPrompt: "Research",
        visibility: "private",
      });
      const channel = await service.channels.create(actor, [bot.id]);
      const headers = {
        cookie: "euphoria-development=" + token,
        "content-type": "application/json",
      };
      const route = "/api/delivery/conversations/" + channel.id;
      const query = "?agentId=" + bot.id;
      expect(
        (
          await service.app.request(route + "/messages", {
            method: "POST",
            headers,
            body: JSON.stringify({
              agentId: bot.id,
              text: "Show the research",
              externalId: crypto.randomUUID(),
            }),
          })
        ).status,
      ).toBe(202);
      await service.tick();
      const visual = await service.app.request(route + "/visual" + query, {
        headers,
      });
      expect(visual.status).toBe(200);
      const surface = (await visual.json()).surface;
      expect(surface.nodes[0].composition.components[0].component).toBe("Text");
      const action = {
        id: crypto.randomUUID(),
        surfaceID: surface.surfaceID,
        expectedRevision: surface.revision,
        nodeID: "composition",
        kind: "displayed",
        values: {},
      };
      const post = () =>
        service.app.request(route + "/visual/actions" + query, {
          method: "POST",
          headers,
          body: JSON.stringify(action),
        });
      expect(
        (await service.app.request(route + "/visual" + query)).status,
      ).toBe(401);
      expect((await post()).status).toBe(202);
      expect((await post()).status).toBe(202);
      await service.tick();
      expect(submissions).toBe(1);
      offline = true;
      const restarted = await createManagedDevelopment({
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        token,
        model: "offline-fixture",
      });
      const savedResponse = await restarted.app.request(
        route + "/visual" + query,
        { headers },
      );
      expect(savedResponse.status).toBe(200);
      const saved = await savedResponse.json();
      expect(
        saved.completedSurfaces[0].surface.nodes[0].composition.dataModel
          .finding,
      ).toBe("A verified research result");
      expect(saved.surface).toBeNull();
      expect(submissions).toBe(1);
      const history = await restarted.app.request(route + "/history" + query, {
        headers,
      });
      expect(history.status).toBe(200);
      const messages = (await history.json()).history.messages;
      expect(messages[0].role).toBe("user");
      expect(messages.at(-1).content[0].text).toBe("Research complete");
      expect(saved.completedSurfaces[0].afterMessageID).toBe(messages[0].id);
    } finally {
      await database.$client.close();
    }
  },
);
