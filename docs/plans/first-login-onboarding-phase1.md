# First Login Onboarding - Phase 1 Implementation Plan

## Overview

Agent-driven onboarding using LLM + tools pattern. Single chat interface with jobs panel.

**Goal:** Get new users to a working state with connected GitHub and at least one article.

---

## Phased Implementation

| Phase | Description | SSE Method |
|-------|-------------|------------|
| **Phase 1** | Basic flow: chat UI, SSE streaming, LLM with tool calls, save state | Direct SSE |
| Phase 2 | Jobs panel with real-time updates | Mercure SSE |
| Phase 3 | Full tools (GitHub, scan, import/generate articles) | Mercure SSE |

---

# Phase 1: Basic Agent Chat Flow

## Scope

- Onboarding page appears for new users
- User can chat with LLM agent
- Agent responds with streaming text via SSE
- Agent can call tools (stub implementations)
- Onboarding state persisted to database
- Skip/complete functionality

---

## Folder Structure

```
backend/src/onboarding-agent/
├── OnboardingAgent.ts       # LLM + tools loop
├── OnboardingTools.ts       # Tool definitions (stubs)
├── OnboardingRouter.ts      # API endpoints with SSE
└── types.ts                 # Backend types

backend/src/model/UserOnboarding.ts
backend/src/dao/UserOnboardingDao.ts

frontend/src/ui/onboarding/
├── OnboardingPage.tsx       # Main page
├── OnboardingChat.tsx       # Chat component
└── Onboarding.content.ts    # Localization

common/src/onboarding/
├── types.ts                 # Shared types
└── OnboardingClient.ts      # API client
```

---

## Database Model

**Table: user_onboarding**

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_id | INTEGER | FK to active_users (UNIQUE) |
| current_step | VARCHAR | Current step name |
| status | VARCHAR | not_started, in_progress, completed, skipped |
| goals | JSONB | User's goals |
| step_data | JSONB | Step-specific data |
| completed_steps | JSONB | Array of completed steps |
| skipped_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/src/onboarding-agent/OnboardingAgent.ts` | LLM + tools loop |
| `backend/src/onboarding-agent/OnboardingTools.ts` | Tool definitions |
| `backend/src/onboarding-agent/OnboardingRouter.ts` | SSE endpoints |
| `backend/src/onboarding-agent/types.ts` | Backend types |
| `backend/src/model/UserOnboarding.ts` | Sequelize model |
| `backend/src/dao/UserOnboardingDao.ts` | DAO |
| `common/src/onboarding/types.ts` | Shared types |
| `common/src/onboarding/OnboardingClient.ts` | API client |
| `frontend/src/ui/onboarding/OnboardingPage.tsx` | Main page |
| `frontend/src/ui/onboarding/OnboardingChat.tsx` | Chat UI |
| `frontend/src/ui/onboarding/Onboarding.content.ts` | i18n |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/core/Database.ts` | Add model + DAO |
| `backend/src/AppFactory.ts` | Register router |
| `common/src/core/Client.ts` | Add onboarding() |
| `common/src/index.ts` | Export types |
| `frontend/src/ui/MainElement.tsx` | Add onboarding check |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/onboarding | Get current state |
| POST | /api/onboarding/chat | Chat with agent (SSE stream) |
| POST | /api/onboarding/skip | Skip onboarding |
| POST | /api/onboarding/complete | Complete onboarding |

---

## Phase 1 Tools (Stub Implementations)

Tools fit the onboarding flow but return fake/mock data. Real implementations in later phases.

| Tool | Description | Phase 1 Behavior |
|------|-------------|------------------|
| `connect_github` | Start GitHub OAuth | Returns mock success: "GitHub connected to acme/docs" |
| `list_repos` | List user's repos | Returns mock list: ["acme/docs", "acme/api", "acme/webapp"] |
| `scan_repository` | Find .md files in repo | Returns mock files: ["README.md", "docs/setup.md"] |
| `import_markdown` | Import .md as article | Returns mock: "Imported README.md as article" |
| `generate_article` | Generate README/architecture/getstart | Returns mock: "Generated architecture.md" |
| `advance_step` | Move to next step | Updates current_step in DB |
| `skip_onboarding` | Skip onboarding | Sets status=skipped in DB |
| `complete_onboarding` | Complete onboarding | Sets status=completed in DB |

