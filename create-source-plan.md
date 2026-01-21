# Plan: Source Article Indicators and R/W/X Permissions

## Overview

When a user uploads a file via the Static File integration, the resulting article should:
1. Display a visual indicator showing it's a "source" article (uploaded document)
2. Show read/write/execute permission columns
3. For source docs: disable write and execute permissions (read-only)

## Current State

### Doc Model (`backend/src/model/Doc.ts`)
- `source`: JSONB field storing `{ type: "static_file", integrationId: number }` for uploaded files
- `sourceMetadata`: JSONB field storing `{ filename, uploadedAt }` for uploads
- `contentMetadata`: Contains display-friendly metadata like `sourceName`, `status`, `qualityScore`

### Integration Upload Flow (`backend/src/router/IntegrationRouter.ts`)
- POST `/api/integrations/:id/upload` creates a doc with:
  - `source: { integrationId, type: "static_file" }`
  - `sourceMetadata: { filename, uploadedAt }`
  - `contentMetadata: { title, sourceName: integration.name }`

### Article UI (`frontend/src/ui/Articles.tsx`)
- Shows article list with title, source name, status, quality score
- Currently no permission indicators

## Implementation Plan

### Step 1: Add Permission Types to Common

**File:** `common/src/types/Doc.ts`

Add to `DocContentMetadata`:
```typescript
interface DocContentMetadata {
  // ... existing fields
  permissions?: {
    read: boolean;
    write: boolean;
    execute: boolean;
  };
  isSourceDoc?: boolean;  // True for uploaded/external source documents
}
```

### Step 2: Update Integration Upload to Set Permissions

**File:** `backend/src/router/IntegrationRouter.ts`

When creating a doc from static file upload, set:
```typescript
contentMetadata: {
  title: data.filename,
  sourceName: integration.name,
  isSourceDoc: true,
  permissions: {
    read: true,
    write: false,   // Disabled for source docs
    execute: false, // Disabled for source docs
  },
}
```

### Step 3: Add Source Badge to Article List

**File:** `frontend/src/ui/Articles.tsx`

Add a "Source" badge next to articles that have `isSourceDoc: true`:
```tsx
{doc.contentMetadata?.isSourceDoc && (
  <Badge variant="outline" className="text-xs">
    <FileUp className="h-3 w-3 mr-1" />
    Source
  </Badge>
)}
```

### Step 4: Add Permission Columns to Article List

**File:** `frontend/src/ui/Articles.tsx`

Add R/W/X columns to the article table:
```tsx
// Column headers
<th>R</th>
<th>W</th>
<th>X</th>

// Column cells
<td>{doc.contentMetadata?.permissions?.read ? "✓" : "—"}</td>
<td>{doc.contentMetadata?.permissions?.write ? "✓" : "—"}</td>
<td>{doc.contentMetadata?.permissions?.execute ? "✓" : "—"}</td>
```

For source docs, W and X should show as disabled (grayed out or with a lock icon).

### Step 5: Update Article Detail View

**File:** `frontend/src/ui/Article.tsx`

Add permissions section to the info panel:
```tsx
<div className="permissions-section">
  <h4>Permissions</h4>
  <div className="flex gap-2">
    <Badge variant={permissions.read ? "default" : "secondary"}>Read</Badge>
    <Badge variant={permissions.write ? "default" : "secondary"}>Write</Badge>
    <Badge variant={permissions.execute ? "default" : "secondary"}>Execute</Badge>
  </div>
  {isSourceDoc && (
    <p className="text-muted-foreground text-sm">
      Source documents are read-only
    </p>
  )}
</div>
```

### Step 6: Disable Edit Actions for Source Docs

**File:** `frontend/src/ui/Articles.tsx` and `frontend/src/ui/Article.tsx`

Conditionally disable/hide edit buttons:
```tsx
{!doc.contentMetadata?.isSourceDoc && (
  <Button onClick={handleEdit}>Edit</Button>
)}
```

Or show a disabled state with tooltip explaining why.

### Step 7: Add Translations

**File:** `frontend/src/ui/Articles.content.ts`

```typescript
sourceDocBadge: t({ en: "Source", es: "Fuente" }),
permissionsRead: t({ en: "Read", es: "Lectura" }),
permissionsWrite: t({ en: "Write", es: "Escritura" }),
permissionsExecute: t({ en: "Execute", es: "Ejecutar" }),
sourceDocReadOnly: t({
  en: "Source documents are read-only",
  es: "Los documentos fuente son de solo lectura"
}),
```

### Step 8: Update Tests

Files to update:
- `frontend/src/ui/Articles.test.tsx` - Test permission columns display
- `frontend/src/ui/Article.test.tsx` - Test permissions in detail view
- `backend/src/router/IntegrationRouter.test.ts` - Test permissions set on upload
- `common/src/types/Doc.ts` tests if any exist

## File Changes Summary

| File | Change |
|------|--------|
| `common/src/types/Doc.ts` | Add `permissions` and `isSourceDoc` to `DocContentMetadata` |
| `backend/src/router/IntegrationRouter.ts` | Set permissions when creating doc from upload |
| `frontend/src/ui/Articles.tsx` | Add Source badge and R/W/X columns |
| `frontend/src/ui/Articles.content.ts` | Add translations |
| `frontend/src/ui/Article.tsx` | Show permissions in detail view |
| `frontend/src/ui/Article.content.ts` | Add translations |
| Tests | Update all relevant test files |

## Visual Design

### Article List View
```
| Title        | Source      | Status    | R | W | X | Actions    |
|--------------|-------------|-----------|---|---|---|------------|
| API Guide    | GitHub Docs | Up to Date| ✓ | ✓ | ✓ | Edit View  |
| FAQ [Source] | My Uploads  | —         | ✓ | 🔒| 🔒| View       |
```

### Permission Indicators
- ✓ = Enabled (green checkmark)
- 🔒 = Disabled for source docs (lock icon, grayed)
- — = Not applicable

## Future Considerations

1. **GitHub source docs**: Could also be marked as source docs with limited write permissions
2. **Permission inheritance**: Permissions could be inherited from the integration settings
3. **Role-based permissions**: Could tie into user roles in the future
4. **Execute permission meaning**: Define what "execute" means (e.g., can trigger jobs, can be published)
