import type { Integration, NewIntegration } from "../model/Integration";
import type {
	CreateIntegrationResponse,
	DeleteIntegrationResponse,
	IntegrationCheckResponse,
	IntegrationTypeBehavior,
	UpdateIntegrationResponse,
} from "../types/IntegrationTypes";
import type { IntegrationsManager } from "./IntegrationsManager";
import type { IntegrationType } from "jolli-common";

function mockIntegrationTypeBehaviors(
	partial?: Partial<Record<IntegrationType, IntegrationTypeBehavior>>,
): Record<IntegrationType, IntegrationTypeBehavior> {
	const defaultBehavior: IntegrationTypeBehavior = {
		handleAccessCheck: async () => ({
			result: { hasAccess: true, status: "active" },
		}),
	};

	return {
		unknown: defaultBehavior,
		github: defaultBehavior,
		static_file: defaultBehavior,
		...partial,
	};
}

/**
 * Creates a mock IntegrationsManager for testing.
 * Functions are intentionally async to match the interface, even though they don't use await.
 */
export function createMockIntegrationsManager(): IntegrationsManager {
	const integrationTypes: Record<IntegrationType, IntegrationTypeBehavior> = mockIntegrationTypeBehaviors();
	return {
		getIntegrationTypes(): Array<IntegrationType> {
			return Object.keys(integrationTypes) as Array<IntegrationType>;
		},

		getIntegrationTypeBehavior(type: IntegrationType): IntegrationTypeBehavior {
			return integrationTypes[type];
		},

		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		createIntegration: async (integration: NewIntegration): Promise<CreateIntegrationResponse> => {
			return {
				result: {
					id: 1,
					...integration,
				} as Integration,
			};
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		getIntegration: async (_id: number): Promise<Integration | undefined> => {
			return;
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		listIntegrations: async (): Promise<Array<Integration>> => {
			return [];
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		countIntegrations: async (): Promise<number> => {
			return 0;
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		updateIntegration: async (
			integration: Integration,
			update: Partial<Integration>,
		): Promise<UpdateIntegrationResponse> => {
			return {
				result: {
					...integration,
					...update,
				},
			};
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		deleteIntegration: async (integration: Integration): Promise<DeleteIntegrationResponse> => {
			return {
				result: integration,
			};
		},
		// biome-ignore lint/suspicious/useAwait: Mock must match async interface
		handleAccessCheck: async (_integration: Integration): Promise<IntegrationCheckResponse> => {
			return { result: { hasAccess: true, status: "active" } };
		},
		getJobDefinitions() {
			return [];
		},
	};
}
