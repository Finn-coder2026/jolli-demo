# Pipeline Tools Test Guide

This document provides test repositories and copy-paste commands for testing the pipeline tools.

**All commands assume you are in the `tools/pipeline` folder.**

## Directory Structure

```
jolli/tools/pipeline/           # Start here (current directory)
├── shared-pipeline-utils/
├── jolli-openapi-generator/
├── jolli-docs-bootstrapper/
├── ...
├── ../../../output/            # Generated output files (jolli.ai/output/)
│   ├── docs/
│   └── openapi/
└── ../../../../opensource/     # Cloned test repositories
    ├── guide-fastify-example/
    ├── platformatic/
    └── ...
```

---

## Quick Start

### 1. Setup Directories

```bash
mkdir -p ../../../output/docs ../../../output/openapi ../../../../opensource
```

### 2. Clone Test Repositories

```bash
git clone --depth 1 https://github.com/speakeasy-api/guide-fastify-example.git ../../../../opensource/guide-fastify-example
git clone --depth 1 https://github.com/platformatic/platformatic.git ../../../../opensource/platformatic
git clone --depth 1 https://github.com/NodeBB/NodeBB.git ../../../../opensource/NodeBB
git clone --depth 1 https://github.com/parse-community/parse-server.git ../../../../opensource/parse-server
git clone --depth 1 https://github.com/honojs/examples.git ../../../../opensource/hono-examples
git clone --depth 1 https://github.com/honojs/honox.git ../../../../opensource/honox
git clone --depth 1 https://github.com/vendure-ecommerce/vendure.git ../../../../opensource/vendure
git clone --depth 1 https://github.com/novuhq/novu.git ../../../../opensource/novu
git clone --depth 1 https://github.com/vercel/commerce.git ../../../../opensource/commerce
git clone --depth 1 https://github.com/strapi/strapi.git ../../../../opensource/strapi
```

### 3. Build Pipeline Tools

```bash
npm install --prefix shared-pipeline-utils
npm run build --prefix shared-pipeline-utils
npm install --prefix jolli-openapi-generator
npm run build --prefix jolli-openapi-generator
npm install --prefix jolli-docs-bootstrapper
npm run build --prefix jolli-docs-bootstrapper
```

---

## Test Repositories by Framework

### Fastify

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| guide-fastify-example | Speakeasy example with @fastify/swagger | `git clone --depth 1 https://github.com/speakeasy-api/guide-fastify-example.git` |
| platformatic | Backend toolkit | `git clone --depth 1 https://github.com/platformatic/platformatic.git` |

### Express.js

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| NodeBB | Forum software | `git clone --depth 1 https://github.com/NodeBB/NodeBB.git` |
| parse-server | Backend server | `git clone --depth 1 https://github.com/parse-community/parse-server.git` |

### Hono

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| hono-examples | Official examples | `git clone --depth 1 https://github.com/honojs/examples.git hono-examples` |
| honox | Meta-framework | `git clone --depth 1 https://github.com/honojs/honox.git` |

### NestJS

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| vendure | Headless commerce | `git clone --depth 1 https://github.com/vendure-ecommerce/vendure.git` |
| novu | Notification infrastructure | `git clone --depth 1 https://github.com/novuhq/novu.git` |

### Next.js App Router

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| commerce | Reference commerce app | `git clone --depth 1 https://github.com/vercel/commerce.git` |

### Koa

| Repository | Description | Clone Command |
|------------|-------------|---------------|
| strapi | Headless CMS | `git clone --depth 1 https://github.com/strapi/strapi.git` |

---

## OpenAPI Generator Commands

Generate OpenAPI specs from source code using AST-based route extraction.

```bash
# Fastify - guide-fastify-example (best test case - has @fastify/swagger)
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/guide-fastify-example --output ../../../../output/openapi/guide-fastify-example.json

# Compare with original @fastify/swagger output
diff ../../../../opensource/guide-fastify-example/openapi.json ../../../output/openapi/guide-fastify-example.json

# Fastify - platformatic
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/platformatic --output ../../../../output/openapi/platformatic.json

# Express.js - NodeBB
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/NodeBB --output ../../../../output/openapi/nodebb.json

# Hono - examples
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/hono-examples --output ../../../../output/openapi/hono-examples.json

# NestJS - vendure
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/vendure --output ../../../../output/openapi/vendure.json

# Output as YAML
npm run cli --prefix jolli-openapi-generator -- --repo ../../../../../opensource/guide-fastify-example --output ../../../../output/openapi/guide-fastify-example.yaml --format yaml
```

---

## Docs Bootstrapper Commands

Generate documentation from source code.

```bash
# Express.js
npm run cli --prefix jolli-docs-bootstrapper -- --source nodebb --repo ../../../../../opensource/NodeBB --docsDir ../../../../output/docs/NodeBB
npm run cli --prefix jolli-docs-bootstrapper -- --source parse-server --repo ../../../../../opensource/parse-server --docsDir ../../../../output/docs/parse-server

# Fastify
npm run cli --prefix jolli-docs-bootstrapper -- --source platformatic --repo ../../../../../opensource/platformatic --docsDir ../../../../output/docs/platformatic

# Hono
npm run cli --prefix jolli-docs-bootstrapper -- --source hono-examples --repo ../../../../../opensource/hono-examples --docsDir ../../../../output/docs/hono-examples
npm run cli --prefix jolli-docs-bootstrapper -- --source honox --repo ../../../../../opensource/honox --docsDir ../../../../output/docs/honox

# Next.js App Router
npm run cli --prefix jolli-docs-bootstrapper -- --source commerce --repo ../../../../../opensource/commerce --docsDir ../../../../output/docs/commerce

# NestJS
npm run cli --prefix jolli-docs-bootstrapper -- --source vendure --repo ../../../../../opensource/vendure --docsDir ../../../../output/docs/vendure
npm run cli --prefix jolli-docs-bootstrapper -- --source novu --repo ../../../../../opensource/novu --docsDir ../../../../output/docs/novu

# Koa
npm run cli --prefix jolli-docs-bootstrapper -- --source strapi --repo ../../../../../opensource/strapi --docsDir ../../../../output/docs/strapi
```

---

## Test Results

| Framework | Project | Routes Found | OpenAPI Status | Notes |
|-----------|---------|--------------|----------------|-------|
| Fastify | guide-fastify-example | 2 | Excellent | ~95% match with @fastify/swagger |
| Fastify | platformatic | 59 | Good | Many routes detected |
| Express.js | NodeBB | 4 | Low | Many routes not detected |
| Hono | hono-examples | 28 | Good | Works well |
| Next.js | commerce | 1 | Low | API routes not fully detected |
| NestJS | vendure | 6 | Low | Many controllers not detected |
| Koa | strapi | 0 | Not working | Framework not supported |

### Known Issues

1. **Koa detection not working** - Strapi found 0 routes
2. **Express detection incomplete** - NodeBB has many more routes than detected
3. **Next.js detection incomplete** - Commerce has more API routes
4. **NestJS detection incomplete** - Vendure has many controllers
5. **Ghost path issue** - Routes with "https:" in path cause Windows errors

---

## Development Commands

```bash
# Run tests
npm test --prefix shared-pipeline-utils
npm test --prefix jolli-openapi-generator

# Lint
npm run lint --prefix shared-pipeline-utils
npm run lint --prefix jolli-openapi-generator

# Full rebuild and test
npm run all --prefix shared-pipeline-utils
npm run all --prefix jolli-openapi-generator
```
