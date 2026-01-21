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

---

# Part A: Commit History & Snapshot Tables + API

This part adds the data model and API for storing commit history with snapshots.

---

## Data Model

### New Table: `sync_commits`

Stores commit metadata (one row per push batch, like a git commit).

```sql
CREATE TABLE sync_commits (
  id SERIAL PRIMARY KEY,
  seq BIGINT NOT NULL,                    -- cursor value at this commit
  message TEXT,                           -- commit message from CLI
  pushed_by TEXT,                         -- user/client identifier
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX sync_commits_seq_idx ON sync_commits(seq);
```

### New Table: `sync_commit_files`

Stores files changed in each commit with their content snapshot.

```sql
CREATE TABLE sync_commit_files (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER NOT NULL REFERENCES sync_commits(id) ON DELETE CASCADE,
  doc_jrn TEXT NOT NULL,
  base_content TEXT NOT NULL,             -- snapshot for 3-way merge
  base_version INTEGER NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('upsert', 'delete'))
);

CREATE INDEX sync_commit_files_commit_idx ON sync_commit_files(commit_id);
CREATE INDEX sync_commit_files_doc_jrn_idx ON sync_commit_files(doc_jrn);
CREATE INDEX sync_commit_files_doc_version_idx ON sync_commit_files(doc_jrn, base_version DESC);
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
  readonly createdAt: Date;
}

export type NewSyncCommit = Omit<SyncCommit, "id" | "createdAt">;

export function defineSyncCommits(sequelize: Sequelize): ModelDef<SyncCommit> {
  const existing = sequelize.models?.sync_commit;
  if (existing) {
    return existing as ModelDef<SyncCommit>;
  }
  return sequelize.define("sync_commit", schema, {
    timestamps: false,
    tableName: "sync_commits",
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

Add optional `message` field to push request:

```typescript
interface PushRequest {
  requestId?: string;
  message?: string;      // NEW: commit message
  pushedBy?: string;     // NEW: user/client identifier
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
  const { ops, message, pushedBy } = req.body as PushRequest;

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

### GET `/v1/sync/commits`

Returns commit history:

```typescript
router.get("/commits", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const commits = await syncCommitDao.getCommitHistory(limit);
  res.json({ commits });
});
```

**Response:**
```json
{
  "commits": [
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

### GET `/v1/sync/commits/:id/files`

Returns files changed in a specific commit:

```typescript
router.get("/commits/:id/files", async (req, res) => {
  const commitId = parseInt(req.params.id);
  const files = await syncCommitDao.getCommitFiles(commitId);
  res.json({ files });
});
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
7. [ ] Add `GET /v1/sync/commits` endpoint
8. [ ] Add `GET /v1/sync/commits/:id/files` endpoint
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

describe("GET /v1/sync/commits", () => {
  it("should return commit history", async () => {
    await request(app).post("/v1/sync/push").send({
      message: "Commit 1",
      ops: [{ type: "upsert", fileId: "file1", serverPath: "a.md", baseVersion: 0, content: "# A" }],
    });
    await request(app).post("/v1/sync/push").send({
      message: "Commit 2",
      ops: [{ type: "upsert", fileId: "file2", serverPath: "b.md", baseVersion: 0, content: "# B" }],
    });

    const response = await request(app).get("/v1/sync/commits");

    expect(response.status).toBe(200);
    expect(response.body.commits).toHaveLength(2);
    expect(response.body.commits[0].message).toBe("Commit 2");
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
    });
  } else {
    // Update existing draft
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
  // If current unchanged from base, take incoming
  if (current === base) {
    return { merged: incoming, hasConflict: false };
  }

  // If incoming unchanged from base, keep current
  if (incoming === base) {
    return { merged: current, hasConflict: false };
  }

  // If both same, no conflict
  if (current === incoming) {
    return { merged: current, hasConflict: false };
  }

  // Both changed - need line-by-line merge
  const baseLines = base.split("\n");
  const currentLines = current.split("\n");
  const incomingLines = incoming.split("\n");

  // Find common prefix
  let prefixEnd = 0;
  while (
    prefixEnd < baseLines.length &&
    prefixEnd < currentLines.length &&
    prefixEnd < incomingLines.length &&
    baseLines[prefixEnd] === currentLines[prefixEnd] &&
    baseLines[prefixEnd] === incomingLines[prefixEnd]
  ) {
    prefixEnd++;
  }

  // Find common suffix
  let baseSuffixStart = baseLines.length;
  let currentSuffixStart = currentLines.length;
  let incomingSuffixStart = incomingLines.length;

  while (
    baseSuffixStart > prefixEnd &&
    currentSuffixStart > prefixEnd &&
    incomingSuffixStart > prefixEnd &&
    baseLines[baseSuffixStart - 1] === currentLines[currentSuffixStart - 1] &&
    baseLines[baseSuffixStart - 1] === incomingLines[incomingSuffixStart - 1]
  ) {
    baseSuffixStart--;
    currentSuffixStart--;
    incomingSuffixStart--;
  }

  // Extract differing sections
  const currentDiff = currentLines.slice(prefixEnd, currentSuffixStart);
  const incomingDiff = incomingLines.slice(prefixEnd, incomingSuffixStart);

  // Build merged result with conflict markers
  const result: Array<string> = [];
  result.push(...baseLines.slice(0, prefixEnd));

  if (currentDiff.length > 0 || incomingDiff.length > 0) {
    result.push("<<<<<<< SERVER (CLI)");
    result.push(...currentDiff);
    result.push("=======");
    result.push(...incomingDiff);
    result.push(">>>>>>> WEB");
  }

  result.push(...baseLines.slice(baseSuffixStart));

  return {
    merged: result.join("\n"),
    hasConflict: true,
  };
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

  if (isSyncArticle) {
    // Get base snapshot for 3-way merge
    const snapshot = await syncCommitDao.getLatestSnapshot(doc.jrn);

    // Check if doc has changed since draft was created (CLI pushed while web was editing)
    if (snapshot && doc.version > snapshot.baseVersion) {
      const mergeResult = threeWayMerge(
        snapshot.baseContent,  // base
        doc.content,           // current (CLI version)
        draft.content          // draft (web version)
      );

      if (mergeResult.hasConflict) {
        return res.status(409).json({
          error: "Merge conflict",
          base: snapshot.baseContent,
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
    version: doc.version + 1,
  }, doc.version);

  if (result === "conflict") {
    return res.status(409).json({ error: "Version conflict, please refresh" });
  }

  // Create commit record for web merge
  if (isSyncArticle) {
    const cursor = await syncArticleDao.advanceCursor(doc.jrn);
    await syncCommitDao.createCommit(
      { seq: cursor, message: "Web merge", pushedBy: "web-user" },
      [{ docJrn: doc.jrn, baseContent: finalContent, baseVersion: doc.version + 1, opType: "upsert" }]
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
  requestId?: string;
  message?: string;      // NEW
  pushedBy?: string;     // NEW
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
12. [ ] Remove local snapshot storage (optional, keep as fallback)

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

## CLI Idempotency via Commits

The commit table eliminates the need for a separate request idempotency cache. When a CLI push fails due to network issues (response lost), the retry will get a `conflict` status because versions don't match. The CLI can then query commits to detect if the original push succeeded:

### Retry Detection Flow

```typescript
// In CLI push handler

async function pushWithRetry(ops: PushOp[], message: string): Promise<PushResponse> {
  const response = await transport.push({ ops, message });

  // Check for conflicts that might be from a lost response
  const conflicts = response.results.filter(r => r.status === "conflict");

  if (conflicts.length > 0) {
    // Query recent commits to see if our push actually succeeded
    const recentCommits = await transport.getCommits({ limit: 5 });

    for (const conflict of conflicts) {
      const matchingCommit = recentCommits.commits.find(c =>
        c.message === message &&
        c.files?.some(f => f.docJrn.endsWith(conflict.fileId))
      );

      if (matchingCommit) {
        // Our push succeeded but response was lost - treat as success
        conflict.status = "ok";
        conflict.newVersion = matchingCommit.files.find(
          f => f.docJrn.endsWith(conflict.fileId)
        )?.baseVersion;
      }
    }
  }

  return response;
}
```

### Why This Works

1. **Unique commit messages**: CLI includes timestamp or request ID in message
2. **Version + message matching**: If a commit exists with matching message and file versions match expected, the push succeeded
3. **No extra storage needed**: Commits table serves double duty as history and idempotency log

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

### Commit History Cleanup

Add scheduled job to limit commit history (e.g., keep last 100 per file):

```sql
DELETE FROM sync_commit_files
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY doc_jrn ORDER BY base_version DESC) as rn
    FROM sync_commit_files
  ) ranked
  WHERE rn <= 100
);

-- Then clean up orphaned commits
DELETE FROM sync_commits
WHERE id NOT IN (SELECT DISTINCT commit_id FROM sync_commit_files);
```
