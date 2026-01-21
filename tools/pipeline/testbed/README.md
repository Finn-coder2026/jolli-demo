# OpenAPI Generator Testbed

This folder contains scripts and configuration for testing the `jolli-openapi-generator` against real-world open-source repositories.

## Purpose

The testbed provides:
1. **Reproducible test environment** - Scripts to clone and organize test repositories
2. **Multi-language coverage** - Repos spanning TypeScript, JavaScript, Go, Java, Python, C#, Ruby, PHP, and Rust
3. **Framework variety** - Schema-enforced, semi-structured, and minimal frameworks
4. **Automated testing** - Run the OpenAPI generator against all repos and collect results

## Directory Structure

```
testbed/
├── README.md                 # This file
├── setup-test-repos.ts       # Script to clone test repositories
├── run-tests.ts              # Script to run generator tests
└── test-repos-config.json    # Repository configuration
```

## Quick Start

```bash
cd tools/pipeline/testbed

# 1. Preview what repos will be cloned
npx tsx setup-test-repos.ts --dry-run

# 2. Clone all test repositories (default: d:/opensource or ~/opensource)
npx tsx setup-test-repos.ts

# 3. Clone to a custom location
npx tsx setup-test-repos.ts /path/to/test-repos

# 4. Run tests against cloned repos
npx tsx run-tests.ts --dry-run
```

## Test Repository Structure

The repos are organized by language and framework:

```
{target-dir}/
├── typescript/
│   ├── express/           # Minimal (Express.js)
│   │   ├── Ghost/
│   │   ├── NodeBB/
│   │   └── parse-server/
│   ├── fastify/           # Schema-Enforced (Fastify + Swagger)
│   │   ├── guide-fastify-example/
│   │   └── platformatic/
│   ├── hono/              # Semi-Structured (Hono)
│   │   ├── examples/
│   │   ├── honox/
│   │   └── flarekit/
│   ├── koa/               # Minimal (Koa)
│   │   ├── strapi/
│   │   └── nocobase/
│   ├── nestjs/            # Schema-Enforced (NestJS + Swagger)
│   │   ├── nestjs-openapi-example/
│   │   ├── vendure/
│   │   └── novu/
│   └── nextjs/            # Minimal (Next.js API Routes)
│       ├── cal.com/
│       └── commerce/
├── go/
│   ├── gin-swag/          # Semi-Structured (Gin + Swag)
│   │   └── swag/
│   └── net-http/          # Minimal (stdlib)
│       └── kubernetes/
├── java/
│   └── spring-springdoc/  # Schema-Enforced (Spring + springdoc)
│       └── springdoc-openapi-demos/
├── python/
│   └── fastapi/           # Schema-Enforced (FastAPI)
│       └── full-stack-fastapi-template/
├── csharp/
│   └── aspnet-swashbuckle/  # Schema-Enforced (ASP.NET + Swashbuckle)
│       └── AspNetCore.Docs.Samples/
├── ruby/
│   └── rails-rswag/       # Semi-Structured (Rails + rswag)
│       └── rswag/
├── php/
│   └── laravel-l5swagger/ # Semi-Structured (Laravel + L5-Swagger)
│       └── L5-Swagger/
└── rust/
    └── actix-utoipa/      # Schema-Enforced (Actix + utoipa)
        └── utoipa/
```

## Framework Categories

| Category | Description | Expected Flow |
|----------|-------------|---------------|
| **Schema-Enforced** | Frameworks with built-in OpenAPI support (Fastify+Swagger, NestJS+Swagger, FastAPI, Spring+springdoc) | Phase 1 (existing spec) or AST extraction with high coverage |
| **Semi-Structured** | Frameworks with annotation/comment-based OpenAPI (Express+swagger-jsdoc, Gin+swag) | AST extraction with medium coverage |
| **Minimal** | Frameworks without OpenAPI support (plain Express, Koa, Next.js) | AST extraction with low coverage → LLM fallback |

## Scripts Reference

### setup-test-repos.ts

Clones test repositories from GitHub.

