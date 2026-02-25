# Implementation Plan: Path-Based Multi-Tenant Architecture + URL Readability

## Context

### Business Requirements
**Product Team's Strategic Decision**:
1. **URL Readability**: Use human-readable articles slug that includes article titles and UUIDs, like `/getting-started-a1b2c3d45678`
2. **Tiered Business Model**:
   - Free/Basic tier: `jolli.ai/tenant/article` (path-based)
   - Enterprise/Paid tier: `tenant.jolli.ai/article` (subdomain, future paid unlock)
   - Enterprise/Custom domain: `docs.company.com/article` (clean URL, no tenant prefix)

3. **Positioning Strategy**: Similar to Zoom model - default uses main domain, enterprise customers upgrade to get subdomains

### Core Goals
1. ✅ **Readable URLs**: Use human-readable slugs
2. ✅ **Path-Based Architecture**: Default uses `jolli.ai/tenant/...`
3. ✅ **Enterprise Experience**: Custom domains get clean URLs (no tenant prefix)
4. ✅ **Keep OAuth/Cookie**: Continue using `auth.jolli.ai` subdomain (unchanged)

---

## Technical Solution Overview

### URL Architecture Design

```
Free/Basic Tier (Path-Based):
  https://jolli.ai/acme/engineering/getting-started
  https://jolli.ai/acme/api/docs

Enterprise Tier - Subdomain (Future Paid Unlock):
  https://acme.jolli.ai/engineering/getting-started
  https://acme.jolli.ai/api/docs

Enterprise Tier - Custom Domain (URL Rewriting):
  External URL: https://docs.acme.com/getting-started
  Internal routing: /:tenant/getting-started (auto-inject tenant)
```

### Core Technical Challenges

**Challenge 1: Routing Consistency**
- Internal routing always uses `/:tenant/path`
- But custom domain external URLs are `/path`
- Need middleware to dynamically rewrite request paths

**Challenge 2: Frontend Routing**
- React Router needs dynamic basename based on domain type
- Custom domain: basename = ""
- Main domain: basename = "/:tenant"

**Challenge 3: URL Generation**
- All URL generation points need domain type awareness
- Link, redirects, API calls all affected

---

## 1. Slug System Implementation (URL Readability)

### 1.1 Database Model Status ✅

**Existing slug fields**:
- ✅ **Tenant** (`manager/src/lib/types/Tenant.ts`) - has `slug` field
- ✅ **Org** - should have (needs confirmation)
- ✅ **Space** (`backend/src/model/Space.ts`) - has `slug` field, allowNull: false
- ✅ **Doc** (`backend/src/model/Doc.ts`) - has `slug` field

**Existing query methods**:
- ✅ **SpaceDao.getSpaceBySlug()** - already implemented

**Missing parts**:
- ❌ **DocDao** - no `getDocBySlug()` method
- ❌ **Routes** - no slug-based routes
- ❌ **Slug generation** - may need auto-generation logic

### 1.2 Additional Functionality Needed

Although fields exist, functionality is incomplete. Need to:
1. Add slug query methods to DocDao
2. Update routes to support slug access
3. Ensure slug generation and uniqueness checking

### 1.3 Slug Generation (Already Exists) ✅

**Existing Slug Utilities**: `common/src/util/SlugUtils.ts`

The project already has a complete slug generation system, **no new file needed**:

```typescript
// 1. Generate unique slug (with random suffix)
generateUniqueSlug(text: string, suffixLength = 7, maxLength = 80): string
// "Getting Started" → "getting-started-x7k9p2"

// 2. Basic slug generation
generateSlug(text: string, maxLength = 80): string
// "Getting Started" → "getting-started"

// 3. Slug validation
isValidSlug(slug: string): boolean

// 4. Path building
buildPath(parentPath: string | null, slug: string): string
// (null, "doc") → "/doc"
```

**Already in use**:
- `SpaceDao.ts` - imports `generateUniqueSlug` from "jolli-common/server"
- `DocDao.ts` - imports `buildPath, generateUniqueSlug` from "jolli-common/server"

**Features**:
- ✅ Chinese support: auto-generates UUID prefix
- ✅ English support: uses `slugify` library for special chars and i18n
- ✅ Auto-uniqueness: appends 7-char nanoid suffix
- ✅ URL-safe: lowercase letters and digits only

