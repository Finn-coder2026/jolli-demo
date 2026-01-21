/**
 * TenantClient - Client for tenant-related API calls.
 * Provides access to the tenant list for the tenant switcher feature.
 */

import type { ClientAuth } from "./Client";

/**
 * Item in the tenant list for the switcher.
 */
export interface TenantListItem {
	id: string;
	slug: string;
	displayName: string;
	primaryDomain: string | null;
}

/**
 * Response from GET /api/tenant/list
 */
export interface TenantListResponse {
	/** Whether the tenant switcher feature is enabled */
	useTenantSwitcher: boolean;
	/** Current tenant ID (null if not in multi-tenant mode) */
	currentTenantId: string | null;
	/** Base domain for constructing subdomain URLs */
	baseDomain: string | null;
	/** List of available tenants */
	tenants: Array<TenantListItem>;
}

export interface TenantClient {
	/**
	 * Get the list of available tenants for the tenant switcher.
	 */
	listTenants(): Promise<TenantListResponse>;
}

export function createTenantClient(baseUrl: string, auth: ClientAuth): TenantClient {
	async function listTenants(): Promise<TenantListResponse> {
		const response = await fetch(`${baseUrl}/api/tenant/list`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to list tenants: ${response.status}`);
		}
		return response.json() as Promise<TenantListResponse>;
	}

	return {
		listTenants,
	};
}
