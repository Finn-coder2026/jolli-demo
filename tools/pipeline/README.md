# Documentation Pipeline Tools

A comprehensive suite of tools for automating API documentation generation, tracking, and maintenance. This pipeline detects code changes, generates documentation, tracks impacts, and automatically updates docs using AI.

**Note**: All commands in this README assume you're running them from the `tools/pipeline/` directory. All generated files are stored in `../../../output/` (relative to pipeline directory, resolves to `D:/jolli.ai/output/`).

## Quick Start

```bash
# Navigate to pipeline directory
cd tools/pipeline

# Bootstrap documentation (first time only)
node jolli-docs-bootstrapper/dist/Cli.js --source openapi-demo --repo ../../../openapi-demo --docsDir ../../../output/docs/openapi-demo --ai-enhance

# Compile baseline version
node jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir ../../../output/docs/openapi-demo --version v1 --out ../../../output/artifacts

# Detect changes after code modifications
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base HEAD~1

# Analyze impact
node jolli-docs-impact-analyzer/dist/Cli.js --source openapi-demo --version v1 --artifactsDir ../../../output/artifacts --direct-only

# Auto-update documentation
node jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir ../../../output/artifacts --docsDir ../../../output/docs/openapi-demo --repo ../../../openapi-demo
```

## Overview

The documentation pipeline consists of 7 integrated tools:

```
1. jolli-contract-detector
   └─> Detects API contract changes in code (OpenAPI operationIds)

2. shared-pipeline-utils
   └─> Shared utilities library (used by all other tools)

3. jolli-docs-bootstrapper
   └─> Generates initial MDX documentation from codebase

4. jolli-docs-compiler
   └─> Compiles MDX docs into versioned content graphs

5. jolli-docs-impact-analyzer
   └─> Identifies which doc sections are affected by code changes

6. jolli-docs-auto-updater
   └─> Automatically updates documentation using LLM

7. jolli-docs-diff-generator
   └─> Generates version-to-version documentation diffs
```

## Prerequisites

### Environment Setup

1. **Anthropic API Key** (required for AI enhancement):
   ```bash
   # Add to backend/.env.local
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **External Repository**:
   - Place your API codebase in a sibling directory to the project root (e.g., `../../../openapi-demo` relative to pipeline folder)
   - Repository should contain route files in `src/routes/` or `src/api/`

3. **Output Directory**:
   - All generated files are stored in `../../../output/` (resolves to `D:/jolli.ai/output/`)
   - This directory is outside the repository to prevent accidental commits

4. **Build All Tools**:
   ```bash
   npm run build
   ```

## Tool Details

### 1. jolli-contract-detector

**Purpose**: Detects which API contracts (operationIds) have changed in your codebase.

**Location**: `tools/pipeline/jolli-contract-detector/`

**Key Options**:
- `--detector openapi`: Use OpenAPI contract detection
- `--repo <path>`: Path to external repository to scan
- `--output <path>`: Output JSON file path
- `--base <ref>`: Git reference to compare against (default: `origin/main`)

**Output**: `changed_contract_refs.json`
```json
{
  "source": "openapi",
  "changed_contract_refs": [
    {"type": "openapi", "key": "SrcRoutesRateLimitsService_handler"}
  ],
  "summary": {
    "added": [],
    "removed": [],
    "changed": ["SrcRoutesRateLimitsService_handler"]
  }
}
```

### 2. shared-pipeline-utils

**Purpose**: Shared utility library providing common functionality to all pipeline tools.

**Location**: `tools/pipeline/shared-pipeline-utils/`

**Type**: Library (not a CLI tool - imported by other tools)

**Provides**:
- **MDX parsing**: Parse frontmatter, split by headings, generate section IDs
- **Content hashing**: SHA256 hashing for version comparison
- **Contract references**: Parse and validate contract references
- **File system**: Directory walking, file finding utilities
- **Git helpers**: Repository operations, branch detection

**Usage Example**:
```typescript
import { parseMdx, generateSectionId, hashContent } from "shared-pipeline-utils";

