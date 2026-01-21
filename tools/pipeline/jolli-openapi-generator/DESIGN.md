# Intelligent OpenAPI Extraction - Design Document

## Overview

This document describes the design for an intelligent OpenAPI specification extraction system that can handle diverse repositories regardless of their framework, language, or documentation maturity.

## Goals

1. **Maximize coverage** - Extract API information from any repository
2. **Minimize false positives** - Prefer accuracy over quantity
3. **Provide transparency** - Report confidence levels and extraction methods used
4. **Support extensibility** - Plugin architecture for new languages/frameworks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REPOSITORY INPUT                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 1: EXISTING SPEC DETECTION                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
               Found Specs                      No Specs Found
                    │                                 │
                    ▼                                 ▼
           ┌───────────────┐         ┌────────────────────────────────────────┐
           │ Use Existing  │         │      PHASE 2: LANGUAGE DETECTION       │
           │ Specs         │         └────────────────────────────────────────┘
           └───────────────┘                          │
                                                      ▼
                                     ┌────────────────────────────────────────┐
                                     │      PHASE 3: FRAMEWORK DETECTION      │
                                     └────────────────────────────────────────┘
                                                      │
                         ┌────────────────────────────┼────────────────────────┐
                         │                            │                        │
                Schema-Enforced               Semi-Structured              Minimal
                         │                            │                        │
                         ▼                            ▼                        ▼
                ┌─────────────────┐        ┌─────────────────┐      ┌─────────────────┐
                │  AST Full       │        │  AST + Docs     │      │  AST Basic      │
                │  Extraction     │        │  Extraction     │      │  Extraction     │
                └─────────────────┘        └─────────────────┘      └─────────────────┘
                         │                            │                        │
                         └────────────────────────────┼────────────────────────┘
                                                      │
                                                      ▼
                                     ┌────────────────────────────────────────┐
                                     │      PHASE 4: COVERAGE ASSESSMENT      │
                                     └────────────────────────────────────────┘
                                                      │
                                     ┌────────────────┴────────────────┐
                                     │                                 │
                              Acceptable                          Low Coverage
                                     │                                 │
                                     ▼                                 ▼
                            ┌───────────────┐         ┌────────────────────────┐
                            │ Return Result │         │  PHASE 5: LLM FALLBACK │
                            └───────────────┘         └────────────────────────┘
                                                               │
                                                               ▼
                                                      ┌───────────────┐
                                                      │ Return Result │
                                                      └───────────────┘
