# Markdown Sync - Clean Content Storage (v9)

## Summary

This spec addresses an inconsistency in how content is stored on the server: CLI-pushed content includes frontmatter (`jrn:` field) while web-created content does not. The goal is to ensure the server always stores clean content, with the `jrn:` field being a local-only concern.

| Feature | Description |
|---------|-------------|
| Strip `jrn:` on Push | CLI removes only the `jrn:` line from frontmatter before sending to server |
| Preserve User Frontmatter | Other frontmatter fields (author, tags, etc.) are preserved and synced |
| Clean Server Storage | Server stores content without CLI tracking metadata, but WITH user metadata |
| Local-only `jrn:` | The `jrn:` field is injected on pull and stripped on push |

## Prerequisites

- Current sync system working (frontmatter injection on pull implemented)

---

## Current State (Inconsistency)

### Problem

1. **CLI creates file locally** -> pushes content WITH frontmatter -> server stores content WITH frontmatter
2. **Web creates file** -> server stores content WITHOUT frontmatter
3. **CLI pulls** -> injects frontmatter locally (already implemented)

This inconsistency means:
- Server content format depends on origin (CLI vs Web)
- Web users may see `jrn:` frontmatter in their documents if originally from CLI
- Hash computation differs based on whether content has frontmatter

### Current Flow

```
LOCAL FILE (with frontmatter)     SERVER (mixed)
---
jrn: ABC123                       - CLI files: has frontmatter
---                               - Web files: no frontmatter
# My Document
```

---

## Proposed Solution

### Design Principle

- **Server**: Always stores clean content (no `jrn:` frontmatter) + tracking in `contentMetadata.sync`
- **CLI**: Manages frontmatter locally for file tracking
- **Hashes**: Computed on clean content (without frontmatter)

### New Flow (Simple Case - No User Frontmatter)

```
LOCAL FILE                PUSH (stripped)           SERVER (clean)
---                       ───────────────►
jrn: ABC123               # My Document             # My Document
---                       contentHash: hash(clean)  contentMetadata.sync.fileId: ABC123
# My Document

                          PULL (inject)
                          ◄───────────────
                          # My Document
                          + inject jrn: ABC123
```

### New Flow (With User Frontmatter)

```
LOCAL FILE                PUSH (jrn stripped)       SERVER (user fm preserved)
---                       ───────────────►
jrn: ABC123               ---                       ---
author: Jane              author: Jane              author: Jane
tags: [api, docs]         tags: [api, docs]         tags: [api, docs]
---                       ---                       ---
# My Document             # My Document             # My Document

                          PULL (jrn injected)
                          ◄───────────────
                          ---
                          author: Jane
                          tags: [api, docs]
                          ---
                          + inject jrn: ABC123
```

**Key Point**: Only the `jrn:` line is stripped. All other frontmatter fields are preserved and synced to the server.

---

## Implementation

### Part A: Strip `jrn:` Line on Push

The `removeJrnFromContent()` function removes only the `jrn:` line from anywhere in frontmatter, preserving all other fields:

```typescript
// cli/src/sync/SyncHelpers.ts
export function removeJrnFromContent(content: string): string {
    if (!content.startsWith("---\n")) return content;

    const closingIdx = content.indexOf("\n---", 4);
    if (closingIdx === -1) return content;

    const frontmatter = content.substring(4, closingIdx);
    const afterFrontmatter = content.substring(closingIdx + 1);

    const cleanLines = frontmatter
        .split("\n")
        .filter((line) => !line.startsWith("jrn:"));

    if (cleanLines.length > 0) {
        return `---\n${cleanLines.join("\n")}\n${afterFrontmatter}`;
    }
    return `---\n${afterFrontmatter}`;
}
```

**How it works**:
- Extracts frontmatter content between opening and closing `---`
- Filters out any line starting with `jrn:`
- Reconstructs the content with remaining frontmatter fields

**Example**:
```markdown
INPUT:                          OUTPUT:
---                             ---
jrn: ABC123                     author: Jane
author: Jane                    tags: [api]
tags: [api]                     ---
---                             # Content
# Content
```

Update the CLI push logic to use this function:

```typescript
// cli/src/sync/SyncEngine.ts - in push operation builders

import { removeJrnFromContent, integrityHashFromContent } from "./SyncHelpers";

// When building push ops for new or changed files:
const cleanContent = removeJrnFromContent(content);
ctx.ops.push({
  type: "upsert",
  fileId,
  serverPath,
  baseVersion,
  content: cleanContent,  // Send content with jrn stripped (other fm preserved)
  contentHash: integrityHashFromContent(cleanContent),
});
```

### Part B: Update Hash Computation

The `contentHash` sent to server should be computed on clean (stripped) content:

```typescript
// Before (current):
contentHash: integrityHashFromContent(content)  // includes frontmatter

// After (proposed):
contentHash: integrityHashFromContent(removeJrnFromContent(content))  // clean content
```

### Part C: Server Verification

Server already computes hash on received content. Since we now send clean content, verification works unchanged.

