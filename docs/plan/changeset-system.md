# Changeset System Plan

## Locked Decisions
1. Compare direction is `current DB` vs `incoming bundle` (bundle is what should merge into current).
2. Selecting a bundle hides the normal center doc view for now.
3. Right panel shows only affected files (not full space tree).

## Plan
1. Add bundle list endpoint scoped to current space in `backend/src/router/SyncRouter.ts` and DAO support in `backend/src/dao/SyncCommitDao.ts`.
2. Extend bundle-file detail payload from `GET /changesets/:id/files` to return `serverPath`, `baseContent/baseVersion`, `incomingContent`, and resolved `currentContent/currentVersion/currentServerPath` from docs, so UI can do 3-way compare.
3. Keep space scoping strict via `commit_scope_key = space:<id>` and existing header space resolution in `backend/src/router/SyncRouter.ts`.
4. Add a typed client in `common/src/core` (new `SyncChangesetClient`) and wire it in `common/src/core/Client.ts`.
5. In `frontend/src/ui/spaces/SpaceTreeNav.tsx`, add a bottom accordion above settings showing bundle summaries for the current space.
6. In `frontend/src/ui/Spaces.tsx`, add bundle selection state; when selected, replace `TiptapArticle` with a new review workbench component.
7. Build review workbench with 2 panes.
8. Left pane: staged file diffs (red deletions/green additions), file-by-file, using `frontend/src/components/GitHubStyleDiff.tsx`, defaulting to `current -> incoming`.
9. Right pane: affected-file path tree built only from bundle file `serverPath` values.
10. Add per-file 3-way merge view (`Current`, `Base vN`, `Incoming`) and merge preview using `threeWayMerge(base, current, incoming)` semantics (can reuse logic from `cli/src/sync/SmartMerge.ts`).
11. Persist decisions with existing review endpoints (`accept/reject/amend`) and keep publish flow unchanged via `/changesets/:id/publish`.
12. Add tests in `backend/src/router/SyncRouter.test.ts` and new frontend tests under `frontend/src/ui/spaces/` for accordion, selection, affected-file tree, and diff direction.
