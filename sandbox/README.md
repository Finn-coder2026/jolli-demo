# Jolli E2B Sandbox

This directory creates E2B sandbox templates - cloud-hosted Ubuntu containers with Node.js, Git, and custom tools for running Jolli AI workflows.

Templates are defined as Dockerfiles and built programmatically via the E2B SDK (`Build.ts`) - no E2B CLI required.

## Prerequisites

- Node.js 24.x (see root `.nvmrc`)
- Docker (for local testing only)

## Authentication

The build script needs an `E2B_API_KEY` to deploy templates. Provide it in one of two ways:

1. **Environment variable** (for CI or one-off use):
   ```bash
   E2B_API_KEY=e2b_... npm run build
   ```

2. **Local env file** (recommended for development):
   ```bash
   # Create sandbox/.env.local (git-ignored)
   echo "E2B_API_KEY=e2b_..." > .env.local
   ```

The build script auto-loads `.env` and `.env.local` from the sandbox directory via dotenv.

## Quick Start

```bash
cd sandbox/
npm install

# Prepare the dist (builds jolliagent + vendors tools into dist/)
npm run prepare

# Build template(s) on E2B
npm run build              # all templates
npm run build:legacy       # just e2b-legacy
```

## Templates

| Alias        | Dockerfile       | Description                              |
|:-------------|:-----------------|:-----------------------------------------|
| e2b-legacy   | e2b.Dockerfile   | Full template: Node.js, Git, GitHub CLI, code2docusaurus, docusaurus2vercel, code2openapi |

The legacy template ID (from the original e2b.toml-based build) is preserved as `LEGACY_TEMPLATE_ID` in `Build.ts`.

### Adding a New Template

1. Create a new Dockerfile (e.g. `CodeReader.Dockerfile`)
2. Add an entry to `TEMPLATE_DEFS` in `Build.ts`:
   ```typescript
   const TEMPLATE_DEFS: Record<string, string> = {
       "e2b-legacy": "e2b.Dockerfile",
       "jolli-code-reader": "CodeReader.Dockerfile",
   };
   ```
3. Build it: `npm run build` or `tsx Build.ts jolli-code-reader`

## Local Docker Testing

Test the image locally before deploying to E2B:

```bash
npm run prepare
npm run docker:build
docker run --rm -it jolli-e2b bash
```

## What's in the e2b-legacy Template

- Ubuntu 22.04
- Node.js v24.x and npm 11.6.1
- Git and GitHub CLI
- Custom tools: `code2docusaurus`, `docusaurus2vercel`, `code2openapi`
- Pre-configured for running Jolli AI workflows

## Scripts

| Script                 | Description                                      |
|:-----------------------|:-------------------------------------------------|
| `npm run build`        | Build all E2B templates via the SDK              |
| `npm run build:legacy` | Build just the e2b-legacy template               |
| `npm run docker:build` | Local Docker build for testing                   |
| `npm run prepare`      | Build jolliagent dist and vendor tools           |
| `npm run prepare:dist` | Build jolliagent and copy dist                   |
| `npm run prepare:tools`| Build and vendor individual tools                |
| `npm run clean`        | Remove dist/ directory                           |

## Integration with JolliAgent

See [tools/jolliagent/README.md](../tools/jolliagent/README.md) for how to use these sandboxes with JolliAgent workflows.
