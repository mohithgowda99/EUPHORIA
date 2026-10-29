import { test, expect } from "bun:test";
import {
  parseHostedSkillMappings,
  grantedHostedSkillReferences,
} from "../src/agents/managed-hosted-skills";

const adapter = (skills: unknown[]) =>
  ({
    async listForAgent() {
      return { skills, tools: [] };
    },
  }) as unknown as Parameters<typeof grantedHostedSkillReferences>[0];

test("hosted skill mappings require immutable numeric versions and exact skill id", () => {
  const accepted = parseHostedSkillMappings({
    "source-analysis": { skillId: "skill_ABCDEF0123", version: "12" },
  });
  expect(accepted["source-analysis"].version).toBe("12");
  for (const invalid of [
    { "../injected": { skillId: "skill_ABCDEF0123", version: "1" } },
    { safe: { skillId: "skill_ABCDEF0123", version: "latest" } },
    { safe: { skillId: "bad", version: "1" } },
    { safe: { skillId: "skill_ABCDEF0123", version: "1", vault: "secret" } },
  ])
    expect(() => parseHostedSkillMappings(invalid)).toThrow();
});
test("original Bot grant and explicit operator mapping must intersect", async () => {
  const mappings = parseHostedSkillMappings({
    summarize: { skillId: "skill_ABCDEF0123", version: "2" },
    ungranted: { skillId: "skill_XXXXXX0123", version: "5" },
    toolskill: { skillId: "skill_YYYYYY0123", version: "3" },
  });
  const actual = await grantedHostedSkillReferences(
    adapter([
      { slug: "summarize", tools: [] },
      { slug: "toolskill", tools: ["ungranted/send_email"] },
      { slug: "unmapped", tools: [] },
    ]),
    "bot_test",
    mappings,
  );
  expect(actual).toEqual([
    { type: "skill_reference", skill_id: "skill_ABCDEF0123", version: "2" },
  ]);
  expect(
    await grantedHostedSkillReferences(adapter([]), "bot_test", mappings),
  ).toEqual([]);
});
