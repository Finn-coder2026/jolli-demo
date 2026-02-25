# Markdown Sync Server - Conflict Resolution Spec (v3)

## Summary

This spec extends v2 to add:
1. **Commit history** with messages (like git)
2. **Server-side snapshots** for 3-way merge
3. **Proper conflict resolution** for both CLI and web

| Feature | v2 Behavior | v3 Behavior |
|---------|-------------|-------------|
| Commit history | None | `sync_commits` + `sync_commit_files` tables |
| Web edit sync article | Direct edit, web wins | Creates draft, merge on save |
| CLI conflict detection | Client-side snapshots | Server provides base snapshot |
| 3-way merge | CLI only | Both CLI and web |
| Base snapshot storage | CLI local `.jolli/snapshots/` | Server `sync_commit_files` table |

## Prerequisites

- v2 spec fully implemented
- `sync_articles` table and cursor system working
- `SyncArticleDao` operational

## 2026 Refactor Addendum: Multi-Source Changeset Review Flow

This addendum updates v3 to support a git-like changeset workflow on web:

1. CLI `sync-push` submits a **proposed changeset** with a unique client commit ID (required; server does not generate fallback IDs).
2. Web reviewers inspect the **entire changeset** (all files), then accept/reject/amend per file.
3. A final publish action applies approved content into **`main`** (only branch).

### Scope in multi-source world

- **Server-managed/web-visible sources** (for example true/shared sources) participate in this workflow.
- **Local-only/virtual sources** do not create server changesets and remain CLI-local behavior.
- CLI push behavior stays mostly the same (send ops + metadata); the major changes are server/web review lifecycle.

### Updated lifecycle

`proposed -> reviewing -> ready -> published`  
Terminal states: `rejected`, `superseded`

### Branch model

- Server supports a single writable branch: `main`.
- Proposed changesets are review artifacts, not long-lived branches.
- Publish applies reviewed file updates into `main` when base snapshots still match.

### Data model delta on top of v3

Keep `sync_commits` and `sync_commit_files`, and extend:

- `sync_commits.client_changeset_id` (required, client-generated, unique per changeset scope)
- `sync_commits.status` (`proposed|reviewing|ready|published|rejected|superseded`)
- `sync_commits.commit_scope_key` (required for server-managed scopes; defines idempotency/uniqueness scope)
- `sync_commits.payload_hash` (server-computed hash of canonical pushed payload for replay verification)
- `sync_commits.target_branch` (default `main`)
- `sync_commits.published_at`, `sync_commits.published_by`

Add constraint:

- `UNIQUE (commit_scope_key, client_changeset_id)`

### `clientChangesetId` scope and replay rules

- Uniqueness scope is **per `commitScopeKey`** (not per user, not global).
- If `(commitScopeKey, clientChangesetId)` is reused with the **same** canonical payload hash, server returns the existing proposed changeset (idempotent replay).
- If `(commitScopeKey, clientChangesetId)` is reused with a **different** payload hash, server rejects with conflict (`409`, `CLIENT_CHANGESET_ID_REUSED`).

Add per-file review decisions:

```sql
CREATE TABLE sync_commit_file_reviews (
  id SERIAL PRIMARY KEY,
  commit_file_id INTEGER NOT NULL REFERENCES sync_commit_files(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject', 'amend')),
  amended_content TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  comment TEXT
);
```

### Snapshot model for publish-time base checks

For each changeset file, retain enough data for publish-time conflict checks:

- `base_content` / `base_version` (state at proposal time)
- `incoming_content` (content from CLI push)
- publish-time current `main` content/version is read fresh from docs table

Publish-time apply rule:

- accepted/amended incoming content is applied only when current `main` still matches `base_content` + `base_version`
- otherwise publish reports per-file conflict and leaves resolution to manual/agent merge outside sync

### API shape changes

- `POST /v1/sync/push`:
  - creates/returns proposed changeset
  - request requires client-generated `clientChangesetId`, `targetBranch=main`, optional `message`
  - missing `clientChangesetId` is a validation error (`400`)
  - server computes/stores `payloadHash` and enforces replay rules for `(commitScopeKey, clientChangesetId)`
  - does not auto-publish into main when review is required
- `GET /v1/sync/changesets/:id` + `GET /v1/sync/changesets/:id/files` (with `/commits` aliases):
  - used by web review UI for full-changeset inspection
- `PATCH /v1/sync/changesets/:id/files/:fileId/review` (with `/commits` alias):
  - set `accept|reject|amend` and optional amended content/comment
