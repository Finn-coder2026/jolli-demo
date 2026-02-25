# jolli impact extract

Extract changesets from git diff for documentation impact analysis.

## Usage

```bash
jolli impact extract [options]
```

## Options

| Flag | Description |
|------|-------------|
| `-b, --base <ref>` | Base branch to diff against (auto-detects if not provided) |
| `-u, --uncommitted` | Only analyze uncommitted changes (staged + unstaged) |
| `-j, --json` | Output as JSON |
| `-p, --prompt` | Output LLM prompt for queryText generation |

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  jolli impact extract                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. GIT COMMANDS                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • git symbolic-ref refs/remotes/origin/HEAD  → detect default branch       │
│  • git rev-parse --abbrev-ref HEAD            → current branch name         │
│  • git log --format=%H|%an|%s base..HEAD      → list of commits             │
│  • For each commit:                                                         │
│    - git diff-tree --name-status -r <sha>     → files changed (A/M/D/R)     │
│    - git show <sha> -U5                       → unified diff with context   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. DIFF PARSING                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • parseUnifiedDiff() → extract hunks (file, line ranges, +/- lines)        │
│  • extractContext()   → regex match nearest function/class name             │
│    Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C#             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. OUTPUT                                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • (default)  Human-readable summary                                        │
│  • --json     ImpactReport as JSON                                          │
│  • --prompt   LLM prompt for filling queryText fields                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Examples

### Basic usage (human-readable)

```bash
$ jolli impact extract

Impact Analysis
──────────────────────────────────────────────────

Branch: feature/auth
Base: origin/main
Summary: 3 commit(s), 5 file(s), 8 hunk(s)

Commit abc1234: Add OAuth support
Author: developer
  modified src/auth/login.ts (handleOAuthCallback)
  added src/auth/oauth.ts
  modified src/config.ts (authConfig)
```

### JSON output (for scripts)

```bash
$ jolli impact extract --json > report.json
```

### LLM prompt (for queryText generation)

```bash
$ jolli impact extract --prompt | claude-api
```

The `--prompt` flag outputs a structured prompt that asks the LLM to generate `queryText` fields optimized for BM25+vector search against documentation.

### Specify base branch

```bash
$ jolli impact extract --base develop
$ jolli impact extract --base origin/release/v2
```

### Uncommitted changes only

```bash
$ jolli impact extract --uncommitted
```

Analyzes only staged and unstaged changes (not yet committed). Useful for previewing impact before committing.

## Context Extraction

The `context` field in each hunk is extracted using regex patterns that match function/class definitions in the diff context lines. Supported patterns:

| Language | Patterns |
|----------|----------|
| TypeScript/JS | `export function X`, `const X = () =>`, `class X` |
| Python | `def X():`, `async def X():`, `class X:` |
| Go | `func X()`, `func (r *T) X()`, `type X struct` |
| Rust | `fn X`, `pub fn X`, `struct X`, `impl X` |
| Java/C# | `public class X`, `void methodName()` |

## Output Schema

See [architecture.md](./architecture.md) for the full `ImpactReport` type definition.
