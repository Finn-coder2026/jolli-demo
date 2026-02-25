# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the Codebase

Jolli is a documentation automation platform - a TypeScript monorepo with these apps/projects:

1. **backend** - Express.js API server (Node.js), PostgreSQL with Sequelize ORM, RESTful API with HTTP and SSE. Port: 7034
2. **frontend** - React/Preact web app, shadcn/ui components, Tailwind CSS, intlayer for i18n. Port: 8034
3. **common** - Shared TypeScript types and utilities. Two exports: `jolli-common` (client-safe) and `jolli-common/server` (Node.js only, includes pino logging)
4. **manager** - Next.js superadmin dashboard for multi-tenant management. Port: 3034
5. **gateway** - nginx configuration for HTTPS reverse proxy and subdomain routing
6. **extensions/vscode** - VS Code extension for Jolli integration
7. **deploy/vercel** - Vercel deployment utilities
8. **tools/** - CLI tools (code2docusaurus, docs2docusaurus, docusaurus2vercel, jolliagent, nextra-generator)

### Multi-Tenant Architecture
- Tenants identified by subdomain: `<tenant>.jolli.app`
- Each tenant-org has an isolated PostgreSQL schema
- `TenantMiddleware` extracts tenant from subdomain/headers
- `TenantOrgContext` provides scoped database connections

## Essential Commands

```bash
# Environment
nvm use                    # Use correct Node version (.nvmrc: 24.10.0)

# Development (from root - runs all workspaces)
npm run start              # Dev server (backend: 7034, frontend: 8034)
npm run build              # Type-check (tsgo - no emit)
npm run lint               # Style check (Biome)
npm run lint:fix           # Auto-fix style issues

# Per-workspace commands
npm run start -w jolli-backend     # Backend only
npm run start -w jolli-frontend    # Frontend only
npm run build -w jolli-backend     # Type-check backend only
npm run lint -w jolli-frontend     # Lint frontend only

# Manager (Next.js superadmin)
cd manager && npm run dev          # Dev server with Turbopack (port 3034)

# Backend worker & migrations
cd backend && npm run worker:dev           # Run job worker locally (multi-tenant)
cd backend && npm run migrate:all-tenants  # Run migrations across all tenant schemas

# E2E Tests (from root)
npm run e2e                # Run E2E tests (Chromium)
npm run e2e:headed         # Run E2E tests with visible browser
npm run e2e:ui             # Open Playwright UI mode
npm run e2e:debug          # Run E2E tests in debug mode
npm run e2e:report         # View last E2E test report

# Full validation (per workspace)
cd backend && npm run all  # clean → build → lint → test → package
cd frontend && npm run all # clean → build → lint → test → package
```

**Key**: `build` = types (tsgo), `lint` = style (Biome). Biome cannot check types.

## Architecture

### Backend: Router → DAO → Model
- `src/router/` - Express routes (API endpoints)
- `src/dao/` - Business logic & database operations
- `src/model/` - Sequelize models (database schema)
- `src/jobs/` - Background jobs (pg-boss)
- `src/config/Config.ts` - Environment variables (use this, not `process.env`)

### Frontend: UI → Components → Contexts → Hooks
- `src/ui/` - Page-level components
- `src/components/` - Shared components
- `src/components/ui/` - shadcn/ui primitives (reuse these!)
- `src/contexts/` - React Context providers
- `src/hooks/` - Custom hooks
- `src/localization/` - Intlayer i18n (*.content.ts files)

### UI Tab Mapping

| UI Tab | Frontend Component | Backend Router | Backend DAO | DB Model |
|--------|-------------------|----------------|-------------|----------|
| Dashboard | ui/Dashboard.tsx | router/JobRouter.ts | dao/JobDao.ts | model/Job.ts |
| Articles | ui/Articles.tsx | router/DocRouter.ts | dao/DocDao.ts | model/Doc.ts |
| Doc Sites | ui/Docsites.tsx | router/DocsiteRouter.ts | dao/DocsiteDao.ts | model/Docsite.ts |
| Integrations | ui/integrations/Integrations.tsx | router/IntegrationRouter.ts | dao/IntegrationDao.ts | model/Integration.ts |
| Dev Tools | ui/devtools/DevTools.tsx | router/DevToolsRouter.ts | N/A | N/A |

Chat Window: `ui/Chatbot.tsx` → `router/ChatRouter.ts`, `router/ConvoRouter.ts` → `dao/ConvoDao.ts`/`model/Convo.ts`

## Code Style Rules

### Formatting (Biome + EditorConfig)
- **Indentation**: Tabs (size 4)
- **Line width**: 120 characters
- **Quotes**: Double quotes (strings and JSX)
- **Semicolons**: Always required
- **Trailing commas**: Always
- **Arrow parentheses**: Omit when possible (`x => x` not `(x) => x`)

### TypeScript Critical Rules
- **NEVER use `any`** → use `unknown` if type is truly unknown
- **NEVER use suppressions** → no `@ts-ignore`, `@ts-expect-error`, `as any`
- **Array syntax**: `Array<T>` not `T[]`
- **Export types**: `export type Foo` not `export { Foo }`
- **Import types**: `import type { Foo }` for type-only imports
- **Type validation**: Use `satisfies` → `const x = {...} satisfies Type`
- **Max complexity**: 34 (enforced by Biome)
- **Catch blocks**: Always type as `unknown`, then narrow

### Import Organization (Auto-sorted by Biome)
```typescript
// 1. External libraries
import { useState } from "react";
import type { Doc } from "jolli-common";

// 2. Parent relative imports (../**)
import { useClient } from "../contexts/ClientContext";

// 3. Same-level relative imports (./*)
import { Button } from "./Button";
```

Frontend uses `@/*` path alias → `./src/*`

### Naming Conventions
- **Files**: UpperCamelCase → `UserProfile.tsx`, `ArticleDao.ts`
- **Components**: UpperCamelCase → `ArticleDraft`
- **Functions/Variables**: camelCase → `handleClick`, `userId`
- **Constants**: UPPER_SNAKE_CASE → `MAX_FILE_SIZE_MB`
- **i18n keys**: kebab-case → `"article-draft"`
- **Test IDs**: kebab-case → `data-testid="save-button"`

### React Components (Frontend)
```typescript
export function ComponentName({ prop }: ComponentNameProps): React.ReactElement {
  const [state, setState] = React.useState(false);
  return <div data-testid="component-name" className={cn("base", cond && "extra")} />;
}
```
- Use `React.` prefix for hooks
- Props type: `ComponentNameProps`
- Return type: `React.ReactElement`
- Use `cn()` for classes
- Always add `data-testid`

### Error Handling
- Backend: use pino logger `log.error(err, "Failed: %s", ctx)`
- Frontend: `console.error` only (other console methods linted)
- Catch blocks: type as `unknown`, then narrow

## i18n (Intlayer)

**NEVER hardcode strings.** Place `*.content.ts` next to components:
```typescript
const content = { key: "my-key", content: { title: t({ en: "Hello" }) } } satisfies Dictionary;
// Usage: const content = useIntlayer("my-key"); <h1>{content.title}</h1>
```
See [LOCALIZATION.md](./LOCALIZATION.md) for details.

## Git Commits

**Format**: `<Magic word> JOLLI-xxx: <Brief description>`

- **Closing magic words** (auto-closes ticket): `close`, `closes`, `closed`, `closing`, `fix`, `fixes`, `fixed`, `fixing`, `resolve`, `resolves`, `resolved`, `resolving`, `complete`, `completes`, `completed`, `completing`
- **Non-closing magic words** (links without closing): `ref`, `refs`, `references`, `part of`, `related to`, `contributes to`, `toward`, `towards`
- Extract ticket from branch: `feature/jolli-280-foo` → `JOLLI-280`
- **NEVER include AI co-author** (no `Co-Authored-By: Claude` lines)

**Examples**:
- `Closes JOLLI-280. Adds job to remove orphaned images.`
- `Fixes JOLLI-359. Corrects environment configuration for Jolli Sites.`
- `Part of JOLLI-276: Standardize JRN format for docs table`

## Critical Rules

### ✅ DO
- Use existing components (check `src/components/ui/` before creating new)
- Use Tailwind CSS for styling
- Use Intlayer for all UI text
- Code/comments in English, respond to user in Chinese
- Front-end style reference lovable
- Use `nvm use` (or `nvm use 24.10.0`) if node version is incorrect
- Prefer using the `function` keyword over arrow functions where possible
- Don't use `import *` imports - always import exactly what is needed
- Use pino's printf-style formatting for logging
- Prefer adding env params to `configSchema/server` in `backend/src/config/Config.ts` over `process.env.VARIABLE_NAME`
- When implementing `postSync` hooks on DAOs, ensure they are **idempotent**:
  - Use `IF NOT EXISTS` for CREATE statements
  - Check state before making changes
  - Wrap in try-catch for concurrent execution safety
- Keep the frontend bundle size as small as possible
- When you finish a task, check for unused imports/variables and remove them
- Look for opportunities to refactor and reduce complexity
- Use DRY principle - move duplicate code into separate functions
- Keep functions small and focused
- Ask for clarification when requirements are ambiguous
- Back up important files before significant changes, then remove backups when done
- When asked to reconstruct the styles of a webpage, or the styles of a specific DOM element within a webpage (such as a button, form, or component), please understand the following task constraints and methodological boundaries: The task is based on analyzing the target webpage (typically provided via a URL) or a specified DOM element by parsing its HTML structure and associated CSS styles. “Parsing” here strictly refers to analysis based on source-level information — including HTML structure, CSS rules, and cascade/inheritance relationships — and does NOT involve any screenshot-based, image-based, or visual reconstruction approaches. Please clearly understand that: 
- UI reconstruction is grounded in DOM and CSS analysis 
- Screenshot or image-based methods are explicitly disallowed
- You can use playwright, the mcp server, to analyze web pages and elements in web pages to parse their html structures and css styles(Not mandatory, this is just a solution).
- Run `claude mcp list` command under `/Users/zf/develop/code/my_project/jolli-ai/jolli` folder to find available mcp servers
- View the `.mcp.json` file to discover the mcp services available under the current project
- When conducting code review, refer to the content in the review-pr.md document for review.

### ❌ DO NOT
- Use `any`, `@ts-ignore`, `@ts-expect-error`, `as any`
- Use `forEach` (Biome enforces `for...of`)
- Use `console.log` in frontend (only `console.error` allowed)
- Modify `vite.config.ts` or `biome.json` without approval
- Commit without Linear ticket reference
- After each code modification, do not generate test classes, test methods, etc., do not execute test classes, test methods, etc. You only need to ensure that the file you modify has no syntax errors. Do not execute test lint and other verification logic under jolli, front, backend, and manager projects (**The most important, the highest priority, this does not change every time it is init**)
- Do not close the browser after the Playwright mcp server is executed. You can continue to use it next time. 
- When analyzing and solving page style problems, screenshots are not allowed to be analyzed. You can open this page through playwright and try to solve this problem by parsing the html structure and css style.

## Reference Docs
- Setup: [DEVELOPERS.md](./DEVELOPERS.md)
- i18n: [LOCALIZATION.md](./LOCALIZATION.md)
- Tiptap: https://tiptap.dev/docs/editor/getting-started/overview
- AWS S3: https://docs.aws.amazon.com/zh_cn/AmazonS3/latest/API/Welcome.html