### 1.4 DocDao Additional Query Methods (Optional)

**File**: `backend/src/dao/DocDao.ts`

```typescript
// New: Query doc by slug
async getDocBySlug(spaceSlug: string, docSlug: string): Promise<Doc | undefined> {
  // Use existing SpaceDao.getSpaceBySlug
  const space = await this.spaceDao.getSpaceBySlug(spaceSlug);
  if (!space) return undefined;

  return await this.Docs.findOne({
    where: { spaceId: space.id, slug: docSlug, deletedAt: { [Op.is]: null } }
  });
}

// Check if slug exists (for uniqueness validation)
async slugExists(spaceId: number, slug: string): Promise<boolean> {
  const doc = await this.Docs.findOne({
    where: { spaceId, slug, deletedAt: { [Op.is]: null } }
  });
  return doc !== null;
}
```

**Note**: Based on `NewDoc` type definition, slug is already marked optional (`slug?: string`), indicating system may have auto-generation logic. Need to check existing creation logic.

---

## 2. Path-Based Routing Implementation

### 2.1 TenantMiddleware Enhancement - Path Extraction + URL Rewriting

**File**: `backend/src/tenant/TenantMiddleware.ts`

**Core Logic**:
```typescript
async function resolveTenant(req: Request) {
  // Priority 1: Custom domain
  const customDomain = resolveCustomDomain(req, baseDomain);
  if (customDomain) {
    const result = await tryCustomDomainResolution(customDomain);
    if (result) {
      // 🔑 Key: Auto-inject tenant slug to path
      req.url = `/${result.tenant.slug}${req.url}`;
      req.path = `/${result.tenant.slug}${req.path}`;
      return result;
    }
  }

  // Priority 2: Enterprise subdomain (future feature)
  const subdomain = resolveSubdomain(req, baseDomain);
  if (subdomain && subdomain.tenantSlug !== 'jolli') {
    const tenant = await getTenantBySlug(subdomain.tenantSlug);

    // Check if subdomain feature is unlocked (read from feature_flags)
    if (!tenant.feature_flags?.subdomain) {
      // Redirect to path-based
      const redirectUrl = `https://jolli.ai/${tenant.slug}${req.path}`;
      return { status: 307, redirectTo: redirectUrl };
    }

    // Subdomain access: path doesn't need tenant prefix
    // req.path stays as-is, like /engineering/getting-started
    return { tenant, org, database };
  }

  // Priority 3: Path-based (default)
  const pathSegments = req.path.split('/').filter(Boolean);
  const tenantSlug = pathSegments[0];

  if (!tenantSlug) {
    return { status: 404, message: 'Tenant not specified in URL' };
  }

  const tenant = await getTenantBySlug(tenantSlug);
  // ... tenant validation logic

  return { tenant, org, database };
}
```

**Key Points**:
- Custom domain: Dynamically inject tenant to path (`/article` → `/acme/article`)
- Path-based: Extract tenant from path (`/acme/article` → tenant = "acme")
- Subdomain: Path unchanged (`acme.jolli.ai/article` → tenant = "acme")

### 2.2 Frontend Dynamic Routing

**File**: `frontend/src/Main.tsx`

```typescript
function App() {
  const [tenantContext, setTenantContext] = useState<TenantContext | null>(null);

  useEffect(() => {
    // Detect domain type
    const hostname = window.location.hostname;
    const isCustomDomain = checkIsCustomDomain(hostname);
    const isSubdomain = checkIsSubdomain(hostname);

    // Get tenant context
    const context = await fetchTenantContext();
    setTenantContext(context);
  }, []);

  if (!tenantContext) {
    return <Loading />;
  }

  // 🔑 Key: Decide basename based on domain type
  const basename = tenantContext.isCustomDomain || tenantContext.isSubdomain
    ? ""  // Custom domain or subdomain: no basename
    : `/${tenantContext.tenant.slug}`;  // Path-based: include tenant

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/:spaceSlug/:docSlug" element={<DocView />} />
        {/* All routes don't include :tenant, handled by basename */}
      </Routes>
    </BrowserRouter>
  );
}
```

### 2.3 Tenant Context Propagation

**New File**: `frontend/src/contexts/TenantContext.tsx`

```typescript
interface TenantContext {
  tenant: Tenant;
  org: Org;
  isCustomDomain: boolean;
  isSubdomain: boolean;
  urlMode: 'path' | 'subdomain' | 'custom';
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<TenantContext | null>(null);

