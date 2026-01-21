import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import type { NewIntegration } from "../model/Integration";
import { mockIntegration } from "../model/Integration.mock";
import { createAuthHandler } from "../util/AuthHandler";
import { createTokenUtil } from "../util/TokenUtil";
import { createIntegrationRouter } from "./IntegrationRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { jrnParser, type UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to generate expected JRN for static file uploads */
function expectedJrn(integrationName: string, filename: string): string {
	return jrnParser.article(`${integrationName}-${filename}`);
}

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("IntegrationRouter", () => {
	let app: Express;
	let mockManager: IntegrationsManager;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	// Test RSA private key (same as in GithubUtils.test.ts)
	const _testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC2tE+niyzoQ2ja
mVrYZBzKnB5hN/gI44lKTrdyY71y8ks+XC4fV7sWxy0Q1DtLmoo5j74sYDIGFE0x
2JDmkYEW6wuazDEiUAs0PIftqYsi6lB9WhLOINZ4o6tYOwM2laJR6s6cMCZog3PR
QghocV06PkQPnNdEbhOhBi456+tJ1W2jAxyTVgc71C3YMaa/qhLdiT8ymL7Yy1oL
oHcUGiMF791LleLD36VTENUAW+w7fjLXAMy7101FnyIdnKrudXoOgVGcK0J8cMrs
mgTqVxTodPUcnw1hoqx7GyZKpcG0tQRxiPnsmPXGPh2PfmhSe+hyTzaPdXnSq8Vt
Tata4zwvAgMBAAECggEAHE8pXcyIKMpJH5X40uQFkgn0AHGrp7TvO5RMLcKb7Yjy
ymF+GV0pSrOR8rRFJnHLo8pMrT46ggv4lMCkXcAt6wnVwnvhIRqbTHy/Pb6yJbbT
bJjdpmga00EzoM2EB0Z9it6Bz7GmQeDHEVAp/Vo+F8g4w4ffKGXl+g1QcakcdqlX
uRvWh3TG9bSKktkR1GZYyfZEJ9ZxKsYkL1pdkXnjGy3lNeI7pB4RUYr1bYXGoAGm
xNK4GDnAZeB6CpAfpb0eTrApKRAFUlu1/zJ6Z2DTuHfnM+2sTCcNcW/43ffc+o6W
2f+BJRDx6rhNpwDTrr8cpK7emopux4Z9MRBAHXsAAQKBgQD2uZwVC30pycunevH1
c6ouRQcshPWjUMTB+bochnmPvGiBzB+Og5k0I/nIe5CyjrFPvJ2Iv+qByT6DKuBQ
0WFf+/pz3/LIyWGe+L1QrpCz/RUhKhGDNOklvkmR/BUICpW0gufqfJggNmzoWO2f
uAdsNmbKwZ7PaihkTLEdBa62LwKBgQC9kpcJ3iZ8GwVKewF0/a0BftnrMlhCOS+g
8JeByLvBAhvI2Rb2gtqbi/T9pkJhmLFJqZxaBwnBAgCfegJHi65aUALE5c3k7v/m
+MH5f2QU/NRF71ZocrDQVrLu2KGGYGs+PJYoVKgNmpWz4tbVYx/C3GykCZO92szw
796LB1haAQKBgQCy70YdlSl/JxUGMApPA0XHLNTZGsyzVx57t8ucaIK9Fd2NVScF
yrdPs0+ycLsuZIJ/28E8rkM7QWKO6oeo1VGTtUGczCxeJn8gNjHG0/OqNcAfP01Y
JQV6FBlzQKlYHaUZN19PFnGV2yL9F5Gupl7rwkCmh+nPb6Q/qcdBzx84jQKBgQCW
6berd1oTuj8AB+QlCj1Lz3wTrERuk6/C40T5YJ93CwKrZYbOP2VgJo6lzlFR+IhK
J+f8E1ZEfB+a1TozUpM9+iv6Kyc5dLnrWWSyBiPaQVuLQPj8tTDk6eAQHAyaOO+m
3/x5pssR6Vn7lj2IKh0Ctw8VlzoyDZjQxWPYMcS4AQKBgA0+XNZQ9xrBEtWqpvlA
b8z4GOt2n2W2HI7A7kEs5CZNVHBbFaRKstFNDf7BNPD2P4B1mmYz02hYv1YNnyOT
hnoF5lXcuec68+t5WjjuZ7IXb9gF6MnuiHDSFzfFHb39+l4XrLv8QRCFqge8BBbl
CsPGsHjRQP31pfVTFrZp5ywg
-----END PRIVATE KEY-----`;

	beforeEach(() => {
		global.fetch = vi.fn();
		mockManager = createMockIntegrationsManager();

		const mockDocDao = {
			readDoc: vi.fn(),
			createDoc: vi.fn(),
			updateDoc: vi.fn(),
		} as unknown as DocDao;

		app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use(
			"/integrations",
			createAuthHandler(tokenUtil),
			createIntegrationRouter({
				manager: mockManager,
				docDaoProvider: mockDaoProvider(mockDocDao),
			}),
		);

		// Generate valid auth token for tests
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});
	});

	describe("POST /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/integrations").send({
				type: "github",
				name: "test-repo",
			});

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should create an integration and return 201", async () => {
			const newIntegration: NewIntegration = {
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
				},
			};

			const createdIntegration = mockIntegration({ ...newIntegration, id: 1 });
			mockManager.createIntegration = vi.fn().mockResolvedValue({ result: createdIntegration });

			const response = await request(app)
				.post("/integrations")
				.set("Cookie", `authToken=${authToken}`)
				.send(newIntegration);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				id: 1,
				type: "github",
				name: "test-repo",
			});
			expect(mockManager.createIntegration).toHaveBeenCalledWith(newIntegration);
		});

		it("should return 400 on creation error", async () => {
			mockManager.createIntegration = vi.fn().mockResolvedValue({
				error: { statusCode: 400, error: "Failed to create integration." },
			});

			const response = await request(app).post("/integrations").set("Cookie", `authToken=${authToken}`).send({
				type: "github",
				name: "test-repo",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to create integration." });
		});

		it("should return 403 when creation is not allowed", async () => {
			const newIntegration: NewIntegration = {
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
				},
			};

			mockManager.createIntegration = vi.fn().mockResolvedValue({
				error: { statusCode: 403, error: "create integration not allowed." },
			});

			const response = await request(app)
				.post("/integrations")
				.set("Cookie", `authToken=${authToken}`)
				.send(newIntegration);

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "create integration not allowed." });
			expect(mockManager.createIntegration).toHaveBeenCalledWith(newIntegration);
		});
	});

	describe("GET /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/integrations");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return all integrations", async () => {
			const integrations = [mockIntegration({ id: 1, name: "repo1" }), mockIntegration({ id: 2, name: "repo2" })];
			mockManager.listIntegrations = vi.fn().mockResolvedValue(integrations);

			const response = await request(app).get("/integrations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0]).toMatchObject({ id: 1, name: "repo1" });
			expect(response.body[1]).toMatchObject({ id: 2, name: "repo2" });
			expect(mockManager.listIntegrations).toHaveBeenCalled();
		});

		it("should return empty array when no integrations exist", async () => {
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app).get("/integrations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});
	});

	describe("GET /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/integrations/1");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return integration when found", async () => {
			const integration = mockIntegration({ id: 1, name: "test-repo" });
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);

			const response = await request(app).get("/integrations/1").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				name: "test-repo",
			});
			expect(mockManager.getIntegration).toHaveBeenCalledWith(1);
		});

		it("should return 404 when integration not found", async () => {
			mockManager.getIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/integrations/999").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when id is invalid", async () => {
			const response = await request(app).get("/integrations/invalid").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid integration ID" });
		});
	});

	describe("PUT /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).put("/integrations/1").send({
				name: "updated-repo",
			});

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should update integration and return 200", async () => {
			const updateData = {
				name: "updated-repo",
			};
			const existingIntegration = mockIntegration({ id: 1 });
			const updatedIntegration = mockIntegration({ id: 1, ...updateData });
			mockManager.getIntegration = vi.fn().mockResolvedValue(existingIntegration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({ result: updatedIntegration });

			const response = await request(app)
				.put("/integrations/1")
				.set("Cookie", `authToken=${authToken}`)
				.send(updateData);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				name: "updated-repo",
			});
			expect(mockManager.updateIntegration).toHaveBeenCalledWith(existingIntegration, updateData);
		});

		it("should return 404 when integration not found", async () => {
			mockManager.getIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).put("/integrations/999").set("Cookie", `authToken=${authToken}`).send({
				name: "updated-repo",
			});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when id is invalid", async () => {
			const response = await request(app)
				.put("/integrations/invalid")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					name: "updated-repo",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid integration ID" });
		});

		it("should return 400 on update error", async () => {
			const existingIntegration = mockIntegration({ id: 1 });
			mockManager.getIntegration = vi.fn().mockResolvedValue(existingIntegration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({
				error: { statusCode: 400, error: "Failed to update integration" },
			});

			const response = await request(app).put("/integrations/1").set("Cookie", `authToken=${authToken}`).send({
				name: "updated-repo",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update integration" });
		});

		it("should return 404 when update returns not found error", async () => {
			const existingIntegration = mockIntegration({ id: 1 });
			mockManager.getIntegration = vi.fn().mockResolvedValue(existingIntegration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({
				error: { statusCode: 404, error: "Integration not found" },
			});

			const response = await request(app)
				.put("/integrations/1")
				.set("Cookie", `authToken=${authToken}`)
				.send({ name: "updated-name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when updateIntegration throws an exception", async () => {
			const existingIntegration = mockIntegration({ id: 1 });
			mockManager.getIntegration = vi.fn().mockResolvedValue(existingIntegration);
			mockManager.updateIntegration = vi.fn().mockRejectedValue(new Error("Unexpected error"));

			const response = await request(app)
				.put("/integrations/1")
				.set("Cookie", `authToken=${authToken}`)
				.send({ name: "updated-name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update integration" });
		});
	});

	describe("DELETE /:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).delete("/integrations/1");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should delete an integration and return 204", async () => {
			const integration = mockIntegration({ id: 1 });
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.deleteIntegration = vi.fn().mockResolvedValue({ result: integration });

			const response = await request(app).delete("/integrations/1").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(mockManager.deleteIntegration).toHaveBeenCalledWith(integration);
		});

		it("should return 404 when integration not found", async () => {
			mockManager.getIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).delete("/integrations/999").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when id is invalid", async () => {
			const response = await request(app).delete("/integrations/invalid").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid integration ID" });
		});

		it("should return 400 on deletion error", async () => {
			const integration = mockIntegration({ id: 1 });
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.deleteIntegration = vi.fn().mockResolvedValue({
				error: { statusCode: 400, error: "Failed to delete integration" },
			});

			const response = await request(app).delete("/integrations/1").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to delete integration" });
		});

		it("should return 400 when getIntegration fails", async () => {
			mockManager.getIntegration = vi.fn().mockRejectedValue(new Error("Database connection failed"));

			const response = await request(app).delete("/integrations/1").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Unable to delete integration." });
		});
	});

	describe("POST /:id/check-access", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/integrations/1/check-access");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return 400 when id is invalid", async () => {
			const response = await request(app)
				.post("/integrations/invalid/check-access")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid integration ID" });
		});

		it("should return 404 when integration not found", async () => {
			mockManager.getIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/integrations/999/check-access")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 500 when an unexpected error occurs during check-access", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push"],
					githubAppId: 12345,
				},
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.handleAccessCheck = vi.fn().mockRejectedValue(new Error("Database connection failed"));

			const response = await request(app)
				.post("/integrations/1/check-access")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check access" });
		});

		it("should return error response when access check returns error", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push"],
					githubAppId: 12345,
				},
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.handleAccessCheck = vi.fn().mockResolvedValue({
				error: {
					code: 400,
					reason: "Test error",
				},
			});

			const response = await request(app)
				.post("/integrations/1/check-access")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Test error" });
		});

		it("should return success response when access check succeeds", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push"],
					githubAppId: 12345,
				},
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.handleAccessCheck = vi.fn().mockResolvedValue({
				result: {
					hasAccess: true,
					status: "active",
				},
			});

			const response = await request(app)
				.post("/integrations/1/check-access")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasAccess: true, status: "active" });
		});
	});

	describe("POST /:id/upload", () => {
		let mockDocDao: {
			readDoc: ReturnType<typeof vi.fn>;
			createDoc: ReturnType<typeof vi.fn>;
			updateDoc: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockDocDao = {
				readDoc: vi.fn(),
				createDoc: vi.fn(),
				updateDoc: vi.fn(),
			};

			// Recreate the app with our controllable mocks
			app = express();
			app.use(cookieParser());
			app.use(express.json());
			app.use(
				"/integrations",
				createAuthHandler(tokenUtil),
				createIntegrationRouter({
					manager: mockManager,
					docDaoProvider: mockDaoProvider(mockDocDao as unknown as DocDao),
				}),
			);
		});

		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/integrations/1/upload").send({
				filename: "test.md",
				content: "# Test",
			});

			expect(response.status).toBe(401);
		});

		it("should return 404 when integration not found", async () => {
			mockManager.getIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/integrations/999/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Test",
				});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when integration is not static_file type", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Test",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "File upload is only supported for static file integrations" });
		});

		it("should return 400 when filename is missing", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 0 },
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					content: "# Test",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Filename is required" });
		});

		it("should return 400 when content is missing", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 0 },
			});
			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Content is required" });
		});

		it("should create a new doc when uploading to a static_file integration", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 0 },
			});
			const jrn = expectedJrn("test-source", "test.md");
			const createdDoc = {
				id: 100,
				jrn,
				content: "# Test Content",
				contentType: "text/markdown",
			};

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({ result: integration });
			mockDocDao.readDoc.mockResolvedValue(null);
			mockDocDao.createDoc.mockResolvedValue(createdDoc);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Test Content",
				});

			expect(response.status).toBe(201);
			expect(response.body).toEqual({ doc: createdDoc, created: true });
			expect(mockDocDao.readDoc).toHaveBeenCalledWith(jrn);
			expect(mockDocDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					jrn,
					content: "# Test Content",
					contentType: "text/markdown",
					source: { integrationId: 1, type: "static_file" },
				}),
			);
			expect(mockManager.updateIntegration).toHaveBeenCalledWith(
				integration,
				expect.objectContaining({
					metadata: expect.objectContaining({ fileCount: 1 }),
				}),
			);
		});

		it("should update an existing doc when re-uploading to a static_file integration", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 1 },
			});
			const jrn = expectedJrn("test-source", "test.md");
			const existingDoc = {
				id: 100,
				jrn,
				content: "# Old Content",
				contentType: "text/markdown",
				contentMetadata: {},
				version: 1,
			};
			const updatedDoc = {
				...existingDoc,
				content: "# Updated Content",
				version: 2,
			};

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockDocDao.readDoc.mockResolvedValue(existingDoc);
			mockDocDao.updateDoc.mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Updated Content",
				});

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ doc: updatedDoc, created: false });
			expect(mockDocDao.readDoc).toHaveBeenCalledWith(jrn);
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "# Updated Content",
					updatedBy: "static-file-upload",
					version: 2, // Version should be incremented
				}),
			);
		});

		it("should return 500 when updateDoc fails", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 1 },
			});
			const jrn = expectedJrn("test-source", "test.md");
			const existingDoc = {
				id: 100,
				jrn,
				content: "# Old Content",
				contentType: "text/markdown",
				contentMetadata: {},
				version: 1,
			};

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockDocDao.readDoc.mockResolvedValue(existingDoc);
			mockDocDao.updateDoc.mockResolvedValue(null);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Updated Content",
				});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update document" });
		});

		it("should return 500 when an unexpected error occurs during upload", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 0 },
			});

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockDocDao.readDoc.mockRejectedValue(new Error("Database connection failed"));

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Test",
				});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to upload file" });
		});

		it("should use provided contentType when specified", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: { fileCount: 0 },
			});
			const jrn = expectedJrn("test-source", "data.json");
			const createdDoc = {
				id: 100,
				jrn,
				content: '{"key": "value"}',
				contentType: "application/json",
			};

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({ result: integration });
			mockDocDao.readDoc.mockResolvedValue(null);
			mockDocDao.createDoc.mockResolvedValue(createdDoc);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "data.json",
					content: '{"key": "value"}',
					contentType: "application/json",
				});

			expect(response.status).toBe(201);
			expect(mockDocDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					contentType: "application/json",
				}),
			);
		});

		it("should handle integration with undefined metadata", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "static_file",
				name: "test-source",
				metadata: undefined,
			});
			const jrn = expectedJrn("test-source", "test.md");
			const createdDoc = {
				id: 100,
				jrn,
				content: "# Test",
				contentType: "text/markdown",
			};

			mockManager.getIntegration = vi.fn().mockResolvedValue(integration);
			mockManager.updateIntegration = vi.fn().mockResolvedValue({ result: integration });
			mockDocDao.readDoc.mockResolvedValue(null);
			mockDocDao.createDoc.mockResolvedValue(createdDoc);

			const response = await request(app)
				.post("/integrations/1/upload")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					filename: "test.md",
					content: "# Test",
				});

			expect(response.status).toBe(201);
			expect(mockManager.updateIntegration).toHaveBeenCalledWith(
				integration,
				expect.objectContaining({
					metadata: expect.objectContaining({ fileCount: 1 }),
				}),
			);
		});
	});
});
