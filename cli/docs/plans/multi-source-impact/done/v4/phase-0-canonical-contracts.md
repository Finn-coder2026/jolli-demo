# Phase 0: Canonical Contracts

## Objective

Define stable source contracts across CLI, common types, and backend — building on
the `sources` table and `space_sources` junction established in plans-1.5/phase-0.

## Repo Coordinate Convention

> **IMPORTANT: All repo coordinates use Go module style — `host/owner/repo`.**
>
> This is the canonical format for identifying a git repository across providers.
> It is provider-agnostic, unambiguous, and used consistently across all layers
> (CLI, server, integrations, frontmatter).
>
> ```
> github.com/org/backend
> gitlab.com/team/frontend
> bitbucket.org/company/infra
> git.internal.co/team/service
> ```
>
> **Derivations from this format:**
>
> | Need | Derivation |
> |------|------------|
> | HTTPS clone URL | `https://{host}/{owner}/{repo}.git` |
> | SSH clone URL | `git@{host}:{owner}/{repo}.git` |
> | Web URL | `https://{host}/{owner}/{repo}` |
> | Provider detection | First path segment of host |
> | Integration matching | Match `host` + `owner/repo` against registered integrations |
>
> **Never** store bare `owner/repo` without the host. Never store full clone URLs
> as the primary identifier. The `host/owner/repo` format is the single source of
> truth from which all other representations are derived.

## Data Model

### Server: Source (from sources table)

The `sources` table is defined in plans-1.5/phase-0. This phase adds the
contract layer on top — types, validation, and API schemas:

```ts
interface Source {
  id: number;
  name: string;
  type: "git" | "file";    // extensible for future source types
  repo?: string;            // Go module style: "github.com/org/backend"
  branch?: string;
  integrationId?: number;   // null for virtual sources
  enabled: boolean;
  cursor?: SourceCursor;    // opaque, source-type-dependent
  createdAt: string;
  updatedAt: string;
}

interface SourceCursor {
  value: string;            // opaque — SHA, timestamp, sequence ID, etc.
  updatedAt: string;        // ISO timestamp of last update
}
```

### Server: Space-source binding (from space_sources junction)

```ts
interface SpaceSource {
  spaceId: number;
  sourceId: number;
  jrnPattern?: string;      // space-specific JRN override
  enabled: boolean;         // space-level toggle
  createdAt: string;
}
```

### Local: mounts + virtual sources

```ts
interface LocalSourceEntry {
  mountPath: string;
  type: "git";
  repo?: string;    // Go module style: "github.com/org/backend"
  branch?: string;
}

interface LocalSourceConfig {
  version: 1;
  mounts: Record<string, LocalSourceEntry>;          // key = sourceId (true sources)
  virtualSources: Record<string, LocalSourceEntry>;   // key = source name
}
```

Virtual sources can carry `repo` and `branch` from day one. This enables:
- **Promotion without re-entry** — when linking a virtual source to an integration, the git coordinates are already present.
- **Sandbox resolution** — the server can clone a virtual source's repo in E2B even before formal promotion, if the coordinates are available.

## API Contract

Sources are a top-level resource (established in plans-1.5):

```http
GET    /api/sources
POST   /api/sources
GET    /api/sources/:id
PATCH  /api/sources/:id
DELETE /api/sources/:id
PATCH  /api/sources/:id/cursor
```

Space-source bindings:

```http
GET    /api/spaces/:id/sources
POST   /api/spaces/:id/sources
DELETE /api/spaces/:id/sources/:sourceId
```

## Validation Rules

- source names unique per org (in sources table)
- virtual source names unique locally (in local config)
- virtual name cannot shadow a true source name
- mount path must be absolute and resolve to a git repo for runtime use
- `repo` field, when present, must match `host/owner/repo` format (validated by regex: `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`)

## Integration ID Resolution

Integration linkage can be provided by:

1. `--integration-id <id>` explicit
2. `--repo host/owner/repo` lookup against `/api/integrations` — match the repo coordinate against registered integrations

If multiple matches are found, CLI must error with disambiguation guidance.

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

When a virtual source already has `repo`, promotion to true source is a metadata operation — no coordinates need to be re-entered.

## Files

- `common/src/types/Source.ts` (new — extends types from plans-1.5)
- `backend/src/dao/SourceDao.ts` (extend with validation logic)
- `backend/src/router/SourceRouter.ts` (extend with contract validation)
- `cli/src/shared/SourceConfig.ts` (new)

## Acceptance Criteria

- true source contract is stable and typed end-to-end
- local virtual/mount schema is versioned and documented
- `repo` uses Go module style (`host/owner/repo`) everywhere, no exceptions
- virtual sources can optionally carry `repo` and `branch`
- no local mount paths are accepted by server endpoints
- source API is top-level, not nested under spaces