  useEffect(() => {
    async function loadContext() {
      // Call backend API to get tenant context
      const response = await fetch('/api/tenant/context');
      const data = await response.json();
      setContext(data);
    }
    loadContext();
  }, []);

  return (
    <TenantContext.Provider value={context}>
      {children}
    </TenantContext.Provider>
  );
}

// Custom hook
export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
```

### 2.4 URL Builder Utility

**New File**: `frontend/src/util/UrlBuilder.ts`

```typescript
export class UrlBuilder {
  constructor(private context: TenantContext) {}

  // Generate in-app links
  buildUrl(path: string): string {
    // Custom domain or subdomain: use path directly
    if (this.context.isCustomDomain || this.context.isSubdomain) {
      return path;
    }

    // Path-based: add tenant prefix
    return `/${this.context.tenant.slug}${path}`;
  }

  // Generate absolute URL (for sharing, emails, etc.)
  buildAbsoluteUrl(path: string): string {
    const origin = this.getOrigin();
    const relativePath = this.buildUrl(path);
    return `${origin}${relativePath}`;
  }

  private getOrigin(): string {
    if (this.context.isCustomDomain) {
      return `https://${window.location.hostname}`;
    }
    if (this.context.isSubdomain) {
      return `https://${this.context.tenant.slug}.jolli.ai`;
    }
    return 'https://jolli.ai';
  }
}

// React hook
export function useUrlBuilder() {
  const context = useTenant();
  return new UrlBuilder(context);
}
```

### 2.5 API Client Updates

**File**: `common/src/core/Client.ts`

```typescript
// Modify createClient
export function createClient(
  baseUrl: string = "",
  authToken?: string,
  callbacks?: ClientCallbacks,
  tenantContext?: TenantContext  // New parameter
) {
  async function request<T>(
    method: string,
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    // Construct full URL
    let url = endpoint;

    // If relative path, need to handle tenant prefix
    if (!endpoint.startsWith('http')) {
      if (tenantContext && !tenantContext.isCustomDomain && !tenantContext.isSubdomain) {
        // Path-based: API also needs tenant prefix
        url = `/${tenantContext.tenant.slug}${endpoint}`;
      } else {
        // Custom domain or subdomain: use directly
        url = endpoint;
      }
    }

    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
        'X-Org-Slug': sessionStorage.selectedOrgSlug,
      },
      credentials: 'include',
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    // ... error handling
  }

  return { request, get, post, put, delete: del };
}
```

---

## 3. Tenant Tiering Model (Enterprise Features)

### 3.1 Data Model

**Use existing feature_flags JSONB field**:
```typescript
interface Tenant {
  id: string;
  slug: string;
  name: string;

  // ✅ Use existing feature_flags JSONB field
  feature_flags: {
    tier: 'free' | 'pro' | 'enterprise';  // Pricing tier
    subdomain: boolean;                    // Subdomain access
    customDomain: boolean;                 // Custom domain
    advancedAnalytics: boolean;            // Advanced analytics
    sso: boolean;                          // SSO integration
    dedicatedSupport: boolean;             // Dedicated support
  };

  // Existing fields
  status: 'active' | 'inactive';
  // ...
}
```

**Data migration (update existing feature_flags content only)**:
Don't need below data migration, assume free tier without subdomain support.
```sql
-- No need for ALTER TABLE, feature_flags field already exists
-- Only update existing tenants' feature_flags content with defaults

UPDATE tenants
SET feature_flags = jsonb_set(
  COALESCE(feature_flags, '{}'::jsonb),
  '{tier}',
  '"free"'::jsonb
)
WHERE feature_flags IS NULL OR NOT (feature_flags ? 'tier');

UPDATE tenants
SET feature_flags = jsonb_set(
  feature_flags,
  '{subdomain}',
  'false'::jsonb
)
WHERE NOT (feature_flags ? 'subdomain');

