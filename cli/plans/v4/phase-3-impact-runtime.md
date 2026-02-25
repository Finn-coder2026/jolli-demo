# Phase 3: Impact Runtime (Multi-Source)

## Objective

Execute impact matching across mixed true and virtual sources in one run.

## Runtime Flow

1. load docs attention rules
2. resolve each rule to one runtime source target (from `sources` table or local config)
3. group by target
4. determine change set per source:
   - if event-driven (webhook payload has before/after): use payload context
   - if cursor available on source: `git diff cursor..HEAD`
   - if manual CLI run: use `--base` flag or default branch
5. match changed files against grouped rules
6. merge and dedupe impacted docs
7. run agent update flow and propagation

## Change Set Determination

Not all sources support incremental diffs. The runtime must handle multiple modes:

| Source context | Change set source |
|---|---|
| Webhook event (git push) | `before`/`after` SHAs from payload |
| Source with cursor (polling/catch-up) | `git diff cursor.value..HEAD` |
| Manual CLI `--base` flag | `git diff base..HEAD` |
| No cursor, no event, no base | Default branch diff or full scan |
| Static file upload | Upload content is the change |

The source's cursor (if present) is updated as bookkeeping after success,
but is not always the primary input to the diff.

## Evidence Model

Extend evidence records to include source context:

```ts
interface MatchEvidence {
  sourceKind: "true" | "virtual" | "local";
  sourceName?: string;
  sourceId?: number; // true sources only — FK to sources table
  changedFile: string;
  pattern: string;
  matchType: "exact" | "glob";
}
```

## Performance

- run per-source diff collection in parallel where safe
- keep matching in-memory with grouped indexes

## Files

- `src/client/commands/impact/search.ts`
- `src/client/commands/impact/FileMatcher.ts`
- `src/client/commands/impact/Types.ts`
- `src/client/commands/impact/ImpactAgentRunner.ts`
- `src/client/commands/impact/AuditTrail.ts`

## Acceptance Criteria

- one run can evaluate backend/frontend/virtual sources together
- final report includes source kind and identity per evidence line
- source-less docs still work exactly as before
- change set determination handles event-driven, cursor-based, and manual modes