- `POST /v1/sync/changesets/:id/publish` (with `/commits` alias):
  - server applies non-conflicting accepted/amended files into `main`
  - returns per-file publish/conflict report
  - returns `409` with `{ code: "PUBLISH_IN_PROGRESS" }` when another publish request already holds the changeset publish lock

### Web merge endpoint note

Sections in this document that directly merge draft -> live are now interpreted as a lower-level merge primitive.
The primary product flow should go through changeset review + publish to `main`.

---

# Part A: Commit History & Snapshot Tables + API

This part adds the data model and API for storing changeset history with snapshots.

---

## Data Model

### New Table: `sync_commits`

Stores changeset metadata (one row per push batch).

```sql
CREATE TABLE sync_commits (
  id SERIAL PRIMARY KEY,
  seq BIGINT NOT NULL,                    -- cursor value at proposal time
  message TEXT,                           -- message from CLI
  pushed_by TEXT,                         -- user/client identifier
  client_changeset_id TEXT NOT NULL,         -- required from CLI
  status TEXT NOT NULL DEFAULT 'proposed',
  commit_scope_key TEXT NOT NULL,         -- idempotency scope key
  target_branch TEXT NOT NULL DEFAULT 'main',
  payload_hash TEXT NOT NULL,
  published_at TIMESTAMP,
  published_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX sync_commits_seq_idx ON sync_commits(seq);
CREATE UNIQUE INDEX sync_commits_scope_client_changeset_key
  ON sync_commits(commit_scope_key, client_changeset_id);
```

### New Table: `sync_commit_files`

Stores files changed in each changeset with base+incoming snapshot data.

```sql
CREATE TABLE sync_commit_files (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER NOT NULL REFERENCES sync_commits(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  doc_jrn TEXT NOT NULL,
  server_path TEXT NOT NULL,
  base_content TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  incoming_content TEXT,
  incoming_content_hash TEXT,
  op_type TEXT NOT NULL CHECK (op_type IN ('upsert', 'delete'))
);

CREATE INDEX sync_commit_files_commit_idx ON sync_commit_files(commit_id);
CREATE INDEX sync_commit_files_doc_jrn_idx ON sync_commit_files(doc_jrn);
CREATE UNIQUE INDEX sync_commit_files_commit_file_key ON sync_commit_files(commit_id, file_id);
```

### Sequelize Model: `SyncCommit`

```typescript
// backend/src/model/SyncCommit.ts

import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface SyncCommit {
  readonly id: number;
  readonly seq: number;
  readonly message: string | undefined;
  readonly pushedBy: string | undefined;
  readonly clientChangesetId: string;
  readonly status: "proposed" | "reviewing" | "ready" | "published" | "rejected" | "superseded";
  readonly commitScopeKey: string;
  readonly targetBranch: string;
  readonly payloadHash: string;
  readonly publishedAt: Date | undefined;
  readonly publishedBy: string | undefined;
  readonly createdAt: Date;
}

export type NewSyncCommit = Omit<SyncCommit, "id" | "createdAt" | "publishedAt" | "publishedBy"> & {
  publishedAt?: Date;
  publishedBy?: string;
};

export function defineSyncCommits(sequelize: Sequelize): ModelDef<SyncCommit> {
  const existing = sequelize.models?.sync_commit;
  if (existing) {
    return existing as ModelDef<SyncCommit>;
  }
  return sequelize.define("sync_commit", schema, {
    timestamps: false,
    tableName: "sync_commits",
    indexes: [
      { name: "sync_commits_seq_idx", fields: ["seq"] },
      {
        name: "sync_commits_scope_client_changeset_key",
        unique: true,
        fields: ["commit_scope_key", "client_changeset_id"],
      },
    ],
  });
}

const schema = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  seq: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  pushedBy: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: "pushed_by",
  },
  clientChangesetId: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "client_changeset_id",
  },
  status: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "proposed",
  },
  commitScopeKey: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "commit_scope_key",
  },
  targetBranch: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "main",
    field: "target_branch",
  },
  payloadHash: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "payload_hash",
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: "published_at",
  },
  publishedBy: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: "published_by",
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: "created_at",
  },
};
```

### Sequelize Model: `SyncCommitFile`

