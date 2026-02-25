# Markdown Sync Server - Tombstone Cleanup Spec (v5)

## Summary

This spec adds a scheduled job to purge tombstone records (soft-deleted sync articles) older than a configurable retention period.

| Feature | Description |
|---------|-------------|
| Job Name | `sync-tombstone-cleanup` |
| Default Retention | 30 days |
| Config Key | `SYNC_TOMBSTONE_RETENTION_DAYS` |
| Schedule | Daily at 3:00 AM UTC |

## Prerequisites

- v2 spec fully implemented
- v3 spec fully implemented (changeset history - needed for cleanup considerations)
- v4 spec fully implemented (transactional safety)
- `sync_articles` table with cursor system working
- Soft-deleted docs have `contentMetadata.sync.deleted = true` and `contentMetadata.sync.deletedAt` timestamp

## 2026 Refactor Addendum: Retention for Changeset Review Artifacts

This addendum extends v5 cleanup beyond tombstones to cover the new changeset-review lifecycle.

### New cleanup domains

1. Tombstones (existing scope)
2. Proposed/reviewing changesets that never publish (stale review artifacts)
3. Rejected/superseded changesets
4. Published changeset history and file snapshots (longer retention, audit-safe)
5. Per-file review rows (`sync_commit_file_reviews`)

### Recommended retention policy

- `SYNC_TOMBSTONE_RETENTION_DAYS` (existing): default 30
- `SYNC_PROPOSED_CHANGESET_RETENTION_DAYS`: default 14
- `SYNC_REJECTED_CHANGESET_RETENTION_DAYS`: default 30
- `SYNC_PUBLISHED_CHANGESET_RETENTION_DAYS`: default 180 (or "keep latest N per doc")

### Cleanup rules

- Never delete changeset rows that are still required for publish-time base checks.
- Prefer "keep latest N snapshots per doc" + "age cutoff" for published history.
- Delete review rows before deleting parent changeset files/changesets (or rely on cascade).
- Run cleanup per changeset scope where applicable (`commit_scope_key`) to support multi-source operations.

### Multi-source scope

- Server cleanup applies to server-managed/shared sources only.
- Local-only/virtual source history remains local and outside this server cleanup job.

---

## Background

When a CLI client deletes a file locally and pushes to the server, we create a "tombstone" - the doc record is preserved but marked as deleted:

```typescript
contentMetadata: {
  sync: {
    fileId: "abc123",
    serverPath: "notes/deleted.md",
    deleted: true,
    deletedAt: 1705312800000  // epoch ms
  }
}
```

This allows other clients to learn about the deletion on their next pull. However, these tombstones accumulate over time and need periodic cleanup.

---

## Configuration

Add to `backend/src/config/Config.ts`:

```typescript
// In configSchema.server
SYNC_TOMBSTONE_RETENTION_DAYS: {
  type: "number",
  default: 30,
  description: "Days to retain sync tombstones before cleanup",
}
```

---

## Job Implementation

### Job Definition

```typescript
// backend/src/jobs/SyncTombstoneCleanupJob.ts

import type { DocDao } from "../dao/DocDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { Config } from "../config/Config";
import { getLog } from "../util/Logger";

const log = getLog(import.meta);

const SYNC_ARTICLE_PREFIX = "jrn:/global:docs:article/sync-";

export interface SyncTombstoneCleanupResult {
  deletedCount: number;
  scannedCount: number;
  retentionDays: number;
  cutoffDate: Date;
}

export async function runSyncTombstoneCleanup(
  docDao: DocDao,
  syncArticleDao: SyncArticleDao,
  config: Config,
): Promise<SyncTombstoneCleanupResult> {
  const retentionDays = config.server.SYNC_TOMBSTONE_RETENTION_DAYS;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs);

  log.info("Starting tombstone cleanup, retention=%d days, cutoff=%s", retentionDays, cutoffDate.toISOString());

  // Get all sync articles
  const docs = await docDao.listDocs({
    startsWithJrn: SYNC_ARTICLE_PREFIX,
  });

  const scannedCount = docs.length;
  let deletedCount = 0;

  for (const doc of docs) {
    const sync = doc.contentMetadata?.sync;

    // Skip if not a tombstone
    if (!sync?.deleted || !sync?.deletedAt) {
      continue;
    }

    // Skip if within retention period
    if (sync.deletedAt > cutoffMs) {
      continue;
    }

    log.info(
      "Purging tombstone: jrn=%s, fileId=%s, deletedAt=%s",
      doc.jrn,
      sync.fileId,
      new Date(sync.deletedAt).toISOString(),
    );

    // Hard delete the doc
    await docDao.deleteDoc(doc.jrn);

    // Note: sync_articles row will be orphaned but harmless
    // Could optionally clean up: await syncArticleDao.deleteSyncArticle(doc.jrn);

    deletedCount++;
  }

  log.info("Tombstone cleanup complete: deleted=%d, scanned=%d", deletedCount, scannedCount);

  return {
    deletedCount,
    scannedCount,
    retentionDays,
    cutoffDate,
  };
}
```

