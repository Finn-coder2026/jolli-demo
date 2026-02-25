import * as Config from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocsiteDao } from "../dao/DocsiteDao";
import { mockDocsiteDao } from "../dao/DocsiteDao.mock";
import type { IntegrationDao } from "../dao/IntegrationDao";
import { mockIntegrationDao } from "../dao/IntegrationDao.mock";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { AuthenticatedRequest, PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Docsite, Site } from "../model/Docsite";
import { createAuthHandler } from "../util/AuthHandler";
import * as DocGenerationUtil from "../util/DocGenerationUtil";
import * as IntegrationUtil from "../util/IntegrationUtil";
import { createTokenUtil } from "../util/TokenUtil";
import { createDocsiteRouter } from "./DocsiteRouter";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Response } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("DocsiteRouter", () => {
	let app: Express;
	let mockDao: DocsiteDao;
	let mockIntDao: IntegrationDao;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	const mockDocsite: Docsite = {
		id: 1,
		name: "test-docs",
		displayName: "Test Documentation",
		userId: 1,
		visibility: "internal",
		status: "active",
		metadata: {
			repos: [{ repo: "owner/repo", branch: "main", integrationId: 1 }],
			deployments: [
				{
					environment: "production",
					url: "https://test-docs.vercel.app",
					deploymentId: "dpl_123",
					deployedAt: "2024-01-01T00:00:00Z",
					status: "ready",
				},
			],
			framework: "docusaurus-2",
			buildCommand: "npm run build",
			outputDirectory: "build",
			lastBuildAt: "2024-01-01T00:00:00Z",
			lastDeployedAt: "2024-01-01T00:00:00Z",
		},
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockDao = mockDocsiteDao();
		mockIntDao = mockIntegrationDao();

		app = express();
		app.use(cookieParser());
		app.use(express.json());
		const mockIntegrationsManager = {} as unknown as IntegrationsManager;
		const mockPermissionMiddleware: PermissionMiddlewareFactory = {
			requireAuth: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requirePermission: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requireAllPermissions: vi.fn(
				() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next(),
			),
			requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			loadPermissions: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
		};
		app.use(
			"/docsites",
			createAuthHandler(tokenUtil),
			createDocsiteRouter(
				mockDaoProvider(mockDao),
				mockDaoProvider(mockIntDao),
				mockIntegrationsManager,
				mockPermissionMiddleware,
			),
		);

		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});
	});

	describe("GET /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/docsites");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should list all docsites", async () => {
			vi.mocked(mockDao.listDocsites).mockResolvedValue([mockDocsite]);

			const response = await request(app)
				.get("/docsites")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0]).toMatchObject({
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
			});
			expect(mockDao.listDocsites).toHaveBeenCalled();
		});

		it("should return empty array when no docsites", async () => {
			vi.mocked(mockDao.listDocsites).mockResolvedValue([]);

			const response = await request(app)
				.get("/docsites")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockDao.listDocsites).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.get("/docsites")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list docsites" });
		});
	});

	describe("GET /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/docsites/1");

			expect(response.status).toBe(401);
		});

		it("should get docsite by id", async () => {
			vi.mocked(mockDao.getDocsite).mockResolvedValue(mockDocsite);

			const response = await request(app)
				.get("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				name: "test-docs",
			});
			expect(mockDao.getDocsite).toHaveBeenCalledWith(1);
		});

		it("should return 404 when docsite not found", async () => {
			vi.mocked(mockDao.getDocsite).mockResolvedValue(undefined);

			const response = await request(app)
				.get("/docsites/999")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Docsite not found" });
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app)
				.get("/docsites/invalid")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockDao.getDocsite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.get("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get docsite" });
		});
	});

	describe("POST /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docsites").send({
				name: "test-docs",
				displayName: "Test Documentation",
			});

			expect(response.status).toBe(401);
		});

		it("should create a docsite", async () => {
			const newDocsite: Site = {
				name: "new-docs",
				displayName: "New Documentation",
				userId: 1,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
			};

			vi.mocked(mockDao.createDocsite).mockResolvedValue({ ...mockDocsite, ...newDocsite });

			const response = await request(app)
				.post("/docsites")
				.set("Cookie", [`authToken=${authToken}`])
				.send(newDocsite);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				name: "new-docs",
				displayName: "New Documentation",
			});
			expect(mockDao.createDocsite).toHaveBeenCalledWith(newDocsite);
		});

		it("should create a docsite with null userId in audit log", async () => {
			const newDocsite: Site = {
				name: "orphan-docs",
				displayName: "Orphan Documentation",
				userId: undefined,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
			};

			vi.mocked(mockDao.createDocsite).mockResolvedValue({ ...mockDocsite, ...newDocsite, id: 2 });

			const response = await request(app)
				.post("/docsites")
				.set("Cookie", [`authToken=${authToken}`])
				.send(newDocsite);

			expect(response.status).toBe(201);
		});

		it("should return 400 when name is missing", async () => {
			const response = await request(app)
				.post("/docsites")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					displayName: "Test Documentation",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name and displayName are required" });
		});

		it("should return 400 when displayName is missing", async () => {
			const response = await request(app)
				.post("/docsites")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					name: "test-docs",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name and displayName are required" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockDao.createDocsite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docsites")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					name: "test-docs",
					displayName: "Test Documentation",
				});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to create docsite" });
		});
	});

	describe("PUT /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).put("/docsites/1").send(mockDocsite);

			expect(response.status).toBe(401);
		});

		it("should update a docsite", async () => {
			const updatedDocsite = { ...mockDocsite, displayName: "Updated Documentation" };
			vi.mocked(mockDao.updateDocsite).mockResolvedValue(updatedDocsite);

			const response = await request(app)
				.put("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`])
				.send(updatedDocsite);

			expect(response.status).toBe(200);
			expect(response.body.displayName).toBe("Updated Documentation");
			// Dates are serialized as strings in JSON, so we need to compare with that format
			expect(mockDao.updateDocsite).toHaveBeenCalledWith({
				...updatedDocsite,
				createdAt: mockDocsite.createdAt.toISOString(),
				updatedAt: mockDocsite.updatedAt.toISOString(),
			});
		});

		it("should update a docsite with null userId in audit log", async () => {
			const updatedDocsite = { ...mockDocsite, displayName: "Updated Docs", userId: undefined };
			vi.mocked(mockDao.updateDocsite).mockResolvedValue(updatedDocsite);

			const response = await request(app)
				.put("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`])
				.send(updatedDocsite);

			expect(response.status).toBe(200);
		});

		it("should return 400 when id mismatch", async () => {
			const response = await request(app)
				.put("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`])
				.send({ ...mockDocsite, id: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "ID mismatch" });
		});

		it("should return 404 when docsite not found", async () => {
			vi.mocked(mockDao.updateDocsite).mockResolvedValue(undefined);

			const response = await request(app)
				.put("/docsites/999")
				.set("Cookie", [`authToken=${authToken}`])
				.send({ ...mockDocsite, id: 999 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Docsite not found" });
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app)
				.put("/docsites/invalid")
				.set("Cookie", [`authToken=${authToken}`])
				.send(mockDocsite);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockDao.updateDocsite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.put("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`])
				.send(mockDocsite);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update docsite" });
		});
	});

	describe("DELETE /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).delete("/docsites/1");

			expect(response.status).toBe(401);
		});

		it("should delete a docsite", async () => {
			vi.mocked(mockDao.getDocsite).mockResolvedValue(mockDocsite);
			vi.mocked(mockDao.deleteDocsite).mockResolvedValue();

			const response = await request(app)
				.delete("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(204);
			expect(mockDao.deleteDocsite).toHaveBeenCalledWith(1);
		});

		it("should delete a docsite with null userId in audit log", async () => {
			vi.mocked(mockDao.getDocsite).mockResolvedValue({ ...mockDocsite, userId: undefined });
			vi.mocked(mockDao.deleteDocsite).mockResolvedValue();

			const response = await request(app)
				.delete("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(204);
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app)
				.delete("/docsites/invalid")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockDao.deleteDocsite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.delete("/docsites/1")
				.set("Cookie", [`authToken=${authToken}`]);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete docsite" });
		});
	});

	describe("POST /generate", () => {
		const generateRequest = {
			integrationIds: [1],
			name: "generated-docs",
			displayName: "Generated Documentation",
			visibility: "external",
		};

		const mockIntegration = {
			id: 1,
			type: "github" as const,
			name: "test-integration",
			status: "active" as const,
			metadata: {
				repo: "owner/repo",
				branch: "main",
				features: [],
				githubAppId: 1,
				installationId: 12345,
			},
			createdAt: new Date(),
			updatedAt: new Date(),
			getApp: vi.fn(),
		};

		const mockDeployment: DocGenerationUtil.DeploymentResult = {
			url: "https://generated-docs.vercel.app",
			deploymentId: "dpl_abc123",
			status: "ready",
		};

		beforeEach(() => {
			// Mock getConfig to return a config with required fields
			vi.spyOn(Config, "getConfig").mockReturnValue({
				VERCEL_TOKEN: "test_vercel_token",
				AUTH_EMAILS: ".*", // Required for AuthHandler email authorization check
			} as ReturnType<typeof Config.getConfig>);

			// Mock IntegrationUtil functions
			vi.spyOn(IntegrationUtil, "lookupGithubRepoIntegration").mockResolvedValue(mockIntegration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("test_access_token");

			// Mock DocGenerationUtil functions
			vi.spyOn(DocGenerationUtil, "cloneRepository").mockResolvedValue(undefined);
			vi.spyOn(DocGenerationUtil, "generateDocusaurusFromCode").mockResolvedValue(undefined);
			vi.spyOn(DocGenerationUtil, "deployToVercel").mockResolvedValue(mockDeployment);
			vi.spyOn(DocGenerationUtil, "cleanupTempDirectory").mockResolvedValue(undefined);
		});

		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docsites/generate").send(generateRequest);

			expect(response.status).toBe(401);
		});

		it("should generate a docsite from single integration", async () => {
			vi.mocked(mockDao.createDocsite).mockResolvedValue({
				...mockDocsite,
				name: "generated-docs",
				displayName: "Generated Documentation",
			});

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				name: "generated-docs",
				displayName: "Generated Documentation",
			});

			// Verify all steps were called
			expect(IntegrationUtil.lookupGithubRepoIntegration).toHaveBeenCalledWith(mockIntDao, 1);
			expect(IntegrationUtil.getAccessTokenForGithubRepoIntegration).toHaveBeenCalledWith(mockIntegration);
			expect(DocGenerationUtil.cloneRepository).toHaveBeenCalledTimes(1);
			expect(DocGenerationUtil.generateDocusaurusFromCode).toHaveBeenCalled();
			expect(DocGenerationUtil.deployToVercel).toHaveBeenCalled();
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
			expect(mockDao.createDocsite).toHaveBeenCalled();
		});

		it("should generate a docsite from multiple integrations", async () => {
			const mockIntegration2 = {
				...mockIntegration,
				id: 2,
				metadata: {
					repo: "owner/repo2",
					branch: "develop",
					features: [],
					githubAppId: 1,
					installationId: 12345,
				},
			};

			vi.spyOn(IntegrationUtil, "lookupGithubRepoIntegration")
				.mockResolvedValueOnce(mockIntegration)
				.mockResolvedValueOnce(mockIntegration2);

			vi.mocked(mockDao.createDocsite).mockResolvedValue({
				...mockDocsite,
				name: "multi-repo-docs",
				displayName: "Multi Repo Documentation",
				metadata: {
					repos: [
						{ repo: "owner/repo", branch: "main", integrationId: 1 },
						{ repo: "owner/repo2", branch: "develop", integrationId: 2 },
					],
					deployments: mockDocsite.metadata?.deployments ?? [],
				},
			});

			const multiRepoRequest = {
				integrationIds: [1, 2],
				name: "multi-repo-docs",
				displayName: "Multi Repo Documentation",
				visibility: "external" as const,
			};

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(multiRepoRequest);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				name: "multi-repo-docs",
				displayName: "Multi Repo Documentation",
			});

			// Verify both integrations were looked up
			expect(IntegrationUtil.lookupGithubRepoIntegration).toHaveBeenCalledTimes(2);
			expect(IntegrationUtil.lookupGithubRepoIntegration).toHaveBeenCalledWith(mockIntDao, 1);
			expect(IntegrationUtil.lookupGithubRepoIntegration).toHaveBeenCalledWith(mockIntDao, 2);

			// Verify both repos were cloned
			expect(DocGenerationUtil.cloneRepository).toHaveBeenCalledTimes(2);

			// Verify remaining steps
			expect(DocGenerationUtil.generateDocusaurusFromCode).toHaveBeenCalled();
			expect(DocGenerationUtil.deployToVercel).toHaveBeenCalled();
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();

			// Verify docsite was created with both repos
			const createCall = vi.mocked(mockDao.createDocsite).mock.calls[0][0];
			expect(createCall.metadata?.repos).toHaveLength(2);
		});

		it("should return 400 when integrationIds is missing", async () => {
			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					name: "test",
					displayName: "Test",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				error: "integrationIds (array with at least one ID), name, and displayName are required",
			});
		});

		it("should return 400 when integrationIds is empty array", async () => {
			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					integrationIds: [],
					name: "test",
					displayName: "Test",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				error: "integrationIds (array with at least one ID), name, and displayName are required",
			});
		});

		it("should return 400 when name is missing", async () => {
			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					integrationIds: [1],
					displayName: "Test",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				error: "integrationIds (array with at least one ID), name, and displayName are required",
			});
		});

		it("should return 404 when integration not found", async () => {
			vi.spyOn(IntegrationUtil, "lookupGithubRepoIntegration").mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found: 1" });
		});

		it("should return 400 when access token fails", async () => {
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockRejectedValue(
				new Error("Token error"),
			);

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("Failed to get access token");
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
		});

		it("should cleanup and return 500 when clone fails", async () => {
			vi.spyOn(DocGenerationUtil, "cloneRepository").mockRejectedValue(new Error("Clone failed"));

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(500);
			expect(response.body.error).toContain("Failed to clone repository");
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
		});

		it("should cleanup and return 500 when documentation generation fails", async () => {
			vi.spyOn(DocGenerationUtil, "generateDocusaurusFromCode").mockRejectedValue(new Error("Generation failed"));

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(500);
			expect(response.body.error).toContain("Failed to generate documentation");
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
		});

		it("should return 500 when VERCEL_TOKEN not configured", async () => {
			// Mock getConfig to return undefined VERCEL_TOKEN
			vi.spyOn(Config, "getConfig").mockReturnValue({
				VERCEL_TOKEN: undefined,
				AUTH_EMAILS: ".*", // Required for AuthHandler email authorization check
			} as unknown as ReturnType<typeof Config.getConfig>);

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "VERCEL_TOKEN not configured" });
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
		});

		it("should cleanup and return 500 when deployment fails", async () => {
			vi.spyOn(DocGenerationUtil, "deployToVercel").mockRejectedValue(new Error("Deployment failed"));

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(500);
			expect(response.body.error).toContain("Failed to deploy to Vercel");
			expect(DocGenerationUtil.cleanupTempDirectory).toHaveBeenCalled();
		});

		it("should default visibility to internal when not provided", async () => {
			vi.mocked(mockDao.createDocsite).mockResolvedValue(mockDocsite);

			await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send({
					integrationIds: [1],
					name: "test",
					displayName: "Test",
				});

			expect(mockDao.createDocsite).toHaveBeenCalledWith(
				expect.objectContaining({
					visibility: "internal",
				}),
			);
		});

		it("should handle deployment with error status", async () => {
			const errorDeployment: DocGenerationUtil.DeploymentResult = {
				url: "https://error-docs.vercel.app",
				deploymentId: "dpl_error",
				status: "error",
				error: "Build failed",
			};
			vi.spyOn(DocGenerationUtil, "deployToVercel").mockResolvedValue(errorDeployment);
			vi.mocked(mockDao.createDocsite).mockResolvedValue(mockDocsite);

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(201);
			expect(mockDao.createDocsite).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "building", // Not "active" because deployment status is not "ready"
				}),
			);
		});

		it("should return 500 when docsite creation fails", async () => {
			vi.mocked(mockDao.createDocsite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docsites/generate")
				.set("Cookie", [`authToken=${authToken}`])
				.send(generateRequest);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to generate docsite" });
		});
	});
});
