#!/usr/bin/env bash
set -euo pipefail

# Xcode and iOS simulator checks only. Does not write credentials or touch backend.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$ROOT/ios/Euphoria.xcodeproj"
SCHEME="Euphoria"
LOG_DIR="${EUPHORIA_BUILD_LOG_DIR:-$ROOT/ios/.build-logs}"
mkdir -p "$LOG_DIR"

command -v xcodebuild >/dev/null 2>&1 || { echo "BLOCKED: xcodebuild not found. Run on macOS with Xcode." >&2; exit 2; }
command -v xcrun >/dev/null 2>&1 || { echo "BLOCKED: xcrun not found." >&2; exit 2; }

xcodebuild -version
xcodebuild -showsdks
xcodebuild -list -project "$PROJECT"

for configuration in Debug Release; do
  echo "Building $configuration for iOS Simulator..."
  set -o pipefail
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$configuration" \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO build 2>&1 | tee "$LOG_DIR/$configuration-build.log"
done

if [[ -z "${EUPHORIA_SIMULATOR_ID:-}" ]]; then
  echo "BLOCKED: builds completed but XCTest not run. Select an installed iOS 27 simulator:" >&2
  xcrun simctl list devices available
  echo "Then: EUPHORIA_SIMULATOR_ID=<device-udid> bash ios/scripts/verify-xcode.sh" >&2
  exit 2
fi

echo "Running EuphoriaTests on simulator: $EUPHORIA_SIMULATOR_ID"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$EUPHORIA_SIMULATOR_ID" \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$LOG_DIR/Debug-tests.log"
echo "PASS: Xcode Debug build, Release build and Debug XCTest completed. See $LOG_DIR."