```

---

## Phase 1: Existing Spec Detection

### Purpose

Before attempting code analysis, check if the repository already has OpenAPI/Swagger specifications. Using existing specs is the most accurate approach.

### Detection Patterns

```typescript
const SPEC_PATTERNS = [
  // Root level specs
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml',
  'api-spec.json',
  'api-spec.yaml',

  // Common directories
  'docs/openapi.*',
  'docs/api/**/*.yaml',
  'docs/swagger.*',
  'api/openapi.*',
  'spec/openapi.*',

  // Public directories (like NodeBB)
  'public/openapi/**/*.yaml',
  'public/swagger/**/*.yaml',

  // Generated output directories
  'dist/openapi.*',
  'build/openapi.*',
  '.output/openapi.*',
];
```

### Validation

When specs are found:
1. Parse and validate against OpenAPI 3.x or Swagger 2.x schema
2. Check for completeness (has paths, has info)
3. Merge multiple specs if found (e.g., read.yaml + write.yaml)

### Output

```typescript
interface ExistingSpecResult {
  found: boolean;
  specs: Array<{
    path: string;
    version: '2.0' | '3.0.0' | '3.0.3' | '3.1.0';
    pathCount: number;
  }>;
  merged?: OpenApiSpec;
}
```

---

## Phase 2: Language Detection

### Purpose

Identify the primary programming language(s) to load appropriate extractors.

### Detection Methods

| Indicator | Language |
|-----------|----------|
| `package.json` | JavaScript/TypeScript |
| `requirements.txt`, `pyproject.toml`, `setup.py` | Python |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin |
| `go.mod` | Go |
| `Gemfile`, `*.gemspec` | Ruby |
| `*.csproj`, `*.sln` | C#/.NET |
| `Cargo.toml` | Rust |
| `composer.json` | PHP |

### Multi-Language Repositories

Some repositories contain multiple languages (e.g., monorepos). Detection should:
1. Identify all languages present
2. Determine primary language (most files, or explicit config)
3. Load extractors for relevant languages

### Output

```typescript
interface LanguageDetectionResult {
  primary: string;
  all: string[];
  confidence: number;
}
```

---

## Phase 3: Framework Detection

### Purpose

Identify the web framework(s) used to apply appropriate extraction strategies.

### Framework Categories

#### Schema-Enforced Frameworks

These frameworks require or strongly encourage schema definitions, making AST extraction highly accurate.

| Language | Framework | Indicators | Expected Coverage |
|----------|-----------|------------|-------------------|
| JS/TS | Fastify + @fastify/swagger | `fastify`, `@fastify/swagger` in deps | 90-100% |
| JS/TS | NestJS + @nestjs/swagger | `@nestjs/core`, `@nestjs/swagger` in deps | 90-100% |
| JS/TS | Hono + @hono/zod-openapi | `hono`, `@hono/zod-openapi` in deps | 90-100% |
| Python | FastAPI | `fastapi` in requirements | 90-100% |
| Java | Spring Boot + springdoc | `springdoc-openapi` in pom | 90-100% |
| C# | ASP.NET + Swashbuckle | `Swashbuckle.AspNetCore` in csproj | 90-100% |
| Rust | Actix + utoipa | `utoipa` in Cargo.toml | 85-95% |

#### Semi-Structured Frameworks

These frameworks support OpenAPI through documentation annotations or comments.

| Language | Framework | Indicators | Expected Coverage |
|----------|-----------|------------|-------------------|
| JS/TS | Express + swagger-jsdoc | `swagger-jsdoc` in deps | 60-80% |
| Python | Flask + flask-restx | `flask-restx` in requirements | 60-80% |
| Python | Django REST Framework | `drf-spectacular` in requirements | 60-80% |
| Java | Spring + springfox | `springfox-swagger2` in pom | 60-80% |
| Go | Gin + swag | `swaggo/swag` in go.mod | 60-80% |
| Ruby | Rails + rswag | `rswag` in Gemfile | 60-80% |
| PHP | Laravel + L5-Swagger | `darkaonline/l5-swagger` in composer | 60-80% |

#### Minimal Frameworks

These frameworks have no built-in OpenAPI support, requiring heuristic extraction.

| Language | Framework | Indicators | Expected Coverage |
|----------|-----------|------------|-------------------|
| JS/TS | Express (plain) | `express` without swagger packages | 10-40% |
| JS/TS | Koa | `koa` in deps | 10-40% |
| Python | Flask (plain) | `flask` without swagger packages | 10-40% |
| Go | Chi, Fiber | `go-chi/chi`, `gofiber/fiber` in go.mod | 10-40% |
| Ruby | Sinatra, Rails (plain) | No swagger gems | 10-40% |

### Framework Detection Logic

```typescript
interface FrameworkProfile {
  name: string;
  language: string;
  category: 'schema-enforced' | 'semi-structured' | 'minimal';
  indicators: {
    dependencies: string[];
    codePatterns: RegExp[];
  };
  extractionStrategy: ExtractionStrategy;
}

async function detectFramework(
  repoPath: string,
  language: string
): Promise<FrameworkProfile> {
  // 1. Read dependency file
  const deps = await readDependencies(repoPath, language);

  // 2. Match against known frameworks (most specific first)
  for (const profile of FRAMEWORK_PROFILES) {
    if (profile.language !== language) continue;

    const hasAllDeps = profile.indicators.dependencies
      .every(dep => deps.includes(dep));

    if (hasAllDeps) return profile;
  }

  // 3. Fall back to minimal profile for the language
  return getMinimalProfile(language);
}
```

---

## Phase 4: AST-Based Extraction

### Purpose

Parse source code and extract route definitions using Abstract Syntax Tree analysis.

### Language-Specific Parsers

| Language | Parser | Notes |
|----------|--------|-------|
| JavaScript/TypeScript | @babel/parser + @babel/traverse | Current implementation |
| Python | tree-sitter-python or built-in ast | Decorator and function analysis |
| Java | tree-sitter-java or javaparser | Annotation processing |
| Go | tree-sitter-go or go/ast | Comment extraction for swag |
| Ruby | tree-sitter-ruby | Method and route DSL analysis |
| C# | tree-sitter-c-sharp or Roslyn | Attribute processing |
| Rust | tree-sitter-rust or syn | Macro expansion |
| PHP | tree-sitter-php or nikic/php-parser | Annotation processing |

### Extraction Strategies

#### Schema-Enforced Strategy

Extract from explicit schema definitions:

```typescript
// Fastify example
fastify.get('/user/:id', {
  schema: {
    params: { type: 'object', properties: { id: { type: 'string' } } },
    response: { 200: { $ref: 'User' } }
  }
}, handler);

