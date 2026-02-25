# Synced Article Agent Plan

## Goal
Define a CLI article-editing flow for Jolli Sync where the agent edits the current synced article file, uses source-code evidence, and maintains frontmatter attention links.

## Context
- CLI operates on local markdown files synced from Jolli.
- There is a current in-view/current-target article (title/name/JRN/path available in context).
- Agent can use E2B filesystem/git/code-search tools to gather evidence.

## Core Behavior Requirements
1. The agent's primary purpose is to edit/update the current article to match user intent.
2. The agent must only write to the current article target.
3. The agent may read source code/files via E2B tools to gather evidence.
4. When sourced information is used, the agent must update frontmatter `attention` to include those source file references.
5. Preserve article structure/content organization; use frontmatter tools only for metadata updates.

## Proposed Tooling (CLI, synced-local variant)

### 1) `set_current_article_content` (new)
Purpose:
- Reliable bootstrap for empty current article body.
- Optional explicit full-body replace when user asks.

Contract:
```json
{
  "content": "string",
  "mode": "init_if_empty | replace_all",
  "confirm_replace": "REPLACE (required when mode=replace_all)",
  "reason": "string"
}
```

Behavior:
- `init_if_empty` default:
  - write only when body is empty/whitespace.
  - otherwise return structured validation error.
- `replace_all`:
  - requires explicit confirm token.
- Preserve existing frontmatter block.

### 2) `upsert_frontmatter` (existing) with attention-first guidance
Use existing upsert tool for metadata, but prompt/tool docs should require:
- Add/merge attention entries for source paths used in the edit.
- Avoid duplicates.
- Keep order stable where possible.
- Validate attention schema and return actionable errors.

Optional follow-up tool (if we want less LLM friction):
- `upsert_attention_sources` wrapper that only manipulates `attention`.

## System Prompt Update (CLI article mode)
Prompt should include:
1. "You are editing the current article only."
2. "Use E2B tools to inspect source code before adding sourced claims."
3. "When you use source files, record them in frontmatter attention."
4. "Do not claim edits succeeded unless tool calls succeeded."
5. "Prefer focused edits over large rewrites unless user explicitly asks."

## Suggested Execution Flow
1. `get_current_article`
2. Read source files (e.g., `rg`, `cat`, `git_*`)
3. Apply body edits (`edit_article`, `edit_section`, `create_section`, or `set_current_article_content`)
4. `upsert_frontmatter` to add/update attention source links
5. Return concise summary of content + metadata changes

## Error Handling Requirements
- If article is non-empty in `init_if_empty`, return:
  - `error_code: BODY_NOT_EMPTY`
  - preview + char count
  - clear hint to use targeted edit tools or explicit replace mode.
- If attention payload is invalid:
  - return schema path + expected type + received value.

## Test Plan
1. Empty current article + `set_current_article_content` succeeds.
2. Non-empty article + `init_if_empty` fails with structured error.
3. `replace_all` requires confirm token.
4. Sourced edit path updates `attention`.
5. Non-sourced minor edit does not force attention churn.
6. Agent cannot write outside current article target.