```bash
npx tsx setup-test-repos.ts [options] [target-dir]

Options:
  --help, -h     Show help message
  --dry-run      Preview without cloning

Arguments:
  target-dir     Target directory (default: d:/opensource on Windows, ~/opensource on Unix)
```

### run-tests.ts

Runs the OpenAPI generator against test repositories.

```bash
npx tsx run-tests.ts [options]

Options:
  --target-dir <path>   Directory containing test repos
  --filter <pattern>    Filter repos by path pattern (e.g., "typescript/fastify")
  --category <cat>      Filter by category (schema-enforced, semi-structured, minimal)
  --dry-run             Show what would be tested
  --llm                 Enable LLM fallback for all tests
```

**Examples:**

```bash
# Test all repos
npx tsx run-tests.ts

# Test only TypeScript/Fastify repos
npx tsx run-tests.ts --filter typescript/fastify

# Test only schema-enforced frameworks
npx tsx run-tests.ts --category schema-enforced

# Test with LLM fallback enabled
npx tsx run-tests.ts --llm

# Preview what would be tested
npx tsx run-tests.ts --dry-run
```

## Test Matrix

### Repos with Existing OpenAPI Specs (Phase 1 Detection)

These repos have static OpenAPI/Swagger specs committed:

| Repo | Spec Path |
|------|-----------|
| `typescript/fastify/guide-fastify-example` | `openapi.json` |
| `typescript/nestjs/nestjs-openapi-example` | `openapi.yaml` |
| `go/net-http/kubernetes` | `api/openapi-spec/swagger.json` |
| `go/gin-swag/swag` | `example/*/docs/swagger.json` |
| `ruby/rails-rswag/rswag` | `test-app/openapi/v1/openapi.json` |

### Repos for AST Extraction (TypeScript/JavaScript)

| Repo | Framework | Expected Coverage |
|------|-----------|-------------------|
| `typescript/fastify/guide-fastify-example` | Fastify + schema | High (80%+) |
| `typescript/nestjs/nestjs-openapi-example` | NestJS + decorators | High (80%+) |
| `typescript/hono/honox` | Hono | Medium (50%+) |
| `typescript/express/NodeBB` | Express | Low (20%+) |

### Repos Requiring LLM Fallback (Non-JS/TS)

| Repo | Language | Framework |
|------|----------|-----------|
| `java/spring-springdoc/springdoc-openapi-demos` | Java | Spring Boot |
| `python/fastapi/full-stack-fastapi-template` | Python | FastAPI |
| `csharp/aspnet-swashbuckle/AspNetCore.Docs.Samples` | C# | ASP.NET |
| `php/laravel-l5swagger/L5-Swagger` | PHP | Laravel |
| `rust/actix-utoipa/utoipa` | Rust | Actix |

## Manual Testing

You can also test individual repos directly:

```bash
cd tools/pipeline/jolli-openapi-generator

# Test a specific repo with verbose output
npx tsx src/Cli.ts --repo /d/opensource/typescript/fastify/guide-fastify-example --verbose

# Test with LLM fallback
npx tsx src/Cli.ts --repo /d/opensource/java/spring-springdoc/springdoc-openapi-demos --verbose --llm

# Estimate LLM cost without running
npx tsx src/Cli.ts --repo /d/opensource/java/spring-springdoc/springdoc-openapi-demos --estimate-cost

# Output to file
npx tsx src/Cli.ts --repo /d/opensource/typescript/fastify/guide-fastify-example --output openapi.json
```

## Configuration

The `test-repos-config.json` file defines:

- **structure**: Language → Framework → Repos hierarchy
- **testMatrix**: Grouped repos by test purpose (existingSpecDetection, astExtraction, llmFallback)

To add a new test repo, edit `test-repos-config.json` and update `setup-test-repos.ts` with the matching structure.

## Troubleshooting

### Clone fails with "device busy"

Some repos may fail to move/clone if files are open in an editor. Close any open files and retry.

### Tests timeout

Large repos like `kubernetes` may take longer. The generator has a 2-minute default timeout for scanning.

### LLM tests fail

Ensure `ANTHROPIC_API_KEY` environment variable is set when using `--llm` flag.
