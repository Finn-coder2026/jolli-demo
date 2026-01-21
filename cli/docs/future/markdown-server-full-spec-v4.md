# Markdown Sync Server - Transactional Safety Spec (v4)

## Summary

This spec adds transactional safety to sync operations, ensuring doc writes, cursor advances, and commit records are atomic. Also handles web deletion of sync articles.

| Issue | Current Behavior | v4 Behavior |
|-------|------------------|-------------|
| Server crash between doc write and cursor advance | Doc updated but CLI won't see change | Both succeed or both fail (atomic) |
| Server crash between cursor advance and commit record | Cursor advanced but no commit history | All three in single transaction |
| Web delete of sync article | Hard delete, CLI never knows | Create tombstone, advance cursor |

## Prerequisites

- v2 spec fully implemented
- v3 spec fully implemented (commit history tables)
- `SyncArticleDao`, `SyncCommitDao`, and `DocDao` operational

---

## IMPORTANT: Implementation Notes

**This spec should be implemented AFTER v3 (commit history).**

The code samples in this spec are based on the v2 implementation. When implementing v4, the developer should:

1. **Re-research the current codebase** to find all places that need transaction wrapping
2. **Include v3's `SyncCommitDao.createCommit`** in the transaction scope
3. **Check for any new sync-related writes** added since this spec was written

### Known areas to audit:

- `SyncRouter.ts` - push handler (doc + cursor + commit)
- `DocRouter.ts` - PUT handler (doc + cursor, and with v3: possibly commit for web edits)
- `DocRouter.ts` - DELETE handler (tombstone + cursor)
- `DocDraftRouter.ts` - merge endpoint (v3 adds commit creation here)
- Any new routers or handlers that modify sync articles

---

## Problem 1: Race Condition on Crash

Currently, doc updates, cursor advances, and commit records are separate operations:

```typescript
// SyncRouter.ts push handler (after v3)
const result = await docDao.updateDocIfVersion(...);  // Step 1
await syncArticleDao.advanceCursor(jrn);              // Step 2 - crash here = lost update
await syncCommitDao.createCommit(...);                // Step 3 - crash here = no commit history

// DocRouter.ts PUT handler
const doc = await docDao.updateDoc(req.body);         // Step 1
await syncArticleDao.advanceCursor(doc.jrn);          // Step 2 - crash here = lost update

// DocDraftRouter.ts merge endpoint (v3)
await docDao.updateDocIfVersion(...);                 // Step 1
await syncArticleDao.advanceCursor(doc.jrn);          // Step 2
await syncCommitDao.createCommit(...);                // Step 3 - crash here = no commit history
```

If server crashes between steps:
- Doc may be updated but cursor not advanced → CLI won't see change
- Cursor may be advanced but commit not created → no history for 3-way merge
- Change is "lost" or history is incomplete

---

## Solution: Transaction Parameter

Add optional `transaction` parameter to DAO methods, allowing callers to wrap multiple operations in a single transaction.

### Updated DocDao Interface

```typescript
// backend/src/dao/DocDao.ts

import type { Transaction } from "sequelize";

export interface DocDao {
  // ... existing methods ...

  /** Updates doc, optionally within a transaction */
  updateDoc(doc: Doc, transaction?: Transaction): Promise<Doc | undefined>;

  /** Creates doc, optionally within a transaction */
  createDoc(doc: NewDoc, transaction?: Transaction): Promise<Doc>;

  /** Updates doc with version check, optionally within a transaction */
  updateDocIfVersion(doc: Doc, expectedVersion: number, transaction?: Transaction): Promise<Doc | "conflict">;

  /** Deletes doc, optionally within a transaction */
  deleteDoc(jrn: string, transaction?: Transaction): Promise<void>;

  /** Get sequelize instance for creating transactions */
  getSequelize(): Sequelize;
}
```

### Updated SyncArticleDao Interface

```typescript
// backend/src/dao/SyncArticleDao.ts

import type { Transaction } from "sequelize";

export interface SyncArticleDao {
  // ... existing methods ...

  /** Advance cursor, optionally within a transaction */
  advanceCursor(docJrn: string, transaction?: Transaction): Promise<number>;

  /** Upsert sync article, optionally within a transaction */
  upsertSyncArticle(docJrn: string, transaction?: Transaction): Promise<SyncArticle>;
}
```

### Updated SyncCommitDao Interface (v3)

```typescript
// backend/src/dao/SyncCommitDao.ts

import type { Transaction } from "sequelize";

export interface SyncCommitDao {
  // ... existing methods ...

  /** Create commit with files, optionally within a transaction */
  createCommit(
    commit: NewSyncCommit,
    files: Array<Omit<NewSyncCommitFile, "commitId">>,
    transaction?: Transaction
  ): Promise<SyncCommit>;
}
```

