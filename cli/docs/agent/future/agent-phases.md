# CLI Agent Implementation Phases

This document outlines the phased approach to integrate JolliAgent with the CLI. The CLI is Bun-based and isolated from npm workspaces, so we cannot import JolliAgent directly. Instead, the CLI acts as a **tool host** while the backend runs JolliAgent server-side.

## Architecture Overview

```
┌─────────────────────┐                            ┌─────────────────────────────┐
│     CLI (Bun)       │                            │      Backend (Node.js)       │
│                     │                            │                              │
│  - Auth tokens      │  ── HTTP POST ──────────► │  - JolliAgent instance       │
│  - Local tool host  │     (messages, results)    │  - Tool executor bridge      │
│  - File operations  │                            │  - CollabConvo persistence   │
│  - Workspace root   │  ◄─ Mercure SSE ────────── │  - Mercure publishing        │
│                     │     (streaming events)     │                              │
└─────────────────────┘                            └─────────────────────────────┘
```

**Key Principle:** JolliAgent runs on the backend. The CLI sends messages via HTTP POST and receives streaming events via Mercure SSE. This matches the existing CollabConvo pattern.

### Reusing CollabConvo

Instead of creating a separate `AgentSession` model, we extend the existing `CollabConvo` system:

```typescript
// Current
export type ArtifactType = "doc_draft";

// Extended
export type ArtifactType = "doc_draft" | "cli_workspace";
```

Benefits:
- **Same model** - `CollabConvo` stores both article editing and CLI agent sessions
- **Same Mercure topics** - `/tenants/{slug}/convos/{id}`
- **Same message format** - `CollabMessage` with tool calls
- **Web UI can view CLI sessions** - Filter by `artifactType = "cli_workspace"`
- **Unified conversation history** - All agent interactions in one place

For `cli_workspace` artifact type:
- `artifactId` is optional/nullable (no backend artifact to reference)
- Alternatively, store a workspace identifier hash

### Why Mercure + HTTP (not WebSocket)?

1. **Consistent with existing patterns** - CollabConvoRouter already uses this approach
2. **Distributed-ready** - Mercure Hub handles multi-instance deployments
3. **Simpler client** - HTTP + SSE are easier than WebSocket in Bun
4. **Automatic reconnection** - Mercure client handles reconnection with backoff
5. **No new infrastructure** - Reuses existing Mercure setup

---

## Phase 0: Extend CollabConvo for CLI Workspaces

**Goal:** Extend the existing CollabConvo system to support CLI workspace sessions.

### Tasks

1. **Extend ArtifactType** (`backend/src/model/CollabConvo.ts`)
   ```typescript
   export type ArtifactType = "doc_draft" | "cli_workspace";
   ```

2. **Make artifactId optional** for `cli_workspace` type
   - Update model to allow `artifactId: number | null`
   - Or use a convention like `artifactId = 0` for CLI sessions

3. **Add metadata field** to CollabConvo for workspace info:
   ```typescript
   interface CollabConvo {
     // ... existing fields
     metadata?: {
       workspaceRoot?: string;      // CLI workspace path
       toolManifest?: ToolManifest; // Available local tools
       clientVersion?: string;      // CLI version
     };
   }
   ```

4. **Extend CollabConvoRouter** or create **AgentConvoRouter** (`backend/src/router/AgentConvoRouter.ts`)
   - New endpoints for CLI-specific operations:
     - `POST /api/agent/convos` - Create CLI workspace convo
     - `POST /api/agent/convos/:id/tool-results` - Send tool execution results
     - `GET /api/agent/convos` - List user's CLI convos
   - Reuse existing endpoints where possible:
     - `POST /api/collab-convos/:id/messages` - Send user message (already exists)
     - `GET /api/collab-convos/:id/stream` - SSE stream (already exists)

5. **Add tool dispatch logic** to handle CLI-side tools:
   - If tool is in client's `toolManifest` → publish `tool.call` event via Mercure
   - If tool is backend-only → execute server-side
   - Wait for tool results via `/tool-results` endpoint before continuing

6. **Mercure events** - Reuse existing convo topic `/tenants/{slug}/convos/{id}`:
   ```typescript
   // Already supported by CollabConvo:
   { type: "content_chunk", content: string, seq: number }
   { type: "message_complete", messageId: string }
   { type: "tool_event", toolCallId: string, status: "pending" | "complete", ... }

   // New for CLI tool dispatch:
   { type: "tool_call_request", toolCallId: string, name: string, arguments: object }
   ```

7. **Add tests** for new artifact type, tool dispatch, and CLI-specific flows

### Deliverables
- Extended `ArtifactType` with `"cli_workspace"`
- Optional `metadata` field on CollabConvo
- `AgentConvoRouter.ts` for CLI-specific endpoints (or extend CollabConvoRouter)
- Tool dispatch logic for CLI-side execution
- Unit tests for new functionality

