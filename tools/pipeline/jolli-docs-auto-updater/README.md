# jolli-docs-auto-updater

LLM-powered automatic documentation updater that uses Anthropic Claude to update documentation sections based on code changes.

## Purpose

Part of the jolli documentation pipeline, this tool:
- Reads impacted sections from impact analysis
- Uses Claude AI to generate updated documentation
- Supports dry-run mode for previewing changes
- Automatically applies updates to MDX files
- Maintains markdown structure and frontmatter

## Installation

```bash
cd tools/jolli-docs-auto-updater
npm install
npm run build
```

## Prerequisites

You need an Anthropic API key. Set it in `backend/.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Command Line Usage

### Dry Run (Preview Changes)

```bash
node tools/jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir artifacts --docsDir docs/openapi-demo --repo ../openapi-demo --dry-run
```

### Apply Changes

```bash
node tools/jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir artifacts --docsDir docs/openapi-demo --repo ../openapi-demo
```

### Options

- `--source <name>` - Source identifier (e.g., "openapi-demo") [required]
- `--artifactsDir <path>` - Path to artifacts directory [required]
- `--docsDir <path>` - Path to documentation directory [required]
- `--repo <path>` - Path to external repository [required]
- `--dry-run` - Preview changes without writing (default: false)
- `--api-key <key>` - Anthropic API key (default: from ANTHROPIC_API_KEY env)
- `--model <model>` - Claude model (default: claude-sonnet-4-5-20250929)
- `--help`, `-h` - Display help message

## How It Works

1. **Load Impact Analysis**: Reads `impacted_sections.json` to see what needs updating
2. **For Each Impacted Section**:
   - Loads current MDX section content
   - Loads changed route file from repository
   - Sends both to Claude with update prompt
   - Receives updated documentation
3. **Apply Updates**: Replaces section content in MDX files (unless --dry-run)

## Workflow Integration

This tool fits between impact analysis and compilation:

```
1. jolli-docs-impact-analyzer → impacted_sections.json
2. jolli-docs-auto-updater → Updates MDX files  ⭐ NEW
3. jolli-docs-compiler --version v2 → graph.json
4. jolli-docs-diff-generator → v1__v2.json
```

## Complete Example

```bash
# Step 1: Detect code changes
node tools/contract-detector/dist/Cli.js --detector openapi --repo ../openapi-demo --output artifacts/openapi-demo/changed_contract_refs.json

# Step 2: Analyze impact
node tools/jolli-docs-impact-analyzer/dist/Cli.js --source openapi-demo --version v1 --artifactsDir artifacts

# Step 3: Preview updates (dry-run)
node tools/jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir artifacts --docsDir docs/openapi-demo --repo ../openapi-demo --dry-run

# Step 4: Apply updates
node tools/jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir artifacts --docsDir docs/openapi-demo --repo ../openapi-demo

# Step 5: Compile new version
node tools/jolli-docs-compiler/dist/Cli.js --source openapi-demo --docsDir docs/openapi-demo --version v2 --out artifacts

# Step 6: Generate diff
node tools/jolli-docs-diff-generator/dist/Cli.js --source openapi-demo --from v1 --to v2 --artifactsDir artifacts
```

## Library Usage

```typescript
import { runUpdater } from 'jolli-docs-auto-updater';

const result = await runUpdater({
  source: 'openapi-demo',
  artifactsDir: 'artifacts',
  docsDir: 'docs/openapi-demo',
  repoPath: '../openapi-demo',
  dryRun: false,
});

console.log(`Updated ${result.sections_updated} sections`);
```

## LLM Prompt Strategy

The tool sends Claude:
1. The contract reference (operationId)
2. Current route file code
3. Current documentation section
4. Instructions to update the docs to match the code

Claude:
- Analyzes the code to understand functionality
- Updates documentation to be accurate
- Maintains markdown structure
- Returns only the updated content

## Dry Run Mode

Use `--dry-run` to preview what would be changed:

```bash
node tools/jolli-docs-auto-updater/dist/Cli.js --source openapi-demo --artifactsDir artifacts --docsDir docs/openapi-demo --repo ../openapi-demo --dry-run
```

Output shows:
- Which sections would be updated
- How many changes detected
- List of affected files

No files are modified in dry-run mode.

## Error Handling

The tool continues processing even if individual sections fail:
- If route file not found: Section kept unchanged with warning
- If LLM call fails: Error logged, other sections continue
- If MDX file not found: Warning logged, skipped

## Cost Considerations

Each section update requires an Anthropic API call:
- Model: Claude Sonnet 4.5 (default)
- Input: ~500-2000 tokens (route code + current docs)
- Output: ~200-1000 tokens (updated docs)

Typical cost for 36 sections: ~$0.10-$0.50

Use `--dry-run` first to see how many sections will be updated.

## Security

- API key loaded from `.env.local` (not committed to git)
- Can provide key via `--api-key` option for CI/CD
- Route file content sent to Anthropic API
- Consider security implications before using on private code

## Limitations

- Currently only supports OpenAPI/Express route changes
- Requires route file to be found by contract reference
- LLM may hallucinate or make errors (review changes!)
- Cannot detect breaking changes or semantic issues

## Testing

```bash
npm test          # Run tests
npm run build     # Build distribution
```

## Troubleshooting

### "ANTHROPIC_API_KEY not found"

Set the key in `backend/.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### "Impact analysis file not found"

Run impact analyzer first:
```bash
node tools/jolli-docs-impact-analyzer/dist/Cli.js --source openapi-demo --version v1 --artifactsDir artifacts
```

### "Route file not found for contract"

The tool tries to map operationId back to file path. Currently supports:
- `SrcRoutesAuthService_handler` → `src/routes/auth.ts`
- `SrcRoutesRateLimitsService_handler` → `src/routes/rateLimits.ts`

Add custom mapping logic in `MdxLoader.ts` if needed.

## License

Part of the jolli project
