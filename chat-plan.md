# Plan: Replace ChatRouter with AgentChatRouter using JolliAgent

## ✅ IMPLEMENTATION COMPLETE

**Status**: Phases 1 and 3 have been successfully implemented and are ready for testing.

---

Based on my analysis, here's a comprehensive plan to replace the current `ChatRouter.ts` with an `AgentChatRouter.ts` that uses the jolliagent system:

## Current Architecture Analysis

**ChatRouter.ts** (Simple Chat - like `Chatbot.tsx`):
- Uses `backend/src/core/agent` (simple Agent abstraction)
- Streams responses via SSE
- Interface: `POST /api/chat/stream` with `{ message, messages[], convoId? }`
- Returns: SSE stream with `{ content }` chunks and `{ type: "done" }`

**CollabConvoRouter.ts** (Article Draft Chat):
- Uses the same simple Agent from `backend/src/core/agent`
- Has article-specific system prompts with `[ARTICLE_UPDATE]` markers
- Streams chunks, extracts article updates, generates diffs
- More complex: handles SSE connections, broadcasts to multiple users, revision management

**JolliAgent System** (in `./tools/jolliagent`):
- Provider-agnostic agent with tool support
- `Agent.chatTurn()` - handles full conversation turn with tool execution
- Factory system in `workflows.ts` - creates specialized agents with specific tools
- Uses E2B sandbox for tool execution

## Key Differences & Challenges

| Aspect | Current System | JolliAgent System |
|--------|----------------|-------------------|
| **Tool Execution** | No tools | Full tool support via `chatTurn()` |
| **Streaming** | Simple `agent.stream()` | `chatTurn()` with `onTextDelta` callback |
| **RunState** | N/A | Requires `RunState` (e2b sandbox or local) |
| **Response Format** | Raw LLM output | Includes tool calls and results |
| **Message History** | Simple array | Managed by `chatTurn()` with tool messages |

## Proposed Solution: Adapter Architecture

Create an **adapter layer** that bridges the CollabConvoRouter interface with JolliAgent:

```
CollabConvoRouter (existing interface)
          ↓
  AgentChatAdapter (NEW)
          ↓
  JolliAgent (from workflows.ts)
          ↓
  Tools (optional - configured per agent)
```

## Implementation Plan

### 1. **Create New Agent Profile for Article Editing**

**File**: `tools/jolliagent/src/agents/articleEditingAgent.ts`

```typescript
import type { AgentOptions } from "./Agent";
import type { RunState, ToolDef } from "../Types";
import { createAgent } from "./factory";

// Article editing specific tools (optional - can start with none)
const articleEditingTools: Array<ToolDef> = [
  // Could add tools like:
  // - search_documentation
  // - check_code_examples
  // - validate_markdown
];

export function createArticleEditingAgent(opts: {
  runState?: RunState;
  enableTools?: boolean;
}): ReturnType<typeof createAgent> {

  const agentOpts: AgentOptions = {
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    runState: opts.runState,
    maxOutputTokens: 4096,
    tools: opts.enableTools ? articleEditingTools : undefined,
  };

  return createAgent("general", agentOpts);
}
```

Add to `tools/jolliagent/src/agents/profiles.ts`:
```typescript
export const profiles = {
  // ... existing profiles
  "article-editing": {
    defaultAgentOpts: {
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
    defaultChatOpts: {
      system: ARTICLE_EDITING_SYSTEM_PROMPT, // Import from CollabConvoRouter
    },
  },
};
```

### 2. **Create AgentChatAdapter**

**File**: `backend/src/adapters/AgentChatAdapter.ts`

This adapter converts between the two interfaces:

