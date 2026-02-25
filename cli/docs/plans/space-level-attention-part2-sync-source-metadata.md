# Part 2: Sync Virtual Source Metadata

**Depends on:** [Part 1 — Space-Level Attention](./space-level-attention.md)

## Overview

Sources are primarily a local CLI concept — `.jolli/sources.json` maps source names to local git repo paths. But the server should hold an advisory catalog of source names per space as metadata. This is non-authoritative: the server stores it for visibility and future use, but the CLI is the authority for path resolution.

## Design

### Local vs Server

| Concern | Where | Authoritative? |
|---------|-------|----------------|
| Source name (e.g. `"backend"`) | Both | CLI creates, server stores |
| Local path (e.g. `~/work/backend`) | `.jolli/sources.json` only | CLI only |
| Source exists on this machine | CLI checks at runtime | CLI only |
| Catalog of sources for a space | Server (space metadata) | Advisory only |

### What Gets Synced Up

When the user runs `jolli source add backend --path ~/work/backend`:

1. **Local:** Write to `.jolli/sources.json`
   ```json
   {
     "sources": {
       "backend": {
         "type": "git",
         "path": "/Users/dev/work/backend"
       }
     }
   }
   ```

2. **Server:** Send metadata update to the space
   ```json
   POST /api/spaces/:slug/sources
   {
     "name": "backend",
     "type": "git"
   }
   ```
   No path. No local details. Just the name and type.

Similarly, `jolli source remove backend` deletes locally and sends a delete to the server.

### What the Server Stores

A simple list on the space model:

```json
{
  "space": "my-docs",
  "sources": [
    { "name": "backend", "type": "git", "addedAt": "2026-02-06T..." },
    { "name": "frontend", "type": "git", "addedAt": "2026-02-06T..." }
  ]
}
```

This is metadata only. The server does not validate, resolve, or act on it. It serves two purposes:

1. **Visibility** — other users on the space can see what sources exist (e.g. in a future UI).
2. **Future server-side impact** — when server-side impact analysis is built, this catalog is the starting point. Source entries would later be enriched with remote URLs, webhook configs, etc.

### What Gets Synced Down

When a user sets up a new machine or clones a space, `jolli source list` can show sources the server knows about that aren't configured locally:

```
$ jolli source list

  backend    /Users/dev/work/backend     ✓ resolved
  frontend   (not configured locally)     ✗ run: jolli source add frontend --path <path>
  infra      (not configured locally)     ✗ run: jolli source add infra --path <path>
```

The server catalog acts as a hint: "this space expects these sources." The user then maps them to local paths. This is analogous to cloning a repo that uses environment variables — you know the variable names exist, you supply the values locally.

### Graceful Degradation

When a local source path doesn't resolve (moved, deleted, different machine):

**`jolli impact`** — warns and skips:
```
⚠ Source "backend" not found at /Users/dev/work/backend (skipping)
  3 docs watching this source will not be checked.
```
Other sources still run. Partial results are better than failure.

**`jolli source list`** — shows resolution status:
```
  backend    /Users/dev/work/backend     ✗ not found
  frontend   /Users/dev/work/frontend    ✓ resolved
```

**`jolli impact --strict`** (future) — could fail hard if any source is unresolved, for CI pipelines that need all sources checked.

### API Surface

#### Server Endpoints

```
GET    /api/spaces/:slug/sources         → list source metadata
POST   /api/spaces/:slug/sources         → add source metadata
DELETE /api/spaces/:slug/sources/:name   → remove source metadata
```

These are simple CRUD on advisory metadata. No validation of paths, repos, or git state.

#### CLI Commands

```bash
jolli source add <name> --path <local-path>
# 1. Validates path exists and is a git repo
# 2. Writes to .jolli/sources.json
# 3. Sends name + type to server

jolli source remove <name>
# 1. Removes from .jolli/sources.json
# 2. Sends delete to server

jolli source list
# 1. Loads .jolli/sources.json (local)
# 2. Fetches server catalog
# 3. Merges and shows resolution status
```

### Conflict Handling

If the local and server catalogs diverge (e.g. one user adds a source, another removes it):

- **Server wins for the catalog.** The server is the shared view of "what sources this space has."
- **Local wins for resolution.** The local path mapping is always per-machine.
- **No auto-sync.** Source additions/removals are explicit CLI commands, not part of `jolli sync`. This avoids surprising side effects during normal doc sync.

### Sequencing

| Step | Description |
|------|-------------|
| 1 | Implement `.jolli/sources.json` read/write (Part 1) |
| 2 | Add server API endpoints for source metadata |
| 3 | Wire `jolli source add/remove` to call server API |
| 4 | Wire `jolli source list` to merge local + server |
| 5 | Add graceful degradation to `jolli impact` |

Steps 1 and 2 can be done in parallel. Steps 3–5 depend on both.

### Open Questions

1. **Auth scoping** — who can add/remove sources on a space? Any space member, or just admins? For now, any authenticated user.

2. **Source renaming** — if a source is renamed, all attention frontmatter referencing the old name breaks. Should there be a `jolli source rename` that also updates frontmatter? Or just document it as a manual step?

3. **Enrichment timeline** — when server-side impact is built, source metadata will need remote URLs. Should `jolli source add` accept an optional `--repo <url>` now and store it on the server, even if nothing uses it yet? Low cost to add, avoids a migration later.
