---
jrn: MKKIR4V0X5AAL5AM
---
# Jolli Common

Shared TypeScript types, API clients, and utilities used by both the backend and frontend.

## Overview

The common package provides shared code that is used across the Jolli monorepo. It includes API client classes for frontend-to-backend communication, shared type definitions, and utility functions.

## Project Structure

```
common/
├── src/
│   ├── core/               # API client classes
│   ├── tenant/             # Multi-tenant types (Tenant, Org)
│   ├── types/              # Shared TypeScript type definitions
│   ├── util/               # Utility functions
│   └── index.ts            # Package exports
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/core/` | API client classes (AuthClient, DocClient, JobClient, etc.) |
| `src/types/` | Shared type definitions (Doc, Docsite, Job, Integration, etc.) |
| `src/tenant/` | Multi-tenant types (Tenant, Org) |
| `src/util/` | Utility functions (Async, JsonUtils, ObjectUtils, LoggerCommon) |

## API Clients

The `core/` directory contains client classes for frontend-to-backend API communication:

| Client | Purpose |
|--------|---------|
| `AuthClient` | Authentication operations |
| `CollabConvoClient` | Collaborative conversation management |
| `DevToolsClient` | Developer tools API |
| `DocClient` | Document operations |
| `DocDraftClient` | Document draft management |
| `DocsiteClient` | Documentation site operations |
| `GitHubClient` | GitHub integration |
| `IntegrationClient` | External integrations |
| `JobClient` | Background job management |
| `MercureClient` | Server-Sent Events via Mercure |
| `OrgClient` | Organization management |
| `SiteClient` | Site operations |

## Development

### Commands

```bash
# Build TypeScript
npm run build

# Run tests with coverage
npm run test

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Run full validation (clean, build, lint, test)
npm run all
```

## Usage

Import from the package in other Jolli projects:

```typescript
import { DocClient, type Doc, type Job } from "jolli-common";
```
