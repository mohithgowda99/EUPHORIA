import { test, expect } from "bun:test";
import {
  projectHostedArtifact,
  attachmentName,
} from "../src/agents/managed-hosted-artifacts";
test("published artifacts require documented exact session/root and bounded output path", () => {
  const roots = new Set(["turn_owner"]);
  const good = {
    id: "art_1",
    session_id: "sess_owner",
    turn_id: "turn_owner",
    path: "/workspace/outputs/analysis.csv",
    size_bytes: 99,
  };
  expect(projectHostedArtifact(good, roots, "sess_owner")).toEqual({
    id: "art_1",
    turnId: "turn_owner",
    filename: "analysis.csv",
    sizeBytes: 99,
    mimeType: "application/octet-stream",
  });
  for (const invalid of [
    { ...good, turn_id: "turn_foreign" },
    { ...good, session_id: "sess_foreign" },
    { ...good, id: "../art" },
    { ...good, path: "/workspace/private/key.txt" },
    { ...good, path: "/workspace/outputs/../../secret" },
    { ...good, size_bytes: 100_000_000 },
    { ...good, size_bytes: -1 },
    { ...good, turn_id: null },
    { ...good, path: "/workspace/outputs/a\\b" },
    { ...good, path: "/workspace/outputs/" },
  ])
    expect(projectHostedArtifact(invalid, roots, "sess_owner")).toBeNull();
  expect(attachmentName("report final.pdf")).toBe("report_final.pdf");
});
