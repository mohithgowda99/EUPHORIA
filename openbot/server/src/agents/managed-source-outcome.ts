/**
 * Interpret ONLY a specific root turn's saved Agents API evidence.
 *
 * Session 'idle' does not imply success. A source task or Chat message
 * becomes complete only from an actual completed root turn. This parser
 * consumes managed provider state; it owns no execution loop or history.
 */
export type ManagedSourceTurnOutcome =
  | { kind: "pending" }
  | { kind: "waiting_for_human" }
  | { kind: "failed"; reason: "failed" | "cancelled" }
  | { kind: "completed"; replyText: string };

type ProviderTurn = {
  id?: unknown;
  status?: unknown;
  subagent_id?: unknown;
};
type ProviderItem = {
  type?: unknown;
  role?: unknown;
  status?: unknown;
  turn_id?: unknown;
  content?: unknown;
};

export function managedTurnOutcome(input: {
  sessionStatus: unknown;
  turnID: string;
  turns: { data?: ProviderTurn[] };
  items: { data?: ProviderItem[] };
  requiredActions?: readonly unknown[];
}): ManagedSourceTurnOutcome {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.turnID))
    throw new Error("Invalid original managed turn identity");
  if (Array.isArray(input.requiredActions) && input.requiredActions.length > 0)
    return { kind: "waiting_for_human" };
  const turns = Array.isArray(input.turns?.data) ? input.turns.data : [];
  const turn = turns.find((entry) =>
    entry.id === input.turnID &&
    (entry.subagent_id === null || entry.subagent_id === undefined));
  if (!turn) return { kind: "pending" };
  if (turn.status === "failed" || turn.status === "cancelled")
    return { kind: "failed", reason: turn.status };
  if (turn.status !== "completed") return { kind: "pending" };
  const matching = (Array.isArray(input.items?.data) ? input.items.data : [])
    .filter((item) => item.turn_id === input.turnID && item.type === "message" &&
      item.role === "assistant" && item.status === "completed");
  const text = matching.flatMap((item) => {
    const contents = Array.isArray(item.content) ? item.content : [];
    return contents.flatMap((part: unknown) => {
      if (!part || typeof part !== "object") return [];
      const p = part as { type?: unknown; text?: unknown };
      return p.type === "output_text" && typeof p.text === "string"
        ? [p.text] : [];
    });
  }).join("\n").slice(0, 8_000);
  // An empty response is possible; do not invent a successful tool or answer.
  return { kind: "completed", replyText: text };
}
