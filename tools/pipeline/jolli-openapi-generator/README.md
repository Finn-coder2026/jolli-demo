# jolli-openapi-generator

Generate OpenAPI 3.0.3 specifications from source code using AST-based route extraction.

## Features

- **AST-based route extraction** - Parses source code to find API routes without running the application
- **Multiple framework support** - Express, Fastify, Koa, Hono, NestJS, Next.js App Router
- **Output formats** - JSON and YAML
- **Auto-generated operationIds** - Creates meaningful operation IDs from paths and methods
- **Custom operationId mapping** - Override generated IDs with a mapping file
- **Request body detection** - Extracts property names and types from destructured request bodies
- **Response extraction** - Captures status codes and response schemas
- **Tag generation** - Automatically creates tags from path segments

## Installation

```bash
cd tools/pipeline/jolli-openapi-generator
npm install
```

## Usage

### Basic Usage

```bash
# Generate JSON spec
npx tsx src/Cli.ts --repo ./my-api

# Generate YAML spec
npx tsx src/Cli.ts --repo ./my-api --format yaml
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--repo <path>` | Repository path to scan (required) | - |
| `--output <path>` | Output file path | `openapi.json` or `openapi.yaml` |
| `--format <type>` | Output format: `json` or `yaml` | `json` |
| `--title <string>` | API title | Inferred from repo name |
| `--version <string>` | API version | `1.0.0` |
| `--description <text>` | API description | - |
| `--server <url>` | Server URL to include in spec | - |
| `--mapping <path>` | Path to operationId mapping JSON file | - |
| `--include <patterns>` | Comma-separated glob patterns to include | - |
| `--exclude <patterns>` | Comma-separated glob patterns to exclude | - |
| `--help` | Show help message | - |

### Examples

```bash
# Generate with custom title and version
npx tsx src/Cli.ts --repo ./my-api --title "My API" --version "2.0.0"

# Generate YAML with server URL
npx tsx src/Cli.ts --repo ./my-api \
  --format yaml \
  --output api-spec.yaml \
  --server "https://api.example.com"

# Use custom operationId mapping
npx tsx src/Cli.ts --repo ./my-api --mapping ./operationid-mapping.json

# Include only specific directories
npx tsx src/Cli.ts --repo ./my-api --include "src/routes/**/*.ts,src/api/**/*.ts"
```

### Platform-Specific Commands with Relative Paths

When scanning repositories outside the tool's directory, use relative paths appropriate for your platform:

**Windows CMD/PowerShell:**
```powershell
npx tsx src/Cli.ts --repo ..\..\..\..\..\opensource\kubernetes --format yaml --output ..\..\..\..\output\kubernetes\openapi.yaml
```

**Mac/Linux:**
```bash
npx tsx src/Cli.ts --repo ../../../../../opensource/kubernetes --format yaml --output ../../../../output/kubernetes/openapi.yaml
```

### OperationId Mapping File

Create a JSON file to customize operationIds:

```json
{
  "/users:get": "listUsers",
  "/users:post": "createUser",
  "/users/{id}:get": "getUserById",
  "/users/{id}:put": "updateUser",
  "/users/{id}:delete": "deleteUser"
}
```

The key format is `path:method` (lowercase method).

## Programmatic Usage

```typescript
import { generateOpenApiSpec, writeSpec } from "jolli-openapi-generator";

// Generate spec
const result = await generateOpenApiSpec({
  repo: "./my-api",
  output: "openapi.json",
  format: "json",
  title: "My API",
  version: "1.0.0",
  serverUrl: "https://api.example.com"
});

// Write to file
await writeSpec(result.spec, "openapi.json", "json");

// Access summary
console.log(`Found ${result.summary.totalRoutes} routes`);
console.log(`Frameworks: ${result.summary.frameworksDetected.join(", ")}`);
```

## Supported Frameworks

### Express

```typescript
router.get("/users", (req, res) => {
  res.json({ users: [] });
});

router.post("/users", (req, res) => {
  const { name, email } = req.body;
  res.status(201).json({ id: 1, name, email });
});
```

### Fastify

```typescript
fastify.get("/users", async (request, reply) => {
  return { users: [] };
});

fastify.post("/users", async (request, reply) => {
  const { name, email } = request.body;
  reply.code(201).send({ id: 1, name, email });
});
```

### Koa

```typescript
router.get("/users", async (ctx) => {
  ctx.body = { users: [] };
});

router.post("/users", async (ctx) => {
  const { name, email } = ctx.request.body;
  ctx.status = 201;
  ctx.body = { id: 1, name, email };
});
```

### Hono

```typescript
app.get("/users", (c) => {
  return c.json({ users: [] });
});

app.post("/users", (c) => {
  const { name, email } = c.body;
  return c.json({ id: 1, name, email }, 201);
});
```

### NestJS

```typescript
@Controller("users")
export class UsersController {
  @Get()
  findAll() {
    return { users: [] };
  }

  @Post()
  @HttpCode(201)
  create(@Body() createUserDto: CreateUserDto) {
    return { id: 1, ...createUserDto };
  }
}
```

### Next.js App Router

```typescript
// app/api/users/route.ts
export async function GET(request: Request) {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const { name, email } = await request.json();
  return NextResponse.json({ id: 1, name, email }, { status: 201 });
}
```

## Output Example

```yaml
openapi: "3.0.3"
info:
  title: My API
  version: "1.0.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: getUsers
      summary: Get users
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  users:
                    type: string
      tags:
        - Users
    post:
      operationId: postUsers
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
        "201":
          description: Resource created
      tags:
        - Users
tags:
  - name: Users
    description: Operations related to Users
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Clean build artifacts
npm run clean
```

## License

MIT
