---
jrn: MKKIR50TP99H8Z6Q
---
# Jolli Backend

Express.js API server for the Jolli documentation automation platform.

> For setup instructions, see [DEVELOPERS.md](../DEVELOPERS.md).

## Overview

The backend is a Node.js application built with Express 5 that provides the API layer for Jolli. It uses PostgreSQL with Sequelize ORM for data persistence and pg-boss for background job processing.

## Project Structure

```
backend/
├── src/
│   ├── adapters/           # External tool adapters
│   ├── auth/               # Authentication and authorization
│   ├── config/             # Configuration management
│   ├── core/               # Core application logic
│   │   ├── agent/          # AI agent orchestration
│   │   ├── Database.ts     # DAO factory and initialization
│   │   └── Chunker.ts      # Text chunking utilities
│   ├── dao/                # Data Access Objects
│   ├── events/             # Event emitters and handlers
│   ├── github/             # GitHub API integration
│   ├── integrations/       # Integration type behaviors
│   ├── jobs/               # Background job definitions
│   ├── model/              # Sequelize models
│   ├── resources/          # Static resources
│   ├── router/             # Express routers (API endpoints)
│   ├── schemas/            # Zod validation schemas
│   ├── services/           # Business logic services
│   ├── tenant/             # Multi-tenant management
│   ├── test/               # Integration tests
│   ├── types/              # TypeScript type definitions
│   ├── util/               # Utility functions
│   ├── AppFactory.ts       # Express app factory
│   ├── Main.ts             # Development entry point
│   └── VercelHandler.ts    # Vercel serverless entry point
├── .env                    # Default environment variables
├── .env.dev                # Development environment template
├── build-serverless.js     # Serverless build script
├── package.json
└── vite.config.ts
```

## Architecture

The backend follows a **Router → DAO → Model** pattern:

- **Routers** (`src/router/`) - Handle HTTP requests and responses
- **DAOs** (`src/dao/`) - Data access and business logic
- **Models** (`src/model/`) - Sequelize model definitions

Each feature area typically includes:
- `*Router.ts` - API endpoints
- `*Dao.ts` - Database operations
- `*.ts` in model/ - Database schema
- `*.test.ts` - Tests
- `*.mock.ts` - Test mocks

## Key Files

| File | Purpose |
|------|---------|
| `AppFactory.ts` | Creates and configures the Express application |
| `core/Database.ts` | Central DAO factory, provides access to all DAOs |
| `jobs/JobScheduler.ts` | Background job scheduling with pg-boss |
| `integrations/IntegrationsManager.ts` | External integration management |
| `util/AI.ts` | AI provider utilities |
| `util/Sequelize.ts` | Database connection configuration |

## Background Jobs

Job processing is handled by pg-boss. Job definitions are in `src/jobs/`:

- `CoreJobs.ts`
- `DemoJobs.ts`
- `KnowledgeGraphJobs.ts`
- `JobScheduler.ts` - Job registration and scheduling

## Development

### Commands

```bash
# Start development server
npm run start

# Run tests with coverage
npm run test

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Build
npm run build

# Build for serverless deployment
npm run package

# Run full validation (clean, build, lint, test, package)
npm run all
```

### Test Coverage

The backend maintains 100% test coverage. This is enforced in `vite.config.ts`.

## Integration Tests

### Vercel Deployment Test

Located at `src/test/integration/deploy.integration.ts`. Tests the VercelDeployer with real Vercel API calls.

```bash
npx tsx src/test/integration/deploy.integration.ts <site-path>
```

Requires `VERCEL_TOKEN` in `.env.local`.