### Optional: Add deleteSyncArticle to DAO

If we want to clean up orphaned `sync_articles` rows:

```typescript
// Add to SyncArticleDao interface

/** Delete sync article record (for tombstone cleanup) */
deleteSyncArticle(docJrn: string): Promise<boolean>;

// Implementation
async function deleteSyncArticle(docJrn: string): Promise<boolean> {
  const deleted = await SyncArticles.destroy({ where: { docJrn } });
  return deleted > 0;
}
```

---

## Scheduled Job Registration

### Add to JobRunner

```typescript
// In backend/src/jobs/JobRunner.ts or similar

import { runSyncTombstoneCleanup } from "./SyncTombstoneCleanupJob";

// Register scheduled job
scheduleJob("sync-tombstone-cleanup", "0 3 * * *", async () => {
  const result = await runSyncTombstoneCleanup(
    database.docDao,
    database.syncArticleDao,
    config,
  );
  return {
    success: true,
    message: `Purged ${result.deletedCount} tombstones (scanned ${result.scannedCount})`,
  };
});
```

### Manual Trigger via DevTools

Add to DevToolsRouter for testing:

```typescript
// In backend/src/router/DevToolsRouter.ts

router.post("/sync-tombstone-cleanup", async (req, res) => {
  const result = await runSyncTombstoneCleanup(
    docDao,
    syncArticleDao,
    config,
  );
  res.json(result);
});
```

---

## Implementation Plan

### Phase 1: Configuration
1. [ ] Add `SYNC_TOMBSTONE_RETENTION_DAYS` to Config.ts

### Phase 2: Job Implementation
2. [ ] Create `backend/src/jobs/SyncTombstoneCleanupJob.ts`
3. [ ] (Optional) Add `deleteSyncArticle` to SyncArticleDao

### Phase 3: Scheduling
4. [ ] Register job in JobRunner with cron schedule
5. [ ] Add manual trigger in DevToolsRouter

### Phase 4: Tests
6. [ ] Unit tests for cleanup logic
7. [ ] Integration test with mock data

---

## Test Cases

