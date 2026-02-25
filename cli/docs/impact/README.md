---
jrn: MKYZPUMNKWNJVIKK
attention:
  - op: file
    path: cli/src/client/commands/impact/*.ts
  - op: file
    path: cli/src/client/commands/impact.ts
---
# Documentation Change Impact Analysis (DCIA)

Automatically detect which documentation files need updating when code changes.

## Overview

```
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│   Code Change   │   ───▶   │   DCIA Phase 1  │   ───▶   │  Updated Docs   │
│    (PR/Diff)    │          │  Code → Articles│          │                 │
└─────────────────┘          └─────────────────┘          └────────┬────────┘
                                                                    │
                                                                    ▼
                             ┌─────────────────┐          ┌─────────────────┐
                             │   DCIA Phase 2  │   ───▶   │  Impact Report  │
                             │ Article→Article │          │   + Evidence    │
                             └─────────────────┘          └─────────────────┘
```

DCIA now operates in **two phases**:
- **Phase 1 (Code → Articles)**: Detects which documentation files need updating based on code changes
- **Phase 2 (Article → Article)**: Automatically propagates changes through the documentation graph when articles are updated

## Two-Phase Execution Model

### Phase 1: Code → Articles (PUSH)
Detects documentation that needs updating based on code changes using explicit file watching via `attention` frontmatter.

### Phase 2: Article → Article (Propagation)
When Phase 1 updates articles, Phase 2 automatically detects dependent articles and propagates changes through the documentation graph. This ensures consistency across related documentation.

**Example propagation chain:**
```
Code change in src/auth/login.ts
  ↓ (Phase 1)
Updates docs/api/auth.md
  ↓ (Phase 2)
Updates docs/guide/overview.md (watches docs/api/*.md)
  ↓ (Phase 2)
Updates docs/tutorial/quickstart.md (watches docs/guide/*.md)
```

**Cycle detection**: Phase 2 includes cycle detection and configurable max depth to prevent infinite loops.

## Two-Channel Architecture (Future)

DCIA is designed to support two complementary channels for detecting stale documentation:

| Channel | Method | Strength | Use Case |
|---------|--------|----------|----------|
| **PUSH** (Percolation) | Explicit anchor matching via `attention` frontmatter | High precision | `src/auth/login.ts` changed → finds all docs watching that file |
| **PULL** (Retrieval) | BM25 + Vector search | High recall | "scheduler behavior changed" → finds docs about scheduling |

**Note**: Currently only PUSH (Phase 1 & 2) is implemented. PULL (semantic search) is planned for future releases.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Two-Channel Matching                           │
├─────────────────────────────────┬───────────────────────────────────────────┤
│         PUSH (Phase 1)          │              PULL (Phase 2)               │
│      Explicit File Matching     │          Semantic + Lexical Search        │
│                                 │                                           │
│  • attention: frontmatter       │  • BM25 keyword search                    │
│  • File path watching (globs)   │  • Vector/embedding similarity            │
│                                 │  • Co-change history priors               │
│                                 │                                           │
│  ✓ High precision               │  ✓ High recall                            │
│  ✓ Deterministic                │  ✓ Catches implicit references            │
│  ✓ Fast (inverted index)        │  ○ May have false positives               │
└─────────────────────────────────┴───────────────────────────────────────────┘
```

## Key Concepts

### 1. Docs (File-Level for Now)
Docs are treated as whole files. Each doc can declare what it "watches" via `attention` frontmatter.
Section-level granularity is planned (see Future Enhancements).

### 2. Change Atoms
Git diffs become small, doc-relevant claims:
```
"--dry-run flag removed from deploy command"
"AuthService.refresh() signature changed"
```

### 3. Attention Frontmatter (High Precision)
Docs explicitly declare what files they depend on:
```yaml
---
jrn: ABC123
attention:
  - op: file
    path: src/auth/**/*.ts
  - op: file
    path: backend/src/router/AuthRouter.ts
    keywords: [token, oauth]
---
```

### 4. Score Fusion
For Phase 2, combines signals into one score:
```
S = explicit_match + anchor_overlap + lexical_score + semantic_score
```

## Output Buckets

| Bucket | Condition | Action |
|--------|-----------|--------|
| **Must Update** | Explicit attention match OR S >= 0.85 | Block PR / Create ticket |
| **Review** | 0.55 <= S < 0.85 | Human review |
| **Probably OK** | S < 0.55 | No action needed |

## CLI Commands

```bash
# Phase 1: Analyze code changes and update impacted documentation
jolli impact agent [options]

