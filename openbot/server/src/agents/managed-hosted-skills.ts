import type { PluginStore } from "../plugins/store";

export type PinnedHostedSkill = {
  type: "skill_reference";
  skill_id: string;
  version: string;
};
export type HostedSkillMapping = Record<
  string,
  { skillId: string; version: string }
>;
const skillID = (value: unknown) =>
  typeof value === "string" && /^skill_[A-Za-z0-9_-]{4,56}$/.test(value);
const versionID = (value: unknown) =>
  typeof value === "string" && /^[1-9][0-9]{0,8}$/.test(value);
const slug = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value);

/**
 * Operator-owned allowlist, intersected with the ORIGINAL current Bot skill
 * grants. No implicit "latest" versions, arbitrary ZIP, vault or permissions.
 */
export function parseHostedSkillMappings(raw: unknown): HostedSkillMapping {
  if (raw == null || raw === "") return {};
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length > 20
  )
    throw Error("Invalid hosted skill mapping allowlist");
  const result: HostedSkillMapping = Object.create(null) as HostedSkillMapping;
  for (const [name, value] of Object.entries(data)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(name) ||
      !slug(name) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      throw Error("Invalid mapped skill");
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).sort().join(",") !== "skillId,version" ||
      !skillID(config.skillId) ||
      !versionID(config.version)
    )
      throw Error(
        "Hosted skills require explicit immutable provider id and numeric version",
      );
    result[name] = {
      skillId: config.skillId as string,
      version: config.version as string,
    };
  }
  return result;
}

export async function grantedHostedSkillReferences(
  store: Pick<PluginStore, "listForAgent">,
  botID: string,
  map: HostedSkillMapping,
): Promise<PinnedHostedSkill[]> {
  const grants = await store.listForAgent(botID);
  const out: PinnedHostedSkill[] = [];
  const ids = new Set<string>();
  for (const skill of grants.skills) {
    const ref = map[skill.slug];
    if (!ref || !skillID(ref.skillId) || !versionID(ref.version)) continue;
    if (Array.isArray(skill.tools) && skill.tools.length) continue; // A source tool grant is NOT a sandbox grant.
    if (ids.has(ref.skillId)) throw Error("Duplicate hosted skill id");
    ids.add(ref.skillId);
    out.push({
      type: "skill_reference",
      skill_id: ref.skillId,
      version: ref.version,
    });
    if (out.length > 4) throw Error("Maximum hosted skill count exceeded");
  }
  return out;
}
