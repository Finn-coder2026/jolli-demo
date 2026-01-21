# Jolli Manager

Next.js management application for multi-tenant Jolli deployments.

> For setup instructions, see [DEVELOPERS.md](../DEVELOPERS.md).

## Overview

The manager is an internal administration dashboard for provisioning and managing Jolli tenants. It provides a web interface for managing tenant instances, organizations, custom domains, and database providers.

## Project Structure

```
manager/
├── src/
│   ├── app/                    # Next.js App Router pages and API routes
│   │   ├── api/                # API route handlers
│   │   │   ├── config/         # Configuration endpoint
│   │   │   ├── providers/      # Database provider management
│   │   │   └── tenants/        # Tenant CRUD operations
│   │   ├── providers/          # Database providers UI pages
│   │   └── tenants/            # Tenant management UI pages
│   ├── components/             # Shared React components
│   ├── lib/                    # Core application logic
│   │   ├── db/                 # Database layer
│   │   │   ├── dao/            # Data Access Objects
│   │   │   └── models/         # Sequelize models
│   │   ├── providers/          # Provider-related utilities
│   │   ├── services/           # Business logic services
│   │   ├── types/              # TypeScript type definitions
│   │   └── util/               # Utility functions
│   └── instrumentation.ts      # Next.js instrumentation
├── scripts/                    # Build and utility scripts
├── .env.example                # Environment variable template
├── next.config.ts              # Next.js configuration
├── package.json
├── tsconfig.json
└── vite.config.ts              # Vitest configuration
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/app/api/tenants/` | Tenant CRUD API routes (create, read, update, provision, reset) |
| `src/app/api/providers/` | Database provider management API |
| `src/app/tenants/` | Tenant management UI pages |
| `src/lib/db/dao/` | Data Access Objects (TenantDao, OrgDao, DomainDao, ProviderDao) |
| `src/lib/db/models/` | Sequelize models (Tenant, Org, TenantDomain, DatabaseProvider) |
| `src/lib/services/` | Business logic (DomainVerificationService) |

## Features

- **Tenant Management** - Create, configure, provision, and reset tenant instances
- **Organization Management** - Manage organizations within tenants
- **Custom Domains** - Configure and verify custom domains for tenants
- **Database Providers** - Configure database connection providers for tenant provisioning

## Development

### Commands

```bash
# Start development server (Turbopack)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run tests with coverage
npm run test

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Run full validation (clean, build, lint, test)
npm run all
```

The development server runs on port 3034.