const { frontmatter, content } = parseMdx(mdxFile);
const sectionId = generateSectionId(docPath, heading);
const hash = hashContent(sectionContent);
```

**Why it exists**: Prevents code duplication across 5+ pipeline tools. Ensures consistency in critical operations like section ID generation and content hashing.

### 3. jolli-docs-bootstrapper

**Purpose**: Generates initial MDX documentation from your codebase. Only runs on empty documentation directories.

**Key Options**:
- `--source <name>`: Source identifier (e.g., `openapi-demo`)
- `--repo <path>`: Path to repository to scan
- `--docsDir <path>`: Target documentation directory
- `--ai-enhance`: Enable AI enhancement of generated docs (recommended)

**Output**: MDX files with frontmatter
```yaml
---
title: Handler RateLimits
covers:
  - 'openapi:SrcRoutesRateLimitsService_handler'
tags: [api, handler, rateLimits]
description: API reference for Handler RateLimits
---
```

**Important**: The `covers` field in frontmatter is **never modified by AI** - it's generated symbolically from AST analysis to ensure 100% accuracy.

### 4. jolli-docs-compiler

**Purpose**: Compiles MDX documentation into a versioned content graph with section-level granularity.

**Key Options**:
- `--source <name>`: Source identifier
- `--docsDir <path>`: Documentation directory to compile
- `--version <name>`: Version identifier (e.g., `v1`, `v2`)
- `--out <path>`: Output directory for artifacts (default: `artifacts`)

**Output**: Three files per version
- `<version>/graph.json`: Complete content graph with all sections
- `<version>/reverse_index.json`: Map of contractRef → section_ids
- `<version>/sections.jsonl`: Newline-delimited JSON for streaming

**Section ID Format**: `<doc_path>::<heading_slug>`
- Example: `api/rateLimits/handler::overview`

### 5. jolli-docs-impact-analyzer

**Purpose**: Analyzes which documentation sections are impacted by detected code changes.

**Key Options**:
- `--source <name>`: Source identifier
- `--version <name>`: Version to analyze against
- `--artifactsDir <path>`: Artifacts directory (default: `artifacts`)

**Input**:
- `changed_contract_refs.json` (from contract-detector)
- `<version>/reverse_index.json` (from compiler)

**Output**: `impacted_sections.json`
```json
{
  "analyzed_at": "2025-12-17T...",
  "base_version": "v1",
  "impacted_sections": [
    {
      "contract_ref": "openapi:SrcRoutesRateLimitsService_handler",
      "section_ids": [
        "api/rateLimits/handler::overview",
        "quickstart::rate-limits"
      ],
      "reason": "changed"
    }
  ],
  "summary": {
    "total_contracts_changed": 1,
    "total_sections_impacted": 24
  }
}
```

### 6. jolli-docs-auto-updater

**Purpose**: Automatically updates documentation sections using LLM based on code changes.

**Key Options**:
- `--source <name>`: Source identifier
- `--artifactsDir <path>`: Artifacts directory
- `--docsDir <path>`: Documentation directory to update
- `--repo <path>`: Path to repository (for reading route files)
- `--dry-run`: Preview changes without applying (recommended for first run)

**Input**:
- `impacted_sections.json` (from impact-analyzer)
- `<version>/graph.json` (from compiler)
- Route files from repository

**Output**: Updated MDX files (or preview in dry-run mode)

**Important**: The updater **never modifies frontmatter** - it only updates section content. ContractRefs remain 100% accurate.

### 7. jolli-docs-diff-generator

**Purpose**: Generates a detailed diff between two documentation versions.

**Key Options**:
- `--source <name>`: Source identifier
- `--from <version>`: Source version (e.g., `v1`)
- `--to <version>`: Target version (e.g., `v2`)
- `--artifactsDir <path>`: Artifacts directory

**Input**:
- `<from>/graph.json` and `<to>/graph.json`

**Output**: `diffs/<from>__<to>.json`
```json
{
  "from_version": "v1",
  "to_version": "v2",
  "added": [/* new sections */],
  "removed": [/* deleted sections */],
  "modified": [/* changed sections with old/new hashes */],
  "summary": {
    "added_count": 7,
    "removed_count": 9,
    "modified_count": 4
  }
}
```

## Complete Workflow

### Initial Setup (First Time Only)

**Step 1: Bootstrap Initial Documentation**

Generate documentation from your codebase with AI enhancement:

```bash
cd tools/pipeline
node jolli-docs-bootstrapper/dist/Cli.js --source openapi-demo --repo ../../../openapi-demo --docsDir ../../../output/docs/openapi-demo --ai-enhance
```

**Step 2: Compile Baseline Version**

Create v1 baseline for tracking changes:

```bash
node jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir ../../../output/docs/openapi-demo --version v1 --out ../../../output/artifacts
```

### Regular Update Cycle

**Step 3: Make Code Changes**

Edit your API code in the external repository (e.g., `../../../openapi-demo/src/routes/rateLimits.ts`).

**Step 4: Detect Changes**

Scan for contract changes since last version:

```bash
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base HEAD~1
```

**Step 5: Analyze Impact**

Identify affected documentation sections:

```bash
node jolli-docs-impact-analyzer/dist/Cli.js --source openapi-demo --version v1 --artifactsDir ../../../output/artifacts
```

**Step 6: Auto-Update Documentation (Preview)**

Preview AI-powered updates without applying:

```bash
node jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir ../../../output/artifacts --docsDir ../../../output/docs/openapi-demo --repo ../../../openapi-demo --dry-run
```

**Step 7: Apply Updates**

Apply the updates after reviewing:

```bash
node jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir ../../../output/artifacts --docsDir ../../../output/docs/openapi-demo --repo ../../../openapi-demo
```

**Step 8: Compile New Version**

Create v2 with updated documentation:

```bash
node jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir ../../../output/docs/openapi-demo --version v2 --out ../../../output/artifacts
```

**Step 9: Generate Diff**

Compare versions to see what changed:

```bash
node jolli-docs-diff-generator/dist/Cli.js --source openapi-demo --from v1 --to v2 --artifactsDir ../../../output/artifacts
```

## Common Workflows

### Workflow 1: Detect Changes Since Specific Commit

```bash
cd tools/pipeline

