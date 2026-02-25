
# Unified Sidebar Navigation Refactor Plan

## Project Overview

Refactor the Jolli application from a two-tier navigation system (left sidebar with tabs + top header) to a unified sidebar design that consolidates all navigation into a single, streamlined component.

## Current vs Target Architecture

### Current (Two-Tier System)
```
┌──────────┬──────────────────────────────────┐
│          │  Header: Tenant, Org, Search,    │
│  Logo &  │  Theme, Notifications, User      │
│  Sidebar │                                  │
│          ├──────────────────────────────────┤
│  Tabs:   │                                  │
│  - Dash  │  Main Content Area               │
│  - Arts  │                                  │
│  - Sites │                                  │
│  - Int   │                                  │
│  - Set   │                                  │
└──────────┴──────────────────────────────────┘
```

### Target (Unified Sidebar)
```
┌─────────────────────┬──────────────────────┐
│ 🏢 Acme Corp        │                      │
├─────────────────────┤                      │
│ 📥 Inbox            │                      │
│ 📊 Dashboard        │                      │
├─────────────────────┤  Main Content Area   │
│ 📚 Spaces ▼         │  (No top header)     │
│   [E] Engineering   │                      │
│   [P] Public Docs   │                      │
│   View All Spaces   │                      │
├─────────────────────┤                      │
│ 🌐 Sites ▼          │                      │
│   [I] Internal Eng  │                      │
│   [P] Public Docs   │                      │
│   View All Sites    │                      │
├─────────────────────┤                      │
│ ...                 │                      │
├─────────────────────┤                      │
│ ⚙️ Account Settings │                      │
│ [JD] John Doe       │                      │
└─────────────────────┴──────────────────────┘
```

## Key Changes

1. **Unified Navigation**: Single sidebar replaces both current sidebar and header
2. **Org/Tenant Selector**: Moved to top of sidebar
3. **Favorites System**: Spaces and Sites use star-based favorites (not recent items)
4. **View All Dropdowns**: Opens side panel with search, not navigation to full page
5. **New Inbox**: Add new "Inbox" navigation item with unread badge
6. **Create Buttons**: "+" buttons in section headers to create new spaces/sites
7. **External Links**: Sites have external link icon to open URL in new tab
8. **Bottom Utilities**: Account Settings and User Profile (with theme switcher)
9. **Two-Level Collapse System**:
   - Section-level: Spaces/Sites sections can collapse independently
   - Sidebar-level: Entire sidebar collapses to icon-only mode via hoverable rail

## Sidebar States

### Expanded State
- Full width (260px) showing icons and labels
- All section headers (Spaces, Sites) are individually collapsible
- Favorites lists are fully visible
- User profile shows avatar, name, and email

### Collapsed State (Icon Mode)
- Narrow width (60px) showing only icons
- Tooltips appear on hover for each item
- Spaces and Sites sections show as dropdown menus when clicked
- User profile shows only avatar
- Notification badge overlays on the Inbox icon

### Collapse/Expand Toggle
- **Hoverable rail** on the right edge of the sidebar
- Rail appears on sidebar hover
- Click rail to toggle between expanded and collapsed states
- Shows chevron icon indicating expand/collapse direction

### Section Collapse/Expand
- Spaces and Sites sections have independent collapse/expand toggles in their headers
- Section collapse state is saved to preferences (`sidebarSpacesExpanded`, `sidebarSitesExpanded`)
- Works in both expanded and collapsed sidebar modes

## Critical Files

1. **frontend/src/ui/AppLayout.tsx** - Main layout container with sidebar and header (needs major refactoring)
2. **frontend/src/contexts/NavigationContext.tsx** - Navigation state management (add Inbox tab)
3. **frontend/src/contexts/SpaceContext.tsx** - Space management (add recent tracking)
4. **frontend/src/services/preferences/PreferencesRegistry.ts** - Preferences (add new sidebar state)
5. **frontend/src/ui/MainElement.tsx** - App root (wire up new SitesContext)

## Implementation Plan (14 Issues)

### Phase 1: Foundation (Issues 1-2)

#### Issue 1: Add sidebar state preferences and context updates
**Files to Modify:**
- `frontend/src/services/preferences/PreferencesRegistry.ts`
- `frontend/src/contexts/SpaceContext.tsx`

**Changes:**
- Add `sidebarSpacesExpanded` preference (boolean, default: true)
- Add `sidebarSitesExpanded` preference (boolean, default: true)
- Add `favoriteSpaces` preference (array, space IDs marked as favorites)
- Add `favoriteSites` preference (array, site IDs marked as favorites)
- Add `toggleSpaceFavorite(spaceId)` method to SpaceContext
- Add `favoriteSpaces` computed property to SpaceContext
- Add `isFavorite(spaceId)` helper method

