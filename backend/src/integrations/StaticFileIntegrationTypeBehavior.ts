import type { Integration, NewIntegration } from "../model/Integration";
import type { IntegrationCheckResponse, IntegrationContext, IntegrationTypeBehavior } from "../types/IntegrationTypes";
import type { MutableFields, StaticFileIntegrationMetadata } from "jolli-common";

/**
 * Creates a behavior handler for static file integrations.
 * Static file integrations allow users to upload files directly,
 * which are stored in the docs table.
 */
export function createStaticFileIntegrationTypeBehavior(): IntegrationTypeBehavior {
	return {
		preCreate,
		handleAccessCheck,
	};

	/**
	 * Pre-create hook for static file integrations.
	 * Sets initial metadata with fileCount: 0.
	 */
	function preCreate(
		newIntegration: MutableFields<NewIntegration, "status" | "metadata">,
		_context: IntegrationContext,
	): Promise<boolean> {
		// Initialize metadata with default values
		const metadata: StaticFileIntegrationMetadata = {
			fileCount: 0,
			...(newIntegration.metadata as Partial<StaticFileIntegrationMetadata>),
		};
		newIntegration.metadata = metadata;
		newIntegration.status = "active";
		return Promise.resolve(true);
	}

	/**
	 * Access check for static file integrations.
	 * Static files are always accessible since they're stored locally.
	 */
	function handleAccessCheck(
		integration: Integration,
		_context: IntegrationContext,
	): Promise<IntegrationCheckResponse> {
		// Static file integrations are always accessible
		return Promise.resolve({
			result: {
				hasAccess: true,
				status: integration.status,
			},
		});
	}
}
