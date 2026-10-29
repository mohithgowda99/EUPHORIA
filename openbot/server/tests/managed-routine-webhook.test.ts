import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyManagedSessionWebhook } from "../src/routines/managed-automation-webhook";

const secret =
  "whsec_" +
  Buffer.from("fixture-key-is-not-a-real-webhook-secret").toString("base64");
const now = 1793270000000;
const event = {
  object: "event",
  id: "evt_fixture_1",
  type: "agent.session.idle",
  data: { id: "sess_fixture_1" },
};
function signed(
  body: Uint8Array,
  timestamp = String(Math.floor(now / 1000)),
  id = "wh_fixture_1",
) {
  const mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(Buffer.from(id + "." + timestamp + ".", "utf8"))
    .update(body)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": "v1," + mac,
  });
}
test("OpenAI signed session webhook validates exact bytes and source session identity", () => {
  const body = Buffer.from(JSON.stringify(event));
  assert.deepEqual(
    verifyManagedSessionWebhook({ body, headers: signed(body), secret, now }),
    {
      webhookId: "wh_fixture_1",
      eventId: "evt_fixture_1",
      eventType: "agent.session.idle",
      sessionId: "sess_fixture_1",
    },
  );
});
test("tampered webhook payload, missing signature, expired delivery and spoofed event fail", () => {
  const body = Buffer.from(JSON.stringify(event));
  for (const options of [
    {
      body: Buffer.from(
        JSON.stringify({ ...event, data: { id: "sess_attacker" } }),
      ),
      headers: signed(body),
    },
    {
      body,
      headers: new Headers({
        "webhook-id": "wh_fixture_1",
        "webhook-timestamp": String(Math.floor(now / 1000)),
      }),
    },
    { body, headers: signed(body, String(Math.floor(now / 1000) - 600)) },
  ])
    assert.throws(() =>
      verifyManagedSessionWebhook({ ...options, secret, now }),
    );
  const malformed = Buffer.from(
    JSON.stringify({ ...event, type: "agent.session.turn.completed" }),
  );
  assert.throws(() =>
    verifyManagedSessionWebhook({
      body: malformed,
      headers: signed(malformed),
      secret,
      now,
    }),
  );
});
test("reject forged weak secrets and oversized raw requests", () => {
  const body = Buffer.from(JSON.stringify(event));
  assert.throws(() =>
    verifyManagedSessionWebhook({
      body,
      headers: signed(body),
      secret: "whsec_Zg==",
      now,
    }),
  );
  const huge = Buffer.alloc(260000, 1);
  assert.throws(() =>
    verifyManagedSessionWebhook({
      body: huge,
      headers: signed(huge),
      secret,
      now,
    }),
  );
});
