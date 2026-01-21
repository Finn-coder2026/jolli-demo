# Sync Protocol Bugs

## BUG-001: Merged content not pushed to server after conflict resolution

**Status:** Open
**Severity:** High
**File:** `cli/src/shared/sync.ts`
**Test:** `cli/src/shared/sync.test.ts` - "REGRESSION: merged content is pushed to server on subsequent sync"

### Description

When a client receives a conflict during pull and performs a merge (either with conflict markers or a clean three-way merge), the merged content is written to the local file but is never pushed to the server on subsequent syncs.

### Root Cause

In `pullFromServer()` at line 328, after a merge is performed:

```typescript
await fileStore.writeText(result.clientPath, result.resolved);
meta.existing.fingerprint = fingerprinter.computeFromContent(result.resolved);
```

The fingerprint is updated to match the merged content. On the next sync, `pushToServer()` computes the fingerprint of the local file and compares it to the stored fingerprint:

```typescript
} else if (existingByPath.fingerprint !== fingerprint) {
    // ... create push op
}
```

Since both fingerprints match (both computed from the merged content), no push operation is created. The merged content is never sent to the server.

### Reproduction Steps

1. Client A creates file, syncs to server (version 1)
2. Client B pulls file
3. Both clients modify the file differently
4. Client A syncs (version 2)
5. Client B syncs - receives conflict, merge happens, merged content written locally
6. Client B syncs again - **BUG: merged content is NOT pushed**
7. Client A syncs - does not receive B's merge resolution

### Affected Scenarios

1. **Conflict marker merges** - User sees conflict markers, resolves them, but resolution is never pushed
2. **Clean auto-merges** - Three-way merge succeeds without conflicts (both sides edited different parts), but merged result is never pushed. This is worse because the user has no indication that anything happened.

### Suggested Fix

After a merge, do NOT update `fingerprint` to the merged content. Keep the old fingerprint so that on the next sync, the fingerprint comparison will detect the local file has changed and create a push operation.

Alternatively, add a `needsPush` flag to `FileEntry` that gets set after merges and forces a push on the next sync.

---

## BUG-002: Clean auto-merge silently lost

**Status:** Open
**Severity:** High
**File:** `cli/src/shared/sync.ts`
**Related to:** BUG-001

### Description

This is a specific case of BUG-001 that is particularly problematic. When both clients edit different parts of a file, the three-way merge succeeds cleanly without conflict markers (`result.action === "merged"`). The user has no indication that a merge occurred, and the merged result is silently lost (never pushed to server).

### Example

1. Base content:
   ```
   Line 1
   Line 2
   Line 3
   ```

2. Client A edits Line 1:
   ```
   Line 1 - edited by A
   Line 2
   Line 3
   ```

3. Client B edits Line 3:
   ```
   Line 1
   Line 2
   Line 3 - edited by B
   ```

4. A syncs first (wins)
5. B syncs - clean merge produces:
   ```
   Line 1 - edited by A
   Line 2
   Line 3 - edited by B
   ```
6. B syncs again - merged content NOT pushed
7. A syncs - only sees their own edit, B's edit is lost

### Impact

Users lose work without any warning or indication. This is worse than the conflict marker case because:
- No visible conflict markers to alert the user
- User may not realize their changes were "merged" and then lost
- Data loss is silent
