---
jrn: MKYZPUMSIUATUSNT
attention:
  - op: file
    path: cli/src/client/commands/impact/ImpactAgentRunner.ts
  - op: file
    path: cli/src/client/commands/impact/ImpactContextBuilder.ts
  - op: file
    path: cli/src/client/agent/AgentClient.ts
  - op: file
    path: backend/src/router/AgentConvoRouter.ts
---
# Impact Agent Command Design

## Overview

`jolli impact agent` automates documentation updates by combining impact analysis with an AI agent. It runs the extract → search pipeline, then spawns an agent for each impacted article to analyze changes and update the documentation accordingly.

---

## Server-Side Changes

The agent system prompt lives on the **server** (`AgentConvoRouter.ts`), not the CLI. We need to:

1. **Extend `CliWorkspaceMetadata`** to include agent mode and impact context
2. **Add a new system prompt builder** for impact agent sessions
3. **Select prompt based on metadata** when creating the agent environment

### 1. Extend CliWorkspaceMetadata

```typescript
// backend/src/model/CollabConvo.ts

export type AgentMode = "general" | "impact";

export interface ImpactContext {
  article: {
    path: string;
    jrn: string;
  };
  changes: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    diff: string;  // Unified diff content
  }>;
  commits: Array<{
    sha: string;
    message: string;
  }>;
  evidence: Array<{
    changedFile: string;
    pattern: string;
    matchType: "exact" | "glob";
  }>;
}

export interface CliWorkspaceMetadata {
  readonly workspaceRoot?: string;
  readonly toolManifest?: ToolManifest;
  readonly clientVersion?: string;
  readonly agentMode?: AgentMode;           // NEW
  readonly impactContext?: ImpactContext;   // NEW (only when agentMode === "impact")
}
```

### 2. Add Impact Agent System Prompt

```typescript
// backend/src/router/AgentConvoRouter.ts

function buildImpactAgentSystemPrompt(
  workspaceRoot: string | undefined,
  toolManifest: ToolManifest | undefined,
  context: ImpactContext,
): string {
  const toolDescriptions = toolManifest?.tools
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n") || "No tools available.";

  const changedFiles = context.changes
    .map(c => `- ${c.path} (${c.status})`)
    .join("\n");

  const commits = context.commits
    .map(c => `- ${c.sha.slice(0, 7)}: ${c.message}`)
    .join("\n");

  const evidence = context.evidence
    .map(e => `- ${e.changedFile} matched ${e.pattern} (${e.matchType})`)
    .join("\n");

  return `You are a documentation update agent. Your task is to update a documentation article based on recent code changes.

**Workspace:** ${workspaceRoot || "Unknown"}

## Your Mission

1. **Read the article** at \`${context.article.path}\`
2. **Analyze the code changes** provided below
3. **Determine impact** on the documentation
4. **Update the article** if needed, or explain why no update is necessary

## Article to Update

- **Path:** ${context.article.path}
- **JRN:** ${context.article.jrn}

## Why This Article Was Flagged

This article declares dependencies on source files via \`attention\` frontmatter. It was flagged because:
${evidence}

## Code Changes

**Commits:**
${commits}

**Changed Files:**
${changedFiles}

The full diffs will be provided in the first message.

## Guidelines

1. **Be conservative** - Only update what's necessary. Don't rewrite unrelated sections.
2. **Preserve style** - Match the existing writing style, tone, and formatting.
3. **Update examples** - If code examples reference changed APIs/signatures, update them.
4. **Update descriptions** - If behavior changed, update the explanation.
5. **Preserve frontmatter** - Keep the \`jrn\` and \`attention\` fields intact.
6. **No update needed?** - If changes don't affect the doc content, explain why.

## Available Tools

${toolDescriptions}

Use \`read_file\` to read the article and source files for context.
Use \`write_file\` to update the article when ready.
Use \`grep\` and \`find\` if you need to explore how changed code is used.

## Output

After analysis, either:
1. Use \`write_file\` to update the article
2. Explain why no update is needed

Always explain your reasoning before making changes.`;
}
```

### 3. Select Prompt Based on Mode

```typescript
// backend/src/router/AgentConvoRouter.ts

