# Tool Improvements Plan

## Goal
Make agent tooling reliably good at:
- traversing git history,
- listing changed files quickly,
- showing the right diff (not too much, not too little),
- and doing this consistently across CLI and collab router agents.

## Current Gaps
- Collab (`e2b-code`) has `git_history` and `git_diff`, but no `git_status` or simple `git_log`.
- Collab `git_diff` lacks common filters (`path`, `staged`, `name-only`, `stat`, context lines).
- `git_history` parsing is text-delimited and can break on edge-case commit subjects.
- Output sizing is uneven: CLI has explicit truncation; E2B tools rely on model/token limits.
- Tool contracts are mostly free-text, which makes LLM follow-up steps less deterministic.

## Priority Improvements

### P0: Workflow Completeness (must-have)
1. Add `git_status` to jolliagent + include in `e2b-code` preset.
2. Add `git_log` (or alias to `git_history` with concise mode) to jolliagent + include in `e2b-code`.
3. Add `git_show` for single-commit inspection (`sha`, `path`, `stat`, `patch` toggle).
4. Extend `git_diff` args:
   - `path?: string`
   - `staged?: boolean`
   - `name_only?: boolean`
   - `stat?: boolean`
   - `context_lines?: number`
   - keep `from_ref` / `to_ref`

### P0.5: Article Agent System Prompt Alignment
Update article-focused agent system prompts so the primary objective is explicit:
1. Main purpose: edit/update the **current article** (known title/name/JRN/path) to match user intent.
2. Scope safety: only modify the active article target; do not edit other articles/files.
3. Research behavior: use E2B/git/filesystem tools to inspect source code before writing sourced claims.
4. Attention tracking: whenever source files inform article content, update frontmatter `attention` entries so future source changes can trigger follow-up updates.
5. Editing behavior: preserve article structure (excluding frontmatter when metadata changes are needed) and apply focused edits.
6. Tool sequence guidance:
   - read current article first,
   - gather evidence from sources,
   - edit article content,
   - upsert frontmatter attention from referenced source paths.

### P1: Reliability + Parse Safety
1. Make `git_history` use robust separators:
   - `--pretty=format:%H%x00%s%x00%ai%x00%an`
   - parse NUL-delimited fields instead of splitting on `|`.
2. Add `git_changed_files`:
   - Inputs: `from_ref`, `to_ref`, `path?`
   - Output: machine-friendly list of files + status (`A/M/D/R`).
3. Standardize error payloads:
   - invalid ref,
   - not a repo,
   - empty results,
   - timeout.
   - Include remediation hints (example valid calls).

### P1: Output Control
1. Add shared pagination/limits:
   - `max_lines` / `max_bytes`,
   - `cursor` or `skip` for continuation.
2. Add truncation metadata in tool output:
   - `truncated: true/false`,
   - `next_cursor` when applicable.
3. Add `diff_mode` options:
   - `patch` (default),
   - `name-only`,
   - `stat`.

### P2: Agent Ergonomics
1. Add tool aliases to reduce model mistakes:
   - `git_log` -> `git_history`,
   - `git_files_changed` -> `git_changed_files`.
2. Add examples in tool descriptions for common flows:
   - "what changed in working tree"
   - "files changed between branches"
   - "inspect commit X only"
3. Add capability notes in system prompts:
   - prefer `git_status` first,
   - use `git_changed_files` before full patch diffs.

### P2: Security + Scope
1. Enforce path scope checks in all git tools where `path` is accepted.
2. Ensure collab agent remains constrained:
   - reads code/source via E2B filesystem tools,
   - edits only the active online article tools.
3. Keep destructive git actions out of defaults:
   - no reset/clean/rebase tools.

## Proposed Tool Contract Changes

### `git_diff`
- Inputs:
  - `from_ref?: string`
  - `to_ref?: string`
  - `path?: string`
  - `staged?: boolean`
  - `name_only?: boolean`
  - `stat?: boolean`
  - `context_lines?: number`
  - `max_bytes?: number`
- Output:
  - `summary`
  - `content`
  - `truncated`
  - `next_cursor?`

### `git_history`
- Inputs:
  - `ref?: string`
  - `skip?: number`
  - `limit?: number`
  - `path?: string`
  - `with_files?: boolean`
- Output:
  - `commits[]` with `sha`, `subject`, `author`, `date`, `files?`
  - `has_more`

### `git_changed_files` (new)
- Inputs:
  - `from_ref: string`
  - `to_ref: string`
  - `path?: string`
- Output:
  - `files[]` with `status`, `path`, `old_path?`

### `git_show` (new)
- Inputs:
  - `sha: string`
  - `path?: string`
  - `patch?: boolean`
  - `stat?: boolean`
  - `context_lines?: number`
- Output:
  - commit metadata + optional patch/stat.

## Test Plan
1. Unit tests for arg parsing and command construction.
2. Golden tests for history parsing with special chars in commit subjects.
3. Integration tests in E2B and local modes:
   - repo with no commits,
   - repo with renames,
   - large diff truncation path,
   - invalid refs.
4. Parity tests:
   - same logical call returns equivalent shape in CLI and collab paths.

## Rollout Order
1. Implement `git_status` + `git_show` + `git_diff` arg expansion.
2. Harden `git_history` parser and add structured outputs.
3. Add `git_changed_files`.
4. Update preset wiring and system prompts (including article-agent purpose/scope/attention behavior).
5. Add tests and docs examples.
