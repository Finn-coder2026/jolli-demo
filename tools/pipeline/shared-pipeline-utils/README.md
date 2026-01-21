# shared-pipeline-utils

Shared utilities for documentation pipeline tools.

## Overview

This package provides common functionality used across all documentation pipeline tools:

- **MDX parsing** - Parse frontmatter and split content by headings
- **Content hashing** - Generate stable SHA256 hashes for version comparison
- **Contract resolution** - Parse and normalize contract references
- **File system** - Walk directories and find files
- **Git helpers** - Common git operations
- **Code scanning** - AST-based route extraction for OpenAPI generation
- **Detection** - Intelligent language/framework detection for 8 languages and 50+ frameworks

## Installation

```bash
npm install shared-pipeline-utils
```

## Usage

### MDX Parsing

```typescript
import { parseMdx, splitByHeadings, generateSectionId } from "shared-pipeline-utils/mdx";

// Parse MDX file
const mdxContent = await readFile("docs/api/endpoint.mdx", "utf-8");
const { frontmatter, content } = parseMdx(mdxContent);

// Split by headings
const sections = splitByHeadings(content);

// Generate section IDs
for (const section of sections) {
  const sectionId = generateSectionId("api/endpoint", section.heading);
  console.log(sectionId); // "api/endpoint::section-slug"
}
```

### Content Hashing

```typescript
import { hashContent, verifyHash } from "shared-pipeline-utils/hashing";

// Generate hash
const hash = hashContent("Section content here...");
console.log(hash); // "sha256:abc123..."

// Verify hash
const isValid = verifyHash(content, hash);
```

### Contract References

```typescript
import { parseContractRef, validateCoversArray } from "shared-pipeline-utils/contracts";

// Parse contract reference
const ref = parseContractRef("openapi:RateLimitService_getLimits");
// { type: "openapi", key: "RateLimitService_getLimits" }

// Validate frontmatter covers array
const covers = validateCoversArray([
  "openapi:Service_method",
  "config:VAR_NAME"
]);
```

### File System

```typescript
import { findMdxFiles, isEmptyDirectory } from "shared-pipeline-utils/fs";

// Find all MDX files
const mdxFiles = await findMdxFiles("docs/");

// Check if directory is empty
const isEmpty = await isEmptyDirectory("docs/");
```

### Git Helpers

```typescript
import { isGitRepo, getCurrentBranch, getCommitSha } from "shared-pipeline-utils/git";

// Check if directory is a git repo
const isRepo = isGitRepo("/path/to/repo");

// Get current branch
const branch = getCurrentBranch({ cwd: "/path/to/repo" });

// Get commit SHA
const sha = getCommitSha("HEAD", { cwd: "/path/to/repo" });
```

### Detection Module

The detection module provides intelligent framework and language detection for OpenAPI extraction:

```typescript
import {
  detectLanguage,
  detectFrameworkForLanguage,
  detectExistingSpecs,
  assessCoverage
} from "shared-pipeline-utils/detection";

// Detect programming language
const langResult = await detectLanguage("/path/to/repo");
console.log(langResult.primary); // "typescript"

// Detect framework for the language
const fwResult = await detectFrameworkForLanguage("/path/to/repo", "typescript");
console.log(fwResult.framework.name); // "fastify-swagger"
console.log(fwResult.framework.category); // "schema-enforced"

// Check for existing OpenAPI specs
const specResult = await detectExistingSpecs("/path/to/repo");
if (specResult.found) {
  console.log(specResult.primary?.path); // "openapi.yaml"
}
```

## Supported Languages and Frameworks

The detection module supports the following languages and frameworks:

| Language | Framework | OpenAPI Extension | Category |
|:---------|:----------|:------------------|:---------|
| **JavaScript/TypeScript** | | | |
| | Fastify | @fastify/swagger | schema-enforced |
| | NestJS | @nestjs/swagger | schema-enforced |
| | Hono | @hono/zod-openapi | schema-enforced |
| | Express | swagger-jsdoc | semi-structured |
| | Koa | koa2-swagger-ui | semi-structured |
| | Express | - | minimal |
| | Fastify | - | minimal |
| | NestJS | - | minimal |
| | Hono | - | minimal |
| | Koa | - | minimal |
| | Next.js | - | minimal |
| **Python** | | | |
| | FastAPI | (built-in) | schema-enforced |
| | Flask | flask-openapi3, flasgger | semi-structured |
| | Django REST | drf-spectacular, drf-yasg | semi-structured |
| | Flask | - | minimal |
| | Django | - | minimal |
| | Starlette | - | minimal |
| **Java** | | | |
| | Spring Boot | springdoc-openapi | schema-enforced |
| | Spring Boot | springfox-swagger2 | semi-structured |
| | Spring Boot | - | minimal |
| | Quarkus | - | minimal |
| | Micronaut | - | minimal |
| **Go** | | | |
| | Gin | swaggo/swag | semi-structured |
| | Echo | swaggo/echo-swagger | semi-structured |
| | Gin | - | minimal |
| | Echo | - | minimal |
| | Chi | - | minimal |
| | Fiber | - | minimal |
| | Gorilla Mux | - | minimal |
| **Ruby** | | | |
| | Rails | rswag | semi-structured |
| | Grape | grape-swagger | semi-structured |
| | Rails | - | minimal |
| | Sinatra | - | minimal |
| | Grape | - | minimal |
| | Hanami | - | minimal |
| **C# / .NET** | | | |
| | ASP.NET Core | Swashbuckle | schema-enforced |
| | ASP.NET Core | NSwag | schema-enforced |
| | ASP.NET Core | - | minimal |
| | ASP.NET Minimal APIs | - | minimal |
| **Rust** | | | |
| | Actix-web | utoipa | schema-enforced |
| | Axum | utoipa | schema-enforced |
| | Actix-web | paperclip | semi-structured |
| | Actix-web | - | minimal |
| | Axum | - | minimal |
| | Rocket | - | minimal |
| | Warp | - | minimal |
| **PHP** | | | |
| | Laravel | L5-Swagger | schema-enforced |
| | Symfony | NelmioApiDocBundle | schema-enforced |
| | Laravel | swagger-php | semi-structured |
| | Laravel | - | minimal |
| | Symfony | - | minimal |
| | Slim | - | minimal |
| | Lumen | - | minimal |

### Framework Categories

- **schema-enforced**: Framework has built-in schema validation that produces complete OpenAPI specs (95%+ expected coverage)
- **semi-structured**: Framework uses annotations/decorators for partial OpenAPI documentation (60-80% expected coverage)
- **minimal**: Basic route extraction only, no schema information (30-50% expected coverage)

### LLM Extractor

The LLM extractor module provides fallback extraction using Claude when AST-based extraction yields low coverage:

```typescript
import {
  extractWithLLM,
  estimateExtractionCost,
  findRouteFiles,
  prepareChunks,
} from "shared-pipeline-utils/llm-extractor";

// Estimate cost before extraction
const { files, chunks, estimate } = await estimateExtractionCost("/path/to/repo");
console.log(`Estimated cost: $${estimate.estimatedCost}`);

// Extract routes with LLM
const result = await extractWithLLM("/path/to/repo", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
  maxChunkTokens: 8000,
});

console.log(`Found ${result.routes.length} routes`);
console.log(`Actual cost: $${result.cost.estimatedCost}`);
```

## API Reference

See individual module exports for detailed API documentation.

## License

MIT
