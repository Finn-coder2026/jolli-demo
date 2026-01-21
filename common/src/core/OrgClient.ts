/**
 * OrgClient - Client for org-related API calls in multi-tenant mode.
 */

import type { OrgSummary } from "../tenant/Org";
import type { ClientAuth } from "./Client";

/**
 * Response from GET /api/org/current
 */
export interface CurrentOrgResponse {
	tenant: {
		id: string;
		slug: string;
		displayName: string;
	} | null;
	org: {
		id: string;
		slug: string;
		displayName: string;
		schemaName: string;
	} | null;
	availableOrgs: Array<OrgSummary>;
}

/**
 * Response from GET /api/org/list
 */
export interface OrgListResponse {
	orgs: Array<OrgSummary>;
}

export interface OrgClient {
	/**
	 * Get the current tenant and org context.
	 * Returns null values if not in multi-tenant mode.
	 */
	getCurrent(): Promise<CurrentOrgResponse>;

	/**
	 * Get the list of available orgs for the current tenant.
	 */
	listOrgs(): Promise<OrgListResponse>;
}

export function createOrgClient(baseUrl: string, auth: ClientAuth): OrgClient {
	async function getCurrent(): Promise<CurrentOrgResponse> {
		const response = await fetch(`${baseUrl}/api/org/current`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to get current org: ${response.status}`);
		}
		return response.json() as Promise<CurrentOrgResponse>;
	}

	async function listOrgs(): Promise<OrgListResponse> {
		const response = await fetch(`${baseUrl}/api/org/list`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to list orgs: ${response.status}`);
		}
		return response.json() as Promise<OrgListResponse>;
	}

	return {
		getCurrent,
		listOrgs,
	};
}