UPDATE tenants
SET feature_flags = jsonb_set(
  feature_flags,
  '{customDomain}',
  'false'::jsonb
)
WHERE NOT (feature_flags ? 'customDomain');
```

### 3.2 Feature Check Middleware

**New File**: `backend/src/middleware/FeatureMiddleware.ts`

```typescript
export function requireFeature(feature: keyof Omit<TenantFeatureFlags, 'tier'>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const context = getTenantContext();

    // Check feature from feature_flags JSONB field
    if (!context.tenant.feature_flags?.[feature]) {
      res.status(403).json({
        error: `Feature '${feature}' not enabled for this tenant`,
        tier: context.tenant.feature_flags?.tier || 'free',
        upgradeUrl: `/upgrade?feature=${feature}`
      });
      return;
    }

    next();
  };
}

// Usage example
router.get('/advanced-analytics',
  requireFeature('advancedAnalytics'),
  async (req, res) => {
    // ... advanced analytics logic
  }
);
```

---

## 4. Implementation Phases

### Phase 1: Slug System (0.5-1 week) ⚠️ Database fields already exist

**Task List**:
- [x] ✅ Confirm slug fields exist (Tenant, Org, Space, Doc)
- [x] ✅ Confirm `common/src/util/SlugUtils.ts` exists and is feature-complete
- [x] ✅ SpaceDao and DocDao already import and use `generateUniqueSlug()`
- [x] ✅ SpaceDao.getSpaceBySlug() already implemented
- [ ] (Optional) Add DocDao.getDocBySlug() method - not needed yet
- [ ] Update routes to support slug queries (backward compatible with ID)
- [ ] Frontend: Use slugs to generate links (check if implemented)
- [ ] Testing: slug uniqueness, conflict handling, backward compatibility

**Verification**:
```bash
# Create doc
POST /api/docs
{
  "title": "Getting Started",
  "spaceId": 123
}
# Returns: { id: 456, slug: "getting-started", ... }

# Access doc (new URL)
GET /api/spaces/engineering/docs/getting-started
# Success returns doc

# Access doc (old URL - backward compatible)
GET /api/spaces/123/docs/456
# 301 redirect to /api/spaces/engineering/docs/getting-started
```

### Phase 2: Path Routing (2-2.5 weeks)

**Task List**:
- [ ] Update TenantMiddleware to add path extraction logic
- [ ] Implement custom domain URL rewriting (inject tenant to path)
- [ ] Create TenantContext API endpoint
- [ ] Frontend: Implement TenantProvider and useTenant hook
- [ ] Frontend: Dynamic basename logic
- [ ] Create UrlBuilder utility class
- [ ] Update API Client to handle tenant prefix
- [ ] Update all Link components to use UrlBuilder
- [ ] Nginx configuration updates (if needed)
- [ ] Testing: Three URL modes (path/subdomain/custom domain)

**Verification**:
```bash
# Path-based
curl https://jolli.ai/acme/engineering/getting-started
# Success returns doc

# Custom domain (URL rewriting)
curl https://docs.acme.com/engineering/getting-started
# Internal routing: /acme/engineering/getting-started
# Success returns doc

# API calls
curl https://jolli.ai/acme/api/docs
curl https://docs.acme.com/api/docs  # Internally rewritten to /acme/api/docs
# Both succeed
```

### Phase 3: Tenant Tiering (1 week)

**Task List**:
- [ ] Update Tenant model `feature_flags` JSONB field structure (add tier, subdomain, etc. keys)
- [ ] Create data migration script to initialize feature_flags defaults for existing tenants
- [ ] Create FeatureMiddleware (read from feature_flags)
- [ ] Implement subdomain feature check (redirect to path)
- [ ] Manager UI: Tenant upgrade functionality (modify feature_flags)
- [ ] Upgrade email notifications
- [ ] Pricing page and upgrade flow
- [ ] Testing: Feature flags, upgrade flow

**Verification**:
```bash
# Free tenant tries to access subdomain
curl https://acme.jolli.ai/dashboard
# 307 redirect to https://jolli.ai/acme/dashboard