```typescript
import type { Agent } from "../../../tools/jolliagent/src/agents/Agent";
import type { Message, ToolCall } from "../../../tools/jolliagent/src/Types";
import type { ChatMessage } from "../core/agent";
import type { CollabMessage } from "../model/CollabConvo";

export class AgentChatAdapter {
  private agent: Agent;
  private withDefaults: (opts: any) => any;

  constructor(agentFactory: { agent: Agent; withDefaults: (opts: any) => any }) {
    this.agent = agentFactory.agent;
    this.withDefaults = agentFactory.withDefaults;
  }

  /**
   * Convert CollabMessage[] to jolliagent Message[]
   */
  private convertMessages(
    messages: Array<CollabMessage>,
    systemPrompt?: string,
  ): Array<Message> {
    const result: Array<Message> = [];

    if (systemPrompt) {
      result.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        result.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return result;
  }

  /**
   * Stream a chat response using jolliagent's chatTurn
   * Returns chunks via onChunk callback, similar to current streaming
   */
  async streamResponse(params: {
    messages: Array<CollabMessage>;
    systemPrompt?: string;
    onChunk: (content: string) => void;
    onToolCall?: (call: ToolCall, result: string) => void;
    runTool?: (call: ToolCall) => Promise<string>;
  }): Promise<string> {

    const history = this.convertMessages(params.messages, params.systemPrompt);

    // Use chatTurn with streaming callback
    const result = await this.agent.chatTurn({
      history,
      runTool: params.runTool || (async (call) => {
        // Default: tools disabled, return empty
        return "Tool execution not available";
      }),
      onTextDelta: (delta: string) => {
        params.onChunk(delta);
      },
      onToolEvent: (event) => {
        // Optional: broadcast tool events to frontend
        if (event.type === "tool_end" && event.result && params.onToolCall) {
          // Note: We'd need to reconstruct the ToolCall from event data
          // This is a simplified version
        }
      },
    });

    return result.assistantText;
  }
}
```

### 3. **Modify CollabConvoRouter to Use Adapter**

**File**: `backend/src/router/CollabConvoRouter.ts`

Changes needed:

```typescript
// Replace imports
import { createArticleEditingAgent } from "../../../tools/jolliagent/src/agents/articleEditingAgent";
import { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import type { RunState } from "../../../tools/jolliagent/src/Types";

// In createCollabConvoRouter function:
export function createCollabConvoRouter(
  collabConvoDao: CollabConvoDao,
  docDraftDao: DocDraftDao,
  tokenUtil: TokenUtil<UserInfo>,
  ai: AI, // Keep for backward compatibility, but won't use
  chunkDao: ChunkDao, // Keep for backward compatibility
  agentAdapter?: AgentChatAdapter, // NEW: optional adapter injection
): Router {
  const router = express.Router();
  const chatService = new ChatService();
  const diffService = new DiffService();

  // Create jolliagent adapter if not provided
  let chatAdapter = agentAdapter;
  if (!chatAdapter) {
    // Create RunState for tool execution (optional - can be undefined for no tools)
    const runState: RunState | undefined = undefined; // Or configure E2B/local

    const agentFactory = createArticleEditingAgent({
      runState,
      enableTools: false, // Start without tools
    });

    chatAdapter = new AgentChatAdapter(agentFactory);
  }

  // ... rest of router setup

  // In POST /api/collab-convos/:id/messages - replace streamLLMResponse with:

  async function streamLLMResponseWithAdapter(
    chatAdapter: AgentChatAdapter,
    conversationMessages: Array<CollabMessage>,
    userMessage: string,
    articleContent: string,
    chatService: ChatService,
    convoId: number,
  ): Promise<string> {

    // Build system prompt with article context
    const systemPrompt = `${ARTICLE_EDITING_SYSTEM_PROMPT}

CURRENT ARTICLE CONTENT:
---
${articleContent}
---`;

    // Combine conversation history with new user message
    const allMessages = [
      ...conversationMessages,
      { role: "user" as const, content: userMessage, timestamp: new Date().toISOString() }
    ];

    return await chatAdapter.streamResponse({
      messages: allMessages,
      systemPrompt,
      onChunk: (content: string) => {
        // Broadcast chunk to connected users
        broadcastToConvo(chatService, convoId, {
          type: "content_chunk",
          content,
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  // Update the message handler to use new function
  router.post("/:id/messages", async (req: Request, res: Response) => {
    // ... validation code ...

    // Stream LLM response using adapter
    let fullResponse = "";
    try {
      fullResponse = await streamLLMResponseWithAdapter(
        chatAdapter,
        convo.messages,
        sanitizedMessage,
        draft.content,
        chatService,
        id,
      );
    } catch (error) {
      log.error(error, "Error streaming LLM response.");
      return res.status(500).json({ error: "Failed to generate response" });
    }

    // ... rest of handler (article update extraction, diff generation, etc.)
  });

  return router;
}
```

