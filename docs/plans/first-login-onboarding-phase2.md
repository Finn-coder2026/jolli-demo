# First Login Onboarding - Phase 2 Implementation Plan

## Overview

Phase 2 extends the basic onboarding (Phase 1) with:
1. **Two-panel UI** - Split dialog with chat on left and jobs panel on right
2. **Mercure integration** - Real-time event publishing for multi-server deployments

---

## Phase 2 Goals

- Redesign onboarding dialog with dual-panel layout
- Add jobs panel showing running/queued jobs with progress
- Integrate Mercure Hub for real-time event publishing
- Maintain SSE fallback for single-server deployments

---

## UI Layout

```
+---------------------------------------------------------------------+
| +===============================+=================================+ |
| |      Jolli Agent          -   |         Jobs             -  x   | |
| +===============================+=================================+ |
| |                               |  Jobs                           | |
| |  [User message bubble] 11:25  |  1 running, 1 queued            | |
| |                               |                                 | |
| |  Agent response with          |  Importing documentation        | |
| |     action buttons            |     Getting Started Guide.md    | |
| |  [Action 1] [Action 2]        |     =========--- 65%  Running   | |
| |                        11:25  |                                 | |
| |                               |  Repository sync       Queued   | |
| |                               |     github.com/acme/docs        | |
| |                               |                                 | |
| |                               |  Gap analysis        Completed  | |
| |                               |     API Reference section       | |
| +===============================+                                 | |
| |  [Message Jolli...       ] >  |                                 | |
| +===============================+=================================+ |
+---------------------------------------------------------------------+
```

---

## Files Created

### Frontend Components

| File | Description |
|------|-------------|
| `frontend/src/ui/onboarding/OnboardingJobsPanel.tsx` | Right panel showing jobs |
| `frontend/src/ui/onboarding/OnboardingJobItem.tsx` | Individual job row with status badge |
| `frontend/src/ui/onboarding/OnboardingJobsPanel.test.tsx` | Jobs panel tests |
| `frontend/src/ui/onboarding/OnboardingJobItem.test.tsx` | Job item tests |

### Types Added

```typescript
// common/src/onboarding/types.ts

export type OnboardingJobStatus = "running" | "queued" | "completed" | "failed";

export interface OnboardingJob {
  id: string;
  title: string;
  subtitle?: string | undefined;
  status: OnboardingJobStatus;
  progress?: number | undefined;  // 0-100 for running jobs
  icon?: "document" | "sync" | "analysis" | "import" | undefined;
}
```

---

## Files Modified

### Backend Changes

| File | Change |
|------|--------|
| `backend/src/services/MercureService.ts` | Added `getOnboardingTopic()` and `publishOnboardingEvent()` |
| `backend/src/router/MercureRouter.ts` | Added `onboarding` type support in token endpoint |
| `backend/src/onboarding-agent/OnboardingRouter.ts` | Integrated Mercure publishing alongside SSE |
| `backend/src/services/MercureService.test.ts` | Added onboarding topic tests |
| `backend/src/router/MercureRouter.test.ts` | Added onboarding type tests |
| `backend/src/onboarding-agent/OnboardingRouter.test.ts` | Added Mercure integration tests |

### Frontend Changes

| File | Change |
|------|--------|
| `frontend/src/ui/onboarding/OnboardingPage.tsx` | Two-panel layout container |
| `frontend/src/ui/onboarding/OnboardingChat.tsx` | Added timestamps and action buttons |
| `frontend/src/ui/onboarding/Onboarding.content.ts` | Added jobs panel i18n strings |
| `frontend/src/hooks/useMercureSubscription.ts` | Added `onboarding` subscription type |

### Common Changes

| File | Change |
|------|--------|
| `common/src/core/MercureClient.ts` | Added `onboarding` to subscription types |
| `common/src/onboarding/types.ts` | Added `OnboardingJob` and related types |

---

## Mercure Integration Architecture

### Backend Publishing Pattern

```typescript
// OnboardingRouter.ts - Chat endpoint
for await (const event of agent.chat(message, history)) {
  // Send SSE event (always)
  res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Also publish to Mercure (fire-and-forget)
  if (mercure.isEnabled()) {
    mercure.publishOnboardingEvent(userId, event.type, event).catch(err => {
      log.warn(err, "Failed to publish onboarding event to Mercure");
    });
  }
}
```

### Topic Format

```
/tenants/{tenant}/orgs/{org}/onboarding/{userId}
```

Example: `/tenants/acme-corp/orgs/engineering/onboarding/123`

### MercureService Methods Added

