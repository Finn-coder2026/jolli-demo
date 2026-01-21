/**
 * OrgRouter - Endpoints for org information in multi-tenant mode.
 *
 * Provides:
 * - GET /current - Returns current tenant and org context
 * - GET /list - Returns list of available orgs for the current tenant
 */

import { getTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import type { OrgSummary } from "jolli-common";

const log = getLog(import.meta);

/**
 * Response type for GET /current endpoint.
 */
export interface CurrentOrgResponse {
	tenant: {
		id: string;
		slug: string;
		displayName: string;
	};
	org: {
		id: string;
		slug: string;
		displayName: string;
		schemaName: string;
	};
	availableOrgs: Array<OrgSummary>;
}

/**
 * Response type for GET /list endpoint.
 */
export interface OrgListResponse {
	orgs: Array<OrgSummary>;
}

export interface OrgRouterDependencies {
	registryClient: TenantRegistryClient;
}

/**
 * Create the org router for multi-tenant mode.
 *
 * @param deps - Dependencies including the registry client
 * @returns Express router for org endpoints
 */
export function createOrgRouter(deps: OrgRouterDependencies): Router {
	const router = express.Router();
	const { registryClient } = deps;

	/**
	 * GET /current
	 *
	 * Returns the current tenant and org context along with available orgs.
	 * If not in multi-tenant mode, returns null values.
	 */
	router.get("/current", async (_req, res) => {
		const context = getTenantContext();

		if (!context) {
			// Not in multi-tenant mode
			res.json({
				tenant: null,
				org: null,
				availableOrgs: [],
			});
			return;
		}

		try {
			// Get available orgs for this tenant
			const availableOrgs = await registryClient.listOrgs(context.tenant.id);

			const response: CurrentOrgResponse = {
				tenant: {
					id: context.tenant.id,
					slug: context.tenant.slug,
					displayName: context.tenant.displayName,
				},
				org: {
					id: context.org.id,
					slug: context.org.slug,
					displayName: context.org.displayName,
					schemaName: context.org.schemaName,
				},
				availableOrgs,
			};

			res.json(response);
		} catch (error) {
			log.error("Error fetching org context: %s", error);
			res.status(500).json({ error: "Failed to fetch org context" });
		}
	});

	/**
	 * GET /list
	 *
	 * Returns the list of available orgs for the current tenant.
	 * Requires multi-tenant mode to be active.
	 */
	router.get("/list", async (_req, res) => {
		const context = getTenantContext();

		if (!context) {
			res.status(400).json({
				error: "Multi-tenant mode not active",
				orgs: [],
			});
			return;
		}

		try {
			const orgs = await registryClient.listOrgs(context.tenant.id);

			const response: OrgListResponse = { orgs };
			res.json(response);
		} catch (error) {
			log.error("Error listing orgs: %s", error);
			res.status(500).json({ error: "Failed to list orgs" });
		}
	});

	return router;
}
