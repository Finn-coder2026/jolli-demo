# Code Review Fixes — JOLLI-537

Findings from code review of `pn-JOLLI-537-improve-web-agent-2` branch, checked against the plan documents.

## Critical / Build-Breaking

### 1. Syntax bug in `git_changed_files.ts:64`
Missing `.` before `filter()`:
```ts
.map(line => parseNameStatusLine(line))
filter((entry): entry is GitChangedFile => entry !== null);  // missing dot
```
Should be `.filter(...)`. Will fail at compile time.

---

## Significant

### 2. Dead code: `findSimilarText` in `AgentToolHost.ts:23-73`
Defined but never called anywhere. Remove it.

### 3. `SetArticleContentTool` not implemented
All three plan docs call for it:
- `article-bootstrap-tool.md` rollout steps 1-4
- `synced-article-agent-plan.md` section 1

Neither the backend adapter nor the CLI parity tool exist. Decide whether to defer or implement now.

### 4. Git tool tests are skeletal
Each git tool in `AgentToolHost.test.ts` only tests "not a git repository." The plan calls for:
- Unit tests for arg parsing and command construction
- Golden tests for history parsing with special chars
- Integration tests (empty repos, renames, large diff truncation, invalid refs)

No unit tests for `parseGitStatusPorcelain`, `parseGitHistoryOutput`, `parseNameStatusLine`, `parseBoundedInt`, or `shellQuote` in `tools/jolliagent/` either.

### 5. No `EditArticleTool.test.ts` in backend
The tool has real logic (occurrence counting, sequential edit application, content preview on failure) but no unit test file.

### 6. Thin `UpsertFrontmatterTool.test.ts`
Only ~3 tests for ~10 code paths. Missing: BOM handling, validation errors (invalid JRN, invalid attention schema), empty frontmatter creation, set+remove on same key, no-op detection.

### 7. `ToolExecutor` type defined in 7+ files
Two different signatures:
- `Types.ts`: `(call: ToolCall, runState: RunState) => Promise<string>`
- Each git tool file: `(runState: RunState, args: unknown) => Promise<string> | string`

DRY violation. Define once, import everywhere.

### 8. `git_log.ts` duplicates `git_history.ts`
Nearly identical executor body. CLI already handles this with `executeGitHistoryLike`. Share a single internal function in jolliagent tools too.

---

## Moderate

### 9. DRY: `saveAgentMessages` duplicated
Copy-pasted between `CollabConvoRouter.ts` and `AgentConvoRouter.ts`. Extract to shared utility.

### 10. Duplicated GitHub token resolution in `KnowledgeGraphJobs.ts`
`analyzeSourceDocJobHandler` manually resolves tokens while `resolveGithubTokenFromIntegration()` does the same thing. Reuse the shared function.

### 11. Shell timeout timer leak in `AgentToolHost.ts`
`executeShell` creates a `setTimeout` that is never cleared on the happy path.

### 12. `max_bytes` measures characters, not bytes
`git_diff` uses `content.length` / `content.slice()` which operate on string characters, not UTF-8 bytes. Parameter name is misleading.

### 13. `rg_search` `-m` flag is per-file, not global
`maxResults: 10` with 50 files could return up to 500 results.

### 14. Mock signature mismatches in `CollabConvoRouter.test.ts`
`vi.mock` implementations for `executeCreateSectionTool`, `executeDeleteSectionTool`, `executeEditSectionTool` have positional parameter misalignments with real signatures.

### 15. Dead `vi.fn()` calls in `CollabConvoRouter.test.ts` (~lines 1218-1220)
Three unassigned `vi.fn()` calls. Leftover from refactor.

---

## Minor

### 16. Duplicate `/* v8 ignore start */` in `ArticleDraft.tsx:~1915-1916`
Harmless but sloppy.

### 17. `git_status` rename detection uses `" -> "` split
Fragile. Consider `--porcelain=v1 -z` for NUL-delimited output.

### 18. `git_show` and `git_status` lack `max_bytes` truncation
Inconsistent with `git_diff`.

### 19. `oneline` param in `git_log` is misleadingly named
Only controls `with_files` default, not output format.

### 20. `AgentToolHost.ts` is 2389 lines
Consider splitting git/filesystem/article tool executors into separate modules.

### 21. `/tmp/` hardcoded test paths
macOS symlink issue (`/tmp` -> `/private/tmp`). Use `realpathSync(tmpdir())`.

---

## Remaining Plan Gaps (from `tool-improvements.md`)

These items from the completed plan are still outstanding:

| Item | Status |
|---|---|
| P1: Output control (`max_lines`/`max_bytes`) on all tools | Partial — `git_diff` only |
| P1: Timeout error code in `parseGitCommandError` | Missing |
| P1: `next_cursor` for continuation after truncation | Missing |
| P2: Examples in tool descriptions for common flows | Not done |
| P2: Capability notes in system prompts | Not done |
| P2: Path scope checks in jolliagent git tools | Not done (done in CLI) |
