import type { Message } from "@ag-ui/client";
import { PROVENANCE_GUIDANCE } from "@openbot/shared/bot-prompt";
import { UNTRUSTED_GUIDANCE } from "../untrusted-content";

export type StandingRoleMessage = Extract<Message, { role: "system" }>;

/** The durable part of a coworker: who it is and what its standing job is. */
export type AgentStandingProfile = {
  id: string;
  name: string;
  title: string;
  roleDescription: string;
};

/**
 * The coworker's job, as one system message.
 *
 * It is an ordinary AG-UI system message rather than `forwardedProps` or framework-specific state
 * because the endpoint on the other side may be LangGraph, Mastra, ADK or a hand-written server, and
 * a system message is the only thing all of them already understand. The id is derived from the
 * agent so a run can recognise a copy of it and refuse to send a second.
 */
export function standingRoleMessage(
  profile: AgentStandingProfile,
): StandingRoleMessage {
  return {
    id: `standing-role:${profile.id}`,
    role: "system",
    content: [
      `You are ${profile.name}, ${profile.title}.`,
      profile.roleDescription,
      "This standing role applies in every channel. Treat channel messages as task-specific instructions within it.",
      /*
       * Here rather than in the package, because for a remote Bot the standing role is the only
       * instruction there is: `role_description` is one sentence somebody wrote about what it is
       * for, and nothing else reaches it. The compliance Bot that answered a filing question with
       * thresholds and deadlines and no source was a `remote-ag-ui` agent whose entire prompt was
       * "Investigate policies, transaction monitoring, and control evidence."
       */
      PROVENANCE_GUIDANCE,
      // And for the same reason, how to read the untrusted-content envelope its tool results carry.
      UNTRUSTED_GUIDANCE,
    ].join("\n\n"),
  };
}
