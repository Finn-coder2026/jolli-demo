# Article Bootstrap Tool Proposal

## Goal
Make it easy and reliable for an agent to add initial text to an empty article without relying on `"null"` section sentinels or brittle exact-match edits.

## Problem
Current web article tools are strong for structured edits, but awkward for empty content:
- `edit_section` requires `sectionTitle: "null"` for preamble edits.
- `create_section` requires `insertAfter: "null"` for first insert.
- `edit_article` is exact-match based and works best after content exists.

This causes avoidable tool-call errors and unnecessary retries.

## Proposed Tool
Add a new article tool: `set_article_content`

### Intent
- Primary use: initialize an empty article body in one call.
- Secondary use: explicit full-body replace when intentionally requested.
- Frontmatter stays managed by `upsert_frontmatter` and is preserved by default.

### Contract (shared across web collab + CLI)
```json
{
  "name": "set_article_content",
  "description": "Set article body content. Safe by default: initializes only when body is empty.",
  "parameters": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "Full markdown body content to write (exclude frontmatter)."
      },
      "mode": {
        "type": "string",
        "enum": ["init_if_empty", "replace_all"],
        "description": "init_if_empty is default and safest. replace_all requires explicit confirmation."
      },
      "confirm_replace": {
        "type": "string",
        "description": "Required only when mode=replace_all. Must equal REPLACE."
      },
      "reason": {
        "type": "string",
        "description": "Short rationale for audit/debug."
      }
    },
    "required": ["content"]
  }
}
```

## Semantics
1. Parse current article into `frontmatter` and `body`.
2. `mode=init_if_empty` (default):
   - If body is empty/whitespace: write `content`.
   - If body is non-empty: return a structured validation error and do not change content.
3. `mode=replace_all`:
   - Require `confirm_replace === "REPLACE"`.
   - Replace body with `content`.
4. Preserve existing frontmatter block exactly (unless separately changed by `upsert_frontmatter`).
5. Update edit metadata and broadcast normal article update event.

## Validation/Error Shape
Return actionable, model-readable failures:
```json
{
  "ok": false,
  "error_code": "BODY_NOT_EMPTY",
  "message": "Article body is not empty; init_if_empty refused to overwrite.",
  "details": {
    "body_char_count": 742,
    "preview": "# Existing heading\\n\\nFirst paragraph..."
  },
  "hint": "Use edit_article/edit_section for targeted edits, or call set_article_content with mode=replace_all and confirm_replace=REPLACE."
}
```

## Why This Is Better
- Removes `"null"` sentinel friction for first write.
- Keeps safe default behavior (no accidental overwrite).
- Still supports intentional full rewrite with explicit confirmation.
- Keeps frontmatter responsibilities separate and clear.
- More deterministic for LLMs than exact string replacement when content is empty.

## Example Calls
Initialize empty article:
```json
{"content":"# Intro\n\nThis page explains..."}
```

Intentional full replace:
```json
{"content":"# New draft\n\nCompletely rewritten body.","mode":"replace_all","confirm_replace":"REPLACE","reason":"User requested full rewrite"}
```

## Rollout Plan
1. Add `SetArticleContentTool` adapter in backend.
2. Wire into `CollabConvoRouter` additional tools and system prompt.
3. Add same contract in CLI tool host for parity.
4. Add tests:
   - empty body success,
   - non-empty init failure with structured error,
   - replace_all requires confirm token,
   - frontmatter preserved exactly.
5. Optional: mark `"null"` sentinel usage as legacy in prompt guidance.
