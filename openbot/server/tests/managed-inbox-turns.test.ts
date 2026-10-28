import { expect, test } from "bun:test";
import { checkedRootCreatedEvent } from "../src/agents/managed-inbox-turns";

const created = {
  type: "agent.session.turn.created",
  session_id: "sess_owner",
  turn_id: "turn_root",
  event_id: "evt_created",
  turn: {
    id: "turn_root",
    session_id: "sess_owner",
    subagent_id: null,
  },
};

test("root-created provider event is accepted only under matching canonical session", () => {
  expect(checkedRootCreatedEvent("sess_owner", created)).toBe("turn_root");
});

test("idle, wrong turn, foreign user/session and subagents cannot bind original Inbox", () => {
  for (const event of [
    {...created, type:"agent.session.idle"},
    {...created, type:"agent.session.turn.completed"},
    {...created, session_id:"sess_foreign"},
    {...created, turn_id:"turn_old"},
    {...created, event_id:"../untrusted"},
    {...created, turn:{...created.turn,subagent_id:"subagent_other"}},
    {...created, turn:{...created.turn,session_id:"sess_foreign"}},
  ]) {
    expect(() => checkedRootCreatedEvent("sess_owner",event)).toThrow();
  }
});

test("invalid provider IDs cannot escape the original Inbox correlation boundary", () => {
  for (const id of ["../foreign", "https://evil.test", "", "turn/path"]) {
    expect(() => checkedRootCreatedEvent(id, created)).toThrow();
  }
});
