import type { AgentProfileStore } from "./profile-store";
import type { AgentActor, AgentProfile } from "./profile-types";
import type { RegisteredAgent, AgentStandingProfile } from "../copilot";

/**
 * Resolve ONE original OpenDuet Bot into an OpenAI Agents API definition.
 *
 * Product authority stays with AgentProfileStore, including owner/team grants,
 * deletion and availability. The caller supplies the same user-scoped registered
 * Bots that the original runtime uses. We do not build another Bot database.
 *
 * Deliberately refuses remote AG-UI/Mastra Bots: they own their own execution
 * endpoint and cannot be silently converted into a managed OpenAI Bot.
 *
 * No external tools are exposed at this stage. A later adapter must translate
 * the ORIGINAL PluginStore / approval policy into bounded, checked function
 * calls before enabling tools. Passing an MCP URL here would bypass grants.
 */
export async function resolveManagedSourceBot(input: {
  actor: AgentActor;
  botId: string;
  profiles: Pick<AgentProfileStore, "get">;
  registered: (actor: AgentActor) => Promise<RegisteredAgent[]>;
  model: string;
  roleMessage: (profile: AgentStandingProfile) => { content: unknown };
}): Promise<{
  ownerUserId: string;
  botId: string;
  agent: { model: string; instructions: string; tools: [] };
}> {
  if (
    !input.actor.id ||
    !input.botId ||
    !input.model ||
    input.model.length > 128
  ) {
    throw new ManagedSourceBotRefusal("Invalid managed Bot request");
  }
  const profile: AgentProfile | null = await input.profiles.get(
    input.actor,
    input.botId,
  );
  if (!profile || profile.id !== input.botId || profile.deletedAt) {
    throw new ManagedSourceBotRefusal("Bot is unavailable to this owner");
  }
  // Visibility alone is not enough. Team grants may be revoked while a
  // channel remains. The original Store.get is the authorization boundary.
  const entries = await input.registered(input.actor);
  const resolved = entries.find((agent) => agent.id === profile.id);
  if (!resolved || resolved.type !== "built_in") {
    throw new ManagedSourceBotRefusal(
      "This Bot has no supported managed OpenAI execution configuration",
    );
  }
  if (!resolved.systemPrompt.trim()) {
    throw new ManagedSourceBotRefusal("Bot instructions are unavailable");
  }
  const standing = input.roleMessage({
    id: profile.id,
    name: profile.name,
    title: profile.title,
    roleDescription: profile.roleDescription,
  });
  if (typeof standing.content !== "string" || !standing.content.trim()) {
    throw new ManagedSourceBotRefusal("Bot role instructions are unavailable");
  }
  return {
    ownerUserId: input.actor.id,
    botId: profile.id,
    agent: {
      model: input.model,
      instructions: [standing.content, resolved.systemPrompt].join("\n\n"),
      tools: [],
    },
  };
}

export class ManagedSourceBotRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedSourceBotRefusal";
  }
}
