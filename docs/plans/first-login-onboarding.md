# First Login Onboarding - Design Plan

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
| `backend/src/router/index.ts` | Register router |
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

## Phase 1 Verification

- New user sees onboarding page
- Can chat with agent (streaming response)
- Agent can call tools
- Skip/complete works
- State persists across page reload
