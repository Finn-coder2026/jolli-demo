# Implementation Prompt: Impact Agent Phase 1

## Task

Implement the `jolli impact agent` command that automatically updates documentation based on code changes. This is Phase 1 which handles **code → article** impact detection and updates.

## Reference Documents

- **Design spec**: `cli/docs/impact/agent-design.md`
- **Existing impact commands**: `cli/src/client/commands/impact.ts`
- **Agent infrastructure**: `cli/src/client/commands/agent.ts`, `cli/src/client/agent/AgentClient.ts`
- **Tool host**: `cli/src/client/commands/AgentToolHost.ts`

## Implementation Steps

### Step 1: Extend Backend Types

**File**: `backend/src/model/CollabConvo.ts`

Add to the existing file:

```typescript
export type AgentMode = "general" | "impact";

export interface ImpactContext {
  readonly article: {
    readonly path: string;
    readonly jrn: string;
  };
  readonly changes: ReadonlyArray<{
    readonly path: string;
    readonly status: "added" | "modified" | "deleted" | "renamed";
    readonly diff: string;
  }>;
  readonly commits: ReadonlyArray<{
    readonly sha: string;
    readonly message: string;
  }>;
  readonly evidence: ReadonlyArray<{
    readonly changedFile: string;
    readonly pattern: string;
    readonly matchType: "exact" | "glob";
  }>;
}
```

Extend `CliWorkspaceMetadata`:

```typescript
export interface CliWorkspaceMetadata {
  readonly workspaceRoot?: string;
  readonly toolManifest?: ToolManifest;
  readonly clientVersion?: string;
  readonly agentMode?: AgentMode;           // ADD
  readonly impactContext?: ImpactContext;   // ADD
}
```

### Step 2: Add Impact Agent System Prompt

**File**: `backend/src/router/AgentConvoRouter.ts`

Add the `buildImpactAgentSystemPrompt()` function (see design doc for full prompt text).

Modify `getOrCreateAgentEnvironment()` to select the prompt based on `metadata.agentMode`:

```typescript
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
```

### Step 3: Create Audit Trail Types and Utilities

**File**: `cli/src/client/commands/impact/AuditTrail.ts`

```typescript
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export interface ImpactAuditRecord {
  id: string;
  timestamp: string;
  source: "git" | "sync";
  trigger: {
    base?: string;
    commits: Array<{ sha: string; message: string }>;
    changedFiles: string[];
  };
  articles: Array<{
    jrn: string;
    path: string;
    status: "updated" | "unchanged" | "skipped" | "error";
    evidence: Array<{
      changedFile: string;
      pattern: string;
      matchType: "exact" | "glob";
    }>;
    patch?: string;
    reasoning?: string;
    error?: string;
  }>;
}

export interface ImpactAuditLog {
  version: 1;
  records: ImpactAuditRecord[];
}

const AUDIT_FILE = ".jolli/impact-audit.json";
const MAX_RECORDS = 50;

export async function loadAuditLog(workspaceRoot: string): Promise<ImpactAuditLog>;
export async function saveAuditRecord(workspaceRoot: string, record: ImpactAuditRecord): Promise<void>;
export function createAuditRecord(source: "git" | "sync", trigger: ImpactAuditRecord["trigger"]): ImpactAuditRecord;
```

### Step 4: Create Impact Agent Runner

**File**: `cli/src/client/commands/impact/ImpactAgentRunner.ts`

```typescript
import type { FileMatch } from "./FileMatcher";
import type { ImpactReport } from "./GitDiffParser";

export interface ImpactAgentOptions {
  base?: string;
  uncommitted: boolean;
  docsPath: string;
  autoConfirm: boolean;
  dryRun: boolean;
  limit?: number;
}

export interface ArticleResult {
  jrn: string;
  path: string;
  status: "updated" | "unchanged" | "skipped" | "error";
  patch?: string;
  reasoning?: string;
  error?: string;
}

export async function runImpactAgent(options: ImpactAgentOptions): Promise<ArticleResult[]>;
```

**Implementation outline**:

1. Call `generateImpactReport()` to get git changes
2. Call search logic (from `search.ts`) to find impacted articles
3. For each matched article:
   - If `--dry-run`, just log and skip
   - If interactive, prompt user (Update/View/Skip/Quit)
   - If proceeding:
     - Build `ImpactContext` from report and match evidence
     - Create agent conversation with `agentMode: "impact"`
     - Send first message with full diffs
     - Run agent loop (reuse from `agent.ts`)
     - Capture article before/after for patch
     - Record result
4. Write audit record
5. Return results for summary

### Step 5: Register the Command

**File**: `cli/src/client/commands/impact.ts`

Add to `registerImpactCommands()`:

```typescript
impactCommand
  .command("agent")
  .description("Run AI agent to update impacted documentation")
  .option("-b, --base <ref>", "Base branch to diff against (auto-detects if not provided)")
  .option("-u, --uncommitted", "Only analyze uncommitted changes", false)
  .option("-d, --docs <path>", "Docs directory to scan", "docs")
  .option("-y, --yes", "Auto-confirm all updates", false)
  .option("-n, --dry-run", "Preview without making changes", false)
  .option("--limit <n>", "Max articles to process", parseInt)
  .action(async (options) => {
    const results = await runImpactAgent({
      base: options.base,
      uncommitted: options.uncommitted,
      docsPath: options.docs,
      autoConfirm: options.yes,
      dryRun: options.dryRun,
      limit: options.limit,
    });
    printSummary(results);
  });
```

### Step 6: Implement Agent Loop Integration

The impact agent needs to:

1. Create a conversation via `AgentClient.createConversation()` with extended metadata
2. Send the first message containing the diffs
3. Handle streaming responses and tool calls (reuse `AgentToolHost`)
4. Detect when the agent writes the article file
5. Compute the patch (diff between original and updated)
6. Return the result

**Key integration points**:

- Reuse `AgentClient` from `cli/src/client/agent/AgentClient.ts`
- Reuse `AgentToolHost` from `cli/src/client/commands/AgentToolHost.ts`
- Reuse streaming logic from `cli/src/client/commands/agent.ts`

### Step 7: Add Tests

**File**: `cli/src/client/commands/impact/ImpactAgentRunner.test.ts`

Test cases:
- No changes detected → exits early
- No impacted docs → exits early
- Dry run mode → lists articles without processing
- Single article update flow (mock agent)
- Audit record is written correctly
- Error handling (agent failure, write failure)

**File**: `cli/src/client/commands/impact/AuditTrail.test.ts`

Test cases:
- Load empty/missing audit log
- Save and load audit record
- Retention limit (prune old records)
- Record creation with proper UUID and timestamp

### Step 8: Update AgentClient for Extended Metadata

**File**: `cli/src/client/agent/AgentClient.ts`

Ensure `createConversation()` passes the full metadata including `agentMode` and `impactContext` to the server.

## Files to Create/Modify

### New Files
- `cli/src/client/commands/impact/ImpactAgentRunner.ts`
- `cli/src/client/commands/impact/ImpactAgentRunner.test.ts`
- `cli/src/client/commands/impact/AuditTrail.ts`
- `cli/src/client/commands/impact/AuditTrail.test.ts`

### Modified Files
- `backend/src/model/CollabConvo.ts` - Add types
- `backend/src/router/AgentConvoRouter.ts` - Add prompt builder, modify env creation
- `cli/src/client/commands/impact.ts` - Register agent subcommand
- `cli/src/client/agent/AgentClient.ts` - Ensure extended metadata is passed

## Testing Strategy

1. **Unit tests**: Test audit trail, context building, dry-run logic
2. **Integration test**: Mock the agent API, verify full flow
3. **Manual test**: Run against a real repo with attention frontmatter

## Acceptance Criteria

- [ ] `jolli impact agent` runs without errors
- [ ] `jolli impact agent --dry-run` lists impacted articles without changes
- [ ] `jolli impact agent --yes` processes all articles automatically
- [ ] Interactive mode prompts for each article
- [ ] Audit trail is written to `.jolli/impact-audit.json`
- [ ] Agent receives correct system prompt with article context
- [ ] Agent can read files and write updated articles
- [ ] Patch is captured in audit record
- [ ] 100% test coverage maintained

## Notes

- Keep the frontend bundle size minimal - this is CLI-only code
- Use pino for logging with printf-style formatting
- Follow existing code patterns in the CLI
- Use TypeScript strict typing (no `any`)
- Add biome linting compliance
