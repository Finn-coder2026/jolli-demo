# Source-Aware Impact Plan v2

## Goal

Add multi-source impact analysis with one CLI command family while supporting two source classes:

- true sources: shared, server-authoritative, optionally linked to integrations
- virtual sources: local-only, non-authoritative, never synced to server

## Prerequisites

This plan depends on **plans-1.5/phase-0** (Sources Table and Change Tracking), which
promotes sources from a JSONB array on Space to a first-class `sources` table with a
`space_sources` junction. All phases below assume that table structure is in place.

## Why This Model

- teams need shared source identity for automation and collaboration
- individuals need local flexibility for experiments and machine-specific mounts
- one command surface keeps UX simple (`source add/list/remove`)
- one source can serve multiple spaces — the binding is separate from the identity

## Definitions

| Term | Meaning |
|---|---|
| source | row in the `sources` table — has its own identity and lifecycle |
| true source | source with `integrationId` set — linked to an integration |
| virtual source | source with `integrationId = null` — metadata only, not yet linked |
| mount | absolute local path used by CLI runtime for git operations |
| binding | row in `space_sources` junction — "this space watches this source" |

## Repo Coordinate Convention

All repo coordinates use **Go module style: `host/owner/repo`**. See Phase 0 for full specification. This format is provider-agnostic and used across all layers.

```
github.com/org/backend
gitlab.com/team/frontend
git.internal.co/team/service
```

## Command Surface (Unified)

```bash
jolli source add <name> --mount <abs-path> [--repo <host/owner/repo>] [--branch <branch>] [--integration-id <id>]
jolli source link <name> --integration-id <id>
jolli source list
jolli source remove <name> [--local-only]
```

Behavior:
- `add` with `--repo` => virtual source with git coordinates (ready for promotion)
- `add` with `--repo` + `--integration-id` => true source + local mount
- `add` without `--repo` => virtual source, mount only
- `link` => promotes a virtual source to true by attaching an integration (uses existing `repo` if present)
- `remove` true source => remove server record + local mount unless `--local-only`
- `remove` virtual source => local delete

## End-to-End Flows

### Local CLI flow

```
source add/list/remove -> local config (+ sources table for true sources) -> impact runtime
```

### Server automation flow

```
GitHub event -> JobsToJrnAdapter -> match true sources via sources table -> queue cli-impact job
```

Virtual sources are excluded from server automation by design.

## Phase Roadmap

| Phase | Name | Output | Depends On |
|---|---|---|---|
| 0 | Canonical Contracts | Source schemas + API contracts (builds on sources table from plans-1.5) | plans-1.5 |
| 1 | Source CLI + Local Store | `source add/list/remove`, true+virtual persistence | 0 |
| 2 | Attention + Resolution | `attention.source` parsing and name resolution | 0, 1 |
| 3 | Impact Runtime | multi-source matching and evidence | 2 |
| 4 | Server Jobs + E2B | true-source event routing and workflow args | 0, 3 |
| 5 | Hardening + Migration | legacy migration, strict mode, idempotency, tests | 1-4 |

## Non-Goals

- syncing local mount paths to server
- changing existing single-repo behavior for users who do not opt into sources
- requiring `--repo` on virtual sources (optional, but enables promotion and sandbox resolution)