# Compare against a specific commit
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base HEAD~3

# Compare against a tag
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base v1.0.0

# Compare against a branch
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base origin/develop
```

### Workflow 2: Manual Documentation Update

If you prefer to manually update docs instead of using AI:

1. Run Steps 1-5 (detect changes and analyze impact)
2. Manually edit MDX files in `../../../output/docs/openapi-demo/`
3. Skip Step 6-7 (auto-updater)
4. Continue with Steps 8-9 (compile and diff)

### Workflow 3: Regenerate Documentation from Scratch

If documentation structure has changed significantly:

```bash
cd tools/pipeline

# Remove old docs
rm -rf ../../../output/docs/openapi-demo

# Re-bootstrap with AI
node jolli-docs-bootstrapper/dist/Cli.js --source openapi-demo --repo ../../../openapi-demo --docsDir ../../../output/docs/openapi-demo --ai-enhance

# Re-compile baseline
node jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir ../../../output/docs/openapi-demo --version v1 --out ../../../output/artifacts
```

### Workflow 4: Compare Multiple Versions

```bash
cd tools/pipeline

# Generate multiple diffs
node jolli-docs-diff-generator/dist/Cli.js --source openapi-demo --from v1 --to v2 --artifactsDir ../../../output/artifacts
node jolli-docs-diff-generator/dist/Cli.js --source openapi-demo --from v2 --to v3 --artifactsDir ../../../output/artifacts
node jolli-docs-diff-generator/dist/Cli.js --source openapi-demo --from v1 --to v3 --artifactsDir ../../../output/artifacts
```

## Directory Structure

All generated files are stored in `../../../output/` (resolves to `D:/jolli.ai/output/`):

### Output Folder Structure

```
D:/jolli.ai/output/
├── artifacts/
│   └── openapi-demo/
│       ├── changed_contract_refs.json    # From contract-detector
│       ├── impacted_sections.json        # From impact-analyzer
│       ├── v1/
│       │   ├── graph.json               # Complete content graph
│       │   ├── reverse_index.json       # Contract → section mapping
│       │   └── sections.jsonl           # Streaming format
│       ├── v2/
│       │   └── ...
│       └── diffs/
│           ├── v1__v2.json              # Version comparison
│           └── v2__v3.json
└── docs/
    └── openapi-demo/
        ├── overview.mdx                 # Overview documentation
        ├── quickstart.mdx               # Getting started guide
        └── api/
            ├── auth/
            │   └── handler.mdx          # Auth endpoint docs
            └── rateLimits/
                └── handler.mdx          # Rate limits endpoint docs
