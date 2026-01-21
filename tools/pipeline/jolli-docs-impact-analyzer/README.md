# jolli-docs-impact-analyzer

Analyzes which documentation sections are impacted by code contract changes.

## Purpose

Part of the jolli documentation pipeline, this tool:
- Loads contract changes from code scanner
- Loads reverse index from compiler
- Matches changed contracts to documentation sections
- Categorizes changes as added, removed, or modified
- Outputs impact analysis for review and action

## Installation

```bash
cd tools/jolli-docs-impact-analyzer
npm install
npm run build
```

## Command Line Usage

```bash
npx jolli-docs-impact-analyzer \
  --source <source-name> \
  --version <version> \
  --artifactsDir <artifacts-directory>
```

### Options

- `--source <name>` - Source identifier (e.g., "openapi-demo") [required]
- `--version <version>` - Version to analyze (e.g., "v1") [required]
- `--artifactsDir <path>` - Path to artifacts directory (default: "artifacts")
- `--help`, `-h` - Display help message

### Example

```bash
npx jolli-docs-impact-analyzer \
  --source openapi-demo \
  --version v1 \
  --artifactsDir artifacts
```

## Input Files

### 1. `changed_contract_refs.json`
From the code scanner (contract-detector):

```json
{
  "source": "openapi-demo",
  "changed_contract_refs": [
    { "type": "openapi", "key": "RateLimitService_getLimits" },
    { "type": "openapi", "key": "UsersService_create" }
  ],
  "summary": {
    "added": ["UsersService_create"],
    "removed": [],
    "changed": ["RateLimitService_getLimits"]
  }
}
```

### 2. `reverse_index.json`
From the compiler:

```json
{
  "openapi:RateLimitService_getLimits": [
    "api/rate-limit/get-limits::overview",
    "guides/quickstart::rate-limits"
  ],
  "openapi:UsersService_create": [
    "api/users/create::overview"
  ]
}
```

## Output File

`impacted_sections.json` in `<artifactsDir>/<source>/`:

```json
{
  "source": "openapi-demo",
  "base_version": "v1",
  "analyzed_at": "2025-12-17T12:00:00.000Z",
  "impacted_sections": [
    {
      "contract_ref": "openapi:RateLimitService_getLimits",
      "section_ids": [
        "api/rate-limit/get-limits::overview",
        "guides/quickstart::rate-limits"
      ],
      "reason": "changed"
    },
    {
      "contract_ref": "openapi:UsersService_create",
      "section_ids": [
        "api/users/create::overview"
      ],
      "reason": "added"
    }
  ],
  "summary": {
    "total_contracts_changed": 2,
    "total_sections_impacted": 3
  }
}
```

## Change Reasons

- **`added`** - New contract added to codebase (may need new docs)
- **`removed`** - Contract removed from codebase (docs may need removal)
- **`changed`** - Existing contract modified (docs need review/update)

## Library Usage

```typescript
import { analyzeImpact } from 'jolli-docs-impact-analyzer';

const result = await analyzeImpact({
  source: 'openapi-demo',
  version: 'v1',
  artifactsDir: 'artifacts',
});

console.log(`${result.contractsChanged} contracts changed`);
console.log(`${result.sectionsImpacted} sections impacted`);
```

## Documentation Pipeline Integration

This tool is the third step in the jolli documentation pipeline:

1. jolli-docs-bootstrapper → Generate initial MDX docs
2. jolli-docs-compiler → Build versioned content graph
3. **jolli-docs-impact-analyzer** → Detect impacted sections
4. jolli-docs-diff-generator → Generate version diffs

## Use Cases

### 1. Automated Documentation Alerts
Trigger notifications when contracts change:
```bash
npx jolli-docs-impact-analyzer --source api --version v1
# If sections are impacted, send alerts to documentation team
```

### 2. Pull Request Checks
Add to CI/CD to flag doc updates needed:
```yaml
- name: Check doc impact
  run: |
    npx jolli-docs-impact-analyzer --source api --version v1
    # Fail if impacted sections exceed threshold
```

### 3. Documentation Review Queue
Generate work items for technical writers:
```typescript
const { impacted_sections } = await analyzeImpact(...);
for (const impact of impacted_sections) {
  createJiraTicket({
    title: `Review docs for ${impact.contract_ref}`,
    sections: impact.section_ids,
  });
}
```

## Handling Undocumented Contracts

If a changed contract has no documentation coverage:
- It will appear in `changed_contract_refs` input
- It will NOT appear in `impacted_sections` output
- No documentation sections are impacted (none exist)

This indicates a documentation gap that may need addressing.

## Testing

```bash
npm test          # Run tests
npm run build     # Build distribution
```

**Test Coverage**: 98%+ lines, 100% functions, 95%+ branches

## How It Works

1. **Load Changes**: Reads `changed_contract_refs.json`
2. **Load Index**: Reads `reverse_index.json` for specified version
3. **Match Contracts**: For each changed contract:
   - Look up in reverse index
   - Collect all section IDs
   - Determine reason (added/removed/changed)
4. **Count Unique Sections**: De-duplicate sections across contracts
5. **Write Output**: Saves `impacted_sections.json`

## License

Part of the jolli project
