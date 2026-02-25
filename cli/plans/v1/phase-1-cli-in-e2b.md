# Phase 1: CLI in E2B Sandbox

Package the Jolli CLI binary into the E2B sandbox template and enable non-interactive authentication via environment variables, so `jolli sync` and `jolli impact` can run inside sandboxes without human interaction.

## Existing State

- CLI is built with `bun build --compile` → `cli/dist/bin/jolli` (single binary)
- E2B Dockerfile (`sandbox/e2b.Dockerfile`) already copies `dist/` and symlinks tools
- CLI auth reads from `~/.jolli/config.json` via `cli/src/client/auth/config.ts`
- CLI config reads `JOLLI_URL` from env via `cli/src/shared/config.ts`
- Sandbox build orchestrated by `sandbox/Build.ts`

## Changes

### 1. Add CLI binary to E2B sandbox image

**File: `sandbox/e2b.Dockerfile`**

Add after the existing tool installations:

```dockerfile
# Install Jolli CLI
COPY cli/dist/bin/jolli /opt/jolli/bin/jolli
RUN chmod +x /opt/jolli/bin/jolli && \
    ln -sf /opt/jolli/bin/jolli /usr/local/bin/jolli
```

**File: `sandbox/Build.ts`** (or build scripts)

Ensure the CLI is built before the sandbox template build:
- The `dist/` directory that gets COPYed must include `cli/dist/bin/jolli`
- May need to update the sandbox dist preparation step to copy the CLI binary into the sandbox's `dist/` directory

### 2. Enable env-var authentication for CLI

The CLI currently reads auth from `~/.jolli/config.json`. Inside E2B, we need it to accept env vars.

**File: `cli/src/client/auth/config.ts`**

Modify `loadAuthToken()` and `loadSpace()` to check env vars first:

```typescript
export async function loadAuthToken(): Promise<string | undefined> {
  // Env var takes priority (for E2B sandbox / CI usage)
  const envToken = process.env.JOLLI_AUTH_TOKEN;
  if (envToken) {
    return envToken;
  }
  // Fall back to config file
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    const config: Config = JSON.parse(content);
    return config.authToken;
  } catch {
    return;
  }
}

export async function loadSpace(): Promise<string | undefined> {
  // Env var takes priority (for E2B sandbox / CI usage)
  const envSpace = process.env.JOLLI_SPACE;
  if (envSpace) {
    return envSpace;
  }
  // Fall back to config file
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    const config: Config = JSON.parse(content);
    return config.space;
  } catch {
    return;
  }
}
```

### 3. Service token generation for sandbox auth

The backend needs to generate a short-lived auth token that gets passed into the E2B sandbox as `JOLLI_AUTH_TOKEN`.

**File: `backend/src/util/TokenUtil.ts`** (or wherever tokens are generated)

Add a function to create a service token with limited scope:

```typescript
/**
 * Creates a short-lived service token for E2B sandbox operations.
 * Scoped to a specific space with sync read/write permissions.
 */
function createSandboxServiceToken(params: {
  spaceId: number;
  userId: number;  // system user or job owner
  ttlMs: number;   // e.g., 30 minutes
}): string
```

This token will be passed as an env var when creating the E2B sandbox.

### 4. Pass env vars to E2B sandbox

**File: `tools/jolliagent/src/workflows.ts`**

When creating the sandbox, pass the auth env vars. The existing `createE2BSandbox` function creates sandboxes via `Sandbox.create()`. The sandbox commands already support env vars (see `sandbox.commands.run(..., { envs: {...} })` pattern used throughout jolliagent tools).

For the CLI workflow, the env vars need to be set sandbox-wide or per `run` step:

```typescript
// These env vars will be available to all `run` steps in the sandbox
const sandboxEnvVars = {
  JOLLI_URL: config.jolliServerUrl,        // backend URL reachable from sandbox
  JOLLI_AUTH_TOKEN: serviceToken,           // generated service token
  JOLLI_SPACE: spaceSlug,                  // target space for sync
  GITHUB_TOKEN: githubAccessToken,          // for git clone
};
```

### 5. Network connectivity: Sandbox → Backend

E2B sandboxes run in the cloud. The `JOLLI_URL` must be a publicly reachable URL (not `localhost`). This is already handled for the existing jolliagent workflows — the backend URL comes from config.

**File: `backend/src/config/Config.ts`**

Ensure `JOLLI_PUBLIC_URL` (or similar) is available in the config schema for the URL that E2B sandboxes should use to reach the backend API.

## Files to Modify

| File | Change |
|------|--------|
| `sandbox/e2b.Dockerfile` | Add jolli CLI binary + symlink |
| `cli/src/client/auth/config.ts` | Check `JOLLI_AUTH_TOKEN` and `JOLLI_SPACE` env vars first |
| `backend/src/util/TokenUtil.ts` | Add `createSandboxServiceToken()` |
| `backend/src/config/Config.ts` | Add `JOLLI_PUBLIC_URL` to config schema (if not already present) |
| `tools/jolliagent/src/workflows.ts` | Pass auth env vars to sandbox for CLI workflow |

## Testing

- Build CLI binary, verify it runs inside a Docker container matching the E2B base image (Ubuntu 22.04 + Node 24)
- Test CLI with `JOLLI_AUTH_TOKEN` env var set (no config file) — should authenticate
- Test CLI with both env var and config file — env var should take priority
- Test `jolli sync` from inside a sandbox against a running backend
- Verify sandbox can reach the backend URL (network connectivity)

## Notes

- The CLI is compiled with `bun build --compile` which produces a statically-linked binary — no runtime dependencies needed in the sandbox
- `JOLLI_SPACE` can be the space slug or ID; the sync command's `loadSpace()` already handles this
- Service tokens should be short-lived (30 min max) to limit blast radius if a sandbox is compromised
- The existing `GITHUB_TOKEN` pattern in jolliagent tools is a good precedent for how env vars are passed to sandboxes
