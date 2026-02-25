# Phase 2: Attention and Source Resolution

## Objective

Extend attention rules with source awareness and deterministic name resolution.
Sources are now looked up from the `sources` table (true) or local config (virtual),
not from a JSONB array on Space.

## Schema

```ts
interface AttentionFileRule {
  op: "file";
  path: string;
  keywords?: string[];
  source?: string; // source name — resolved against sources table then local config
}
```

## Resolution Algorithm

For each rule with `source`:

1. try source name from `sources` table (via `/api/sources`)
2. if not found, try local virtual source name
3. if not found, unresolved

For rules without `source`, keep current local-root behavior.

## Strict Mode

- default: unresolved source => warn and skip that rule
- strict: unresolved source => fail command

## Collision Rules

- true source name takes precedence (server-authoritative)
- local virtual source conflicting with true source name is invalid config

## Files

- `common/src/util/Frontmatter.ts`
- `common/src/util/Frontmatter.test.ts`
- `src/client/commands/impact/AttentionParser.ts`
- `src/client/commands/impact/AttentionIndex.ts`

## Acceptance Criteria

- attention parsing supports optional `source`
- resolver is deterministic and test-covered
- strict mode behavior is explicit and consistent
