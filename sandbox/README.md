# Jolli E2B Sandbox

This directory creates an E2B sandbox template - a cloud-hosted Ubuntu container with Node.js, Git, and custom tools for running Jolli AI workflows.

## Quick Start

**Just checked out the code? Here's how to build and deploy:**

### Mac/Linux

```bash
# 1. Install E2B CLI
npm install -g @e2b/cli

# 2. Authenticate
e2b auth login

# 3. Navigate to sandbox directory
cd sandbox/

# 4. Build and deploy
make e2b-build
```

**That's it!** The template will be created with the name `jolli-sandbox`.

### Windows

```bash
# 1. Install E2B CLI
npm install -g @e2b/cli

# 2. Authenticate
e2b auth login

# 3. Navigate to sandbox directory (use Git Bash)
cd sandbox

# 4. Build and deploy
make e2b-build
```

**That's it!** The template will be created with the name `jolli-sandbox`.

## What This Does

Creates an E2B sandbox template with:
- Node.js v24.x and npm
- Git and GitHub CLI
- Custom tools: `code2docusaurus`, `docusaurus2vercel`
- Pre-configured for running Jolli AI workflows

## Configuration

The modern E2B CLI uses **template names** instead of configuration files.

When you run `make e2b-build`, it executes:
```bash
e2b template create jolli-sandbox --dockerfile e2b.Dockerfile
```

This creates a template named `jolli-sandbox` that you can use in your code:

```typescript
import { Sandbox } from 'e2b'
const sandbox = await Sandbox.create('jolli-sandbox', {
  apiKey: process.env.E2B_API_KEY
})
```

## Managing Templates

```bash
# List your templates
e2b template list

# Delete a template
e2b template delete jolli-sandbox

# View template details at:
# https://e2b.dev/dashboard
```

## Troubleshooting

### Error: Not authenticated
```bash
e2b auth login
```

### Error: Template already exists
```bash
# The create command will update the existing template
make e2b-build

# Or delete and recreate
e2b template delete jolli-sandbox
make e2b-build
```

### Error: Make command not found (Windows)
Use Git Bash instead of PowerShell, or install Make via Chocolatey:
```powershell
choco install make
```

## Integration with JolliAgent

See [tools/jolliagent/README.md](../tools/jolliagent/README.md) for how to use this sandbox with JolliAgent workflows.
