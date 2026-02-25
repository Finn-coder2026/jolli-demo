# Folder Hierarchy Resolution for Sync

Places synced files into the correct folder hierarchy on the server based on their `serverPath`.

## Overview

When CLI syncs files to the server, the backend automatically creates necessary folder structures and places documents in the correct location. For example, syncing `docs/guide/intro.md` creates:

```
Space (default)
└── docs/           (folder, parentId: null)
    └── guide/      (folder, parentId: docs.id)
        └── intro.md (document, parentId: guide.id)
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI Client                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Push Request:                                                        ││
│  │   { fileId, serverPath: "docs/guide/intro.md", content, ... }       ││
│  └─────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ POST /v1/sync/push
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Backend Server                                 │
│  ┌─────────────┐  ┌──────────────────────┐  ┌────────────────────────┐  │
│  │ SyncRouter  │──│FolderResolutionService│──│       DocDao           │  │
│  │             │  │                      │  │                        │  │
│  │ processPush │  │ resolveFolderHierarchy│ │ findFolderByName       │  │
│  │     Op      │  │ getOrCreateFolder    │  │ createDoc (folder)     │  │
│  │             │  │                      │  │ createDoc (document)   │  │
│  └─────────────┘  └──────────────────────┘  └────────────────────────┘  │
│                              │                                           │
│                              ▼                                           │
│                     ┌─────────────────┐                                  │
│                     │   PostgreSQL    │                                  │
│                     │                 │                                  │
│                     │ Doc table:      │                                  │
│                     │ - id            │                                  │
│                     │ - spaceId       │                                  │
│                     │ - parentId      │                                  │
│                     │ - docType       │                                  │
│                     │ - contentMeta   │                                  │
│                     └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### FolderResolutionService

A stateful service that resolves or creates folder hierarchies from file paths.

**File:** [backend/src/services/FolderResolutionService.ts](../../../backend/src/services/FolderResolutionService.ts)

```typescript
interface FolderResolutionResult {
  spaceId: number;              // Target space ID
  parentId: number | undefined; // Parent folder ID (undefined for root)
  folderPath: string;           // Path to containing folder
}

class FolderResolutionService {
  private folderCache: Map<string, Doc>;

  resolveFolderHierarchy(serverPath: string, spaceId: number, docDao: DocDao): Promise<FolderResolutionResult>;
  extractFolderPath(serverPath: string): string;
  clearCache(): void;
}
```

**Key features:**
- Caches folder lookups within a sync batch (avoids redundant DB queries)
- Creates folders on-demand (only when files exist in them)
- Uses folder name + parentId for lookup (not full path)

### DocDao.findFolderByName

Finds a folder by name within a specific space and parent.

**File:** [backend/src/dao/DocDao.ts](../../../backend/src/dao/DocDao.ts)

```typescript
findFolderByName(
  spaceId: number,
  parentId: number | null,  // null = root level
  name: string              // Folder title from contentMetadata
): Promise<Doc | undefined>;
```

**Query logic:**
- Matches `docType = "folder"`
- Matches `spaceId`
- Matches `parentId` (using `IS NULL` for root level)
- Compares `contentMetadata.title` with name
- Excludes soft-deleted folders (`deletedAt IS NULL`)

---

## Algorithm

### Folder Resolution Flow

```
Input: serverPath = "docs/guide/intro.md", spaceId = 1

1. Extract folder path
   "docs/guide/intro.md" → "docs/guide"

2. Parse folder names
   "docs/guide" → ["docs", "guide"]

3. Resolve each folder level (depth-first):

   Level 0: "docs"
   ├── Check cache: "1:null:docs" → miss
   ├── Query DB: findFolderByName(1, null, "docs")
   │   └── Not found
   ├── Create folder: createDoc({ title: "docs", parentId: undefined, ... })
   │   └── Returns { id: 10, ... }
   ├── Cache: "1:null:docs" → folder(id=10)
   └── parentId = 10

   Level 1: "guide"
   ├── Check cache: "1:10:guide" → miss
   ├── Query DB: findFolderByName(1, 10, "guide")
   │   └── Not found
   ├── Create folder: createDoc({ title: "guide", parentId: 10, ... })
   │   └── Returns { id: 20, ... }
   ├── Cache: "1:10:guide" → folder(id=20)
   └── parentId = 20

4. Return: { spaceId: 1, parentId: 20, folderPath: "docs/guide" }
```

### Push Operation Integration

**File:** [backend/src/router/SyncRouter.ts](../../../backend/src/router/SyncRouter.ts)

```
processPushOp(op, docDao, syncArticleDao, folderService, spaceId):

IF new doc (no existing):
  1. Resolve folder hierarchy: resolveFolderHierarchy(serverPath, spaceId, docDao)
  2. Create doc with returned { spaceId, parentId }

ELSE IF existing doc with changed serverPath:
  1. Detect path change: existingServerPath !== op.serverPath
  2. Resolve new folder hierarchy
  3. Update doc with new { spaceId, parentId }
  4. Log: "Moving file from 'old/path' to 'new/path'"