async function getOrCreateAgentEnvironment(
  convoId: number,
  metadata: CliWorkspaceMetadata | null,
): Promise<AgentEnvironment> {
  let env = agentEnvironments.get(convoId);
  if (env) {
    return env;
  }

  // Select system prompt based on agent mode
  let systemPrompt: string;
  if (metadata?.agentMode === "impact" && metadata.impactContext) {
    systemPrompt = buildImpactAgentSystemPrompt(
      metadata.workspaceRoot,
      metadata.toolManifest,
      metadata.impactContext,
    );
  } else {
    systemPrompt = buildCliAgentSystemPrompt(
      metadata?.workspaceRoot,
      metadata?.toolManifest,
    );
  }

  // Convert CLI tool manifest to ToolDef format so Claude can make proper tool_use calls
  const clientTools = convertToolManifestToToolDefs(metadata?.toolManifest);

  env = await createAgentEnvironment({
    toolPreset: "custom",
    customTools: clientTools,  // Provide tool definitions for Claude
    useE2B: false,
    systemPrompt,
  });

  agentEnvironments.set(convoId, env);
  return env;
}

function convertToolManifestToToolDefs(toolManifest: ToolManifest | undefined): Array<ToolDef> {
  if (!toolManifest || toolManifest.tools.length === 0) {
    return [];
  }
  return toolManifest.tools.map(entry => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.inputSchema,
  }));
}
```

---

## Command Interface

```bash
jolli impact agent [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-b, --base <ref>` | Base branch to diff against | Auto-detect |
| `-u, --uncommitted` | Only analyze uncommitted changes | `false` |
| `-d, --docs <path>` | Docs directory to scan | `"docs"` |
| `-y, --yes` | Auto-confirm all updates (no prompts) | `false` |
| `-n, --dry-run` | Show what would be updated without making changes | `false` |
| `--limit <n>` | Max articles to process (useful for testing) | No limit |
| `-j, --json` | Output results as JSON | `false` |
| `--no-propagate` | Skip Phase 2 (article-to-article propagation) | `false` |
| `--propagate-only` | Skip Phase 1, only run Phase 2 from audit trail | `false` |
| `--max-depth <n>` | Max propagation depth for Phase 2 | `5` |
| `--verbose` | Enable verbose logging for debugging | `false` |

### Examples

```bash
# Interactive mode - prompts for each article
jolli impact agent

# Auto-confirm all updates (both Phase 1 and Phase 2)
jolli impact agent --yes

# Preview what would be updated
jolli impact agent --dry-run

# Only process uncommitted changes
jolli impact agent --uncommitted

# Limit to 3 articles for testing
jolli impact agent --limit 3

# Run Phase 1 only (skip article-to-article propagation)
jolli impact agent --no-propagate

# Run Phase 2 only (using previous Phase 1 results from audit trail)
jolli impact agent --propagate-only

# Limit propagation depth to 3 levels
jolli impact agent --max-depth 3
```

---

## Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        jolli impact agent                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. EXTRACT: Get changesets from git                                │
│     - Commits between base..HEAD (or uncommitted)                   │
│     - File changes with hunks and context                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. SEARCH: Find impacted docs via attention frontmatter            │
│     - Build attention index from docs                               │
│     - Match changed files against index                             │
│     - Return list of (doc, evidence) pairs                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. AGENT LOOP: For each impacted article                           │
│     ┌─────────────────────────────────────────────────────────────┐ │
│     │  a. Show article + matched files to user                    │ │
│     │  b. Prompt: Skip / Update / View diff first                 │ │
│     │  c. If Update:                                              │ │
│     │     - Spawn agent with article context                      │ │
│     │     - Agent reads article, analyzes changes                 │ │
│     │     - Agent proposes updates (or explores further)          │ │
│     │     - Show diff to user                                     │ │
│     │     - Confirm write                                         │ │
│     └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. SUMMARY: Report what was updated                                │
│     - Articles updated: N                                           │
│     - Articles skipped: M                                           │
│     - Articles unchanged (no update needed): K                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```typescript
// Step 1: Extract
const report: ImpactReport = await generateImpactReport(base, uncommitted);

// Step 2: Search
const matches: FileMatch[] = await runSearch(report, docsPath);

// Step 3: Agent loop - one conversation per article
for (const match of matches) {
  // Build impact context for server
  const impactContext: ImpactContext = {
    article: {
      path: match.docPath,
      jrn: match.docId,
    },
    changes: extractRelevantChanges(report, match.matches),
    commits: report.commits.map(c => ({ sha: c.sha, message: c.message })),
    evidence: match.matches,
  };

  // Create conversation with impact mode metadata
  const convo = await agentClient.createConversation({
    workspaceRoot: process.cwd(),
    toolManifest: getToolManifest(),
    clientVersion: CLIENT_VERSION,
    agentMode: "impact",           // Tells server to use impact prompt
    impactContext,                 // Context for the system prompt
  });

  // Send first message with full diffs
  const diffs = formatDiffsForMessage(impactContext.changes);
  await agentClient.sendMessage(convo.id, `Here are the code changes:\n\n${diffs}`);

  // Agent loop continues with tool calls...
  const result = await runAgentLoop(convo.id);
}
```

---

## Agent Tools

The agent reuses the existing tool host with a subset of tools:

| Tool | Purpose |
|------|---------|
| `read_file` | Read article and source files |
| `edit_article` | Make targeted edits to articles (preferred) |
| `write_file` | Update the article (fallback) |
| `grep` | Search for usage patterns |
| `find` | Find related files |
| `ls` | Explore directory structure |

**Preferred tool**: The agent is instructed to use `edit_article` for documentation updates as it provides better tracking of what changed and why. Each edit includes a `reason` field that explains the change.

**Not included**: `rm`, `shell`, `git_*` (read-only exploration + article write only)

---

## User Interaction Flow

### Interactive Mode (default)

```
$ jolli impact agent

Analyzing changes from origin/main...
Found 3 commits, 5 files changed

Scanning docs for impacted articles...
Found 2 impacted articles

─────────────────────────────────────────────────────────────
Article 1/2: docs/auth/guide.md (AUTH_GUIDE_001)
─────────────────────────────────────────────────────────────
Matched by:
  • src/auth/login.ts matched src/auth/**/*.ts (glob)
  • src/auth/oauth.ts matched src/auth/**/*.ts (glob)

Changes:
  • src/auth/login.ts: Added refreshToken parameter to login()
  • src/auth/oauth.ts: New file (OAuth2 support)

What would you like to do?
  [u] Update - Run agent to analyze and update
  [v] View   - Show the full diff first
  [s] Skip   - Skip this article
  [q] Quit   - Exit without processing remaining

> u

Agent analyzing article...
  Reading docs/auth/guide.md...
  Analyzing 2 changed files...
  Reading src/auth/login.ts for context...

Agent proposes the following update:

┌─ diff ──────────────────────────────────────────────────────
│ @@ -45,7 +45,8 @@ The login function accepts:
│
│  | Parameter | Type | Description |
│  |-----------|------|-------------|
│ -| username  | string | User's username |
│ +| username  | string | User's username or email |
│ +| refreshToken | boolean | Whether to return a refresh token |
│  | password  | string | User's password |
│
│ +## OAuth2 Support
│ +
│ +As of v2.3, the auth module supports OAuth2...
└─────────────────────────────────────────────────────────────

Apply this update? [y/n/e(dit manually)] > y

✓ Updated docs/auth/guide.md

─────────────────────────────────────────────────────────────
Article 2/2: docs/config.md (CONFIG_DOC_002)
─────────────────────────────────────────────────────────────
...
```

### Auto Mode (`--yes`)

```
$ jolli impact agent --yes

Analyzing changes from origin/main...
Found 3 commits, 5 files changed

Scanning docs for impacted articles...
Found 2 impacted articles

Processing docs/auth/guide.md (AUTH_GUIDE_001)...
  ✓ Updated (added OAuth2 section, updated login parameters)

Processing docs/config.md (CONFIG_DOC_002)...
  ○ No update needed (changes don't affect documented behavior)

─────────────────────────────────────────────────────────────
Summary
─────────────────────────────────────────────────────────────
  Updated:   1
  Unchanged: 1
  Skipped:   0
  Errors:    0
```

### Dry Run Mode (`--dry-run`)

```
$ jolli impact agent --dry-run

Analyzing changes from origin/main...
Found 3 commits, 5 files changed

Scanning docs for impacted articles...
Found 2 impacted articles

[DRY RUN] Would process:

1. docs/auth/guide.md (AUTH_GUIDE_001)
   Matched by: src/auth/login.ts, src/auth/oauth.ts

2. docs/config.md (CONFIG_DOC_002)
   Matched by: src/config/auth.ts

Run without --dry-run to process these articles.
```

---

## Implementation Plan

### Server-Side Files (Backend)

```
backend/src/
├── model/CollabConvo.ts           # Extend CliWorkspaceMetadata with agentMode + impactContext
└── router/AgentConvoRouter.ts     # Add buildImpactAgentSystemPrompt(), update getOrCreateAgentEnvironment()
```

### CLI-Side Files

```
cli/src/client/commands/impact/
├── agent.ts              # Command registration and REPL
├── AgentRunner.ts        # Agent execution logic (create convo, run loop)
├── ImpactContext.ts      # Build ImpactContext from report + matches
└── agent.test.ts         # Tests

cli/src/client/agent/
└── AgentClient.ts        # Update to accept agentMode + impactContext in metadata
```

### Key Functions

```typescript
// agent.ts - Command registration
export function registerImpactAgentCommand(impactCommand: Command): void;

// AgentRunner.ts - Core logic
export interface ImpactAgentOptions {
  base?: string;
  uncommitted: boolean;
  docsPath: string;
  autoConfirm: boolean;
  dryRun: boolean;
  limit?: number;
  json: boolean;
  propagate: boolean;        // Run Phase 2 after Phase 1
  propagateOnly: boolean;    // Skip Phase 1, only run Phase 2
  maxDepth: number;          // Max propagation depth
  verbose: boolean;          // Enable verbose logging
}

export interface ArticleResult {
  jrn: string;
  path: string;
  status: 'updated' | 'unchanged' | 'skipped' | 'error';
  patch?: string;
  reasoning?: string;
  error?: string;
  editReasons?: ReadonlyArray<string>;  // Reasons from edit_article tool
}

export interface ImpactAgentRunResult {
  results: ReadonlyArray<ArticleResult>;
  auditRecordId: string;
  phase1Results?: ReadonlyArray<ArticleResult>;
  phase2Results?: ReadonlyArray<ArticleResult>;
  propagationResult?: PropagationResult;
}

export async function runImpactAgent(options: ImpactAgentOptions): Promise<ImpactAgentRunResult>;

// ImpactContextBuilder.ts - Build context for agent
export function buildImpactContext(
  article: FileMatch,
  report: ImpactReport,
): ImpactContext;

export function buildPropagationContext(
  articlePath: string,
  articleJrn: string,
  triggeringArticles: ReadonlyArray<{ path: string; jrn: string; diff: string | undefined }>,
  evidence: ReadonlyArray<EvidenceContext>,
): ImpactContext;

export function buildInitialMessage(context: ImpactContext): string;
```

### Integration Points

**CLI-side:**
1. **Reuse `generateImpactReport()`** from `GitDiffParser.ts`
2. **Reuse `runSearch()` logic** from `search.ts`
3. **Reuse `AgentToolHost`** with restricted tool set
4. **Extend `AgentClient`** to pass `agentMode` + `impactContext` in metadata

**Server-side:**
5. **Extend `CliWorkspaceMetadata`** in `CollabConvo.ts`
6. **Add `buildImpactAgentSystemPrompt()`** in `AgentConvoRouter.ts`
7. **Update `getOrCreateAgentEnvironment()`** to select prompt based on mode

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No changes detected | Exit early with message |
| No impacted docs | Exit early with message |
| Agent fails to respond | Retry once, then skip with error |
| Write fails | Report error, continue to next article |
| User Ctrl+C | Graceful exit, show partial summary |

---

## Audit Trail

Each impact agent run produces an audit record stored locally. This enables:
- **Phase 2** to know which articles changed and why
- **Debugging** when something goes wrong
- **Future**: Jolli commit messages with full context

### Audit File Location

```
.jolli/impact-audit.json
```

### Audit Record Schema

```typescript
interface ImpactAuditRecord {
  id: string;                    // UUID for this record
  timestamp: string;             // ISO 8601
  source: "git" | "sync";        // Phase 1 = git, Phase 2 = sync

  // What triggered the run
  trigger: {
    base?: string;               // Git base ref (Phase 1)
    commits: Array<{
      sha: string;
      message: string;
    }>;
    changedFiles: string[];      // Files that changed
  };

  // Results per article
  articles: Array<{
    jrn: string;
    path: string;
    status: "updated" | "unchanged" | "skipped" | "error";

    // Why this article was flagged
    evidence: Array<{
      changedFile: string;
      pattern: string;
      matchType: "exact" | "glob";
    }>;

    // What changed (only if status === "updated")
    patch?: string;              // Unified diff of article changes

    // Agent reasoning (optional, for debugging)
    reasoning?: string;

    // Edit reasons from edit_article tool (optional)
    editReasons?: ReadonlyArray<string>;

    // Error details (only if status === "error")
    error?: string;
  }>;
}

interface ImpactAuditLog {
  version: 1;
  records: ImpactAuditRecord[];
}
```

### Example Audit Record

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z",
  "source": "git",
  "trigger": {
    "base": "origin/main",
    "commits": [
      { "sha": "abc1234", "message": "Add OAuth2 support" }
    ],
    "changedFiles": ["src/auth/login.ts", "src/auth/oauth.ts"]
  },
  "articles": [
    {
      "jrn": "AUTH_GUIDE_001",
      "path": "docs/auth/guide.md",
      "status": "updated",
      "evidence": [
        {
          "changedFile": "src/auth/login.ts",
          "pattern": "src/auth/**/*.ts",
          "matchType": "glob"
        }
      ],
      "patch": "@@ -45,7 +45,8 @@\n-| username | string |\n+| username | string | User's username or email |",
      "reasoning": "Added refreshToken parameter documentation and new OAuth2 section",
      "editReasons": [
        "Updated login function signature to include refreshToken parameter",
        "Added OAuth2 support section based on new oauth.ts module"
      ]
    }
  ]
}
```

### Usage by Phase 2

Phase 2 reads the audit log to find articles updated in Phase 1:

```typescript
function getRecentlyUpdatedArticles(auditLog: ImpactAuditLog): string[] {
  const lastRecord = auditLog.records[auditLog.records.length - 1];
  return lastRecord.articles
    .filter(a => a.status === "updated")
    .map(a => a.path);
}
```

### Retention

- Keep last 50 records (configurable via `--audit-limit`)
- Old records are pruned on each run
- Use `jolli impact audit` to view/clear audit history (future)

---

## Future Enhancements

1. **Batch mode**: Process all articles in parallel (with `--parallel` flag)
2. **Review mode**: Generate PR with all changes for human review
3. **Undo support**: Keep backup of original articles
4. **Learning**: Track which updates were accepted/rejected to improve prompts
5. **Custom prompts**: Allow project-specific agent instructions via config

---

## See Also

- **[Phase 2: Article-to-Article Propagation](./agent-phase2-design.md)** - Extends impact agent to handle cascading updates when articles depend on other articles
