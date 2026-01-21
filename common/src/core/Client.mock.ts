import { mockAuthClient } from "./AuthClient.mock";
import { mockChatClient } from "./ChatClient.mock";
import type { Client } from "./Client";
import { mockCollabConvoClient } from "./CollabConvoClient.mock";
import { mockConvoClient } from "./ConvoClient.mock";
import { mockDevToolsClient } from "./DevToolsClient.mock";
import { mockDocClient } from "./DocClient.mock";
import { mockDocDraftClient } from "./DocDraftClient.mock";
import { mockDocsiteClient } from "./DocsiteClient.mock";
import { createMockGitHubClient } from "./GitHubClient.mock";
import { mockImageClient } from "./ImageClient.mock";
import { mockIntegrationClient } from "./IntegrationClient.mock";
import { mockJobClient } from "./JobClient.mock";
import { mockOrgClient } from "./OrgClient.mock";
import { mockSiteClient } from "./SiteClient.mock";
import { mockSpaceClient } from "./SpaceClient.mock";
import { mockTenantClient } from "./TenantClient.mock";
import { mockUserInfo } from "./UserInfo.mock";

export function mockClient(partial?: Partial<Client>): Client {
	const authClient = mockAuthClient();
	const chatClient = mockChatClient();
	const collabConvoClient = mockCollabConvoClient();
	const convoClient = mockConvoClient();
	const devToolsClient = mockDevToolsClient();
	const docClient = mockDocClient();
	const docDraftClient = mockDocDraftClient();
	const docsiteClient = mockDocsiteClient();
	const siteClient = mockSiteClient();
	const imageClient = mockImageClient();
	const spaceClient = mockSpaceClient();
	const integrationClient = mockIntegrationClient();
	const githubClient = createMockGitHubClient();
	const jobClient = mockJobClient();
	const orgClient = mockOrgClient();
	const tenantClient = mockTenantClient();
	return {
		login: async () => mockUserInfo(),
		logout: async () => void 0,
		status: async () => "ok",
		visit: async () => void 0,
		sync: async () => void 0,
		auth: () => authClient,
		chat: () => chatClient,
		collabConvos: () => collabConvoClient,
		convos: () => convoClient,
		devTools: () => devToolsClient,
		docs: () => docClient,
		docDrafts: () => docDraftClient,
		docsites: () => docsiteClient,
		sites: () => siteClient,
		images: () => imageClient,
		spaces: () => spaceClient,
		integrations: () => integrationClient,
		github: () => githubClient,
		jobs: () => jobClient,
		orgs: () => orgClient,
		tenants: () => tenantClient,
		...partial,
	};
}