---

## Phase 1: CLI HTTP + Mercure Client

**Goal:** Implement the CLI side using HTTP for requests and Mercure SSE for streaming events.

### Tasks

1. **Implement Mercure SSE client** (`cli/src/client/agent/MercureClient.ts`)
   - Subscribe to convo topic via EventSource
   - Handle reconnection with exponential backoff
   - Parse incoming events (content_chunk, tool_call_request, message_complete, error)

2. **Implement HTTP client** (`cli/src/client/agent/AgentClient.ts`)
   - `createConvo(toolManifest, workspaceRoot)` → convoId + mercureTopic
   - `sendMessage(convoId, content)` → 202 (uses existing `/collab-convos/:id/messages`)
   - `sendToolResult(convoId, toolCallId, output, error?)` → 200
   - `listConvos()` → list of CLI workspace convos
   - `deleteConvo(convoId)` → 204

3. **Integrate with existing AgentToolHost**
   - Receive `tool_call_request` events via Mercure
   - Execute via `AgentToolHost.executeTool()`
   - Send result via `sendToolResult()` HTTP call

4. **Interactive REPL loop** (`cli/src/client/commands/agent.ts`):
   ```
   jolli agent
   > Connected to convo abc123
   > Subscribed to Mercure topic /tenants/default/convos/123
   > Type your message (Ctrl+C to exit)

   You: Help me understand this codebase
   Assistant: I'll explore the project structure...
   [Tool: ls {"path": "."}]
   [Tool result: src/ package.json README.md ...]
   Assistant: This appears to be a TypeScript project with...
   ```

5. **Session management commands:**
   - `jolli agent` / `jolli agent start` - New convo
   - `jolli agent list` - List CLI workspace convos
   - `jolli agent resume <id>` - Resume existing convo

6. **Add tests** for HTTP client, Mercure subscription, tool execution

### Deliverables
- Working `jolli agent` command with interactive chat
- `MercureClient.ts` with SSE handling
- `AgentClient.ts` with HTTP methods
- Tool execution integration
- Tests for CLI agent functionality

---

## Phase 2: Enhanced Tool Set

**Goal:** Expand the local tool set available to the agent for richer interactions.

### Tasks

1. **Add file operation tools:**
   - `read_file` - Read file contents (exists)
   - `write_file` - Write file contents (exists)
   - `ls` - List directory (exists)
   - `mkdir` - Create directory
   - `rm` - Remove file/directory (with confirmation)
   - `mv` - Move/rename file
   - `cp` - Copy file

2. **Add code exploration tools:**
   - `grep` - Search file contents with regex
   - `find` - Find files by pattern
   - `git_status` - Show git status
   - `git_diff` - Show uncommitted changes
   - `git_log` - Show recent commits

3. **Add shell execution tool:**
   - `shell` - Execute shell command (sandboxed)
   - Configurable allow/deny list for commands
   - Timeout protection
   - Output truncation

4. **Tool permission system:**
   - Config file for allowed/denied tools
   - Confirmation prompts for destructive operations
   - Workspace boundary enforcement

5. **Update tool manifest generation** to include new tools

### Deliverables
- Extended tool set in `AgentToolHost.ts`
- Tool permission configuration
- Confirmation prompts for destructive operations
- Tests for all new tools

---

## Phase 3: Enhanced Resume & History

**Goal:** Improve the resume experience and add history viewing.

Since we're reusing `CollabConvo`, persistence is already handled. This phase focuses on the CLI experience.

### Tasks

1. **CLI: Conversation history display**
   - `jolli agent list` - Show CLI workspace convos with timestamps, preview
   - `jolli agent history <id>` - View full conversation without resuming
   - `jolli agent delete <id>` - Delete conversation

2. **Resume improvements**
   - `jolli agent resume <id>` - Resume with history replay in terminal
   - Display previous messages before accepting new input
   - Show tool calls and results from history

3. **Local caching** (optional)
   - Cache recent conversations locally for offline viewing
   - Sync state indicator (cached vs server)

4. **Web UI integration**
   - Conversations created via CLI visible in web UI
   - Filter by `artifactType = "cli_workspace"`
   - Read-only view initially, interactive later

### Deliverables
- `jolli agent list/history/delete` commands
- History replay on resume
- Optional local caching
- Web UI can view CLI convos

---

## Phase 4: Streaming Improvements

**Goal:** Improve streaming UX with better feedback and error handling.

### Tasks

1. **Progress indicators:**
   - Show typing indicator while agent is thinking
   - Show tool execution spinner
   - Display token usage after each response

2. **Error recovery:**
   - Automatic reconnection on Mercure SSE disconnect
   - Resume from last message on reconnection
   - Graceful degradation on partial failures

