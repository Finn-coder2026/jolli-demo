/**
 * OrgRouter - Endpoints for org information in multi-tenant mode.
 *
 * Provides:
 * - GET /current - Returns current tenant and org context
 * - GET /list - Returns list of available orgs for the current tenant
 */

import { getGlobalManagerDatabase } from "../core/ManagerDatabase";
import type { DaoProvider } from "../dao/DaoProvider";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import { EMPTY_PREFERENCES_HASH } from "../model/UserPreference";
import { getTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import { getGlobalTokenUtil } from "../util/TokenUtil";
import express, { type Router } from "express";
import type { OrgSummary, UserInfo } from "jolli-common";

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
	/** Hash for favorites sync. "EMPTY" if user has no preferences. */
	favoritesHash: string;
}

/**
 * Response type for GET /list endpoint.
 */
export interface OrgListResponse {
	orgs: Array<OrgSummary>;
}

export interface OrgRouterDependencies {
	registryClient: TenantRegistryClient;
	userPreferenceDaoProvider: DaoProvider<UserPreferenceDao>;
}

/**
 * Create the org router for multi-tenant mode.
 *
 * @param deps - Dependencies including the registry client
 * @returns Express router for org endpoints
 */
export function createOrgRouter(deps: OrgRouterDependencies): Router {
	const router = express.Router();
	const { registryClient, userPreferenceDaoProvider } = deps;

	/**
	 * Get available orgs for user, filtered by user access via user_orgs table.
	 * Falls back to all orgs if user access filtering is not available.
	 */
	async function getAvailableOrgsForUser(
		userInfo: UserInfo | undefined,
		tenantId: string,
	): Promise<Array<OrgSummary>> {
		const managerDb = getGlobalManagerDatabase();

		if (managerDb && userInfo?.userId) {
			// Get orgs for this tenant only (filtering done in SQL for efficiency).
			// Note: schemaName and createdAt are not available from the user_orgs query.
			// This is safe because the OrgSwitcher UI only uses id, slug, displayName, and isDefault.
			const userOrgs = await managerDb.userOrgDao.getOrgsForTenant(userInfo.userId, tenantId);
			return userOrgs.map(uo => ({
				id: uo.orgId,
				tenantId,
				slug: uo.orgSlug,
				displayName: uo.orgName,
				schemaName: "",
				status: "active" as const,
				isDefault: uo.isDefault,
				createdAt: new Date(),
			}));
		}

		// Fallback: return all orgs (single-tenant mode or no user context)
		return registryClient.listOrgs(tenantId);
	}

	/**
	 * Get favorites hash for user.
	 * Returns EMPTY_PREFERENCES_HASH if no preferences or no user context.
	 */
	async function getFavoritesHash(userInfo: UserInfo | undefined, context: TenantOrgContext): Promise<string> {
		if (!userInfo?.userId) {
			return EMPTY_PREFERENCES_HASH;
		}

		try {
			const userPreferenceDao = userPreferenceDaoProvider.getDao(context);
			return await userPreferenceDao.getHash(userInfo.userId);
		} catch (error) {
			log.warn("Error fetching favorites hash for user %d: %s", userInfo.userId, error);
			return EMPTY_PREFERENCES_HASH;
		}
	}

	/**
	 * GET /current
	 *
	 * Returns the current tenant and org context along with available orgs.
	 * If not in multi-tenant mode, returns null values.
	 */
	router.get("/current", async (req, res) => {
		const context = getTenantContext();

		if (!context) {
			// Not in multi-tenant mode
			res.json({
				tenant: null,
				org: null,
				availableOrgs: [],
				favoritesHash: EMPTY_PREFERENCES_HASH,
			});
			return;
		}

		try {
			// Get available orgs for this tenant, filtered by user access
			const tokenUtil = getGlobalTokenUtil();
			const userInfo = tokenUtil?.decodePayload(req);
			const [availableOrgs, favoritesHash] = await Promise.all([
				getAvailableOrgsForUser(userInfo, context.tenant.id),
				getFavoritesHash(userInfo, context),
			]);

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
				favoritesHash,
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
	router.get("/list", async (req, res) => {
		const context = getTenantContext();

		if (!context) {
			res.status(400).json({
				error: "Multi-tenant mode not active",
				orgs: [],
			});
			return;
		}

		try {
			// Get orgs filtered by user access
			const tokenUtil = getGlobalTokenUtil();
			const userInfo = tokenUtil?.decodePayload(req);
			const orgs = await getAvailableOrgsForUser(userInfo, context.tenant.id);

			const response: OrgListResponse = { orgs };
			res.json(response);
		} catch (error) {
			log.error("Error listing orgs: %s", error);
			res.status(500).json({ error: "Failed to list orgs" });
		}
	});

	return router;
}
