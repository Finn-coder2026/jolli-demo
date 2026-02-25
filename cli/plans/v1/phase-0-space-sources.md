# Phase 0: Space Sources

Add a `sources` field to the Space model so that a Space can declare which external sources (GitHub repos) it watches. This enables the JobsToJrnAdapter to match GitHub events to Spaces, not just individual articles.

## Existing State

- `Space` model (`backend/src/model/Space.ts`): no source/integration reference
- `Integration` model (`backend/src/model/Integration.ts`): stores GitHub repos globally (tenant-org scope), no space link
- `Doc` model (`backend/src/model/Doc.ts`): has `source`/`sourceMetadata` per-document, plus `spaceId`
- `common/src/types/Space.ts`: shared `Space` type used by frontend/backend

## Design

### SpaceSource Type

```typescript
// common/src/types/Space.ts (or new SpaceSource.ts)

/**
 * A source connected to a Space.
 * When events matching this source's JRN pattern occur,
 * the Space's JolliScript articles are evaluated for triggering.
 */
interface SpaceSource {
  /** Integration ID (references Integration table) */
  integrationId: number;
  /** Optional JRN pattern override. If omitted, derived from integration metadata. */
  jrnPattern?: string;
  /** Optional branch filter. If omitted, uses integration's configured branch. */
  branch?: string;
  /** Whether this source is active */
  enabled: boolean;
}
```

### Space Model Change

Add `sources` JSONB column to the `spaces` table:

```typescript
// backend/src/model/Space.ts - add to schema
sources: {
  type: DataTypes.JSONB,
  allowNull: false,
  defaultValue: [],
}
```

And to the `Space` interface:

```typescript
readonly sources: Array<SpaceSource>;
```

### Migration Strategy

- JSONB column with `defaultValue: []` means existing spaces get an empty array
- No data migration needed — existing spaces simply have no sources
- The `postSync` hook on SpaceDao can add the column if not present (consistent with existing pattern for `slug`)

## Files to Modify

### Backend Model + DAO

| File | Change |
|------|--------|
| `backend/src/model/Space.ts` | Add `sources` JSONB field to schema and `Space` interface |
| `backend/src/dao/SpaceDao.ts` | Update `createSpace`, `updateSpace` to accept sources; add `getSpacesBySource(integrationId)` query; add `findSpacesMatchingJrn(eventJrn)` query |

### Common Types

| File | Change |
|------|--------|
| `common/src/types/Space.ts` | Add `SpaceSource` interface, add `sources` to `Space` type, add to `CreateSpaceRequest` and `NewSpace` |

### Backend Router

| File | Change |
|------|--------|
| `backend/src/router/SpaceRouter.ts` | Accept `sources` in create/update endpoints; add `PATCH /spaces/:id/sources` for source management |

### Frontend (minimal)

| File | Change |
|------|--------|
| Space settings UI (TBD) | Display connected sources on space settings — can be deferred |

## API Endpoints

### Existing (modified)

```
POST /api/spaces          — accept optional `sources` in body
PUT  /api/spaces/:id      — accept optional `sources` in body
GET  /api/spaces          — returns sources in response
GET  /api/spaces/:id      — returns sources in response
```

### New

```
PATCH /api/spaces/:id/sources — update just the sources array
  Body: { sources: SpaceSource[] }
  Response: { sources: SpaceSource[] }
```

## Validation Rules

1. `integrationId` must reference an existing, active Integration
2. Same integrationId cannot appear twice in a Space's sources array
3. `jrnPattern` if provided must be a valid JRN glob pattern
4. `branch` if provided must be non-empty string

## Tests

- SpaceDao: CRUD with sources field, findSpacesMatchingJrn query
- SpaceRouter: create/update with sources, validation errors
- Common types: SpaceSource type compatibility

## Notes

- The `sources` field is an array because a Space could watch multiple repos
- `enabled` flag allows temporarily disabling a source without removing it
- `jrnPattern` override is for advanced use cases; normally derived from the Integration's repo/branch metadata
- This is purely additive — no existing behavior changes