**Example Flow with Stub Tools:**
```
User: "Let's get started"
Agent: [calls connect_github] → "GitHub connected to acme/docs"
Agent: "Great! I've connected your GitHub. Let me scan for existing docs..."
Agent: [calls scan_repository] → ["README.md", "docs/setup.md"]
Agent: "I found 2 markdown files. Want me to import them?"
       [Import all] [Skip]
User: clicks [Import all]
Agent: [calls import_markdown for each] → "Imported 2 articles"
Agent: [calls complete_onboarding]
Agent: "You're all set! Your docs are ready."
```

---

## Phase 1 Verification

- New user sees onboarding page
- Can chat with agent (streaming response)
- Agent calls stub tools and gets mock responses
- Tool results shown in conversation
- Skip/complete works
- State persists across page reload

---

## Implementation Status

### Completed (Phase 1)

**Files Created:**

| File | Description | Status |
|------|-------------|--------|
| `common/src/onboarding/types.ts` | Shared TypeScript types | Created |
| `common/src/onboarding/OnboardingClient.ts` | API client with SSE streaming | Created |
| `common/src/onboarding/index.ts` | Module exports | Created |
| `common/src/core/OnboardingClient.ts` | Re-export wrapper | Created |
| `backend/src/model/UserOnboarding.ts` | Sequelize model | Created |
| `backend/src/dao/UserOnboardingDao.ts` | Data access object | Created |
| `backend/src/onboarding-agent/types.ts` | Backend-specific types | Created |
| `backend/src/onboarding-agent/OnboardingTools.ts` | 8 stub tools | Created |
| `backend/src/onboarding-agent/OnboardingAgent.ts` | Anthropic-powered agent | Created |
| `backend/src/onboarding-agent/OnboardingRouter.ts` | SSE endpoints | Created |
| `backend/src/onboarding-agent/index.ts` | Module exports | Created |
| `frontend/src/ui/onboarding/Onboarding.content.ts` | i18n content (EN/ES) | Created |
| `frontend/src/ui/onboarding/OnboardingChat.tsx` | Chat component | Created |
| `frontend/src/ui/onboarding/OnboardingPage.tsx` | Main onboarding page | Created |
| `frontend/src/ui/onboarding/index.ts` | Module exports | Created |

**Files Modified:**

| File | Change | Status |
|------|--------|--------|
| `backend/src/core/Database.ts` | Added UserOnboarding model + DAO | Modified |
| `backend/src/AppFactory.ts` | Registered OnboardingRouter | Modified |
| `common/src/core/Client.ts` | Added onboarding() method | Modified |
| `common/src/index.ts` | Added onboarding exports | Modified |
| `frontend/src/ui/MainElement.tsx` | Added onboarding check/redirect | Modified |

### Key Implementation Details

**Backend:**
- Uses Anthropic Claude (claude-sonnet-4-20250514) for the LLM agent
- SSE streaming for real-time responses
- Tool loop supports up to 10 iterations
- 8 stub tools that return mock data (ready for Phase 2 implementation)
- State persisted to `user_onboarding` table with JSONB columns

**Frontend:**
- Checks onboarding status on login
- Shows OnboardingPage if user needs onboarding
- Chat interface with streaming messages
- Skip confirmation dialog
- Completion screen with redirect to articles

**API Endpoints:**
- `GET /api/onboarding` - Get current state
- `POST /api/onboarding/chat` - Chat with agent (SSE)
- `POST /api/onboarding/skip` - Skip onboarding
- `POST /api/onboarding/complete` - Complete onboarding

### Next Steps (Phase 2)

1. Replace stub tools with real implementations
2. Add jobs panel with Mercure SSE for real-time updates
3. Implement actual GitHub OAuth connection
4. Implement repository scanning
5. Implement markdown import
6. Implement AI article generation
