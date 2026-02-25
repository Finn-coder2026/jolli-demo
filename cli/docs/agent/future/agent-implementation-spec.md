# JolliAgent CLI Implementation Spec

## Goal

Enable JolliAgent to be used from the CLI installed on end-user machines while keeping the **session
state on the server** and executing **tools locally** on the client. The server runs the agent loop
and streams responses; the client executes tool calls (file I/O, git, etc.) and returns results.

## Non-Goals

- Replacing the current sync CLI or its protocol.
- Rebuilding the existing collab UI; this is a CLI-first flow.
- Storing or executing any tool logic on the server that must touch the user's local filesystem.

## Requirements

- **Server-owned sessions**: conversation history and tool results stored server-side.
- **Local tools**: `write_file`, `write_file_chunk`, `ls`, `cat`, `git_*`, etc. run on the user's machine.
- **Streaming**: CLI receives token deltas as they are generated.
- **Docs written locally**: via existing write tools (plus any necessary additions).
- **Auth**: reuse existing CLI auth token; no LLM API keys on the client.

## Current State (Relevant)

- JolliAgent runs server-side via `runWorkflowForJob` from `jolli-agent/workflows` or through the backend (CollabConvoRouter, onboarding tools).
- Backend collab flow uses JolliAgent `Agent.chatTurn` and streams over SSE/Mercure.
- CLI (`cli/`) is a sync client; does not run agent chat.

### Codebase pointers

- JolliAgent runtime and tools:
  - `tools/jolliagent/src/agents/Agent.ts`
  - `tools/jolliagent/src/tools/Tools.ts`
  - `tools/jolliagent/src/tools/tools/index.ts`
- Collab (JolliAgent-backed) streaming path:
  - `backend/src/router/CollabConvoRouter.ts`
  - `backend/src/adapters/AgentChatAdapter.ts`
- Legacy chat streaming path (deprecated):
  - `backend/src/router/ChatRouter.ts`
  - `common/src/core/ChatClient.ts`

## Proposed Architecture (Recommended)

**Server runs the agent loop. Client acts as a remote ToolHost.**

```
CLI (local tools) <--- WS/SSE+POST ---> Server (JolliAgent chatTurn)
```

### Key components

- **Server Session Service**
  - Owns history, model selection, and JolliAgent `Agent.chatTurn`.
  - For each tool call, forwards the call to the CLI tool host and awaits the result.

- **CLI Tool Host**
  - Exposes tool manifest + capabilities.
  - Executes tool calls locally and returns outputs.
  - Applies strict path policy to keep operations within a configured workspace root.

## Transport

### Recommended: WebSocket (bi-directional)

- Single connection for:
  - user messages
  - streaming deltas
  - tool call requests and results
  - heartbeats, errors

### Alternate: SSE + POST (fallback)

- SSE from server to client for deltas + tool calls.
- HTTP POST back for tool results.
- More complex correlation and retry behavior.

## Protocol (WebSocket)

All payloads are JSON with a `type` field.

### Client -> Server

- `hello`
  - `{ type: "hello", clientVersion, toolManifest, workspaceRoot }`
- `user.message`
  - `{ type: "user.message", sessionId, content }`
- `tool.result`
  - `{ type: "tool.result", sessionId, toolCallId, output }`
- `cancel`
  - `{ type: "cancel", sessionId }`

### Server -> Client

- `session.created`
  - `{ type: "session.created", sessionId }`
- `assistant.delta`
  - `{ type: "assistant.delta", sessionId, content }`
- `assistant.done`
  - `{ type: "assistant.done", sessionId, metadata }`
- `tool.call`
  - `{ type: "tool.call", sessionId, toolCallId, name, arguments }`
- `error`
  - `{ type: "error", sessionId, message }`
- `heartbeat`

### Correlation

- `toolCallId` is generated server-side (same as JolliAgent tool call ID).
- Client must echo `toolCallId` in `tool.result`.

## Server-Side Implementation

### 1) New Agent Session Router

Create a new endpoint, e.g.:

- `POST /api/agent/sessions` (HTTP)
  - Auth + return `sessionId`
