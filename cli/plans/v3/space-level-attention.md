# Space-Level Attention: Multi-Source Impact Analysis

## Problem

Today, `jolli impact` assumes docs and code are co-located in a single directory tree. The `.jolli` root, the `.git` root, and the docs all share one base path. Every attention rule like `path: src/auth/**/*.ts` is resolved relative to that single root.

This breaks down in two key scenarios:

1. **Vault model** — A user keeps all their Jolli docs in a central directory (e.g. `~/vault/`) synced across spaces, while the source code lives in separate git repos elsewhere on the filesystem.

2. **Multi-repo projects** — A documentation space covers multiple services/repos (e.g. `backend`, `frontend`, `infra`), each in its own git repo with its own change history.

In both cases there is no single directory where git paths and doc attention paths align.

## Proposed Solution

Introduce a **sources** configuration at the space level. Each source is a named reference to a git repository. Attention rules gain an optional `source` field that scopes the `path` to a specific repo.

### Sources Config

A new file `.jolli/sources.json` declares the repos this space tracks:

```json
{
  "sources": {
    "backend": {
      "type": "git",
      "path": "/Users/dev/work/backend"
    },
    "frontend": {
      "type": "git",
      "path": "/Users/dev/work/frontend"
    },
    "infra": {
      "type": "git",
      "path": "/Users/dev/work/infra"
    }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Source type. Only `git` for now. |
| `path` | Yes | Absolute path to the repository root. |

**Future extensions:** `remote` field for cloning on-the-fly (CI), `branch` for tracking a non-default branch.

### Attention Frontmatter Extension

The attention schema gains an optional `source` field:

```yaml
---
jrn: AUTH_DOCS_001
attention:
  - op: file
    source: backend
    path: src/auth/**/*.ts
  - op: file
    source: frontend
    path: src/components/Login/**/*.tsx
  - op: file
    path: docs/api/*.md          # no source = local (relative to .jolli root)
---
```

Rules:
- When `source` is present, `path` is resolved relative to that source's git root.
- When `source` is absent, `path` is resolved relative to the `.jolli` project root (current behavior). This preserves full backward compatibility.

### Impact Execution Flow

```
jolli impact agent
│
├── 1. Find project root (findProjectRoot → .jolli)
├── 2. Load .jolli/sources.json
│      └── If missing or empty → single implicit source = project root (backward compat)
├── 3. Load docs from docsPath (relative to project root)
├── 4. Build attention index, grouping rules by source
│      ├── "backend"  → [rule1, rule2, ...]
│      ├── "frontend" → [rule3, ...]
│      └── <local>    → [rule4, ...]     (no source field)
│
├── 5. For each source:
│      ├── Resolve git root from source config (or project root for <local>)
│      ├── Run git diff in that repo's directory
│      ├── Normalize changed file paths (repo-relative)
│      └── Match against rules scoped to this source
│
├── 6. Merge matches across all sources
│      └── Each match carries evidence: { source, changedFile, pattern }
│
├── 7. Deduplicate impacted docs
│      └── A doc matched by multiple sources appears once with combined evidence
│
├── 8. Run agent for each impacted doc (Phase 1)
│      ├── Agent receives code diffs from the matched source(s)
│      ├── Agent reads/writes article relative to project root
│      └── Context includes which source triggered the match
│
└── 9. Phase 2 propagation (unchanged — article→article is local)
```

### Key Design Decisions

**1. Sources live in `.jolli/`, not in frontmatter.**
Sources are a workspace/space-level concept. Individual docs reference sources by name, keeping frontmatter clean and portable. If a repo path changes, you update one file, not every doc.

**2. Backward compatible by default.**
No `sources.json` = current behavior (single implicit source = project root). No `source` field on a rule = resolve relative to project root. Existing setups work unchanged.

**3. Git operations are per-source.**
Each source gets its own `git diff` call. This means each source can have a different base branch, different uncommitted state, etc.

**4. Evidence tracks source.**
Match evidence includes which source produced the match, so audit trails and reports show where the change came from.

**5. Phase 2 propagation is unaffected.**
Article-to-article propagation uses doc paths (relative to project root), not code paths. It doesn't need source resolution.

### CLI Additions

```bash
# Manage sources
jolli source add backend --path /Users/dev/work/backend
jolli source add frontend --path /Users/dev/work/frontend
jolli source list
jolli source remove backend

# Impact with sources (automatic, no new flags needed)
jolli impact agent                    # Diffs all configured sources
jolli impact agent --source backend   # Diff only one source (future)
```

### Changes Required

#### New Files

| File | Description |
|------|-------------|
| `src/shared/Sources.ts` | Load/save/validate `.jolli/sources.json` |
| `src/shared/Sources.test.ts` | Unit tests |
| `src/client/commands/source.ts` | `jolli source add/list/remove` commands |

#### Modified Files

| File | Change |
|------|--------|
| `src/client/commands/impact/AttentionIndex.ts` | Group rules by source when building index |
| `src/client/commands/impact/search.ts` | Run git diff per-source, merge matches |
| `src/client/commands/impact/ImpactAgentRunner.ts` | Load sources config, orchestrate per-source diffs |
| `src/client/commands/impact/Types.ts` | Add `source` field to attention rule types, evidence types |
| `src/client/commands/impact/FileMatcher.ts` | Accept source-scoped index for matching |
| `src/client/commands/impact/GitDiffParser.ts` | Accept explicit git root (already supports `cwd` param) |
| `src/client/commands/impact/AuditTrail.ts` | Include source in evidence records |
| `src/client/cli.ts` | Register `source` command |
| `docs/impact/attention-schema.md` | Document `source` field |

#### Attention Schema Changes (jolli-common)

The attention parser in `jolli-common` needs to recognize the `source` field:

```typescript
interface AttentionRule {
  op: "file";       // existing
  path: string;     // existing
  keywords?: string[]; // existing
  source?: string;  // NEW — name of the source from sources.json
}
```

### Sequencing

| Step | Description | Depends On |
|------|-------------|------------|
| 1 | Sources config (load/save/validate) | — |
| 2 | `jolli source` CLI commands | Step 1 |
| 3 | Attention schema: add `source` field to parser | — |
| 4 | AttentionIndex: group by source | Step 3 |
| 5 | GitDiffParser: run per-source | Step 1 |
| 6 | FileMatcher + search: source-scoped matching | Steps 4, 5 |
| 7 | ImpactAgentRunner: orchestrate multi-source | Steps 1–6 |
| 8 | AuditTrail: source in evidence | Step 7 |
| 9 | Documentation updates | Steps 1–8 |

Steps 1–3 can be done in parallel. Steps 4–5 can be done in parallel after their deps.

### Example: Vault Setup

```bash
# Initialize vault
cd ~/vault
jolli init
# Select space...

# Register source repos
jolli source add backend --path ~/work/backend
jolli source add frontend --path ~/work/frontend

# Sync docs down
jolli sync down

# Now docs in ~/vault/ have attention rules like:
#   - op: file
#     source: backend
#     path: src/auth/**/*.ts

# After making code changes in ~/work/backend:
cd ~/vault
jolli impact agent
# → Runs git diff in ~/work/backend
# → Matches against backend-scoped attention rules
# → Updates impacted docs in ~/vault/
# → Phase 2 propagates through doc graph
```

### Example: Co-located Setup (Unchanged)

```bash
cd ~/myproject
jolli init
# No sources.json needed — implicit single source

jolli impact agent
# → Runs git diff in ~/myproject (project root = git root)
# → Matches attention rules with no source field
# → Works exactly as today
```

### Open Questions

1. **Remote sources** — Should sources support git remote URLs for CI environments where repos aren't checked out locally? Would require cloning or shallow fetching.

2. **Base branch per-source** — Should each source track its own base branch (e.g. backend uses `develop`, frontend uses `main`)? Currently `--base` applies globally.

3. **Source validation** — Should `jolli impact` warn or error if a source path doesn't exist or isn't a git repo? Probably warn and skip.

4. **Sync integration** — When syncing docs that have `source` fields in attention, should the sync server be aware of sources? Or is this purely a CLI-side concern?

5. **Server-side impact** — If impact analysis moves server-side (CI webhooks), sources would need to be stored in the space model, not just locally. Plan for this in the data model.
