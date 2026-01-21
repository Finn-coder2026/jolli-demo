import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import {
	DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
	isTimestampValid,
	verifyBootstrapSignature,
} from "jolli-common/server";

const log = getLog(import.meta);

export interface AdminRouterOptions {
	registryClient: TenantRegistryClient;
	connectionManager: TenantOrgConnectionManager;
	bootstrapSecret: string;
	bootstrapTimestampToleranceMs?: number;
}

/**
 * Creates the admin router with internal endpoints for multi-tenant operations.
 * These endpoints are secured by HMAC-SHA256 signature and are NOT subject to TenantMiddleware.
 */
export function createAdminRouter(options: AdminRouterOptions): Router {
	const { registryClient, connectionManager, bootstrapSecret, bootstrapTimestampToleranceMs } = options;
	const toleranceMs = bootstrapTimestampToleranceMs ?? DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS;
	const router = express.Router();

	/**
	 * POST /api/admin/bootstrap
	 *
	 * Bootstraps the database schema for a tenant's org.
	 * This endpoint is called by the manager app during org provisioning,
	 * after temporarily granting the tenant user superuser privileges.
	 *
	 * Security: Requires HMAC-SHA256 signature via X-Bootstrap-Signature header,
	 * with timestamp validation via X-Bootstrap-Timestamp header.
	 *
	 * Request headers:
	 *   - X-Bootstrap-Signature: HMAC-SHA256 signature in format sha256=<hex>
	 *   - X-Bootstrap-Timestamp: ISO 8601 timestamp
	 *
	 * Request body:
	 *   - tenantId: string - The tenant ID
	 *   - orgId: string - The org ID
	 *
	 * Response:
	 *   - 200: { success: true, tenantId, orgId, schemaName }
	 *   - 400: { error: "tenantId and orgId required" }
	 *   - 401: { error: "invalid_request" }
	 *   - 404: { error: "Tenant not found: <id>" } or { error: "Org not found: <id>" }
	 *   - 500: { error: "Bootstrap failed", details: ... }
	 */
	router.post("/bootstrap", async (req, res) => {
		try {
			// 1. Extract auth headers
			const signature = req.headers["x-bootstrap-signature"] as string | undefined;
			const timestamp = req.headers["x-bootstrap-timestamp"] as string | undefined;

			// 2. Validate request body first (needed for signature verification)
			const { tenantId, orgId } = req.body as { tenantId?: string; orgId?: string };
			if (!tenantId || !orgId) {
				return res.status(400).json({ error: "tenantId and orgId required" });
			}

			// 3. Validate timestamp is within acceptable window
			if (!isTimestampValid(timestamp, toleranceMs)) {
				log.warn("Bootstrap request with invalid or expired timestamp");
				return res.status(401).json({ error: "invalid_request" });
			}

			// 4. Verify HMAC signature
			const signatureParams = {
				tenantId,
				orgId,
				timestamp: timestamp as string, // Already validated above
			};
			if (!verifyBootstrapSignature(signatureParams, signature, bootstrapSecret)) {
				log.warn("Bootstrap request with invalid signature");
				return res.status(401).json({ error: "invalid_request" });
			}

			log.info({ tenantId, orgId }, "Bootstrap request authenticated successfully");

			// 5. Look up tenant and org from registry
			const tenant = await registryClient.getTenant(tenantId);
			if (!tenant) {
				log.warn({ tenantId }, "Tenant not found for bootstrap");
				return res.status(404).json({ error: `Tenant not found: ${tenantId}` });
			}

			const org = await registryClient.getOrg(orgId);
			if (!org) {
				log.warn({ orgId }, "Org not found for bootstrap");
				return res.status(404).json({ error: `Org not found: ${orgId}` });
			}

			// Verify org belongs to tenant
			if (org.tenantId !== tenantId) {
				log.warn({ tenantId, orgId, orgTenantId: org.tenantId }, "Org does not belong to tenant");
				return res.status(400).json({ error: "Org does not belong to specified tenant" });
			}

			// 6. Get/create database connection with forceSync to create tables
			// This calls createDatabase() which:
			//   - Runs sequelize.sync({ alter: true }) to create/alter tables (forceSync overrides Vercel skip)
			//   - Runs postSync hooks for additional initialization
			log.info({ tenantId, orgId, schemaName: org.schemaName }, "Bootstrapping database schema");
			await connectionManager.getConnection(tenant, org, { forceSync: true });

			log.info({ tenantId, orgId, schemaName: org.schemaName }, "Bootstrap completed successfully");

			return res.json({
				success: true,
				tenantId,
				orgId,
				schemaName: org.schemaName,
			});
		} catch (error) {
			log.error(error, "Bootstrap failed");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Bootstrap failed", details: message });
		}
	});

	return router;
}
