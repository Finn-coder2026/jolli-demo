# Phase 0-1 Implementation Prompt

Implement Phase 0-1 of the CLI Agent integration as specified in `cli/docs/agent/future/agent-phases.md`.

## Overview

We're integrating JolliAgent with the CLI. The CLI (Bun-based, isolated) acts as a tool host while the backend runs JolliAgent. Communication uses HTTP POST (client→server) and Mercure SSE (server→client), matching the existing CollabConvo pattern.

## Phase 0: Backend (extend CollabConvo for CLI workspaces)

1. **Extend `ArtifactType`** in `backend/src/model/CollabConvo.ts`:
   - Add `"cli_workspace"` to the type
   - Make `artifactId` optional/nullable (or use convention `artifactId = 0` for CLI sessions)
   - Add optional `metadata` field (JSONB) for workspace info: `{ workspaceRoot?, toolManifest?, clientVersion? }`

2. **Create `AgentConvoRouter.ts`** (or extend CollabConvoRouter) with endpoints:
   - `POST /api/agent/convos` - Create CLI workspace convo (accepts toolManifest, workspaceRoot)
   - `POST /api/agent/convos/:id/tool-results` - Receive tool execution results from CLI
   - `GET /api/agent/convos` - List user's CLI workspace convos

3. **Add tool dispatch logic:**
   - When JolliAgent calls a tool that's in the client's toolManifest, publish `tool_call_request` event via Mercure
   - Wait for tool result via `/tool-results` endpoint before continuing agent turn
   - Backend-only tools execute server-side

4. **Mercure events** (topic: `/tenants/{slug}/convos/{id}`):
   - Reuse existing: `content_chunk`, `message_complete`, `tool_event`
   - Add new: `tool_call_request` for CLI-side tool dispatch

Reference `CollabConvoRouter.ts` for patterns - it already handles similar flows for doc_draft artifacts.

## Phase 1: CLI (HTTP + Mercure client)

1. **Create `cli/src/client/agent/MercureClient.ts`:**
   - Subscribe to convo topic via EventSource
   - Handle reconnection with exponential backoff
   - Parse events: content_chunk, tool_call_request, message_complete, error

2. **Create `cli/src/client/agent/AgentClient.ts`:**
   - `createConvo(toolManifest, workspaceRoot)` → POST /api/agent/convos
   - `sendMessage(convoId, content)` → POST /api/collab-convos/:id/messages (reuse existing)
   - `sendToolResult(convoId, toolCallId, output, error?)` → POST /api/agent/convos/:id/tool-results
   - `listConvos()` → GET /api/agent/convos
   - `deleteConvo(convoId)` → DELETE

3. **Update `cli/src/client/commands/agent.ts`:**
   - Implement interactive REPL: create convo, subscribe to Mercure, send messages, handle tool calls
   - Integrate with existing `AgentToolHost` (already has read_file, write_file, ls)
   - Commands: `jolli agent`, `jolli agent start`, `jolli agent list`, `jolli agent resume <id>`

## Key files to reference

- `backend/src/router/CollabConvoRouter.ts` - Existing pattern for collab convos
- `backend/src/model/CollabConvo.ts` - Model to extend
- `backend/src/services/MercureService.ts` - Mercure publishing
- `common/src/core/MercureClient.ts` - Frontend Mercure client pattern
- `cli/src/client/commands/AgentToolHost.ts` - Existing tool host with read_file, write_file, ls
- `cli/src/client/commands/agent.ts` - Existing stub to implement
- `tools/jolliagent/` - JolliAgent (import in backend, not CLI)

## Testing

- Write tests but don't enforce coverage - just ensure tests you write pass
- Add unit tests for new endpoints, tool dispatch, Mercure events
- CLI tests can use a mock/reference server

## Important notes

- CLI is isolated (Bun) - cannot import from tools/jolliagent directly
- Duplicate necessary types in CLI
- Follow existing patterns in CollabConvoRouter for consistency
- The agent should be usable after this phase with basic tools (read_file, write_file, ls)
