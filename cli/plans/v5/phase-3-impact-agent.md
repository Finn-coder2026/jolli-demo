# Phase 3: Impact Analysis Agent

Create a new agent profile that receives the impact report from `jolli impact`, analyzes which docs need updates, and makes the changes — all inside the E2B sandbox before the final `jolli sync` pushes changes back.

**Depends on:** Phase 1 (CLI in E2B), Phase 2 (Job Wiring)

## Existing State

- Agent framework: `tools/jolliagent/src/agents/Agent.ts` — provider-agnostic, supports streaming, tool use, multi-turn
- Agent factories: `tools/jolliagent/src/agents/factory.ts` — create* functions for each agent type
- Agent profiles: `tools/jolliagent/src/agents/profiles.ts` — system prompts and tool sets
- Existing article editing tools: `get_current_article`, `edit_section`, `create_section`, `delete_section`, `sync_up_article`
- Impact report format: `cli/src/client/commands/impact/Types.ts` — `ImpactReport` with commits, hunks, file changes
- Impact search: `cli/src/client/commands/impact/search.ts` — matches changed files to docs via `@attention` frontmatter
- Existing agent types: `architectureDocAgent`, `articleEditingAgent`, `codeDocsAgent`, etc.

## Design

### Agent Role

The impact analysis agent sits at step 4 of the 5-step flow:

```
1. git clone          ✓ done
2. jolli sync         ✓ docs pulled into /workspace/repo/docs/
3. jolli impact       ✓ impact report at /tmp/impact-report.json
4. ★ AGENT ★          ← reads report, reads code diffs, updates docs
5. jolli sync         ← pushes agent's edits back to server
```

The agent's job:
1. Read the impact report (JSON) from the sandbox filesystem
2. For each impacted doc, read the current doc content and the relevant code diff
3. Decide what updates are needed (if any)
4. Edit the doc files in-place on the sandbox filesystem
5. Return control so step 5 (`jolli sync`) can push the changes

### System Prompt

The agent should be focused and constrained:

```
You are a documentation maintenance agent. You receive an impact analysis report
that identifies which documentation files may be affected by recent code changes.

Your task:
1. Read the impact report to understand what code changed and which docs are affected
2. For each impacted document, read the document and the relevant code changes
3. Determine if the documentation needs updating based on the code changes
4. If updates are needed, edit the document to reflect the code changes
5. Be conservative — only update docs that are genuinely out of date

Rules:
- Do NOT add new documents, only update existing ones
- Do NOT change document structure (headings, sections) unless the code change requires it
- Keep the same writing style and tone as the existing document
- Focus on accuracy — ensure code examples, API signatures, config values match the new code
- If you're unsure whether a doc needs updating, leave it unchanged
- Write a brief summary comment at the top of each edited file describing what changed
```

### Tools Available

The agent needs filesystem tools (already exist in jolliagent) plus the impact report reader:

| Tool | Source | Purpose |
|------|--------|---------|
| `cat` | `tools/jolliagent/src/tools/tools/cat.ts` | Read files (docs, code, impact report) |
| `ls` | `tools/jolliagent/src/tools/tools/ls.ts` | List directory contents |
| `write_file` | `tools/jolliagent/src/tools/tools/write_file.ts` | Write updated doc files |
| `git_diff` | `tools/jolliagent/src/tools/tools/git_diff.ts` | View specific file diffs |
| `git_history` | `tools/jolliagent/src/tools/tools/git_history.ts` | View commit history |

No new tools are needed. The agent reads `/tmp/impact-report.json` via `cat` and writes updated docs via `write_file`.

### Agent Factory

**New file: `tools/jolliagent/src/agents/impactAnalysisAgent.ts`**

```typescript
import type { AgentOptions } from "./Agent";

export interface ImpactAnalysisAgentConfig {
  runState: RunState;
  impactReportPath: string;    // e.g., "/tmp/impact-report.json"
  docsRoot: string;            // e.g., "/workspace/repo/docs"
}

export function createImpactAnalysisAgent(config: ImpactAnalysisAgentConfig): Agent {
  // Uses: cat, ls, write_file, git_diff, git_history
  // System prompt focused on doc maintenance
  // Initial message: "Read the impact report at {path} and update affected docs"
}
```

**File: `tools/jolliagent/src/agents/factory.ts`**

Add the factory function export.

**File: `tools/jolliagent/src/agents/profiles.ts`**

Add the `impact-analysis` profile with system prompt and tool set.

### Integration with Workflow

**File: `tools/jolliagent/src/workflows.ts`**

In the `cli-impact` workflow (from Phase 2), step 4 becomes:

```typescript
{
  name: "Agent analysis",
  run_prompt: `Read the impact report at /tmp/impact-report.json.
It contains a JSON analysis of which documentation files may need updating
based on recent code changes. For each impacted document:
1. Read the document from the docs directory
2. Read the relevant code diff using git_diff
3. If the documentation is out of date, update it using write_file
4. Be conservative — only change what's actually wrong

The docs directory is at: /workspace/repo/docs/
The git repository is at: /workspace/repo/`,
}
```

Alternatively, if we want more control, we can use a dedicated agent instead of `run_prompt`:

```typescript
// In the workflow runner, detect step 4 and use the impact analysis agent
if (step.name === "Agent analysis" && workflowType === "cli-impact") {
  const agent = createImpactAnalysisAgent({
    runState,
    impactReportPath: "/tmp/impact-report.json",
    docsRoot: "/workspace/repo/docs",
  });
  // Run agent to completion
  await runAgentToCompletion(agent, history);
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `tools/jolliagent/src/agents/impactAnalysisAgent.ts` | Agent factory for impact analysis |

## Files to Modify

| File | Change |
|------|--------|
| `tools/jolliagent/src/agents/factory.ts` | Export `createImpactAnalysisAgent` |
| `tools/jolliagent/src/agents/profiles.ts` | Add `impact-analysis` profile |
| `tools/jolliagent/src/workflows.ts` | Wire impact agent into `cli-impact` workflow step 4 |

## Impact Report Format (Reference)

The `jolli impact --json` output (`cli/src/client/commands/impact/Types.ts`):

```typescript
interface ImpactReport {
  branch: string;
  base: string;
  commits: Array<{
    sha: string;
    message: string;
    hunks: Array<{
      file: string;
      startLine: number;
      lineCount: number;
      content: string;
    }>;
  }>;
}
```

The impact search output (if `jolli impact` also runs the doc matching):

```typescript
interface FileMatch {
  docPath: string;     // path to the impacted doc
  docId: string;       // JRN of the doc
  matches: Array<{
    changedFile: string;
    pattern: string;
    matchType: string;
  }>;
}
```

## Tests

- Agent creates correctly with config
- Agent reads impact report and identifies affected docs
- Agent makes conservative edits (mock LLM responses)
- Agent does not edit docs that don't need changes
- End-to-end: impact report → agent → edited files on filesystem

## Future Enhancements

- **Confidence scoring** — agent reports confidence level for each edit, low-confidence edits go to human review
- **Dry-run mode** — agent generates a diff preview without writing files
- **Multi-space** — if a push affects docs in multiple spaces, run agents in parallel
- **Feedback loop** — track which agent edits get accepted/rejected to improve prompts over time
