# Jolli CLI Sync Architecture

A bidirectional markdown sync system between local workspaces and a central server, using cursor-based change tracking and optimistic concurrency control.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI Client                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Scanner   │  │  State DB   │  │  Sync Core  │  │  File Operations│ │
│  │ (glob scan) │  │(.jolli/*)   │  │  (sync.ts)  │  │  (read/write)   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTP (JSON)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Backend Server                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ SyncRouter  │  │SyncArticle  │  │   DocDao    │  │   PostgreSQL    │ │
│  │  (API)      │  │   Dao       │  │  (content)  │  │   (storage)     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### File Identity (JRN)

Files are tracked by a stable `jrn` (Jolli Resource Name) embedded in YAML frontmatter:

```markdown
---
jrn: ABC123XYZ
title: My Note
---

# Content here
```

**Implementation**: [cli/src/shared/sync-helpers.ts](../src/shared/sync-helpers.ts)

- `extractJrn(content)` - Parses JRN from frontmatter
- `injectJrn(content, jrn)` - Adds/updates JRN in frontmatter
- ID survives file renames (path changes)
- Files without JRN get one generated on first push

### Cursor-Based Change Tracking

The server maintains a monotonically increasing cursor via PostgreSQL sequence:

```sql
CREATE SEQUENCE sync_articles_cursor_seq;
```

**Implementation**: [backend/src/dao/SyncArticleDao.ts](../../backend/src/dao/SyncArticleDao.ts)

- Each file update increments the cursor
- Clients store `lastCursor` and request changes since that cursor
- Initial sync (cursor=0) returns all non-deleted files

### Version-Based Conflict Detection

Optimistic concurrency control via version numbers:

```typescript
if (op.baseVersion !== currentVersion) {
  return { status: "conflict", serverVersion: currentVersion };
}
```

**Implementation**: [backend/src/router/SyncRouter.ts](../../backend/src/router/SyncRouter.ts)

---

## Directory Structure

```
workspace/
├── .jolli/
│   ├── sync.md              # Sync state (YAML frontmatter)
│   ├── pending-ops.json     # Unacknowledged push operations
│   └── snapshots/           # Base versions for 3-way merge
│       └── <fileId>.md
├── .sync/
│   └── trash/               # Deleted files (30-day retention)
│       └── 2024-01-15T10-30-00-000Z/
│           └── original/path.md
└── docs/
    └── *.md                 # User markdown files
```

### State File Format (`.jolli/sync.md`)

```yaml
---
lastCursor: 42
include:
  - "**/*.md"
exclude:
  - "node_modules/**"
files:
  - clientPath: "docs/readme.md"
    fileId: "ABC123XYZ"
    serverPath: "docs/readme.md"
    fingerprint: "deadbeef"
    serverVersion: 3
    deleted: false
    conflicted: true
    conflictAt: 1705353600000
    conflictServerVersion: 2
---
```

**Implementation**: [cli/src/client/cli.ts](../src/client/cli.ts)
- `parseYamlFrontmatter()` - Parses state
- `toYamlFrontmatter()` - Serializes state

---

## API Endpoints

### POST `/v1/sync/pull`

Fetch changes from server.

**Request**:
```json
{ "sinceCursor": 0 }
```

**Response**:
```json
{
  "newCursor": 42,
  "changes": [
    {
      "fileId": "ABC123XYZ",
      "serverPath": "notes/hello.md",
      "version": 2,
      "deleted": false,
      "content": "---\njrn: ABC123XYZ\n---\n# Hello",
      "contentHash": "a1b2c3d4"
    }
  ]
}
```

**Implementation**: [backend/src/router/SyncRouter.ts](../../backend/src/router/SyncRouter.ts)

### POST `/v1/sync/push`

Push local changes to server.

**Request**:
```json
{
  "requestId": "optional-idempotency-key",
  "ops": [
    {
      "type": "upsert",
      "fileId": "ABC123XYZ",
      "serverPath": "notes/hello.md",
      "baseVersion": 1,
      "content": "# Updated content",
      "contentHash": "e5f6g7h8"
    }
  ]
}
```

**Response**:
```json
{
  "results": [
    { "fileId": "ABC123XYZ", "status": "ok", "newVersion": 2 }
  ],
  "newCursor": 44
}
```

**Status Codes**: `ok`, `conflict`, `bad_hash`

**Implementation**: [backend/src/router/SyncRouter.ts](../../backend/src/router/SyncRouter.ts)

---

## Sync Algorithm

### Full Sync Flow

```
┌─────────────────┐
│ Recover Pending │  Check for interrupted push
└────────┬────────┘
         ▼
┌─────────────────┐
│      PULL       │  Fetch server changes
└────────┬────────┘
         ▼
┌─────────────────┐
│  Apply Changes  │  Update local files, detect conflicts
└────────┬────────┘
         ▼
┌─────────────────┐
│      PUSH       │  Send local changes
└────────┬────────┘
         ▼
┌─────────────────┐
│   Save State    │  Persist to .jolli/sync.md
└─────────────────┘
```

**Implementation**: [cli/src/shared/sync.ts](../src/shared/sync.ts)

### Pull Algorithm

```
1. POST /v1/sync/pull { sinceCursor }

2. For each change:

   IF deleted:
     → Move local file to .sync/trash/
     → Mark entry as tombstone

   ELSE IF known file (by fileId):
     IF path changed:
       → Rename file on disk              ← NEW in recent update
     IF local changed AND server changed:
       → Invoke conflict strategy (3-way merge)
     ELSE:
       → Overwrite with server content
       → Save snapshot for future merges

   ELSE (new file):
     → Write to disk
     → Add to state

3. Update lastCursor
```

**Implementation**: [cli/src/shared/sync.ts](../src/shared/sync.ts)

### Push Algorithm

```
1. Scan local files (glob patterns)

2. For each file:

   IF has JRN matching different path in state:
     → RENAME detected
     → Push upsert with new serverPath

   ELSE IF new file (not in state):
     → Generate fileId
     → Inject JRN into frontmatter
     → Push upsert with baseVersion: 0

   ELSE IF fingerprint changed:
     → Push upsert with current baseVersion

3. For each state entry not on disk:
   → DELETE detected
   → Push delete op

4. POST /v1/sync/push { ops }

5. Process results:
   - "ok": Update serverVersion
   - "conflict": Log warning, user re-syncs
```

**Implementation**: [cli/src/shared/sync.ts](../src/shared/sync.ts)

---

## Conflict Resolution

### Detection

A conflict occurs when both local and server have changes:

```typescript
localFingerprint !== state.fingerprint  // local changed
  AND
state.serverVersion < change.version    // server changed
```

### Resolution Strategies

#### 1. Conflict Markers (default)

Uses three-way merge with git-style markers:

```markdown
# Document

## Status
<<<<<<< LOCAL
- [x] Task A (local edit)
- [ ] Task B
=======
- [ ] Task A
- [x] Task B (server edit)
>>>>>>> SERVER

## Footer
The end
```

**Implementation**: [cli/src/shared/smart-merge.ts](../src/shared/smart-merge.ts)

- `threeWayMerge(base, local, server)` - LCS-based merge
- Only conflicting hunks get markers (not entire file)
- Non-overlapping changes auto-merge

#### 2. Keep Both

Creates a conflict copy file:

```
document.md          ← local version
document (conflict 2024-01-15-10-30).md  ← server version
```

**Implementation**: [cli/src/client/cli.ts](../src/client/cli.ts)

### Snapshot Store

Base versions cached for three-way merge:

```
.jolli/snapshots/
└── ABC123XYZ.md     # Content at last successful sync
```

**Implementation**: [cli/src/client/cli.ts](../src/client/cli.ts)

---

## Fingerprinting

Content hashes exclude JRN to avoid false change detection:

```typescript
function fingerprintFromContent(content: string): string {
  const withoutJrn = removeJrnFromContent(content);
  return wyhash(withoutJrn).toString(16);
}
```

**Implementation**: [cli/src/shared/sync-helpers.ts](../src/shared/sync-helpers.ts)

### Integrity Hash

Full content hash for server verification:

```typescript
function integrityHashFromContent(content: string): string {
  return wyhash(content, 0n).toString(16);
}
```

Uses `wyhash` npm package to match Bun's native `Bun.hash()`.

---

## Tombstones and Deletion

### Soft Delete Flow

1. Local file deleted → Push `delete` op
2. Server marks as tombstone (`deleted: true`)
3. Other clients receive delete on pull
4. File moved to `.sync/trash/<timestamp>/<path>`
5. After 30 days: Tombstone purged from state

**Implementation**: [cli/src/client/cli.ts](../src/client/cli.ts) (`moveToTrash`, `purgeTrash`, `purgeTombstones`)

---

## Pending Operations Recovery

Handles interrupted pushes (crash, network failure):

```json
// .jolli/pending-ops.json
{
  "requestId": "abc123",
  "createdAt": 1705353600000,
  "ops": [/* push operations */]
}
```

**Flow**:
1. Save pending ops before push
2. If sync interrupted, ops remain in file
3. Next sync detects pending ops
4. Resends with same requestId
5. Version conflicts prevent double-apply

**Implementation**: [cli/src/shared/sync.ts](../src/shared/sync.ts)

---

## File Type Support

### With Embedded ID (Markdown)

- JRN in frontmatter enables rename tracking
- Full history preserved across renames
- Three-way merge for conflicts

### Without Embedded ID (Binary/Images)

- Identity tied to path
- Rename = delete old + create new
- No merge (binary files)

**Detection**: [cli/src/shared/sync.ts](../src/shared/sync.ts) (`extractJrn` check in push phase)

---

## Backend Integration

### DocDao Storage

Sync articles stored as regular docs:

```
JRN: jrn:/global:docs:article/sync-{fileId}
```

**Implementation**: [backend/src/router/SyncRouter.ts](../../backend/src/router/SyncRouter.ts)

### Sync Metadata

Stored in `contentMetadata.sync`:

```typescript
interface SyncInfo {
  fileId: string;
  serverPath: string;
  contentHash?: string;
  deleted?: boolean;
  deletedAt?: number;
}
```

### Web Edit Hook

When edited via web UI, cursor advances so CLI sees changes:

```typescript
if (doc.jrn.startsWith("jrn:/global:docs:article/sync-")) {
  await syncArticleDao.advanceCursor(doc.jrn);
}
```

**Implementation**: [backend/src/router/DocRouter.ts](../../backend/src/router/DocRouter.ts)

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JOLLI_URL` | `http://localhost:8034` | Auth server |
| `SYNC_SERVER_URL` | `http://localhost:3001` | Sync API |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `DEBUG` | - | Enable debug mode |

### Config Files

Load order (later overrides earlier):
1. `~/.jolli/.env` (user)
2. `.env` (project)
3. `process.env`

**Implementation**: [cli/src/shared/config.ts](../src/shared/config.ts)

---

## CLI Commands

```bash
# Authentication
jolli auth login     # Browser OAuth flow
jolli auth logout    # Clear credentials
jolli auth status    # Check auth state

# Sync
jolli sync           # Full bidirectional sync (default)
jolli sync up        # Push only (--up-only)
jolli sync down      # Pull only (--down-only)
```

**Implementation**: [cli/src/client/cli.ts](../src/client/cli.ts)

---

## Data Types Reference

### FileEntry (client state)

```typescript
interface FileEntry {
  clientPath: string;      // Local path
  fileId: string;          // Stable ID (ULID)
  serverPath: string;      // Obfuscated server path
  fingerprint: string;     // Content hash (excl. JRN)
  serverVersion: number;   // Version from server

  // Tombstone
  deleted?: boolean;
  deletedAt?: number;
  trashPath?: string;

  // Conflict
  conflicted?: boolean;
  conflictAt?: number;
  conflictServerVersion?: number;
}
```

### PushOp

```typescript
interface PushOp {
  type: "upsert" | "delete";
  fileId: string;
  serverPath: string;
  baseVersion: number;
  content?: string;        // Required for upsert
  contentHash?: string;    // Integrity check
}
```

### PullChange

```typescript
interface PullChange {
  fileId: string;
  serverPath: string;
  version: number;
  deleted: boolean;
  content?: string;        // Undefined if deleted
  contentHash?: string;
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| [cli/src/shared/sync.ts](../src/shared/sync.ts) | Core sync algorithm |
| [cli/src/shared/smart-merge.ts](../src/shared/smart-merge.ts) | Three-way merge |
| [cli/src/shared/sync-helpers.ts](../src/shared/sync-helpers.ts) | JRN, fingerprint, utilities |
| [cli/src/client/cli.ts](../src/client/cli.ts) | CLI implementation |
| [cli/src/client/types.ts](../src/client/types.ts) | Type definitions |
| [backend/src/router/SyncRouter.ts](../../backend/src/router/SyncRouter.ts) | Server API |
| [backend/src/dao/SyncArticleDao.ts](../../backend/src/dao/SyncArticleDao.ts) | Cursor tracking |
| [backend/src/dao/DocDao.ts](../../backend/src/dao/DocDao.ts) | Content storage |

---

## See Also

- [Future specs](future/) - Planned feature specs (v3-v8)
