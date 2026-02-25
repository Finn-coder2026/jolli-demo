# Jolli Tools

CLI tools and libraries for documentation generation and deployment workflows.

## Overview

The tools directory contains standalone CLI utilities used by the Jolli backend for various documentation automation tasks. These tools handle code analysis, documentation generation, and deployment operations.

## Tools

| Tool | Description |
|------|-------------|
| [`code2docusaurus/`](./code2docusaurus/) | Generate Docusaurus documentation from API routes |
| [`code2openapi/`](./code2openapi/) | Extract OpenAPI specifications from code |
| [`docs2docusaurus/`](./docs2docusaurus/) | Generate Docusaurus configuration from existing documentation folders |
| [`docusaurus2vercel/`](./docusaurus2vercel/) | Deploy Docusaurus sites to Vercel |
| [`jolliagent/`](./jolliagent/) | AI agent for automated article creation in E2B sandboxes |
| [`nextra-generator/`](./nextra-generator/) | Generate Nextra documentation sites (Page Router and App Router) |

## Tool Details

### code2docusaurus

CLI tool that scans code and generates Docusaurus documentation from API routes. Uses Babel for code analysis.

```bash
cd code2docusaurus
npm run dev         # Run in development
npm run build       # Build TypeScript
npm run package     # Build for distribution
```

### code2openapi

CLI tool that scans code and extracts OpenAPI specifications from API routes. Uses Babel for code analysis.

```bash
cd code2openapi
npm run dev         # Run in development
npm run build       # Build TypeScript
npm run package     # Build for distribution
```

### docs2docusaurus

CLI tool that generates Docusaurus configuration from existing documentation folders.

```bash
cd docs2docusaurus
npm run dev         # Run in development
npm run build       # Build TypeScript
npm run package     # Build for distribution
```

### docusaurus2vercel

CLI tool that deploys Docusaurus documentation sites to Vercel. Uses Ink for terminal UI.

```bash
cd docusaurus2vercel
npm run dev         # Run in development
npm run build       # Build TypeScript
npm run package     # Build for distribution
```

### jolliagent

AI agent library for automated article creation. Used by the Jolli backend to run workflows in E2B cloud sandboxes via Anthropic's API.

```bash
cd jolliagent
npm run build       # Build library
npm test            # Run tests
npm run lint        # Check for lint issues
```

### nextra-generator

Library and CLI for generating Nextra documentation sites with support for both Page Router and App Router.

```bash
cd nextra-generator
npm run cli         # Run CLI
npm run build       # Build for distribution
```

## Development

Each tool follows the standard npm script pattern:

```bash
npm run all         # Clean, build, lint, test, package
npm run build       # Build TypeScript
npm run test        # Run tests with coverage
npm run lint        # Check for lint issues
npm run lint:fix    # Auto-fix lint issues
```