**Note:** The v3 `createCommit` already creates an internal transaction. When implementing v4, this needs to be updated to accept an external transaction parameter (similar to `updateDocIfVersion`).

### Implementation: DocDao

```typescript
// In createDocDao

async function updateDoc(doc: Doc, transaction?: Transaction): Promise<Doc | undefined> {
  const [affectedCount] = await Docs.update(doc, {
    where: { jrn: doc.jrn, version: doc.version - 1 },
    transaction,
  });
  if (affectedCount === 0) {
    return undefined;
  }
  return readDoc(doc.jrn);
}

async function updateDocIfVersion(
  doc: Doc,
  expectedVersion: number,
  transaction?: Transaction
): Promise<Doc | "conflict"> {
  // If no transaction provided, create one internally (existing behavior)
  if (!transaction) {
    const internalTx = await sequelize.transaction();
    try {
      const result = await updateDocIfVersionInternal(doc, expectedVersion, internalTx);
      await internalTx.commit();
      return result;
    } catch (error) {
      await internalTx.rollback();
      throw error;
    }
  }
  // Use provided transaction
  return updateDocIfVersionInternal(doc, expectedVersion, transaction);
}

async function updateDocIfVersionInternal(
  doc: Doc,
  expectedVersion: number,
  transaction: Transaction
): Promise<Doc | "conflict"> {
  const oldDoc = await Docs.findOne({
    where: { jrn: doc.jrn },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!oldDoc || oldDoc.version !== expectedVersion) {
    return "conflict";
  }

  await Docs.update(doc, { where: { jrn: doc.jrn }, transaction });
  const updated = await readDoc(doc.jrn);
  return updated ?? "conflict";
}

function getSequelize(): Sequelize {
  return sequelize;
}
```

### Implementation: SyncArticleDao

```typescript
// In createSyncArticleDao

async function advanceCursor(docJrn: string, transaction?: Transaction): Promise<number> {
  const syncArticle = await upsertSyncArticle(docJrn, transaction);
  return syncArticle.lastSeq;
}

async function upsertSyncArticle(docJrn: string, transaction?: Transaction): Promise<SyncArticle> {
  const [[result]] = (await sequelize.query(
    `INSERT INTO sync_articles (doc_jrn, last_seq)
     VALUES (:docJrn, nextval('sync_articles_cursor_seq'))
     ON CONFLICT (doc_jrn)
     DO UPDATE SET last_seq = nextval('sync_articles_cursor_seq')
     RETURNING last_seq`,
    { replacements: { docJrn }, transaction },
  )) as [[{ last_seq: string }], unknown];
  return { docJrn, lastSeq: Number(result.last_seq) };
}
```

---

## Updated Router: SyncRouter Push

```typescript
// backend/src/router/SyncRouter.ts

router.post("/push", async (req, res) => {
  const docDao = docDaoProvider.getDao(getTenantContext());
  const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
  const sequelize = docDao.getSequelize();
  const { ops } = req.body as PushRequest;

  const results: Array<{ fileId: string; status: string; newVersion?: number; serverVersion?: number }> = [];

  for (const op of ops) {
    const jrn = `jrn:/global:docs:article/sync-${op.fileId}`;

    // Wrap each op in a transaction for atomicity
    const transaction = await sequelize.transaction();
    try {
      const existing = await docDao.readDoc(jrn);
      const currentVersion = existing?.version ?? 0;

      // Conflict check
      if (op.baseVersion !== currentVersion) {
        await transaction.rollback();
        results.push({ fileId: op.fileId, status: "conflict", serverVersion: currentVersion });
        continue;
      }

      // Hash validation
      if (op.contentHash && op.content) {
        const computed = integrityHashFromContent(op.content);
        if (computed !== op.contentHash) {
          await transaction.rollback();
          results.push({ fileId: op.fileId, status: "bad_hash" });
          continue;
        }
      }

      const newVersion = currentVersion + 1;
      const syncInfo = {
        fileId: op.fileId,
        serverPath: op.serverPath,
        ...(op.contentHash ? { contentHash: op.contentHash } : {}),
        ...(op.type === "delete" ? { deleted: true, deletedAt: Date.now() } : {}),
      };

      if (existing) {
        const result = await docDao.updateDocIfVersion(
          {
            ...existing,
            content: op.type === "delete" ? existing.content : (op.content ?? existing.content),
            contentMetadata: { ...existing.contentMetadata, sync: syncInfo },
            version: newVersion,
          },
          currentVersion,
          transaction,  // Pass transaction
        );

        if (result === "conflict") {
          await transaction.rollback();
          results.push({ fileId: op.fileId, status: "conflict", serverVersion: currentVersion });
          continue;
        }
      } else {
        await docDao.createDoc(
          {
            jrn,
            content: op.content ?? "",
            contentType: "text/markdown",
            updatedBy: "sync-server",
            contentMetadata: { sync: syncInfo },
            source: undefined,
            sourceMetadata: undefined,
          },
          transaction,  // Pass transaction
        );
      }

      // Advance cursor within same transaction
      await syncArticleDao.advanceCursor(jrn, transaction);

      await transaction.commit();
      results.push({ fileId: op.fileId, status: "ok", newVersion });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const cursor = await syncArticleDao.getCurrentCursor();
  res.json({ results, newCursor: cursor });
});
```