```

**Note**: The output directory is outside the repository to prevent accidental commits to version control.

## Security & Accuracy Guarantees

### ContractRef Integrity

The `covers` field in MDX frontmatter is **never modified by AI**:

1. **jolli-contract-detector**: Uses AST parsing to extract operationIds from code
2. **jolli-docs-bootstrapper**: Generates `covers` symbolically, then separates frontmatter before LLM enhancement
3. **jolli-docs-compiler**: Reads `covers` from frontmatter as-is
4. **jolli-docs-auto-updater**: Parses frontmatter before LLM, re-attaches after

This ensures 100% accuracy between code and documentation mappings.

### LLM Enhancement Scope

AI enhancement only affects:
- Section content (markdown body)
- Examples and explanations
- Formatting and clarity

AI never modifies:
- Frontmatter metadata
- Contract references
- File structure
- Section IDs

## Troubleshooting

### Issue: "Documentation directory is not empty"

**Cause**: Bootstrapper only works with empty directories to prevent accidental overwrites.

**Solution**: Either:
- Remove existing docs: `rm -rf ../../../output/docs/openapi-demo`
- Use a different `--docsDir` path

### Issue: "No API endpoints found in repository"

**Cause**: Repository doesn't contain route files in expected locations.

**Solution**: Ensure route files are in:
- `src/routes/**/*.ts`
- `src/api/**/*.ts`

Or adjust scanner patterns in `RepoScanner.ts`.

### Issue: "Section not found" in auto-updater

**Cause**: Section IDs changed between detection and update (e.g., docs were re-bootstrapped).

**Solution**: Re-compile the version that was used for impact analysis:
```bash
cd tools/pipeline
node jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir ../../../output/docs/openapi-demo --version v1 --out ../../../output/artifacts
```

### Issue: Both contracts detected when only one changed

**Cause**: Comparing against wrong git base (e.g., `origin/main` includes multiple commits).

**Solution**: Use `--base HEAD~N` to specify exact commit range:
```bash
cd tools/pipeline
node jolli-contract-detector/dist/Cli.js --detector openapi --repo ../../../openapi-demo --output ../../../output/artifacts/openapi-demo/changed_contract_refs.json --base HEAD~1
```

### Issue: "ANTHROPIC_API_KEY not found"

**Cause**: API key not configured.

**Solution**: Add to `backend/.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Issue: Windows "FIND: Parameter format not correct"

**Cause**: Unix commands don't work on Windows.

**Solution**: Already fixed - all tools use cross-platform Node.js filesystem operations.

## Development

### Building Tools

```bash
# Build all tools (from project root)
cd ../..  # Go to project root
npm run build

# Build specific tool
cd tools/pipeline/jolli-docs-compiler
npm run build
cd ../../..  # Return to project root
```

### Testing Tools

```bash
# Run all tests (from project root)
cd ../..  # Go to project root
npm run test

# Run specific tool tests
cd tools/pipeline/jolli-docs-compiler
npm run test
cd ../../..  # Return to project root
```

### Adding New Tools

Follow the established pattern:
1. Create package in `tools/pipeline/<tool-name>/`
2. Use `vite.config.ts` for build configuration
3. Create CLI entry point: `src/Cli.ts`
4. Export library functions: `src/index.ts`
5. Maintain 95%+ test coverage
6. Use cross-platform Node.js APIs (not shell commands)

## Architecture Decisions

### Why File-Based Artifacts?

- **Portability**: Easy to version control, backup, and transfer
- **Transparency**: Human-readable JSON for debugging
- **Flexibility**: Works with any CI/CD system
- **Simplicity**: No database setup required

### Why Section-Level Granularity?

- **Precision**: Update only affected parts of documentation
- **History**: Track changes at fine-grained level
- **Performance**: LLM processes smaller content chunks

### Why Separate Tools?

- **Modularity**: Use tools independently or together
- **Testing**: Easier to test isolated components
- **Flexibility**: Replace individual tools without affecting others
- **Reusability**: Tools can be integrated into different workflows

## License

MIT
