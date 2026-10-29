import { test, expect } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  inspectAutomationDelivery,
  advanceInvocationCursor,
} from "../src/routines/managed-automation-identity";
import { createApnsPushTransport } from "../src/delivery/apns";

const base = {
  id: "inv_001",
  automation_id: "auto_001",
  status: "completed",
  session_id: "sess_001",
  source: { type: "automation" },
};
test("delivery is never root execution, even with an undocumented turn_id", () => {
  const value = inspectAutomationDelivery(
    { ...base, turn_id: "turn_latest" },
    "auto_001",
    "sess_001",
  );
  expect(value.execution).toBe("unverified");
  expect(value.rootTurnId).toBeNull();
  expect(value.status).toBe("completed");
});
test("delivery failure and skipped are not agent success", () => {
  expect(
    inspectAutomationDelivery(
      { ...base, status: "failed" },
      "auto_001",
      "sess_001",
    ).execution,
  ).toBe("delivery_failed");
  expect(
    inspectAutomationDelivery(
      { ...base, status: "skipped" },
      "auto_001",
      "sess_001",
    ).execution,
  ).toBe("delivery_skipped");
  expect(
    inspectAutomationDelivery(
      { ...base, status: "queued" },
      "auto_001",
      "sess_001",
    ).execution,
  ).toBe("unverified");
});
test("scope isolation fails on cross-automation, cross-session and malformed identity", () => {
  expect(() =>
    inspectAutomationDelivery(
      { ...base, automation_id: "foreign" },
      "auto_001",
      "sess_001",
    ),
  ).toThrow();
  expect(() =>
    inspectAutomationDelivery(
      { ...base, session_id: "other" },
      "auto_001",
      "sess_001",
    ),
  ).toThrow();
  expect(() =>
    inspectAutomationDelivery({ ...base, id: "?" }, "auto_001", "sess_001"),
  ).toThrow();
  expect(() =>
    inspectAutomationDelivery(
      { ...base, source: { type: "unknown" } },
      "auto_001",
      "sess_001",
    ),
  ).toThrow();
});
test("manual and schedule provenance stay distinct", () => {
  expect(
    inspectAutomationDelivery(
      { ...base, source: { type: "manual" } },
      "auto_001",
      "sess_001",
    ).source,
  ).toBe("manual");
  expect(inspectAutomationDelivery(base, "auto_001", "sess_001").source).toBe(
    "automation",
  );
});
test("pagination advances or restarts without guessing a lost page", () => {
  expect(
    advanceInvocationCursor(null, { has_more: true, last_id: "inv_002" }),
  ).toBe("inv_002");
  expect(advanceInvocationCursor("inv_002", { has_more: false })).toBeNull();
  expect(() =>
    advanceInvocationCursor("inv_002", { has_more: true, last_id: "inv_002" }),
  ).toThrow();
  expect(() => advanceInvocationCursor(null, { has_more: true })).toThrow();
});
test("APNs validates signer and deliberately exposes no delivery-receipt API", () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const transport = createApnsPushTransport({
    teamId: "ABCDEFGHIJ",
    keyId: "ABCDEFGHIJ",
    bundleId: "com.example.euphoria",
    privateKey,
    environment: "sandbox",
  });
  expect(transport.receipt).toBeUndefined();
  expect(() =>
    createApnsPushTransport({
      teamId: "INVALID",
      keyId: "ABCDEFGHIJ",
      bundleId: "com.example.euphoria",
      privateKey,
      environment: "sandbox",
    }),
  ).toThrow();
});
