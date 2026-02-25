# Phase 1: Source CLI and Local Store

## Objective

Ship one practical CLI for source management with clear true vs virtual behavior.
Sources are now first-class rows in the `sources` table (plans-1.5), so CLI commands
that create true sources write to that table via the API, not to a JSONB array on Space.

## Repo Coordinate Convention

All `--repo` values use **Go module style: `host/owner/repo`**. See Phase 0 for full specification.

```bash
--repo github.com/org/backend       # GitHub
--repo gitlab.com/team/frontend      # GitLab
--repo git.internal.co/team/service  # Self-hosted
```

## Commands

```bash
jolli source add <name> --mount <abs-path> [--repo <host/owner/repo>] [--branch <branch>] [--integration-id <id>]
jolli source link <name> --integration-id <id>
jolli source list
jolli source remove <name> [--local-only]
```

## Behavior Matrix

| Command | Inputs | Result |
|---|---|---|
| add | mount + integration link | create source in `sources` table + bind to current space via `space_sources` + write mount in local config |
| add | mount + repo (no integration) | create local virtual source with git coordinates (ready for promotion) |
| add | mount only | create local virtual source, mount only |
| link | name + integration-id | promote virtual source to true: create row in `sources` table, set `integrationId`, bind to space |
| list | none | merge true sources (from API) + local mounts + virtual sources, show resolution state |
| remove | true source | delete from `sources` table + unbind from space + remove local mount |
| remove --local-only | true source | remove only local mount (server record stays) |
| remove | virtual source | remove local virtual source |

## Output Format (`source list`)

```text
NAME       KIND      REPO                          MOUNT                           STATUS
backend    true      github.com/org/backend        /Users/dev/work/backend         resolved
frontend   true      github.com/org/frontend       (not mounted)                   needs-mount
scratch    virtual   (none)                        /Users/dev/work/scratch         resolved
api        virtual   gitlab.com/team/api           /Users/dev/work/api             resolved
```

## Failure Modes

- missing mount path: `needs-mount`
- path missing on disk: `missing-path`
- not a git repo: `invalid-git-root`
- repo format invalid (not `host/owner/repo`): command fails with format guidance
- ambiguous integration lookup by repo: command fails with candidate IDs

## Files

- `src/client/commands/source.ts` (new)
- `src/client/commands/index.ts`
- `src/client/cli.ts`
- `src/shared/SourceConfig.ts` (new)
- `src/shared/SourceConfig.test.ts` (new)

## Acceptance Criteria

- users can manage true and virtual sources without changing commands
- true sources are created as rows in the `sources` table, not JSONB
- virtual sources can optionally carry `repo` (Go module style) and `branch`
- `jolli source link` promotes a virtual source to true using existing coordinates
- list output always labels source kind, repo, and runtime status
- no server writes occur for virtual sources (until linked)
