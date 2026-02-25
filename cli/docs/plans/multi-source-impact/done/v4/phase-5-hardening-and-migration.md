# Phase 5: Hardening and Migration

## Objective

Make the model safe to roll out and operable in CI.

## Migration

### Legacy `.jolli/sources.json` (CLI local config)

1. convert entries to `virtualSources` in new `LocalSourceConfig` format
2. keep names stable
3. print one-time upgrade note with optional true-source adoption steps

### `Space.sources` JSONB array (server)

The JSONB column never shipped to production. It is removed directly in plans-1.5/phase-0
and replaced by the `sources` table and `space_sources` junction. No migration needed.

## CI/Strict Controls

- `jolli impact --strict` fails on:
  - unresolved source names
  - ambiguous true/virtual collisions
  - invalid mounts for referenced sources

## Idempotency and Concurrency (server jobs)

For true-source automation:
- idempotency key: `sourceId + eventJrn + headSha`
- short lease lock per `(sourceId, branch)`
- stale-event skip when newer SHA already completed
- cursor advancement uses compare-and-swap to prevent concurrent overwrite

Note: idempotency is keyed on `sourceId` (not `spaceId`), since the source event
is the same regardless of which spaces consume it. Per-space processing is tracked
separately within the job.

## Test Plan

- unit:
  - source add/list/remove behavior matrix
  - attention resolution precedence
  - migration parser (local config)
- integration:
  - mixed true + virtual impact run
  - webhook to cli-impact for true source (via sources table)
  - one source event fanning out to multiple spaces
  - strict mode failure paths
  - cursor advancement after successful run

## Rollout

1. ship sources table and migration (plans-1.5)
2. ship contracts and local store
3. ship source CLI behind feature flag
4. ship impact runtime changes
5. enable server job wiring
6. enable strict mode in CI templates

## Acceptance Criteria

- upgrade from legacy source config is non-destructive
- mixed-source runs are stable and auditable
- CI mode is deterministic and fails fast on config drift
- JSONB `Space.sources` column is gone (removed in plans-1.5)
