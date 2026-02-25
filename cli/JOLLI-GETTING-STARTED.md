# JOLLI Getting Started

Use this quick flow to run Jolli CLI locally, initialize a project, authenticate, select your vault (space), and add a source.

## 1) Run CLI locally

From anywhere:

```bash
alias jolli='bun <your-jolli-path>/cli/src/client/cli.ts'
```

Optional (compile binary once):

```bash
cd <your-jolli-path>/cli
bun run build
# binary: <your-jolli-path>/cli/dist/bin/jolli
```

## 2) Set server URL (if not localhost)

```bash
export JOLLI_URL="https://your-jolli-host"
```

Default is `http://localhost:8034`.

## 3) Open your docs project directory

```bash
cd /path/to/your/docs-vault
```

## 4) Initialize + authenticate + select vault (space)

```bash
jolli init
```

Notes:
- `init` performs login (if needed) and prompts for space selection.
- In CLI, your "vault" is the selected `space` for this project.
- Space is saved in `.jolli/space.json`.

Useful auth commands:

```bash
jolli auth status
jolli auth space
jolli auth logout
```

## 5) Add a source

```bash
jolli source add <source-name> --path /absolute/path/to/git/repo
```

Example:

```bash
jolli source add backend --path /path/to/your/jolli/repo
```

This updates `.jolli/sources.json` and (by default) syncs source metadata to the selected space.

## 6) Verify

```bash
jolli source list
```

## 7) Optional: push docs changes as a changeset

```bash
jolli sync up -m "Short summary" --merge-prompt "How to semantically merge conflicts"
jolli sync up --changeset MLV4QT1DBMSFRTM5 -m "Retry this changeset id"
jolli sync up --force --changeset MLV4QT1DBMSFRTM5-R2
jolli sync pending clear
```
