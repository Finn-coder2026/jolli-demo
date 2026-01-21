# JolliAgent

TypeScript-based AI agent framework that bridges Claude LLM with autonomous tool execution for documentation generation, code analysis, and deployment workflows.

## Quick Start

### 1. Build E2B Sandbox Template

```bash
cd sandbox
make e2b-build
```

### 2. Setup Environment

```bash
cd tools/jolliagent
cp .env.example .env.local

# Edit .env.local and add your API keys:
ANTHROPIC_API_KEY=sk-ant-...
E2B_API_KEY=...
E2B_TEMPLATE_ID=jolli-sandbox
VERCEL_TOKEN=...              # Optional, for Vercel deployment
GH_PAT=...                    # Optional, for private repos
```

### 3. Install Dependencies

```bash
npm ci
npm run build
```

### 4. Run a Workflow

```bash
# Generate full docs and deploy to Vercel
npm run workflow:code-docs https://github.com/facebook/react

# Generate architecture documentation
npm run workflow:architecture -- --e2b
```

## Available Workflows (E2B Sandbox)

All workflows below run in isolated E2B sandbox environments.

### 1. Code Documentation (Repo → Vercel Site)
**Command:** `npm run workflow:code-docs <github-url>`

**What it does:** Clones repository in E2B sandbox, analyzes code, generates Docusaurus documentation site, and deploys to Vercel.

**Output:**
- Deployed Vercel site at `https://your-project.vercel.app` (if `VERCEL_TOKEN` is set)
- Docusaurus site files in E2B sandbox at `/home/user/workspace/`
- API reference with code citations

**Example:**
```bash
npm run workflow:code-docs https://github.com/facebook/react
```

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY, VERCEL_TOKEN (optional)

---

### 2. Getting Started Guide
**Command:** `npm run workflow:getting-started -- --e2b`

**What it does:** Analyzes codebase in E2B sandbox and generates comprehensive README/getting started guide.

**Output:**
- `getting-started.md` in E2B sandbox working directory
- Includes setup instructions, usage examples, and architecture overview

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY

---

### 3. Architecture Documentation
**Command:** `npm run workflow:architecture -- --e2b`

**What it does:** Analyzes codebase structure in E2B sandbox and generates architecture documentation with diagrams.

**Output:**
- `architecture.md` in E2B sandbox working directory
- Includes Mermaid diagrams, component relationships, and design patterns

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY

---

### 4. Architecture Update
**Command:** `npm run workflow:architecture-update -- --e2b`

**What it does:** Updates existing architecture documentation in E2B sandbox based on code changes.

**Output:**
- Updated `architecture.md` in E2B sandbox working directory
- Incremental updates preserving existing content

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY

---

### 5. Documentation Quality Score
**Command:** `npm run workflow:score <markdown-file> -- --e2b`

**What it does:** Analyzes documentation quality and citation accuracy in E2B sandbox.

**Output:**
- `<file>.scores.txt` in E2B sandbox working directory
- Citation quality metrics

**Example:**
```bash
npm run workflow:score docs/api.md -- --e2b
# Creates: docs/api.md.scores.txt in E2B sandbox
```

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY

---

### 6. Citations Graph
**Command:** `npm run workflow:citations-graph <markdown-file> -- --e2b`

**What it does:** Generates Mermaid diagram showing citation relationships in documentation.

**Output:**
- `<file>.citation.md` in E2B sandbox working directory
- Visual representation of documentation structure

**Example:**
```bash
npm run workflow:citations-graph architecture.md -- --e2b
# Creates: architecture.md.citation.md in E2B sandbox
```

**Requirements:** E2B_API_KEY, E2B_TEMPLATE_ID, ANTHROPIC_API_KEY

---

## Interactive Mode (E2B Sandbox)

```bash
npm run cli -- --e2b

# In the interactive prompt, the agent runs commands in E2B sandbox:
> Clone https://github.com/facebook/react
> List the files in src/
> Analyze the architecture
```

## Advanced Usage

### Using Private Repositories

```bash
# Add GH_PAT to .env.local for private repos
GH_PAT=github_pat_...

npm run workflow:code-docs https://github.com/your-org/private-repo
```

### Custom E2B Template

```bash
npm run workflow:code-docs https://github.com/facebook/react -- --e2b-template your-template-name
```

### Debug Mode

```bash
# Add to .env.local:
JOLLI_DEBUG=1

# Then run any workflow to see detailed E2B sandbox logs
npm run workflow:code-docs https://github.com/facebook/react
```

## Troubleshooting

### Error: Template 'jolli-sandbox' not found
```bash
# Build the E2B sandbox template first
cd ../../sandbox
make e2b-build

# Verify it was created
e2b template list
```

### Error: E2B_API_KEY not set
```bash
# Add to .env.local
E2B_API_KEY=your-e2b-api-key-here
```

### Error: ANTHROPIC_API_KEY not set
```bash
# Add to .env.local
ANTHROPIC_API_KEY=sk-ant-your-key
```

### Error: E2B connection timeout
```bash
# Increase timeout in .env.local
E2B_CONNECT_TIMEOUT_MS=60000
```

## Output Locations Summary

All workflows run in E2B sandbox. Output files are created in the sandbox working directory.

| Workflow | Output Location | Format |
|----------|----------------|--------|
| `code-docs` | Vercel deployment | Live website at `https://your-project.vercel.app` |
| `code-docs` | E2B sandbox `/home/user/workspace/` | Docusaurus site files |
| `getting-started` | E2B sandbox working directory | `getting-started.md` |
| `architecture` | E2B sandbox working directory | `architecture.md` with Mermaid diagrams |
| `architecture-update` | E2B sandbox working directory | Updated `architecture.md` |
| `score` | E2B sandbox working directory | `<file>.scores.txt` |
| `citations-graph` | E2B sandbox working directory | `<file>.citation.md` with Mermaid graph |

**Note:** To retrieve files from E2B sandbox working directory, files are typically committed to git or deployed (like with Vercel for `code-docs`). The `code-docs` workflow automatically deploys to Vercel if `VERCEL_TOKEN` is set.
