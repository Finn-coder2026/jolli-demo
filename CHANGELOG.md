# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Unified Sidebar Navigation**: New modern sidebar that consolidates all navigation into a single, collapsible sidebar
  - Quick org/tenant switching at the top
  - Favorite spaces and sites for quick access
  - View All dropdowns with search for browsing all spaces/sites
  - Responsive design that adapts to all viewports
  - Built-in theme switcher and user profile menu
  - New Inbox tab for recent drafts and activity
- Comprehensive E2E tests for unified sidebar (41 test scenarios)
- SitesContext for managing site state and favorites
- SpaceContext improvements for favorite spaces management
- Preferences system for sidebar state, favorites, and user settings

### Changed
- **Unified sidebar navigation is now the default** - The modern unified sidebar is now enabled by default as of January 2026
  - All users will see the new unified sidebar navigation automatically
  - Users can temporarily switch back to legacy navigation via browser console: `localStorage.setItem('tenant:useUnifiedSidebar', 'false')`
  - Legacy two-tier navigation will be removed in a future release
- Improved Sites component with context-based state management and favorite functionality
- Enhanced Spaces component with favorite toggle in space switcher dropdown
- Updated test infrastructure to support both navigation modes

### Fixed
- Improved test coverage to maintain 100% coverage across all new components
- Enhanced responsive behavior for sidebar on mobile and tablet viewports

## Migration Guide

### For Users

The unified sidebar is now the default navigation experience. Key changes:

**What's New:**
- All navigation is now in a single sidebar on the left
- Quick access to your favorite spaces and sites
- Search functionality to find spaces and sites quickly
- Inbox tab shows recent drafts and activity
- Theme switcher and profile menu moved to sidebar bottom

**Temporary Rollback (if needed):**
If you encounter issues with the new sidebar, you can temporarily switch back:
1. Open your browser's DevTools (F12)
2. Go to the Console tab
3. Run: `localStorage.setItem('tenant:useUnifiedSidebar', 'false')`
4. Refresh the page

To re-enable the unified sidebar:
```javascript
localStorage.setItem('tenant:useUnifiedSidebar', 'true')
```

**Note:** The legacy navigation will be removed in a future release.

### For Developers

The unified sidebar is controlled by the `useUnifiedSidebar` preference in `PreferencesRegistry.ts`:
- Default is now `true` (previously `false`)
- Preference is scoped per-tenant
- Stored in browser localStorage

**Key Components:**
- Main: `frontend/src/ui/unified-sidebar/UnifiedSidebar.tsx`
- Tests: `frontend/src/ui/unified-sidebar/UnifiedSidebar.test.tsx`
- E2E: `e2e/tests/UnifiedSidebar.spec.ts`
- Context: `frontend/src/contexts/SpaceContext.tsx`, `frontend/src/contexts/SitesContext.tsx`

**What's Deprecated:**
- Legacy two-tier navigation (header + sidebar)
- Will be removed in next major release after monitoring period

See `DEVELOPERS.md` for comprehensive documentation on the unified sidebar.

---

## [Previous Versions]

(Version history will be documented here in future releases)
