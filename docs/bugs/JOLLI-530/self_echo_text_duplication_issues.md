# Tiptap Editor Concurrency Issues — Phantom Edits & Duplicated Lines

Investigation into phantom edits, extra copies of lines, and concurrency issues observed in the Tiptap editor.

---

## Root Cause 1: Mercure Echo — Own Edits Broadcast Back to Sender

**Severity: CRITICAL**

In `backend/src/router/DocDraftRouter.ts`, `broadcastToDraft()` correctly skips the sender for **in-memory SSE connections** via `excludeUserId`. But the Mercure publish on the same path does **not** filter:

```
broadcastToDraft(chatService, id, event, userId)
  |-- In-memory SSE --> skips conn where conn.userId === userId   (correct)
  |-- mercureService.publishDraftEvent(draftId, eventType, event) (no userId filter!)
```

`backend/src/services/MercureService.ts` `publishDraftEvent()` has no `excludeUserId` parameter — it publishes to **all** Mercure subscribers. If the frontend is subscribed via Mercure (which it prefers over direct SSE), the user receives their **own diffs back** and applies them a second time, duplicating content.

**Key files:**
- `backend/src/router/DocDraftRouter.ts` — `broadcastToDraft()` (lines 70-94)
- `backend/src/services/MercureService.ts` — `publishDraftEvent()` (lines 172-189)

---

## Root Cause 2: Beacon-Save + Auto-Save Race — Double Diff Broadcast

**Severity: HIGH**

On page unload:
1. The 2-second auto-save timeout may fire (`PATCH /api/doc-drafts/:id`)
2. Simultaneously, `navigator.sendBeacon()` fires (`POST /api/doc-drafts/:id/beacon-save`)

Both endpoints read the **same baseline** from the database, generate the **same diff**, and both call `broadcastToDraft()`. Other clients receive the diff **twice**, and the second application shifts positions on already-modified content:

```
Baseline: "hello"  -->  User typed: "hello world"

Auto-save diff:   insert@5 " world"
Beacon-save diff: insert@5 " world"   (same baseline!)

Client B applies both:
  "hello" --> "hello world" --> "hello world world"   <-- PHANTOM DUPLICATE
```

**Key files:**
- `backend/src/router/DocDraftRouter.ts` — PATCH endpoint (lines 729-834), beacon-save endpoint (lines 836-931)

---

## Root Cause 3: `isInternalChangeRef` Flag Race in Content Sync Loop

**Severity: HIGH**

The sync loop between `frontend/src/components/ui/TiptapEdit.tsx` and `frontend/src/ui/ArticleDraft.tsx` uses a single boolean ref to prevent echo:

```
onUpdate (line 1088):   isInternalChangeRef = true       <-- set immediately
debounce (line 992):    isInternalChangeRef = true       <-- re-armed 100ms later
effect (line 1144):     isInternalChangeRef = false      <-- consumed on any render
```

During rapid typing, the flag is consumed by the effect **before** the debounce fires. When the debounced `onChangeMarkdown` finally updates the parent's `articleContent` state, the resulting content prop change hits the effect with `isInternalChangeRef === false`. The effect then falls through to `editor.commands.setContent()`, re-parsing content that's already in the editor — which can reset cursor position and, depending on markdown round-trip fidelity, inject subtle differences.

**Key files:**
- `frontend/src/components/ui/TiptapEdit.tsx` — `onUpdate` (line 1087), debounce setup (lines 986-1002), content sync effect (lines 1140-1197)

---

## Root Cause 4: `ensureImageParagraphs()` Called on Every Round-Trip

**Severity: MEDIUM-HIGH**

This function adds blank lines around standalone images. It is called:
1. On initial mount (line 980)
2. On every content prop sync (line 1181)

When content round-trips through the editor (edit -> `getMarkdown()` -> parent state -> content prop -> `ensureImageParagraphs()` -> `setContent()`), blank lines accumulate:

```
Round 1:  "Text\n![img](url)\nMore"
          --> ensureImageParagraphs --> "Text\n\n![img](url)\n\nMore"
          --> ProseMirror creates empty paragraph nodes
          --> getMarkdown() --> "Text\n\n&nbsp;\n\n![img](url)\n\n&nbsp;\n\nMore"

Round 2:  ensureImageParagraphs sees &nbsp; lines, adds MORE blanks around image
          --> blank lines grow each cycle
```