```typescript
// backend/src/model/SyncCommitFile.ts

import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface SyncCommitFile {
  readonly id: number;
  readonly commitId: number;
  readonly docJrn: string;
  readonly baseContent: string;
  readonly baseVersion: number;
  readonly opType: "upsert" | "delete";
}

export type NewSyncCommitFile = Omit<SyncCommitFile, "id">;

export function defineSyncCommitFiles(sequelize: Sequelize): ModelDef<SyncCommitFile> {
  const existing = sequelize.models?.sync_commit_file;
  if (existing) {
    return existing as ModelDef<SyncCommitFile>;
  }
  return sequelize.define("sync_commit_file", schema, {
    timestamps: false,
    tableName: "sync_commit_files",
  });
}

const schema = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  commitId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "commit_id",
    references: {
      model: "sync_commits",
      key: "id",
    },
    onDelete: "CASCADE",
  },
  docJrn: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "doc_jrn",
  },
  baseContent: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "base_content",
  },
  baseVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "base_version",
  },
  opType: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: "op_type",
  },
};
```

---

## New DAO: `SyncCommitDao`

```typescript
// backend/src/dao/SyncCommitDao.ts

import type { Sequelize } from "sequelize";
import { defineSyncCommits, type SyncCommit, type NewSyncCommit } from "../model/SyncCommit";
import { defineSyncCommitFiles, type SyncCommitFile, type NewSyncCommitFile } from "../model/SyncCommitFile";

export interface SyncCommitDao {
  /** Create a new commit with its files */
  createCommit(commit: NewSyncCommit, files: Array<Omit<NewSyncCommitFile, "commitId">>): Promise<SyncCommit>;

  /** Get latest snapshot for a doc (for 3-way merge) */
  getLatestSnapshot(docJrn: string): Promise<{ baseContent: string; baseVersion: number } | undefined>;

  /** Get commit history (most recent first) */
  getCommitHistory(limit?: number): Promise<Array<SyncCommit>>;

  /** Get files in a specific commit */
  getCommitFiles(commitId: number): Promise<Array<SyncCommitFile>>;

  /** Get commit history for a specific file */
  getFileHistory(docJrn: string, limit?: number): Promise<Array<SyncCommitFile & { commit: SyncCommit }>>;
}

export function createSyncCommitDao(sequelize: Sequelize): SyncCommitDao {
  const SyncCommits = defineSyncCommits(sequelize);
  const SyncCommitFiles = defineSyncCommitFiles(sequelize);

  return {
    createCommit,
    getLatestSnapshot,
    getCommitHistory,
    getCommitFiles,
    getFileHistory,
  };

  async function createCommit(
    commit: NewSyncCommit,
    files: Array<Omit<NewSyncCommitFile, "commitId">>
  ): Promise<SyncCommit> {
    const transaction = await sequelize.transaction();
    try {
      const commitRow = await SyncCommits.create(commit, { transaction });
      const commitId = commitRow.get("id") as number;

      for (const file of files) {
        await SyncCommitFiles.create({ ...file, commitId }, { transaction });
      }

      await transaction.commit();
      return commitRow.get({ plain: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function getLatestSnapshot(docJrn: string): Promise<{ baseContent: string; baseVersion: number } | undefined> {
    const row = await SyncCommitFiles.findOne({
      where: { docJrn },
      order: [["baseVersion", "DESC"]],
    });
    if (!row) return undefined;
    const data = row.get({ plain: true });
    return { baseContent: data.baseContent, baseVersion: data.baseVersion };
  }

  async function getCommitHistory(limit = 50): Promise<Array<SyncCommit>> {
    const rows = await SyncCommits.findAll({
      order: [["seq", "DESC"]],
      limit,
    });
    return rows.map(r => r.get({ plain: true }));
  }

  async function getCommitFiles(commitId: number): Promise<Array<SyncCommitFile>> {
    const rows = await SyncCommitFiles.findAll({
      where: { commitId },
    });
    return rows.map(r => r.get({ plain: true }));
  }

  async function getFileHistory(
    docJrn: string,
    limit = 50
  ): Promise<Array<SyncCommitFile & { commit: SyncCommit }>> {
    const rows = await SyncCommitFiles.findAll({
      where: { docJrn },
      order: [["baseVersion", "DESC"]],
      limit,
      include: [{ model: SyncCommits, as: "commit" }],
    });
    return rows.map(r => r.get({ plain: true, include: ["commit"] }));
  }
}
```

---

## Updated Push Request

Push request shape (with required idempotency fields):

```typescript
interface PushRequest {
  clientChangesetId: string;
  targetBranch: "main";
  message?: string;
  ops: Array<PushOp>;
}
```

---

## API Endpoints

### Updated POST `/v1/sync/push`

After successful push, create commit record:

