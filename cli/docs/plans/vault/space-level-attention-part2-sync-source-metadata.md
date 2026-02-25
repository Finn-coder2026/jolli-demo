# Space-Level Attention And Source Metadata (Consolidated)

This document is now the single plan/spec for vault-style multi-source impact.
It replaces the old split between "Part 1" and "Part 2".

## Goal

Support documentation spaces where:

1. Docs live in one workspace (for example, `~/vault`)
2. Code lives in one or more separate git repos
3. Attention rules can target specific repos by source name
4. Local machine paths remain private

## Current Model

### 1. Local Source Config (authoritative for path resolution)

CLI stores source mappings in `.jolli/sources.json`:

```json
{
  "version": 1,
  "sources": {
    "backend": {
      "type": "git",
      "path": "/Users/dev/work/backend",
      "sourceId": 12
    },
    "frontend": {
      "type": "git",
      "path": "/Users/dev/work/frontend",
      "sourceId": 13
    }
  }
}
```

Notes:
- `path` is local-machine only.
- `sourceId` links a local entry to a server source record when available.
- CLI resolves paths to git roots and validates status (`resolved`, `missing-path`, `invalid-git-root`).

### 2. Server Source Metadata (shared catalog)

Server stores shared source metadata via existing source models:

- `sources` table: source identity (`id`, `name`, `type`, optional `repo/branch/integrationId`)
- `space_source` table: source-to-space binding

CLI currently creates virtual git sources with `{ name, type: "git" }` and binds them to the active space.
No local path is sent to server.

### 3. Attention Frontmatter

`attention` rules support optional `source`:

```yaml
---
jrn: AUTH_DOCS_001
attention:
  - op: file
    source: backend
    path: src/auth/**/*.ts
  - op: file
    source: frontend
    path: src/components/Login/**/*.tsx
  - op: file
    path: docs/api/*.md
---
```

Resolution rules:
- If `source` is present, `path` is resolved relative to that source git root.
- If `source` is omitted, rule is scoped to local source (`<local>`) and resolved relative to project root.

## Runtime Behavior

### `jolli source` commands

```bash
jolli source add <name> --path <local-path>
jolli source remove <name>
jolli source list
```

`add` behavior:
1. Validates local path is in a git repo and normalizes to repo root.
2. Writes `.jolli/sources.json`.
3. By default, creates/binds server source metadata for active space.
4. `--local-only` skips server create/bind.

`remove` behavior:
1. Removes local mapping.
2. By default, unbinds from active space on server.
3. `--local-only` skips server unbind.

`list` behavior:
1. Reads local `.jolli/sources.json`.
2. Fetches bound space sources from server when authenticated.
3. Merges both views and prints local resolution plus server status.

### `jolli impact` behavior

Phase 1 now runs per source:

1. Parse docs and build source-scoped attention index.
2. Resolve all referenced sources:
   - `<local>` -> project root
   - named source -> `.jolli/sources.json` path
3. For each resolved source, run git diff/report in that repo.
4. Match changed files only against rules for that source.
5. Merge evidence across all sources, deduplicate docs.
6. Run impact agent with combined source-aware evidence.

Evidence now carries `source`, `changedFile`, `pattern`, and `matchType`.

CLI switches:
- `--source <name>` limits analysis to one source (`local` maps to `<local>`).
- `--strict` fails fast when unresolved referenced sources are encountered (after `--source` filtering, if provided).

## Sync Boundary (important)

`sync up/down` payload schema is unchanged.

- Source local paths are NOT pushed in sync.
- Source mapping changes are explicit `jolli source` operations, not implicit doc sync behavior.

This keeps local machine details private and avoids hidden side effects during normal sync.

## Privacy Model

Local-only (private):
- `.jolli/sources.json` paths
- local filesystem/git state

Shared (space/org metadata):
- source name/type identity
- space-source bindings
- attention `source` names inside docs

If strict privacy is needed, use:

```bash
jolli source add <name> --path <local-path> --local-only
```

## Web Linkage

Web connects through explicit source records and space bindings:

1. Source record exists (`name`, `type`, optional integration/repo metadata)
2. Source is bound to space
3. Docs reference source by `attention[].source`

There is no implicit conversion from local path to web source.
The join key is source name/id, never local path.

## Graceful Degradation

When a source is referenced but not resolvable locally:

- `jolli impact` warns and skips that source.
- Other sources still run.
- `jolli source list` shows unresolved status and server/local divergence.
- With `jolli impact --strict`, unresolved sources cause an immediate error instead of warn-and-skip.

## API Surface In Use

Existing APIs (already used by CLI source commands):

- `GET /api/v1/sources`
- `POST /api/v1/sources`
- `GET /api/v1/spaces/:spaceId/sources`
- `POST /api/v1/spaces/:spaceId/sources`
- `DELETE /api/v1/spaces/:spaceId/sources/:sourceId`

## Status

Implemented in CLI/common/backend codebase:

1. Local source store and validation
2. `jolli source add/remove/list`
3. Shared source metadata create/bind/unbind flow
4. Attention `source` parsing
5. Source-scoped impact indexing/matching
6. Per-source git diff/report orchestration
7. Source-aware evidence in impact context and audit trail
8. Attention schema docs update
9. `jolli impact search --source <name>` / `jolli impact agent --source <name>` filtering
10. `jolli impact search --strict` / `jolli impact agent --strict` fail-fast for unresolved sources

## Future Extensions

1. Rich server source metadata (`repo`, `branch`, integration details) for server-side impact workflows
2. Safe source rename workflow with frontmatter migration
