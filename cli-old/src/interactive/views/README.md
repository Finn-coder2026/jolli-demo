---
jrn: MKKIR4UZVDQ4CRWV
---
# Interactive CLI Views

This directory contains the view system for the Jolli Interactive CLI. Views are pluggable UI components that can be easily added to extend the functionality of the interactive mode.

## Architecture

The view system uses a registry pattern similar to the command system:

- **ViewDefinition**: Defines a view's name and component
- **ViewContext**: Provides all the state and handlers a view needs
- **View Registry**: Central registry of all available views

## Existing Views

### ChatView
The main chat interface with message history, command suggestions, and input.

### ConvosView
Shows a list of all convos and allows switching between them.

## Adding a New View

To add a new view to the interactive CLI, follow these steps:

### 1. Create Your View Component

Create a new file in `cli/src/interactive/views/` (e.g., `MyNewView.tsx`):

```typescript
import type { ViewContext, ViewDefinition } from "./types";
import { Box, Text } from "ink";
import type React from "react";

function MyNewViewComponent(ctx: ViewContext): React.ReactElement {
    return (
        <Box flexDirection="column" padding={1}>
            <Text>My New View!</Text>
            {/* Access any state or handlers from ctx */}
            <Text>Active Convo: {ctx.activeConvoId}</Text>

            {/* You can use all the handlers */}
            {/* ctx.handleSend, ctx.handleNewConvo, etc. */}
        </Box>
    );
}

export const myNewView: ViewDefinition = {
    name: "my-new-view",
    component: MyNewViewComponent,
};
```

### 2. Register Your View

Add your view to the registry in `cli/src/interactive/views/index.ts`:

```typescript
import { chatView } from "./ChatView";
import { convosView } from "./ConvosView";
import { myNewView } from "./MyNewView";  // Import your view
import type { ViewContext, ViewDefinition } from "./types";

export type { ViewContext, ViewDefinition };

// Add your view to the registry
export const VIEWS: Array<ViewDefinition> = [
    chatView,
    convosView,
    myNewView,  // Register it here
];

export function getView(viewName: string): ViewDefinition | undefined {
    return VIEWS.find(view => view.name === viewName);
}
```

### 3. Add Navigation

Add a way to navigate to your view. You can:

**Option A: Create a command**

Create a command in `cli/src/interactive/commands/MyNewViewCommand.ts`:

```typescript
import type { CommandDefinition } from "./types";

export const myNewViewCommand: CommandDefinition = {
    name: "/mynewview",
    description: "Open my new view",
    handler: ctx => {
        ctx.setViewMode("my-new-view");
    },
};
```

Then register it in `cli/src/interactive/commands/index.ts`.

**Option B: Add a keyboard shortcut**

In `InteractiveCLIApp.tsx` (located in the parent directory), add a new keyboard binding:

```typescript
useInput((input, key) => {
    if (key.ctrl && input === "l" && !isLoading) {
        setViewMode(prev => (prev === "chat" ? "convos" : "chat"));
    }
    // Add your shortcut
    if (key.ctrl && input === "n" && !isLoading) {
        setViewMode("my-new-view");
    }
});
```

### 4. Add Tests (Optional but Recommended)

Create a test file `cli/src/interactive/views/MyNewView.test.tsx`:

```typescript
import { myNewView } from "./MyNewView";
import type { ViewContext } from "./types";
import type { Client } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

describe("MyNewView", () => {
    it("should have correct name", () => {
        expect(myNewView.name).toBe("my-new-view");
    });

    it("should have a component function", () => {
        expect(myNewView.component).toBeDefined();
        expect(typeof myNewView.component).toBe("function");
    });

    it("should render without crashing", () => {
        const ctx: ViewContext = {
            // ... create mock context
            client: {} as Client,
            // ... other properties
        };

        const result = myNewView.component(ctx);
        expect(result).toBeDefined();
    });
});
```

Update `cli/vite.config.ts` to exclude your view component from coverage:

```typescript
exclude: [
    // ...
    "src/interactive/views/MyNewView.tsx",
],
```

## ViewContext API

The `ViewContext` provides access to all the state and handlers you need:

### State
- `message`: Current input message
- `messages`: Chat message history
- `isLoading`: Whether a request is in progress
- `convos`: List of all convos
- `activeConvoId`: Currently active convo ID
- `systemMessage`: System message to display
- `commandSuggestions`: Suggested commands based on user input

### State Setters
- `setMessage(message: string)`
- `setMessages(messages: ChatMessage[])`
- `setIsLoading(isLoading: boolean)`
- `setConvos(convos: Convo[])`
- `setActiveConvoId(id: number | undefined)`
- `setViewMode(mode: string)` - Switch to another view
- `setSystemMessage(message: string | null)`

### Handlers
- `handleSend()`: Send the current message
- `handleNewConvo()`: Start a new convo
- `handleSwitchConvo(convo: Convo)`: Switch to a convo

### Other
- `client`: The Jolli client for making API calls
- `isMountedRef`: Ref to check if component is still mounted

## Best Practices

1. **Keep views simple**: Views should primarily render UI. Business logic should be in handlers.
2. **Use existing components**: Reuse components from `cli/src/interactive/components/` when possible.
3. **Handle loading states**: Check `ctx.isLoading` and provide appropriate UI feedback.
4. **Add navigation back**: Include a way to return to the chat view (e.g., "Press 'b' to go back").
5. **Test your view**: Add basic tests to ensure your view doesn't break the build.

## Example: Settings View

Here's a complete example of a settings view:

```typescript
import type { ViewContext, ViewDefinition } from "./types";
import { Box, Text } from "ink";
import type React from "react";

function SettingsViewComponent(ctx: ViewContext): React.ReactElement {
    return (
        <Box flexDirection="column" padding={1}>
            <Text bold color="cyan">Settings</Text>
            <Box marginTop={1}>
                <Text>User preferences and configuration</Text>
            </Box>
            <Box marginTop={1}>
                <Text dimColor>Press 'b' to go back to chat</Text>
            </Box>
        </Box>
    );
}

export const settingsView: ViewDefinition = {
    name: "settings",
    component: SettingsViewComponent,
};
```

Then create a command to open it:

```typescript
export const settingsCommand: CommandDefinition = {
    name: "/settings",
    description: "Open settings",
    handler: ctx => {
        ctx.setViewMode("settings");
    },
};
```

That's it! Your new view is now part of the interactive CLI.