3. **Cancellation support:**
   - Ctrl+C to cancel current response
   - Send `cancel` message to server
   - Clean up partial responses

4. **Markdown rendering:**
   - Render markdown in terminal (using marked-terminal or similar)
   - Syntax highlighting for code blocks
   - Clickable links

5. **Multi-line input:**
   - Support pasting multi-line content
   - Here-doc style input for long prompts
   - File attachment via `@file.txt` syntax

### Deliverables
- Enhanced terminal UX
- Reconnection and error recovery
- Cancellation support
- Markdown rendering

---

## Phase 5: Context Integration

**Goal:** Integrate with Jolli's document and sync systems.

### Tasks

1. **Document context tools:**
   - `get_article` - Fetch article by ID or slug
   - `search_articles` - Search user's articles
   - `get_docsite` - Fetch docsite structure
   - These execute on backend, not locally

2. **Sync integration:**
   - Agent can trigger `jolli sync` operations
   - `sync_status` tool to check sync state
   - `sync_up` / `sync_down` tools for explicit sync

3. **Workspace awareness:**
   - Detect if in synced workspace
   - Auto-load relevant article context
   - Suggest sync when changes detected

4. **Article editing mode:**
   - `jolli agent --article <id>` to focus on specific article
   - Pre-load article content as context
   - Auto-sync changes back to server

### Deliverables
- Backend-side document tools
- Sync integration
- Workspace detection
- Article editing mode

---

## Phase 6: Advanced Features

**Goal:** Add power-user features for advanced workflows.

### Tasks

1. **Scripted interactions:**
   - `jolli agent --prompt "Do X"` for non-interactive use
   - Pipe input: `echo "Do X" | jolli agent`
   - Output formats: `--format json|markdown|plain`

2. **Configuration:**
   - `.jolliagent.yaml` for project-specific settings
   - Custom system prompts
   - Tool presets (minimal, standard, full)
   - Model selection (if multi-model supported)

3. **Hooks:**
   - Pre/post tool execution hooks
   - Custom tool definitions via config
   - Event webhooks for CI/CD integration

4. **Batch operations:**
   - Process multiple files with agent
   - Parallel tool execution where safe
   - Progress tracking for long operations

### Deliverables
- Non-interactive mode
- Configuration file support
- Hook system
- Batch processing

---

## Implementation Notes

### CLI Isolation
The CLI uses Bun and cannot import from `tools/jolliagent` directly. All JolliAgent functionality must be accessed via the backend API. This means:
- Duplicate necessary types in CLI (protocol messages, tool definitions)
- No shared code between CLI and JolliAgent
- All agent logic runs server-side

### Testing Strategy
- **Write tests, but don't enforce coverage** - Tests you write should pass, but no need to maintain 100% coverage for agent code
- **Unit tests:** Tool execution, HTTP client, SSE parsing
- **Integration tests:** End-to-end flows with reference server
- **Reference server:** Extend existing sync reference server for agent testing (mock Mercure with direct SSE)

### Security Considerations
- Tool execution sandboxed to workspace root
- No shell execution without explicit opt-in
- Rate limiting on backend API
- Session isolation per user
- Mercure topic authorization via JWT

### Backward Compatibility
- Existing `jolli sync` commands unchanged
- Agent feature is additive
- Graceful fallback if backend doesn't support agent API or Mercure is disabled

---

## Phase 7: Local Agent Server (Standalone Mode)

**Goal:** Provide a minimal local agent server so users can run the entire agent flow locally without the remote Jolli backend.

### Motivation

- **Offline development:** Work with the agent without internet connectivity
- **Privacy:** Keep all data local for sensitive projects
- **Testing:** Easier integration testing without backend dependency
- **Simplicity:** Quick start without account/auth setup

### Architecture

```
┌─────────────────────┐                            ┌─────────────────────────────┐
│     CLI (Bun)       │                            │   Local Agent Server (Bun)  │
│                     │                            │                              │
│  - Local tool host  │  ── HTTP POST ──────────► │  - In-memory conversations   │
│  - File operations  │     (messages, results)    │  - Anthropic LLM client      │
│  - Workspace root   │                            │  - Agent loop (chatTurn)     │
│                     │  ◄─ SSE ────────────────── │  - Mercure-compatible SSE    │
│                     │     (streaming events)     │                              │
└─────────────────────┘                            └─────────────────────────────┘
```

**Key Principle:** The local server implements the same HTTP + Mercure protocol that `AgentClient.ts` expects, so the CLI works identically whether connected to the remote backend or the local server.

### File Structure

