/**
 * OpenAI-hosted browser opt-in. The developer/operator declares exact PUBLIC
 * documentation hostnames; the original Bot owner enables browsing separately.
 * Network restriction is enforced by OpenAI. Browser-origin approval remains
 * a separate durable user decision for EVERY requested origin.
 *
 * This mode is not suitable for sites supporting consequential writes or
 * account sign-in: origin approval does not approve individual clicks.
 */
export function parsePublicBrowserHosts(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const hosts = raw.split(",").map((x) => x.trim().toLowerCase());
  if (
    hosts.length > 12 ||
    hosts.some(
      (x) =>
        !x ||
        x.length > 120 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(x) ||
        /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(x) ||
        x.endsWith(".localhost") ||
        !["developers.openai.com", "www.rfc-editor.org", "www.w3.org"].includes(
          x,
        ),
    )
  )
    throw Error(
      "Browser mode only allows explicitly vetted public documentation hosts",
    );
  return [...new Set(hosts)];
}
export type OriginRequest = {
  request_id: string;
  request: { type: "browser_origin_access"; origin: string; reason?: string };
  allowed: boolean;
};
export function pendingPublicOrigin(
  actions: unknown[],
  hosts: readonly string[],
): OriginRequest[] {
  if (!Array.isArray(actions)) throw Error("Invalid provider action list");
  const output: OriginRequest[] = [];
  for (const raw of actions) {
    if (!raw || typeof raw !== "object")
      throw Error("Malformed provider approval");
    const item = raw as Record<string, unknown>;
    if (item.type !== "computer_use_approval_request") continue;
    const request = item.request as Record<string, unknown> | undefined;
    if (!request || request.type !== "browser_origin_access") continue;
    if (
      typeof item.request_id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.request_id) ||
      typeof request.origin !== "string"
    )
      throw Error("Malformed browser-origin request");
    let allowed = false;
    try {
      const parsed = new URL(request.origin);
      allowed =
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash &&
        parsed.pathname === "/" &&
        !parsed.port &&
        hosts.includes(parsed.hostname) &&
        parsed.origin === request.origin.replace(/\/$/, "");
    } catch {}
    output.push({
      request_id: item.request_id,
      request: {
        type: "browser_origin_access",
        origin: request.origin.slice(0, 512),
        reason:
          typeof request.reason === "string"
            ? request.reason.slice(0, 500)
            : undefined,
      },
      allowed,
    });
  }
  return output;
}
export function isPendingAuth(actions: unknown[]): boolean {
  return actions.some(
    (x) =>
      x &&
      typeof x === "object" &&
      (x as { type?: unknown; request?: { type?: unknown } }).type ===
        "computer_use_approval_request" &&
      (x as { request?: { type?: unknown } }).request?.type ===
        "browser_authentication",
  );
}
export function browserEnvironment(hosts: readonly string[]) {
  if (!hosts.length)
    throw Error("Read-only browser requires operator allowlisted hosts");
  return {
    type: "openai_hosted" as const,
    container_size: "small" as const,
    desktop: { enabled: true as const },
    network: { access: "restricted" as const, allowed_domains: [...hosts] },
  };
}
