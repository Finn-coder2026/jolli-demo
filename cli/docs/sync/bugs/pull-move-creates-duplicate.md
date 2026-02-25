# Bug: Pull creates duplicate file when server moves/renames

## Summary

When a file is moved/renamed on the server, the CLI pull creates a new file at the new location instead of moving the existing local file. This leaves an orphaned duplicate with the same `jrn`.

## Reproduction

1. Create a file locally and sync up: `test.md` with jrn `ABC123`
2. On the server (web UI), move the file to a subfolder: `subfolder/test.md`
3. Run `jolli sync` to pull changes

**Expected:** Local `test.md` is moved to `subfolder/test.md`

**Actual:**
- `test.md` remains (orphaned, with old content)
- `subfolder/test.md` is created (new, with server content)
- Both files have the same `jrn: ABC123`

## Root Cause

The pull logic in `SyncEngine.ts` doesn't check if a file with the same `fileId` already exists locally at a different path before writing the file. It should:

1. Look up the `fileId` in `fileMapById`
2. If found at a different `clientPath`, move/rename the local file
3. Then update the content if needed

Currently it just writes to the new path, leaving the old file orphaned.

## Affected Code

- `cli/src/sync/SyncEngine.ts` - `handleServerChange()` or related pull functions
- Should use `handleServerRename()` logic more broadly

## Impact

- Duplicate files with same jrn cause confusion
- Orphaned files may be re-synced as "new" files
- Disk space wasted
- Potential data loss if user edits the wrong copy

## Workaround

Manually delete the orphaned file at the old location.

## Root Cause Detail

In `SyncEngine.ts` line 214:
```typescript
const clientPath = ctx.normalizePath(existing?.clientPath ?? ctx.obfuscator.deobfuscate(change.serverPath));
```

When `existing` is undefined (entry missing from sync.md), the CLI treats the file as NEW even if a local file with the same `jrn` exists on disk.

The push logic has `handleRenamedOrRestoredFile()` that scans local files by frontmatter `jrn`. The pull logic lacks equivalent scanning.

## Fix Options

### Option 1: Scan filesystem for existing jrn (thorough)
Before creating a "new" file from pull:
1. Scan local `.md` files for matching `jrn` in frontmatter
2. If found, treat as a rename/move instead of create
3. Move the old file to the new path

### Option 2: Build jrn index at sync start (efficient)
1. At sync start, scan all local `.md` files and build `jrn -> path` map
2. In pull, check this map before creating new files
3. Similar to how push uses `handleRenamedOrRestoredFile()`

### Option 3: Warn on duplicate jrn (minimal)
1. After sync, scan for duplicate jrns
2. Warn user about orphaned files
3. Let user manually resolve

See `handleRenamedOrRestoredFile()` in push logic for pattern to follow.