---

## Updated Router: DocRouter PUT

```typescript
// backend/src/router/DocRouter.ts

router.put("/:jrn", async (req, res) => {
  try {
    const docDao = docDaoProvider.getDao(getTenantContext());
    const jrn = decodeURIComponent(req.params.jrn);
    const isSyncArticle = syncArticleDaoProvider && jrn.startsWith(SYNC_ARTICLE_PREFIX);

    let doc: Doc | undefined;

    if (isSyncArticle) {
      // Wrap in transaction for sync articles
      const sequelize = docDao.getSequelize();
      const transaction = await sequelize.transaction();
      try {
        doc = await docDao.updateDoc(req.body, transaction);
        if (doc) {
          const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
          await syncArticleDao.advanceCursor(doc.jrn, transaction);
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      // Non-sync articles: no transaction needed
      doc = await docDao.updateDoc(req.body);
    }

    if (doc) {
      chunker.processDoc(doc);
      res.json(doc);
    } else {
      res.status(404).json({ error: "Document not found or version conflict" });
    }
  } catch {
    res.status(400).json({ error: "Failed to update document" });
  }
});
```

---

## Problem 2: Web Delete of Sync Articles

Currently, `DELETE /api/docs/:jrn` does a hard delete. For sync articles, CLI would never know the file was deleted.

### Solution: Tombstone on Web Delete

Convert delete to a tombstone (soft delete) for sync articles:

```typescript
// backend/src/router/DocRouter.ts

router.delete("/:jrn", async (req, res) => {
  try {
    const docDao = docDaoProvider.getDao(getTenantContext());
    const jrn = decodeURIComponent(req.params.jrn);

    // Check if this is a sync article
    if (syncArticleDaoProvider && jrn.startsWith(SYNC_ARTICLE_PREFIX)) {
      return handleSyncArticleDelete(req, res, jrn, docDao);
    }

    // Normal delete for non-sync articles
    await docDao.deleteDoc(jrn);
    res.status(204).send();
  } catch {
    res.status(400).json({ error: "Failed to delete document" });
  }
});

async function handleSyncArticleDelete(
  req: Request,
  res: Response,
  jrn: string,
  docDao: DocDao,
): Promise<void> {
  const syncArticleDao = syncArticleDaoProvider!.getDao(getTenantContext());
  const sequelize = docDao.getSequelize();

  const doc = await docDao.readDoc(jrn);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    // Create tombstone instead of hard delete
    const sync = doc.contentMetadata?.sync;
    const tombstoneInfo = {
      ...sync,
      deleted: true,
      deletedAt: Date.now(),
    };

    await docDao.updateDoc(
      {
        ...doc,
        contentMetadata: { ...doc.contentMetadata, sync: tombstoneInfo },
        version: doc.version + 1,
      },
      transaction,
    );

    await syncArticleDao.advanceCursor(jrn, transaction);
    await transaction.commit();

    log.info("Created tombstone for sync article: %s", jrn);
    res.status(204).send();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

---

## Implementation Plan

### Phase 0: Research (REQUIRED BEFORE IMPLEMENTATION)
0. [ ] **Re-audit the codebase** for all sync-related writes
   - Search for `advanceCursor`, `createCommit`, `updateDoc`, `createDoc` calls
   - Identify all routers/handlers that modify sync articles
   - Document any new code paths added since this spec was written

### Phase 1: DAO Changes
1. [ ] Add `transaction` param to `DocDao.updateDoc`
2. [ ] Add `transaction` param to `DocDao.createDoc`
3. [ ] Add `transaction` param to `DocDao.deleteDoc`
4. [ ] Update `DocDao.updateDocIfVersion` to accept external transaction
5. [ ] Add `getSequelize()` to `DocDao`
6. [ ] Add `transaction` param to `SyncArticleDao.advanceCursor`
7. [ ] Add `transaction` param to `SyncArticleDao.upsertSyncArticle`
8. [ ] Update `SyncCommitDao.createCommit` to accept external transaction (v3)
9. [ ] Update all mocks to accept transaction params

### Phase 2: Router Changes
10. [ ] Update `SyncRouter.ts` push handler to use transactions (doc + cursor + commit)
11. [ ] Update `DocRouter.ts` PUT handler to use transactions for sync articles
12. [ ] Add tombstone handling to `DocRouter.ts` DELETE handler
13. [ ] Update `DocDraftRouter.ts` merge endpoint to use transactions (v3)

### Phase 3: Tests
14. [ ] Add tests for transactional push (including commit rollback)
15. [ ] Add tests for transactional web edit
16. [ ] Add tests for web delete creating tombstone
17. [ ] Add tests for merge endpoint transaction rollback

---

## Test Cases

```typescript
describe("Transactional sync operations", () => {
  it("should rollback doc update if cursor advance fails", async () => {
    // Mock advanceCursor to throw
    mockSyncArticleDao.advanceCursor.mockRejectedValue(new Error("DB error"));

    const response = await request(app)
      .post("/v1/sync/push")
      .send({
        ops: [{ type: "upsert", fileId: "test", serverPath: "test.md", baseVersion: 0, content: "# Test" }],
      });

    expect(response.status).toBe(500);

    // Doc should NOT be created (rolled back)
    const doc = await docDao.readDoc("jrn:/global:docs:article/sync-test");
    expect(doc).toBeUndefined();
  });

  it("should rollback cursor advance if doc update fails", async () => {
    // Create initial doc
    await pushSyncArticle("test", "# Original");
    const cursor1 = await syncArticleDao.getCurrentCursor();

    // Mock updateDocIfVersion to throw after acquiring lock
    mockDocDao.updateDocIfVersion.mockRejectedValue(new Error("DB error"));

    const response = await request(app)
      .post("/v1/sync/push")
      .send({
        ops: [{ type: "upsert", fileId: "test", serverPath: "test.md", baseVersion: 1, content: "# Updated" }],
      });

    expect(response.status).toBe(500);

    // Cursor should NOT be advanced (rolled back)
    const cursor2 = await syncArticleDao.getCurrentCursor();
    expect(cursor2).toBe(cursor1);
  });
});

