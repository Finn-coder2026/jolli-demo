# Markdown Sync - UX & Privacy Enhancements (v8)

## Summary

This spec captures lower-priority enhancements for conflict UX and optional path obfuscation.

| Feature | Description |
|---------|-------------|
| Path Obfuscation | HMAC-based serverPath hiding |
| Inbox Strategy | Handle unknown remote files when obfuscation is non-reversible |
| Conflicts Command | CLI command to list and inspect conflicts |
| Conflict Copy | Keep server version as separate file during conflicts |

## Prerequisites

- v7 spec implemented (queue optimization)
- Current sync system working

---

## Part A: Path Obfuscation

### Motivation

Currently `serverPath` is stored in plaintext on the server, exposing the user's file structure. HMAC obfuscation hides paths while remaining deterministic per workspace.

### Obfuscator Interface

```typescript
// cli/src/shared/obfuscator.ts

export interface PathObfuscator {
  /** Convert client path to obfuscated server path */
  obfuscate(clientPath: string): string;

  /** Attempt to reverse obfuscation (may return null if non-reversible) */
  reverse(serverPath: string): string | null;

  /** Whether this obfuscator supports reversal */
  isReversible: boolean;
}
```

### HMAC Implementation

```typescript
import { createHmac } from "crypto";

export function createHmacObfuscator(secret: string): PathObfuscator {
  return {
    obfuscate(clientPath: string): string {
      const hmac = createHmac("sha256", secret);
      hmac.update(clientPath);
      return hmac.digest("hex").slice(0, 32); // 32 char hash
    },

    reverse(_serverPath: string): string | null {
      return null; // HMAC is non-reversible
    },

    isReversible: false,
  };
}
```

### Reversible Alternative (Base64)

For simpler setups where path privacy isn't critical:

```typescript
export function createBase64Obfuscator(): PathObfuscator {
  return {
    obfuscate(clientPath: string): string {
      return Buffer.from(clientPath).toString("base64url");
    },

    reverse(serverPath: string): string | null {
      try {
        return Buffer.from(serverPath, "base64url").toString("utf8");
      } catch {
        return null;
      }
    },

    isReversible: true,
  };
}
```

### Configuration

Add workspace secret to `.jolli/sync.md`:

```yaml
---
lastCursor: 42
obfuscationSecret: "user-generated-secret-here"
obfuscationType: "hmac" | "base64" | "none"
files:
  - clientPath: "docs/readme.md"
    fileId: "ABC123XYZ"
    serverPath: "a1b2c3d4e5f6..." # obfuscated
---
```

### Client State Changes

Replace `serverPath` with `obfPath` in:
- FileEntry type
- Push ops
- State file

---

## Part B: Inbox Strategy for Unknown Remote Files

### Problem

When using non-reversible obfuscation (HMAC), a new client cannot determine where to place files received from the server since `serverPath` cannot be reversed to `clientPath`.

### Solution: Inbox Folder

Place unknown files in a special inbox folder:

```
workspace/
├── .jolli/
│   └── inbox/
│       └── <fileId>.md    ← files with unknown clientPath
└── docs/
    └── known-file.md
```

### Implementation

```typescript
// In pullFromServer

for (const change of changes) {
  const existing = state.files.find(f => f.fileId === change.fileId);

  if (existing) {
    // Known file - use existing clientPath
    await writeFile(existing.clientPath, change.content);
  } else if (obfuscator.isReversible) {
    // Reversible - derive clientPath from serverPath
    const clientPath = obfuscator.reverse(change.serverPath);
    if (clientPath) {
      await writeFile(clientPath, change.content);
      state.files.push({ clientPath, fileId: change.fileId, ... });
    }
  } else {
    // Non-reversible - place in inbox
    const inboxPath = `.jolli/inbox/${change.fileId}.md`;
    await writeFile(inboxPath, change.content);
    state.files.push({
      clientPath: inboxPath,
      fileId: change.fileId,
      inInbox: true,
      ...
    });
    logger.warn(`New file placed in inbox: ${inboxPath}`);
  }
}
```

### Inbox Command

```bash
jolli inbox              # List files in inbox
jolli inbox move <id> <path>  # Move file from inbox to workspace
```

---

## Part C: Conflicts CLI Command

### `jolli conflicts`

List files currently in conflict state:

```bash
$ jolli conflicts
CONFLICTED FILES:
  docs/api.md          (since 2024-01-15 10:30)
  notes/todo.md        (since 2024-01-14 15:45)

Use 'jolli conflicts --diff <file>' to see differences.
Use 'jolli conflicts --resolve <file>' to mark as resolved.
```

### Implementation

```typescript
// cli/src/client/cli.ts

async function listConflicts(state: SyncState): Promise<void> {
  const conflicts = state.files.filter(f => f.conflicted);

  if (conflicts.length === 0) {
    console.log("No conflicted files.");
    return;
  }

  console.log("CONFLICTED FILES:");
  for (const f of conflicts) {
    const since = f.conflictAt ? new Date(f.conflictAt).toLocaleString() : "unknown";
    console.log(`  ${f.clientPath}  (since ${since})`);
  }

  console.log("\nUse 'jolli conflicts --diff <file>' to see differences.");
  console.log("Use 'jolli conflicts --resolve <file>' to mark as resolved.");
}
```

