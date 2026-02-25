import { createTenantOrgContext, runWithTenantContext } from "../tenant/TenantContext";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import type { RequestHandler } from "express";
import type { UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";

const log = getLog(import.meta);

/**
 * ## E2B Sandbox → Server Sync: Production Flow
 *
 * When a GitHub webhook triggers a knowledge-graph or impact job, the server
 * spins up an E2B sandbox running the jolli CLI. The sandbox needs to push/pull
 * documents back to the server via `/api/v1/sync/`. Here's how auth and tenant
 * resolution work end-to-end:
 *
 * ### 1. Token creation (server-side, inside tenant context)
 *
 *   Job handler (KnowledgeGraphJobs) runs inside `runWithTenantContext()`.
 *   `resolveSandboxAuth()` calls `createSandboxServiceToken()` which signs a
 *   short-lived JWT (30 min) with claims: `{ tokenType: "sandbox-service",
 *   spaceSlug, tenantId, orgId, userId, email }`.
 *
 *   IMPORTANT: The token is signed with the **global** TOKEN_SECRET (via
 *   `getGlobalConfig()`), not the per-tenant derived secret — because the
 *   verification side (authHandler on the sync path) runs before tenant
 *   context is established.
 *
 * ### 2. URL resolution
 *
 *   `getWorkflowConfig()` resolves the sync server URL via `resolveSyncServerOrigin()`:
 *   - Priority 1: `JOLLI_PUBLIC_URL` (explicit override, e.g., ngrok for local dev)
 *   - Priority 2: Tenant subdomain (`https://acme.jolli.app`) derived from
 *     tenant context using `getTenantOrigin()`
 *   - Priority 3: `ORIGIN` fallback (e.g., `http://localhost:8034`)
 *
 * ### 3. Request arrives at /api/v1/sync/*
 *
 *   The nginx gateway routes `acme.jolli.app` → backend. Then the Express
 *   middleware chain processes the request:
 *
 *   ```
 *   shouldBypassTenantMiddleware("/v1/sync/push") → true
 *       ↓ (tenant middleware skipped)
 *   authHandler
 *       → verifies JWT signature using global TOKEN_SECRET
 *       → checks AUTH_EMAILS allowlist (sandbox token uses space owner's email)
 *       ↓
 *   SyncTenantMiddleware (multi-tenant only)
 *       → extracts tenantId/orgId from verified JWT claims
 *       → looks up tenant + org in registry, validates both are active
 *       → establishes tenant context via runWithTenantContext()
 *       ↓
 *   SyncSpaceScopeMiddleware
 *       → enforces sandbox-service token's spaceSlug matches X-Jolli-Space header
 *       ↓
 *   SyncRouter handler (push/pull/status)
 *       → runs within tenant context, DAOs resolve to correct tenant schema
 *   ```
 *
 * ### Security boundaries
 *
 *   - **JWT signature**: Prevents claim tampering (tenantId, orgId, spaceSlug)
 *   - **Tenant validation**: SyncTenantMiddleware verifies tenant+org exist and are active
 *   - **Space scoping**: SyncSpaceScopeMiddleware ensures token can only access its space
 *   - **Short TTL**: 30-minute token lifetime limits exposure window
 *   - **Global secret**: Sandbox tokens use global TOKEN_SECRET, so they cannot be used
 *     on regular tenant endpoints (which verify with per-tenant derived secrets)
 */

/**
 * Middleware for the sync router that enforces space scoping on sandbox-service tokens.
 *
 * - Regular user tokens: pass through (any space allowed).
 * - Sandbox-service tokens: the `spaceSlug` JWT claim must match the `X-Jolli-Space` header.
 *
 * This ensures that sandbox tokens issued for a specific space cannot be used to
 * push/pull documents for a different space.
 *
 * NOTE: The space owner's real email is used in the sandbox token, so AUTH_EMAILS
 * checks in authHandler will naturally pass because the owner is an authorized user.
 */
export function createSyncSpaceScopeMiddleware(tokenUtil: TokenUtil<UserInfo>): RequestHandler {
	return (req, res, next) => {
		// Extract the JWT token from the Authorization header or cookie
		const token = req.headers.authorization?.startsWith("Bearer ")
			? req.headers.authorization.slice(7)
			: req.cookies?.authToken;

		if (!token) {
			// No token means authHandler already rejected the request,
			// but be defensive and let the next middleware handle it
			return next();
		}

		// authHandler already verified this token upstream. In multi-tenant mode the
		// active TOKEN_SECRET can change after SyncTenantMiddleware establishes tenant
		// context, so signature re-verification here may fail. Fall back to jwt.decode
		// to read claims from the already-authenticated token.
		const payload =
			tokenUtil.decodePayloadFromToken(token) ??
			(() => {
				const decoded = jwt.decode(token);
				if (!decoded || typeof decoded === "string") {
					return;
				}
				return decoded as UserInfo;
			})();
		if (!payload) {
			return next();
		}

		// Check if this is a sandbox-service token
		const payloadWithTokenType = payload as UserInfo & { tokenType?: string; spaceSlug?: string };
		if (payloadWithTokenType.tokenType !== "sandbox-service") {
			// Regular user token — allow access to any space
			return next();
		}

		// Sandbox-service token — enforce space scoping
		const tokenSpaceSlug = payloadWithTokenType.spaceSlug;
		const requestedSpace = req.headers["x-jolli-space"] as string | undefined;

		if (!tokenSpaceSlug || !requestedSpace || tokenSpaceSlug !== requestedSpace) {
			log.warn({ tokenSpaceSlug, requestedSpace }, "Sandbox-service token not authorized for requested space");
			res.status(403).json({ error: "Token not authorized for this space" });
			return;
		}

		next();
	};
}

/**
 * Configuration for the sync tenant middleware.
 */
interface SyncTenantMiddlewareConfig {
	tokenUtil: TokenUtil<UserInfo>;
	registryClient: TenantRegistryClient;
	connectionManager: TenantOrgConnectionManager;
}

/**
 * Middleware that resolves tenant context from JWT for sync endpoints.
 *
 * In multi-tenant mode, normal tenant middleware is bypassed for /v1/sync/ paths
 * (because the CLI connects via ngrok/public URLs without tenant subdomains).
 * This middleware fills that gap by resolving the tenant directly from the JWT
 * token's tenantId/orgId claims — without any hostname validation.
 *
 * Must be mounted AFTER authHandler (which verifies the JWT signature).
 */
export function createSyncTenantMiddleware(config: SyncTenantMiddlewareConfig): RequestHandler {
	const { tokenUtil, registryClient, connectionManager } = config;

	return async (req, res, next) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.tenantId || !userInfo?.orgId) {
				// No tenant/org in token — single-tenant mode or user token without tenant.
				// Pass through; DAOs will use the default database.
				return next();
			}

			const { tenantId, orgId } = userInfo;

			const tenant = await registryClient.getTenant(tenantId);
			if (!tenant) {
				log.warn("Sync tenant resolution: tenant not found: %s", tenantId);
				res.status(401).json({ error: "Tenant not found" });
				return;
			}

			const org = await registryClient.getOrg(orgId);
			if (!org) {
				log.warn("Sync tenant resolution: org not found: %s", orgId);
				res.status(401).json({ error: "Org not found" });
				return;
			}

			if (org.tenantId !== tenant.id) {
				log.warn("Sync tenant resolution: org %s does not belong to tenant %s", orgId, tenantId);
				res.status(401).json({ error: "Org does not belong to tenant" });
				return;
			}

			if (tenant.status !== "active") {
				res.status(403).json({ error: `Tenant is not active: ${tenant.slug}` });
				return;
			}
			if (org.status !== "active") {
				res.status(403).json({ error: `Org is not active: ${org.slug}` });
				return;
			}

			const database = await connectionManager.getConnection(tenant, org);
			const context = createTenantOrgContext(tenant, org, database);
			log.debug(
				"Sync tenant context established: tenant=%s, org=%s, schema=%s",
				tenant.slug,
				org.slug,
				org.schemaName,
			);
			runWithTenantContext(context, () => next());
		} catch (error) {
			log.error(error, "Error in sync tenant middleware");
			res.status(500).json({ error: "Internal server error" });
		}
	};
}
