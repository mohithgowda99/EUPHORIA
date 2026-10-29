/** Only fields explicitly published on OpenAI AutomationInvocation are trusted.
 * A completed delivery never proves root execution or identifies its turn.
 * No session/turn timestamp, "latest turn", or webhook can bridge the gap. */
export type AutomationDeliveryEvidence = {
  id: string;
  status: "queued" | "completed" | "failed" | "skipped";
  source: "manual" | "automation";
  sessionId: string | null;
  execution: "unverified" | "delivery_failed" | "delivery_skipped";
  rootTurnId: null;
};
const valid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export function inspectAutomationDelivery(
  raw: unknown,
  automationID: string,
  expectedSessionID: string,
): AutomationDeliveryEvidence {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid automation invocation");
  const item = raw as Record<string, unknown>;
  if (!valid(item.id) || item.automation_id !== automationID)
    throw new Error("Provider automation/invocation identity mismatch");
  if (
    !["queued", "completed", "failed", "skipped"].includes(String(item.status))
  )
    throw new Error("Invalid invocation delivery state");
  if (
    item.session_id !== null &&
    item.session_id !== undefined &&
    item.session_id !== expectedSessionID
  )
    throw new Error("Wrong target session; source attribution refused");
  const from = item.source;
  if (
    !from ||
    typeof from !== "object" ||
    !["manual", "automation"].includes(
      String((from as { type?: unknown }).type),
    )
  )
    throw new Error("Invalid invocation provenance");
  const status = item.status as AutomationDeliveryEvidence["status"];
  return {
    id: item.id,
    status,
    source: (from as { type: "manual" | "automation" }).type,
    sessionId: typeof item.session_id === "string" ? item.session_id : null,
    execution:
      status === "failed"
        ? "delivery_failed"
        : status === "skipped"
          ? "delivery_skipped"
          : "unverified",
    rootTurnId: null,
  };
}
export function advanceInvocationCursor(
  current: string | null,
  page: { has_more?: boolean; last_id?: string | null },
): string | null {
  if (!page.has_more) return null;
  if (!valid(page.last_id) || page.last_id === current)
    throw new Error("Invalid provider cursor; preserve saved position");
  return page.last_id;
}