**Acceptance Criteria:**
- All preferences properly serialize/deserialize
- SpaceContext tracks favorite spaces via localStorage
- 100% test coverage maintained

---

#### Issue 2: Create SitesContext provider for unified site management
**Files to Create:**
- `frontend/src/contexts/SitesContext.tsx`
- `frontend/src/contexts/SitesContext.test.tsx`

**Files to Modify:**
- `frontend/src/ui/MainElement.tsx` (add provider)

**Changes:**
- Create SitesContext with provider and hooks
- Provide: `currentSite`, `sites`, `favoriteSites` state
- Implement: `loadSites()`, `toggleSiteFavorite()`, `isFavorite()` methods
- Add `useSites()` and `useCurrentSite()` hooks
- Use `favoriteSites` preference from Issue 1

**Acceptance Criteria:**
- Context follows SpaceContext pattern
- Integrates with existing Sites API client
- Full unit test coverage

---

### Phase 2: Core Components (Issues 3-7)

#### Issue 3: Build UnifiedSidebar component with basic structure
**Files to Create:**
- `frontend/src/ui/UnifiedSidebar.tsx`
- `frontend/src/ui/UnifiedSidebar.test.tsx`
- `frontend/src/ui/UnifiedSidebar.content.ts` (i18n)

**Changes:**
- Create UnifiedSidebar with layout structure
- Implement collapse/expand with hoverable rail on right edge
- Add navigation items: Inbox (with unread badge), Dashboard
- Add placeholder sections for Spaces and Sites
- Add bottom utilities placeholder
- Responsive: collapse on narrow screens (<1024px)
- Use CSS flexbox with sticky bottom section
- Collapsed state shows dropdown menus for Spaces/Sites on click

**Acceptance Criteria:**
- Sidebar width: 260px expanded, 60px collapsed
- Hoverable rail appears on sidebar hover for toggle
- Keyboard navigation support
- ARIA labels for accessibility
- Full unit test coverage

---

#### Issue 4: Build combined org/tenant selector for sidebar top
**Files to Create:**
- `frontend/src/ui/unified-sidebar/OrgTenantSelector.tsx`
- `frontend/src/ui/unified-sidebar/OrgTenantSelector.test.tsx`
- `frontend/src/ui/unified-sidebar/OrgTenantSelector.content.ts`

**Changes:**
- Display current org name with dropdown
- Show tenant info in multi-tenant mode
- Dropdown shows available orgs and tenants
- Support switching between tenants/orgs
- Show icons/avatars
- Collapsed state shows just icon
- Reuse logic from existing TenantSwitcher and OrgSwitcher

**Acceptance Criteria:**
- Works in both single and multi-tenant modes
- Switching triggers appropriate navigation
- Full test coverage for all scenarios

---

#### Issue 5: Build collapsible spaces section with favorites list
**Files to Create:**
- `frontend/src/ui/unified-sidebar/SpacesFavoritesList.tsx`
- `frontend/src/ui/unified-sidebar/SpacesFavoritesList.test.tsx`
- `frontend/src/ui/unified-sidebar/SpacesFavoritesList.content.ts`
- `frontend/src/ui/unified-sidebar/ViewAllSpacesDropdown.tsx`

**Changes:**
- Show favorited spaces with colored icon badges
- "+" button in header to create new space
- Star icon on hover to remove from favorites
- "No favorites yet" message if empty
- Expand/collapse with saved state (`sidebarSpacesExpanded`)
- "View All Spaces" opens side dropdown panel with:
  - Search field to filter spaces
  - Full list of all spaces
  - Star toggle to add/remove favorites
  - Click space navigates and closes dropdown
- Collapsed sidebar shows icon with dropdown menu

**Acceptance Criteria:**
- Uses SpaceContext for favorites data
- Favorites persist across sessions
- Accordion-style expand/collapse
- Full test coverage

---

#### Issue 6: Build collapsible sites section with favorites list
**Files to Create:**
- `frontend/src/ui/unified-sidebar/SitesFavoritesList.tsx`
- `frontend/src/ui/unified-sidebar/SitesFavoritesList.test.tsx`
- `frontend/src/ui/unified-sidebar/SitesFavoritesList.content.ts`
- `frontend/src/ui/unified-sidebar/ViewAllSitesDropdown.tsx`

