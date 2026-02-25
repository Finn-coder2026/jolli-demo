# Impact Agent Phase 2: Article-to-Article Propagation

## Overview

Phase 2 extends the impact agent to handle **article-to-article dependencies**. After Phase 1 updates articles based on code changes, Phase 2 detects which articles depend on the updated articles and propagates changes through the documentation graph.

**Prerequisite**: [Phase 1: Code-to-Article Impact](./agent-design.md)

---

## The Cascade Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Full Impact Cascade                               │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: Code → Articles (git-based)
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Git diff     │ ──▶ │ attention:      │ ──▶ │ Agent updates    │
│ (code files) │     │ code → article  │     │ Article A, B     │
└──────────────┘     └─────────────────┘     └──────────────────┘
                                                      │
                                                      ▼
Phase 2: Articles → Articles (Jolli sync-based)
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Sync diff    │ ──▶ │ attention:      │ ──▶ │ Agent updates    │
│ (Article A,B)│     │ article → article│    │ Article C, D     │
└──────────────┘     └─────────────────┘     └──────────────────┘
                                                      │
                                                      ▼
                                              (repeat until stable)
```

**Example scenario:**
1. `src/auth/login.ts` changes (code)
2. Phase 1: `docs/auth/api-reference.md` watches that file → gets updated
3. Phase 2: `docs/getting-started/quick-start.md` watches `docs/auth/api-reference.md` → gets updated
4. Phase 2 continues until no more articles are impacted

---

## Input Source: Audit Trail

Phase 1 produces an **audit trail** (see [Phase 1: Audit Trail](./agent-design.md#audit-trail)) that Phase 2 consumes.

### What the Audit Trail Provides

After Phase 1 completes, the audit record contains:
- Which articles were updated
- The patch (diff) of what changed in each article
- Evidence of why each article was flagged
- Agent reasoning for the changes

```typescript
// From .jolli/impact-audit.json
interface ImpactAuditRecord {
  source: "git" | "sync";
  articles: Array<{
    jrn: string;
    path: string;
    status: "updated" | "unchanged" | "skipped" | "error";
    evidence: FileMatchEvidence[];
    patch?: string;  // What changed in the article
  }>;
}
```

### Phase 2 Reads Updated Articles

```typescript
function getPhase1Updates(auditLog: ImpactAuditLog): ArticleChange[] {
  const lastRecord = auditLog.records[auditLog.records.length - 1];
  if (lastRecord.source !== "git") {
    return []; // Only propagate from Phase 1 (git-based) runs
  }
  return lastRecord.articles
    .filter(a => a.status === "updated")
    .map(a => ({
      path: a.path,
      jrn: a.jrn,
      diff: a.patch,
    }));
}
```

This becomes the input for Phase 2's attention matching - we look for articles that watch the articles that Phase 1 updated.

---

## Article-to-Article Attention

Articles can declare dependencies on other articles using the same `attention` frontmatter:

```yaml
---
jrn: QUICKSTART_001
attention:
  # Watch source code (Phase 1)
  - op: file
    path: src/auth/**/*.ts

  # Watch other articles (Phase 2)
  - op: file
    path: docs/auth/api-reference.md
  - op: file
    path: docs/auth/*.md
---
# Quick Start Guide

This guide references the [API Reference](../auth/api-reference.md)...
```

**Key insight**: The `op: file` operation already works for any file path, including markdown files. No schema changes needed.

---

## Phase 2 Flow

```typescript
// After Phase 1 completes...

async function runPhase2(auditLog: ImpactAuditLog, docsPath: string): Promise<void> {
  // Get updated articles from Phase 1 audit trail
  const phase1Updates = getPhase1Updates(auditLog);

  if (phase1Updates.length === 0) {
    console.log("No articles updated in Phase 1, skipping Phase 2");
    return;
  }

  const changedArticlePaths = phase1Updates.map(u => u.path);

  // Search for articles that watch the updated articles
  const matches = matchFiles(changedArticlePaths, attentionIndex);

  // Filter out self-references and already-processed articles
  const filteredMatches = matches.filter(m =>
    !changedArticlePaths.includes(m.docPath)
  );

  if (filteredMatches.length === 0) {
    console.log("No dependent articles found");
    return;
  }

  // Run agent for each dependent article
  for (const match of filteredMatches) {
    // Find which Phase 1 updates triggered this match
    const triggeringUpdates = phase1Updates.filter(u =>
      match.matches.some(e => e.changedFile === u.path)
    );

    const context: ImpactContext = {
      article: { path: match.docPath, jrn: match.docId },
      changes: triggeringUpdates.map(u => ({
        path: u.path,
        status: "modified" as const,
        diff: u.diff || "",
      })),
      commits: [], // No git commits for article changes
      evidence: match.matches,
    };

    await runArticleAgent(context);
  }

  // Write Phase 2 audit record (source: "sync")
  // Then recursively check for further propagation
  // (with cycle detection to prevent infinite loops)
}
```

---

## Cycle Detection

Article dependencies can form cycles:
- Article A watches Article B
- Article B watches Article A

The agent must detect and break cycles:

```typescript
interface PropagationState {
  visited: Set<string>;  // JRNs already processed in this cascade
  depth: number;         // Current recursion depth
  maxDepth: number;      // Safety limit (default: 5)
}

function shouldProcess(jrn: string, state: PropagationState): boolean {
  if (state.visited.has(jrn)) {
    console.warn(`Cycle detected: ${jrn} already processed, skipping`);
    return false;
  }
  if (state.depth >= state.maxDepth) {
    console.warn(`Max depth ${state.maxDepth} reached, stopping propagation`);
    return false;
  }
  return true;
}
```

---

## Command Interface

Phase 2 runs automatically after Phase 1 (unless disabled):

```bash
# Full cascade (Phase 1 + Phase 2)
jolli impact agent

# Phase 1 only (no propagation)
jolli impact agent --no-propagate

# Phase 2 only (after manual sync)
jolli impact agent --propagate-only
```

### New Options

| Option | Description | Default |
|--------|-------------|---------|
| `--no-propagate` | Skip Phase 2, only run code → article | `false` |
| `--propagate-only` | Skip Phase 1, only run article → article | `false` |
| `--max-depth <n>` | Max propagation depth | `5` |

---

## Server-Side Changes

The same `ImpactContext` structure works for Phase 2. The server doesn't need to know whether the changes are from git or sync - it just receives:

- Article path and JRN
- List of changes (file paths + diffs)
- Evidence (which attention rules matched)

The system prompt mentions "code changes" but works equally well for "article changes". We may want to make the prompt more generic:

```typescript
// Instead of "Code Changes", use "Source Changes"
// The agent understands from context whether it's code or articles
```

---

## Stored Git Checkpoint (Future)

Currently, Phase 1 requires `--base` to know where to diff from. Future enhancement:

```typescript
// .jolli/impact-checkpoint.json
{
  "lastProcessedCommit": "abc1234",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

With this, the command becomes simpler:

```bash
# Before (explicit base)
jolli impact agent --base origin/main

# After (automatic checkpoint)
jolli impact agent  # Diffs from last processed commit
```

After successful processing, the checkpoint updates to HEAD.

---

## Implementation Plan

### Phase 2 Files

```
cli/src/client/commands/impact/
├── propagate.ts         # Phase 2 propagation logic
├── CycleDetector.ts     # Cycle detection for article graph
└── propagate.test.ts    # Tests
```

### Integration with Sync

```
cli/src/client/commands/
├── sync.ts              # Existing sync command
└── impact/
    └── agent.ts         # Import sync diff after Phase 1
```

### Key Functions

```typescript
// propagate.ts
export interface PropagationResult {
  articlesUpdated: string[];
  cyclesDetected: string[];
  maxDepthReached: boolean;
}

export async function runPropagation(
  syncDiff: SyncDiff,
  docsPath: string,
  options: { maxDepth: number },
): Promise<PropagationResult>;

// CycleDetector.ts
export class CycleDetector {
  markVisited(jrn: string): void;
  hasVisited(jrn: string): boolean;
  getPath(): string[];  // For error reporting
}
```

---

## Example Full Run

```
$ jolli impact agent

═══════════════════════════════════════════════════════════════
Phase 1: Code → Articles
═══════════════════════════════════════════════════════════════

Analyzing git changes from origin/main...
Found 2 commits, 3 files changed

Scanning docs for impacted articles...
Found 1 impacted article

Processing docs/auth/api-reference.md (AUTH_API_001)...
  ✓ Updated (added new refreshToken parameter)

Syncing updated articles to Jolli...
  ✓ Pushed docs/auth/api-reference.md

═══════════════════════════════════════════════════════════════
Phase 2: Article → Article Propagation
═══════════════════════════════════════════════════════════════

Checking for dependent articles...
Found 2 articles watching updated articles

Processing docs/getting-started/quick-start.md (QUICKSTART_001)...
  ✓ Updated (updated auth example to include refreshToken)

Processing docs/tutorials/auth-flow.md (AUTH_TUTORIAL_001)...
  ○ No update needed (tutorial focuses on basic flow, not refresh tokens)

Syncing propagated changes...
  ✓ Pushed docs/getting-started/quick-start.md

Checking for further propagation (depth 2)...
  No additional dependent articles found

═══════════════════════════════════════════════════════════════
Summary
═══════════════════════════════════════════════════════════════
Phase 1: 1 article updated
Phase 2: 1 article updated, 1 unchanged
Total:   2 articles updated
```

---

## Future Enhancements

1. **Dependency graph visualization**: Show article dependency graph with `jolli impact graph`
2. **Selective propagation**: Allow user to approve/skip each propagation step
3. **Rollback**: Undo propagated changes if something goes wrong
4. **Notifications**: Alert doc owners when their articles are auto-updated
5. **Confidence scoring**: Rate how confident the agent is about each update