### 4. **Enable Tools (Optional Enhancement)**

To enable tools for the article editing agent:

#### a) Define Article-Specific Tools

**File**: `tools/jolliagent/src/tools/tools/search_documentation.ts`

```typescript
import type { ToolDef } from "../../Types";

export const searchDocumentationToolDefinition: ToolDef = {
  name: "search_documentation",
  description: "Search through project documentation to find relevant information for the article",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to find relevant documentation",
      },
    },
    required: ["query"],
  },
};

export async function searchDocumentationExecutor(
  runState: RunState,
  args: { query: string },
): Promise<string> {
  // Implementation: could use ChunkDao to search RAG database
  // For now, return placeholder
  return `Search results for: ${args.query}`;
}
```

#### b) Update Agent Profile with Tools

```typescript
// In articleEditingAgent.ts
import { searchDocumentationToolDefinition } from "../tools/tools/search_documentation";

const articleEditingTools: Array<ToolDef> = [
  searchDocumentationToolDefinition,
  // Add more as needed
];
```

#### c) Implement Tool Execution in Adapter

```typescript
// In AgentChatAdapter.ts
import { runToolCall } from "../../../tools/jolliagent/src/tools/Tools";

async streamResponse(params: {
  // ... existing params
  runState?: RunState;
}): Promise<string> {

  const result = await this.agent.chatTurn({
    history,
    runTool: async (call: ToolCall) => {
      if (!params.runState) {
        return "Tool execution requires RunState configuration";
      }
      // Use jolliagent's tool executor
      return await runToolCall(params.runState, call);
    },
    onTextDelta: (delta: string) => {
      params.onChunk(delta);
    },
  });

  return result.assistantText;
}
```

## Migration Strategy

### Phase 1: Basic Adapter (No Tools)
- Create `AgentChatAdapter` with basic streaming
- Update `CollabConvoRouter` to use adapter
- Keep all existing functionality (article updates, diffs, etc.)
- Test with existing frontend

### Phase 2: Add Article-Specific Profile
- Create `articleEditingAgent` profile in jolliagent
- Move system prompts to profile
- Configure temperature, model, tokens

### Phase 3: Enable Tools (Optional)
- Add article-specific tools (search docs, validate code, etc.)
- Configure RunState (local or E2B)
- Update adapter to execute tools
- Broadcast tool events to frontend

### Phase 4: Replace ChatRouter (Simple Chat)
- Create similar adapter for simple chat in `Chatbot.tsx`
- Replace `ChatRouter.ts` with `AgentChatRouter.ts`
- Use same jolliagent system with different profile

## Testing Strategy

1. **Unit Tests**: Test adapter conversion logic
2. **Integration Tests**: Test streaming with mock agent
3. **E2E Tests**: Test article editing flow with real agent
4. **Backward Compatibility**: Ensure existing frontend works unchanged

## Key Benefits

✅ **Unified Agent System**: Both chat interfaces use jolliagent
✅ **Tool Support**: Can add tools like doc search, code validation
✅ **Flexible**: Easy to create new agent profiles for different use cases
✅ **Testable**: Adapter pattern makes testing easier
✅ **Backward Compatible**: Frontend remains unchanged
✅ **Gradual Migration**: Can enable features incrementally

## Questions to Clarify

1. **Tool Execution Environment**: Do you want to use E2B sandbox or local execution for tools?
2. **Which Router First**: Should we start with `CollabConvoRouter` (article editing) or `ChatRouter` (simple chat)?
3. **Tool Requirements**: What specific tools would be useful for article editing?
4. **RunState Configuration**: How should we configure the RunState for the backend environment?