**Changes:**
- Show favorited sites with colored icon badges
- "+" button in header to create new site
- External link icon on hover to open site URL in new tab
- Star icon on hover to remove from favorites
- "No favorites yet" message if empty
- Expand/collapse with saved state (`sidebarSitesExpanded`)
- "View All Sites" opens side dropdown panel with:
  - Search field to filter sites
  - Full list of all sites with external link buttons
  - Star toggle to add/remove favorites
  - Click site navigates and closes dropdown
- Collapsed sidebar shows icon with dropdown menu

**Acceptance Criteria:**
- Uses SitesContext from Issue 2
- Favorites persist across sessions
- External links open in new tab
- Full test coverage

---

#### Issue 7: Build bottom utilities section for unified sidebar
**Files to Create:**
- `frontend/src/ui/unified-sidebar/SidebarBottomSection.tsx`
- `frontend/src/ui/unified-sidebar/SidebarBottomSection.test.tsx`
- `frontend/src/ui/unified-sidebar/SidebarBottomSection.content.ts`

**Changes:**
- Account Settings link with icon
- User profile dropdown with avatar, name, and email
- User profile dropdown menu contains:
  - My Profile (navigates to user profile page)
  - Personal Settings (navigates to personal settings page)
  - Theme Switcher (3-button toggle: System, Light, Dark)
  - Log out (logs user out)
- All items work in collapsed mode (avatar only)
- Tooltips in collapsed mode

**Acceptance Criteria:**
- Reuses logic from AppLayout header
- Uses existing SimpleDropdown components
- Theme switcher has 3 options (not just toggle)
- Vertical layout for sidebar context
- Full test coverage

---

### Phase 3: Integration (Issues 8-11)

#### Issue 8: Replace current sidebar with UnifiedSidebar in AppLayout
**Files to Modify:**
- `frontend/src/ui/AppLayout.tsx`
- `frontend/src/ui/AppLayout.test.tsx`
- Backend config (add USE_UNIFIED_SIDEBAR flag)

**Changes:**
- Add `USE_UNIFIED_SIDEBAR` config flag (default: false)
- Replace sidebar in AppLayout when flag is true
- Remove or minimize top header
- Update layout grid/flex structure
- Maintain all existing navigation functionality
- Update responsive breakpoints
- Conditional rendering: old sidebar vs UnifiedSidebar

**Acceptance Criteria:**
- Both old and new paths work independently
- Feature flag allows easy toggle
- No visual regressions
- AppLayout tests cover both modes

---

#### Issue 9: Implement Inbox view and navigation
**Files to Create:**
- `frontend/src/ui/Inbox.tsx`
- `frontend/src/ui/Inbox.test.tsx`
- `frontend/src/ui/Inbox.content.ts`

**Files to Modify:**
- `frontend/src/contexts/NavigationContext.tsx`
- `frontend/src/ui/MainElement.tsx`

**Changes:**
- Add "inbox" to TAB_NAMES in NavigationContext
- Create Inbox component (placeholder or basic functionality)
- Add inbox icon to navigation
- Add routing for `/inbox` path
- i18n support for Inbox label

**Acceptance Criteria:**
- Inbox tab appears in UnifiedSidebar
- Navigation works correctly
- Full test coverage

---

#### Issue 10: Update Sites component to work with sidebar favorites
**Files to Modify:**
- `frontend/src/ui/Sites.tsx`
- `frontend/src/ui/sites/SiteDetail.tsx`

**Changes:**
- Integrate SitesContext hooks
- Add favorite toggle functionality to site views
- Maintain existing grid view functionality
- Update breadcrumb/navigation elements
- Test navigation from sidebar to site detail
- Ensure external link functionality works

**Acceptance Criteria:**
- Favorite sites persist properly
- Navigation flows work correctly
- External links open in new tab
- Full test coverage

---

#### Issue 11: Update Spaces component for sidebar integration
**Files to Modify:**
- `frontend/src/ui/Spaces.tsx`
- `frontend/src/ui/spaces/SpaceTreeNav.tsx`

**Changes:**
- Remove or simplify standalone SpaceSwitcher
- Add favorite toggle functionality to space views
- Ensure dropdown navigation works correctly
- Maintain existing tree navigator functionality
- Integrate with favorites system

**Acceptance Criteria:**
- SpaceSwitcher removed or hidden when appropriate
- Favorite tracking works correctly
- Dropdown closes after navigation
- Full test coverage

---

### Phase 4: Testing & Rollout (Issues 12-14)

#### Issue 12: Create Playwright E2E tests for unified sidebar navigation
**Files to Create:**
- `e2e/tests/UnifiedSidebar.spec.ts`

**Changes:**
- Test org/tenant switching from sidebar
- Test space favorites toggle and navigation
- Test site favorites toggle and navigation
- Test "View All" dropdown panels with search
- Test external link opening in new tab
- Test sidebar collapse/expand with hoverable rail
- Test bottom section utilities (theme switcher, profile menu)
- Test inbox badge display
- Test create buttons for spaces/sites
- Test responsive behavior
- Test keyboard navigation

