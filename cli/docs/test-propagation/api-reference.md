---
jrn: TEST_API_001
attention:
  - op: file
    path: cli/src/client/commands/impact/ImpactAgentRunner.ts
  - op: file
    path: cli/src/client/commands/impact/Propagation.ts
---

# Impact Agent API Reference

This document describes the API for the impact agent.

## Types

### `ArticleResult`

Result of processing a single article.

**Properties:**

- `jrn: string` - Article identifier.
- `path: string` - Article path.
- `status: "updated" | "unchanged" | "skipped" | "error"` - Processing status.
- `patch?: string` - Diff if article was updated.
- `reasoning?: string` - Agent's reasoning.
- `error?: string` - Error message if status is "error".
- `editReasons?: ReadonlyArray<string>` - Reasons for each edit made (from edit_article tool).

### `ImpactAgentOptions`

Configuration options for running the impact agent.

**Properties:**

- `base?: string` - Git base reference. If not provided, auto-detects.
- `uncommitted: boolean` - If `true`, analyze uncommitted changes.
- `docsPath: string` - Path to documentation directory.
- `autoConfirm: boolean` - If `true`, skip prompts.
- `dryRun: boolean` - If `true`, preview without changes.
- `limit?: number` - Maximum articles to process.
- `json: boolean` - If `true`, output JSON.
- `propagate: boolean` - Run Phase 2 after Phase 1 (default: true).
- `propagateOnly: boolean` - Skip Phase 1, only run Phase 2.
- `maxDepth: number` - Max propagation depth (default: 5).
- `verbose: boolean` - Enable verbose logging for debugging (default: false).

Total: 11 options.

### `ImpactAgentRunResult`

Result of the impact agent run.

**Properties:**

- `results: ReadonlyArray<ArticleResult>` - All processed articles (Phase 1 + Phase 2).
- `auditRecordId: string` - ID of the audit record.
- `phase1Results?: ReadonlyArray<ArticleResult>` - Results from Phase 1 (code → articles).
- `phase2Results?: ReadonlyArray<ArticleResult>` - Results from Phase 2 (article → article propagation).
- `propagationResult?: PropagationResult` - Details about the propagation process.

### `PropagationResult`

Result of Phase 2 propagation process.

**Properties:**

- `articlesUpdated: ReadonlyArray<string>` - Articles updated in Phase 2.
- `articlesUnchanged: ReadonlyArray<string>` - Articles that didn't need updates.
- `articlesSkipped: ReadonlyArray<string>` - Articles skipped.
- `articlesError: ReadonlyArray<string>` - Articles with errors.
- `cyclesDetected: ReadonlyArray<string>` - Articles skipped due to cycles.
- `maxDepthReached: boolean` - Whether max depth was reached.
- `depth: number` - Final propagation depth reached.

### `Phase1Update`

Represents an article update from Phase 1 that can trigger Phase 2 propagation.

**Properties:**

- `path: string` - Article path.
- `jrn: string` - Article identifier.
- `diff: string | undefined` - Diff of the update.

### `DependentArticleMatch`

Match result for an article that depends on updated articles.

**Properties:**

- `docPath: string` - Article path.
- `docId: string` - Article identifier.
- `triggeringArticles: ReadonlyArray<Phase1Update>` - Articles that triggered this match.
- `evidence: ReadonlyArray<{changedFile: string, pattern: string, matchType: "exact" | "glob"}>` - Evidence of the match.

## CLI Usage

```bash
jolli impact agent -d docs -y
```
