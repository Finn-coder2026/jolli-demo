# Phase 3 Follow-up: Impact Workflow Hardening

Follow-up work after Phase 2 (`cli-impact` job wiring) to make the impact workflow robust for production use.

**Depends on:** Phase 2 (Job Wiring)

## Context

Phase 2 added:
- Space source matching in `JobsToJrnAdapter`
- `knowledge-graph:cli-impact` job in backend
- A fixed 5-step `cli-impact` workflow in jolliagent:
  1. clone repo
  2. `jolli sync`
  3. `jolli impact`
  4. analysis step
  5. `jolli sync`

The current step 4 is intentionally minimal and should be upgraded in Phase 3.

## Follow-up Scope

### 1. Dedicated Impact Analysis Agent

Replace the generic step-4 prompt with a dedicated impact agent profile.

**Files**
- `tools/jolliagent/src/agents/profiles.ts`
- `tools/jolliagent/src/agents/factory.ts`
- `tools/jolliagent/src/workflows.ts`
- `tools/jolliagent/src/agents/impactAnalysisAgent.ts` (new)

**Requirements**
- Add an `impact-analysis` profile with focused instructions and conservative edit rules.
- Keep edits scoped to affected docs only.
- Use existing tooling (`cat`, `ls`, `git_diff`, `write_file`) unless a clear gap is found.
- Keep the workflow contract unchanged (`cli-impact` still uses existing env injection and 5-step flow).

### 2. Structured Impact Artifact Handling

Persist useful outputs from `/tmp/impact-report.json` and step execution in backend job records.

**Files**
- `backend/src/jobs/KnowledgeGraphJobs.ts`
- `backend/src/jobs/KnowledgeGraphJobs.test.ts`

**Requirements**
- Capture a concise summary of impact results in job stats/logs.
- Surface parse/fetch failures clearly without breaking cleanup behavior.
- Keep tokens/secrets out of persisted artifacts.

### 3. End-to-End Coverage for Push -> Space -> CLI Impact

Add integration-style coverage for the full handoff chain.

**Files**
- `backend/src/jobs/JobsToJrnAdapter.test.ts`
- `backend/src/jobs/KnowledgeGraphJobs.test.ts`
- optional higher-level job scheduler integration test file

**Requirements**
- Verify GitHub push event can trigger `knowledge-graph:cli-impact` via space source matching.
- Verify handler wiring produces expected workflow args/env context.
- Verify repo mismatch protection and failure path remain enforced.

~~### 4. Run-Level Idempotency, Locking, and Stale-Event Guards~~

Moved to v4 Phase 5 (Hardening + Migration).

## Non-Goals

- Changing Phase 2 trigger semantics.
- Refactoring unrelated job infrastructure.
- Broad prompt/agent redesign beyond impact workflow needs.

## Acceptance Criteria

- `cli-impact` uses a dedicated impact-analysis profile (not a generic inline prompt).
- Backend job output includes structured, non-sensitive impact summary data.
- Tests cover success and critical failure paths for the full Phase 2 -> Phase 3 flow.
- Existing builds and touched test suites pass.