### `jolli conflicts --diff <file>`

Show unified diff between local content and conflict markers:

```typescript
async function showConflictDiff(clientPath: string, state: SyncState): Promise<void> {
  const entry = state.files.find(f => f.clientPath === clientPath);
  if (!entry?.conflicted) {
    console.log("File is not in conflict state.");
    return;
  }

  const content = await Bun.file(clientPath).text();

  // Extract sections from conflict markers
  const localMatch = content.match(/<<<<<<< LOCAL\n([\s\S]*?)\n=======/);
  const serverMatch = content.match(/=======\n([\s\S]*?)\n>>>>>>> SERVER/);

  if (localMatch && serverMatch) {
    console.log("LOCAL VERSION:");
    console.log(localMatch[1]);
    console.log("\nSERVER VERSION:");
    console.log(serverMatch[1]);
  } else {
    console.log("No conflict markers found. File may have been manually edited.");
  }
}
```

### `jolli conflicts --resolve <file>`

Mark a file as resolved after user manually fixes it:

```typescript
async function resolveConflict(clientPath: string, state: SyncState): Promise<void> {
  const entry = state.files.find(f => f.clientPath === clientPath);
  if (!entry) {
    console.log("File not found in sync state.");
    return;
  }

  // Check for remaining conflict markers
  const content = await Bun.file(clientPath).text();
  if (hasConflictMarkers(content)) {
    console.log("Warning: File still contains conflict markers.");
    console.log("Remove markers before resolving, or use --force.");
    return;
  }

  entry.conflicted = false;
  entry.conflictAt = undefined;
  entry.conflictServerVersion = undefined;
  entry.fingerprint = fingerprintFromContent(content);

  console.log(`Resolved: ${clientPath}`);
  console.log("Run 'jolli sync' to push your changes.");
}
```

---

## Part D: Conflict Copy File

### Motivation

Instead of (or in addition to) conflict markers, keep the server's version as a separate file. This makes manual comparison easier, especially for binary-like content.

### Implementation

```typescript
// In conflict handling

async function handleConflictWithCopy(
  clientPath: string,
  localContent: string,
  serverContent: string,
): Promise<void> {
  // Keep local version in place
  // (conflict markers already added by smart-merge)

  // Create conflict copy with server version
  const ext = path.extname(clientPath);
  const base = clientPath.slice(0, -ext.length);
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const copyPath = `${base} (conflict ${timestamp})${ext}`;

  await Bun.write(copyPath, serverContent);
  logger.info(`Conflict copy created: ${copyPath}`);
}
```

### Configuration

Make conflict copy optional via config:

```yaml
# .jolli/sync.md
---
conflictStrategy: "markers" | "copy" | "both"
---
```

---

## Implementation Plan

### Phase 1: Obfuscation
1. [ ] Create `cli/src/shared/obfuscator.ts`
2. [ ] Add obfuscation config to state file
3. [ ] Update push/pull to use obfuscator
4. [ ] Add inbox folder handling for non-reversible

### Phase 2: Inbox Command
5. [ ] Add `jolli inbox` command
6. [ ] Add `jolli inbox move` subcommand

### Phase 3: Conflicts Command
7. [ ] Add `jolli conflicts` command
8. [ ] Add `--diff` flag
9. [ ] Add `--resolve` flag

### Phase 4: Conflict Copy
10. [ ] Add `conflictStrategy` config
11. [ ] Implement conflict copy creation
12. [ ] Update conflict detection to check for copy files

### Phase 5: Tests
13. [ ] Obfuscator unit tests (HMAC, Base64)
14. [ ] Inbox placement tests
15. [ ] Conflicts command tests
16. [ ] Conflict copy tests

---

## Suggested Tests

```typescript
describe("PathObfuscator", () => {
  it("HMAC should produce deterministic output", () => {
    const obf = createHmacObfuscator("secret");
    expect(obf.obfuscate("docs/a.md")).toBe(obf.obfuscate("docs/a.md"));
  });

  it("HMAC should not be reversible", () => {
    const obf = createHmacObfuscator("secret");
    expect(obf.reverse(obf.obfuscate("docs/a.md"))).toBeNull();
  });

  it("Base64 should be reversible", () => {
    const obf = createBase64Obfuscator();
    const original = "docs/readme.md";
    expect(obf.reverse(obf.obfuscate(original))).toBe(original);
  });
});

describe("Inbox handling", () => {
  it("should place unknown files in inbox with non-reversible obfuscation", async () => {
    // Setup: HMAC obfuscator, no local state for file
    // Pull new file from server
    // Verify file placed in .jolli/inbox/
  });
});

describe("jolli conflicts", () => {
  it("should list conflicted files from state", async () => {
    // Setup: state with conflicted entries
    // Run listConflicts
    // Verify output
  });

  it("should show diff between local and server sections", async () => {
    // Setup: file with conflict markers
    // Run showConflictDiff
    // Verify sections extracted
  });

  it("should clear conflict flag on resolve", async () => {
    // Setup: conflicted file with markers removed
    // Run resolveConflict
    // Verify entry.conflicted = false
  });
});
```