```
cli/src/reference-server/
  server.ts               # Existing sync server (unchanged)
  types.ts                # Existing sync types (unchanged)
  AgentServer.ts          # NEW: Main agent server
  AgentServerTypes.ts     # NEW: Protocol types
  AgentLLM.ts             # NEW: Simplified Anthropic client
  SSEHub.ts               # NEW: Mercure-compatible SSE hub
  AgentServer.test.ts     # NEW: Tests
```

### API Endpoints

The local server implements the same endpoints as the remote backend:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agent/convos` | Create conversation |
| `GET /api/agent/convos` | List conversations |
| `GET /api/agent/convos/:id` | Get conversation |
| `DELETE /api/agent/convos/:id` | Delete conversation |
| `POST /api/agent/convos/:id/messages` | Send message (returns 202) |
| `POST /api/agent/convos/:id/tool-results` | Submit tool result |
| `POST /api/mercure/config` | Get Mercure config |
| `POST /api/mercure/token` | Get subscriber token |
| `GET /.well-known/mercure` | SSE endpoint |

### Tasks

1. **Create `AgentServerTypes.ts`** - Protocol types matching AgentClient expectations:
   - `ServerConversation`, `ServerMessage` types
   - `CliWorkspaceMetadata`, `ToolManifest` types
   - `SSEEvent` and `SSEEventType` types

2. **Create `SSEHub.ts`** - Simple Mercure-compatible SSE hub:
   - Topic-based connection management
   - Event broadcasting to subscribed clients
   - Compatible with MercureClient.ts expectations
   - Query param auth: `?topic=convo-{id}&authorization={token}`

3. **Create `AgentLLM.ts`** - Simplified Anthropic client:
   - Inline implementation (not importing from jolliagent to keep CLI standalone)
   - Message format conversion following jolliagent patterns
   - Async generator streaming (`text_delta`, `tool_call`, `response_completed`)
   - Uses `ANTHROPIC_API_KEY` env var

4. **Create `AgentServer.ts`** - Main server implementation:
   - In-memory conversation store (like sync server pattern)
   - CRUD routes for conversations
   - Agent turn loop implementation:
     - Accept message via POST, return 202 immediately
     - Run agent loop in background
     - Stream text deltas via SSE as `content_chunk`
     - Emit `tool_call_request` when tool needed
     - Wait for tool result via pending promise map
     - Continue loop after tool result
     - Emit `message_complete` when done

5. **Add `--local` flag to CLI:**
   - `jolli agent --local` starts local server automatically
   - Points AgentClient to local server URL
   - Falls back gracefully if ANTHROPIC_API_KEY not set

6. **Add `@anthropic-ai/sdk` dependency** to CLI package.json

7. **Write tests** for agent server functionality

### Request/Response Flow

```
CLI                          AgentServer                    Anthropic
 |                                |                              |
 |-- POST /messages { msg } ----->|                              |
 |<---------- 202 Accepted -------|                              |
 |                                |---- stream(messages) ------->|
 |<-- SSE: content_chunk "Hi" ----|<----- text_delta: "Hi" ------|
 |<-- SSE: tool_call_request -----|<----- tool_call: {id,name} --|
 |-- POST /tool-results --------->|                              |
 |                                |---- continue w/ result ----->|
 |<-- SSE: content_chunk "Done" --|<----- text_delta: "Done" ----|
 |<-- SSE: message_complete ------|<----- response_completed ----|
```

### Tool Call Correlation

```typescript
const pendingToolCalls = new Map<string, {
  convoId: number;
  resolve: (result: string) => void;
}>();

// When LLM emits tool_call:
const resultPromise = new Promise<string>((resolve) => {
  pendingToolCalls.set(toolCallId, { convoId, resolve });
});
sseHub.broadcast(`convo-${convoId}`, { type: "tool_call_request", ... });
const output = await resultPromise;

// When POST /tool-results arrives:
const pending = pendingToolCalls.get(toolCallId);
pending?.resolve(output);
```

### Configuration

- `ANTHROPIC_API_KEY` - Required for LLM calls
- `AGENT_SERVER_PORT` - Default 3002

### Deliverables

- `AgentServer.ts` with full HTTP + SSE implementation
- `AgentLLM.ts` with Anthropic streaming
- `SSEHub.ts` for Mercure-compatible SSE
- `--local` flag for `jolli agent` command
- Tests for local server functionality

---

## Timeline Estimate

| Phase | Description | Complexity |
|-------|-------------|------------|
| 0 | Backend WebSocket Endpoint | Medium |
| 1 | CLI WebSocket Client | Medium |
| 2 | Enhanced Tool Set | Low-Medium |
| 3 | Session Persistence | Medium |
| 4 | Streaming Improvements | Low-Medium |
| 5 | Context Integration | Medium-High |
| 6 | Advanced Features | Medium |
| 7 | Local Agent Server | Medium |

Phases 0-1 are prerequisites for any agent functionality. Phases 2-7 can be done incrementally based on priorities.
