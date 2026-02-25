# Agent Notes (CLI)

This CLI primarily targets sync workflows. Agent chat streaming via the legacy endpoint is deprecated.

## Deprecation: Legacy Chat Streaming

- The legacy chat streaming endpoint (`/api/chat/stream`) is deprecated. It uses the backend core agent
  (createMultiAgentFromEnv / Agent.stream), streams SSE directly on the HTTP response, and does not
  use Mercure. Prefer the JolliAgent-backed collab flow where available.
