# Getting Started with JOLLI External CLI

Welcome to JOLLI External CLI - a TypeScript-based AI agent framework that provides interactive CLI, autonomous workflow, and documentation generation capabilities powered by Anthropic's Claude.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [CLI Mode](#cli-mode)
  - [Workflow Mode](#workflow-mode)
  - [Docs Mode](#docs-mode)
  - [Vibe Mode](#vibe-mode)
- [Available Tools](#available-tools)
- [Development](#development)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Overview

JOLLI External CLI is an AI-powered command-line tool that enables:

- **Interactive CLI conversations** with an AI assistant that can execute tools
- **Autonomous workflows** for generating documentation and guides
- **File system operations** (read, write, list directories)
- **Git operations** (history browsing, diffs)
- **Plan management** for tracking multi-step tasks

The framework uses a provider-agnostic architecture with Anthropic Claude as the default LLM provider.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or higher
- **npm**: Comes with Node.js
- **Git**: For version control operations
- **Anthropic API Key**: Required for AI functionality

## Installation

### 1. Clone or Navigate to the Repository

```bash
cd /path/to/jolli-external-cli
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- `@anthropic-ai/sdk` - Anthropic API client
- `jolli-common` - Common utilities
- `tsx` - TypeScript execution
- `vite` - Build tool
- `vitest` - Testing framework

### 3. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Configuration

### Set Up Your API Key

JOLLI requires an Anthropic API key to function. You can configure it in one of two ways:

#### Option 1: Environment File (Recommended)

Create a `.env.local` file in the project root:

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-your-api-key-here' > .env.local
```

#### Option 2: Shell Environment Variable

Export the key in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

**Note**: The application will automatically search for `.env.local` or `.env` files in the current directory and parent directories.

### Optional: Enable Debug Mode

To see detailed tool execution logs:

```bash
export JOLLI_DEBUG=1
```

## Usage

JOLLI provides several modes of operation:

### CLI Mode

Interactive conversation mode where you can chat with the AI assistant and it can execute tools on your behalf.

#### Start CLI Mode

Using npm scripts:
```bash
npm run cli
```

Or using the built version:
```bash
npm run cli:build
```

Or directly with tsx:
```bash
tsx src/jolli.ts cli
```

#### Using CLI Mode

1. The CLI will display a banner and prompt
2. Type your questions or requests
3. The AI will respond and can execute tools like reading files, listing directories, etc.
4. Type `exit` to quit

**Example Session:**
```
> What files are in the src directory?

🔧 Tool call → ls({"path":"src"})
🧰 Tool result ← ls [abc123]
agents/
config/
index.ts
jolli-banner.txt
jolli.ts
providers/
Tools.ts
Types.ts

The src directory contains...
```

### Workflow Mode

Non-interactive mode where the AI autonomously completes a specific task.

#### Getting Started Guide Workflow

Generate a comprehensive getting started guide for the repository:

```bash
npm run workflow:getting-started
```

Or using the built version:
```bash
npm run workflow:build:getting-started
```

This will:
1. Explore the repository structure
2. Read key files (package.json, source files, etc.)
3. Analyze the codebase
4. Generate a `getting-started-guide.md` file

#### Architecture Documentation Workflow

Generate detailed architecture documentation:

```bash
tsx src/jolli.ts workflow architecture
```

This creates an `architecture.md` file with:
- System architecture diagrams (Mermaid)
- Component documentation
- Source code citations
- Data flow diagrams

### Docs Mode

Runs both Getting Started and Architecture workflows in sequence, sharing context between them:

```bash
npm run docs
```

Or using the built version:
```bash
npm run docs:build
```

### Vibe Mode

Coming soon - a future mode for additional functionality.

```bash
npm run jolli vibe
```

## Available Tools

The AI assistant has access to the following tools:

### File System Tools

- **`ls`** - List directory contents
  ```json
  {"path": "src"}
  ```

- **`cat`** - Read file contents
  ```json
  {"path": "package.json"}
  ```

- **`write_file`** - Write content to a file
  ```json
  {
    "filename": "output.md",
    "content": "# Hello World"
  }
  ```

- **`write_file_chunk`** - Write large files in chunks (architecture workflow only)
  ```json
  {
    "filename": "large-doc.md",
    "content": "chunk content",
    "truncate": true,
    "ensure_newline": true
  }
  ```

### Git Tools

- **`git_history`** - Browse commit history
  ```json
  {
    "skip": 0,
    "limit": 10,
    "ref": "HEAD"
  }
  ```

- **`git_diff`** - Show differences between commits
  ```json
  {
    "from_ref": "HEAD",
    "to_ref": "main"
  }
  ```

### Planning Tools

- **`set_plan`** - Create or update a task plan
  ```json
  {
    "plan": "[ ] Task 1\n[ ] Task 2\n[x] Completed task"
  }
  ```

- **`get_plan`** - Retrieve the current plan
  ```json
  {}
  ```

## Development

### Running in Development Mode

Use `tsx` for hot-reloading during development:

```bash
# CLI mode
npm run cli

# Workflow mode
npm run workflow

# Specific workflow
tsx src/jolli.ts workflow getting-started-guide
```

### Code Linting

Check code quality:
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint:fix
```

### Building

Build the project for production:
```bash
npm run build
```

Output will be in the `dist/` directory with:
- `dist/index.mjs` - Library entry point
- `dist/cli.mjs` - CLI entry point

## Testing

### Run All Tests

```bash
npm test
```

### Watch Mode

Run tests in watch mode during development:
```bash
npm run test:watch
```

### Integration Tests

Run integration tests (requires API key):
```bash
npm run test:integration
```

## Project Structure

```
jolli-external-cli/
├── src/
│   ├── agents/           # Agent implementations
│   │   ├── Agent.ts      # Core agent class
│   │   ├── factory.ts    # Agent factory functions
│   │   └── profiles.ts   # Agent configuration profiles
│   ├── providers/        # LLM provider implementations
│   │   └── Anthropic.ts  # Anthropic Claude integration
│   ├── config/           # Configuration files
│   ├── index.ts          # Library exports
│   ├── jolli.ts          # CLI entry point
│   ├── Tools.ts          # Tool definitions and implementations
│   └── Types.ts          # TypeScript type definitions
├── tests/
│   ├── integration/      # Integration tests
│   └── unit/             # Unit tests
├── dist/                 # Compiled output (generated)
├── package.json          # Project dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite build configuration
├── vitest.config.ts      # Vitest test configuration
└── .env.local            # Local environment variables (create this)
```

## Troubleshooting

### Missing API Key Error

**Error:**
```
❌ Missing ANTHROPIC_API_KEY. Create a .env or .env.local with ANTHROPIC_API_KEY=your_key
```

**Solution:**
Create a `.env.local` file with your API key:
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-your-key' > .env.local
```

### Tool Execution Errors

If tools are failing, enable debug mode to see detailed logs:
```bash
export JOLLI_DEBUG=1
npm run cli
```

### File Not Found Errors

When using the `cat` tool, always:
1. First use `ls` to discover available files
2. Then use `cat` with the exact path shown by `ls`

### Build Errors

If you encounter build errors:
1. Clean the dist directory: `rm -rf dist/`
2. Reinstall dependencies: `rm -rf node_modules/ && npm install`
3. Rebuild: `npm run build`

### Git Tool Errors

**Error:** "Not in a git repository"

**Solution:** Ensure you're running JOLLI from within a git repository. Initialize one if needed:
```bash
git init
```

## Advanced Configuration

### Customizing Agent Behavior

The agent behavior is controlled by profiles in `src/agents/profiles.ts`:

- **GeneralProfile**: For general-purpose CLI interactions
  - Model: `claude-sonnet-4-5-20250929`
  - Temperature: 0.4
  
- **GettingStartedProfile**: For documentation generation
  - Model: `claude-sonnet-4-5-20250929`
  - Temperature: 0.2 (more deterministic)

### Conversation History Limits

By default, conversation history is unlimited. To set a limit, modify `MAX_HISTORY` in `src/jolli.ts`:

```typescript
const MAX_HISTORY = 40; // Keep last 40 messages
```

### Maximum Output Tokens

For workflows that generate large documents, adjust `maxOutputTokens` in the agent factory:

```typescript
createGettingStartedGuideAgent({
  maxOutputTokens: 24000  // Increase for larger outputs
})
```

## Next Steps

Now that you have JOLLI set up, you can:

1. **Explore the CLI**: Start an interactive session and ask questions about your codebase
2. **Generate Documentation**: Run the workflow mode to create guides automatically
3. **Extend Functionality**: Add new tools in `src/Tools.ts`
4. **Create Custom Agents**: Define new agent profiles in `src/agents/profiles.ts`
5. **Integrate into CI/CD**: Use workflow mode to generate docs automatically

## Getting Help

- Check the source code in `src/` for implementation details
- Review test files in `tests/` for usage examples
- Enable debug mode with `JOLLI_DEBUG=1` for detailed logs
- Examine the agent profiles in `src/agents/profiles.ts` for configuration options

---

**Happy coding with JOLLI! 🤖**
