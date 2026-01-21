# Jolli Deploy

Deployment configurations for Jolli.

## Overview

This directory contains deployment scripts and configurations for deploying Jolli to cloud platforms.

## Deployments

| Directory | Description |
|-----------|-------------|
| [`vercel/`](./vercel/) | Vercel deployment configuration |

## Vercel Deployment

The `vercel/` directory contains scripts for deploying Jolli to Vercel using the Build Output API.

### Scripts

| Script | Description |
|--------|-------------|
| `build.js` | Vercel build orchestrator using Build Output API |
| `init-project.js` | Vercel project initialization with environment variables |

### Commands

```bash
cd deploy/vercel

# Build for Vercel deployment
npm run vercel:build

# Initialize Vercel project
npm run vercel:init
```

### Build Output Structure

The build script creates the following output structure:

```
.vercel/output/
├── config.json                    # Routing configuration
├── static/                        # Frontend static assets
└── functions/api/index.func/      # Serverless function
```