// Extract: path, method, params, response schema
```

```python
# FastAPI example
@app.get("/users/{user_id}", response_model=User)
async def get_user(user_id: int) -> User:
    ...

# Extract: path, method, path params with types, response model
```

```java
// Spring + springdoc example
@Operation(summary = "Get user by ID")
@ApiResponse(responseCode = "200", content = @Content(schema = @Schema(implementation = User.class)))
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) { ... }

// Extract: path, method, summary, response schema
```

#### Semi-Structured Strategy

Extract from documentation comments/annotations:

```typescript
// Express + swagger-jsdoc
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *     responses:
 *       200:
 *         description: User found
 */
app.get('/users/:id', handler);
```

```go
// Gin + swag
// @Summary Get user by ID
// @Param id path int true "User ID"
// @Success 200 {object} User
// @Router /users/{id} [get]
func GetUser(c *gin.Context) { ... }
```

#### Minimal Strategy

Extract from code patterns without schema information:

```typescript
// Pattern matching for route registration
app.get('/users/:id', handler);        // → GET /users/{id}
router.post('/users', createHandler);   // → POST /users
app.use('/api', apiRouter);             // → Prefix detection
```

### Coverage Assessment

After extraction, assess coverage quality:

```typescript
interface CoverageAssessment {
  routesFound: number;

  // Estimate total routes in codebase
  estimatedTotal: number;

  // Files that likely contain routes but yielded none
  suspiciousFiles: string[];

  // Confidence in the extraction
  confidence: number;  // 0.0 - 1.0

  // Recommendation
  recommendation: 'use' | 'warn' | 'fallback';
}

function assessCoverage(result: ExtractionResult): CoverageAssessment {
  const routeFiles = countFilesMatching([
    '**/routes/**', '**/controllers/**', '**/api/**',
    '**/*Router*', '**/*Controller*', '**/*Handler*'
  ]);

  const ratio = result.routes.length / routeFiles;

  return {
    routesFound: result.routes.length,
    estimatedTotal: routeFiles * 3,  // Assume ~3 routes per file
    suspiciousFiles: findEmptyRouteFiles(result),
    confidence: calculateConfidence(result),
    recommendation: ratio > 0.3 ? 'use' : ratio > 0.1 ? 'warn' : 'fallback'
  };
}
```

---

## Phase 5: LLM Fallback

### Purpose

When AST extraction yields poor results, use Large Language Models to analyze code and extract API information.

### Trigger Conditions

LLM fallback is triggered when:
1. Coverage assessment returns `recommendation: 'fallback'`
2. User explicitly requests LLM analysis via `--llm` flag
3. Framework is unknown/unsupported

### Implementation

#### Step 1: Identify Route Files

```typescript
async function findRouteFiles(repoPath: string): Promise<string[]> {
  // Find files likely to contain route definitions
  const patterns = [
    '**/routes/**/*.{js,ts,py,java,go,rb,php}',
    '**/controllers/**/*.{js,ts,py,java,go,rb,php}',
    '**/api/**/*.{js,ts,py,java,go,rb,php}',
    '**/*Router*.{js,ts}',
    '**/*Controller*.{js,ts,java,py}',
    '**/*Handler*.{js,ts,go}',
    '**/*Endpoint*.{java}',
    '**/views.py',  // Django
    '**/urls.py',   // Django
  ];

  return glob(patterns, { cwd: repoPath, ignore: ['node_modules/**'] });
}
```

#### Step 2: Prepare Code Chunks

```typescript
interface CodeChunk {
  files: string[];
  content: string;
  tokenCount: number;
}