# Enterprise tenant after upgrade
# 1. Set feature_flags.subdomain = true in Manager
# 2. Access subdomain
curl https://acme.jolli.ai/dashboard
# Success access (no redirect)
```

### Phase 4: Testing and Optimization (0.5-1 week)

**Task List**:
- [ ] End-to-end testing: All URL modes
- [ ] Performance testing: URL rewriting overhead
- [ ] SEO testing: 301 redirects, canonical URLs
- [ ] User experience testing: URL sharing, bookmarks
- [ ] Error handling: Invalid tenant, feature not unlocked
- [ ] Documentation updates: Developer docs, user guides

**Total**: 4-5.5 weeks (slug fields already exist, saves 0.5 weeks)

---

## 5. Critical Files Checklist

### New Files
```
frontend/src/contexts/TenantContext.tsx    - Tenant context
frontend/src/util/UrlBuilder.ts            - URL builder utility
backend/src/middleware/FeatureMiddleware.ts - Feature check middleware
```

### Existing Files (No changes needed, already functional)
```
common/src/util/SlugUtils.ts              - ✅ Slug generation utility (fully implemented)
backend/src/dao/SpaceDao.ts                - ✅ Already has getSpaceBySlug() method
backend/src/dao/DocDao.ts                  - ✅ Already imports and uses generateUniqueSlug()
```

### Files to Modify
```
backend/src/tenant/TenantMiddleware.ts     - Add path extraction and URL rewriting
backend/src/tenant/DomainUtils.ts          - URL parsing logic
backend/src/model/Doc.ts                   - Confirm slug field configuration
backend/src/model/Space.ts                 - Confirm slug field configuration
backend/src/model/Tenant.ts                - Update feature_flags JSONB field type definition

frontend/src/Main.tsx                      - Dynamic basename and TenantProvider
frontend/src/contexts/ClientContext.tsx    - Pass TenantContext
common/src/core/Client.ts                  - API path handling

manager/src/app/tenants/[id]/page.tsx      - Tenant upgrade UI
```

### Database Migrations
```
migrations/YYYY-MM-DD-init-tenant-feature-flags.sql  - Initialize feature_flags defaults
```

**Notes**:
- Tenant's `feature_flags` JSONB field already exists, no need to add new columns
- Tenant/Org/Space/Doc slug fields already exist, no migration needed

---

## 6. Verification Plan

### 6.1 URL Readability Verification

```bash
# Create doc
POST https://jolli.ai/acme/api/docs
{
  "title": "Getting Started Guide",
  "spaceId": 123
}

# Verify slug generation
# Expected: Returns { slug: "getting-started-guide", ... }

# Access doc
GET https://jolli.ai/acme/engineering/getting-started-guide
# Expected: Success returns doc content

# Share link
# Copy URL to browser or share with others
# Expected: URL is clear and readable, no UUID
```

### 6.2 URL Rewriting Verification (Custom Domain)

```bash
# Configure custom domain (Manager)
# tenant: acme, customDomain: docs.acme.com

# Access custom domain
GET https://docs.acme.com/engineering/getting-started
# Expected:
# 1. TenantMiddleware recognizes custom domain
# 2. Auto-rewrite to /acme/engineering/getting-started
# 3. Success returns doc

# Check frontend routing
# Open https://docs.acme.com/dashboard
# Expected:
# 1. URL bar shows: docs.acme.com/dashboard (no /acme prefix)
# 2. React Router basename = ""
# 3. Navigation links don't include /acme prefix
```

### 6.3 Three URL Modes Verification

**Path-Based (Default/Free)**:
```bash
GET https://jolli.ai/acme/dashboard
GET https://jolli.ai/acme/engineering/article-1
POST https://jolli.ai/acme/api/docs

# Expected: All requests succeed
```

**Subdomain (Enterprise/Paid)**:
```bash
# Prerequisite: tenant.feature_flags.subdomain = true

GET https://acme.jolli.ai/dashboard
GET https://acme.jolli.ai/engineering/article-1
POST https://acme.jolli.ai/api/docs

# Expected:
# 1. All requests succeed
# 2. URLs don't include /acme prefix
# 3. Frontend basename = ""
```

**Custom Domain (Enterprise/Paid)**:
```bash
# Prerequisite: tenant.feature_flags.customDomain = true

GET https://docs.acme.com/article-1
POST https://docs.acme.com/api/docs