```typescript
// In SyncRouter.ts POST /v1/sync/push

router.post("/push", async (req, res) => {
  const { ops, message } = req.body as PushRequest;
  const pushedBy = req.orgUser?.id ? String(req.orgUser.id) : undefined;

  // ... existing push logic for each op ...

  // After all ops processed successfully
  const successfulOps = results.filter(r => r.status === "ok");

  if (successfulOps.length > 0) {
    const cursor = await syncArticleDao.getCurrentCursor();

    // Create commit record
    await syncCommitDao.createCommit(
      { seq: cursor, message, pushedBy },
      successfulOps.map(r => ({
        docJrn: `jrn:/global:docs:article/sync-${r.fileId}`,
        baseContent: /* content from op */,
        baseVersion: r.newVersion!,
        opType: /* op.type */,
      }))
    );
  }

  res.json({ results, newCursor: cursor });
});
```

### GET `/v1/sync/snapshot/:fileId`

Returns latest snapshot for 3-way merge:

```typescript
router.get("/snapshot/:fileId", async (req, res) => {
  const jrn = `jrn:/global:docs:article/sync-${req.params.fileId}`;
  const snapshot = await syncCommitDao.getLatestSnapshot(jrn);

  if (!snapshot) {
    return res.status(404).json({ error: "No snapshot found" });
  }

  res.json({
    fileId: req.params.fileId,
    baseContent: snapshot.baseContent,
    baseVersion: snapshot.baseVersion,
  });
});
```

**Response:**
```json
{
  "fileId": "01J8MZCW2K8SV0JZ00P0X",
  "baseContent": "# Original content\n\nThis is the base.",
  "baseVersion": 3
}
```

### GET `/v1/sync/changesets` (with `/v1/sync/commits` alias)

Returns changeset history:

```typescript
const listChangesets = async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const changesets = await syncCommitDao.getCommitHistory(limit);
  // Keep legacy response key for compatibility while preferring changesets.
  res.json({ changesets, commits: changesets });
};
router.get("/changesets", listChangesets);
router.get("/commits", listChangesets);
```

**Response:**
```json
{
  "changesets": [
    {
      "id": 5,
      "seq": 42,
      "message": "Updated API documentation",
      "pushedBy": "cli-user@example.com",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": 4,
      "seq": 38,
      "message": "Fixed typos in README",
      "pushedBy": "cli-user@example.com",
      "createdAt": "2024-01-14T15:20:00Z"
    }
  ]
}
```

### GET `/v1/sync/changesets/:id/files` (with `/v1/sync/commits/:id/files` alias)

Returns files changed in a specific changeset:

```typescript
const getChangesetFiles = async (req, res) => {
  const commitId = parseInt(req.params.id);
  const files = await syncCommitDao.getCommitFiles(commitId);
  res.json({ files });
};
router.get("/changesets/:id/files", getChangesetFiles);
router.get("/commits/:id/files", getChangesetFiles);
```

**Response:**
```json
{
  "files": [
    {
      "id": 10,
      "commitId": 5,
      "docJrn": "jrn:/global:docs:article/sync-abc123",
      "baseContent": "# API Docs\n\nUpdated content...",
      "baseVersion": 3,
      "opType": "upsert"
    }
  ]
}
```

### GET `/v1/sync/history/:fileId`

Returns commit history for a specific file:

```typescript
router.get("/history/:fileId", async (req, res) => {
  const jrn = `jrn:/global:docs:article/sync-${req.params.fileId}`;
  const limit = parseInt(req.query.limit as string) || 50;
  const history = await syncCommitDao.getFileHistory(jrn, limit);
  res.json({ history });
});
```

---

## Part A Implementation Plan

### Phase A1: Data Model
1. [ ] Create `backend/src/model/SyncCommit.ts`
2. [ ] Create `backend/src/model/SyncCommitFile.ts`
3. [ ] Create `backend/src/dao/SyncCommitDao.ts`
4. [ ] Wire up in `Database.ts`

### Phase A2: API Endpoints
5. [ ] Update `POST /v1/sync/push` to create commit records
6. [ ] Add `GET /v1/sync/snapshot/:fileId` endpoint
7. [ ] Add `GET /v1/sync/changesets` endpoint (`/commits` alias optional)
8. [ ] Add `GET /v1/sync/changesets/:id/files` endpoint (`/commits` alias optional)
9. [ ] Add `GET /v1/sync/history/:fileId` endpoint

### Phase A3: Tests
10. [ ] SyncCommitDao tests (createCommit, getLatestSnapshot, getCommitHistory, etc.)
11. [ ] Snapshot API tests
12. [ ] Commit history API tests

---

## Part A Test Cases

