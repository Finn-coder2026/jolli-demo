import type { TenantClient, TenantListResponse } from "./TenantClient";

export function mockTenantClient(partial?: Partial<TenantClient>): TenantClient {
	return {
		listTenants: async (): Promise<TenantListResponse> => ({
			useTenantSwitcher: false,
			currentTenantId: null,
			baseDomain: null,
			tenants: [],
		}),
		...partial,
	};
}
