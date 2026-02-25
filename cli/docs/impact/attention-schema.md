# Attention Schema

The `attention` field in frontmatter declares explicit dependencies between a doc file and code artifacts. This enables **high-precision** impact detection (the PUSH channel).

## Basic Format

```yaml
---
jrn: ABC123
attention:
  - op: file
    source: backend
    path: src/auth/login.ts
---
```

The `jrn` value is used as the `docId` in impact output.

## Operations

Currently, only `file` operations are supported in Phase 1.

### `file` - Watch a File Path

Triggers when the specified file is modified.

```yaml
attention:
  - op: file
    path: src/auth/login.ts
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `source` | No | Source name from `.jolli/sources.json`; when omitted, defaults to local project root |
| `path` | Yes | File path relative to repo root (supports globs) |
| `keywords` | No | Additional keywords to boost match confidence |

**Examples:**
```yaml
# Exact file
- op: file
  source: backend
  path: src/auth/login.ts

# Glob pattern
- op: file
  source: frontend
  path: src/auth/**/*.ts

# With keywords for context
- op: file
  source: backend
  path: src/auth/login.ts
  keywords: [oauth, token, refresh]

# Local/default source (backward compatible)
- op: file
  path: docs/api/*.md
```

## Multiple Attention Rules

A doc can watch multiple files. **Any** match triggers the doc for review.

```yaml
---
jrn: AUTH_DOCS_001
attention:
  - op: file
    path: src/auth/**/*.ts
  - op: file
    path: src/config/auth.ts
  - op: file
    path: backend/src/router/AuthRouter.ts
---
# Authentication Guide

This document covers the authentication system...
```

## Keywords

The `keywords` field provides additional context for:
1. Boosting match confidence when the keyword appears in the diff
2. Helping the PULL channel (Phase 2 semantic search) find relevant changes

```yaml
attention:
  - op: file
    path: src/scheduler/index.ts
    keywords: [cron, job, queue, background, async]
```

## Glob Patterns

File paths support standard glob patterns:

| Pattern | Matches |
|---------|---------|
| `src/auth/*.ts` | Direct children of src/auth/ |
| `src/auth/**/*.ts` | All .ts files under src/auth/ recursively |
| `src/{auth,users}/*.ts` | Files in auth or users |
| `*.config.ts` | Any config file |

## Source And Path Resolution

- When `source` is present, `path` is resolved relative to that source's git root.
- When `source` is omitted, `path` is resolved relative to the local project root (`<local>` source).

## Path Normalization

All paths are normalized before indexing and matching:

- Repo-relative (no leading `/` or `./`)
- Forward slashes (`/`) as separators
- Redundant `.` segments removed
- `..` segments collapsed where possible

Normalization applies to both `attention` paths and git diff paths.

## Implementation Notes

### Indexing (Offline)
When docs are indexed, `attention` rules are compiled into an inverted index:
```
file:src/auth/login.ts     → [DOC_001, DOC_042]
file:src/auth/**/*.ts      → [DOC_001] (glob pattern)
```

### Matching (Online)
When a diff is analyzed:
1. Extract changed file paths from git diff
2. Normalize paths (repo-relative, POSIX separators)
3. For renames, match **both** old and new paths
4. Look up in inverted index (exact match + glob matching)
5. Return matched docs with evidence

### Evidence
Each match includes evidence of why it triggered:
```json
{
  "doc_id": "DOC_001",
  "matches": [
    {
      "op": "file",
      "changed": "src/auth/login.ts",
      "pattern": "src/auth/**/*.ts"
    }
  ]
}
```

`diff_hunk` (or other hunk references) may be included when available.

## Future Operations (Planned)

The following operations may be added in future versions:

| Operation | Description |
|-----------|-------------|
| `symbol` | Watch a function/class/method |
| `config` | Watch a config key |
| `endpoint` | Watch an API endpoint |
| `flag` | Watch a CLI flag |
| `schema` | Watch a database schema field |

These require enhanced diff extraction capabilities beyond file paths.