- `WS /api/agent/sessions/:id/stream` (WS)
  - Handles message streaming and tool calls

**Where to implement**

- New router file (suggested): `backend/src/router/AgentSessionRouter.ts`
- Router registration: `backend/src/AppFactory.ts`
- Session persistence: add to `backend/src/dao` (new table/DAO) or reuse `backend/src/dao/ConvoDao.ts` if applicable

### 2) Session Store

Persist:
- `sessionId`
- message history (JolliAgent `Message[]`)
- tool manifest (for validation)
- workspace root (for policy checks / logging)

### 3) JolliAgent Integration

Server-side handler:

- Build `Agent` via `createAgent` from `tools/jolliagent`.
- On `user.message`:
  - append to history
  - call `agent.chatTurn({ history, runTool })`
  - stream deltas back as `assistant.delta`
- `runTool` forwards the tool call to the CLI via WS and awaits `tool.result`.

**Where to implement**

- JolliAgent workflow helpers: `tools/jolliagent/src/workflows.ts` (reuse patterns for `runTool`)
- Agent + tool dispatch: `tools/jolliagent/src/agents/Agent.ts`, `tools/jolliagent/src/tools/Tools.ts`

### 4) Tool Validation

Server enforces:
- tool name is in the client’s manifest
- JSON schema matches tool definition
- size limits on outputs (truncate or reject)

## CLI-Side Implementation

### 1) New CLI command

Add a CLI entry, e.g.:

- `jolli agent`
  - Opens a WS connection
  - Sends `hello` with tool manifest and workspace root
  - Reads user input and sends `user.message`
- Streams `assistant.delta` to terminal

**Where to implement**

- CLI entry and command wiring: `cli/src/client/cli.ts`
- CLI transport utilities: `cli/src/client/*` (add WS client here)
- CLI docs: `cli/docs/agent.md`

### 2) Local Tool Host

Implement a local tool host using existing JolliAgent tool executors:

- `runState.executorNamespace = "local"`
- `runToolCall(runState, call)`

**Where to implement**

- Local tool host wrapper (suggested new file): `cli/src/client/agent-tool-host.ts`
- Reuse JolliAgent tool defs/executors: `tools/jolliagent/src/tools/Tools.ts`

Enforce:
- Path allowlist (workspace root)
- Max file size
- Default safe operations (no delete unless explicitly allowed)

### 3) Tool Additions (Optional)

Add tools if needed for better UX:

- `read_file` (explicit read with line range)
- `stat` (file metadata)
- `find_files` (glob match)
- `mkdir` (explicit directory create)

## Write-Back Flow

All doc writes are performed by local tools:

- Use `write_file_chunk` for large outputs.
- Tool outputs include file paths written so CLI can print a concise summary.

**Relevant tools**

- `tools/jolliagent/src/tools/tools/write_file.ts`
- `tools/jolliagent/src/tools/tools/write_file_chunk.ts`

## Security & Policy

- **Auth**: reuse CLI auth token; WS uses same auth as existing REST calls.
- **Workspace root**: CLI sends a normalized root; tools must not escape it.
- **Tool allowlist**: only tools in the manifest are callable.
- **Rate limits**: tool calls per minute and max output size.

## Observability

- Server logs: sessionId, tool name, duration, output size.
- Client logs: tool calls executed, failures, local write locations.
- Optional: trace IDs propagated in messages.

## Backward Compatibility

- Keep `/api/chat/stream` for legacy clients (deprecated).
- New agent path is additive.

## Phased Rollout

1. **Phase 0**: Define tool manifest schema + local ToolHost in CLI.
2. **Phase 1**: WS server with stubbed tool echo (no real execution).
3. **Phase 2**: Wire `runTool` to CLI tool host.
4. **Phase 3**: Add policy checks and output size limits.
5. **Phase 4**: Add optional tools + UI polish.

## Testing

- Unit tests: tool manifest validation, path policy, tool dispatch.
- Integration tests: end-to-end session with mock CLI tool host.
- Regression tests: large outputs via chunked writes.

**Where to add tests**

- CLI: `cli/src/client/*.test.ts`
- Backend: `backend/src/router/AgentSessionRouter.test.ts` (new)
