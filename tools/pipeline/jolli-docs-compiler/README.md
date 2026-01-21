# jolli-docs-compiler

Compiles MDX documentation into a versioned content graph with reverse index for contract coverage tracking.

## Purpose

Part of the jolli documentation pipeline, this tool:
- Parses MDX files with frontmatter
- Splits content by headings into sections
- Generates stable section IDs
- Computes SHA256 content hashes for change detection
- Builds a reverse index mapping contracts to documentation sections
- Outputs structured JSON artifacts for downstream tools

## Installation

```bash
cd tools/jolli-docs-compiler
npm install
npm run build
```

## Command Line Usage

```bash
npx jolli-docs-compiler \
  --source <source-name> \
  --docsDir <docs-directory> \
  --version <version> \
  --out <artifacts-directory>
```

### Options

- `--source <name>` - Source identifier (e.g., "openapi-demo") [required]
- `--docsDir <path>` - Path to MDX documentation directory [required]
- `--version <version>` - Version identifier (e.g., "v1", "v2") [required]
- `--out <path>` - Output directory for artifacts (default: "artifacts")
- `--help`, `-h` - Display help message

### Example

```bash
npx jolli-docs-compiler \
  --source openapi-demo \
  --docsDir docs/openapi-demo \
  --version v1 \
  --out artifacts
```

## Output Artifacts

The compiler generates three files in `<out>/<source>/<version>/`:

### 1. `graph.json`
Complete content graph with all sections:

```json
{
  "version": "v1",
  "generated_at": "2025-12-17T...",
  "sections": [
    {
      "section_id": "api/rate-limit/get-limits::overview",
      "doc_path": "api/rate-limit/get-limits.mdx",
      "heading": "Overview",
      "heading_level": 2,
      "content_hash": "sha256:abc123...",
      "covers": ["openapi:RateLimitService_getLimits"],
      "word_count": 150
    }
  ]
}
```

### 2. `reverse_index.json`
Maps contract references to section IDs:

```json
{
  "openapi:RateLimitService_getLimits": [
    "api/rate-limit/get-limits::overview",
    "api/rate-limit/get-limits::response-format",
    "guides/quickstart::rate-limits"
  ]
}
```

### 3. `sections.jsonl`
One section per line (for streaming):

```jsonl
{"section_id":"api/rate-limit/get-limits::overview","content_hash":"sha256:abc..."}
{"section_id":"api/rate-limit/get-limits::response","content_hash":"sha256:def..."}
```

## Section ID Format

Section IDs follow the pattern: `<doc_path>::<heading_slug>`

Examples:
- `api/users/create::request-body`
- `guides/quickstart::getting-started`
- `api/rate-limit/get::rate-limit-structure`

Heading slugs are generated from heading text:
- Lowercase
- Replace spaces with hyphens
- Remove special characters
- Collapse multiple hyphens

## Frontmatter Coverage

The tool extracts `covers` arrays from frontmatter at two levels:

**Page-level** (applies to all sections):
```yaml
---
title: Get Rate Limits
covers:
  - openapi:RateLimitService_getLimits
---
```

**Section-level** (adds to page covers):
```markdown
## Rate Limiting <!-- { covers: ["openapi:RateLimitConfig"] } -->
```

Both are merged when building the reverse index.

## Library Usage

```typescript
import { compileDocs } from 'jolli-docs-compiler';

const result = await compileDocs({
  source: 'openapi-demo',
  docsDir: 'docs/openapi-demo',
  version: 'v1',
  artifactsDir: 'artifacts',
});

console.log(`Compiled ${result.sectionsCount} sections`);
console.log(`Output files:`, result.outputFiles);
```

## Documentation Pipeline Integration

This tool is the second step in the jolli documentation pipeline:

1. jolli-docs-bootstrapper → Generate initial MDX docs
2. **jolli-docs-compiler** → Build versioned content graph
3. jolli-docs-impact-analyzer → Detect impacted sections
4. jolli-docs-diff-generator → Generate version diffs

## Content Hashing

Each section's content is hashed using SHA256:
- Enables change detection between versions
- Powers the diff generator
- Format: `sha256:<hex-digest>`

Only the actual content is hashed (frontmatter excluded).

## Testing

```bash
npm test          # Run tests
npm run build     # Build distribution
```

**Test Coverage**: 98%+ lines, 100% functions, 96%+ branches

## How It Works

1. **Find MDX Files**: Recursively scans `--docsDir` for `.mdx` files
2. **Parse Frontmatter**: Uses gray-matter to extract YAML metadata
3. **Split by Headings**: Divides content at `##` and `###` markers
4. **Generate Section IDs**: Creates stable IDs from path + heading
5. **Compute Hashes**: SHA256 hash of section content
6. **Build Indexes**: Creates forward graph and reverse index
7. **Write Artifacts**: Outputs three JSON files

## License

Part of the jolli project
