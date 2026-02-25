# Tiptap Concurrency Worklog

## 2026-02-11 - Mercure Self-Echo Investigation

### 1. Temporary logging added

Added temporary diagnostics to classify `content_update` events as:
- `GOOD_PATH` = update from another user
- `BAD_PATH` = suspected self-echo (sender matches current user)
- `UNKNOWN_PATH` = not enough user info to classify

Instrumentation locations:
- Frontend: `frontend/src/ui/ArticleDraft.tsx`
  - Resolves `currentUserId` via `client.profile().getProfile()`
  - Logged `GOOD_PATH/BAD_PATH/UNKNOWN_PATH` diagnostics
- Backend: `backend/src/router/DocDraftRouter.ts`
  - Logs when `content_update` is published to Mercure while sender is excluded from in-memory SSE
  - Logged backend self-echo diagnostic details for `content_update`

All diagnostics were temporary and intended for cleanup after verification.

### 2. Logs observed (confirmation)

Observed frontend warnings:

```text
WARN : BAD_PATH suspected self-echo content_update (draftId=6, senderUserId=1, currentUserId=1, diffCount=1)
```

Observed backend warnings:

```text
WARN: DocDraftRouter - BAD_PATH backend content_update published to Mercure with excluded sender (draftId=6, senderUserId=1, excludeUserId=1, sseDelivered=0, sseSkipped=0)
```

This confirms the Mercure self-echo path:
- sender is excluded from in-memory SSE
- same sender update is still published via Mercure
- frontend receives and processes own update

### 3. Additional warning observed

Tiptap warning:

```text
[tiptap warn]: Duplicate extension names found: ['articleLink'].
```

Root cause:
- `ArticleLinkExtension` and `ArticleLinkNode` both used extension name `articleLink`.

### 4. Fixes implemented

1. Self-echo guard in frontend
- File: `frontend/src/ui/ArticleDraft.tsx`
- In `content_update` handler, skip applying diffs when:
  - `data.userId === currentUserId`
- Behavior:
  - keep logging for diagnostics
  - ignore self-echo payloads so local content is not re-applied

2. Duplicate extension-name fix
- File: `frontend/src/components/ui/ArticleLinkExtension.ts`
- Changed extension name:
  - from `articleLink`
  - to `articleLinkTrigger`

3. Backend diagnostics retained for correlation
- File: `backend/src/router/DocDraftRouter.ts`
- Temporary logs remain to validate behavior during fix verification.

### 5. Current status

- Logging added and verified.
- Self-echo frontend guard implemented.
- Duplicate Tiptap extension name warning fix implemented.

### 6. Next step (in progress)

About to test the fix end-to-end:
- Verify self-echo logs may still appear temporarily, but no duplicate content should be applied in editor.
- Verify `[tiptap warn]: Duplicate extension names found: ['articleLink']` no longer appears.
- After confirmation, remove all temporary diagnostics.

### 7. Finishing notes (completed)

Verification summary:
- Frontend no longer shows the duplicate extension warning for `articleLink` after renaming the trigger extension to `articleLinkTrigger`.
- Self-echo content updates are now ignored in `ArticleDraft` when `data.userId === currentUserId`, preventing local duplicate text application.
- Temporary `JOLLI-XXX` GOOD_PATH/BAD_PATH/UNKNOWN_PATH diagnostics were removed from frontend and backend runtime code after verification.

Special regression test added:
- File: `frontend/src/ui/ArticleDraft.test.tsx`
- Test: `ignores self-echo content_update from save flow and still applies remote updates`
- Coverage intent:
  - Simulate `save` flow.
  - Mock a self-echo `content_update` from the same user and verify no content change.
  - Send a non-self `content_update` and verify the diff is applied.

Current state:
- Fixes are implemented and verified.
- Regression test for the save/self-echo path is in place.

## 2026-02-11 - Post-fix hardening and broad coverage

### 8. Why follow-up work was needed

After the initial draft `content_update` guard, we identified broader self-echo risk on convo stream events and a race risk from async profile loading. The fix was expanded from a single handler to a shared client-side rule.

### 9. Additional fixes implemented

1. Shared self-echo guard utility (frontend)
- File: `frontend/src/util/SelfEchoGuard.ts`
- Added shared helpers for:
  - `isSelfEchoByUserId`
  - `shouldIgnoreConvoSelfEcho`
  - `isConvoTerminalEvent`