describe("DELETE /api/docs/:jrn (sync article)", () => {
  it("should create tombstone instead of hard delete", async () => {
    // Create sync article
    await pushSyncArticle("test-file", "# Test content");

    const response = await request(app)
      .delete("/api/docs/jrn%3A%2Fglobal%3Adocs%3Aarticle%2Fsync-test-file");

    expect(response.status).toBe(204);

    // Doc should still exist but be marked as deleted
    const doc = await docDao.readDoc("jrn:/global:docs:article/sync-test-file");
    expect(doc).toBeDefined();
    expect(doc?.contentMetadata?.sync?.deleted).toBe(true);
    expect(doc?.contentMetadata?.sync?.deletedAt).toBeDefined();
  });

  it("should advance cursor on tombstone creation", async () => {
    await pushSyncArticle("test-file", "# Test");
    const cursor1 = await syncArticleDao.getCurrentCursor();

    await request(app)
      .delete("/api/docs/jrn%3A%2Fglobal%3Adocs%3Aarticle%2Fsync-test-file");

    const cursor2 = await syncArticleDao.getCurrentCursor();
    expect(cursor2).toBeGreaterThan(cursor1);
  });

  it("should allow CLI to see deletion on next pull", async () => {
    await pushSyncArticle("test-file", "# Test");

    // Delete via web
    await request(app)
      .delete("/api/docs/jrn%3A%2Fglobal%3Adocs%3Aarticle%2Fsync-test-file");

    // Pull should show deleted file
    const response = await request(app)
      .post("/v1/sync/pull")
      .send({ sinceCursor: 0 });

    const deletedFile = response.body.changes.find(
      (c: { fileId: string }) => c.fileId === "test-file"
    );
    expect(deletedFile?.deleted).toBe(true);
  });

  it("should still hard delete non-sync articles", async () => {
    // Create regular article (not a sync article)
    await docDao.createDoc({
      jrn: "jrn:/global:docs:article/regular-article",
      content: "# Regular",
      contentType: "text/markdown",
      updatedBy: "test",
    });

    const response = await request(app)
      .delete("/api/docs/jrn%3A%2Fglobal%3Adocs%3Aarticle%2Fregular-article");

    expect(response.status).toBe(204);

    // Doc should be completely gone
    const doc = await docDao.readDoc("jrn:/global:docs:article/regular-article");
    expect(doc).toBeUndefined();
  });
});
```

---

## Migration Notes

This is a backward-compatible change:
- Existing code calling DAO methods without transaction param continues to work
- Transaction param is optional with default behavior unchanged
- No database schema changes required
