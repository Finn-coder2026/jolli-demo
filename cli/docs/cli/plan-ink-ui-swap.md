---
on_update: null
---
# Plan: Swap CLI UI to Ink (Minimal + Command Suggestions)

## Goal
Replace the current CLI's readline-based REPL UI with Ink (React for terminals), taking only the UI rendering approach from `cli-old` without any of its features/business logic. Include command suggestions/autocomplete for `/` commands.

## Important Constraints

- **Runtime**: Bun (not Node.js) - uses `bun build --compile` for single binary
- **Independence**: CLI must remain completely independent from main app (`backend`/`frontend`)
- **No shared dependencies**: Cannot import from `jolli-common` or other workspace packages
- **Self-contained**: All UI code lives within `cli/` directory

## Current State

### New CLI (`./cli`)
- **Runtime**: Bun
- **Build**: `bun build --compile` produces standalone binary
- Uses **Commander.js** for command parsing
- Agent mode uses **Node.js readline** for interactive REPL
- Raw **ANSI color codes** for terminal styling
- **console.log/process.stdout.write** for output
- All business logic is in place (auth, sync, agent with Mercure streaming, tool host)
- **Fully independent** - no dependencies on main app

### Old CLI (`./cli-old`)
- Uses **Ink** (React-based terminal UI framework)
- Components: `Box`, `Text`, `useInput` from ink
- Addons: `ink-text-input`, `ink-select-input`, `ink-spinner`
- Rich component structure with contexts for state management
- Different business logic (old API patterns)

## What to Port (UI Only)

1. **Ink rendering infrastructure** - the `render()` pattern from `cli-old/src/interactive/index.tsx`
2. **Basic Ink components** - `Box`, `Text` for layout/styling
3. **Input handling** - `ink-text-input` to replace readline
4. **Spinner** - `ink-spinner` for loading states (optional)
5. **Command suggestions** - autocomplete dropdown as user types `/` commands

## What NOT to Port

- Context providers (SystemContext, ChatContext, etc.) - overkill for current needs
- View system (ChatView, ConvosView, AdminView) - not needed
- Conversation list UI - not needed for minimal swap
- Any business logic from cli-old

## Implementation Plan

### Phase 1: Add Dependencies
Add to `cli/package.json`:
```json
"dependencies": {
  "ink": "6.3.1",
  "ink-text-input": "6.0.0",
  "ink-spinner": "5.0.0",
  "react": "19.2.0"
},
"devDependencies": {
  "@types/react": "19.2.2"
}
```

### Phase 2: Create Minimal Ink Components

Create `cli/src/client/ui/` directory with:

1. **`AgentUI.tsx`** - Main agent session UI component
   - Header with session info (workspace, session ID)
   - Message/streaming output area
   - Input box at bottom
   - Tool execution status display
   - Confirmation prompts

2. **`InputBox.tsx`** - Simple input component
   - Wraps `ink-text-input`
   - Shows prompt (`You: `)
   - Handles submit

3. **`StatusLine.tsx`** - Connection/streaming status
   - Shows "typing..." indicator
   - Shows tool execution status

### Phase 2.5: Add Command Suggestions

1. **`CommandSuggestions.tsx`** - Autocomplete dropdown component
   - Shows filtered list of commands below input when user types `/`
   - Arrow key navigation (up/down to select)
   - Enter to select and execute command
   - Escape to dismiss
   - Visual highlight on selected item
   - Port from `cli-old/src/interactive/components/CommandSuggestions.tsx`

2. **`useCommandSuggestions.ts`** - Hook for filtering commands
   - Filter available commands based on input prefix
   - Only active when input starts with `/`
   - Returns matching commands with name + description
   - Port pattern from `cli-old/src/interactive/hooks/useCommandSuggestions.ts`

3. **`commands.ts`** - Command registry
   - Define available commands: `/quit`, `/clear`, `/help`, `/yes`, `/no`
   - Each command has: `name`, `description`
   - Simple array, no complex handler system needed

### Phase 3: Refactor Agent Command

Modify `cli/src/client/commands/agent.ts`:

1. Replace `startRepl()` function with Ink render:
   ```typescript
   import { render } from "ink";
   import { AgentUI } from "../ui/AgentUI";

   async function startRepl(session: ActiveSession): Promise<void> {
     const { waitUntilExit } = render(
       <AgentUI session={session} />
     );
     await waitUntilExit();
   }
   ```

2. Keep all existing:
   - Session management (`ActiveSession` type)
   - Mercure event handling (`handleMercureEvent`)
   - Tool execution logic
   - Confirmation handling

3. Pass events to UI via props/callbacks instead of console.log

### Phase 4: Wire Up Events

The `AgentUI` component needs to:
- Receive streaming content chunks and display them
- Show tool call status
- Handle user input and call `session.client.sendMessage()`
- Display confirmation prompts and handle `/yes`, `/no`
- Show command suggestions when input starts with `/`

State to track in component:
```typescript
interface AgentUIState {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentStream: string;
  isStreaming: boolean;
  status: 'idle' | 'typing' | 'tool-executing';
  pendingConfirmation: PendingConfirmation | null;
  inputValue: string;
  commandSuggestions: Array<{ name: string; description: string }>;
}
```

### Phase 5: Update Build Config (Bun)

Ensure Bun handles JSX correctly:
- Add `"jsx": "react-jsx"` to `cli/tsconfig.json` if needed
- Test that `bun build --compile` works with React/Ink
- Verify standalone binary works without Node.js installed
- **No imports from workspace packages** - keep CLI self-contained

## File Structure After Implementation

```
cli/src/client/
├── ui/
│   ├── AgentUI.tsx            # Main agent UI component
│   ├── InputBox.tsx           # Text input component
│   ├── StatusLine.tsx         # Status display component
│   ├── CommandSuggestions.tsx # Autocomplete dropdown
│   ├── commands.ts            # Command registry
│   ├── useCommandSuggestions.ts # Filtering hook
│   └── index.ts               # Exports
├── commands/
│   └── agent.ts               # Modified to use Ink
└── ...
```

## Command Suggestions UX

When user types `/`:
```
┌─────────────────────────────────────────────┐
│ You: /he                                    │
├─────────────────────────────────────────────┤
│ Type to filter, ↑↓ select, Enter choose:   │
│ > /help - Show available commands           │
└─────────────────────────────────────────────┘
```

Available commands:
| Command | Description |
|---------|-------------|
| `/quit` | Exit the session |
| `/clear` | Clear the screen |
| `/help` | Show available commands |
| `/yes` | Confirm pending tool execution |
| `/no` | Cancel pending tool execution |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bun compile with React/Ink | Test early in Phase 1 with minimal React component |
| Bundle size increase | Acceptable for CLI tool (Ink adds ~200KB) |
| Test complexity | Use ink-testing-library if needed |
| Bun + React compatibility | Ink 6.x works with Bun; verify with `bun build --compile` |
| Accidental main app coupling | Review imports - must not import from `jolli-common` or other workspace packages |

## Estimated Changes

- **New files**: 7 (5 UI components + hook + commands + index)
- **Modified files**: 2 (`agent.ts`, `package.json`)
- **Lines of code**: ~300-400 new lines

## Success Criteria

1. `jolli agent` starts with Ink-rendered UI
2. User can type messages and see responses stream
3. Tool calls show status and confirmation prompts work
4. Ctrl+C exits cleanly
5. All existing agent functionality preserved
6. **Typing `/` shows command suggestions dropdown**
7. **Arrow keys navigate suggestions, Enter selects**
8. **Tab autocompletes to selected command**
