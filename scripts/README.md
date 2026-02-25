---
jrn: MKKIR4UYKR84JBER
---
# Jolli Scripts

Build, deployment, and utility scripts for the Jolli monorepo.

## Overview

This directory contains shell scripts and utilities for building, packaging, and deploying Jolli.

## Scripts

| Script | Description |
|--------|-------------|
| `init-db.ts` | Database initialization script for Jolli deployments |
| `package.sh` | Creates distributable package from built artifacts |
| `publish.sh` | Publishes packaged build to S3 |
| `run_local_docs.sh` | Local runner for documentation generation workflow |

## Script Details

### init-db.ts

Initializes the database schema for a Jolli deployment. Supports loading credentials from multiple sources.

```bash
# Using AWS Parameter Store
npx tsx scripts/init-db.ts --source aws --site prod

# Using Vercel environment variables
npx tsx scripts/init-db.ts --source vercel

# Using interactive prompts
npx tsx scripts/init-db.ts --source prompt

# Using current environment variables
npx tsx scripts/init-db.ts
```

### package.sh

Creates a distributable tarball package containing the built frontend, backend, and tools.

```bash
./scripts/package.sh
```

Output: `jolli-web-{version}-{revision}.tgz`

### publish.sh

Publishes the packaged build to an S3 bucket and updates the SSM parameter.

```bash
./scripts/publish.sh
```

Requires AWS credentials with access to the `jolli-builds` bucket.

### run_local_docs.sh

Local runner that clones a GitHub repository, runs code2docusaurus to generate documentation, and builds the Docusaurus site. Optionally deploys via Vercel if `VERCEL_TOKEN` is set.

```bash
# From a GitHub URL
./scripts/run_local_docs.sh https://github.com/expressjs/express/tree/HEAD/examples/route-separation

# From a local directory
./scripts/run_local_docs.sh /path/to/local/project
```