**Key files:**
- `frontend/src/components/ui/TiptapEdit.tsx` — `ensureImageParagraphs()` (lines 85-114), initial content (line 980), sync effect (line 1181)

---

## Root Cause 5: Frontend Diff Application Without Position Adjustment

**Severity: MEDIUM**

`frontend/src/ui/ArticleDraft.tsx` `applyDiffsToArticle()` applies diffs in **forward order** without adjusting positions after each operation. If a single SSE event carries multiple diffs, an insert at position 10 shifts everything after it, but the next diff's position was computed against the **original** baseline:

```typescript
for (const diff of diffs) {  // forward order, no position adjustment
    switch (diff.operation) {
        case "insert":
            newContent = newContent.slice(0, diff.position) + text + newContent.slice(diff.position);
```

The backend's `applyDiff()` applies in **reverse** order (which is correct for position stability), but the frontend applies in **forward** order.

**Key files:**
- `frontend/src/ui/ArticleDraft.tsx` — `applyDiffsToArticle()` (lines 1063-1097)
- `backend/src/services/DiffService.ts` — `applyDiff()` (lines 149-173)

---

## Root Cause 6: Markdown Serialization Round-Trip Instability

**Severity: MEDIUM**

`@tiptap/markdown` renders empty paragraphs as `&nbsp;`, separates blocks with `\n\n`, and the view-mode switch replaces `&nbsp;` with a space. These transforms mean content is **never identical** after a round-trip through ProseMirror, so the `content === lastExternalContentRef` guard in the sync effect frequently fails, triggering unnecessary `setContent()` calls.

**Key files:**
- `frontend/src/components/ui/TiptapEdit.tsx` — view mode switch (lines 1465-1509), content sync effect (lines 1140-1197)

---

## Summary

| # | Root Cause | Where | Effect |
|---|-----------|-------|--------|
| 1 | Mercure echo (no sender filtering) | DocDraftRouter -> MercureService | User's own edits applied twice |
| 2 | Beacon + auto-save race | DocDraftRouter PATCH + beacon endpoints | Same diff broadcast twice to other clients |
| 3 | `isInternalChangeRef` consumed too early | TiptapEdit content sync effect | Spurious `setContent()` calls during typing |
| 4 | `ensureImageParagraphs` on every sync | TiptapEdit lines 980, 1181 | Blank lines accumulate around images |
| 5 | Forward-order diff application | ArticleDraft `applyDiffsToArticle` | Position shifting corrupts multi-diff payloads |
| 6 | Markdown round-trip instability | @tiptap/markdown + entity replacements | Sync guard fails, triggers extra re-parses |

The most likely culprits for user-visible phantom lines are **#1** (Mercure echo) and **#4** (image paragraph accumulation), with **#3** amplifying both by causing extra sync cycles.

---

## Latest Follow-up Issue Set (2026-02-11)

This section records the later 6-item review pass and current disposition.

| # | Follow-up Issue | Status | Notes |
|---|---|---|---|
| 1 | `handleConvoSSEEvent` self-echo vulnerability (`typing`, `content_chunk`, `tool_event`, `article_updated`) | Addressed | Client now applies shared self-echo guard logic and request-id dedupe for convo stream events. |
| 2 | `user_joined` / `user_left` self-echo in draft presence handling | Addressed | Presence updates are now filtered with same-user guard before mutating active-user state. |
| 3 | Forward-order multi-diff application in `applyDiffsToArticle` | Addressed | Diff application changed to reverse order for position stability in multi-diff payloads. |
| 4 | Race window on `currentUserIdRef` from async `getProfile()` | Addressed | Frontend now uses synchronous user source from navigation/session context instead of async profile fetch in `ArticleDraft`. |
| 5 | Missing test for `content_update` with `userId: undefined` and profile-race case | Addressed | Explicit test added for `userId: undefined`, and the async profile-race path was removed by switching `ArticleDraft` to synchronous user context. |
| 6 | Missing multi-diff SSE test | Addressed | Added regression test validating stable application of 2+ diffs in one event. |

### Architecture decision (documented)

For multi-node correctness, Mercure remains broadcast-oriented. Self-echo suppression is treated as a client contract (shared guard + request-id correlation), not strict server-side sender exclusion.
