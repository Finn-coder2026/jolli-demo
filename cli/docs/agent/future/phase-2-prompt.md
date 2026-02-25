# Phase 2 Implementation Prompt

Implement Phase 2 of the CLI Agent integration as specified in `cli/docs/agent/future/agent-phases.md`.

## Overview

Phase 0-1 is complete. The CLI agent can now create conversations, send messages, receive streaming responses via Mercure, and execute basic tools (read_file, write_file, ls). Phase 2 expands the local tool set for richer agent interactions.

## Current State (from Phase 0-1)

- `AgentToolHost.ts` has three tools: `read_file`, `write_file`, `ls`
- Tools are registered in `toolExecutors` and `toolDefinitions` maps
- Path validation enforces workspace root boundaries
- `ToolHost.execute()` handles tool execution with output truncation

## Phase 2: Enhanced Tool Set

### 1. Add file operation tools to `AgentToolHost.ts`

Add the following tools alongside the existing ones:

**mkdir** - Create directory
```typescript
{
  name: "mkdir",
  description: "Create a directory (and parent directories if needed)",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path relative to workspace root" }
    },
    required: ["path"]
  }
}
```
- Use `Bun.$\`mkdir -p ${path}\`` for implementation
- Validate path is within workspace root

**rm** - Remove file/directory
```typescript
{
  name: "rm",
  description: "Remove a file or directory. For directories, use recursive: true",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to remove relative to workspace root" },
      recursive: { type: "boolean", description: "Remove directories recursively (required for non-empty dirs)" }
    },
    required: ["path"]
  }
}
```
- IMPORTANT: This is a destructive operation - add `requiresConfirmation: true` to the tool definition
- Validate path is within workspace root

**mv** - Move/rename file
```typescript
{
  name: "mv",
  description: "Move or rename a file or directory",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path relative to workspace root" },
      destination: { type: "string", description: "Destination path relative to workspace root" }
    },
    required: ["source", "destination"]
  }
}
```
- Validate both paths are within workspace root

**cp** - Copy file
```typescript
{
  name: "cp",
  description: "Copy a file or directory",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path relative to workspace root" },
      destination: { type: "string", description: "Destination path relative to workspace root" },
      recursive: { type: "boolean", description: "Copy directories recursively" }
    },
    required: ["source", "destination"]
  }
}
```
- Validate both paths are within workspace root

### 2. Add code exploration tools

**grep** - Search file contents
```typescript
{
  name: "grep",
  description: "Search file contents with regex pattern",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "File or directory to search in (default: '.')" },
      recursive: { type: "boolean", description: "Search recursively in directories (default: true)" },
      ignoreCase: { type: "boolean", description: "Case-insensitive search (default: false)" },
      maxResults: { type: "number", description: "Maximum number of results (default: 100)" }
    },
    required: ["pattern"]
  }
}
```
- Use `Bun.$\`grep -r ...\`` or implement in TypeScript
- Return format: `filepath:linenum:content`
- Truncate results if too many matches

**find** - Find files by pattern
```typescript
{
  name: "find",
  description: "Find files matching a glob pattern",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.test.ts')" },
      path: { type: "string", description: "Directory to search in (default: '.')" },
      type: { type: "string", enum: ["file", "directory", "all"], description: "Type of entries to find (default: 'all')" },
      maxResults: { type: "number", description: "Maximum number of results (default: 100)" }
    },
    required: ["pattern"]
  }
}
```
- Use `Bun.Glob` for implementation
- Return list of matching paths

**git_status** - Show git status
```typescript
{
  name: "git_status",
  description: "Show git repository status (modified, staged, untracked files)",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```
- Use `Bun.$\`git status --porcelain\`` or `git status`
- Return empty message if not a git repository

**git_diff** - Show uncommitted changes
```typescript
{
  name: "git_diff",
  description: "Show uncommitted changes (working directory vs HEAD)",
  inputSchema: {
    type: "object",
    properties: {
      staged: { type: "boolean", description: "Show only staged changes (default: false)" },
      path: { type: "string", description: "Limit diff to specific path" }
    },
    required: []
  }
}
```
- Use `git diff` or `git diff --staged`
- Truncate if output is too large

