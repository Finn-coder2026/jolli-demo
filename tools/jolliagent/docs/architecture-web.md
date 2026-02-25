# JolliAgent Backend Integration (Server)

This document focuses on how the backend uses JolliAgent for server-side workflows and interactive
collaboration.

## Workflow Jobs (E2B)

- Job entry points live in `backend/src/jobs/KnowledgeGraphJobs.ts`.
- Jobs call `runWorkflowForJob` from `jolli-agent/workflows` with a `WorkflowConfig` created by
  `getWorkflowConfig` in `backend/src/config/Config.ts`.
- Supported server workflows include `architecture-doc`, `code-to-api-docs`, `docs-to-site`, and
  `run-jolliscript`.

## JolliScript-Driven Workflows

- `JobsToJrnAdapter` scans doc front matter (`on:` triggers) using
  `parseSections` and queues `knowledge-graph:run-jolliscript` jobs when events match.
  (`backend/src/jobs/JobsToJrnAdapter.ts`)
- The `run-jolliscript` handler loads the doc, extracts `job.steps` from front matter, and passes
  them to `runWorkflowForJob` as `jobSteps` along with `markdownContent`. It also injects backend
  editing tools via `additionalTools` and `additionalToolExecutor`. (`backend/src/jobs/KnowledgeGraphJobs.ts`)

## Interactive Collab Chat

- `CollabConvoRouter` creates a per-draft `AgentEnvironment` with an E2B sandbox and the `e2b-code`
  tool preset, plus article editing tools. (`backend/src/router/CollabConvoRouter.ts`,
  `tools/jolliagent/src/direct/agentenv.ts`)
- Streaming is bridged through `AgentChatAdapter`, which converts Collab messages to JolliAgent
  messages and streams deltas to SSE. (`backend/src/adapters/AgentChatAdapter.ts`)
- Tool calls are routed to backend editing tools or delegated to E2B tools via `runToolCall`.
  (`backend/src/router/CollabConvoRouter.ts`, `tools/jolliagent/src/tools/Tools.ts`)

## Backend Integration Diagram

```mermaid
flowchart TB
  subgraph Jobs[Job Execution]
    JRN[JobsToJrnAdapter\n(on: triggers)] --> Q[Queue knowledge-graph:run-jolliscript]
    Q --> KG[KnowledgeGraphJobs]
    KG --> WF[runWorkflowForJob]
    WF --> E2B[E2B Sandbox]
  end

  subgraph Collab[Interactive Chat]
    CC[CollabConvoRouter] --> ENV[createAgentEnvironment]
    ENV --> AG[Agent + AgentChatAdapter]
    AG --> TD[runToolCall / tool routing]
    TD --> ET[E2B tools]
    TD --> BT[Backend article tools]
  end

  BT --> DAO[DocDao / Draft DAOs]
```
