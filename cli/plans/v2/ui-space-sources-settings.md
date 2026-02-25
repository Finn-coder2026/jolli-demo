# UI: Space Sources Settings

## Goal

Add a "Sources" tab to Space Settings where users can attach GitHub integrations to a space. This enables end-to-end testing of the GitHub push -> cli-impact pipeline without needing to curl the API.

**Works against:** Current `PATCH /api/v1/spaces/:id/sources` endpoint (JSONB model). Will be updated to use the `sources` table API when that lands.

## Current State

- `PATCH /api/v1/spaces/:id/sources` exists with full validation
- `SpaceSource` type exists in `common/src/types/Space.ts`
- `Space.sources` field exists (JSONB array)
- `SpaceClient` has no method for updating sources
- No UI anywhere for managing space sources
- `SpaceSettingsSidebar` only has "General" tab
- `SpaceSettingsView` type only has `"general" | "none"`

## Changes

### 1. SpaceClient: Add `updateSpaceSources` method

**`common/src/core/SpaceClient.ts`**

```typescript
updateSpaceSources(
  spaceId: number,
  sources: Array<SpaceSource>,
): Promise<{ sources: Array<SpaceSource> }>;
```

Implementation: `PATCH /api/v1/spaces/${spaceId}/sources` with body `{ sources }`.

### 2. Extend SpaceSettingsView type

**`frontend/src/contexts/NavigationContext.tsx`** (or wherever `SpaceSettingsView` is defined)

```typescript
export type SpaceSettingsView = "general" | "sources" | "none";
```

Add route parsing for `/spaces/:id/settings/sources`.

### 3. Add "Sources" tab to SpaceSettingsSidebar

**`frontend/src/ui/spaces/settings/SpaceSettingsSidebar.tsx`**

Add a nav item after "General":

```typescript
{
  id: "sources",
  label: content.sourcesTab.value,
  icon: Plug, // from lucide-react
  path: `/spaces/${space.id}/settings/sources`,
}
```

### 4. Create SpaceSourcesSettings component

**`frontend/src/ui/spaces/settings/SpaceSourcesSettings.tsx`** (new)

Layout follows `SpaceGeneralSettings` patterns:

```
┌─────────────────────────────────────────┐
│ Sources                                 │
│ Connect integrations to this space.     │
│ When code changes are pushed to a       │
│ connected repo, impact analysis runs    │
│ automatically.                          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ + Add Source                        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Connected Sources                       │
│ ┌─────────────────────────────────────┐ │
│ │ [GitHub] org/backend  main          │ │
│ │                          [toggle] X │ │
│ ├─────────────────────────────────────┤ │
│ │ [GitHub] org/frontend main          │ │
│ │                          [toggle] X │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ (empty state when no sources)           │
│ "No sources connected. Add a GitHub     │
│  integration to enable automatic        │
│  impact analysis."                      │
└─────────────────────────────────────────┘
```

**Data flow:**
1. On mount: read `space.sources` from `useSpace()` context
2. Fetch available integrations via `client.integrations().listIntegrations()`
3. Filter to active GitHub integrations not already attached
4. "Add Source" shows a dropdown/select of available integrations
5. On add: append to sources array, call `updateSpaceSources(spaceId, newSources)`
6. Toggle: update `enabled` flag, call `updateSpaceSources`
7. Remove: filter out, call `updateSpaceSources`
8. After mutation: refresh space data

**Each source row displays:**
- Integration icon (GitHub)
- Repo name (from integration metadata: `integration.name` or `metadata.repo`)
- Branch (from integration metadata or source override)
- Enabled toggle (Switch component)
- Remove button (Trash2 icon, with confirmation)

### 5. Wire into Space Settings routing

**`frontend/src/ui/spaces/settings/SpaceSettings.tsx`** (or equivalent)

Add conditional render:

```typescript
{spaceSettingsView === "sources" && <SpaceSourcesSettings />}
```

### 6. Add intlayer translations

**`frontend/src/internationalization/spaces/`** (new or existing content file)

Keys needed:
- `sourcesTab`: "Sources"
- `sourcesTitle`: "Sources"
- `sourcesDescription`: "Connect integrations to this space..."
- `addSource`: "Add Source"
- `connectedSources`: "Connected Sources"
- `noSourcesTitle`: "No sources connected"
- `noSourcesDescription`: "Add a GitHub integration to enable automatic impact analysis."
- `confirmRemoveSource`: "Remove {name} from this space?"
- `sourceAdded`: "Source added"
- `sourceRemoved`: "Source removed"
- `sourceUpdated`: "Source updated"

## Files

### New Files

| File | Description |
|------|-------------|
| `frontend/src/ui/spaces/settings/SpaceSourcesSettings.tsx` | Sources settings component |
| `frontend/src/internationalization/spaces/space-sources-settings.content.ts` | i18n content |

### Modified Files

| File | Change |
|------|--------|
| `common/src/core/SpaceClient.ts` | Add `updateSpaceSources` method |
| `common/src/core/SpaceClient.test.ts` | Tests for new method |
| `frontend/src/contexts/NavigationContext.tsx` | Extend `SpaceSettingsView` type |
| `frontend/src/ui/spaces/settings/SpaceSettingsSidebar.tsx` | Add "Sources" nav item |
| `frontend/src/ui/spaces/settings/SpaceSettings.tsx` | Route to `SpaceSourcesSettings` |
| `frontend/src/test/IntlayerMock.ts` | Add mock translations |

## Dependencies

- Active GitHub integrations must exist (configured via Settings > Sources)
- Space must exist
- User must have permission to edit the space

## Notes

- When the `sources` table replaces the JSONB column (v2 phase 0), this UI will need to switch from `PATCH /spaces/:id/sources` to the new `POST /spaces/:id/sources` (bind) and `DELETE /spaces/:id/sources/:sourceId` (unbind) endpoints. The visual layout stays the same.
- Branch override is not exposed in the UI initially — uses the integration's configured branch. Can be added later.
- JRN pattern override is not exposed — uses the default derived from integration metadata. Can be added later.
