import { expect, test } from "bun:test";
import {
  ManagedSourceBotRefusal,
  resolveManagedSourceBot,
} from "../src/agents/managed-source-definition";
import type { AgentProfileStore } from "../src/agents/profile-store";
import type { AgentProfile } from "../src/agents/profile-types";
import type { RegisteredAgent } from "../src/copilot";

const actor = { id: "owner-a", role: "user" as const };
const profile = {
  id: "bot-a",
  name: "Research Bot",
  title: "Researcher",
  roleDescription: "Find verifiable facts",
  deletedAt: null,
} as AgentProfile;

function context(overrides: {
  profile?: AgentProfile | null;
  registered?: RegisteredAgent[];
  roleContent?: unknown;
} = {}) {
  let profileReads = 0;
  let rosterReads = 0;
  const profiles = {
    get: async (readActor: typeof actor, botId: string) => {
      profileReads++;
      expect(readActor).toEqual(actor);
      expect(botId).toBe("bot-a");
      return overrides.profile === undefined ? profile : overrides.profile;
    },
  } as Pick<AgentProfileStore, "get">;
  return {
    actor,
    botId: "bot-a",
    profiles,
    registered: async (readActor: typeof actor) => {
      rosterReads++;
      expect(readActor).toEqual(actor);
      return overrides.registered ?? [{
        id: "bot-a", name: "Research Bot", type: "built_in",
        systemPrompt: "Never invent evidence.",
      }];
    },
    model: "test-model",
    roleMessage: ({ id, name }: { id: string; name: string }) => ({
      content: overrides.roleContent ?? `Role ${id}: ${name}`,
    }),
    reads: () => ({ profileReads, rosterReads }),
  };
}

test("original profile and registered built-in Bot define managed agent, with no ungoverned tools", async () => {
  const input = context();
  const result = await resolveManagedSourceBot(input);
  expect(result).toEqual({
    ownerUserId: "owner-a",
    botId: "bot-a",
    agent: {
      model: "test-model",
      instructions: "Role bot-a: Research Bot\n\nNever invent evidence.",
      tools: [],
    },
  });
  expect(input.reads()).toEqual({ profileReads: 1, rosterReads: 1 });
});

test("removed or unowned Bots never request registrations or execution", async () => {
  for (const value of [null, { ...profile, deletedAt: new Date() }]) {
    const input = context({ profile: value });
    await expect(resolveManagedSourceBot(input)).rejects.toBeInstanceOf(ManagedSourceBotRefusal);
    expect(input.reads()).toEqual({ profileReads: 1, rosterReads: 0 });
  }
});

test("remote endpoints and tombstones are NOT replaced with a managed agent", async () => {
  for (const entry of [
    { id: "bot-a", name: "Research Bot", type: "remote_ag_ui", endpoint: "https://other.test" },
    { id: "bot-a", name: "Research Bot", type: "unavailable", reason: "deleted" },
  ] as RegisteredAgent[][][number][]) {
    const input = context({ registered: [entry] });
    await expect(resolveManagedSourceBot(input)).rejects.toBeInstanceOf(ManagedSourceBotRefusal);
  }
});

test("an inconsistent profile/registration, blank role or system prompt is refused", async () => {
  for (const input of [
    context({ profile: { ...profile, id: "bot-b" } }),
    context({ registered: [] }),
    context({ registered: [{ id: "bot-a", name: "Bot", type: "built_in", systemPrompt: " " }] }),
    context({ roleContent: null }),
  ]) {
    await expect(resolveManagedSourceBot(input)).rejects.toBeInstanceOf(ManagedSourceBotRefusal);
  }
});