```typescript
interface MercureService {
  // ... existing methods ...

  /** Get the onboarding topic for a specific user */
  getOnboardingTopic(userId: number): string;

  /** Publish an onboarding event to the Mercure Hub */
  publishOnboardingEvent(userId: number, eventType: string, data: unknown): Promise<MercurePublishResult>;
}
```

### MercureRouter Token Endpoint

```typescript
// POST /api/mercure/token
// Body: { type: "onboarding", id: 123 }
// Returns: { token: "jwt...", topics: ["/tenants/.../onboarding/123"] }
```

---

## Localization Additions

Added to `Onboarding.content.ts`:

```typescript
// Jobs panel
jobsPanelTitle: "Jobs" / "Trabajos",
jobsRunning: "running" / "ejecutandose",
jobsQueued: "queued" / "en cola",
jobStatusRunning: "Running" / "Ejecutando",
jobStatusQueued: "Queued" / "En cola",
jobStatusCompleted: "Completed" / "Completado",
jobStatusFailed: "Failed" / "Fallido",

// Tool names for display
toolConnectGithub: "Connect GitHub" / "Conectar GitHub",
toolListRepos: "List Repositories" / "Listar Repositorios",
toolScanRepository: "Scan Repository" / "Escanear Repositorio",
// ... etc
```

---

## Responsive Behavior

- **Desktop (lg+)**: Two-panel layout side-by-side
- **Mobile/Tablet**: Chat only (jobs panel hidden with `hidden lg:flex`)
- Dialog width: `max-w-2xl` on mobile, `max-w-5xl` on desktop

---

## Test Coverage

### Backend Tests Added

1. **MercureService.test.ts**
   - `getOnboardingTopic()` with/without tenant context
   - `publishOnboardingEvent()` with object/non-object data

2. **MercureRouter.test.ts**
   - Onboarding type token generation
   - Error handling for missing user ID

3. **OnboardingRouter.test.ts**
   - Mercure events published when enabled
   - No publish when Mercure disabled
   - SSE continues even if Mercure publish fails

### Frontend Tests Added

1. **OnboardingJobsPanel.test.tsx**
   - Renders job list
   - Shows correct summary counts
   - Handles empty state

2. **OnboardingJobItem.test.tsx**
   - Renders all status badges correctly
   - Shows progress bar for running jobs
   - Displays icon based on job type

---

## Implementation Summary

### What Was Implemented

1. **Two-Panel UI**
   - Split dialog layout (60/40 split)
   - Left panel: Chat with timestamps and action buttons
   - Right panel: Jobs panel with status badges and progress
   - Responsive: Jobs panel hidden on mobile

2. **Mercure Integration**
   - Backend: `getOnboardingTopic()` and `publishOnboardingEvent()` in MercureService
   - Backend: OnboardingRouter publishes events to Mercure alongside SSE
   - Frontend: `onboarding` type added to MercureSubscribeOptions
   - Token endpoint: Supports `type: "onboarding"` for subscriber tokens

3. **Jobs Panel Components**
   - `OnboardingJobsPanel`: Container with job count summary
   - `OnboardingJobItem`: Individual job with icon, status badge, progress

### What Uses Stub Data (Phase 3)

- Jobs panel shows static/mock job data
- Tool implementations still return mock results
- GitHub OAuth not connected
- Actual file import/generation not implemented

---

## Verification Checklist

- [x] Dialog shows two panels side-by-side on desktop
- [x] Jobs panel hidden on mobile
- [x] Chat messages show timestamps
- [x] Action buttons appear in assistant messages
- [x] Jobs panel shows job items with correct status badges
- [x] Progress bar shows for running jobs
- [x] All text is localized (EN/ES)
- [x] Mercure topic methods added to MercureService
- [x] Mercure token endpoint supports onboarding type
- [x] OnboardingRouter publishes to Mercure when enabled
- [x] SSE fallback works when Mercure disabled
- [x] Tests pass for all new functionality

---

## Next Steps (Phase 3)

1. **Real Tool Implementations**
   - Replace stub tools with actual GitHub OAuth
   - Implement repository scanning (list .md files)
   - Implement markdown import (create articles)
   - Implement AI article generation

2. **Real-Time Job Updates**
   - Connect jobs panel to Mercure subscription
   - Update jobs in real-time as tools execute
   - Show actual progress for long-running operations

3. **GitHub Integration**
   - OAuth flow for GitHub connection
   - Repository selection UI
   - File browser for markdown selection

4. **Article Generation**
   - Use existing JolliAgent for content generation
   - Generate README, architecture, getting-started docs
   - Preview generated content before saving
