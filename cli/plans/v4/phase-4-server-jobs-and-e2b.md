# Phase 4: Server Jobs and E2B Wiring

## Objective

Integrate true sources into server-side automation while keeping virtual sources local-only.
Job matching now queries the `sources` table and `space_sources` junction instead of
scanning JSONB arrays on Space rows.

## Rules

- JobsToJrnAdapter matches only true sources from the `sources` table (where `integrationId IS NOT NULL`)
- `space_sources` junction determines which spaces are affected by a matched source
- virtual sources never participate in webhook/job matching
- cli-impact job payload includes canonical `sourceId` (FK to sources table)

## Job Payload Contract

```ts
interface CliImpactJobParams {
  sourceId: number;          // FK to sources table
  integrationId: number;
  eventJrn: string;
  headSha?: string;          // from webhook payload
  baseSha?: string;          // from webhook payload (before SHA) or source cursor
  affectedSpaceIds: number[]; // spaces bound to this source via space_sources
}
```

Note: `spaceId` is replaced by `affectedSpaceIds` — one source event can fan out
to multiple spaces. Each space applies its own attention rules to the shared change set.

## E2B Notes

In sandbox runs, mounts are not local machine paths; repo checkout is driven by the `repo` coordinate (Go module style: `host/owner/repo`) stored on the source row.

Flow:
1. resolve `repo` coordinate to clone URL (`https://{host}/{owner}/{repo}.git`)
2. clone repo using integration credentials
3. sync docs
4. impact (using cloned repo as mount) — for each affected space
5. agent updates
6. sync back
7. on success: advance source cursor via `PATCH /api/sources/:id/cursor` (if applicable)

Virtual sources with `repo` coordinates can also be resolved in sandbox contexts, even before formal promotion to true sources. The `repo` field is the bridge between local mounts and remote clones.

## Files

- `backend/src/jobs/JobsToJrnAdapter.ts`
- `backend/src/jobs/KnowledgeGraphJobs.ts`
- `backend/src/dao/SourceDao.ts`
- `tools/jolliagent/src/workflows.ts`
- `tools/jolliagent/src/Types.ts`

## Acceptance Criteria

- true sources trigger jobs deterministically via sources table queries
- payloads carry `sourceId` for traceability
- one source event fans out to all bound spaces
- source cursor is advanced on successful completion (where applicable)
- virtual sources have zero server-side effects
