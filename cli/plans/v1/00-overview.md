# CLI-in-E2B: Phased Implementation Plan

## Goal

Run the Jolli CLI (`sync`, `impact`) inside E2B sandboxes, triggered by GitHub events via the backend job system. The end-to-end flow:

```
GitHub Push → WebhookRouter → JobEventEmitter → JobsToJrnAdapter
  → matches Space source JRN pattern → queues run-jolliscript job
  → KnowledgeGraphJobs creates E2B sandbox → executes steps:
    1. git clone the repo
    2. jolli sync (pull docs from server into sandbox)
    3. jolli impact (analyze code changes vs. docs)
    4. Agent analyzes impact, updates docs
    5. jolli sync (push updated docs back to server)
```

## Architecture Diagram

```
┌──────────┐     ┌──────────────┐     ┌──────────────────┐
│  GitHub  │────▶│ WebhookRouter│────▶│ JobEventEmitter   │
│  Push    │     │ (verify sig) │     │ (emit github:push)│
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  JobsToJrnAdapter    │
                                    │  - build event JRN   │
                                    │  - scan Spaces for   │
                                    │    matching sources   │ ◀── NEW: Space.sources
                                    │  - scan articles for  │     (existing article-level
                                    │    matching triggers  │      triggers still work)
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │ knowledge-graph:     │
                                    │ run-jolliscript      │
                                    │ (KnowledgeGraphJobs) │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │   E2B Sandbox        │
                                    │  ┌────────────────┐  │
                                    │  │ 1. git clone   │  │
                                    │  │ 2. jolli sync  │  │
                                    │  │ 3. jolli impact│  │
                                    │  │ 4. Agent run   │  │
                                    │  │ 5. jolli sync  │  │
                                    │  └────────────────┘  │
                                    └─────────────────────┘
```

## Phases

| Phase | Name | Description | Depends On |
|-------|------|-------------|------------|
| 0 | [Space Sources](./phase-0-space-sources.md) | Add `sources` JSONB field to Space model + API | — |
| 1 | [CLI in E2B](./phase-1-cli-in-e2b.md) | Package CLI binary into E2B sandbox, enable env-var auth | — |
| 2 | [Job Wiring](./phase-2-job-wiring.md) | Wire Space sources into JobsToJrnAdapter, create new job type | Phase 0, 1 |
| 3 | [Impact Agent](./phase-3-impact-agent.md) | New agent profile for impact analysis + doc updates | Phase 1, 2 |

Phases 0 and 1 can be done in parallel. Phase 2 depends on both. Phase 3 depends on 2.

## Follow-up Plans

- [Phase 3 Follow-up](./phase-3-follow-up.md) — hardening tasks after Phase 2 wiring (dedicated impact agent, artifact handling, end-to-end coverage).

## Key Design Decisions

1. **Space.sources is additive** — the existing article-level `on` triggers in JolliScript frontmatter continue to work unchanged. Space-level sources add a *second* way to match events.

2. **CLI auth via env vars** — inside E2B, the CLI reads `JOLLI_AUTH_TOKEN` and `JOLLI_SPACE` from environment instead of `~/.jolli/config.json`. The backend generates a short-lived service token when spawning the sandbox.

3. **JolliScript `run` steps** — the existing `JobStep.run` field (shell commands) is already supported in the jolliscript schema. Steps 1, 2, 3, 5 use `run`; step 4 uses `run_prompt`.
