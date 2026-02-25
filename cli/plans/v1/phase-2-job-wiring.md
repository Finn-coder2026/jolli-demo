# Phase 2: Job Wiring (Event → Space → E2B Agent)

Wire Space sources into the JobsToJrnAdapter so that GitHub events are matched against Space-level source configurations (in addition to existing article-level triggers). Create a new workflow type that orchestrates the 5-step CLI-in-E2B flow.

**Depends on:** Phase 0 (Space.sources), Phase 1 (CLI in E2B)

## Existing State

- `JobsToJrnAdapter` (`backend/src/jobs/JobsToJrnAdapter.ts`) listens to `github:push` events
- It builds a JRN like `jrn::path:/home/{orgId}/sources/github/{org}/{repo}/{branch}`
- It scans **all docs** for JolliScript articles with matching `on` triggers in frontmatter
- Matching articles of type `jolliscript` get a `knowledge-graph:run-jolliscript` job queued
- `KnowledgeGraphJobs.runJolliScriptJobHandler` creates an E2B sandbox and runs JolliScript steps
- JolliScript `JobStep` already supports `run` (shell), `run_tool`, and `run_prompt` step types

## Changes

### 1. Enhance JobsToJrnAdapter to check Space sources

Currently, `findMatchingArticlesAndTriggerJobs()` scans all docs globally. Add a second matching path that checks Space.sources.

**File: `backend/src/jobs/JobsToJrnAdapter.ts`**

Add a dependency on SpaceDao and a new function:

```typescript
/**
 * Find Spaces whose sources match the event JRN.
 * For each matching Space, queue a cli-impact workflow job.
 */
async function findMatchingSpacesAndTriggerJobs(
  eventJrn: string,
  verb: "CREATED" | "REMOVED" | "GIT_PUSH",
  context: JobContext,
): Promise<void> {
  const spaceDao = getSpaceDao();
  const spaces = await spaceDao.findSpacesMatchingJrn(eventJrn);

  for (const space of spaces) {
    // Find the matching source entry for this event
    const matchingSource = space.sources.find(s =>
      s.enabled && matchesJrnPattern(eventJrn, buildJrnPatternForSource(s))
    );
    if (!matchingSource) continue;

    context.log("space-source-matched", {
      spaceId: space.id,
      spaceName: space.name,
      integrationId: matchingSource.integrationId,
      eventJrn,
      verb,
    });

    // Queue the CLI impact workflow job
    await queueCliImpactJob(space, matchingSource, eventJrn, context);
  }
}
```

Call this from `handleGitPush()` alongside the existing `findMatchingArticlesAndTriggerJobs()`:

```typescript
async function handleGitPush(params: GitPushPayload, context: JobContext): Promise<void> {
  // ... existing code ...

  // Existing: match individual articles by frontmatter triggers
  await findMatchingArticlesAndTriggerJobs(eventJrn, "GIT_PUSH", context);

  // NEW: match Spaces by their sources configuration
  await findMatchingSpacesAndTriggerJobs(eventJrn, "GIT_PUSH", context);
}
```

### 2. SpaceDao query for source matching

**File: `backend/src/dao/SpaceDao.ts`**

Add a query to find spaces with sources matching a JRN:

```typescript
/**
 * Find spaces that have sources matching the given event JRN.
 * Uses JSONB query to filter spaces where any source's integration
 * matches the event's org/repo/branch.
 */
async function findSpacesMatchingJrn(eventJrn: string): Promise<Array<Space>> {
  // Option A: Load all spaces with non-empty sources, filter in JS
  //   (simpler, fine for < 1000 spaces)
  // Option B: JSONB query with integration join
  //   (better for scale)
  const allSpaces = await listSpaces();
  return allSpaces.filter(space =>
    space.sources.some(source =>
      source.enabled && matchesJrnPatternForSource(source, eventJrn)
    )
  );
}
```

### 3. New job type: `cli-impact`

**File: `backend/src/jobs/KnowledgeGraphJobs.ts`**

Register a new job for the CLI-based impact workflow:

```typescript
const CliImpactSchema = z.object({
  spaceId: z.number(),
  integrationId: z.number(),
  eventJrn: z.string(),
  killSandbox: z.boolean().default(false),
});

type CliImpactParams = z.infer<typeof CliImpactSchema>;
```

Handler:

