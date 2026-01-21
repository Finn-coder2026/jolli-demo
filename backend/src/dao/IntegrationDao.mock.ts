import { mockIntegration } from "../model/Integration.mock";
import type { IntegrationDao } from "./IntegrationDao";

export function mockIntegrationDao(partial?: Partial<IntegrationDao>): IntegrationDao {
	return {
		createIntegration: async integration => mockIntegration(integration),
		getIntegration: async () => void 0,
		listIntegrations: async () => [],
		updateIntegration: async () => void 0,
		deleteIntegration: async () => void 0,
		removeAllGitHubIntegrations: async () => void 0,
		removeDuplicateGitHubIntegrations: async () => 0,
		getGitHubRepoIntegration: () => void 0,
		lookupIntegration: async () => void 0,
		...partial,
	};
}
