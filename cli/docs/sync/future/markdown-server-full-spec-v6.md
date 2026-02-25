# Markdown Sync CLI - Switch to Consola (v6)

## Summary

Replace `pino` + `pino-pretty` with `consola` for CLI logging. The current pino-pretty transport doesn't work in Bun compiled binaries due to worker thread limitations.

| Item | Details |
|------|---------|
| Package | `consola` |
| Current | `pino` + `pino-pretty` |
| Affected File | `cli/src/shared/logger.ts` |
| Reason | pino-pretty transport fails in Bun compiled binaries |

## Prerequisites

- v5 spec implemented (or current working state)
- Bun build environment

---

## Background

When compiling the CLI with `bun build --compile`, the `pino-pretty` transport fails at runtime:

```
error: unable to determine transport target for "pino-pretty"
```

This happens because pino-pretty uses worker threads which can't resolve modules inside a compiled binary. A temporary fix was applied using a custom inline destination, but switching to `consola` provides a cleaner solution.

---

## Why Consola

1. **Works in Bun compiled binaries** - No worker threads or external transports
2. **Pretty output by default** - Colors, timestamps, log levels built-in
3. **Lightweight** - Smaller bundle than pino + pino-pretty
4. **Used by Nuxt** - Well-maintained and widely adopted
5. **Simple API** - Easier than pino for CLI use cases

---

## Implementation

### 1. Update Dependencies

```bash
cd cli
bun remove pino pino-pretty
bun add consola
```

Also remove `@types/pino` if present in devDependencies.

### 2. Rewrite Logger Module

Replace `cli/src/shared/logger.ts`:

```typescript
import { createConsola, type ConsolaInstance } from "consola";
import { getConfig } from "./config";

// =============================================================================
// Types
// =============================================================================

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export type Logger = ConsolaInstance;

// =============================================================================
// Log level mapping
// =============================================================================

const LEVEL_MAP: Record<LogLevel, number> = {
  fatal: 0,
  error: 0,
  warn: 1,
  info: 3,
  debug: 4,
  trace: 5,
};

// =============================================================================
// Module name extraction
// =============================================================================

function getModuleName(module: string | ImportMeta): string {
  const moduleUrl = typeof module === "string" ? module : module.url;
  const lastSlashIndex = moduleUrl.lastIndexOf("/");
  const fileNameWithExtension = lastSlashIndex >= 0
    ? moduleUrl.substring(lastSlashIndex + 1)
    : moduleUrl;
  const parts = fileNameWithExtension.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : fileNameWithExtension;
}

// =============================================================================
// Logger creation
// =============================================================================

let rootLogger: ConsolaInstance | undefined;

function getRootLogger(): ConsolaInstance {
  if (!rootLogger) {
    const config = getConfig();
    rootLogger = createConsola({
      level: LEVEL_MAP[config.LOG_LEVEL] ?? 3,
      formatOptions: {
        date: true,
        colors: true,
      },
    });
  }
  return rootLogger;
}

/**
 * Get a logger for the specified module.
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
  const moduleName = getModuleName(module);
  return getRootLogger().withTag(moduleName);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Log an error with proper formatting
 */
export function logError(logger: Logger, err: unknown, message: string): void {
  if (err instanceof Error) {
    logger.error(message, err);
  } else {
    logger.error(message, String(err));
  }
}

/**
 * Reset the logger (useful for testing)
 */
export function resetLogger(): void {
  rootLogger = undefined;
}

// =============================================================================
// Legacy exports
// =============================================================================

/**
 * @deprecated Use getLog(import.meta) instead
 */
export function createLogger(name: string): Logger {
  return getRootLogger().withTag(name);
}
```

### 3. Update Log Call Sites (if needed)

The API is mostly compatible. Main differences:

| pino | consola |
|------|---------|
| `logger.info("message")` | `logger.info("message")` (same) |
| `logger.info({ data }, "message")` | `logger.info("message", data)` |
| `logger.child({ key: "value" })` | `logger.withTag("tag")` |

If using printf-style logging with pino, consola supports template literals:

```typescript
// pino style (still works)
logger.info("User %s logged in", userId);

// consola style
logger.info(`User ${userId} logged in`);
```

### 4. Rebuild

```bash
cd cli
bun run build
```

---

## Testing

1. Run CLI commands and verify log output appears correctly:
   ```bash
   ./dist/bin/jolli auth login
   ./dist/bin/jolli sync
   ```

2. Verify log levels work:
   ```bash
   LOG_LEVEL=debug ./dist/bin/jolli sync
   ```

3. Run existing tests (if any use logger mocking, update accordingly)

---

## Rollback

If issues arise, revert to the current inline pino destination (without pino-pretty transport) which also works in compiled binaries.
