# Sync Protocol Bugs (Additional)

## BUG-003: Cursor advance after push can skip remote changes

**Status:** Open
**Severity:** High
**File:** `cli/src/shared/sync.ts`
**Test:** `cli/src/shared/sync.test.ts` - "REGRESSION: remote changes between pull and push are not skipped"

### Description

During a full sync, the client pulls first and then pushes. If another client pushes after the pull but before the push, the server cursor advances. The pushing client then sets `lastCursor` to the push response cursor, which includes the other client's change even though it was never pulled. That change is skipped forever.

### Root Cause

In `sync()`, after `pushToServer()`, the code sets:

```typescript
state.lastCursor = pushRes.newCursor;
```

This overwrites the cursor from the pull phase and can jump past unseen changes.

### Reproduction Steps

1. Client A pulls (cursor X)
2. Client B pushes a new file (cursor X+1)
3. Client A pushes its own change (cursor X+2) and sets `lastCursor` to X+2
4. Client A syncs again - **BUG: B's file never appears**

### Suggested Fix

Do not advance `lastCursor` based on push responses. Keep the cursor from the pull phase, or re-pull after push if you want to advance the cursor safely.

---

## BUG-004: Server update ignored when local file is missing

**Status:** Open
**Severity:** High
**File:** `cli/src/shared/sync.ts`
**Test:** `cli/src/shared/sync.test.ts` - "REGRESSION: server update restores missing local file"

### Description

If a tracked file is missing on disk, the pull phase does nothing even when the server has a newer version. The cursor still advances, so the update is never applied and the client can later attempt a delete against an outdated version.

### Root Cause

In `pullFromServer()`, updates are only applied if `fileStore.exists(clientPath)` returns true. Missing files are skipped entirely.

### Reproduction Steps

1. Client A creates file and syncs
2. Client B pulls it, then deletes the file locally (no sync)
3. Client A edits the file and syncs (server version increments)
4. Client B syncs - **BUG: file stays missing and B never receives the update**

### Suggested Fix

If the file is missing but the server version is newer, treat it as a conflict or restore the server content; do not advance the cursor while the file is unresolved.

---

## BUG-005: Push conflict masks local edits on next pull

**Status:** Open
**Severity:** High
**File:** `cli/src/shared/sync.ts`
**Test:** `cli/src/shared/sync.test.ts` - "REGRESSION: push conflict does not mask local edits on next pull"

### Description

When a push is rejected (conflict or bad_hash), the client has already updated the stored fingerprint to the local content. On the next pull, the client believes the local file is unchanged and overwrites it with server content instead of flagging a conflict, silently losing local edits.

### Root Cause

In `pushToServer()`, `existingByPath.fingerprint` is updated before the server acknowledges the push. `applyPushResults()` does not restore the previous fingerprint when a push fails.

### Reproduction Steps

1. Client A and B edit the same file
2. Client B syncs first (server updates)
3. Client A runs an up-only sync and gets a push conflict
4. Client A pulls again - **BUG: local edits are overwritten without conflict**

### Suggested Fix

Only update fingerprints after successful push. On conflict/bad_hash, keep the previous fingerprint or mark the entry as conflicted to force conflict resolution on the next pull.