# Options:
  -b, --base <ref>           Base branch to diff against (auto-detects if not provided)
  -u, --uncommitted          Only analyze uncommitted changes
  -d, --docs <path>          Docs directory to scan (default: "docs")
  -y, --yes                  Auto-confirm all updates
  -n, --dry-run              Preview without making changes
  --limit <n>                Max articles to process
  -j, --json                 Output results as JSON
  --no-propagate             Skip Phase 2 (article → article propagation)
  --propagate-only           Skip Phase 1, only run Phase 2
  --max-depth <n>            Max propagation depth (default: 5)
  -v, --verbose              Enable verbose logging for debugging

# Utilities:
jolli impact extract       # Extract changesets from git diff
jolli impact search        # Search docs for impacted files using attention frontmatter
```

**Examples:**
```bash
# Run both Phase 1 and Phase 2 (default)
jolli impact agent

# Run only Phase 1 (code → articles)
jolli impact agent --no-propagate

# Run only Phase 2 (article → article) using previous Phase 1 results
jolli impact agent --propagate-only

# Limit propagation depth to 3 levels
jolli impact agent --max-depth 3

# Dry run to preview changes
jolli impact agent --dry-run
```

## Implementation Status

| Phase | Status | Features |
|-------|--------|----------|
| **Phase 1: Code → Articles** | ✅ **Complete** | `attention` frontmatter, file path watching (globs), inverted index, AI-powered article updates |
| **Phase 2: Article → Article** | ✅ **Complete** | Automatic propagation through documentation graph, cycle detection, configurable max depth |
| **Phase 3: Pull (Semantic)** | 🔄 **Planned** | BM25 + vector search, score fusion, bucketing |
| **Phase 4: Enhancements** | 🔄 **Planned** | Additional attention ops (symbols, configs), section-level granularity |
| **Phase 5: Scale** | 🔄 **Planned** | CI integration, ticket creation, LLM triage |

### What's Working Now

**Phase 1 (Code → Articles)**:
- Git diff analysis with context extraction
- Attention frontmatter matching (exact paths and globs)
- AI agent analyzes code changes and updates documentation
- Audit trail with evidence and patches

**Phase 2 (Article → Article)**:
- Automatic detection of dependent articles
- Recursive propagation through documentation graph
- Cycle detection to prevent infinite loops
- Configurable max depth (default: 5 levels)
- Combined Phase 1 + Phase 2 summary reporting

## How It Works

### Phase 1: Code → Articles

1. **Git diff analysis**: Extracts changed files and hunks from git history
2. **Attention matching**: Uses inverted index to find docs watching changed files
3. **AI analysis**: Agent reads article + code changes, decides if update needed
4. **Targeted edits**: Uses `edit_article` tool for surgical updates (not full rewrites)
5. **Audit trail**: Records what was updated, why, and the diff

### Phase 2: Article → Article Propagation

1. **Detect dependencies**: Finds articles watching the Phase 1 updated articles
2. **Build context**: Creates article-to-article change context (not code diffs)
3. **AI analysis**: Agent analyzes how source article changes affect dependent article
4. **Recursive propagation**: Continues until no more dependents or max depth reached
5. **Cycle prevention**: Tracks visited articles to prevent infinite loops

**Example:**
```yaml
# docs/guide/overview.md watches API docs
---
jrn: GUIDE_001
attention:
  - op: file
    path: docs/api/*.md
---
```

When Phase 1 updates `docs/api/auth.md`, Phase 2 automatically:
1. Detects that `docs/guide/overview.md` watches `docs/api/*.md`
2. Shows the agent the changes to `docs/api/auth.md`
3. Agent updates `docs/guide/overview.md` to reflect the API changes
4. Continues to check if any articles watch `docs/guide/overview.md`

## Documentation

- [Attention Schema](./attention-schema.md) - Frontmatter format for file watching
- [Phase 1: Push](./phase1-push.md) - High precision file matching
- [Phase 2: Pull](./phase2-pull.md) - High recall semantic search (planned)
- [Future Enhancements](./future.md) - Planned features (symbols, configs, etc.)
- [Extract Command](./extract.md) - Git diff extraction
- [Architecture (Full)](./architecture-full.md) - Detailed technical architecture

---

*See [architecture-full.md](./architecture-full.md) for the complete technical specification.*