```typescript
// backend/src/jobs/SyncTombstoneCleanupJob.test.ts

describe("SyncTombstoneCleanupJob", () => {
  const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
  const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should purge tombstones older than retention period", async () => {
    // Create tombstone older than 30 days
    const oldTombstone = await createSyncArticle("old-file", {
      deleted: true,
      deletedAt: Date.now() - THIRTY_ONE_DAYS_MS,
    });

    const result = await runSyncTombstoneCleanup(docDao, syncArticleDao, config);

    expect(result.deletedCount).toBe(1);
    expect(await docDao.readDoc(oldTombstone.jrn)).toBeNull();
  });

  it("should preserve tombstones within retention period", async () => {
    // Create tombstone less than 30 days old
    const recentTombstone = await createSyncArticle("recent-file", {
      deleted: true,
      deletedAt: Date.now() - TWENTY_NINE_DAYS_MS,
    });

    const result = await runSyncTombstoneCleanup(docDao, syncArticleDao, config);

    expect(result.deletedCount).toBe(0);
    expect(await docDao.readDoc(recentTombstone.jrn)).not.toBeNull();
  });

  it("should not delete non-tombstone sync articles", async () => {
    // Create active sync article
    const activeArticle = await createSyncArticle("active-file", {
      deleted: false,
    });

    const result = await runSyncTombstoneCleanup(docDao, syncArticleDao, config);

    expect(result.deletedCount).toBe(0);
    expect(await docDao.readDoc(activeArticle.jrn)).not.toBeNull();
  });

  it("should use configurable retention period", async () => {
    // Set retention to 7 days
    const shortRetentionConfig = { ...config, server: { ...config.server, SYNC_TOMBSTONE_RETENTION_DAYS: 7 } };

    // Create tombstone 10 days old (older than 7 days)
    const tombstone = await createSyncArticle("short-retention-file", {
      deleted: true,
      deletedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    });

    const result = await runSyncTombstoneCleanup(docDao, syncArticleDao, shortRetentionConfig);

    expect(result.deletedCount).toBe(1);
    expect(result.retentionDays).toBe(7);
  });

  it("should handle tombstones without deletedAt gracefully", async () => {
    // Create malformed tombstone (deleted=true but no deletedAt)
    await createSyncArticle("malformed-file", {
      deleted: true,
      // deletedAt intentionally missing
    });

    const result = await runSyncTombstoneCleanup(docDao, syncArticleDao, config);

    // Should skip malformed tombstones
    expect(result.deletedCount).toBe(0);
  });
});

// Helper function
async function createSyncArticle(
  fileId: string,
  syncInfo: Partial<SyncInfo>,
): Promise<Doc> {
  return docDao.createDoc({
    jrn: `jrn:/global:docs:article/sync-${fileId}`,
    content: "# Test",
    contentType: "text/markdown",
    updatedBy: "test",
    contentMetadata: {
      sync: {
        fileId,
        serverPath: `notes/${fileId}.md`,
        ...syncInfo,
      },
    },
  });
}
```

---

## Monitoring

### Metrics to Track

- `sync_tombstone_cleanup_deleted_total` - Counter of purged tombstones
- `sync_tombstone_cleanup_scanned_total` - Counter of scanned docs
- `sync_tombstone_cleanup_duration_seconds` - Histogram of job duration

### Alerts

- Alert if cleanup job fails 3 consecutive times
- Alert if tombstone count grows > 10,000 (cleanup may not be running)

---

## Future Considerations

### Batch Deletion

For large deployments, consider batching deletes:

```typescript
const BATCH_SIZE = 100;

for (let i = 0; i < tombstones.length; i += BATCH_SIZE) {
  const batch = tombstones.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(t => docDao.deleteDoc(t.jrn)));

  // Small delay to avoid overwhelming the database
  await sleep(100);
}
```

### Sync Articles Table Cleanup

Option A: Leave orphaned `sync_articles` rows (harmless, tiny footprint)

Option B: Add cascade cleanup:
```typescript
// After deleting doc, also delete sync_articles row
await docDao.deleteDoc(doc.jrn);
await syncArticleDao.deleteSyncArticle(doc.jrn);
```

Option C: Periodic orphan cleanup job:
```sql
DELETE FROM sync_articles sa
WHERE NOT EXISTS (
  SELECT 1 FROM docs d WHERE d.jrn = sa.doc_jrn
);
```

### Changeset History Cleanup (v3 consideration)

When deleting tombstones, also consider cleaning up associated changeset history:

```typescript
// After deleting tombstone doc
await docDao.deleteDoc(doc.jrn);

// Option: Also delete changeset files for this doc
// This removes old snapshots that are no longer needed
await sequelize.query(`
  DELETE FROM sync_commit_files
  WHERE doc_jrn = :docJrn
`, { replacements: { docJrn: doc.jrn } });

// Then clean up orphaned changesets (changesets with no files)
await sequelize.query(`
  DELETE FROM sync_commits
  WHERE id NOT IN (SELECT DISTINCT commit_id FROM sync_commit_files)
`);
```

This is optional - changeset history for deleted files may still be valuable for audit purposes.
