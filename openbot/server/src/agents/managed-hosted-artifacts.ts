/**
 * Provider publishes immutable artifacts as {session_id, turn_id, path, size_bytes}.
 * Root correlation comes from ORIGINAL source Inbox, not the session alone.
 * The provider does not advertise a filename/mime field: never depend on one.
 */
export type HostedArtifact = {
  id: string;
  turnId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};
const safeID = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s);
export function projectHostedArtifact(
  raw: unknown,
  allowedRoots: ReadonlySet<string>,
  expectedSession: string,
): HostedArtifact | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (
    !safeID(v.turn_id) ||
    !safeID(v.id) ||
    v.session_id !== expectedSession ||
    !allowedRoots.has(v.turn_id)
  )
    return null;
  const path = v.path;
  if (
    typeof path !== "string" ||
    !path.startsWith("/workspace/outputs/") ||
    path.length > 1024 ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  )
    return null;
  const parts = path.split("/");
  const filename = parts.at(-1) ?? "";
  if (!filename || filename.length > 180 || Array.from(filename).some((ch) => ch.charCodeAt(0) < 32))
    return null;
  if (
    !Number.isSafeInteger(v.size_bytes) ||
    Number(v.size_bytes) < 0 ||
    Number(v.size_bytes) > 8 * 1024 * 1024
  )
    return null;
  return {
    id: v.id,
    turnId: v.turn_id,
    filename,
    mimeType: "application/octet-stream",
    sizeBytes: Number(v.size_bytes),
  };
}
export function attachmentName(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 140) || "artifact";
}
