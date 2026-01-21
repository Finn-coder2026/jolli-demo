import type { CurrentOrgResponse, OrgClient, OrgListResponse } from "./OrgClient";

export function mockOrgClient(partial?: Partial<OrgClient>): OrgClient {
	return {
		getCurrent: async (): Promise<CurrentOrgResponse> => ({
			tenant: null,
			org: null,
			availableOrgs: [],
		}),
		listOrgs: async (): Promise<OrgListResponse> => ({
			orgs: [],
		}),
		...partial,
	};
}
