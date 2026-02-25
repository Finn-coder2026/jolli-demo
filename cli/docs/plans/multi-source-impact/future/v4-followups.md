# V4 Follow-Ups (Future)

## Context

`cli/plans/v4` is being moved to `done` as mostly implemented.  
This document tracks the remaining ideas that should be handled in a future increment.

## Remaining Ideas

### 1) Source CLI parity (`source link` + metadata flags)

Add the planned command surface so source lifecycle is complete:

- `jolli source link <name> --integration-id <id>`
- `jolli source add <name> --mount <abs-path> [--repo <host/owner/repo>] [--branch <branch>] [--integration-id <id>]`

Acceptance:

- `source link` promotes an existing local/virtual source to server-backed source metadata.
- `source add` accepts `repo/branch/integration-id` and persists them consistently.
- CLI output clearly shows source kind and resolution status.

### 2) Local source config shape migration

Move from the current single-map shape to explicit mounts + virtual sources:

- target:
  - `mounts: Record<sourceId, LocalSourceEntry>`
  - `virtualSources: Record<name, LocalSourceEntry>`
- keep backward compatibility by auto-migrating legacy `.jolli/sources.json`

Acceptance:

- legacy config upgrades automatically and non-destructively.
- name collisions (true vs virtual) are detected and surfaced clearly.
- tests cover migration + read/write behavior.

### 3) Server job payload fanout contract

Consider moving from one job per `spaceId` to one source event payload with fanout info:

- include `affectedSpaceIds: number[]` on the canonical payload
- retain `sourceId` as traceability key

Acceptance:

- one source event is modeled once, with deterministic per-space processing.
- logs and audit trail remain space-attributed for outcomes.
- rollout path preserves compatibility for existing queued jobs.

### 4) Hardening and concurrency controls

Add missing safety controls for true-source automation:

- idempotency key: `sourceId + eventJrn + headSha`
- short lease per `(sourceId, branch)`
- stale-event skip when newer SHA already processed
- compare-and-swap cursor advancement

Acceptance:

- duplicate webhook deliveries do not duplicate work.
- concurrent jobs cannot regress source cursor.
- test coverage includes idempotency, lease conflicts, and cursor CAS races.