```typescript
describe("SyncCommitDao", () => {
  it("should create commit with files", async () => {
    const commit = await syncCommitDao.createCommit(
      { seq: 1, message: "Initial commit", pushedBy: "test-user" },
      [
        { docJrn: "jrn:/global:docs:article/sync-file1", baseContent: "# File 1", baseVersion: 1, opType: "upsert" },
        { docJrn: "jrn:/global:docs:article/sync-file2", baseContent: "# File 2", baseVersion: 1, opType: "upsert" },
      ]
    );

    expect(commit.id).toBeDefined();
    expect(commit.message).toBe("Initial commit");

    const files = await syncCommitDao.getCommitFiles(commit.id);
    expect(files).toHaveLength(2);
  });

  it("should get latest snapshot for doc", async () => {
    // Create two commits for same file
    await syncCommitDao.createCommit(
      { seq: 1, message: "v1" },
      [{ docJrn: "jrn:/global:docs:article/sync-test", baseContent: "# V1", baseVersion: 1, opType: "upsert" }]
    );
    await syncCommitDao.createCommit(
      { seq: 2, message: "v2" },
      [{ docJrn: "jrn:/global:docs:article/sync-test", baseContent: "# V2", baseVersion: 2, opType: "upsert" }]
    );

    const snapshot = await syncCommitDao.getLatestSnapshot("jrn:/global:docs:article/sync-test");
    expect(snapshot?.baseContent).toBe("# V2");
    expect(snapshot?.baseVersion).toBe(2);
  });

  it("should return commit history in descending order", async () => {
    await syncCommitDao.createCommit({ seq: 1, message: "First" }, []);
    await syncCommitDao.createCommit({ seq: 2, message: "Second" }, []);

    const history = await syncCommitDao.getCommitHistory();
    expect(history[0].message).toBe("Second");
    expect(history[1].message).toBe("First");
  });
});

describe("GET /v1/sync/snapshot/:fileId", () => {
  it("should return latest snapshot", async () => {
    // Push a file
    await request(app).post("/v1/sync/push").send({
      clientChangesetId: "CID-SNAPSHOT-1",
      targetBranch: "main",
      message: "Test commit",
      ops: [{ type: "upsert", fileId: "test-file", serverPath: "test.md", baseVersion: 0, content: "# Test" }],
    });

    const response = await request(app).get("/v1/sync/snapshot/test-file");

    expect(response.status).toBe(200);
    expect(response.body.baseContent).toBe("# Test");
    expect(response.body.baseVersion).toBe(1);
  });

  it("should return 404 for unknown file", async () => {
    const response = await request(app).get("/v1/sync/snapshot/unknown-file");
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/sync/changesets", () => {
  it("should return changeset history", async () => {
    await request(app).post("/v1/sync/push").send({
      clientChangesetId: "CID-LIST-1",
      targetBranch: "main",
      message: "Commit 1",
      ops: [{ type: "upsert", fileId: "file1", serverPath: "a.md", baseVersion: 0, content: "# A" }],
    });
    await request(app).post("/v1/sync/push").send({
      clientChangesetId: "CID-LIST-2",
      targetBranch: "main",
      message: "Commit 2",
      ops: [{ type: "upsert", fileId: "file2", serverPath: "b.md", baseVersion: 0, content: "# B" }],
    });

    const response = await request(app).get("/v1/sync/changesets");

    expect(response.status).toBe(200);
    expect(response.body.changesets).toHaveLength(2);
    expect(response.body.changesets[0].message).toBe("Commit 2");
  });
});
```

---

# Part B: Web Draft Flow, 3-Way Merge, CLI Integration

This part adds conflict resolution flows for both web and CLI.

---

## Web Edit Flow: Always Create Draft

When a web user edits a sync article, create a draft instead of direct edit.

### Intercept in DocRouter

```typescript
// In DocRouter.ts PUT handler

router.put("/:jrn", async (req, res) => {
  const jrn = decodeURIComponent(req.params.jrn);

  // Check if this is a sync article
  if (jrn.startsWith("jrn:/global:docs:article/sync-")) {
    return handleSyncArticleEdit(req, res, jrn);
  }

  // Normal flow for non-sync articles
  const doc = await docDao.updateDoc(req.body);
  // ...
});

async function handleSyncArticleEdit(req: Request, res: Response, jrn: string) {
  const doc = await docDao.readDoc(jrn);
  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  const userId = getUserId(req);

  // Check if draft already exists for this doc
  let draft = await docDraftDao.findDraftByDocId(doc.id);

  if (!draft) {
    // Create new draft
    draft = await docDraftDao.createDocDraft({
      docId: doc.id,
      title: doc.contentMetadata?.title ?? "Untitled",
      content: req.body.content,
      createdBy: userId,
      contentMetadata: {
        sync: {
          draftBaseContent: doc.content,
          draftBaseVersion: doc.version,
        },
      },
    });
  } else {
    // Update existing draft
    // Keep original draft base snapshot captured at draft creation.
    draft = await docDraftDao.updateDocDraft(draft.id, {
      content: req.body.content,
      contentLastEditedAt: new Date(),
      contentLastEditedBy: userId,
    });
  }

  res.json({
    draft,
    message: "Changes saved to draft. Use merge to apply to live article.",
    isSyncArticle: true,
  });
}
```

