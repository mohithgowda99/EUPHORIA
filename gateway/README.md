# Agents provider boundary

Internal server-side adapter for the future authenticated EUPHORIA gateway. Node 22+ built-ins; no packages, Docker, HTTP listener, public endpoint, or deployment. The existing OpenBot implementation is unchanged. This is not yet wired to the iOS app.

Run offline protocol tests from the repository root:

```sh
node --test gateway/tests/*.test.mjs
```

Tests use a local HTTP provider stub, never OpenAI. Default production requests target only `https://api.openai.com/v1/agents/sessions` and include `OpenAI-Beta: agents=v1`. The injectable fetch exists to test that network boundary.

`AgentsClient({apiKey})` creates sessions (explicit model, environment `none`), retrieves sessions, sends user messages, and returns JSON function results only for a matching current `required_actions` entry. The caller must persist each submission key and payload before sending. The adapter never retries writes. A lost response remains uncertain, and a HTTP202 is acceptance, not completion, and provider success is not proof an external action executed. A read-before-submit check cannot eliminate races; the provider must still accept the referenced pending call.

**This is transport, not authorization.** A gateway must authenticate the person, verify session ownership and tool grants, durably record pending operations, validate visual schemas and source-specific action payloads, and reconcile revisions before using this adapter. Do not expose it directly as a public proxy. A function result is not an instruction to execute a computer/browser effect.

Personal records stay on-device by default. Model input and provider session history are remote data, so selected context is necessarily sent off-device. A minimal gateway still needs ownership, credential and operation state; unattended work cannot depend on an open iPhone app. Sign in with Apple is a candidate for identity, not a substitute for server verification. Login, OAuth integrations, stream forwarding, durable gateway state, and deployment are unimplemented.

An application API key will be configured as a server secret, never committed or bundled in iOS. Live account access/model compatibility are unverified. Official protocol references checked 2026-10-28:
- https://developers.openai.com/api/docs/guides/agents-api/quickstart
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
