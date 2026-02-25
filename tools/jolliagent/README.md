# JolliAgent

TypeScript-based AI agent framework that bridges Claude LLM with autonomous tool execution for documentation generation, code analysis, and deployment workflows.

## Overview

JolliAgent is a library used by the Jolli backend for:

- **Server-side workflows**: `runWorkflowForJob` from `jolli-agent/workflows` runs JolliScript workflows in E2B sandboxes.
- **Article editing**: `createArticleEditingAgent` powers the collaborative article editor in the web UI.
- **Onboarding tools**: `GenerateFromCodeTool`, `GapAnalysisTool` use the agent framework for E2B-based code analysis.

See `docs/architecture.md` for details and `docs/architecture-web.md` for backend integration.

## Quick Start

### 1. Build E2B Sandbox Template

```bash
cd sandbox
make e2b-build
```

### 2. Install Dependencies

```bash
cd tools/jolliagent
npm ci
npm run build
```

### 3. Run Tests

```bash
npm test
```

## Available Scripts

| Script | Description |
|--------|--------------|
| `npm run build` | Build index and workflows bundles |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:integration` | Run integration tests |
| `npm run lint` | Run lint |
| `npm run lint:fix` | Fix lint issues |

## Package Exports

- `jolli-agent` – Main entry (agents, tools, types)
- `jolli-agent/workflows` – `runWorkflowForJob` for server-side workflows
- `jolli-agent/jolliscript` – JolliScript parsing and types

## Environment Variables

Required for E2B workflows (via backend):

- `ANTHROPIC_API_KEY` – Claude API key
- `E2B_API_KEY` – E2B sandbox API key
- `E2B_TEMPLATE_ID` – E2B template ID (e.g. `jolli-sandbox`)

Optional:

- `JOLLI_DEBUG=1` – Enable debug logging
- `VERCEL_TOKEN` – For Vercel deployment workflows
- `GH_PAT` – For private GitHub repos

## Troubleshooting

### Error: Template 'jolli-sandbox' not found

```bash
cd ../../sandbox
make e2b-build
e2b template list
```

### Error: E2B_API_KEY not set

Add to backend `.env.local` or environment config.

### Error: ANTHROPIC_API_KEY not set

Add to backend `.env.local` or environment config.
