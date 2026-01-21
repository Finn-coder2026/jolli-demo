# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# About the Codebase

Jolli is a documentation automation platform built as a TypeScript monorepo. The project is broken up into the following apps/projects:

## Core Applications

1. **`backend/`** - Express 5 server on Node.js 24.10.0
   - PostgreSQL database with Sequelize ORM (see `backend/src/core/Database.ts` for DAO wiring)
   - RESTful API with both HTTP and Server-Sent Events (SSE) responses
   - pg-boss for background job scheduling
   - Multi-tenant support with PostgreSQL schema isolation
   - Express router-based architecture

2. **`frontend/`** - React/Preact SPA
   - Code written in React, built with Preact via Vite for bundle size optimization
   - shadcn/ui components for UI
   - Tailwind CSS v4 + CSS modules for styling
   - Intlayer for i18n (English and Spanish)
   - Bundle size optimization is critical

3. **`common/`** - Shared code
   - Common types and utilities used by both backend and frontend
   - API contracts and interfaces

4. **`manager/`** - Next.js management application
   - Multi-tenant registry and administration

## Tools and Extensions

- **`tools/code2docusaurus/`** - Generate Docusaurus documentation from code
- **`tools/docusaurus2vercel/`** - Deploy Docusaurus sites to Vercel
- **`tools/jolliagent/`** - AI agent for creating articles in E2B sandboxes
- **`tools/nextra-generator/`** - Generate Nextra documentation sites
- **`extensions/vscode/`** - VS Code extension for Jolli

## Build System and Code Quality

- **Build tool**: Vite (for building, testing, and dev server)
- **Linting/Formatting**: Biome (see `biome.json` for rules)
- **Type checking**: TypeScript with strict settings
- **Testing**: Vitest with 100% coverage requirement (backend), 97%+ branches (frontend)
- **Node version**: 24.10.0 (use `nvm use` in project root)

For complete setup and development instructions, see `DEVELOPERS.md` and `LOCALIZATION.md`.

# Application Architecture

## Frontend Tabs and Their Backend Counterparts

The application is broken up into these main UI tabs:

| UI Tab       | Frontend Component               | Backend Router              | Backend DAO           | Backend Model        |
|:-------------|:---------------------------------|:----------------------------|:----------------------|:---------------------|
| Dashboard    | ui/Dashboard.tsx                 | router/JobRouter.ts         | dao/JobDao.ts         | model/Job.ts         |
| Articles     | ui/Articles.tsx                  | router/DocRouter.ts         | dao/DocDao.ts         | model/Doc.ts         |
| Doc Sites    | ui/Docsites.tsx                  | router/DocsiteRouter.ts     | dao/DocsiteDao.ts     | model/Docsite.ts     |
| Sites        | ui/Sites.tsx                     | router/SiteRouter.ts        | dao/SiteDao.ts        | model/Site.ts        |
| Integrations | ui/integrations/Integrations.tsx | router/IntegrationRouter.ts | dao/IntegrationDao.ts | model/Integration.ts |
| Settings     | ui/Settings.tsx                  | -                           | -                     | -                    |
| Dev Tools    | ui/devtools/DevTools.tsx         | router/DevToolsRouter.ts    | -                     | -                    |

**Chat Window**: `ui/Chatbot.tsx` → `router/ChatRouter.ts`, `router/ConvoRouter.ts` → `dao/ConvoDao.ts`/`model/Convo.ts`

## Key Architectural Patterns

### Backend: Router → DAO → Model

1. **Routers** (`backend/src/router/`) - Express route handlers
   - Handle HTTP requests and responses
   - Input validation and error handling
   - Multi-tenant: Use `req.database` to access tenant-specific DAOs

2. **DAOs** (`backend/src/dao/`) - Data Access Objects
   - Business logic and database operations
   - All DAOs follow the factory pattern with `create*Dao(sequelize)` functions
   - DAO Providers support multi-tenant mode (see `DaoProvider` interface)
   - PostSync hooks for schema initialization (must be idempotent)

3. **Models** (`backend/src/model/`) - Sequelize model definitions
   - Database schema definitions using Sequelize
   - Use `define*()` factory functions (e.g., `defineUsers(sequelize)`)
   - Models are tenant-aware via PostgreSQL search_path

### Frontend: Component → API Hook → Backend

1. **Components** (`frontend/src/ui/`) - React/Preact components
   - Use hooks for state management and API calls
   - Localized with intlayer (`.content.ts` files)
   - Tested with Vitest and Testing Library

2. **API Integration** (`frontend/src/api/`) - Backend communication
   - SSE for real-time updates (jobs, chat)
   - Fetch for REST API calls
   - Error handling and loading states

### Multi-Tenant Architecture

- **Registry database**: Stores tenant metadata (`jolli_registry`)
- **Tenant databases**: One schema per tenant-org pair (e.g., `org_engineering`, `org_marketing`)
- **Schema isolation**: PostgreSQL search_path set per connection
- **Domain routing**: Subdomain determines tenant (e.g., `main.jolli-local.me`)
- **Gateway mode**: nginx for HTTPS and subdomain routing (see `gateway/` and `DEVELOPERS.md`)

### Background Jobs

- **Job scheduler**: pg-boss for distributed job queue
- **Job definitions**: `backend/src/jobs/` (e.g., `CoreJobs.ts`, `DemoJobs.ts`)
- **Job types**: Defined in `JobDefinitions.ts`
- **Real-time updates**: SSE for job progress and logs
- **Localization**: Jobs send `messageKey` + `context`, frontend resolves translations

