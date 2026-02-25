# Remove Dead Articles List View Code

## Summary
The old Articles list view is no longer reachable in the runtime UI. The `articles` tab now renders the Spaces (tree) view instead of `Articles`, and there is no route that renders the `Articles` component. This document proposes removing the dead code paths and related tests.

## Why This Is Dead
- `frontend/src/ui/MainElement.tsx` maps `articles` to `Spaces`, not `Articles`.
- There is no route that renders `<Articles />` or `<Article />` list view entry point.
- The list view delete action is only accessible from the dead `Articles` component.

## Proposed Removals
Remove the unused list view UI and tests.

### UI Components
- `frontend/src/ui/Articles.tsx`
- `frontend/src/ui/Articles.content.ts`
- `frontend/src/ui/Articles.test.tsx`
- `frontend/src/ui/Article.tsx`
- `frontend/src/ui/Article.content.ts`
- `frontend/src/ui/Article.test.tsx`
- `frontend/src/ui/ArticlesWithSuggestedUpdates.tsx` (only reachable via articles route subpath)
- `frontend/src/ui/ArticlesWithSuggestedUpdates.content.ts`
- `frontend/src/ui/ArticlesWithSuggestedUpdates.test.tsx`

### Route/Navigation Cleanup
- `frontend/src/contexts/NavigationContext.tsx`
  - Remove `parseArticleRoute` and `articleView` handling.
- `frontend/src/ui/MainElement.tsx`
  - Remove `ArticlesWithSuggestedUpdates` routing branch.
  - Remove unused imports and the `Articles` slot from `ViewComponents` if not needed.

### Localization
- Remove unused article list view strings from intlayer files.
  - `frontend/src/test/IntlayerMock.ts` (test-only strings)
  - Real content files used by the removed components

## Safety Checks
- Confirm no production route or UI entry point references `/articles/*` for the list view.
- Confirm any dev tools or deep links that used `/articles/*` are updated or removed.

## Suggested Implementation Steps
1. Delete the component and test files listed above.
2. Remove route parsing and related state in `NavigationContext`.
3. Remove any references in `MainElement` and associated tests.
4. Clean up localization strings and test mocks.
5. Run frontend unit tests.

## Risk
Low, but be cautious if any internal tooling or deep links still rely on `/articles/*` list routes.

## Optional Follow-Up
If list view may return, archive these files instead of deletion, or move them to an `archive/` folder and update build tooling accordingly.
