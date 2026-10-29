import { expect, test } from "bun:test";
import { PROVENANCE_GUIDANCE } from "@openbot/shared/bot-prompt";
import { standingRoleMessage } from "../src/agents/standing-role";
import { UNTRUSTED_GUIDANCE } from "../src/untrusted-content";

test("managed role preserves original instructions and untrusted-source boundary byte for byte", () => {
  const profile = {
    id: "bot-1",
    name: "Research",
    title: "Analyst",
    roleDescription:
      "Investigate the user's question.\nKeep the original scope.",
  };
  expect(standingRoleMessage(profile)).toEqual({
    id: "standing-role:bot-1",
    role: "system",
    content: [
      "You are Research, Analyst.",
      profile.roleDescription,
      "This standing role applies in every channel. Treat channel messages as task-specific instructions within it.",
      PROVENANCE_GUIDANCE,
      UNTRUSTED_GUIDANCE,
    ].join("\n\n"),
  });
});

test("managed execution imports the role helper without importing the legacy runtime entry", async () => {
  const source = await Bun.file(
    new URL("../src/agents/managed-development.ts", import.meta.url),
  ).text();
  expect(source).not.toMatch(/from\s+["']\.\.\/copilot["']/);
});