ELSE (existing doc, same path):
  1. Preserve existing { spaceId, parentId }
  2. Update content only
```

---

## Data Model

### Folder as Doc

Folders are stored as regular `Doc` entities with `docType: "folder"`:

```typescript
{
  id: 10,
  spaceId: 1,
  parentId: undefined,      // Root level
  docType: "folder",
  content: "",              // Empty
  contentType: "application/folder",
  contentMetadata: {
    title: "docs"           // Folder name
  },
  createdBy: "sync-server",
  updatedBy: "sync-server"
}
```

### Document with Parent

Synced documents reference their parent folder:

```typescript
{
  id: 100,
  jrn: "jrn:/global:docs:article/sync-ABC123",
  spaceId: 1,
  parentId: 20,             // Points to "guide" folder
  docType: "document",
  content: "# Intro\n...",
  contentType: "text/markdown",
  contentMetadata: {
    sync: {
      fileId: "ABC123",
      serverPath: "docs/guide/intro.md"
    }
  }
}
```

### Cache Key Format

```
{spaceId}:{parentId|"null"}:{folderName}

Examples:
- "1:null:docs"     → Root-level "docs" folder in space 1
- "1:10:guide"      → "guide" folder under parent 10 in space 1
```

---

## Space Resolution

Synced documents are placed in the **default space**:

```typescript
// In SyncRouter push handler
const defaultSpace = await spaceDao.getOrCreateDefaultSpace(1);
const folderService = createFolderResolutionService();

for (const op of ops) {
  const result = await processPushOp(op, docDao, syncArticleDao, folderService, defaultSpace.id);
}
```

**Implementation:** [backend/src/dao/SpaceDao.ts](../../../backend/src/dao/SpaceDao.ts)

The `getOrCreateDefaultSpace(userId)` method:
1. Looks for space with `jrn: "default"`
2. Creates it if not exists
3. Returns the space with its `id`

---

## File Reparenting

When a file's `serverPath` changes (renamed/moved), the document is reparented:

```typescript
// Detect path change
const existingServerPath = existing.contentMetadata?.sync?.serverPath;

if (existingServerPath !== op.serverPath) {
  // Resolve new folder hierarchy
  const resolved = await folderService.resolveFolderHierarchy(op.serverPath, spaceId, docDao);

  // Update with new parentId
  await docDao.updateDocIfVersion({
    ...existing,
    parentId: resolved.parentId,
    spaceId: resolved.spaceId,
    contentMetadata: { ...existing.contentMetadata, sync: newSyncInfo }
  }, currentVersion);
}
```

**Example:**
```
Before: notes/test.md    → parentId: 10 (notes folder)
After:  docs/test.md     → parentId: 20 (docs folder)
```

---

## Edge Cases

### Root-Level Files

Files without a folder path go to the space root:

```
serverPath: "readme.md"
folderPath: ""           → Empty, no folder resolution needed
result: { spaceId: 1, parentId: undefined, folderPath: "" }
```

### Deeply Nested Paths

Each level is resolved sequentially:

```
serverPath: "a/b/c/d/file.md"
folders: ["a", "b", "c", "d"]

Resolution:
1. a (parentId: null)    → creates folder, id: 10
2. b (parentId: 10)      → creates folder, id: 11
3. c (parentId: 11)      → creates folder, id: 12
4. d (parentId: 12)      → creates folder, id: 13

result: { parentId: 13, ... }
```

### Existing Folders

If folders already exist, they are reused:

```
serverPath: "docs/intro.md"

1. findFolderByName(1, null, "docs") → returns existing folder(id=10)
2. Cache hit on subsequent requests
3. result: { parentId: 10, ... }
```

### Concurrent Syncs

Multiple sync operations in the same batch share the folder cache:

```typescript
const folderService = createFolderResolutionService();

// Batch: ["docs/a.md", "docs/b.md", "docs/c.md"]
// "docs" folder created once, cached for remaining files

for (const op of ops) {
  await processPushOp(op, ..., folderService, spaceId);
}

folderService.clearCache();  // Clear after batch
```

---

## Performance Considerations

| Optimization | Description |
|--------------|-------------|
| **Batch caching** | Folder lookups cached within a sync batch |
| **Sequential resolution** | Parent folders resolved before children |
| **No atomic transactions** | Folders created individually (per user requirement) |
| **Lazy creation** | Folders only created when files exist in them |

---

## Key Files

| File | Purpose |
|------|---------|
| [backend/src/services/FolderResolutionService.ts](../../../backend/src/services/FolderResolutionService.ts) | Folder hierarchy resolution |
| [backend/src/router/SyncRouter.ts](../../../backend/src/router/SyncRouter.ts) | Push operation integration |
| [backend/src/dao/DocDao.ts](../../../backend/src/dao/DocDao.ts) | `findFolderByName` implementation |
| [backend/src/dao/SpaceDao.ts](../../../backend/src/dao/SpaceDao.ts) | Default space resolution |

---

## See Also

- [Sync Architecture](../architecture.md) - Main sync system documentation
- [Future specs](../future/) - Planned feature specs
