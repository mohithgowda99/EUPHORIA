#!/usr/bin/env bash
set -euo pipefail

# Offline, provider-free acceptance gate for the EUPHORIA integration branch.
# Never resets a checkout, touches main or invokes paid OpenAI sessions.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "feature/phase1-reuse-first-integration" ]]; then
  printf 'BLOCKED: wrong branch (%s); verify the integration branch.\n' "$BRANCH" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'BLOCKED: working tree has local changes; preserve/review them before a reproducible validation.' >&2
  git status --short
  exit 2
fi
printf 'Validating commit %s\n' "$(git rev-parse HEAD)"
for tool in bun node swift npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "BLOCKED: missing $tool" >&2; exit 2; }
done
node -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("BLOCKED: Node 24+ required");process.exit(2)}'
(
  cd openbot
  bun install --frozen-lockfile
  bun run --filter server typecheck
  bun test \
    server/tests/managed-source-definition.test.ts \
    server/tests/managed-source-reconciliation.test.ts \
    server/tests/delivery-router.test.ts \
    server/tests/delivery-turn.test.ts
)
(
  cd gateway
  npm ci --ignore-scripts
  npm test
)
(
  cd ios/VisualRuntimeCore
  swift test
)
if [[ "$(uname -s)" == "Darwin" ]]; then
  bash ios/scripts/verify-xcode.sh
else
  echo 'BLOCKED: iOS Xcode/Simulator validation requires macOS; server/core checks completed.' >&2
  exit 2
fi
printf 'PASS: offline backend and iOS build/test gates at %s\n' "$(git rev-parse --short HEAD)"
