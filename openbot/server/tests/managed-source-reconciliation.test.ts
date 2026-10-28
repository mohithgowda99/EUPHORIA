import { expect, test } from "bun:test";
import { reconcileManagedSourceInbox } from "../src/agents/managed-source-reconciliation";

const scope = {
  ownerUserId: "person",
  channelId: "channel",
  agentId: "bot",
  threadId: "thread",
};
const response = {
  id: "session",
  status: "idle",
  required_actions: [] as unknown[],
};
const turn = { id: "root", status: "completed" };
const item = {
  type: "message",
  role: "assistant",
  status: "completed",
  turn_id: "root",
  content: [{ type: "output_text", text: "Verified output" }],
};
function fixture() {
  let status = "accepted";
  let access = true;
  let bot = true;
  let checks = 0;
  let providerReads = 0;
  let root = { ...turn };
  let items = [item];
  let requirements: unknown[] = [];
  let linked = "session";
  let correctTurn = true;
  const replies: { text: string; source: string; scope: unknown }[] = [];
  const settled: string[] = [];
  const deps = {
    inboxId: "inbox",
    sessionID: "session",
    rootTurnID: "root",
    inbox: {
      inbox: async () => ({ ...scope, id: "inbox", state: status }),
      settleAcceptedInbox: async (_id: string, state: "sent" | "failed") => {
        if (status !== "accepted") return false;
        status = state;
        settled.push(state);
        return true;
      },
    },
    links: {
      read: async () => ({
        providerSessionId: linked,
        sourceThreadId: "thread",
      }),
    },
    provider: {
      retrieveSession: async () => {
        providerReads++;
        return { ...response, required_actions: requirements };
      },
      listTurns: async () => ({data: [root]}),
      listItems: async () => ({data: items}),
    },
    turnBelongsToInbox: async (request: { inboxId: string; sessionID: string; rootTurnID: string }) =>
      correctTurn && request.inboxId === "inbox" &&
      request.sessionID === "session" && request.rootTurnID === "root",
    authorise: async () => {
      checks++;
      return access;
    },
    botAvailable: async () => bot,
    recordSourceReply: async (actual: unknown, text: string, source: string) => {
      replies.push({scope: actual, text, source});
    },
  };
  return {
    deps, replies, settled,
    get status() { return status; },
    get providerReads() { return providerReads; },
    get checks() { return checks; },
    setAccess(value: boolean) { access = value; },
    setBot(value: boolean) { bot = value; },
    setLink(value: string) { linked = value; },
    setTurnBinding(value: boolean) { correctTurn = value; },
    setRoot(value: typeof turn) { root = value; },
    setItems(value: typeof items) { items = value; },
    setActions(value: unknown[]) { requirements = value; },
    setStatus(value: string) { status = value; },
  };
}

test("verified original owner and exact root turn publish one original source reply", async () => {
  const f = fixture();
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("completed");
  expect(f.replies).toEqual([{
    text: "Verified output",
    source: "delivery-reply:inbox",
    scope,
  }]);
  expect(f.settled).toEqual(["sent"]);
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("already_settled");
  expect(f.replies).toHaveLength(1);
});
test("provider session ID cannot be swapped across owner-scoped source channels", async () => {
  const f = fixture();
  f.setLink("foreign_session");
  await expect(reconcileManagedSourceInbox(f.deps)).rejects.toThrow(/not owned/);
  expect(f.providerReads).toBe(0);
  expect(f.replies).toHaveLength(0);
});
test("different completed root turn in the same provider session cannot impersonate the original inbox", async () => {
  const f = fixture();
  f.setTurnBinding(false);
  await expect(reconcileManagedSourceInbox(f.deps)).rejects.toThrow(/not bound/);
  expect(f.providerReads).toBe(0);
  expect(f.replies).toHaveLength(0);
});

test("revoked channel or deleted Bot refuses completion before any provider read", async () => {
  for (const revoke of ["channel", "bot"]) {
    const f = fixture();
    if (revoke === "channel") f.setAccess(false);
    else f.setBot(false);
    expect(await reconcileManagedSourceInbox(f.deps)).toBe("revoked");
    expect(f.providerReads).toBe(0);
    expect(f.replies).toHaveLength(0);
  }
});
test("unverified, foreign and incomplete turns never settle or post an answer", async () => {
  const f = fixture();
  f.setRoot({id:"other", status:"completed"});
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("pending");
  f.setRoot({id:"root",status:"in_progress"});
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("pending");
  f.setRoot({id:"root",status:"completed"});
  f.setItems([{...item, turn_id:"other"}]);
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("pending");
  expect(f.replies).toHaveLength(0);
  expect(f.settled).toHaveLength(0);
});
test("original approval gate remains intact when provider reports required_actions", async () => {
  const f = fixture();
  f.setActions([{type:"function_call",name:"purchase",call_id:"pending"}]);
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("waiting_for_human");
  expect(f.replies).toHaveLength(0);
  expect(f.settled).toHaveLength(0);
});
test("completed root without assistant output does not fabricate source completion", async () => {
  const f = fixture();
  f.setItems([]);
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("pending");
  expect(f.settled).toHaveLength(0);
});
test("verified root failure settles original delivery as failed without a fake reply", async () => {
  const f = fixture();
  f.setRoot({id:"root",status:"failed"});
  expect(await reconcileManagedSourceInbox(f.deps)).toBe("failed");
  expect(f.settled).toEqual(["failed"]);
  expect(f.replies).toHaveLength(0);
});
test("inbox not yet accepted is refused before provider read", async () => {
  const f = fixture();
  f.setStatus("queued");
  await expect(reconcileManagedSourceInbox(f.deps)).rejects.toThrow(/not accepted/);
  expect(f.providerReads).toBe(0);
});
