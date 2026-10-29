import { expect, test } from "bun:test";
import { createManagedDevelopment } from "../src/agents/managed-development";
import { scheduleProposalNonce } from "../src/agents/managed-schedule-proposal";
import { DEV_ACTOR } from "../src/auth/dev-actor";
import { createDatabase } from "../src/db/client";

const url = process.env.TEST_DATABASE_URL;
for (const deleted of [false, true]) {
  test.skipIf(!url)(
    deleted
      ? "deleted approved schedule resumes its original question truthfully without recreating it"
      : "approved one-time source question resumes its settled creation after restart and elapsed run time",
    async () => {
      const database = createDatabase(url!);
      const sid = "sess_" + crypto.randomUUID().replaceAll("-", "");
      const root = "turn_" + crypto.randomUUID().replaceAll("-", "");
      const callID = "call_" + crypto.randomUUID().replaceAll("-", "");
      const now = Date.now(),
        runAt = Math.floor(now / 1000) + 7200;
      const call = {
        type: "function_call",
        name: "euphoria_propose_schedule",
        turn_id: root,
        call_id: callID,
        arguments: {
          instruction: "Send my reading reminder.",
          schedule_type: "once",
          run_at: runAt,
        },
      };
      let pending = true,
        creations = 0,
        submissions = 0,
        deletions = 0;
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
          return {
            id: sid,
            status: pending ? "waiting" : "idle",
            required_actions: pending ? [call] : [],
          };
        },
        async retrieveTurn() {
          return {
            id: root,
            session_id: sid,
            subagent_id: null,
            status: pending ? "waiting" : "completed",
          };
        },
        async listTurnItems() {
          return { data: [], has_more: false };
        },
        async listItems() {
          return { data: [], has_more: false };
        },
        async createAutomation() {
          creations++;
          return { id: "auto_" + sid };
        },
        async deleteAutomation() {
          deletions++;
        },
        async listAutomationInvocations() {
          return { data: [], has_more: false };
        },
        async submitToolResult(
          session: string,
          result: {
            turnID: string;
            callID: string;
            output: { accepted: boolean; text?: string };
          },
        ) {
          expect(session).toBe(sid);
          expect(result.turnID).toBe(root);
          expect(result.callID).toBe(callID);
          expect(result.output.accepted).toBe(!deleted);
          if (deleted)
            expect(result.output.text).toContain("subsequently deleted");
          submissions++;
          pending = false;
        },
      };
      const token = "offline-schedule-recovery-token-123456789012345";
      const options = {
        database,
        provider: provider as unknown as Parameters<
          typeof createManagedDevelopment
        >[0]["provider"],
        token,
        model: "offline-fixture",
        verifiedAutomationSpendingBoundary: async () => {},
      };
      const realNow = Date.now;
      try {
        const first = await createManagedDevelopment(options);
        const actor = { id: DEV_ACTOR.id, role: DEV_ACTOR.role };
        const bot = await first.profiles.create(actor, {
          name: "Reader",
          title: "Reading reminders",
          roleDescription: "Ask before scheduling",
          systemPrompt: "Ask before scheduling",
          visibility: "private",
        });
        const channel = await first.channels.create(actor, [bot.id]);
        const headers = {
          cookie: "euphoria-development=" + token,
          "content-type": "application/json",
        };
        const route = "/api/delivery/conversations/" + channel.id;
        expect(
          (
            await first.app.request(route + "/messages", {
              method: "POST",
              headers,
              body: JSON.stringify({
                agentId: bot.id,
                text: "Remind me to read this evening.",
                externalId: crypto.randomUUID(),
              }),
            })
          ).status,
        ).toBe(202);
        await first.tick();
        const questions = await first.app.request("/api/approvals", {
          headers,
        });
        expect(
          (await questions.json()).questions.some(
            (q: { id: string }) => q.id === callID,
          ),
        ).toBe(true);
        expect(
          (
            await first.app.request(
              "/api/approvals/questions/" + callID + "/respond",
              {
                method: "POST",
                headers,
                body: JSON.stringify({ response: "Allow once" }),
              },
            )
          ).status,
        ).toBe(202);
        // Commit the real source/provider-mock effect, then restart before its tool result.
        const created = await first.managedRoutines.createApprovedSchedule(
          actor.id,
          {
            channelId: channel.id,
            agentId: bot.id,
            instruction: call.arguments.instruction,
            requestId: scheduleProposalNonce(callID),
            runAt,
          },
        );
        expect(creations).toBe(1);
        if (deleted)
          await first.managedRoutines.change(
            actor.id,
            created.routineId,
            "delete",
            "delete_before_resume",
          );
        expect(submissions).toBe(0);
        Date.now = () => now + 3 * 60 * 60_000;
        const restored = await createManagedDevelopment(options);
        expect(
          (
            await restored.app.request(route + "/visual?agentId=" + bot.id, {
              headers,
            })
          ).status,
        ).toBe(200);
        await restored.tick();
        expect(creations).toBe(1);
        expect(submissions).toBe(1);
        expect(deletions).toBe(deleted ? 1 : 0);
      } finally {
        Date.now = realNow;
        await database.$client.close();
      }
    },
  );
}
