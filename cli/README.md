---
jrn: MKKIR4VMYNKRIHSN
attention:
  - op: file
    path: src/client/cli.ts
  - op: file
    path: package.json
---
# Jolli CLI

A command-line tool for Jolli, built with Bun. Provides file sync and an interactive LLM agent.

## Why Separate from Workspaces

The CLI is **not** part of the npm workspaces in the root `package.json`. This is intentional because:

1. **Different runtime** - CLI uses Bun for faster builds and native compilation
2. **Different test runner** - Uses `bun test` instead of vitest/npm
3. **Dependency isolation** - Avoids conflicts with npm workspace hoisting

## Development

### Prerequisites

- [Bun](https://bun.sh/) installed (`curl -fsSL https://bun.sh/install | bash`)

### Commands

From the `cli/` directory:

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build CLI binary
bun run build

# Lint
bun run lint
```

From the project root:

```bash
# Run CLI tests
npm run cli:test

# Build CLI
npm run cli:build

# Lint CLI
npm run cli:lint
```

## Usage

### Authentication

```bash
jolli auth login     # Login via browser OAuth
jolli auth logout    # Clear stored credentials
jolli auth status    # Check if authenticated
```

### File Sync

```bash
jolli sync           # Full bidirectional sync (default)
jolli sync up        # Push local changes only
jolli sync up --changeset MY_CHANGESET_ID  # Reuse/set a specific clientChangesetId
jolli sync up --force  # Force local files to be treated as changed
jolli sync pending clear  # Clear stale pending replay ops
jolli sync down      # Pull server changes only
```

### LLM Agent (Stub)

The agent command provides an interactive LLM chat with local tool execution. The server owns the agent session while tools execute locally on your machine.

```bash
jolli agent          # Start a new agent session
jolli agent start    # Same as above
jolli agent list     # List active sessions
jolli agent resume <id>  # Resume an existing session
```

**Note:** The agent feature is currently a stub implementation. See [docs/agent/agent-implementation-spec.md](docs/agent/agent-implementation-spec.md) for the full specification.

## Project Structure

```
cli/
  src/
    client/
      commands/     # Command modules (auth, sync, agent)
      auth/         # Authentication utilities
    reference-server/  # Local sync server for testing
    shared/         # Shared utilities (sync engine, config, etc.)
  docs/
    agent/          # Agent implementation specs
    bugs/           # Bug documentation and regression test specs
  dist/             # Compiled binaries
```

## Known Issues

See [docs/bugs/](docs/bugs/) for documented sync protocol bugs with regression tests.

## Deprecations

- The legacy chat streaming endpoint (`/api/chat/stream`) is deprecated. It uses the backend core agent
  (createMultiAgentFromEnv / Agent.stream), streams SSE directly on the HTTP response, and does not
  use Mercure. Prefer the JolliAgent-backed collab flow where available.