- Goal:
  - enforce one consistent self-echo decision rule across event handlers.

2. Synchronous current user source (frontend)
- File: `frontend/src/contexts/NavigationContext.tsx`
  - Added `currentUserId` in navigation context (derived from `userInfo?.userId`).
- File: `frontend/src/ui/ArticleDraft.tsx`
  - Replaced async `client.profile().getProfile()` dependency with `useNavigation().currentUserId`.
- Goal:
  - remove race window where SSE can arrive before profile resolution.

3. Convo request-id dedupe pipeline (frontend + common + backend)
- Frontend (`frontend/src/ui/ArticleDraft.tsx`)
  - Generates `clientRequestId` per send.
  - Tracks pending request IDs with TTL cleanup.
  - Drops matching self-echo convo events.
- Common client (`common/src/core/CollabConvoClient.ts`)
  - `sendMessage` now accepts optional `clientRequestId`.
- Backend (`backend/src/router/CollabConvoRouter.ts`)
  - Accepts optional `clientRequestId` on send.
  - Echoes `clientRequestId` and `userId` in convo SSE events.
- Shared event types (`common/src/types/SSEEvents.ts`)
  - Added optional request-id fields to relevant SSE event types.
- Goal:
  - deterministic self-echo drop for convo stream payloads.

4. Diff application stability fix
- File: `frontend/src/ui/ArticleDraft.tsx`
- Updated multi-diff application to process diffs in reverse order (position-stable application model).

### 10. Additional tests added

1. Convo request-id pass-through test
- File: `common/src/core/CollabConvoClient.test.ts`
- Verifies `sendMessage` includes `clientRequestId` in request body.

2. Convo self-echo dedupe test
- File: `frontend/src/ui/ArticleDraft.test.tsx`
- Test:
  - `ignores convo SSE self-echo events when clientRequestId matches local send`

3. Undefined sender ID coverage test
- File: `frontend/src/ui/ArticleDraft.test.tsx`
- Test:
  - `applies content_update diffs when userId is undefined`

4. Multi-diff stability test
- File: `frontend/src/ui/ArticleDraft.test.tsx`
- Test:
  - `applies multiple content_update diffs using stable positions`

### 11. Verification status

- Targeted common/backend/frontend tests for the new behavior passed.
- Draft self-echo and convo self-echo handling are now guarded on the client.
- Temporary `JOLLI-XXX` runtime logs/comments remain removed.

### 12. Latest issue set added (follow-up review)

Captured the later 6-item issue pass in the issues doc with disposition:
- `handleConvoSSEEvent` self-echo vulnerability: addressed.
- `user_joined` / `user_left` self-echo: addressed.
- Forward-order diff application bug: addressed (reverse order now used).
- `currentUserIdRef` async race window: addressed (sync context source).
- Missing `userId: undefined` coverage: addressed by explicit test.
- Missing multi-diff SSE coverage: addressed by explicit test.

Reference:
- `docs/bugs/JOLLI-530/self_echo_text_duplication_issues.md` (`Latest Follow-up Issue Set (2026-02-11)`).

Architecture note:
- Multi-node behavior remains Mercure broadcast + shared client-side self-echo filtering (userId + clientRequestId correlation), rather than strict backend sender-exclusion semantics.

### 13. Hardening pass (post-review)

Aligned docs:
- Updated `Latest Follow-up Issue Set` status for item #5 from `Partially addressed` to `Addressed` in:
  - `docs/bugs/JOLLI-530/self_echo_text_duplication_issues.md`
- Rationale:
  - `userId: undefined` draft event behavior has explicit test coverage.
  - The async `getProfile()` race path was removed from `ArticleDraft` when switching to sync user context.

Additional regression hardening (frontend):
- File: `frontend/src/ui/ArticleDraft.test.tsx`
- Added:
  - `ignores convo SSE self-echo article_updated when clientRequestId matches local send`
  - `ignores self typing SSE event when userId matches current user`
- Coverage intent:
  - Ensure convo `article_updated` self-echo events are not re-applied for the sender when request id matches a local in-flight message.
  - Ensure same-user typing events do not trigger local typing indicator flicker.