---

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/sync/SyncEngine.ts` | Strip frontmatter before building push ops |
| `cli/src/sync/SyncEngine.ts` | Use clean content for contentHash |

### Functions to Update

1. `handlePushedNewFile` - strip frontmatter from content before push
2. `handleChangedFile` - strip frontmatter from content before push
3. `handleRenamedOrRestoredFile` - strip frontmatter from content before push

---

## Benefits

1. **Consistency**: Server always has content without `jrn:` regardless of origin
2. **Web UX**: Users never see CLI tracking metadata (`jrn:`)
3. **User Frontmatter**: Authors can use frontmatter for their own metadata (author, tags, etc.)
4. **Simpler hashing**: Hash always computed on content without `jrn:`
5. **Clear separation**: Server uses `contentMetadata.sync` for tracking, CLI uses `jrn:` locally

---

## Implementation Plan

1. [ ] Update `handlePushedNewFile` to strip frontmatter before push
2. [ ] Update `handleChangedFile` to strip frontmatter before push
3. [ ] Update `handleRenamedOrRestoredFile` to strip frontmatter before push
4. [ ] Add test: verify server receives content without frontmatter
5. [ ] Add test: verify hash matches clean content

---

## Suggested Tests

```typescript
describe("frontmatter stripping on push", () => {
  it("should strip only jrn from frontmatter before pushing", async () => {
    const server = createMockServer();
    const client = createMockClient("A");

    // Create file with jrn AND user frontmatter locally
    client.files.set("doc.md", "---\njrn: TEST_ID\nauthor: Jane\ntags: [api]\n---\n# Hello");
    await sync(client.createDeps(server.transport));

    // Server should receive content with user frontmatter preserved, but no jrn
    const serverContent = server.files.get("A_1")?.content;
    expect(serverContent).toBe("---\nauthor: Jane\ntags: [api]\n---\n# Hello");
    expect(serverContent).not.toContain("jrn:");
    expect(serverContent).toContain("author: Jane");
  });

  it("should strip jrn when it is the only frontmatter field", async () => {
    const server = createMockServer();
    const client = createMockClient("A");

    // Create file with only jrn frontmatter
    client.files.set("doc.md", "---\njrn: TEST_ID\n---\n# Hello");
    await sync(client.createDeps(server.transport));

    // Server should receive content without jrn (empty frontmatter is ok)
    const serverContent = server.files.get("A_1")?.content;
    expect(serverContent).not.toContain("jrn:");
  });

  it("should compute contentHash on jrn-stripped content", async () => {
    const server = createMockServer();
    const client = createMockClient("A");

    const userContent = "---\nauthor: Jane\n---\n# Hello";
    client.files.set("doc.md", "---\njrn: TEST_ID\nauthor: Jane\n---\n# Hello");
    await sync(client.createDeps(server.transport));

    // Verify the hash matches content with jrn stripped
    const expectedHash = integrityHashFromContent(userContent);
    // ... verify hash was computed correctly
  });

  it("should preserve user frontmatter locally after push", async () => {
    const server = createMockServer();
    const client = createMockClient("A");

    // Start with user frontmatter but no jrn
    client.files.set("doc.md", "---\nauthor: Jane\n---\n# Hello");
    await sync(client.createDeps(server.transport));

    // Local file should have jrn injected along with existing frontmatter
    const localContent = client.files.get("doc.md");
    expect(localContent).toContain("jrn:");
    expect(localContent).toContain("author: Jane");
    expect(localContent).toContain("# Hello");

    // Server should have user frontmatter but no jrn
    const serverContent = server.files.get("A_1")?.content;
    expect(serverContent).toContain("author: Jane");
    expect(serverContent).not.toContain("jrn:");
  });

  it("should roundtrip user frontmatter through push and pull", async () => {
    const server = createMockServer();
    const clientA = createMockClient("A");
    const clientB = createMockClient("B");

    // Client A creates file with user frontmatter
    clientA.files.set("doc.md", "---\nauthor: Jane\ncustom: value\n---\n# Hello");
    await sync(clientA.createDeps(server.transport));

    // Client B pulls the file
    await sync(clientB.createDeps(server.transport));

    // Client B should have all user frontmatter + jrn
    const clientBContent = clientB.files.get("doc.md");
    expect(clientBContent).toContain("jrn:");
    expect(clientBContent).toContain("author: Jane");
    expect(clientBContent).toContain("custom: value");
  });
});
```

---

## Edge Cases

### Empty Frontmatter After Stripping

If a file has ONLY `jrn:` in frontmatter, stripping leaves an empty block:

```markdown
INPUT:                          OUTPUT:
---                             ---
jrn: ABC123                     ---
---                             # Content
# Content
```

**Decision**: This is acceptable. Empty frontmatter is valid YAML and doesn't affect rendering. Alternatively, we could enhance `removeJrnFromContent` to clean up empty blocks, but that adds complexity.

### Frontmatter Injection Order

When `injectJrn` adds the `jrn:` field to existing frontmatter, it inserts at the beginning:

```markdown
SERVER:                         LOCAL (after pull):
---                             ---
author: Jane                    jrn: ABC123
---                             author: Jane
# Content                       ---
                                # Content
```

This keeps `jrn:` consistent and easy to find.

---

## Notes

- This is a **non-breaking change** for existing synced files
- CLI will continue to work with server content that has frontmatter (legacy)
- `injectJrn` handles content that already has frontmatter gracefully
- Gradual migration: as files are pushed, server content becomes clean
- **User frontmatter is fully preserved** - only `jrn:` is CLI-managed
