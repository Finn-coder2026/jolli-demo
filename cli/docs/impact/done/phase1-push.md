# Phase 1: Push (High Precision)

The PUSH channel provides **deterministic, high-precision** impact detection by matching changed files against explicit `attention` declarations in doc frontmatter.
Phase 1 operates at **doc-file granularity** (whole file). Section-level attention is planned later.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Phase 1: Push Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘

OFFLINE (Index Build)                    ONLINE (Impact Analysis)
─────────────────────                    ────────────────────────

┌──────────────┐                         ┌──────────────┐
│  Docs Repo   │                         │   Git Diff   │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│    Parse     │                         │   Extract    │
│  Frontmatter │                         │    Files     │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│   Extract    │                         │   Changed    │
│  attention   │                         │    Files     │
│  file rules  │                         │    List      │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ▼                                        │
┌──────────────┐         ┌──────────────┐      │
│   Inverted   │◀────────│    Match     │◀─────┘
│    Index     │         │  (glob/exact)│
└──────────────┘         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   Impacted   │
                         │     Docs     │
                         │  + Evidence  │
                         └──────────────┘
```

## Why Push First?

1. **High precision** - Only flags docs that explicitly declared interest
2. **Deterministic** - Same input always produces same output
3. **Fast** - Simple index lookup + glob matching, no ML/embedding costs
4. **Explainable** - Clear evidence: "this doc watches this file"
5. **Incremental adoption** - Teams can add `attention` rules gradually
6. **Already have file extraction** - GitDiffParser already extracts changed files

## Implementation Plan

### Step 1: Attention Parser

Parse `attention` field from frontmatter.

```typescript
interface AttentionFileRule {
  op: 'file';
  path: string;           // File path or glob pattern
  keywords?: string[];    // Optional boost terms
}

interface DocAttention {
  docId: string;           // jrn from frontmatter
  docPath: string;
  rules: AttentionFileRule[];
}

function parseAttention(content: string, docPath: string): DocAttention | null;
```

### Step 2: Inverted Index Builder

Build index from file patterns → doc IDs.

```typescript
interface AttentionTarget {
  docId: string;          // jrn
  docPath: string;
  sectionId?: string;     // planned: jrn#heading_hash
  headingPath?: string;   // planned: "Auth > Refresh Tokens"
}

interface AttentionIndex {
  files: {
    // Exact file paths → targets
    exact: Map<string, Set<AttentionTarget>>;

    // Glob patterns (need runtime matching)
    globs: Array<{
      pattern: string;
      target: AttentionTarget;
    }>;
  };

  // Planned Phase 2+ anchors (symbol/config/endpoint/flag/etc.)
  symbols?: Map<string, Set<AttentionTarget>>;
  configs?: Map<string, Set<AttentionTarget>>;
  endpoints?: Map<string, Set<AttentionTarget>>;
  flags?: Map<string, Set<AttentionTarget>>;
  schemas?: Map<string, Set<AttentionTarget>>;
}

function buildAttentionIndex(docs: DocAttention[]): AttentionIndex;
```

### Step 3: File Matcher

Match changed files against attention index.

```typescript
interface FileMatch {
  docId: string;
  docPath: string;
  matches: Array<{
    changedFile: string;      // e.g., "src/auth/login.ts"
    pattern: string;          // e.g., "src/auth/**/*.ts"
    matchType: 'exact' | 'glob';
  }>;
}

function matchFiles(
  changedFiles: string[],
  index: AttentionIndex
): FileMatch[];
```

**Path normalization:** normalize both `changedFiles` and `attention` patterns to repo-relative,
POSIX-style paths (strip leading `./`, collapse redundant segments). For renames, match both
old and new paths.

### Step 4: CLI Integration

Add `jolli impact search` command.

```bash
# Scan docs, build index, match against current branch diff
jolli impact search

# Match against specific diff
jolli impact search --base=origin/main

# Output formats
jolli impact search --json

# Specify docs location
jolli impact search --docs=./docs
```

## File Structure

```
cli/src/client/commands/impact/
├── Types.ts                    # Existing + new types
├── GitDiffParser.ts            # Existing (already extracts files)
├── AttentionParser.ts          # NEW: Parse attention frontmatter
├── AttentionParser.test.ts
├── AttentionIndex.ts           # NEW: Build inverted index
├── AttentionIndex.test.ts
├── FileMatcher.ts              # NEW: Match files to index
├── FileMatcher.test.ts
└── search.ts                   # NEW: Search command
```

## Data Flow Example

### 1. Doc with Attention

```markdown
---
jrn: AUTH_GUIDE_001
attention:
  - op: file
    path: src/auth/**/*.ts
  - op: file
    path: backend/src/router/AuthRouter.ts
---
# Authentication Guide
...
```

### 2. Index Entry

```
exact:backend/src/router/AuthRouter.ts → [AUTH_GUIDE_001]
glob:src/auth/**/*.ts                  → [AUTH_GUIDE_001]
```

### 3. Git Diff (from existing GitDiffParser)

Changed files: `["src/auth/login.ts", "src/utils/helpers.ts"]`

### 4. Match Result

```json
{
  "docId": "AUTH_GUIDE_001",
  "docPath": "docs/auth/guide.md",
  "matches": [
    {
      "changedFile": "src/auth/login.ts",
      "pattern": "src/auth/**/*.ts",
      "matchType": "glob"
    }
  ]
}
```

## Success Criteria

- [ ] Parse `attention` from frontmatter (file rules only)
- [ ] Build inverted index from doc collection
- [ ] Match changed files (exact + glob) to index
- [ ] Normalize paths and match renames (old + new)
- [ ] CLI command `jolli impact search` works end-to-end
- [ ] 100% test coverage on new modules

## Future Enhancements

### Phase 2: Additional Operations
- `symbol` - Watch functions/classes (requires AST or better regex)
- `config` - Watch config keys
- `endpoint` - Watch API endpoints
- `flag` - Watch CLI flags
- `schema` - Watch database schema

### Phase 2: Infrastructure
- **Persistence**: Save index to disk, incremental updates
- **Watch mode**: Re-scan on file changes
- **CI integration**: GitHub Action / PR check
