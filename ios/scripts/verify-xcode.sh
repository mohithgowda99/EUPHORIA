#!/usr/bin/env bash
set -euo pipefail

# Build and XCTest evidence capture; run on macOS with Xcode and iOS 27 Simulator.
# No credentials, deployment configuration changes, or mock agent responses.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$ROOT/ios/Euphoria.xcodeproj"
SCHEME="Euphoria"
LOG_DIR="${EUPHORIA_BUILD_LOG_DIR:-$ROOT/ios/.build-logs}"
DERIVED_DATA="$LOG_DIR/DerivedData"
mkdir -p "$LOG_DIR"

command -v xcodebuild >/dev/null 2>&1 || { echo "BLOCKED: xcodebuild missing; run on a Mac." >&2; exit 2; }
command -v xcrun >/dev/null 2>&1 || { echo "BLOCKED: xcrun missing." >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: python3 needed to verify xcresult counts." >&2; exit 2; }
command -v plutil >/dev/null 2>&1 || { echo "BLOCKED: plutil missing." >&2; exit 2; }

xcodebuild -version
xcodebuild -showsdks
SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
if [[ "$SDK_VERSION" != 27.* ]]; then
  echo "BLOCKED: iOS 27 simulator SDK required; found $SDK_VERSION." >&2
  exit 2
fi
xcodebuild -list -project "$PROJECT"

for configuration in Debug Release; do
  echo "Building $configuration for iOS Simulator..."
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$configuration" \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$DERIVED_DATA" \
    CODE_SIGNING_ALLOWED=NO build 2>&1 | tee "$LOG_DIR/$configuration-build.log"
done

# Inspect the *built* bundles, not just plist source. This does NOT prove runtime ATS.
DEBUG_PLIST="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/Euphoria.app/Info.plist"
RELEASE_PLIST="$DERIVED_DATA/Build/Products/Release-iphonesimulator/Euphoria.app/Info.plist"
[[ -f "$DEBUG_PLIST" && -f "$RELEASE_PLIST" ]] || {
  echo "FAIL: app Info.plist missing from an Xcode build product." >&2
  exit 1
}
plutil -lint "$DEBUG_PLIST" "$RELEASE_PLIST"
DEBUG_LOCAL="$(plutil -extract NSAppTransportSecurity.NSAllowsLocalNetworking raw -o - "$DEBUG_PLIST")"
if [[ "$DEBUG_LOCAL" != "true" && "$DEBUG_LOCAL" != "1" ]]; then
  echo "FAIL: Debug built bundle does not allow local networking." >&2
  exit 1
fi
if plutil -extract NSAppTransportSecurity.NSAllowsLocalNetworking raw -o - "$RELEASE_PLIST" >/dev/null 2>&1; then
  echo "FAIL: Release built bundle unexpectedly enables local-network ATS exception." >&2
  exit 1
fi
echo "PASS: built Debug local ATS key is true; Release does not contain it."

if [[ -z "${EUPHORIA_SIMULATOR_ID:-}" ]]; then
  echo "BLOCKED: XCTest not run. Set EUPHORIA_SIMULATOR_ID to an installed iOS 27 simulator:" >&2
  xcrun simctl list devices available
  exit 2
fi

RESULT_BUNDLE="$LOG_DIR/Debug-tests-$(date +%Y%m%dT%H%M%S)-$$.xcresult"
echo "Running EuphoriaTests on iOS 27 simulator $EUPHORIA_SIMULATOR_ID"
# Preserve the xcresult even when the test action exits nonzero.
set +e
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$EUPHORIA_SIMULATOR_ID" \
  -derivedDataPath "$DERIVED_DATA" -resultBundlePath "$RESULT_BUNDLE" \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$LOG_DIR/Debug-tests.log"
test_exit=${PIPESTATUS[0]}
set -e

if [[ ! -d "$RESULT_BUNDLE" ]]; then
  echo "FAIL: Xcode did not produce an xcresult bundle." >&2
  exit 1
fi
SUMMARY="$LOG_DIR/Debug-tests-summary.json"
xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE" --format json > "$SUMMARY"
python3 - "$SUMMARY" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    summary = json.load(f)

fields = ("totalTestCount", "passedTests", "failedTests", "skippedTests")
counts = {}
for field in fields:
    value = summary.get(field)
    if type(value) is not int or value < 0:
        raise SystemExit(f"FAIL: xcresult missing or invalid {field}: {value!r}")
    counts[field] = value

print("Xcode xcresult:",
      f"executed={counts['totalTestCount']}",
      f"passed={counts['passedTests']}",
      f"failed={counts['failedTests']}",
      f"skipped={counts['skippedTests']}",
      f"status={summary.get('result')}")
if counts["totalTestCount"] != sum(counts[k] for k in fields[1:]):
    raise SystemExit("FAIL: xcresult test counts are inconsistent.")
if counts != dict(totalTestCount=6, passedTests=6, failedTests=0, skippedTests=0):
    raise SystemExit("FAIL: expected exactly 6 XCTest passes, with no failures or skips.")
if str(summary.get("result", "")).strip().lower() not in ("passed", "success", "succeeded"):
    raise SystemExit("FAIL: xcresult overall test action was not successful.")
PY

if (( test_exit != 0 )); then
  echo "FAIL: xcodebuild test exited with status $test_exit despite xcresult summary." >&2
  exit "$test_exit"
fi
echo "PASS: Debug and Release builds, built-plist checks, and all 6 XCTest cases."
echo "Evidence retained locally in $LOG_DIR (ignored by Git)."
echo "NOTE: Actual simulator-to-local-OpenBot HTTP and HTTPS ATS smoke tests remain separate."