async function prepareChunks(
  files: string[],
  maxTokens: number = 8000
): Promise<CodeChunk[]> {
  const chunks: CodeChunk[] = [];
  let currentChunk: CodeChunk = { files: [], content: '', tokenCount: 0 };

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const tokens = estimateTokens(content);

    if (currentChunk.tokenCount + tokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = { files: [], content: '', tokenCount: 0 };
    }

    currentChunk.files.push(file);
    currentChunk.content += `\n// File: ${file}\n${content}\n`;
    currentChunk.tokenCount += tokens;
  }

  if (currentChunk.files.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

#### Step 3: LLM Extraction

```typescript
const EXTRACTION_PROMPT = `
Analyze the following code and extract all HTTP API endpoints.

For each endpoint, provide:
- path: The URL path (use {param} format for path parameters)
- method: HTTP method (GET, POST, PUT, DELETE, PATCH)
- summary: Brief description of what this endpoint does
- parameters: Array of { name, in, type, required, description }
- requestBody: { contentType, schema } if applicable
- responses: { statusCode: { description, schema } }

Look for:
1. Explicit route registrations (app.get, router.post, @GetMapping, etc.)
2. Dynamic/programmatic route registration
3. Route configuration objects
4. Middleware that defines routes
5. Framework-specific patterns

Return valid JSON matching this schema:
{
  "routes": [
    {
      "path": "/users/{id}",
      "method": "GET",
      "summary": "Get user by ID",
      "parameters": [...],
      "responses": {...}
    }
  ]
}
`;

async function extractWithLLM(chunks: CodeChunk[]): Promise<RouteInfo[]> {
  const allRoutes: RouteInfo[] = [];

  for (const chunk of chunks) {
    const response = await llm.complete({
      model: 'claude-sonnet-4-20250514',
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: chunk.content }],
      max_tokens: 4000
    });

    const parsed = JSON.parse(response.content);
    allRoutes.push(...parsed.routes);
  }

  return deduplicateRoutes(allRoutes);
}
```

#### Step 4: Validation and Enrichment

```typescript
async function validateLLMResults(
  routes: RouteInfo[],
  repoPath: string
): Promise<RouteInfo[]> {
  const validated: RouteInfo[] = [];

  for (const route of routes) {
    // Verify route path format
    if (!isValidPath(route.path)) continue;

    // Verify HTTP method
    if (!isValidMethod(route.method)) continue;

    // Try to find the route in source code to confirm
    const found = await searchInCode(repoPath, route.path, route.method);

    validated.push({
      ...route,
      confidence: found ? 0.9 : 0.6
    });
  }

  return validated;
}
```

### Cost Management

```typescript
interface LLMCostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  chunksToProcess: number;
}

function estimateLLMCost(chunks: CodeChunk[]): LLMCostEstimate {
  const inputTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  const outputTokens = chunks.length * 1000;  // Estimate 1000 tokens per response

  // Claude Sonnet pricing (example)
  const inputCostPer1K = 0.003;
  const outputCostPer1K = 0.015;

  return {
    inputTokens,
    outputTokens,
    estimatedCost: (inputTokens / 1000 * inputCostPer1K) +
                   (outputTokens / 1000 * outputCostPer1K),
    chunksToProcess: chunks.length
  };
}
```

---

## Output Format

### Success Response

```typescript
interface OpenApiExtractionResult {
  success: true;

  spec: OpenApiSpec;

  metadata: {
    // How the spec was obtained
    source:
      | 'existing_spec'      // Found openapi.json/yaml in repo
      | 'ast_full'           // Schema-enforced framework extraction
      | 'ast_jsdoc'          // JSDoc/annotation extraction
      | 'ast_basic'          // Basic pattern matching
      | 'llm_analysis'       // LLM code analysis
      | 'hybrid';            // Combination of methods

    // Confidence in the result (0.0 - 1.0)
    confidence: number;

    // What was detected
    language: string;
    framework: string;
    frameworkCategory: 'schema-enforced' | 'semi-structured' | 'minimal';

    // Coverage metrics
    coverage: {
      routesFound: number;
      estimatedTotal: number;
      percentage: number;
    };

    // Methods attempted
    methodsTried: string[];

    // Cost information (if LLM was used)
    cost?: {
      llmTokensUsed: number;
      estimatedCost: number;
    };
  };

  // Non-fatal issues encountered
  warnings: string[];

  // Actionable recommendations
  suggestions: string[];
}
```

### Error Response

```typescript
interface OpenApiExtractionError {
  success: false;

  error: {
    code: string;
    message: string;
    details?: unknown;
  };

  // Partial results if available
  partialResult?: Partial<OpenApiSpec>;

  // What was attempted
  methodsTried: string[];

  // How to fix
  suggestions: string[];
}
```

---

## CLI Interface

```bash
# Basic usage - auto-detect everything
jolli-openapi-generator --repo ./my-api --output openapi.json

# Force specific extraction method
jolli-openapi-generator --repo ./my-api --method ast
jolli-openapi-generator --repo ./my-api --method llm
jolli-openapi-generator --repo ./my-api --method hybrid

# Specify language/framework if detection fails
jolli-openapi-generator --repo ./my-api --language python --framework fastapi

# Control LLM usage
jolli-openapi-generator --repo ./my-api --no-llm           # Never use LLM
jolli-openapi-generator --repo ./my-api --llm-only         # Only use LLM
jolli-openapi-generator --repo ./my-api --llm-threshold 20 # Use LLM if coverage < 20%

# Cost estimation for LLM
jolli-openapi-generator --repo ./my-api --estimate-cost

# Verbose output showing detection process
jolli-openapi-generator --repo ./my-api --verbose
```

---

## Configuration File

Projects can provide hints via `.openapi-generator.yaml`:

```yaml
# Specify existing OpenAPI specs to use
existing_specs:
  - public/openapi/read.yaml
  - public/openapi/write.yaml

# Override detected language/framework
language: javascript
framework: express

# Custom route file patterns
route_patterns:
  - "src/api/**/*.js"
  - "lib/routes/**/*.js"

# Exclude paths from scanning
exclude:
  - "**/test/**"
  - "**/examples/**"

# LLM configuration
llm:
  enabled: true
  threshold: 15  # Use LLM if coverage < 15%
  model: claude-sonnet-4-20250514

# Output configuration
output:
  format: json  # or yaml
  include_examples: true
  group_by_tags: true
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Existing spec detection
- [ ] Language detection
- [ ] Framework detection
- [ ] Result output format

### Phase 2: JavaScript/TypeScript (Current)
- [x] Babel AST parser
- [x] Fastify schema extraction
- [x] Express basic extraction
- [ ] NestJS decorator extraction
- [ ] Hono extraction

### Phase 3: Coverage Assessment
- [ ] Route file counting
- [ ] Confidence calculation
- [ ] Recommendation engine

### Phase 4: LLM Integration
- [ ] Code chunking
- [ ] Prompt engineering
- [ ] Result validation
- [ ] Cost management

### Phase 5: Additional Languages
- [ ] Python (FastAPI, Flask)
- [ ] Java (Spring Boot)
- [ ] Go (Gin, Echo)
- [ ] Ruby (Rails)
- [ ] C# (ASP.NET)

---

## Appendix: Framework Detection Patterns

### JavaScript/TypeScript

```typescript
const JS_FRAMEWORKS: FrameworkProfile[] = [
  {
    name: 'fastify-swagger',
    category: 'schema-enforced',
    indicators: {
      dependencies: ['fastify', '@fastify/swagger'],
      codePatterns: [/fastify\.register\(swagger/, /schema:\s*\{/]
    }
  },
  {
    name: 'nestjs-swagger',
    category: 'schema-enforced',
    indicators: {
      dependencies: ['@nestjs/core', '@nestjs/swagger'],
      codePatterns: [/@ApiProperty/, /@ApiResponse/]
    }
  },
  {
    name: 'hono-openapi',
    category: 'schema-enforced',
    indicators: {
      dependencies: ['hono', '@hono/zod-openapi'],
      codePatterns: [/createRoute/, /OpenAPIHono/]
    }
  },
  {
    name: 'express-swagger-jsdoc',
    category: 'semi-structured',
    indicators: {
      dependencies: ['express', 'swagger-jsdoc'],
      codePatterns: [/@swagger/, /@openapi/]
    }
  },
  {
    name: 'express',
    category: 'minimal',
    indicators: {
      dependencies: ['express'],
      codePatterns: [/app\.(get|post|put|delete|patch)\(/, /router\.(get|post)/]
    }
  },
  {
    name: 'koa',
    category: 'minimal',
    indicators: {
      dependencies: ['koa'],
      codePatterns: [/router\.(get|post)/, /ctx\.body/]
    }
  }
];
```

### Python

```typescript
const PYTHON_FRAMEWORKS: FrameworkProfile[] = [
  {
    name: 'fastapi',
    category: 'schema-enforced',
    indicators: {
      dependencies: ['fastapi'],
      codePatterns: [/@app\.(get|post)/, /response_model=/, /BaseModel/]
    }
  },
  {
    name: 'flask-restx',
    category: 'semi-structured',
    indicators: {
      dependencies: ['flask-restx', 'flask-restplus'],
      codePatterns: [/@api\.doc/, /@api\.expect/, /fields\./]
    }
  },
  {
    name: 'drf-spectacular',
    category: 'semi-structured',
    indicators: {
      dependencies: ['drf-spectacular'],
      codePatterns: [/@extend_schema/, /OpenApiParameter/]
    }
  },
  {
    name: 'flask',
    category: 'minimal',
    indicators: {
      dependencies: ['flask'],
      codePatterns: [/@app\.route/, /@blueprint\.route/]
    }
  },
  {
    name: 'django',
    category: 'minimal',
    indicators: {
      dependencies: ['django'],
      codePatterns: [/path\(/, /urlpatterns/]
    }
  }
];
```

### Java

```typescript
const JAVA_FRAMEWORKS: FrameworkProfile[] = [
  {
    name: 'spring-springdoc',
    category: 'schema-enforced',
    indicators: {
      dependencies: ['springdoc-openapi'],
      codePatterns: [/@Operation/, /@ApiResponse/, /@Schema/]
    }
  },
  {
    name: 'spring-springfox',
    category: 'semi-structured',
    indicators: {
      dependencies: ['springfox-swagger2'],
      codePatterns: [/@Api\(/, /@ApiOperation/]
    }
  },
  {
    name: 'spring-mvc',
    category: 'minimal',
    indicators: {
      dependencies: ['spring-webmvc', 'spring-boot-starter-web'],
      codePatterns: [/@RestController/, /@GetMapping/, /@PostMapping/]
    }
  },
  {
    name: 'jaxrs',
    category: 'minimal',
    indicators: {
      dependencies: ['javax.ws.rs', 'jakarta.ws.rs'],
      codePatterns: [/@Path/, /@GET/, /@POST/]
    }
  }
];
```

### Go

```typescript
const GO_FRAMEWORKS: FrameworkProfile[] = [
  {
    name: 'gin-swag',
    category: 'semi-structured',
    indicators: {
      dependencies: ['github.com/gin-gonic/gin', 'github.com/swaggo/swag'],
      codePatterns: [/\/\/ @Summary/, /\/\/ @Router/]
    }
  },
  {
    name: 'echo-swagger',
    category: 'semi-structured',
    indicators: {
      dependencies: ['github.com/labstack/echo', 'github.com/swaggo/echo-swagger'],
      codePatterns: [/\/\/ @title/, /echo\.New\(\)/]
    }
  },
  {
    name: 'gin',
    category: 'minimal',
    indicators: {
      dependencies: ['github.com/gin-gonic/gin'],
      codePatterns: [/gin\.Default\(\)/, /\.GET\(/, /\.POST\(/]
    }
  },
  {
    name: 'chi',
    category: 'minimal',
    indicators: {
      dependencies: ['github.com/go-chi/chi'],
      codePatterns: [/chi\.NewRouter\(\)/, /r\.Get\(/, /r\.Post\(/]
    }
  }
];
```