**git_log** - Show recent commits
```typescript
{
  name: "git_log",
  description: "Show recent git commits",
  inputSchema: {
    type: "object",
    properties: {
      count: { type: "number", description: "Number of commits to show (default: 10)" },
      oneline: { type: "boolean", description: "Use oneline format (default: true)" }
    },
    required: []
  }
}
```
- Use `git log --oneline -n ${count}` or similar

### 3. Add shell execution tool

**shell** - Execute shell command (sandboxed)
```typescript
{
  name: "shell",
  description: "Execute a shell command in the workspace. Limited to safe commands.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      cwd: { type: "string", description: "Working directory relative to workspace root (default: '.')" },
      timeout: { type: "number", description: "Timeout in milliseconds (default: 30000, max: 60000)" }
    },
    required: ["command"]
  }
}
```

Implementation requirements:
- Add `requiresConfirmation: true` to the tool definition
- Implement configurable allow/deny list for commands
- Default allowed: `npm`, `npx`, `node`, `bun`, `bunx`, `pnpm`, `yarn`, `cat`, `head`, `tail`, `wc`, `sort`, `uniq`, `echo`, `pwd`, `which`, `env`
- Default denied: `rm -rf`, `sudo`, `chmod 777`, `curl | sh`, etc.
- Enforce timeout (default 30s, max 60s)
- Truncate output if too large
- Working directory must be within workspace root

### 4. Tool permission system

Add a permission configuration system:

**ToolPermissionConfig interface:**
```typescript
interface ToolPermissionConfig {
  // Tools that are always disabled
  disabledTools?: string[];

  // Tools that require confirmation before execution
  confirmationRequired?: string[];

  // Shell command allow/deny lists
  shell?: {
    allowedCommands?: string[];   // Prefixes that are allowed
    deniedPatterns?: string[];    // Patterns that are blocked
  };
}
```

**Update ToolHost configuration:**
```typescript
interface ToolHostConfig {
  readonly workspaceRoot: string;
  readonly maxOutputSize: number;
  readonly allowedTools: ReadonlySet<string>;
  readonly permissions?: ToolPermissionConfig;  // NEW
}
```

**Confirmation handling:**
- Add `requiresConfirmation` field to `ToolManifestEntry`
- When executing a tool that requires confirmation, return a special result:
  ```typescript
  {
    success: false,
    output: "",
    error: "CONFIRMATION_REQUIRED",
    confirmationMessage: "Are you sure you want to delete src/important.ts?"
  }
  ```
- The agent REPL should display the confirmation and wait for user input before re-executing

### 5. Update tool manifest generation

- Include new tools in `toolDefinitions` map
- Include `requiresConfirmation` in manifest entries where applicable
- Ensure `createToolHost()` allows filtering which tools are available

## Files to modify

- `cli/src/client/commands/AgentToolHost.ts` - Add new tools, permission system
- `cli/src/client/commands/AgentToolHost.test.ts` - Add tests for new tools
- `cli/src/client/commands/agent.ts` - Add confirmation prompt handling in REPL

## Testing

- Write unit tests for each new tool executor
- Test path validation for all file operations
- Test shell command allow/deny list
- Test timeout handling for shell command
- Test confirmation flow for destructive operations
- Test grep/find with various patterns

## Implementation order

1. Add simple file tools first (mkdir, mv, cp)
2. Add rm with confirmation
3. Add grep and find
4. Add git tools (git_status, git_diff, git_log)
5. Add shell tool with allow/deny list
6. Add confirmation prompt handling in REPL
7. Write tests for all new functionality

## Important notes

- All file operations must validate paths are within workspace root
- Destructive operations (rm, shell) should require confirmation
- Shell command execution needs careful sandboxing
- Keep tool descriptions clear and concise for the agent
- Follow the existing pattern in AgentToolHost.ts for consistency
- Use Bun APIs where possible (Bun.file, Bun.Glob, Bun.$)
