import { mockOnboardingClient } from "../onboarding/OnboardingClient.mock";
import { mockAgentHubClient } from "./AgentHubClient.mock";
import { mockAuthClient } from "./AuthClient.mock";
import type { Client } from "./Client";
import { mockCollabConvoClient } from "./CollabConvoClient.mock";
import { mockDevToolsClient } from "./DevToolsClient.mock";
import { mockDocClient } from "./DocClient.mock";
import { mockDocDraftClient } from "./DocDraftClient.mock";
import { mockDocsiteClient } from "./DocsiteClient.mock";
import { createMockGitHubClient } from "./GitHubClient.mock";
import { mockImageClient } from "./ImageClient.mock";
import { mockIntegrationClient } from "./IntegrationClient.mock";
import { mockJobClient } from "./JobClient.mock";
import { mockOrgClient } from "./OrgClient.mock";
import { mockProfileClient } from "./ProfileClient.mock";
import { mockRoleClient } from "./RoleClient.mock";
import { mockSiteClient } from "./SiteClient.mock";
import { mockSourceClient } from "./SourceClient.mock";
import { mockSpaceClient } from "./SpaceClient.mock";
import { mockSyncChangesetClient } from "./SyncChangesetClient.mock";
import { mockTenantClient } from "./TenantClient.mock";
import { mockUserInfo } from "./UserInfo.mock";
import { mockUserManagementClient } from "./UserManagementClient.mock";

export function mockClient(partial?: Partial<Client>): Client {
	const authClient = mockAuthClient();
	const collabConvoClient = mockCollabConvoClient();
	const devToolsClient = mockDevToolsClient();
	const docClient = mockDocClient();
	const docDraftClient = mockDocDraftClient();
	const docsiteClient = mockDocsiteClient();
	const siteClient = mockSiteClient();
	const sourceClient = mockSourceClient();
	const imageClient = mockImageClient();
	const spaceClient = mockSpaceClient();
	const syncChangesetClient = mockSyncChangesetClient();
	const integrationClient = mockIntegrationClient();
	const githubClient = createMockGitHubClient();
	const jobClient = mockJobClient();
	const onboardingClient = mockOnboardingClient();
	const orgClient = mockOrgClient();
	const tenantClient = mockTenantClient();
	const userManagementClient = mockUserManagementClient();
	const roleClient = mockRoleClient();
	const profileClient = mockProfileClient();
	const agentHubClient = mockAgentHubClient();
	return {
		login: async () => ({ user: mockUserInfo(), favoritesHash: "EMPTY" }),
		logout: async () => void 0,
		status: async () => "ok",
		visit: async () => void 0,
		sync: async () => void 0,
		agentHub: () => agentHubClient,
		auth: () => authClient,
		collabConvos: () => collabConvoClient,
		devTools: () => devToolsClient,
		docs: () => docClient,
		docDrafts: () => docDraftClient,
		docsites: () => docsiteClient,
		sites: () => siteClient,
		sources: () => sourceClient,
		images: () => imageClient,
		spaces: () => spaceClient,
		syncChangesets: () => syncChangesetClient,
		integrations: () => integrationClient,
		github: () => githubClient,
		jobs: () => jobClient,
		onboarding: () => onboardingClient,
		orgs: () => orgClient,
		tenants: () => tenantClient,
		userManagement: () => userManagementClient,
		roles: () => roleClient,
		profile: () => profileClient,
		...partial,
	};
}
