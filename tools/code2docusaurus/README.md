# code2docusaurus

A CLI tool that scans your codebase for API routes and automatically generates Docusaurus documentation.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation from Monorepo](#installation-from-monorepo)
  - [Installation from npm](#installation-from-npm)
- [Usage](#usage)
  - [Command Syntax](#command-syntax)
  - [Command-Line Parameters](#command-line-parameters)
  - [Examples](#examples)
- [Supported Code Patterns](#supported-code-patterns)
- [Output Structure](#output-structure)
- [How It Works](#how-it-works)
  - [Architecture Overview](#architecture-overview)
  - [Code Flow](#code-flow)
  - [Component Details](#component-details)
- [Development Guide](#development-guide)
  - [Project Structure](#project-structure)
  - [Building from Source](#building-from-source)
  - [Making Changes](#making-changes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- 🔍 **Automatic Code Scanning** - Extracts API route definitions from your codebase
- 📝 **OpenAPI 3.0 Generation** - Creates industry-standard API specifications
- 📚 **Docusaurus Integration** - Generates complete documentation sites
- 🚀 **Multi-Framework Support** - Works with popular Node.js frameworks:
  - ⚡ **Next.js App Router** - Next.js 13+ App Router patterns
  - 🎯 **Express.js** - Express and Router patterns
  - ⚡ **Fastify** - High-performance Fastify routes
  - 🦘 **Koa** - Koa router and context patterns
  - 🔥 **Hono** - Modern edge-compatible Hono framework
  - 🐈 **NestJS** - NestJS controllers with decorators
- 🌐 **Python Support** (Coming Soon) - FastAPI, Flask, and Django REST Framework
- 🚀 **Zero Configuration** - Works out of the box with sensible defaults
- 📊 **Progress Tracking** - Real-time feedback during scanning and generation
- 🔧 **Flexible Output** - Supports YAML and JSON formats

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- A repository with API routes using one of the supported frameworks:
  - Express.js, Fastify, Koa, Hono, NestJS, or Next.js App Router

### Installation from Monorepo

If you're working with the source code from the monorepo:

#### Step 1: Clone the Repository

```bash
# Clone the jolli monorepo
git clone https://github.com/jolliai/jolli.git
cd jolli
```

#### Step 2: Navigate to the Tool Directory

```bash
cd tools/code2docusaurus
```

#### Step 3: Install Dependencies

```bash
npm install
```

#### Step 4: Build the Tool

```bash
npm run build
```

This compiles the TypeScript source code to JavaScript in the `dist/` folder.

#### Step 5: Run the Tool

You can now run the tool in two ways:

**Option A: Using npm run dev (for development)**
```bash
npm run dev -- /path/to/your/repo --generate-docs
```

**Option B: Link globally (for production use)**
```bash
npm link
# Now you can use it anywhere
code2docusaurus /path/to/your/repo --generate-docs
```

### Installation from npm

Once published to npm (future):

```bash
npm install -g code2docusaurus
```

---

## Usage

### Command Syntax

```bash
code2docusaurus <repo-path> [options]
```

### Command-Line Parameters

#### Required Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `<repo-path>` | Path to the repository containing API routes | `./my-api-project` |

#### Optional Parameters

| Option | Short | Description | Default | Possible Values |
|--------|-------|-------------|---------|-----------------|
| `--output <path>` | `-o` | Output directory for generated files | `./api-docs` | Any valid directory path |
| `--format <format>` | `-f` | Output format for OpenAPI spec | `yaml` | `yaml`, `json` |
| `--generate-docs` | - | Generate full Docusaurus documentation site | `false` | Flag (no value needed) |
| `--help` | `-h` | Display help information | - | - |
| `--version` | `-V` | Display version number | - | - |

### Examples

#### Example 1: Basic Scan (OpenAPI Spec Only)

Generate only the OpenAPI specification file:

```bash
code2docusaurus /home/user/my-api-project
```

**Output:**
- Creates `./api-docs/openapi.yaml`

**What happens:**
1. Scans `/home/user/my-api-project` for route files
2. Extracts API endpoints, parameters, and responses
3. Generates OpenAPI 3.0 specification
4. Saves to `./api-docs/openapi.yaml`

---

#### Example 2: Generate OpenAPI in JSON Format

```bash
code2docusaurus ./my-api-project -f json -o ./output
```

**Output:**
- Creates `./output/openapi.json`

**Parameters explained:**
- `./my-api-project` - Repository to scan
- `-f json` - Output in JSON format instead of YAML
- `-o ./output` - Save to `./output` directory

---

#### Example 3: Generate Full Docusaurus Documentation

```bash
code2docusaurus ./my-api-project --generate-docs -o ./api-docs
```

**Output:**
- Creates complete Docusaurus site in `./api-docs/`

**Directory structure created:**
```
./api-docs/
├── docs/
│   ├── intro.md
│   └── api/
│       └── my-api-project/
│           ├── overview.md
│           └── endpoints/
│               ├── get-api-users.md
│               ├── post-api-users.md
│               └── ...
├── src/
│   └── css/
│       └── custom.css
├── static/
│   └── img/
├── docusaurus.config.js
├── sidebars.js
├── package.json
└── openapi.yaml
```

**What happens:**
1. Scans repository for routes
2. Generates OpenAPI specification
3. Creates Docusaurus configuration
4. Generates markdown documentation for each endpoint
5. Creates sidebar navigation
6. Adds package.json with Docusaurus dependencies

---

#### Example 4: Complex Real-World Usage

```bash
cd ~/projects/jolli/tools/code2docusaurus

# Scan your Express API and generate docs
npm run dev -- ~/projects/my-express-api --generate-docs -o ~/projects/my-express-api/docs
```

**Explanation:**
- Runs tool in development mode (no need to build)
- Scans `~/projects/my-express-api` for routes
- Generates full Docusaurus documentation
- Saves output to `~/projects/my-express-api/docs`

---

## Supported Code Patterns

The tool recognizes the following patterns:

### Next.js App Router (New!)

```typescript
// app/api/users/route.ts
import { NextResponse } from 'next/server';

// GET request
export async function GET(request: Request) {
  return NextResponse.json({ users: [] }, { status: 200 });
}

// POST request with request body
export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  return NextResponse.json({ id: 1, name, email }, { status: 201 });
}

// PUT, DELETE, PATCH also supported
export async function DELETE(request: Request) {
  return NextResponse.json({ deleted: true });
}
```

**Dynamic Routes:**
```typescript
// app/api/users/[userId]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  return NextResponse.json({ userId: params.userId });
}
```

The tool automatically:
- Infers route paths from file structure: `app/api/users/route.ts` → `/api/users`
- Converts dynamic segments: `[userId]` → `:userId`
- Extracts request body from `await request.json()`
- Detects status codes from `NextResponse.json(..., { status: 201 })`
- Identifies required fields from validation checks

### Express App Routes (✅ Supported)

```javascript
const express = require('express');
const app = express();

// GET request
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

// POST request with request body
app.post('/api/users', (req, res) => {
  const { name, email } = req.body; // Extracted automatically
  res.status(201).json({ id: 1, name, email });
});

// PUT with path parameter
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params; // Path param detected
  res.json({ id, updated: true });
});

// DELETE
app.delete('/api/users/:id', (req, res) => {
  res.status(204).send();
});
```

### Router-Based Routes

```javascript
const express = require('express');
const router = express.Router();

// Router methods
router.get('/products', (req, res) => { /* ... */ });
router.post('/products', (req, res) => { /* ... */ });
router.put('/products/:id', (req, res) => { /* ... */ });
router.delete('/products/:id', (req, res) => { /* ... */ });
router.patch('/products/:id', (req, res) => { /* ... */ });

module.exports = router;
```

### Request Body Extraction

The tool automatically detects request body parameters:

```javascript
router.post('/api/chat', (req, res) => {
  const { message, userId } = req.body;

  // Tool detects: message (string), userId (number)
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  res.json({ response: 'Hello!' });
});
```

### Path Parameters

```javascript
// Detects :userId as path parameter
router.get('/api/users/:userId/posts/:postId', (req, res) => {
  const { userId, postId } = req.params;
  res.json({ userId, postId });
});
```

### Response Status Codes

```javascript
router.post('/api/items', (req, res) => {
  // Status 201 detected
  res.status(201).json({ id: 1, name: 'Item' });
});

router.get('/api/items/:id', (req, res) => {
  // Status 404 detected
  if (!item) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Status 200 detected
  res.json(item);
});
```

### Fastify Support (✅ New!)

```javascript
const fastify = require('fastify')();

// GET request
fastify.get('/api/users', async (request, reply) => {
  reply.send({ users: [] });
});

// POST request with request body
fastify.post('/api/users', async (request, reply) => {
  const { name, email } = request.body;
  if (!name) throw new Error('Name required');
  reply.code(201).send({ id: 1, name, email });
});

// Path parameters
fastify.get('/api/users/:id', async (request, reply) => {
  const { id } = request.params;
  reply.send({ id });
});
```

**Patterns detected:**
- `reply.send()` - 200 response
- `reply.code(201).send()` - Custom status codes
- `request.body` - Request body extraction
- `request.params` - Path parameters

### Koa Support (✅ New!)

```javascript
const Koa = require('koa');
const Router = require('@koa/router');

const app = new Koa();
const router = new Router();

// GET request
router.get('/api/users', async (ctx) => {
  ctx.body = { users: [] };
});

// POST request with request body
router.post('/api/users', async (ctx) => {
  const { name, email } = ctx.request.body;
  if (!name) throw new Error('Name required');
  ctx.status = 201;
  ctx.body = { id: 1, name, email };
});

// Path parameters
router.get('/api/users/:id', async (ctx) => {
  const { id } = ctx.params;
  ctx.body = { id };
});
```

**Patterns detected:**
- `ctx.body = { ... }` - Response body
- `ctx.status = 201` - Status codes
- `ctx.request.body` - Request body extraction
- `ctx.params` - Path parameters

### Hono Support (✅ New!)

```javascript
import { Hono } from 'hono';

const app = new Hono();

// GET request
app.get('/api/users', (c) => {
  return c.json({ users: [] });
});

// POST request with request body
app.post('/api/users', async (c) => {
  const { name, email } = await c.req.json();
  if (!name) throw new Error('Name required');
  return c.json({ id: 1, name, email }, 201);
});

// Path parameters
app.get('/api/users/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ id });
});
```

**Patterns detected:**
- `c.json({ ... })` - JSON response (200)
- `c.json({ ... }, 201)` - JSON response with status
- `c.req.json()` - Request body extraction
- `c.req.param()` - Path parameters

### NestJS Support (✅ New!)

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';

@Controller('users')
export class UsersController {
  // GET request
  @Get()
  findAll() {
    return { users: [] };
  }

  // GET with path parameter
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id };
  }

  // POST with request body
  @Post()
  @HttpCode(201)
  create(@Body() createUserDto: CreateUserDto) {
    return { id: 1, ...createUserDto };
  }

  // PUT request
  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return { id, updated: true };
  }

  // DELETE request
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    // No content
  }
}
```

**Patterns detected:**
- `@Controller('path')` - Controller base path
- `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` - HTTP methods
- `@Param('id')` - Path parameters
- `@Body()` - Request body extraction
- `@HttpCode(201)` - Custom status codes

---

## Output Structure

### When Using `--generate-docs`

```
api-docs/
├── docs/                          # Documentation content
│   ├── intro.md                   # Main introduction page
│   └── api/                       # API documentation
│       └── [project-name]/
│           ├── overview.md        # API overview
│           └── endpoints/         # Individual endpoint docs
│               ├── get-api-users.md
│               ├── post-api-users.md
│               ├── put-api-users-id.md
│               └── delete-api-users-id.md
├── src/                           # Custom React components (optional)
│   └── css/
│       └── custom.css            # Custom styling
├── static/                        # Static assets
│   └── img/
│       └── .gitkeep
├── docusaurus.config.js          # Docusaurus configuration
├── sidebars.js                   # Sidebar navigation structure
├── package.json                  # Docusaurus dependencies
└── openapi.yaml                  # OpenAPI specification
```

### OpenAPI Specification Structure

```yaml
openapi: 3.0.0
info:
  title: my-api-project
  version: 1.0.0
  description: Automatically generated from code analysis
paths:
  /api/users:
    get:
      summary: Get users
      description: Automatically extracted from /path/to/routes/users.js
      tags:
        - Users
      responses:
        '200':
          description: Successful response
    post:
      summary: Create users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                email:
                  type: string
              required:
                - name
                - email
      responses:
        '201':
          description: Resource created
```

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     code2docusaurus                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Code       │───▶│   OpenAPI    │───▶│  Docusaurus  │ │
│  │   Scanner    │    │  Generator   │    │  Generator   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │        │
│         ▼                    ▼                    ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Route Info  │    │ OpenAPI Spec │    │   Markdown   │ │
│  │  Extraction  │    │  (YAML/JSON) │    │     Docs     │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Code Flow

Here's how the tool works from a new engineer's perspective:

#### Phase 1: Entry Point (index.tsx)

**File:** `src/index.tsx`

```typescript
// 1. User runs: code2docusaurus /path/to/repo --generate-docs

// 2. Commander.js parses command-line arguments
program
  .argument('<repo-path>', 'Path to repository')
  .option('-o, --output <path>', 'Output directory', './api-docs')
  .option('--generate-docs', 'Generate Docusaurus documentation')
  .action((repoPath, options) => {
    // 3. Render React component with Ink (terminal UI)
    render(<Code2Docusaurus repoPath={repoPath} options={options} />);
  });
```

**What happens:**
1. Command-line arguments are parsed
2. React component is rendered in the terminal (using Ink library)
3. Control passes to the Code2Docusaurus component

---

#### Phase 2: Scanning Stage

**File:** `src/core/scanners/code-scanner.ts`

**Component:** `CodeScanner`

```typescript
// 4. CodeScanner.scan() is called
async scan(repoPath: string): Promise<CodeScanResult> {
  // 5. Find all JavaScript/TypeScript files in specific directories
  const files = await this.findCodeFiles(repoPath);
  // Searches in: routes/, controllers/, api/, *router*.js, *route*.js

  // 6. Parse each file using Babel
  for (const filePath of files) {
    await this.scanFile(filePath);
  }

  // 7. Return extracted route information
  return { routes: this.routes, title, version };
}
```

**Step-by-step:**
1. **File Discovery** - Searches for route files using glob patterns
2. **AST Parsing** - Uses Babel to parse JavaScript/TypeScript into Abstract Syntax Tree
3. **Route Detection** - Traverses AST to find `router.get()`, `app.post()`, etc.
4. **Metadata Extraction** - Extracts path, method, parameters, request body, responses

**Example AST traversal:**
```typescript
// Looking for: router.post('/api/users', (req, res) => { ... })

traverse(ast, {
  CallExpression: (path) => {
    // Checks if this is router.METHOD(...)
    if (isMemberExpression(node.callee)) {
      const method = node.callee.property.name; // 'post'
      const routePath = node.arguments[0].value; // '/api/users'
      const handler = node.arguments[1]; // Function expression

      // Extract request body, params, responses from handler
      this.analyzeRouteHandler(method, routePath, handler);
    }
  }
});
```

**Emits events for UI updates:**
- `file` - Current file being scanned
- `progress` - Percentage complete
- `routeFound` - New route discovered
- `error` - Parsing error (doesn't stop scan)

---

#### Phase 3: OpenAPI Generation

**File:** `src/core/generators/openapi-from-code.ts`

**Component:** `OpenAPIFromCodeGenerator`

```typescript
// 8. Generate OpenAPI spec from scanned routes
generate(scanResult: CodeScanResult): OpenAPISpec {
  const spec = {
    openapi: '3.0.0',
    info: { title, version, description },
    paths: {}
  };

  // 9. Group routes by path
  const pathGroups = this.groupRoutesByPath(scanResult.routes);
  // { '/api/users': [GET route, POST route], ... }

  // 10. Generate OpenAPI path item for each route
  for (const [routePath, routes] of pathGroups) {
    spec.paths[routePath] = {};
    for (const route of routes) {
      spec.paths[routePath][route.method.toLowerCase()] =
        this.generatePathItem(route);
    }
  }

  return spec;
}
```

**Transforms route data to OpenAPI format:**
```typescript
// Input (from scanner):
{
  method: 'POST',
  path: '/api/users',
  handler: {
    requestBody: {
      properties: [
        { name: 'email', type: 'string', required: true },
        { name: 'name', type: 'string', required: true }
      ]
    },
    responses: [{ statusCode: 201, description: 'Created' }]
  }
}

// Output (OpenAPI):
{
  post: {
    summary: 'Create users',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' }
            },
            required: ['email', 'name']
          }
        }
      }
    },
    responses: {
      '201': { description: 'Created' }
    }
  }
}
```

**Output:** OpenAPI specification object ready for serialization

---

#### Phase 4: Docusaurus Generation (Optional)

**File:** `src/core/generators/docusaurus-generator.ts`

**Component:** `DocusaurusGenerator`

```typescript
// 11. Generate complete Docusaurus site
async generate(specs: ScanResult[], outputPath: string) {
  // 12. Create directory structure
  await this.createDirectoryStructure(outputPath);
  // Creates: docs/, src/css/, static/img/

  // 13. Generate intro page
  await this.generateIntroPage(specs, outputPath);

  // 14. For each API spec:
  for (const spec of specs) {
    // Generate overview page
    await this.generateSpecDocs(spec, outputPath);

    // Generate individual endpoint documentation
    await this.generateEndpoints(spec, outputPath);
  }

  // 15. Generate configuration files
  await this.generateDocusaurusConfig(specs, outputPath);
  await this.generateSidebar(specs, outputPath);
  await this.generatePackageJson(outputPath);
}
```

**Uses:** `MarkdownGenerator` to create documentation content

**File:** `src/core/generators/markdown-generator.ts`

```typescript
// Generates markdown for each endpoint
async generateEndpoint(endpoint: EndpointInfo, spec: OpenAPISpec) {
  return `---
id: ${this.slugify(method + '-' + path)}
title: ${summary}
---

# ${summary}

${description}

## Endpoint

\`\`\`
${method.toUpperCase()} ${path}
\`\`\`

${this.generateParametersSection(parameters)}
${this.generateResponsesSection(responses)}

## Code Examples

### JavaScript
\`\`\`javascript
const response = await fetch('${path}', {
  method: '${method.toUpperCase()}',
  headers: { 'Content-Type': 'application/json' }
});
\`\`\`
`;
}
```

**Output:** Complete Docusaurus site ready to build and deploy

---

### Component Details

#### 1. Code Scanner (`src/core/scanners/code-scanner.ts`)

**Purpose:** Extract route information from JavaScript/TypeScript code

**Key Methods:**
- `scan(repoPath)` - Main entry point
- `findCodeFiles(repoPath)` - Locate route files using glob patterns
- `scanFile(filePath)` - Parse file and extract routes
- `analyzeRouteCall(node)` - Detect route definitions
- `analyzeRouteHandler(handler)` - Extract request/response details
- `extractRequestBody(handler)` - Find req.body destructuring
- `extractPathParams(path)` - Parse :param from route path
- `extractResponses(handler)` - Find res.json() and res.status() calls

**Dependencies:**
- `@babel/parser` - Parse code into AST
- `@babel/traverse` - Walk the AST
- `@babel/types` - Type checking for AST nodes
- `glob` - Find files matching patterns

---

#### 2. OpenAPI Generator (`src/core/generators/openapi-from-code.ts`)

**Purpose:** Convert route data to OpenAPI 3.0 specification

**Key Methods:**
- `generate(scanResult)` - Main entry point
- `groupRoutesByPath(routes)` - Organize routes by path
- `generatePathItem(route)` - Create OpenAPI path object
- `generatePropertiesSchema(properties)` - Build schema for request body
- `generateSummary(route)` - Create human-readable summary
- `extractTag(routePath)` - Derive tag from path

**Output Formats:**
- YAML (using `yaml` package)
- JSON (using `JSON.stringify`)

---

#### 3. Docusaurus Generator (`src/core/generators/docusaurus-generator.ts`)

**Purpose:** Create complete Docusaurus documentation site

**Key Methods:**
- `generate(specs, outputPath)` - Main orchestrator
- `createDirectoryStructure(outputPath)` - Set up folders
- `generateIntroPage(specs)` - Create intro.md
- `generateSpecDocs(spec)` - Create API overview
- `generateEndpoints(spec)` - Create endpoint docs
- `generateDocusaurusConfig()` - Create docusaurus.config.js
- `generateSidebar(specs)` - Create sidebars.js
- `generatePackageJson()` - Create package.json

**Uses:** `MarkdownGenerator` for content creation

---

#### 4. Markdown Generator (`src/core/generators/markdown-generator.ts`)

**Purpose:** Generate markdown documentation content

**Key Methods:**
- `generateIntro(specs)` - Introduction page
- `generateAPIOverview(spec)` - API overview page
- `generateEndpoint(endpoint, spec)` - Individual endpoint page
- `generateParametersSection(parameters)` - Parameter tables
- `generateResponsesSection(responses)` - Response documentation

**Features:**
- Code examples in JavaScript, Python, and cURL
- Markdown tables for parameters
- Frontmatter for Docusaurus integration

---

#### 5. UI Components

**SimpleProgressBar** (`src/components/SimpleProgressBar.tsx`)
- Displays progress bar in terminal
- Uses Ink's Box and Text components

**SimpleTable** (`src/components/SimpleTable.tsx`)
- Renders ASCII tables in terminal
- Auto-calculates column widths

---

## Development Guide

### Project Structure

```
src/
├── core/                      # Core business logic
│   ├── scanners/
│   │   └── code-scanner.ts   # AST parsing and route extraction
│   └── generators/
│       ├── openapi-from-code.ts    # OpenAPI spec generation
│       ├── docusaurus-generator.ts # Docusaurus site generation
│       ├── markdown-generator.ts   # Markdown content creation
│       └── ai-enhancer.ts          # AI enhancement (future)
├── components/                # UI components for terminal
│   ├── SimpleTable.tsx       # ASCII table renderer
│   └── SimpleProgressBar.tsx # Progress bar component
├── types/                     # TypeScript type definitions
│   ├── openapi.ts            # OpenAPI and scan result types
│   └── index.ts              # Type exports
├── utils/                     # Utility functions
│   ├── file-utils.ts         # File system operations
│   ├── errors.ts             # Custom error classes
│   └── constants.ts          # Constants and defaults
└── index.tsx                  # CLI entry point
```

### Building from Source

```bash
# 1. Navigate to the project
cd tools/code2docusaurus

# 2. Install dependencies
npm install

# 3. Build TypeScript to JavaScript
npm run build

# 4. Test the build
node dist/index.js --help
```

### Making Changes

#### Adding a New Route Pattern

1. **Edit:** `src/core/scanners/code-scanner.ts`
2. **Modify:** `analyzeRouteCall()` method
3. **Test:** Run against a sample project
4. **Rebuild:** `npm run build`

#### Customizing Markdown Output

1. **Edit:** `src/core/generators/markdown-generator.ts`
2. **Modify:** Template strings in generation methods
3. **Test:** Generate docs and inspect markdown files
4. **Rebuild:** `npm run build`

#### Adding New CLI Options

1. **Edit:** `src/index.tsx`
2. **Add:** New option to `program.option()`
3. **Update:** Component props interface
4. **Rebuild:** `npm run build`

---

## Troubleshooting

### Problem: "No routes found"

**Cause:** Tool can't find route definitions in your code

**Solutions:**
1. Verify your code uses Express or Router patterns
2. Check routes are in standard locations: `routes/`, `api/`, `controllers/`
3. Ensure files have `.js`, `.ts`, or `.mjs` extensions
4. Review [Supported Code Patterns](#supported-code-patterns)

### Problem: Build errors

**Cause:** TypeScript compilation failed

**Solutions:**
```bash
# Clean and reinstall
rm -rf dist node_modules package-lock.json
npm install
npm run build
```

### Problem: Missing dependencies

**Cause:** node_modules not installed

**Solution:**
```bash
cd tools/code2docusaurus
npm install
```

---

## License

MIT

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to test
5. Submit a pull request

For major changes, please open an issue first to discuss the proposed changes.
