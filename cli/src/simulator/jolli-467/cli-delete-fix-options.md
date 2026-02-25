# CLI Delete Issue: Soft Delete Only

## Problem Summary
Deletes performed on the web UI don’t cleanly propagate to CLI sync, and CLI deletes can leave confusing state in the web app. This creates conflicts and stale local state.

Key causes in current code:
- Web delete has two paths:
  - Hard delete: `DELETE /docs/:jrn` (removes row).
  - Soft delete: `POST /docs/by-id/:id/soft-delete` (sets `deletedAt`).
- Sync uses `contentMetadata.sync.deleted` to represent deletion in pull responses.
- Web delete paths do **not** set `contentMetadata.sync.deleted` and do **not** advance the sync cursor.
- Incremental sync pull only emits `deleted: true` when `contentMetadata.sync.deleted` is set.

Net effect:
- Web delete does not show up as a sync delete.
- CLI continues to treat the file as existing and may push changes or conflict on version.

## Fix: Soft Delete Only
We want a single delete behavior that works for both web and CLI sync: **soft delete**.
Implementation sketch:
- In `backend/src/router/DocRouter.ts` delete handlers:
  - For sync JRNs, convert hard deletes into soft deletes.
  - Set `contentMetadata.sync.deleted = true` and `deletedAt` on the doc.
  - Advance the sync cursor via `syncArticleDao.advanceCursor(jrn)` so CLI sees the delete on next pull.
- Keep the existing `softDelete` endpoint behavior, but also set `contentMetadata.sync.deleted = true` for sync articles.
- In `backend/src/router/SyncRouter.ts` push delete:
  - Set `deletedAt` and `explicitlyDeleted` on the doc so CLI deletes are soft deletes too.

## Notes
- After changes, consider a one-time reconciliation to clean stale entries in `.jolli/sync.md` for users who already hit conflicts.
- Add regression tests in `cli/src/sync/SyncEngine.test.ts` for web delete propagation if possible.
