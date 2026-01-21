# JolliScript Workflow Reference

JolliScript workflows are defined in markdown files with YAML front matter, similar to GitHub Actions. They allow you to define a sequence of steps that execute in an E2B sandbox environment.

## Front Matter Structure

```yaml
---
article_type: jolliscript
on:
  jrn: "path/pattern/**"
  verb: CREATED
attend:
  - jrn: "docs/reference"
  - jrn: "docs/api"
    section_id: "endpoints"
    name: "API Endpoints"
job:
  steps:
    - name: Step name
      run: shell command
---
```

## Configuration Options

### `article_type`

Determines how the article is processed:

- `jolliscript` - The workflow executes job steps; prompts come from `run_prompt` steps only
- `default` - Traditional Jolli_Main section extraction is used (default if not specified)

### `on` - Trigger Configuration

Defines when the workflow should be triggered. Can be a single matcher or an array of matchers.

| Field | Type | Description |
|-------|------|-------------|
| `jrn` | string | JRN path pattern (supports glob patterns like .gitignore) |
| `verb` | string | Event verb: `CREATED`, `REMOVED`, or `GIT_PUSH` |

### `attend` - Resource Attachments

Defines a list of JRN resources to attach to the workflow context. These resources are made available to the agent during execution.

```yaml
attend:
  - jrn: "docs/api-reference"
  - jrn: "docs/architecture"
    section_id: "overview"
  - jrn: "repos/myorg/myrepo/README.md"
    name: "Project README"
    section_id: "getting-started"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jrn` | string | Yes | JRN path to the resource |
| `section_id` | string | No | Specific markdown section to include (by heading ID) |
| `name` | string | No | Display name for the resource in the workflow context |

#### Examples

**Basic resource attachment:**
```yaml
attend:
  - jrn: "docs/api-reference"
  - jrn: "docs/troubleshooting"
```

**With section targeting:**
```yaml
attend:
  - jrn: "docs/architecture"
    section_id: "database-schema"
  - jrn: "docs/api-reference"
    section_id: "authentication"
```

**With named resources:**
```yaml
attend:
  - jrn: "repos/myorg/backend/src/models"
    name: "Data Models"
  - jrn: "docs/api-spec"
    name: "API Specification"
    section_id: "endpoints"
```

### `job.steps` - Workflow Steps

An array of steps to execute sequentially. Each step can be one of three types:

#### Shell Command (`run`)

```yaml
- name: Install dependencies
  run: npm install
```

#### Tool Execution (`run_tool`)

```yaml
- name: Sync article to database
  run_tool:
    name: sync_up_article
    doc_id: "123"
    content: "Article content here"
```

#### Agent Prompt (`run_prompt`)

```yaml
- name: Analyze the codebase
  run_prompt: |
    Analyze the repository structure and identify the main components.
    Focus on the src/ directory.
```

#### Step Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name for the step |
| `run` | string | Shell command to execute |
| `run_tool` | object | Tool configuration with `name` and tool-specific arguments |
| `run_prompt` | string | Prompt for AI agent execution (supports multiline) |
| `include_summary` | boolean | When true, prepends a summary of previous step results to the prompt (only for `run_prompt`) |

## Examples

### Basic Shell Workflow

```yaml
---
article_type: jolliscript
on:
  jrn: "repos/myorg/myrepo/**"
  verb: GIT_PUSH
job:
  steps:
    - name: Check out repository
      run: echo "Repository already checked out by workflow engine"

    - name: Install dependencies
      run: cd workspace/myrepo/main && npm install

    - name: Run tests
      run: cd workspace/myrepo/main && npm test

    - name: Build project
      run: cd workspace/myrepo/main && npm run build
---
```

### AI-Powered Documentation Generation

```yaml
---
article_type: jolliscript
on:
  jrn: "repos/myorg/myrepo/**"
  verb: GIT_PUSH
job:
  steps:
    - name: Analyze codebase structure
      run_prompt: |
        Explore the repository structure in workspace/myrepo/main.
        List all major directories and their purposes.
        Use ls and cat tools to examine files.

    - name: Generate API documentation
      run_prompt: |
        Based on the codebase analysis, generate API documentation
        for the main modules. Write the documentation to workspace/myrepo/main/docs/api.md
      include_summary: true

    - name: Sync documentation
      run_tool:
        name: sync_up_article
        doc_id: "api-docs-123"
---
```

### Multi-Trigger Workflow

```yaml
---
article_type: jolliscript
on:
  - jrn: "repos/myorg/frontend/**"
    verb: GIT_PUSH
  - jrn: "repos/myorg/backend/**"
    verb: GIT_PUSH
job:
  steps:
    - name: Detect changed service
      run: |
        if [ -d "workspace/frontend/main" ]; then
          echo "Frontend changes detected"
        elif [ -d "workspace/backend/main" ]; then
          echo "Backend changes detected"
        fi

    - name: Run integration tests
      run: npm run test:integration
---
```

### Chained Analysis with Summary

```yaml
---
article_type: jolliscript
on:
  jrn: "docs/architecture/**"
  verb: CREATED
job:
  steps:
    - name: Read architecture document
      run: cat workspace/myrepo/main/docs/architecture.md

    - name: Analyze dependencies
      run_prompt: |
        Analyze the project dependencies in package.json.
        Identify any outdated or potentially problematic dependencies.

    - name: Generate recommendations
      run_prompt: |
        Based on the architecture document and dependency analysis,
        provide recommendations for improving the codebase.
      include_summary: true

    - name: Write report
      run_prompt: |
        Create a comprehensive report combining all findings.
        Write it to workspace/myrepo/main/docs/analysis-report.md
      include_summary: true
---
```

## Workflow Execution

When a workflow runs:

1. **Sandbox Creation**: An E2B sandbox is created with the configured environment
2. **Repository Checkout**: If GitHub credentials are provided, the repository is automatically checked out to `workspace/{repo}/{branch}`
3. **Step Execution**: Steps execute sequentially; execution stops on first failure
4. **Cleanup**: Sandbox is cleaned up based on configuration

## Environment Variables

The following environment variables are automatically available in the sandbox:

| Variable | Description |
|----------|-------------|
| `GH_PAT` | GitHub personal access token |
| `GH_ORG` | GitHub organization/owner |
| `GH_REPO` | GitHub repository name |
| `GH_BRANCH` | GitHub branch name |
| `VERCEL_TOKEN` | Vercel deployment token (if configured) |
| `TAVILY_API_KEY` | Tavily API key for web search (if configured) |

## Available Tools for `run_prompt` Steps

When using `run_prompt`, the AI agent has access to various tools:

- `bash` - Execute shell commands
- `cat` - Read file contents
- `ls` - List directory contents
- `write_file` - Write content to a file
- `github_checkout` - Check out a different repository
- `git_history` - View git commit history
- `git_diff` - View git diffs
- `web_search` - Search the web (if Tavily configured)
- `web_extract` - Extract content from URLs
- And more...

## Best Practices

1. **Use descriptive step names** - Makes logs easier to understand
2. **Leverage `include_summary`** - Helps the AI agent understand context from previous steps
3. **Handle errors gracefully** - Consider what happens if a step fails
4. **Keep prompts focused** - Each `run_prompt` should have a clear, single objective
5. **Use shell commands for deterministic tasks** - Reserve AI prompts for tasks requiring reasoning