---

## 3-Way Merge Utility

```typescript
// backend/src/util/ThreeWayMerge.ts
import { diff3Merge } from "node-diff3";

export interface MergeResult {
  merged: string;
  hasConflict: boolean;
}

/**
 * Performs a 3-way merge between base, current, and incoming content.
 * Returns merged content with conflict markers if conflicts exist.
 */
export function threeWayMerge(
  base: string,
  current: string,
  incoming: string
): MergeResult {
  // Fast paths first
  if (current === base) {
    return { merged: incoming, hasConflict: false };
  }
  if (incoming === base) {
    return { merged: current, hasConflict: false };
  }
  if (current === incoming) {
    return { merged: current, hasConflict: false };
  }

  // Use a real diff3 implementation. A single prefix/suffix chunking strategy
  // is too coarse and produces false conflicts for many non-overlapping edits.
  const baseLines = base.split("\n");
  const currentLines = current.split("\n");
  const incomingLines = incoming.split("\n");
  const diff3 = diff3Merge(currentLines, baseLines, incomingLines);

  let hasConflict = false;
  const mergedChunks = diff3.result.map(chunk => {
    if ("ok" in chunk) {
      return chunk.ok.join("\n");
    }
    hasConflict = true;
    return [
      "<<<<<<< SERVER (CLI)",
      ...chunk.conflict.a,
      "=======",
      ...chunk.conflict.b,
      ">>>>>>> WEB",
    ].join("\n");
  });

  return { merged: mergedChunks.join("\n"), hasConflict };
}
```

---

## Merge Endpoint: Draft → Live Doc

### POST `/doc-drafts/:id/merge`

```typescript
// In DocDraftRouter.ts

router.post("/:id/merge", async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = await docDraftDao.getDocDraft(draftId);

  if (!draft || !draft.docId) {
    return res.status(404).json({ error: "Draft not found or not linked to article" });
  }

  const doc = await docDao.readDocById(draft.docId);
  if (!doc) {
    return res.status(404).json({ error: "Linked article not found" });
  }

  const isSyncArticle = doc.jrn.startsWith("jrn:/global:docs:article/sync-");
  let finalContent = draft.content;
  const baseContentBeforeMerge = doc.content;
  const baseVersionBeforeMerge = doc.version;

  if (isSyncArticle) {
    // Use snapshot captured when draft was created (not latest snapshot at merge time).
    const draftSyncMetadata =
      (draft.contentMetadata as { sync?: { draftBaseContent?: string; draftBaseVersion?: number } } | undefined)?.sync;
    const draftBaseContent = draftSyncMetadata?.draftBaseContent ?? doc.content;
    const draftBaseVersion = draftSyncMetadata?.draftBaseVersion ?? doc.version;

    // Check if doc has changed since draft was created (CLI pushed while web was editing)
    if (doc.version > draftBaseVersion) {
      const mergeResult = threeWayMerge(
        draftBaseContent,      // base at draft creation
        doc.content,           // current (CLI version)
        draft.content          // draft (web version)
      );

      if (mergeResult.hasConflict) {
        return res.status(409).json({
          error: "Merge conflict",
          base: draftBaseContent,
          current: doc.content,
          draft: draft.content,
          merged: mergeResult.merged,
          hasConflict: true,
        });
      }

      finalContent = mergeResult.merged;
    }
  }

  // Apply draft to doc
  const result = await docDao.updateDocIfVersion({
    ...doc,
    content: finalContent,
    version: baseVersionBeforeMerge + 1,
  }, baseVersionBeforeMerge);

  if (result === "conflict") {
    return res.status(409).json({ error: "Version conflict, please refresh" });
  }

  // Create commit record for web merge
  if (isSyncArticle) {
    const cursor = await syncArticleDao.advanceCursor(doc.jrn);
    await syncCommitDao.createCommit(
      { seq: cursor, message: "Web merge", pushedBy: "web-user" },
      [
        {
          docJrn: doc.jrn,
          baseContent: baseContentBeforeMerge,
          baseVersion: baseVersionBeforeMerge,
          opType: "upsert",
        },
      ]
    );
  }

  // Delete the draft
  await docDraftDao.deleteDocDraft(draftId);

  res.json({ doc: result, message: "Draft merged successfully" });
});
```

