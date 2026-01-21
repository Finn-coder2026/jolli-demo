import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import { createStaticFileIntegrationTypeBehavior } from "../integrations/StaticFileIntegrationTypeBehavior";
import type { Integration } from "../model/Integration";
import { mockIntegration } from "../model/Integration.mock";
import type { IntegrationTypeBehavior } from "../types/IntegrationTypes";
import type { StaticFileIntegrationMetadata } from "jolli-common";
import { beforeEach, describe, expect, it } from "vitest";

describe("StaticFileIntegrationTypeBehavior", () => {
	let mockManager: IntegrationsManager;
	let staticFileBehavior: IntegrationTypeBehavior;

	beforeEach(() => {
		mockManager = createMockIntegrationsManager();
		staticFileBehavior = createStaticFileIntegrationTypeBehavior();
	});

	describe("preCreate", () => {
		it("should initialize metadata with fileCount 0", async () => {
			const newIntegration = {
				name: "Test Static File",
				type: "static_file" as const,
				status: "active" as const,
				metadata: { fileCount: 0 } as StaticFileIntegrationMetadata,
			};

			const result = await staticFileBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(result).toBe(true);
			expect(newIntegration.status).toBe("active");
			expect(newIntegration.metadata).toEqual({ fileCount: 0 });
		});

		it("should preserve existing metadata fields while adding fileCount", async () => {
			const newIntegration = {
				name: "Test Static File",
				type: "static_file" as const,
				status: "active" as const,
				metadata: { fileCount: 5 } as StaticFileIntegrationMetadata,
			};

			const result = await staticFileBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(result).toBe(true);
			expect(newIntegration.status).toBe("active");
			expect((newIntegration.metadata as StaticFileIntegrationMetadata).fileCount).toBe(5);
		});

		it("should set status to active", async () => {
			const newIntegration = {
				name: "Test Static File",
				type: "static_file" as const,
				status: "needs_repo_access" as const,
				metadata: undefined,
			};

			await staticFileBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(newIntegration.status).toBe("active");
		});
	});

	describe("handleAccessCheck", () => {
		it("should return hasAccess true for active integration", async () => {
			const integration: Integration = mockIntegration({
				id: 1,
				type: "static_file",
				status: "active",
				metadata: { fileCount: 3 },
			});

			const response = await staticFileBehavior.handleAccessCheck(integration, { manager: mockManager });

			expect(response.result).toEqual({
				hasAccess: true,
				status: "active",
			});
			expect(response.error).toBeUndefined();
		});

		it("should return hasAccess true for pending_installation integration", async () => {
			const integration: Integration = mockIntegration({
				id: 2,
				type: "static_file",
				status: "pending_installation",
				metadata: { fileCount: 0 },
			});

			const response = await staticFileBehavior.handleAccessCheck(integration, { manager: mockManager });

			expect(response.result).toEqual({
				hasAccess: true,
				status: "pending_installation",
			});
		});

		it("should return hasAccess true for error status integration", async () => {
			const integration: Integration = mockIntegration({
				id: 3,
				type: "static_file",
				status: "error",
				metadata: { fileCount: 1 },
			});

			const response = await staticFileBehavior.handleAccessCheck(integration, { manager: mockManager });

			expect(response.result).toEqual({
				hasAccess: true,
				status: "error",
			});
		});
	});
});
