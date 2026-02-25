# JOLLI-537 Worklog

## Scope
Track back-and-forth implementation and planning work for tool improvements, with:
- completed items reflected in `done/`
- remaining items tracked in `tools/jolliagent/docs/plans/tool-improvements-v0/`

## Source of Truth
- Completed baseline plan: `done/tool-improvements.md`
- Active/pending plans:
  - `article-bootstrap-tool.md`
  - `synced-article-agent-plan.md`
  - `code-review-fixes.md`

## Timeline (Back-and-Forth Log)

### 1) Tooling parity planning and implementation
- Added/expanded git tooling for agent workflows (status/log/show/changed-files + diff/history improvements).
- Added plan documentation and contract alignment notes for CLI and E2B parity.
- Captured follow-up review findings in `code-review-fixes.md`.

### 2) Collab router tool contract changes
- Confirmed web article flow uses `CollabConvoRouter`.
- Removed `create_article` from collab tool list and prompt path (moved web flow toward section/targeted editing + frontmatter upsert).
- Updated collab router tests accordingly.

### 3) Linear tool removal
- Removed `get_latest_linear_tickets` from collab router.
- Removed the tool implementation and all repository references:
  - adapter + adapter tests
  - KnowledgeGraphJobs wiring + tests
  - collab router wiring + tests
  - residual documentation/example references

### 4) Frontmatter attention prompt clarification
- Expanded collab system prompt with explicit rationale for `attention`:
  - dependency mapping for source-driven sections
  - future impact detection when source files change
  - required update behavior via `upsert_frontmatter`

### 5) Web frontmatter persistence/debug follow-up
- Investigated `upsert_frontmatter` save path: backend tool writes draft via `updateDocDraft`.
- Identified UI mismatch: SSE diffs were being applied to article body only while backend diffs are generated from full draft content (frontmatter + body).
- Updated `ArticleDraft` diff application to apply diffs to combined content, then re-split into brain/frontmatter + article body state.

## What Is Done
- Baseline completed plan has been archived in `done/tool-improvements.md`.
- Major contract and router cleanup decisions from this cycle are implemented and reflected in code and tests.

## What Still Needs To Be Done
Use these documents as the active queue:
- `article-bootstrap-tool.md`
  - implement `set_article_content`/bootstrap behavior (or equivalent final design)
  - add server + test coverage for empty-init and explicit replace semantics
- `synced-article-agent-plan.md`
  - define and implement synced-local equivalent tooling/guardrails
  - finalize prompt behavior for current-article-only + attention maintenance
- `code-review-fixes.md`
  - address listed technical findings (build issues, test depth, DRY, consistency gaps)

## Notes
- This file is intentionally operational (what happened / what remains), while design details live in the individual plan files.
