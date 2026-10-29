import { describe, expect, test } from "bun:test";
import {
  MANAGED_PROPOSE_SCHEDULE_TOOL,
  parseManagedScheduleCall,
  parseManagedScheduleProposal,
  scheduleProposalNonce,
  scheduleProposalPreview,
} from "../src/agents/managed-schedule-proposal";

const future = 2_000_000_000,
  now = future - 3600;
const once = {
  instruction: "Send a briefing.",
  schedule_type: "once",
  run_at: future,
};
const recurring = {
  instruction: "Summarize the week.",
  schedule_type: "recurring",
  cron: "0 9 * * MON",
  timezone: "Asia/Kolkata",
};
describe("Bot schedule requests are proposals, never provider authorizations", () => {
  test("advertises only a proposal tool", () => {
    expect(MANAGED_PROPOSE_SCHEDULE_TOOL.name).toBe(
      "euphoria_propose_schedule",
    );
    expect(MANAGED_PROPOSE_SCHEDULE_TOOL.description).toContain(
      "NEVER activates",
    );
  });
  test("accepts strict one-time future proposal and shows immutable preview", () => {
    const parsed = parseManagedScheduleProposal(once, now);
    expect(parsed.run_at).toBe(future);
    expect(scheduleProposalPreview(parsed)).toContain("Send a briefing");
    expect(scheduleProposalPreview(parsed)).toContain(
      new Date(future * 1000).toISOString(),
    );
  });
  test("accepts recurring schedule but cannot turn it into a one-time proposal silently", () => {
    expect(parseManagedScheduleProposal(recurring, now).schedule_type).toBe(
      "recurring",
    );
    expect(() =>
      parseManagedScheduleProposal({ ...recurring, run_at: future }, now),
    ).toThrow();
    expect(() =>
      parseManagedScheduleProposal({ ...once, cron: "* * * * *" }, now),
    ).toThrow();
  });
  test("refuses stale, near-term and unbounded or malformed schedules", () => {
    for (const run_at of [
      0,
      now,
      now + 899,
      now + 366 * 86400 + 1,
      1.5,
      "2000000000",
    ]) {
      expect(() =>
        parseManagedScheduleProposal({ ...once, run_at }, now),
      ).toThrow();
    }
    for (const bad of [
      { ...once, ownerUserId: "somebody_else" },
      { ...once, instruction: "" },
      { ...once, instruction: "a".repeat(2001) },
      { ...recurring, timezone: null },
      { ...recurring, cron: "" },
      { ...once, schedule_type: "unknown" },
    ]) {
      expect(() => parseManagedScheduleProposal(bad, now)).toThrow();
    }
  });
  test("exact root call is required; no model-supplied owner or authorization", () => {
    const call = {
      type: "function_call",
      name: "euphoria_propose_schedule",
      call_id: "call_123",
      turn_id: "turn_456",
      arguments: recurring,
    };
    const parsed = parseManagedScheduleCall(call);
    expect(parsed.call_id).toBe("call_123");
    expect(parsed.arguments.schedule_type).toBe("recurring");
    expect(() => parseManagedScheduleCall({ ...call, turn_id: "" })).toThrow();
    expect(() =>
      parseManagedScheduleCall({ ...call, name: "euphoria_connected_mcp" }),
    ).toThrow();
    expect(() =>
      parseManagedScheduleCall({
        ...call,
        ownerUserId: "imposter",
        arguments: { ...once, ownerUserId: "imposter" },
      }),
    ).toThrow();
  });
  test("stable provider call identity yields stable bounded request nonce", () => {
    expect(scheduleProposalNonce("call_123")).toBe(
      scheduleProposalNonce("call_123"),
    );
    expect(scheduleProposalNonce("call_123")).not.toBe(
      scheduleProposalNonce("call_124"),
    );
    expect(scheduleProposalNonce("call_123")).toHaveLength(32);
    expect(() => scheduleProposalNonce("!!!")).toThrow();
  });
});

test("restoring an exact saved call preserves elapsed time without admitting a new past proposal", () => {
  const call = {
    type: "function_call",
    name: "euphoria_propose_schedule",
    call_id: "call_elapsed",
    turn_id: "turn_elapsed",
    arguments: { ...once, run_at: 1_600_000_000 },
  };
  expect(() => parseManagedScheduleCall(call)).toThrow();
  expect(parseManagedScheduleCall(call, "restored").arguments.run_at).toBe(
    1_600_000_000,
  );
  for (const run_at of [0, -1, Infinity, 9_000_000_000_000, 1.5, "1600000000"])
    expect(() =>
      parseManagedScheduleCall(
        { ...call, arguments: { ...call.arguments, run_at } },
        "restored",
      ),
    ).toThrow();
  expect(() =>
    parseManagedScheduleCall(
      { ...call, arguments: { ...call.arguments, ownerUserId: "imposter" } },
      "restored",
    ),
  ).toThrow();
});