# Common Development Commands

## Backend Commands

```bash
cd backend

# Development and testing
npm run start          # Start backend dev server (port 7034)
npm test              # Run tests with coverage
npm run test:watch    # Run tests in watch mode
npm run lint          # Check linting issues
npm run lint:fix      # Auto-fix linting issues
npm run type-check    # Run TypeScript type checking
npm run all           # Full validation: clean → build → lint → test → package

# Database migrations (multi-tenant)
npm run migrate:all-tenants           # Run migrations on all tenant schemas
npm run migrate:all-tenants:dry-run  # Preview migrations
npm run migrate:all-tenants:check    # Check migration status

# Worker (background job processor)
npm run worker:dev    # Start worker in development mode
npm run worker:build  # Build worker for production
npm run worker:start  # Start production worker
```

## Frontend Commands

```bash
cd frontend

# Development and testing
npm run start                  # Start frontend dev server (port 8034)
npm test                      # Run tests with coverage
npm run test:update           # Update test snapshots
npm run lint                  # Check linting and CSS issues
npm run lint:fix              # Auto-fix linting and CSS issues
npm run all                   # Full validation: clean → build → lint → test → package

# Intlayer (i18n)
npm run build:intlayer        # Build intlayer dictionaries
npm run generate:intlayer-mock # Generate intlayer mock for tests

# Build and preview
npm run package               # Build for production
npm run preview               # Preview production build (port 8034)
```

## Root-Level Commands

```bash
# Gateway (multi-tenant HTTPS routing)
npm run gateway:start    # Start nginx gateway
npm run gateway:stop     # Stop nginx gateway
npm run gateway:reload   # Reload nginx config

# Vercel deployment
npm run vercel:build     # Build for Vercel
npm run vercel:init      # Initialize Vercel project
```

## Testing Individual Files

```bash
# Backend
cd backend
npx vitest run path/to/file.test.ts

# Frontend
cd frontend
npx vitest run path/to/file.test.tsx
```

# Development Rules and Best Practices

## Code Quality

- Use nvm (`nvm use` in project root) to ensure correct Node.js version (24.10.0)
- Run `npm run lint` and fix issues before committing
- Run `npm run type-check` to catch TypeScript errors
- Maintain 100% test coverage (backend) and 97%+ branches (frontend)
- At the end of complex tasks, run `npm run all` to ensure everything passes
- Never modify `vite.config.ts` or `biome.json` without asking first

## Code Style and Conventions

- **File naming**: Use UpperCamelCase for `.ts` and `.tsx` files
- **Imports**: Never use `import *` - always import exactly what is needed
- **Functions**: Prefer `function` keyword over arrow functions where possible
- **TypeScript**: Never use `any` type (use `unknown` if needed, especially in tests)
- **Logging**: Use pino with printf-style formatting
- **Cleanup**: Remove unused imports and variables when finishing tasks

## Refactoring and Code Review

- Look for opportunities to reduce complexity and improve readability
- Follow DRY (Don't Repeat Yourself) - extract duplicate code into functions
- Keep functions small and focused (single responsibility)
- Identify and remove unused code flows
- Act as a code reviewer - improve quality, readability, and efficiency

## Testing

- **Backend**: Use functions in test setup utilities where applicable
- **Frontend**: Use `TestUtils.tsx` utilities and `data-testid` instead of `getByText`
- **Coverage**: Maintain 100% (backend) and 97%+ branches (frontend)
- **Test files**: Co-locate tests with source files (e.g., `Foo.ts` and `Foo.test.ts`)

## Localization (i18n)

- Always create localized translations using intlayer
- Frontend: Create `.content.ts` files with `useIntlayer()` hook
- Backend: Send `messageKey` + `context` (not translated strings)
- See `LOCALIZATION.md` for complete guide

## Configuration and Environment

- Add new environment variables to `backend/src/config/Config.ts` (configSchema/server)
- Avoid direct `process.env.VARIABLE_NAME` usage outside of Config.ts

## Database and Multi-Tenancy

- **DAO postSync hooks**: Must be idempotent (safe to run multiple times)
  - Use `IF NOT EXISTS` for CREATE statements
  - Check state before making changes
  - Wrap in try-catch for concurrent execution
  - See `DaoPostSyncHook` interface in `backend/src/core/Database.ts`
- **Multi-tenant**: Use `req.database` in routers to access tenant-specific DAOs
- **Models**: Use factory functions like `define*()` for model definitions

## Bundle Size Optimization

- Frontend bundle size is critical - always consider impact of new dependencies
- Vite chunks dependencies automatically (see `frontend/vite.config.ts`)
- Use dynamic imports for large features when appropriate

## Before Completing Tasks

1. Run the full test suite (`npm run all`)
2. Check for and remove any backup files (.bak, etc.)
3. Proofread for spelling, grammar, and clarity
4. Verify integration with existing functionality
5. Check for unused imports and variables
6. Run linting and type checking

# GLOBAL CODING RULES — All Projects

1. In the project, Chinese is not allowed to appear, including codes, comments, etc.
2. Use Chinese to answer me in the conversation
3. If the front-end project style can be adapted to tailwind css, try to use tailwind css to implement it. Icons can reuse existing components. If not, use the component library that has been introduced in the project.
4. Refer to other components, when you need to use preset text in the component (such as the text in the button), then use 'react-intlayer' to achieve internationalization
5. When generating code, only execute the following test codes related to the generated code. Do not execute irrelevant ones.
