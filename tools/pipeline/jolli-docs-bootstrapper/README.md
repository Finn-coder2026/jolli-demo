# jolli-docs-bootstrapper

Generates initial MDX documentation structure from API route files in a codebase.

## Purpose

Part of the jolli documentation pipeline, this tool scans a repository for API route files and generates a complete MDX documentation structure with:
- API reference pages for each endpoint
- Frontmatter with contract coverage metadata (`covers: [openapi:OperationId]`)
- Overview and quickstart guides
- Organized directory structure following Nextra 4.x conventions

## Installation

```bash
cd tools/jolli-docs-bootstrapper
npm install
npm run build
```

## Command Line Usage

```bash
npx jolli-docs-bootstrapper \
  --source <source-name> \
  --repo <path-to-repo> \
  --docsDir <output-directory> \
  [--ai-enhance]
```

### Options

- `--source <name>` - Source identifier (e.g., "openapi-demo") [required]
- `--repo <path>` - Path to the repository to scan [required]
- `--docsDir <path>` - Output directory for generated documentation [required]
- `--ai-enhance` - (Optional) Use LLM to enhance documentation quality
- `--help`, `-h` - Display help message

## What It Does

1. **Checks Documentation Directory**: Ensures the docs directory is empty
2. **Scans Repository**: Finds API route files in `routes/` or `api/` directories
3. **Generates MDX Files**: Creates documentation with frontmatter:
   ```yaml
   ---
   title: Get Rate Limits
   covers:
     - openapi:RateLimitService_getLimits
   tags: [api, get, rate-limiting]
   ---
   ```
4. **Creates Structure**: Generates:
   - `overview.mdx`: API overview
   - `quickstart.mdx`: Getting started guide
   - `api/{resource}/{method}.mdx`: Per-endpoint reference

## Output Structure

```
docs/openapi-demo/
├── overview.mdx
├── quickstart.mdx
└── api/
    ├── rate-limit/
    │   └── get.mdx
    └── users/
        ├── get.mdx
        └── post.mdx
```

## Library Usage

```typescript
import { bootstrapDocumentation } from "jolli-docs-bootstrapper";

const result = await bootstrapDocumentation({
  source: "openapi-demo",
  repoPath: "../openapi-demo",
  docsDir: "docs/openapi-demo",
  aiEnhance: false,
});

console.log(`Generated ${result.filesCreated} documentation files`);
```

## Operation ID Detection

The tool detects operation IDs using multiple strategies:

1. **Comment annotation**:
   ```typescript
   // operationId: RateLimitService_getLimits
   export async function GET(req: Request) { ... }
   ```

2. **Filename convention**:
   ```
   rate-limit.get.ts → RateLimitService_get
   users.post.ts → UsersService_post
   ```

3. **Mapping file**: `operationid-mapping.json` in repo root:
   ```json
   {
     "src/routes/rate-limit.ts": "RateLimitService_getLimits"
   }
   ```

## Documentation Pipeline Integration

This tool is the first step in the jolli documentation pipeline:

1. **jolli-docs-bootstrapper** → Generate initial MDX docs from code
2. **jolli-docs-compiler** → Build versioned content graph
3. **jolli-docs-impact-analyzer** → Detect impacted sections after code changes
4. **jolli-docs-diff-generator** → Generate version-to-version diffs

## Testing

```bash
npm test          # Run tests
npm run build     # Build distribution
```

**Test Coverage**: 99%+ lines, 100% functions, 95%+ branches

## How It Works

1. **Scan Repository**: Finds all route files matching:
   - `**/routes/**/*.{ts,js}`
   - `**/api/**/*.{ts,js}`

2. **Extract Endpoints**: For each route file:
   - Detects operation ID
   - Extracts HTTP method (GET, POST, PUT, DELETE)
   - Determines resource name from path

3. **Generate MDX**: Creates documentation with:
   - YAML frontmatter with `covers` array
   - Title and metadata
   - Overview, request, and response sections
   - Code examples

4. **Organize Files**: Groups endpoints by resource into logical structure

## License

Part of the jolli project