---

## CLI Changes

### New Transport Method

```typescript
interface SyncTransport {
  pull: (sinceCursor: number) => Promise<PullResponse>;
  push: (request: PushRequest) => Promise<PushResponse>;
  getSnapshot: (fileId: string) => Promise<SnapshotResponse | null>;  // NEW
}

interface PushRequest {
  clientChangesetId: string;
  targetBranch: "main";
  message?: string;
  ops: Array<PushOp>;
}

interface SnapshotResponse {
  fileId: string;
  baseContent: string;
  baseVersion: number;
}
```

### Updated Conflict Handling

```typescript
// In CLI sync.ts

async function handleConflict(
  fileId: string,
  localContent: string,
  serverContent: string,
  transport: SyncTransport
): Promise<MergeResult> {
  // Fetch base from server instead of local snapshot
  const snapshot = await transport.getSnapshot(fileId);

  if (!snapshot) {
    // No base available, fall back to 2-way conflict markers
    return {
      merged: formatConflictMarkers(localContent, serverContent),
      hasConflict: true,
    };
  }

  return threeWayMerge(snapshot.baseContent, serverContent, localContent);
}
```

### CLI Push with Message

```bash
jolli push -m "Updated API documentation"
```

---

## Part B Implementation Plan

### Phase B1: 3-Way Merge Utility
1. [ ] Create `backend/src/util/ThreeWayMerge.ts`
2. [ ] Add tests for merge scenarios

### Phase B2: Web Draft Flow
3. [ ] Intercept sync article edits in DocRouter PUT handler
4. [ ] Return draft response with `isSyncArticle` flag
5. [ ] Update frontend to handle draft response for sync articles

### Phase B3: Merge Endpoint
6. [ ] Add `POST /doc-drafts/:id/merge` endpoint
7. [ ] Handle 3-way merge with conflict detection
8. [ ] Create commit record on successful merge

### Phase B4: CLI Changes
9. [ ] Add `getSnapshot` to transport
10. [ ] Update conflict handling to use server snapshot
11. [ ] Add `-m` flag for commit message
12. [ ] Remove local snapshot storage

### Phase B5: Tests
13. [ ] ThreeWayMerge unit tests
14. [ ] Web draft flow integration tests
15. [ ] Merge endpoint tests with conflict scenarios
16. [ ] CLI conflict resolution tests

---

## Part B Test Cases

```typescript
describe("threeWayMerge", () => {
  it("should take incoming when current unchanged", () => {
    const result = threeWayMerge("base", "base", "incoming");
    expect(result.merged).toBe("incoming");
    expect(result.hasConflict).toBe(false);
  });

  it("should keep current when incoming unchanged", () => {
    const result = threeWayMerge("base", "current", "base");
    expect(result.merged).toBe("current");
    expect(result.hasConflict).toBe(false);
  });

  it("should return no conflict when both same", () => {
    const result = threeWayMerge("base", "same", "same");
    expect(result.merged).toBe("same");
    expect(result.hasConflict).toBe(false);
  });

  it("should add conflict markers when both changed differently", () => {
    const result = threeWayMerge(
      "line1\nbase\nline3",
      "line1\ncurrent\nline3",
      "line1\nincoming\nline3"
    );
    expect(result.hasConflict).toBe(true);
    expect(result.merged).toContain("<<<<<<< SERVER (CLI)");
    expect(result.merged).toContain("current");
    expect(result.merged).toContain("=======");
    expect(result.merged).toContain("incoming");
    expect(result.merged).toContain(">>>>>>> WEB");
  });
});

describe("PUT /docs/:jrn (sync article)", () => {
  it("should create draft instead of direct update", async () => {
    // Setup: create sync article
    await pushSyncArticle("test-file", "# Original");

    const response = await request(app)
      .put("/docs/jrn%3A%2Fglobal%3Adocs%3Aarticle%2Fsync-test-file")
      .set("Cookie", `authToken=${authToken}`)
      .send({ content: "# Modified" });

    expect(response.status).toBe(200);
    expect(response.body.draft).toBeDefined();
    expect(response.body.isSyncArticle).toBe(true);

    // Original doc unchanged
    const doc = await docDao.readDoc("jrn:/global:docs:article/sync-test-file");
    expect(doc?.content).toBe("# Original");
  });
});

describe("POST /doc-drafts/:id/merge", () => {
  it("should merge draft to sync article", async () => {
    // Setup
    await pushSyncArticle("test-file", "# Original");
    const doc = await docDao.readDoc("jrn:/global:docs:article/sync-test-file");
    const draft = await docDraftDao.createDocDraft({
      docId: doc.id,
      title: "Test",
      content: "# Modified by web",
      createdBy: 1,
    });

    const response = await request(app)
      .post(`/doc-drafts/${draft.id}/merge`)
      .set("Cookie", `authToken=${authToken}`);

    expect(response.status).toBe(200);
    const updated = await docDao.readDoc(doc.jrn);
    expect(updated?.content).toBe("# Modified by web");
  });

  it("should detect conflict when CLI pushed after draft created", async () => {
    // Setup: create sync article and draft
    await pushSyncArticle("test-file", "# Original");
    const doc = await docDao.readDoc("jrn:/global:docs:article/sync-test-file");
    const draft = await docDraftDao.createDocDraft({
      docId: doc.id,
      title: "Test",
      content: "# Web changes",
      createdBy: 1,
    });

    // Simulate CLI push (updates doc after draft created)
    await pushSyncArticle("test-file", "# CLI changes", 1);

    const response = await request(app)
      .post(`/doc-drafts/${draft.id}/merge`)
      .set("Cookie", `authToken=${authToken}`);

    expect(response.status).toBe(409);
    expect(response.body.hasConflict).toBe(true);
    expect(response.body.base).toBe("# Original");
    expect(response.body.current).toBe("# CLI changes");
    expect(response.body.draft).toBe("# Web changes");
  });
});
```

