# Sync folder hierarchy review findings

Review scope: current branch changes for folder-aware sync pushes, server-side folder resolution, and CLI JRN/frontmatter fixes.

## Findings

- High: Folder creation is not concurrency-safe; `findFolderByName` + `createDoc` has no unique constraint/locking, so parallel pushes can create duplicate folders with the same name under the same parent. This can lead to ambiguous path resolution and misfiled docs. (`backend/src/services/FolderResolutionService.ts:89-116`, `backend/src/dao/DocDao.ts:457-478`)
- Medium: CLI rename/move updates `parentId` but never updates `contentMetadata.title`; a file rename (serverPath change) will leave the web doc title stale. (`backend/src/router/SyncRouter.ts:101-149`)
- Medium: Web rename doesn’t propagate to CLI path; `DocRouter.put` only updates `sync.serverPath` when `parentId` changes, so a rename in-place won’t trigger a path update for sync. (`backend/src/router/DocRouter.ts:159-189`)
- Medium: Web-created docs use `serverPath = slug(title).md` with no uniqueness; duplicate titles in the same folder will collide in sync (same `serverPath`) and can overwrite/rename unexpectedly. (`backend/src/router/DocRouter.ts:73-85`)
- Low: `findFolderByName` fetches all folders at a level then filters in JS; this is O(n) per path segment and could be slow for large folders. (`backend/src/dao/DocDao.ts:457-478`)

## Questions / assumptions

- Should a CLI filename change also update the web doc title (derived from filename/frontmatter)?
- Should `serverPath` track title changes on the web (even without parent move), or is filename intended to be independent of title?

## Test gaps

- No coverage for rename-in-place on web (title change -> serverPath update) or CLI rename updating title.
- No coverage for duplicate-title collisions in serverPath generation.

