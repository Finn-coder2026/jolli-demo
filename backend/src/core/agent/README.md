# Agent System - LangGraph-based AI Framework

A flexible, extensible agent framework built on [LangGraph](https://github.com/langchain-ai/langgraphjs) for building stateful AI agents with support for multiple LLM providers.

## Features

- **Multiple LLM Providers**: OpenAI, Anthropic, Google (planned), AWS Bedrock (planned), Azure (planned)
- **Streaming Support**: Real-time token-by-token streaming
- **Memory Management**: Persistent conversation state and context
- **Time-Travel Debugging**: Save and restore agent state
- **Tool Integration**: Extensible tool/function calling support
- **LangGraph Capabilities**: Built on LangGraph for advanced orchestration features like:
  - Human-in-the-loop
  - Custom state management
  - Multi-agent orchestration
  - Parallelization
  - Subgraphs
  - Reflection

## Quick Start

### Creating an Agent

```typescript
import { createAgent, createAgentFromEnv, LLMProvider } from './core/agent';

// Create an OpenAI agent
const agent = createAgent({
  provider: LLMProvider.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
});

// Or create from environment variables
const agent = createAgentFromEnv();
```

### Using the Agent

```typescript
// Stream responses
for await (const chunk of agent.stream([
  { role: "user", content: "What is LangGraph?" }
])) {
  if (chunk.type === "content") {
    console.log(chunk.content);
  }
}

// Get complete response
const response = await agent.invoke([
  { role: "user", content: "Hello!" }
]);
console.log(response.content);
```

### Configuration

```typescript
const agent = createAgent({
  provider: LLMProvider.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
  defaultConfig: {
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: "You are a helpful assistant.",
  },
});
```

## Environment Variables

The agent system supports these environment variables:

- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `LLM_PROVIDER` - Provider to use (default: "openai")
- `LLM_MODEL` - Model to use (provider-specific)

## Architecture

### Agent Interface

The `Agent` interface defines the core operations:

```typescript
interface Agent {
  // Get a complete response
  invoke(messages: ChatMessage[], config?: AgentConfig): Promise<AgentResponse>;

  // Stream responses in real-time
  stream(messages: ChatMessage[], config?: AgentConfig): AsyncGenerator<AgentStreamChunk>;

  // Memory and state management
  getState(): Promise<AgentState>;
  setState(state: AgentState): Promise<void>;
  clearMemory(): Promise<void>;
}
```

### Message Format

```typescript
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
```

### Streaming Chunks

```typescript
interface AgentStreamChunk {
  type: "content" | "tool_call" | "metadata" | "done";
  content?: string;
  toolCall?: ToolCall;
  metadata?: Record<string, unknown>;
}
```

## Supported Providers

### OpenAI

```typescript
import { OpenAIAgent } from './core/agent';

const agent = new OpenAIAgent(
  process.env.OPENAI_API_KEY,
  "gpt-4o-mini",
  "Custom system prompt"
);
```

**Supported Models:**
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

### Anthropic

```typescript
import { AnthropicAgent } from './core/agent';

const agent = new AnthropicAgent(
  process.env.ANTHROPIC_API_KEY,
  "claude-3-5-sonnet-20241022",
  "Custom system prompt"
);
```

**Supported Models:**
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## Advanced Features

### State Management

```typescript
// Save current state
const state = await agent.getState();

// Restore state (time-travel)
await agent.setState(state);

// Clear memory
await agent.clearMemory();
```

### Custom Configuration per Request

```typescript
const response = await agent.invoke(messages, {
  temperature: 0.9,
  maxTokens: 1000,
  systemPrompt: "You are a code expert.",
});
```

## Extending the Framework

### Creating a New Provider

1. Extend `BaseLangGraphAgent`:

```typescript
import { BaseLangGraphAgent } from './BaseLangGraphAgent';
import { ChatYourProvider } from '@langchain/your-provider';

export class YourProviderAgent extends BaseLangGraphAgent {
  private modelName: string;

  constructor(apiKey: string, model = "default-model", systemPrompt?: string) {
    const llm = new ChatYourProvider({
      apiKey,
      model,
      streaming: true,
    });

    super(llm, systemPrompt);
    this.modelName = model;
  }

  protected getProviderName(): string {
    return "your-provider";
  }

  protected getModelName(): string {
    return this.modelName;
  }
}
```

2. Add to `AgentFactory.ts` createAgent function:

```typescript
case LLMProvider.YOUR_PROVIDER:
  return new YourProviderAgent(apiKey, model, defaultConfig?.systemPrompt);
```

### Custom Graph Structures

Override `buildGraph()` in `BaseLangGraphAgent` to create custom state graphs:

```typescript
protected buildGraph(): StateGraph<AgentState> {
  const graph = new StateGraph<AgentState>({
    channels: {
      messages: { /* ... */ },
      customState: { /* ... */ },
    },
  });

  // Add custom nodes
  graph.addNode("agent", /* ... */);
  graph.addNode("tool_executor", /* ... */);

  // Add conditional edges
  graph.addConditionalEdges("agent", shouldUseTool);

  return graph;
}
```

## Testing

The framework includes comprehensive tests:

```bash
npm test -- Agent
```

Mock agents are available for testing:

```typescript
class MockAgent implements Agent {
  async invoke() { return { content: "Mock response" }; }
  async *stream() { yield { type: "content", content: "Mock" }; }
  // ... implement other methods
}
```

## Future Enhancements

- [ ] Tool/function calling support
- [ ] Google AI provider
- [ ] AWS Bedrock provider
- [ ] Azure OpenAI provider
- [ ] Multi-agent orchestration examples
- [ ] Human-in-the-loop workflows
- [ ] Persistent memory backends (Redis, PostgreSQL)
- [ ] Reflection and self-correction patterns
- [ ] Parallel agent execution

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [LangChain TypeScript](https://js.langchain.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/claude/reference)
