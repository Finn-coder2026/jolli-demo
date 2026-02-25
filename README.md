# Jolli

Jolli is a documentation automation platform that helps teams create, manage, and publish technical documentation. It integrates AI-powered content generation, GitHub repository management, and automated deployment to create a seamless documentation workflow.

## Overview

Jolli provides:

- **AI-Powered Documentation** - Generate and enhance documentation using multiple LLM providers (OpenAI, Anthropic)
- **Documentation Sites** - Create and manage Docusaurus/Nextra documentation sites
- **GitHub Integration** - Connect repositories, sync content, and receive webhook updates
- **Automated Deployment** - Deploy documentation sites to Vercel automatically
- **Real-time Collaboration** - Collaborative editing with live updates via SSE
- **Multi-Tenant Architecture** - Organization-based isolation with PostgreSQL schema separation

## Architecture

Jolli is a TypeScript monorepo consisting of several interconnected applications and tools:

```
jolli/
├── backend/          # Express.js API server (Node.js)
├── frontend/         # React/Preact web application
├── common/           # Shared TypeScript types and utilities
├── cli/              # Bun-based sync CLI (standalone, not in npm workspaces)
├── manager/          # Next.js management application
├── tools/            # CLI tools for documentation workflows
│   ├── code2docusaurus/    # Generate docs from code
│   ├── docusaurus2vercel/  # Deploy to Vercel
│   ├── jolliagent/         # AI agent for article creation
│   └── ...
├── extensions/       # IDE extensions (VS Code)
├── sandbox/          # E2B cloud sandbox configuration
├── deploy/           # Deployment configurations (Vercel)
├── scripts/          # Build and utility scripts
├── ops/              # Operational utilities
└── testdata/         # Test fixtures
```

### Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React/Preact, Vite, Tailwind CSS, shadcn/ui, intlayer (i18n) |
| **Backend** | Node.js, Express 5, Sequelize ORM, pg-boss (job queue) |
| **Database** | PostgreSQL 17 with pgvector extension |
| **AI** | LangChain, OpenAI, Anthropic, Vercel AI SDK |
| **Infrastructure** | Vercel, AWS (Parameter Store), E2B sandboxes |
| **Build** | Vite, Biome (linting/formatting) |

## Project Structure

### Core Applications

| Folder | Description | README |
|--------|-------------|--------|
| [`backend/`](./backend/) | Express.js API server with PostgreSQL, handles all business logic, job scheduling, and integrations | [README](./backend/README.md) |
| [`frontend/`](./frontend/) | React/Preact web UI with shadcn/ui components, Tailwind CSS styling | [README](./frontend/README.md) |
| [`common/`](./common/) | Shared TypeScript types, interfaces, and utilities used by backend and frontend | [README](./common/README.md) |
| [`manager/`](./manager/) | Next.js management application | [README](./manager/README.md) |

### CLI (Standalone)

| Folder | Description | README |
|--------|-------------|--------|
| [`cli/`](./cli/) | Bun-based sync CLI for local markdown synchronization. **Not part of npm workspaces** - uses Bun runtime and `bun test`. Run with `npm run cli:test` from root. | [README](./cli/README.md) |

### Tools

| Folder | Description | README |
|--------|-------------|--------|
| [`tools/code2docusaurus/`](./tools/code2docusaurus/) | Generates Docusaurus documentation from source code | |
| [`tools/docusaurus2vercel/`](./tools/docusaurus2vercel/) | Deploys Docusaurus sites to Vercel | |
| [`tools/jolliagent/`](./tools/jolliagent/) | AI agent for automated article creation in E2B sandboxes | |
| [`tools/nextra-generator/`](./tools/nextra-generator/) | Generates Nextra documentation | |

### Infrastructure & Support

| Folder | Description | README |
|--------|-------------|--------|
| [`extensions/`](./extensions/) | IDE extensions (VS Code extension for Jolli) | [README](./extensions/vscode/README.md) |
| [`sandbox/`](./sandbox/) | E2B cloud sandbox configuration for AI workflows | [README](./sandbox/README.md) |
| [`deploy/`](./deploy/) | Deployment configurations for Vercel | [README](./deploy/README.md) |
| [`scripts/`](./scripts/) | Build, database initialization, and utility scripts | [README](./scripts/README.md) |
| [`ops/`](./ops/) | Operational and infrastructure utilities | [README](./ops/README.md) |
| [`testdata/`](./testdata/) | Test fixtures for unit and integration tests | [README](./testdata/README.md) |

## Getting Started

### Prerequisites

- Node.js (Latest LTS or Current)
- Docker Desktop (for PostgreSQL)
- Git
- GitHub account
- (Optional) AWS account for Parameter Store

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jolliai/jolli.git
   cd jolli
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Follow the Developer Guide:**

   See **[DEVELOPERS.md](./DEVELOPERS.md)** for complete setup instructions including:
   - PostgreSQL database setup
   - LLM provider configuration
   - OAuth authentication setup
   - GitHub and Vercel integration

4. **Run the application:**
   ```bash
   # Terminal 1: Start backend
   cd backend && npm run start
   
   # Terminal 2: Start frontend
   cd frontend && npm run start
   ```

   - Frontend: http://localhost:8034
   - Backend API: http://localhost:7034

## Documentation

| Document | Description |
|----------|-------------|
| [DEVELOPERS.md](./DEVELOPERS.md) | Complete developer setup and onboarding guide |
| [LOCALIZATION.md](./LOCALIZATION.md) | Internationalization (i18n) guide using intlayer |
| [CLAUDE.md](./CLAUDE.md) | AI assistant instructions for working with this codebase |

## Development

### Running Tests

```bash
# Run all tests (backend)
cd backend && npm test

# Run all tests (frontend)
cd frontend && npm test

# Run full validation (clean, build, lint, test)
cd backend && npm run all
cd frontend && npm run all

# Run CLI tests (uses Bun, not part of workspaces)
npm run cli:test
```

### Code Quality

The project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Test Coverage

Both `backend` and `frontend` maintain **100% test coverage** (with minor branch exceptions in frontend). This is enforced in CI.

## Key Features by UI Tab

| Tab | Description | Backend Components |
|-----|-------------|-------------------|
| **Dashboard** | Job monitoring and management | `JobRouter`, `JobDao`, `Job` model |
| **Articles** | Document creation and editing | `DocRouter`, `DocDao`, `Doc` model |
| **Doc Sites** | Docusaurus/Nextra site management | `DocsiteRouter`, `DocsiteDao`, `Docsite` model |
| **Integrations** | GitHub and external service connections | `IntegrationRouter`, `IntegrationDao`, `Integration` model |
| **Settings** | User and application configuration | - |
| **Dev Tools** | Developer utilities (GitHub App creation, etc.) | `DevToolsRouter` |

## Contributing

1. Read the [DEVELOPERS.md](./DEVELOPERS.md) guide to set up your environment
2. Read the relevant folder README for the area you're working in
3. Ensure tests pass and maintain 100% coverage
4. Run `npm run all` in affected folders before committing
5. Follow the existing code patterns and conventions

## License

Proprietary - All rights reserved.