**Acceptance Criteria:**
- All tests pass consistently
- Follow existing E2E test patterns
- Use data-testid attributes

---

#### Issue 13: Switch default to unified sidebar and deprecate old navigation
**Files to Modify:**
- Backend config (flip USE_UNIFIED_SIDEBAR default)
- `frontend/DEVELOPERS.md`
- Any other documentation

**Changes:**
- Set USE_UNIFIED_SIDEBAR default to true
- Update all documentation to reflect new navigation
- Add migration guide for users
- Monitor for issues
- Prepare rollback plan

**Acceptance Criteria:**
- Documentation fully updated
- Changelog entry added
- Monitoring in place

---

#### Issue 14: Clean up deprecated navigation components and code
**Files to Modify:**
- `frontend/src/ui/AppLayout.tsx`
- `frontend/src/ui/AppLayout.test.tsx`

**Files to Potentially Remove:**
- `frontend/src/components/TenantSwitcher.tsx` (if not used elsewhere)
- `frontend/src/components/OrgSwitcher.tsx` (if not used elsewhere)

**Changes:**
- Remove USE_UNIFIED_SIDEBAR feature flag
- Remove old sidebar code from AppLayout (lines 135-199)
- Remove old header if not needed (lines 207-296)
- Clean up imports and dependencies
- Update tests to remove old code paths

**Acceptance Criteria:**
- All old code removed
- 100% test coverage maintained
- Full test suite passes
- No regressions

---

## Implementation Order

1. **Issue 1** - Foundation: Preferences
2. **Issue 2** - Foundation: SitesContext
3. **Issue 3** - Core: UnifiedSidebar structure
4. **Issue 4** - Component: OrgTenantSelector
5. **Issue 5** - Component: SpacesQuickList
6. **Issue 6** - Component: SitesQuickList
7. **Issue 7** - Component: SidebarBottomSection
8. **Issue 8** - Integration: AppLayout with feature flag
9. **Issue 9** - Feature: Inbox view
10. **Issue 10** - Integration: Update Sites
11. **Issue 11** - Integration: Update Spaces
12. **Issue 12** - Testing: E2E tests
13. **Issue 13** - Rollout: Enable by default
14. **Issue 14** - Cleanup: Remove old code

## Migration Strategy

### Gradual Rollout
1. **Phase 1-2**: Build components without affecting production (Issues 1-7)
2. **Phase 3**: Integrate with feature flag off by default (Issue 8)
3. **Phase 3**: Complete integration work (Issues 9-11)
4. **Phase 4**: Test, enable, and clean up (Issues 12-14)

### Feature Flag Approach
- `USE_UNIFIED_SIDEBAR` config flag controls which sidebar renders
- Old code remains until Phase 4 cleanup
- Instant rollback capability if issues arise

### Risk Mitigation
- Incremental testing at each phase
- Parallel implementation keeps old code working
- Preference-based state maintains user settings
- Comprehensive E2E testing before rollout

## Verification Plan

### After Each Phase
1. Run full test suite: `npm run test`
2. Check test coverage: Maintain 100%
3. Run linter: `npm run lint`
4. Manual testing in dev environment

### Before Rollout (Issue 13)
1. Run E2E tests: `npm run e2e --workspaces=false`
2. Test in multi-tenant configuration
3. Test responsive behavior on mobile
4. Test keyboard navigation
5. Test with screen reader
6. Performance testing (bundle size, render time)

### After Rollout
1. Monitor error logs
2. Gather user feedback
3. Watch for navigation-related issues
4. Check analytics for usage patterns

## Technical Considerations

### Bundle Size
- Keep sidebar components lightweight
- Use code splitting for quick lists if needed
- Monitor impact on initial load time

### Accessibility
- Keyboard navigation for all items
- ARIA labels on interactive elements
- Focus management when expanding/collapsing
- Screen reader announcements for state changes

### Performance
- Lazy load space/site lists
- Debounce search input
- Optimize avatar rendering
- Minimize re-renders with React.memo where appropriate

### Browser Support
- Test in Chrome, Firefox, Safari, Edge
- Ensure touch interactions work on mobile
- Verify CSS compatibility

---

## Notes

- Current "Articles" tab actually renders Spaces component (MainElement.tsx:243)
- SpaceSwitcher currently in left panel of Spaces view - needs relocation/removal
- TenantSwitcher and OrgSwitcher may be reusable for new selector component
- Maintain existing URL routing structure for backward compatibility
