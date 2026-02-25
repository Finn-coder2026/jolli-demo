# Phase 0: Sources Table and Change Tracking

## Objective

Promote sources from a JSONB array on the Space row to a first-class `sources` table.
This gives sources their own identity, lifecycle, and — where applicable — change
tracking, independent of both spaces and integrations.

## Problem

The current model embeds sources in `Space.sources` as a JSONB array of `SpaceSource`
objects, each requiring an `integrationId`:

```ts
// current — embedded, integration-required
interface SpaceSource {
  integrationId: number;   // required
  jrnPattern?: string;
  branch?: string;
  enabled: boolean;
}
```

This has three problems:

1. **No virtual sources** — `integrationId` is required, so you can't represent a
   metadata-only source that might later be linked to an integration.
2. **Concurrency** — updating one source's state requires read-modify-write of the
   entire JSONB array. Two jobs finishing at the same time for different sources on
   the same space will race.
3. **Shared identity** — one source change (e.g., a git push) can affect multiple
   spaces. The source itself is the same event regardless of which spaces consume it.
   Embedding sources in spaces conflates the binding with the identity.

## Data Model

### Sources table

A new `sources` table gives sources first-class identity:

```ts
interface Source {
  id: number;              // PK, auto-increment
  name: string;            // human-readable, unique per org
  type: "git" | "file";   // extensible — add "linear", "confluence", etc. later
  repo?: string;           // Go module style: "github.com/org/backend"
  branch?: string;
  integrationId?: number;  // FK to integrations — null for virtual sources
  enabled: boolean;

  // Change tracking — optional, source-type-dependent
  cursor?: SourceCursor;   // JSONB, nullable

  createdAt: Date;
  updatedAt: Date;
}
```

### Source cursor

Not all source types support incremental change tracking. The cursor is an opaque
checkpoint whose meaning depends on the source type:

```ts
interface SourceCursor {
  /** Opaque value — commit SHA for git, timestamp for APIs, sequence ID for webhooks */
  value: string;
  /** ISO timestamp of last successful processing */
  updatedAt: string;
}
```

| Source type | Cursor value | Has cursor? | Change detection |
|---|---|---|---|
| git (webhook) | Not needed | No | Webhook payload carries `before`/`after` SHAs |
| git (polling/catch-up) | Commit SHA | Yes | `git log cursor..HEAD` |
| static_file | Not needed | No | Upload event is the change |
| Linear (future) | Sync timestamp | Yes | API: `updated_since: cursor` |
| Generic webhook | Not needed | No | Event payload is self-describing |

The cursor is **only needed** when the system polls or needs to recover from missed
events. For event-driven flows (webhooks, uploads), the event payload itself carries
enough context to determine what changed.

### Space-source binding (junction)

Replace the JSONB array with a junction table:

```ts
interface SpaceSource {
  spaceId: number;         // FK to spaces
  sourceId: number;        // FK to sources
  jrnPattern?: string;     // space-specific JRN override
  enabled: boolean;        // space-level toggle (independent of source.enabled)
  createdAt: Date;
}
```

This is purely the binding — "this space watches this source." No cursor here,
no source metadata here.

## Source Lifecycle

```
Virtual (no integration)              Realized (linked to integration)
┌──────────────────────┐              ┌──────────────────────┐
│ name: "backend"      │  jolli source│ name: "backend"      │
│ type: "git"          │  link backend│ type: "git"          │
│ repo: github.com/... │ ────────────>│ repo: github.com/... │
│ integrationId: null  │              │ integrationId: 42    │
│ cursor: null         │              │ cursor: { value: ... }│
└──────────────────────┘              └──────────────────────┘
     metadata only                      linked + trackable
```

- Virtual sources live in the `sources` table with `integrationId = null`
- They can carry `repo` and `branch` from day one
- Promotion to a "real" source is just setting `integrationId`
- Multiple spaces can bind to the same source via the junction table

## One Source, Many Spaces

A single git push affects the source once. Multiple spaces watching that source
each get the same change set and apply their own attention rules:

```
Source: "backend" (github.com/org/backend)
  ├── Space "API Docs"      → attention: src/api/**
  ├── Space "SDK Reference"  → attention: src/sdk/**
  └── Space "Internal"       → attention: src/internal/**
```

The source's cursor (if present) advances once, not per-space.

## Event-Driven vs Cursor-Based

Most flows are event-driven — the webhook or upload carries its own change context:

- **GitHub push webhook**: payload has `before` and `after` SHAs
- **File upload**: the uploaded content is the change
- **Manual CLI run**: user specifies `--base` or uses current HEAD

The cursor is a **catch-up mechanism** for:
- Recovering from missed webhooks
- Polling-based integrations (future)
- "What changed since we last checked?" when no event triggered the run

For event-driven sources, the cursor is updated as a side effect (bookkeeping)
but is not the primary input to the diff.

## Replacing the JSONB Column

The current `Space.sources` JSONB array has not shipped to production. It can be
replaced directly: remove the JSONB column from the `spaces` table and model,
create the `sources` table and `space_sources` junction, and update all code that
reads/writes sources to use the new tables.

## API Changes

Sources become a top-level resource:

```http
GET    /api/sources                         # list all sources in org
POST   /api/sources                         # create source (virtual or linked)
GET    /api/sources/:id                     # get source details + cursor
PATCH  /api/sources/:id                     # update source metadata
DELETE /api/sources/:id                     # delete source
PATCH  /api/sources/:id/cursor              # advance cursor (job runner only)
```

Space-source bindings:

```http
GET    /api/spaces/:id/sources              # list sources bound to space
POST   /api/spaces/:id/sources              # bind a source to a space
DELETE /api/spaces/:id/sources/:sourceId    # unbind source from space
```

## Files

- `common/src/types/Source.ts` (new — Source, SourceCursor, SpaceSource types)
- `backend/src/model/Source.ts` (new — Sequelize model + junction model)
- `backend/src/dao/SourceDao.ts` (new — CRUD + cursor update + junction ops)
- `backend/src/router/SourceRouter.ts` (new — REST endpoints)
- `backend/src/dao/SpaceDao.ts` (remove source-related methods, add migration)
- `common/src/types/Space.ts` (remove SpaceSource type)
- `cli/src/shared/SourceConfig.ts` (new — local virtual source config)

## Acceptance Criteria

- Sources are a first-class table with their own identity and lifecycle
- Virtual sources (no integration) can exist and carry metadata
- Multiple spaces can bind to the same source
- Cursor is optional and source-type-dependent
- Cursor is only advanced after confirmed successful processing
- Event-driven flows work without a cursor (webhook payload is sufficient)
- JSONB `Space.sources` column is removed (never shipped to production)
- Source API is separate from Space API
