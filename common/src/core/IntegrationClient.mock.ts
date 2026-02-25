import { mockIntegration } from "./Integration.mock";
import type { CheckAccessResponse, IntegrationClient, UploadFileResponse } from "./IntegrationClient";

export function mockIntegrationClient(partial?: Partial<IntegrationClient>): IntegrationClient {
	const integration = mockIntegration();
	return {
		createIntegration: async () => integration,
		listIntegrations: async () => [integration],
		getIntegration: async (id: number) => (integration.id === id ? integration : undefined),
		updateIntegration: async () => integration,
		deleteIntegration: async () => void 0,
		checkAccess: async (): Promise<CheckAccessResponse> => ({
			hasAccess: true,
			status: "active",
		}),
		hasAnyIntegrations: async () => true,
		uploadFile: async (): Promise<UploadFileResponse> => ({
			doc: {
				id: 1,
				jrn: "/static/test/file.md",
				content: "# Test",
				contentType: "text/markdown",
			},
			created: true,
		}),
		...partial,
	};
}