# Expected:
# 1. External URL is clean (no /acme)
# 2. Internal routing includes tenant (/acme/article-1)
# 3. All requests succeed
```

### 6.4 Feature Flag Verification

```bash
# Free tenant tries subdomain
GET https://free-tenant.jolli.ai/dashboard
# Expected: 307 redirect to https://jolli.ai/free-tenant/dashboard

# Enterprise tenant after upgrade
# Manager: Set feature_flags.subdomain = true

GET https://enterprise-tenant.jolli.ai/dashboard
# Expected: Success access, no redirect
```

### 6.5 Backward Compatibility Verification

```bash
# Old UUID links still work
GET https://jolli.ai/acme/engineering/a1b2c3d4-5678
# Expected: 301 redirect to https://jolli.ai/acme/engineering/getting-started

# Old numeric ID links
GET https://jolli.ai/acme/spaces/123/docs/456
# Expected: 301 redirect to https://jolli.ai/acme/engineering/getting-started
```

---

## 7. Risks and Mitigation Strategies

### Risk 1: Frontend Routing Complexity

**Risk**: Dynamic basename may cause routing confusion

**Mitigation**:
- Use TenantContext for unified management
- Create UrlBuilder tool to encapsulate all URL generation logic
- Comprehensive unit tests and E2E tests

### Risk 2: URL Rewriting Performance Overhead

**Risk**: Every request requires domain type check and path rewriting

**Mitigation**:
- Complete in TenantMiddleware early stage (one-time)
- Use in-memory cache for tenant domain mapping
- Performance testing verifies acceptable overhead (<5ms)

### Risk 3: SEO Impact

**Risk**: Multiple URLs accessing same content may be considered duplicate

**Mitigation**:
- Use 301 permanent redirects (old URL → new URL)
- Add canonical URL in HTML head
- Submit sitemap to search engines

### Risk 4: Backward Compatibility

**Risk**: Old links fail, user bookmarks unusable

**Mitigation**:
- Keep old URL support (ID queries)
- Auto-redirect to new URLs (301)
- Use new URLs in emails/notifications

---

## 8. Success Criteria

### Functionality Completeness
- ✅ URLs use readable slugs instead of UUIDs
- ✅ Support three URL modes (path/subdomain/custom domain)
- ✅ Custom domain URLs have no tenant prefix (docs.acme.com/article)
- ✅ OAuth/Cookie continue using subdomain (auth.jolli.ai)
- ✅ Tenant tiering model implemented (feature flags)

### Performance Requirements
- ✅ URL rewriting overhead < 5ms per request
- ✅ Slug query performance comparable to ID queries
- ✅ First screen load time doesn't increase

### User Experience
- ✅ URLs readable and shareable
- ✅ Bookmark functionality normal
- ✅ Old links auto-redirect
- ✅ Enterprise customers get clean custom domain URLs

### Code Quality
- ✅ Unit test coverage > 80%
- ✅ E2E tests cover all URL modes
- ✅ Code review passed
- ✅ Documentation complete

---

## 9. Future Optimizations (Optional)

### Optimization 1: URL Preview Cards
Generate beautiful Open Graph metadata for better sharing experience

### Optimization 2: Short Link Service
Provide short link option for long URLs (jolli.ai/s/abc123)

### Optimization 3: Subdomain Auto-Configuration
Automatically configure DNS and SSL after enterprise customer upgrades

### Optimization 4: Analytics and Monitoring
Track usage and performance of different URL modes

---

## 10. Summary

This plan implements:
1. ✅ **URL Readability**: Use slugs instead of UUIDs
2. ✅ **Path-Based Default**: jolli.ai/tenant/article
3. ✅ **Enterprise Experience**: Custom domains get clean URLs
4. ✅ **Business Model**: Clear free/enterprise tiering
5. ✅ **Technical Feasibility**: Keep OAuth/Cookie unchanged

**Development Time**: 4-5.5 weeks (slug fields exist, saves time)
**Risk Level**: Medium (mainly frontend routing complexity and URL rewriting)
**Business Value**: High (supports product tiering and enterprise sales)

**Key Advantages**:
- ✅ Database slug fields already exist, reduces migration risk
- ✅ SpaceDao.getSpaceBySlug() already implemented, can reuse pattern
- ✅ Keep OAuth/Cookie architecture unchanged, reduces complexity
