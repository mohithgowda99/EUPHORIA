/**
 * OpenDuet's task status priority. This pure source-owned module is shared with
 * adapters that cannot load the OpenBot Postgres/Drizzle/Hono runtime.
 *
 * The rule is unchanged from openduet/task-store.ts: the first condition wins.
 * No provider session being idle can independently prove a task has succeeded.
 */
export type TaskStatus =
  | "needs_input"
  | "working"
  | "resolved"
  | "failed"
  | "ready_for_review";

/** The original source's status rule, isolated from storage, transport and UI. */
export function taskStatus(state: {
  resolved: boolean;
  needsInput: boolean;
  working: boolean;
  failed?: boolean;
}): TaskStatus {
  if (state.needsInput) return "needs_input";
  if (state.working) return "working";
  if (state.resolved) return "resolved";
  if (state.failed) return "failed";
  return "ready_for_review";
}
