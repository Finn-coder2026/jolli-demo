# Sync Future Enhancements

This document captures planned features and enhancements for the CLI sync system.

## Recovery & Debugging

### `--force` / `--reset` Flag

Add a flag to force a full re-sync when state gets out of sync.

```bash
jolli sync --force    # Reset cursor to 0, force full sync
jolli sync --reset    # Same as --force
```

**Use cases:**
- File was deleted via CLI but restored on web UI
- Sync state (`.jolli/sync.md`) got corrupted
- Version mismatches causing conflicts

**Implementation:**
- Set `lastCursor: 0` before pull
- Optionally clear `deleted` flags from all file entries

---

### Restore Detection in Pull

Fix the pull logic to detect when a file was deleted locally but exists (not deleted) on the server.

**Current behavior:**
- File marked `deleted: true` in sync.md
- Server returns file with `deleted: false`
- CLI skips it because versions match

**Expected behavior:**
- Detect the mismatch
- Clear local `deleted` flag
- Download the file content

---

### `jolli sync status` Command

Add a command to show sync state and diagnose issues.

```bash
jolli sync status
```

**Output:**
```
Sync State: .jolli/sync.md
Last Cursor: 18
Tracked Files: 4

Files:
  phu-s-first-article.md    v2  OK
  test.md                   v5  DELETED (local)
  echo.md                   v2  OK

Server Status:
  Cursor: 20
  Files: 5

Discrepancies:
  - test.md: deleted locally but exists on server (v5)
```

---

### `jolli sync repair` Command

Automatically fix common sync state issues.

```bash
jolli sync repair          # Fix all issues
jolli sync repair --dry-run # Show what would be fixed
```

**Repairs:**
- Clear stale `deleted` flags for files that exist on server
- Remove entries for files that don't exist on server
- Reset cursor if ahead of server

---

## Performance

### Incremental Cursor for Restored Files

When a file is restored/recreated on the server, advance its cursor position so incremental syncs pick it up.

**Current issue:**
- File deleted at cursor 16
- File restored at cursor 20 (via web edit)
- Incremental sync from cursor 18 doesn't see it

**Fix:**
- When a sync doc is updated via web UI, advance its cursor entry
- Or: Include "resurrection" changes in incremental sync

---

### Parallel Push/Pull

Process multiple files in parallel during sync.

```bash
jolli sync --parallel 4   # Process 4 files at a time
```

---

## Conflict Resolution

### Interactive Conflict Resolution

When conflicts occur, offer interactive resolution options.

```bash
jolli sync
# Conflict detected: test.md
#   Local:  v4 (modified 2 hours ago)
#   Server: v5 (modified 1 hour ago)
#
# Options:
#   [k] Keep local version
#   [s] Use server version
#   [m] Merge (open diff tool)
#   [d] Show diff
```

---

### Auto-merge for Non-conflicting Changes

If local and server changes don't overlap, auto-merge them.

---

## Integration

### Watch Mode

Watch for local file changes and sync automatically.

```bash
jolli sync --watch
```

---

### Pre-commit Hook

Add a git hook to sync before commits.

```bash
jolli sync install-hook
```