---

## CLI Idempotency via Required `clientChangesetId`

`clientChangesetId` is generated by the CLI before first send and reused on retries. The server enforces `UNIQUE (commit_scope_key, client_changeset_id)`.

Replay outcomes:

- same key + same payload hash -> idempotent replay (return existing proposed changeset)
- same key + different payload hash -> `409 CLIENT_CHANGESET_ID_REUSED`

CLI persistence rule:

- Store pending push package (including `clientChangesetId`, `targetBranch`, `ops`, `createdAt`) in `.jolli/pending-ops.json`.
- On retry, resend exactly that package; only mint a new `clientChangesetId` after ack/clear.

### Retry Flow

```typescript
// In CLI push handler

async function pushWithRetry(
  ops: PushOp[],
  message?: string,
): Promise<PushResponse> {
  const clientChangesetId = getOrCreatePendingChangesetId(ops);

  return transport.push({
    ops,
    targetBranch: "main",
    clientChangesetId,
    message,
  });
}
```

### Why This Works

1. **Stable retry key**: same `clientChangesetId` is reused if the first response is lost
2. **Server-enforced uniqueness**: `(commit_scope_key, client_changeset_id)` prevents duplicate proposals
3. **No fallback path**: missing `clientChangesetId` is rejected, so idempotency behavior is deterministic

---

## Future Considerations

### Conflict Resolution UI

Frontend could show a side-by-side diff view when merge returns `hasConflict: true`:

```
┌─────────────────────────────────────────────────────────┐
│  Merge Conflict Detected                                │
├─────────────────┬─────────────────┬─────────────────────┤
│  Base (v3)      │  CLI (v4)       │  Your Changes       │
├─────────────────┼─────────────────┼─────────────────────┤
│  # Title        │  # Title        │  # Title            │
│                 │                 │                     │
│  Original       │  CLI added      │  Web added          │
│  content        │  this line      │  different line     │
├─────────────────┴─────────────────┴─────────────────────┤
│  [Keep CLI] [Keep Mine] [Manual Merge]                  │
└─────────────────────────────────────────────────────────┘
```

### Changeset History Cleanup

Do **not** run blind cleanup deletes from v3. Cleanup policy is owned by v5 retention rules.

Why:

- v5 explicitly protects changeset rows still required for publish-time base checks.
- naive "keep last N per file" can delete `sync_commit_files`/`sync_commits` rows still needed by proposed/reviewing changesets.

v3 guidance:

- keep full changeset history (including review rows) by default.
- if cleanup is required, implement it under v5 with status-aware and base-dependency-aware rules.

---

## Implementation Status (As Of 2026-02-20)

v3 changeset runtime is largely implemented (push idempotency, review, publish, scope checks), but this document is **not yet retired**.

Reason:

- This file still contains legacy/stale sections and checklist items that do not reflect the current runtime contract.
- Treat runtime behavior and authoritative addenda as source-of-truth until this spec is fully reconciled.
