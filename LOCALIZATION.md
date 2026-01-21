# Localization (i18n) Guide

This document provides comprehensive guidance on implementing internationalization (i18n) in Jolli using [Intlayer](https://intlayer.org).

## Table of Contents

- [Introduction](#introduction)
- [Quick Start](#quick-start)
- [Creating Content Files](#creating-content-files)
- [Using Content in Components](#using-content-in-components)
- [Backend Localization](#backend-localization)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Introduction

Jolli uses **[Intlayer](https://intlayer.org)** for internationalization, a TypeScript-first i18n framework that provides:

- Type-safe translations with full IDE autocomplete
- Co-located content files (`.content.ts`) next to components
- Support for interpolation, pluralization, and complex logic
- Zero runtime overhead with compile-time optimization

### Supported Locales

- **English (en)** - Default locale
- **Spanish (es)**

### Key Resources

- [Intlayer Documentation](https://intlayer.org/doc)
- [Intlayer GitHub](https://github.com/aymericzip/intlayer)
- Configuration: `frontend/intlayer.config.ts`

## Quick Start

The typical workflow for adding localized content:

1. **Create** a `.content.ts` file defining translations
2. **Import** the content using `useIntlayer` hook in your component
3. **Use** the translated strings in your JSX

### Simple Example

**1. Create `MyComponent.content.ts`:**

```typescript
import { type Dictionary, t } from "intlayer";

const myComponentContent = {
	key: "my-component",
	content: {
		title: t({ en: "Welcome", es: "Bienvenido" }),
		subtitle: t({ en: "Get started", es: "Empezar" }),
	},
} satisfies Dictionary;

export default myComponentContent;
```

**2. Use in `MyComponent.tsx`:**

```typescript
import { useIntlayer } from "react-intlayer";

export function MyComponent() {
	const content = useIntlayer("my-component");

	return (
		<div>
			<h1>{content.title}</h1>
			<p>{content.subtitle}</p>
		</div>
	);
}
```

## Creating Content Files

Content files define all translations for a component or feature. They should be named `*.content.ts` and placed near the components that use them.

### File Structure

```typescript
import { type Dictionary, t } from "intlayer";

const contentName = {
	key: "unique-content-key", // Kebab-case identifier
	content: {
		// Your translations here
	},
} satisfies Dictionary;

export default contentName;
```

### Simple Strings with `t()`

Use the `t()` function for simple string translations:

```typescript
import { type Dictionary, t } from "intlayer";

const welcomeContent = {
	key: "welcome-screen",
	content: {
		greeting: t({ en: "Hello!", es: "¡Hola!" }),
		logout: t({ en: "Sign Out", es: "Cerrar Sesión" }),
		settings: t({ en: "Settings", es: "Configuración" }),
	},
} satisfies Dictionary;

export default welcomeContent;
```

### Interpolation with `insert()`

For strings with dynamic values, use the `insert()` function with `{{variableName}}` placeholders:

```typescript
import { type Dictionary, insert, t } from "intlayer";

const userProfileContent = {
	key: "user-profile",
	content: {
		greeting: t({
			en: insert("Welcome, {{name}}!"),
			es: insert("¡Bienvenido, {{name}}!"),
		}),
		lastSeen: t({
			en: insert("Last seen {{time}} ago"),
			es: insert("Visto hace {{time}}"),
		}),
		itemCount: t({
			en: insert("You have {{count}} items"),
			es: insert("Tienes {{count}} elementos"),
		}),
	},
} satisfies Dictionary;

export default userProfileContent;
```

### Pluralization with `enu()`

Use `enu()` for handling singular/plural forms:

```typescript
import { type Dictionary, enu, t } from "intlayer";

const itemsContent = {
	key: "items-display",
	content: {
		items: enu({
			"0": t({ en: "no items", es: "ningún elemento" }),
			"1": t({ en: "item", es: "elemento" }),
			fallback: t({ en: "items", es: "elementos" }),
		}),
		repositories: enu({
			"0": t({ en: "repositories", es: "repositorios" }),
			"1": t({ en: "repository", es: "repositorio" }),
			fallback: t({ en: "repositories", es: "repositorios" }),
		}),
	},
} satisfies Dictionary;

export default itemsContent;
```

### Combining Techniques

You can combine `insert()` and `enu()` for complex messages:

```typescript
import { type Dictionary, enu, insert, t } from "intlayer";

const notificationsContent = {
	key: "notifications",
	content: {
		// Simple pluralization
		notifications: enu({
			"0": t({ en: "notifications", es: "notificaciones" }),
			"1": t({ en: "notification", es: "notificación" }),
			fallback: t({ en: "notifications", es: "notificaciones" }),
		}),

		// Interpolation with pluralization
		newNotifications: t({
			en: insert("You have {{count}} new {{notifications}}"),
			es: insert("Tienes {{count}} {{notifications}} nuevas"),
		}),

		// Complex nested structure
		userActions: {
			created: t({
				en: insert("{{user}} created {{count}} {{items}}"),
				es: insert("{{user}} creó {{count}} {{items}}"),
			}),
			deleted: t({
				en: insert("{{user}} deleted {{count}} {{items}}"),
				es: insert("{{user}} eliminó {{count}} {{items}}"),
			}),
		},
	},
} satisfies Dictionary;

export default notificationsContent;
```

### Nested Structure

For larger components or features, organize content hierarchically:

```typescript
import { type Dictionary, insert, t } from "intlayer";

const githubIntegrationContent = {
	key: "github-integration",
	content: {
		// Top-level strings
		title: t({ en: "GitHub Integration", es: "Integración de GitHub" }),

		// Grouped by feature
		setup: {
			title: t({ en: "Setup GitHub", es: "Configurar GitHub" }),
			description: t({
				en: "Connect your GitHub account to get started",
				es: "Conecta tu cuenta de GitHub para comenzar",
			}),
		},

		repositories: {
			title: t({ en: "Repositories", es: "Repositorios" }),
			empty: t({
				en: "No repositories found",
				es: "No se encontraron repositorios",
			}),
			enabled: t({
				en: insert("{{count}} repositories enabled"),
				es: insert("{{count}} repositorios habilitados"),
			}),
		},

		errors: {
			notFound: t({
				en: "Repository not found",
				es: "Repositorio no encontrado",
			}),
			accessDenied: t({
				en: "Access denied",
				es: "Acceso denegado",
			}),
		},
	},
} satisfies Dictionary;

export default githubIntegrationContent;
```

### File Location Conventions

- **Component-specific content**: Place `.content.ts` files next to components
  ```
  src/ui/MyComponent.tsx
  src/ui/MyComponent.content.ts
  ```

- **Shared/utility content**: Use `src/localization/` directory
  ```
  src/localization/DateTime.content.ts
  src/localization/Jobs.content.ts
  src/localization/Misc.content.ts
  ```

- **Feature-specific content**: Group with feature files
  ```
  src/ui/integrations/github/GitHubRepoList.tsx
  src/ui/integrations/github/GitHubRepoList.content.ts
  ```

## Using Content in Components

### Basic Usage

Import and use the `useIntlayer` hook with your content key:

```typescript
import { useIntlayer } from "react-intlayer";

export function WelcomeScreen() {
	const content = useIntlayer("welcome-screen");

	return (
		<div>
			<h1>{content.greeting}</h1>
			<button>{content.logout}</button>
		</div>
	);
}
```

### Using Interpolation

For `insert()` values, call them as functions with a context object:

```typescript
import { useIntlayer } from "react-intlayer";

export function UserProfile({ userName, lastSeenTime }: Props) {
	const content = useIntlayer("user-profile");

	return (
		<div>
			{/* Call as function with context */}
			<h1>{content.greeting({ name: userName })}</h1>
			<p>{content.lastSeen({ time: lastSeenTime })}</p>
		</div>
	);
}
```

### Using Pluralization

For `enu()` values, call them with a count to get the appropriate form:

```typescript
import { useIntlayer } from "react-intlayer";

export function ItemsList({ items }: Props) {
	const content = useIntlayer("items-display");

	return (
		<div>
			{/* Call enu() as function with count */}
			<p>
				{items.length} {content.items(items.length).value}
			</p>
		</div>
	);
}
```

**Note**: Access the `.value` property to extract the string from the intlayer result when needed.

### Combining Pluralization with Interpolation

When using `enu()` results inside `insert()` calls, you need to access `.value`:

```typescript
import { useIntlayer } from "react-intlayer";

export function Notifications({ count }: Props) {
	const content = useIntlayer("notifications");

	return (
		<div>
			{/* Get plural form, then use in interpolation */}
			<p>
				{content.newNotifications({
					count: count,
					notifications: content.notifications(count).value,
				})}
			</p>
		</div>
	);
}
```

### Multiple Content Imports

You can use multiple content files in a single component:

```typescript
import { useIntlayer } from "react-intlayer";

export function JobDetails({ job }: Props) {
	const content = useIntlayer("job-detail");
	const jobsContent = useIntlayer("jobs");
	const dateTimeContent = useIntlayer("date-time");

	return (
		<div>
			<h1>{content.title}</h1>
			{/* Use job-specific content from jobs.content.ts */}
			<p>{jobsContent[job.name]?.title || job.name}</p>
			{/* Use date formatting from datetime.content.ts */}
			<span>{dateTimeContent.hoursAgo({ h: 2 })}</span>
		</div>
	);
}
```

### Accessing Nested Content

Use dot notation to access nested content:

```typescript
import { useIntlayer } from "react-intlayer";

export function GitHubSetup() {
	const content = useIntlayer("github-integration");

	return (
		<div>
			<h1>{content.setup.title}</h1>
			<p>{content.setup.description}</p>

			{/* Error handling */}
			{error && <div className="error">{content.errors.accessDenied}</div>}
		</div>
	);
}
```

### TypeScript Autocomplete

Intlayer provides full TypeScript support. Your IDE will autocomplete:

- Content keys when calling `useIntlayer("...")`
- Field names when accessing `content.fieldName`
- Required context parameters for `insert()` functions
- Available enum values for `enu()` functions

This prevents typos and makes refactoring safer.

## Backend Localization

The backend does **not** send translated strings. Instead, it sends **localization keys** and **context data**, which the frontend resolves based on the user's locale.

### Backend Pattern: messageKey + context

Backend code sends structured localization data instead of plain strings:

```typescript
// Backend: src/jobs/MyJob.ts
context.log(
	"processing-file", // messageKey
	{ fileName: "example.txt", size: 1024 }, // context for interpolation
	"info", // level
);
```

The frontend receives this in SSE events or API responses:

```json
{
	"timestamp": "2024-01-15T10:30:00Z",
	"level": "info",
	"messageKey": "processing-file",
	"context": {
		"fileName": "example.txt",
		"size": 1024
	}
}
```

### Defining Backend Messages in Content Files

Backend message keys are defined in `Jobs.content.ts` with a nested structure:

```typescript
// frontend/src/localization/Jobs.content.ts
import { type Dictionary, insert, t } from "intlayer";

const jobsContent = {
	key: "jobs",
	content: {
		// Job name as key
		"my-background-job": {
			title: t({ en: "My Background Job", es: "Mi Trabajo en Segundo Plano" }),
			description: t({ en: "Processes files", es: "Procesa archivos" }),

			// Log messages
			logs: {
				"processing-file": t({
					en: insert("Processing {{fileName}} ({{size}} bytes)"),
					es: insert("Procesando {{fileName}} ({{size}} bytes)"),
				}),
				"file-complete": t({
					en: insert("Completed {{fileName}}"),
					es: insert("Completado {{fileName}}"),
				}),
			},

			// Completion messages
			completion: {
				success: t({
					en: insert("Processed {{count}} files successfully"),
					es: insert("Se procesaron {{count}} archivos exitosamente"),
				}),
				"partial-success": t({
					en: insert("Processed {{succeeded}}/{{total}} files"),
					es: insert("Se procesaron {{succeeded}}/{{total}} archivos"),
				}),
			},

			// Error messages
			errors: {
				"file-not-found": t({
					en: insert("File not found: {{fileName}}"),
					es: insert("Archivo no encontrado: {{fileName}}"),
				}),
			},
		},
	},
} satisfies Dictionary;

export default jobsContent;
```

### Frontend Resolution

The frontend uses utility functions from `JobLocalization.ts` to resolve messageKeys:

```typescript
// frontend/src/util/JobLocalization.ts

// Get localized log message
export function getLogMessage(
	jobsContent: JobsContentParam,
	jobName: string,
	log: JobLog,
): string {
	// If messageKey exists, look it up
	if (log.messageKey) {
		const message = getJobMessage(jobsContent, jobName, log.messageKey, log.context);
		if (message) return message;
	}

	// Fall back to plain message (legacy)
	return log.message || "";
}

// Get localized job message by key
export function getJobMessage(
	jobsContent: JobsContentParam,
	jobName: string,
	messageKey: string,
	context?: Record<string, unknown>,
): string {
	const jobContent = jobsContent[jobName];
	if (!jobContent) return messageKey;

	// Look in logs, completion, errors sections
	const sections = ["logs", "completion", "errors"];
	for (const section of sections) {
		const message = jobContent[section]?.[messageKey];
		if (message) {
			// If it's an insert() function, call with context
			if (typeof message === "function" && context) {
				return message(context).value || messageKey;
			}
			// Otherwise return the value directly
			return message?.value || messageKey;
		}
	}

	return messageKey;
}
```

### Using in Components

Components use these utility functions to display localized backend messages:

```typescript
import { useIntlayer } from "react-intlayer";
import { getLogMessage } from "../util/JobLocalization";

export function JobLogViewer({ job }: Props) {
	const jobsContent = useIntlayer("jobs");

	return (
		<div>
			{job.logs.map((log, index) => (
				<div key={index}>
					<span className="timestamp">{log.timestamp}</span>
					<span className="message">{getLogMessage(jobsContent, job.name, log)}</span>
				</div>
			))}
		</div>
	);
}
```

### API Error Responses

For API errors, the backend should send error keys:

```typescript
// Backend
res.status(404).json({ error: "job-not-found", context: { jobId: id } });

// Frontend handles the error key
const errorContent = useIntlayer("errors");
const errorMessage = errorContent["job-not-found"]
	? errorContent["job-not-found"]({ jobId: error.context.jobId })
	: error.error;
```

**Note**: Many existing API endpoints still use plain English error messages. These should be migrated to the messageKey pattern over time.

### Legacy Support

The system supports both old and new patterns:

```typescript
// Old pattern (still works)
context.log("Processing file: example.txt", "info");
// Frontend displays: "Processing file: example.txt"

// New pattern (recommended)
context.log("processing-file", { fileName: "example.txt" }, "info");
// Frontend displays: "Processing example.txt (English)" or "Procesando example.txt (Spanish)"
```

## Best Practices

### 1. File Organization

- **Co-locate content files** with components that use them
- **Use shared content files** (`src/localization/`) for common strings (dates, errors, etc.)
- **Group related content** in nested structures rather than creating many small files

### 2. Naming Conventions

- **Content keys**: Use kebab-case (`"my-component"`, `"user-profile"`)
- **Content field names**: Use camelCase (`greeting`, `lastSeen`)
- **Message keys**: Use kebab-case (`"processing-file"`, `"file-not-found"`)
- **File names**: Match component names with `.content.ts` suffix

### 3. Keep Translations Synchronized

When adding new translations:

1. **Always add both locales** - Don't leave Spanish translations as `TODO` or empty
2. **Use consistent terminology** - Create a glossary for common terms
3. **Consider context** - "Delete" might be "Eliminar" or "Borrar" depending on context
4. **Test with both locales** - Switch locale in settings to verify translations

### 4. Interpolation Guidelines

- **Use descriptive variable names**: `{{fileName}}` not `{{f}}`
- **Keep placeholders consistent**: If English uses `{{count}}`, Spanish should too
- **Consider word order**: Spanish may need different placeholder positions
  ```typescript
  // Good - allows for natural word order in each language
  t({
  	en: insert("{{user}} created {{count}} items"),
  	es: insert("{{user}} creó {{count}} elementos"),
  });
  ```

### 5. Pluralization Rules

- **Always include all forms**: `"0"`, `"1"`, and `fallback`
- **Test with different counts**: 0, 1, 2, and large numbers
- **Consider Spanish pluralization**: May differ from English for numbers like 0

### 6. TypeScript Usage

- **Always use `satisfies Dictionary`** for type checking
- **Import types from intlayer**: `import { type Dictionary } from "intlayer"`
- **Rely on autocomplete** - Let TypeScript guide you to valid fields
- **Use `.value` explicitly** when extracting strings from intlayer results

### 7. Testing

Test your localized content:

```typescript
// In component tests
import { createMockIntlayerValue } from "../test/TestUtils";

const mockContent = createMockIntlayerValue({
	greeting: "Hello",
	welcome: (context: { name: string }) => `Welcome, ${context.name}!`,
});

// Use in tests
expect(screen.getByText("Hello")).toBeInTheDocument();
expect(screen.getByText("Welcome, John!")).toBeInTheDocument();
```

### 8. Performance

- **Intlayer is optimized**: Content is bundled at build time, not loaded at runtime
- **Lazy loading not needed**: All locale content for the current locale is already included
- **SSR-compatible**: Works seamlessly with Next.js server-side rendering

### 9. Migration Strategy

When converting existing components:

1. **Create the `.content.ts` file** with all translations
2. **Import `useIntlayer`** in the component
3. **Replace hardcoded strings** with `content.fieldName`
4. **Test both English and Spanish**
5. **Remove old string constants**

Example migration:

```typescript
// Before
const TITLE = "Welcome to Jolli";
const SUBTITLE = "Get started with AI-powered documentation";

export function Welcome() {
	return (
		<div>
			<h1>{TITLE}</h1>
			<p>{SUBTITLE}</p>
		</div>
	);
}

// After
// Welcome.content.ts
const welcomeContent = {
	key: "welcome",
	content: {
		title: t({ en: "Welcome to Jolli", es: "Bienvenido a Jolli" }),
		subtitle: t({
			en: "Get started with AI-powered documentation",
			es: "Comienza con documentación impulsada por IA",
		}),
	},
} satisfies Dictionary;

// Welcome.tsx
export function Welcome() {
	const content = useIntlayer("welcome");
	return (
		<div>
			<h1>{content.title}</h1>
			<p>{content.subtitle}</p>
		</div>
	);
}
```

## Troubleshooting

### Content Not Updating

**Problem**: Changes to `.content.ts` files don't appear in the app.

**Solution**:

1. Stop the frontend server
2. Delete the `.intlayer` directory (directly under the `frontend` directory)
3. Restart the frontend server (`npm run start` or via your IDE)
4. Check that you're using the correct content key in `useIntlayer()`

### TypeScript Errors

**Problem**: TypeScript complains about missing properties or incorrect types.

**Solutions**:

1. Make sure you're using `satisfies Dictionary` in your content file
2. Restart TypeScript server in your IDE
3. Check that field names match exactly (case-sensitive)
4. Verify you're calling `insert()` functions correctly with context object

### Missing Translations

**Problem**: Some text appears in English when Spanish locale is selected.

**Solutions**:

1. Check that all `t()` calls include both `en` and `es` keys
2. Verify the content file is properly exported as default
3. Check that `useIntlayer()` is called with the correct key
4. Look for hardcoded strings that should be in content files

### Interpolation Not Working

**Problem**: `{{variableName}}` appears literally instead of being replaced.

**Solutions**:

1. Make sure you're using `insert()` in the content file
2. Call the function with context: `content.field({ variableName: value })`
3. Check that variable names match exactly (case-sensitive)
4. Verify you're passing all required context variables

### Pluralization Issues

**Problem**: "1 items" appears instead of "1 item".

**Solutions**:

1. Make sure you're calling `enu()` result as a function with count
2. Access `.value` property when using in interpolation
3. Check that all cases (`"0"`, `"1"`, `fallback`) are defined
4. Test with different counts (0, 1, 2, 100)

### Backend Messages Not Localized

**Problem**: Backend log messages appear as keys like `"processing-file"`.

**Solutions**:

1. Check that the message key exists in `Jobs.content.ts` under the correct job name
2. Verify the nested structure: `jobs[jobName].logs[messageKey]`
3. Use `getLogMessage()` utility function to resolve the key
4. Check that context variables match what the backend sends

### IDE Autocomplete Not Working

**Problem**: No autocomplete suggestions for content fields.

**Solutions**:

1. Make sure you're using `satisfies Dictionary` in content file
2. Restart TypeScript server in IDE
3. Check that content file is properly imported
4. Verify the content key matches the file's `key` property

### Build Errors

**Problem**: Build fails with intlayer-related errors.

**Solutions**:

1. Check `intlayer.config.ts` for syntax errors
2. Verify all `.content.ts` files export default
3. Make sure no duplicate content keys exist
4. Run `npm run build:intlayer` to see detailed errors

### Spanish Characters Not Displaying

**Problem**: Accented characters (á, é, í, ó, ú, ñ) appear incorrectly.

**Solutions**:

1. Ensure files are saved with UTF-8 encoding
2. Check that HTML has `<meta charset="UTF-8">`
3. Verify database is configured for UTF-8 if storing translations

### Further Help

- [Intlayer Documentation](https://intlayer.org/doc)
- [Intlayer Discord Community](https://discord.gg/intlayer)
- Check existing `.content.ts` files in `src/localization/` for examples
- Review `frontend/src/util/JobLocalization.ts` for backend integration patterns
