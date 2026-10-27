#!/usr/bin/env python3
"""Read-only OpenBot readiness probe. No cookies, model keys, or agent execution.

Usage from the repo root, with the *existing* local OpenBot service running:
    python3 ios/scripts/inspect-openbot-fixture.py http://127.0.0.1:3001

This is a Mac-host readiness diagnostic, NOT an iOS ATS, native auth,
cross-user authorization, or real agent-run integration test.
"""
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

origin = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3001").strip().rstrip("/")
parts = urlsplit(origin)
if (
    not parts.hostname
    or parts.scheme not in ("http", "https")
    or (parts.scheme == "http" and parts.hostname.lower() not in ("localhost", "127.0.0.1", "::1"))
    or parts.username is not None
    or parts.password is not None
    or parts.path not in ("", "/")
    or parts.query
    or parts.fragment
):
    raise SystemExit("Use only an HTTPS deployment origin, or loopback HTTP for local development.")
if len(sys.argv) > 2:
    raise SystemExit("Usage: python3 ios/scripts/inspect-openbot-fixture.py [openbot-origin]")

# No cookie jar, bearer token, auth header, or data persistence.
def read(path):
    request = urllib.request.Request(origin + path, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return response.status, response.read(250_000)
    except urllib.error.HTTPError as error:
        return error.code, b""
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"{path}: UNREACHABLE ({type(error).__name__})")
        return None, b""


ok = True
for path in ("/health", "/api/capabilities", "/api/me", "/api/copilotkit/info"):
    status, body = read(path)
    if status is None:
        ok = False
        continue
    print(f"{path}: HTTP {status}")
    if path == "/api/me":
        print("  This request has no user session; 200 may reflect single-user development mode.")
        continue
    if status != 200:
        ok = False
        continue
    if path not in ("/api/capabilities", "/api/copilotkit/info"):
        continue
    try:
        parsed = json.loads(body)
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
    except (ValueError, UnicodeDecodeError):
        print("  Invalid JSON response; readiness NOT verified.")
        ok = False
        continue
    if path == "/api/capabilities":
        print("  Capability shape decoded (values intentionally suppressed).")
        continue

    entitlement = parsed.get("runtimeEntitlements")
    if not isinstance(entitlement, dict):
        print("  runtimeEntitlements: missing; readiness NOT verified.")
        ok = False
        continue
    status_value = entitlement.get("status")
    print("  runtimeEntitlements:", status_value if status_value in
          ("ready", "degraded", "misconfigured", "unavailable") else "unknown")
    error = entitlement.get("error")
    code = error.get("code") if isinstance(error, dict) else None
    if isinstance(code, str) and code.replace("_", "").isalnum() and len(code) <= 90:
        print("  error code:", code)
    if status_value != "ready":
        print("  BLOCKED: HTTP 200 does not establish runtime entitlement readiness.")
        ok = False
    thread_endpoints = parsed.get("threadEndpoints")
    if isinstance(thread_endpoints, dict):
        for feature in ("list", "inspect", "mutations", "realtimeMetadata"):
            print(f"  threadEndpoints.{feature}: {thread_endpoints.get(feature) is True}")
    else:
        print("  threadEndpoints: not advertised (check deployed runtime version).")

print("No native login, AG-UI run, WebSocket join or thread authorization was exercised.")
if not ok:
    raise SystemExit("BLOCKED: local service/entitlement prerequisites not established.")
print("PASS: read-only host-side service reachability and reported entitlement status.")