```typescript
async function cliImpactJobHandler(params: CliImpactParams, context: JobContext): Promise<void> {
  const { spaceId, integrationId, eventJrn } = params;

  // 1. Get space and integration details
  const space = await getSpaceDao().getSpace(spaceId);
  const integration = await integrationsManager.getIntegration(integrationId);

  // 2. Get GitHub access token
  const accessToken = await getAccessTokenForGithubRepoIntegration(integration);

  // 3. Generate service token for CLI auth
  const serviceToken = await createSandboxServiceToken({ spaceId, userId: 0, ttlMs: 30 * 60 * 1000 });

  // 4. Build workflow config with CLI env vars
  const workflowConfig = getWorkflowConfig(accessToken);

  // 5. Run the cli-impact workflow
  const result = await runWorkflowForJob("cli-impact", workflowConfig, {
    spaceSlug: space.slug,
    serviceToken,
    githubOrg: metadata.repo.split("/")[0],
    githubRepo: metadata.repo.split("/")[1],
    githubBranch: metadata.branch,
    killSandbox: params.killSandbox,
  }, customLogger);
}
```

Job registration:

```typescript
const cliImpactJob = jobDefinitionBuilder<CliImpactParams>()
  .category("knowledge-graph")
  .name("cli-impact")
  .title("CLI Impact Analysis")
  .description("Run CLI sync + impact analysis in E2B sandbox for a Space")
  .schema(CliImpactSchema)
  .showInDashboard()
  .keepCardAfterCompletion()
  .handler(cliImpactJobHandler)
  .build();

jobScheduler.registerJob(cliImpactJob);
```

### 4. New workflow type: `cli-impact`

**File: `tools/jolliagent/src/workflows.ts`**

Add a new workflow type that executes the 5-step flow:

```typescript
case "cli-impact": {
  const { spaceSlug, serviceToken, githubOrg, githubRepo, githubBranch } = workflowArgs;

  // The job steps are fixed for this workflow type:
  const steps: Array<JobStep> = [
    {
      name: "Clone repository",
      run: `gh repo clone ${githubOrg}/${githubRepo} /workspace/repo -- --branch ${githubBranch}`,
    },
    {
      name: "Pull docs from server",
      run: `cd /workspace/repo && jolli sync`,
    },
    {
      name: "Analyze impact",
      run: `cd /workspace/repo && jolli impact --json > /tmp/impact-report.json`,
    },
    {
      name: "Agent analysis",
      run_prompt: "...",  // See Phase 3
    },
    {
      name: "Push updated docs",
      run: `cd /workspace/repo && jolli sync`,
    },
  ];

  // Execute steps in sequence
  // ... (use existing step execution infrastructure)
}
```

The sandbox env vars for this workflow:

```typescript
const sandboxEnvVars = {
  JOLLI_URL: config.jolliPublicUrl,
  JOLLI_AUTH_TOKEN: workflowArgs.serviceToken,
  JOLLI_SPACE: workflowArgs.spaceSlug,
  GITHUB_TOKEN: accessToken,
};
```

### 5. Add `cli-impact` to WorkflowType union

**File: `tools/jolliagent/src/Types.ts`**

```typescript
export type WorkflowType =
  | "getting-started-guide"
  | "architecture-doc"
  | "code-docs"
  | "code-to-docs"
  | "code-to-api-docs"
  | "docs-to-site"
  | "run-jolliscript"
  | "cli-impact";  // NEW
```

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/jobs/JobsToJrnAdapter.ts` | Add Space source matching alongside article matching |
| `backend/src/dao/SpaceDao.ts` | Add `findSpacesMatchingJrn()` method |
| `backend/src/jobs/KnowledgeGraphJobs.ts` | Add `cli-impact` job type with handler |
| `tools/jolliagent/src/workflows.ts` | Add `cli-impact` workflow with 5-step execution |
| `tools/jolliagent/src/Types.ts` | Add `cli-impact` to `WorkflowType` union |

## Flow Summary

```
github:push event
  │
  ├── [EXISTING] JobsToJrnAdapter.findMatchingArticlesAndTriggerJobs()
  │   └── Scans all docs for frontmatter on.jrn matches → queues run-jolliscript
  │
  └── [NEW] JobsToJrnAdapter.findMatchingSpacesAndTriggerJobs()
      └── Scans Space.sources for matching integrations → queues cli-impact
          │
          └── KnowledgeGraphJobs.cliImpactJobHandler()
              ├── Get space, integration, tokens
              ├── Create E2B sandbox with env vars
              └── Execute: clone → sync → impact → agent → sync
```

## Tests

- JobsToJrnAdapter: verify `handleGitPush` calls both article and space matching
- SpaceDao: `findSpacesMatchingJrn` with various JRN patterns
- KnowledgeGraphJobs: `cli-impact` handler with mocked workflow runner
- Integration test: full flow from GitHub push to sandbox execution (mocked E2B)
