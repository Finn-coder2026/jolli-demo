import type { Database } from "../core/Database";
import type { DaoProvider } from "../dao/DaoProvider";
import type { IntegrationDao } from "../dao/IntegrationDao";
import { mockIntegrationDao } from "../dao/IntegrationDao.mock";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import { mockIntegration } from "../model/Integration.mock";
import { createIntegrationManager } from "./IntegrationsManager";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("IntegrationsManager", () => {
	let mockDb: Database;
	let mockEventEmitter: JobEventEmitter;

	beforeEach(() => {
		mockDb = {
			integrationDao: mockIntegrationDao(),
		} as Database;
		mockEventEmitter = {
			emit: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
			removeAllListeners: vi.fn(),
		};
	});

	describe("getIntegrationTypes", () => {
		it("should return array of integration types", () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const types = manager.getIntegrationTypes();

			expect(types).toContain("github");
			expect(types).toContain("unknown");
			expect(types.length).toBeGreaterThan(0);
		});
	});

	describe("createIntegration", () => {
		it("should create integration without preCreate hook", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const newIntegration = {
				type: "unknown" as const,
				name: "test-integration",
				status: "active" as const,
				metadata: undefined,
			};
			const createdIntegration = { ...newIntegration, id: 1 };
			mockDb.integrationDao.createIntegration = vi.fn().mockResolvedValue(createdIntegration as never);

			const result = await manager.createIntegration(newIntegration as never);

			expect(result.result).toEqual(createdIntegration);
			expect(mockDb.integrationDao.createIntegration).toHaveBeenCalledWith(newIntegration);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith(
				"integrations:unknown:created",
				expect.objectContaining({ type: "unknown", name: "test-integration" }),
			);
		});

		it("should call preCreate hook and create when it returns true", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);

			const newIntegration = {
				type: "github" as const,
				name: "test-repo",
				status: "active" as const,
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			};
			const createdIntegration = mockIntegration({ ...newIntegration, id: 1 });
			mockDb.integrationDao.createIntegration = vi.fn().mockResolvedValue(createdIntegration);

			// Add preCreate hook to github behavior
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const preCreateSpy = vi.fn().mockResolvedValue(true);
			githubBehavior.preCreate = preCreateSpy;

			const result = await manager.createIntegration(newIntegration);

			expect(preCreateSpy).toHaveBeenCalled();
			expect(result.result).toEqual(createdIntegration);
			expect(mockDb.integrationDao.createIntegration).toHaveBeenCalled();
		});

		it("should return 403 error when preCreate hook returns false", async () => {
			const createSpy = vi.fn();
			mockDb.integrationDao.createIntegration = createSpy;

			const manager = createIntegrationManager(mockDb, mockEventEmitter);

			const newIntegration = {
				type: "github" as const,
				name: "test-repo",
				status: "active" as const,
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			};

			// Add preCreate hook to github behavior that returns false
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const preCreateSpy = vi.fn().mockResolvedValue(false);
			githubBehavior.preCreate = preCreateSpy;

			const result = await manager.createIntegration(newIntegration);

			expect(preCreateSpy).toHaveBeenCalled();
			expect(result.error).toEqual({
				statusCode: 403,
				error: "create integration not allowed.",
			});
			expect(createSpy).not.toHaveBeenCalled();
		});

		it("should return 400 error when creation fails", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const newIntegration = {
				type: "github" as const,
				name: "test-repo",
				status: "active" as const,
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			};
			mockDb.integrationDao.createIntegration = vi.fn().mockRejectedValue(new Error("Database error"));

			const result = await manager.createIntegration(newIntegration);

			expect(result.error).toEqual({
				statusCode: 400,
				error: "Failed to create integration.",
			});
		});
	});

	describe("getIntegration", () => {
		it("should get integration by id", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1 });
			mockDb.integrationDao.getIntegration = vi.fn().mockResolvedValue(integration);

			const result = await manager.getIntegration(1);

			expect(result).toEqual(integration);
			expect(mockDb.integrationDao.getIntegration).toHaveBeenCalledWith(1);
		});

		it("should return undefined when integration not found", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			mockDb.integrationDao.getIntegration = vi.fn().mockResolvedValue(undefined);

			const result = await manager.getIntegration(999);

			expect(result).toBeUndefined();
		});
	});

	describe("listIntegrations", () => {
		it("should list all integrations", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integrations = [mockIntegration({ id: 1 }), mockIntegration({ id: 2 })];
			mockDb.integrationDao.listIntegrations = vi.fn().mockResolvedValue(integrations);

			const result = await manager.listIntegrations();

			expect(result).toEqual(integrations);
			expect(mockDb.integrationDao.listIntegrations).toHaveBeenCalled();
		});
	});

	describe("countIntegrations", () => {
		it("should return integration count from DAO", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			mockDb.integrationDao.countIntegrations = vi.fn().mockResolvedValue(5);

			const result = await manager.countIntegrations();

			expect(result).toBe(5);
			expect(mockDb.integrationDao.countIntegrations).toHaveBeenCalled();
		});
	});

	describe("updateIntegration", () => {
		it("should update integration without hooks", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, name: "old-name" });
			const updatedIntegration = mockIntegration({ id: 1, name: "new-name" });
			mockDb.integrationDao.updateIntegration = vi.fn().mockResolvedValue(updatedIntegration);

			const result = await manager.updateIntegration(integration, { name: "new-name" });

			expect(result.result).toEqual(updatedIntegration);
			expect(mockDb.integrationDao.updateIntegration).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ name: "new-name", id: 1 }),
				undefined, // GitHub doesn't have preUpdateTransactional hook
			);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith(
				"integrations:github:updated",
				expect.objectContaining({ type: "github" }),
			);
		});

		it("should call preUpdateNonTransactional and skip update when it returns false", async () => {
			// We need to test the case where preUpdateNonTransactional returns false
			// We'll create a manager and spy on the behavior
			const updateSpy = vi.fn();
			mockDb.integrationDao.updateIntegration = updateSpy;

			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, name: "old-name", type: "github" });

			// Spy on the github behavior to add preUpdateNonTransactional
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const preUpdateNonTransactionalSpy = vi.fn().mockResolvedValue(false);
			githubBehavior.preUpdateNonTransactional = preUpdateNonTransactionalSpy;

			const result = await manager.updateIntegration(integration, { name: "new-name" });

			expect(preUpdateNonTransactionalSpy).toHaveBeenCalledWith(
				integration,
				expect.objectContaining({ manager }),
			);
			// When preUpdateNonTransactional returns false, the original integration is returned
			expect(result.result).toEqual(integration);
			expect(updateSpy).not.toHaveBeenCalled();
		});

		it("should call preUpdateTransactional hook when defined", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1 });
			const updatedIntegration = mockIntegration({ id: 1, name: "updated" });

			// Add preUpdateTransactional hook to github behavior
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const preUpdateTransactionalSpy = vi.fn().mockResolvedValue(true);
			githubBehavior.preUpdateTransactional = preUpdateTransactionalSpy;

			// Mock the DAO to actually call the preUpdate callback
			mockDb.integrationDao.updateIntegration = vi.fn().mockImplementation(async (_id, _update, preUpdate) => {
				if (preUpdate) {
					await preUpdate(integration);
				}
				return updatedIntegration;
			});

			const result = await manager.updateIntegration(integration, { name: "updated" });

			expect(result.result).toEqual(updatedIntegration);
			expect(preUpdateTransactionalSpy).toHaveBeenCalledWith(integration, expect.objectContaining({ manager }));
			expect(mockDb.integrationDao.updateIntegration).toHaveBeenCalledWith(
				1,
				expect.anything(),
				expect.any(Function),
			);
		});

		it("should call postUpdate hook after successful update", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1 });
			const updatedIntegration = mockIntegration({ id: 1, name: "updated" });
			mockDb.integrationDao.updateIntegration = vi.fn().mockResolvedValue(updatedIntegration);

			// Add postUpdate hook to github behavior
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const postUpdateSpy = vi.fn().mockResolvedValue(undefined);
			githubBehavior.postUpdate = postUpdateSpy;

			const result = await manager.updateIntegration(integration, { name: "updated" });

			expect(result.result).toEqual(updatedIntegration);
			expect(postUpdateSpy).toHaveBeenCalledWith(updatedIntegration, expect.objectContaining({ manager }));
			expect(mockDb.integrationDao.updateIntegration).toHaveBeenCalled();
		});

		it("should return 404 error when integration not found", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1 });
			mockDb.integrationDao.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const result = await manager.updateIntegration(integration, { name: "new-name" });

			expect(result.error).toEqual({
				statusCode: 404,
				error: "Integration not found",
			});
		});

		it("should return 400 error when update fails", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1 });
			mockDb.integrationDao.updateIntegration = vi.fn().mockRejectedValue(new Error("Database error"));

			const result = await manager.updateIntegration(integration, { name: "new-name" });

			expect(result.error).toEqual({
				statusCode: 400,
				error: "Failed to update integration",
			});
		});
	});

	describe("deleteIntegration", () => {
		it("should delete integration when preDelete returns true", async () => {
			// Note: GitHub integration has a preDelete hook that checks installations
			// For this test we'll mock the database to avoid GitHub API calls
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({
				id: 1,
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123 },
			});
			mockDb.integrationDao.deleteIntegration = vi.fn().mockResolvedValue(undefined);
			mockDb.integrationDao.listIntegrations = vi.fn().mockResolvedValue([integration]);

			const result = await manager.deleteIntegration(integration);

			expect(result.result).toEqual(integration);
			expect(mockDb.integrationDao.deleteIntegration).toHaveBeenCalledWith(1);
			expect(mockEventEmitter.emit).toHaveBeenCalledWith(
				"integrations:github:deleted",
				expect.objectContaining({ type: "github" }),
			);
		});

		it("should call postDelete hook after deletion", async () => {
			// GitHub integration doesn't have postDelete by default, so we'll add it via spy
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({
				id: 1,
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123 },
			});
			mockDb.integrationDao.deleteIntegration = vi.fn().mockResolvedValue(undefined);
			mockDb.integrationDao.listIntegrations = vi.fn().mockResolvedValue([integration]);

			// Add postDelete hook to the github behavior
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			const postDeleteSpy = vi.fn().mockResolvedValue(undefined);
			githubBehavior.postDelete = postDeleteSpy;

			const result = await manager.deleteIntegration(integration);

			expect(result.result).toEqual(integration);
			expect(postDeleteSpy).toHaveBeenCalledWith(integration, expect.objectContaining({ manager }));
		});

		it("should not delete when preDelete returns false", async () => {
			// Create a behavior with preDelete that returns false
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, type: "github" });
			const deleteIntegrationSpy = vi.fn().mockResolvedValue(undefined);
			mockDb.integrationDao.deleteIntegration = deleteIntegrationSpy;
			mockDb.integrationDao.listIntegrations = vi.fn().mockResolvedValue([integration]);

			// Add preDelete hook that returns false
			const githubBehavior = manager.getIntegrationTypeBehavior("github");
			githubBehavior.preDelete = vi.fn().mockResolvedValue(false);

			const result = await manager.deleteIntegration(integration);

			// preDelete returned false, so deletion doesn't happen
			expect(result.result).toEqual(integration);
			expect(deleteIntegrationSpy).not.toHaveBeenCalled();
		});

		it("should delete when preDelete is undefined", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, type: "unknown" });
			const deleteIntegrationSpy = vi.fn().mockResolvedValue(undefined);
			mockDb.integrationDao.deleteIntegration = deleteIntegrationSpy;

			const result = await manager.deleteIntegration(integration);

			// Unknown type doesn't have preDelete, so deletion happens by default
			expect(result.result).toEqual(integration);
			expect(deleteIntegrationSpy).toHaveBeenCalledWith(1);
		});

		it("should return 400 error when deletion fails", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({
				id: 1,
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123 },
			});
			mockDb.integrationDao.deleteIntegration = vi.fn().mockRejectedValue(new Error("Database error"));
			mockDb.integrationDao.listIntegrations = vi.fn().mockResolvedValue([integration]);

			const result = await manager.deleteIntegration(integration);

			expect(result.error).toEqual({
				statusCode: 400,
				error: "Failed to delete integration",
			});
		});
	});

	describe("handleAccessCheck", () => {
		it("should call behavior handleAccessCheck", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, type: "github" });

			const result = await manager.handleAccessCheck(integration);

			// GitHub handleAccessCheck returns result or error
			expect(result).toBeDefined();
		});

		it("should throw error for unknown integration type", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const integration = mockIntegration({ id: 1, type: "unknown" });

			await expect(manager.handleAccessCheck(integration)).rejects.toThrow("unknown integration type!");
		});
	});

	describe("integrationDaoProvider", () => {
		it("should use dao provider when provided", async () => {
			const providerDao = mockIntegrationDao();
			providerDao.createIntegration = vi.fn().mockResolvedValue(mockIntegration({ id: 99, type: "unknown" }));
			const daoProvider: DaoProvider<IntegrationDao> = { getDao: vi.fn().mockReturnValue(providerDao) };

			const manager = createIntegrationManager(mockDb, mockEventEmitter, undefined, daoProvider);
			await manager.createIntegration({ type: "unknown", name: "test", status: "active" } as never);

			expect(providerDao.createIntegration).toHaveBeenCalled();
			expect(daoProvider.getDao).toHaveBeenCalled();
		});
	});

	describe("integration event job handlers", () => {
		it("should return job definitions for integration events", () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const jobDefs = manager.getJobDefinitions();

			// Should have registered handlers for created/updated/deleted events for github
			const eventHandlers = jobDefs.filter(
				def =>
					def.name?.includes("handle-created") ||
					def.name?.includes("handle-updated") ||
					def.name?.includes("handle-deleted"),
			);
			expect(eventHandlers.length).toBeGreaterThan(0);
		});

		it("should handle integration event in job handler", async () => {
			const manager = createIntegrationManager(mockDb, mockEventEmitter);
			const jobDefs = manager.getJobDefinitions();

			// Look for any handler that handles integration events (not github-specific jobs)
			const integrationHandlers = jobDefs.filter(
				def => def.category?.startsWith("integration.") && def.name?.includes("handle-"),
			);

			expect(integrationHandlers.length).toBeGreaterThan(0);

			// Get the first integration event handler (e.g., handle-created for github)
			const jobDef = integrationHandlers[0];
			const integration = mockIntegration({
				id: 1,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			});

			const mockContext = {
				log: vi.fn(),
				jobId: "test-job-id",
				jobName: jobDef.name,
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			// Execute the handler
			await jobDef.handler(integration, mockContext);

			// Verify it logs for github integrations
			expect(mockContext.log).toHaveBeenCalledWith(
				"processing-event",
				expect.objectContaining({
					eventName: expect.stringMatching(/integrations:github:(created|updated|deleted)/),
				}),
				"info",
			);
		});
	});

	describe("integrationDaoProvider", () => {
		it("should use integrationDaoProvider when provided instead of db.integrationDao", async () => {
			const providerDao = mockIntegrationDao();
			const integrations = [mockIntegration({ id: 10 })];
			providerDao.listIntegrations = vi.fn().mockResolvedValue(integrations);

			// Spy on db.integrationDao to ensure it's NOT used
			const dbDaoSpy = vi.spyOn(mockDb.integrationDao, "listIntegrations");

			const daoProvider: DaoProvider<IntegrationDao> = {
				getDao: vi.fn().mockReturnValue(providerDao),
			};

			const manager = createIntegrationManager(mockDb, mockEventEmitter, undefined, daoProvider);
			const result = await manager.listIntegrations();

			expect(result).toEqual(integrations);
			expect(daoProvider.getDao).toHaveBeenCalled();
			expect(providerDao.listIntegrations).toHaveBeenCalled();
			// Ensure db.integrationDao was NOT used
			expect(dbDaoSpy).not.toHaveBeenCalled();
		});
	});
});
