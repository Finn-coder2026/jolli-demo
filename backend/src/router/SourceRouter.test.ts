import type { DaoProvider } from "../dao/DaoProvider";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { SourceDao } from "../dao/SourceDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { Source } from "../model/Source";
import * as TenantContext from "../tenant/TenantContext";
import { createSourceRouter, createSpaceSourceRouter } from "./SourceRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext");

function mockSource(partial?: Partial<Source>): Source {
	return {
		id: 1,
		name: "source-a",
		type: "git",
		repo: "org/repo",
		branch: "main",
		integrationId: 10,
		enabled: true,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("SourceRouter", () => {
	let mockSourceDao: SourceDao;
	let mockIntegrationDao: IntegrationDao;
	let mockSpaceDao: SpaceDao;

	function createApp(): Express {
		const app = express();
		app.use(express.json());
		app.use(
			"/sources",
			createSourceRouter({
				sourceDaoProvider: mockDaoProvider(mockSourceDao),
				integrationDaoProvider: mockDaoProvider(mockIntegrationDao),
			}),
		);
		return app;
	}

	function createSpaceSourceApp(): Express {
		const app = express();
		app.use(express.json());
		app.use(
			"/spaces/:spaceId/sources",
			createSpaceSourceRouter({
				sourceDaoProvider: mockDaoProvider(mockSourceDao),
				spaceDaoProvider: mockDaoProvider(mockSpaceDao),
			}),
		);
		return app;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(TenantContext.getTenantContext).mockReturnValue(undefined);

		mockSourceDao = {
			createSource: vi.fn(),
			getSource: vi.fn(),
			listSources: vi.fn(),
			updateSource: vi.fn(),
			deleteSource: vi.fn(),
			updateCursor: vi.fn(),
			bindSourceToSpace: vi.fn(),
			unbindSourceFromSpace: vi.fn(),
			listSourcesForSpace: vi.fn(),
			listSpacesForSource: vi.fn(),
			findSourcesMatchingJrn: vi.fn(),
		};

		mockIntegrationDao = {
			createIntegration: vi.fn(),
			getIntegration: vi.fn(),
			listIntegrations: vi.fn(),
			countIntegrations: vi.fn(),
			updateIntegration: vi.fn(),
			deleteIntegration: vi.fn(),
			removeAllGitHubIntegrations: vi.fn(),
			removeDuplicateGitHubIntegrations: vi.fn(),
			getGitHubRepoIntegration: vi.fn(),
			lookupIntegration: vi.fn(),
		};

		mockSpaceDao = {
			createSpace: vi.fn(),
			getSpace: vi.fn(),
			getSpaceByJrn: vi.fn(),
			getSpaceBySlug: vi.fn(),
			listSpaces: vi.fn(),
			updateSpace: vi.fn(),
			deleteSpace: vi.fn(),
			migrateContent: vi.fn(),
			getSpaceStats: vi.fn(),
			getDefaultSpace: vi.fn(),
			createDefaultSpaceIfNeeded: vi.fn(),
			migrateOrphanedDocs: vi.fn(),
			getPersonalSpace: vi.fn(),
			createPersonalSpaceIfNeeded: vi.fn(),
			orphanPersonalSpace: vi.fn(),
			deleteAllSpaces: vi.fn(),
		};
	});

	// ---- GET /sources ----

	describe("GET /sources", () => {
		it("returns all sources", async () => {
			const sources = [mockSource({ id: 1 }), mockSource({ id: 2, name: "source-b" })];
			vi.mocked(mockSourceDao.listSources).mockResolvedValue(sources);

			const app = createApp();
			const response = await request(app).get("/sources");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(mockSourceDao.listSources).toHaveBeenCalledOnce();
		});

		it("returns an empty array when no sources exist", async () => {
			vi.mocked(mockSourceDao.listSources).mockResolvedValue([]);

			const app = createApp();
			const response = await request(app).get("/sources");

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mockSourceDao.listSources).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).get("/sources");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list sources" });
		});
	});

	// ---- POST /sources ----

	describe("POST /sources", () => {
		it("returns 400 when name is missing", async () => {
			const app = createApp();
			const response = await request(app).post("/sources").send({ type: "git" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name is required" });
			expect(mockSourceDao.createSource).not.toHaveBeenCalled();
		});

		it("returns 400 when name is empty string", async () => {
			const app = createApp();
			const response = await request(app).post("/sources").send({ name: "  ", type: "git" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name is required" });
		});

		it("returns 400 when name is not a string", async () => {
			const app = createApp();
			const response = await request(app).post("/sources").send({ name: 123, type: "git" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name is required" });
		});

		it("returns 400 when type is missing", async () => {
			const app = createApp();
			const response = await request(app).post("/sources").send({ name: "my-source" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "type must be 'git' or 'file'" });
		});

		it("returns 400 when type is invalid", async () => {
			const app = createApp();
			const response = await request(app).post("/sources").send({ name: "my-source", type: "svn" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "type must be 'git' or 'file'" });
		});

		it("returns 400 when integrationId is not a positive integer", async () => {
			const app = createApp();
			const response = await request(app)
				.post("/sources")
				.send({ name: "my-source", type: "git", integrationId: -1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "integrationId must be a positive integer" });
			expect(mockSourceDao.createSource).not.toHaveBeenCalled();
		});

		it("returns 400 when integrationId is a non-integer number", async () => {
			const app = createApp();
			const response = await request(app)
				.post("/sources")
				.send({ name: "my-source", type: "git", integrationId: 1.5 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "integrationId must be a positive integer" });
		});

		it("returns 400 when integrationId does not exist", async () => {
			vi.mocked(mockIntegrationDao.getIntegration).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app)
				.post("/sources")
				.send({ name: "my-source", type: "git", integrationId: 999 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Integration 999 not found" });
			expect(mockIntegrationDao.getIntegration).toHaveBeenCalledWith(999);
			expect(mockSourceDao.createSource).not.toHaveBeenCalled();
		});

		it("creates source with minimal fields", async () => {
			const created = mockSource({ id: 5, name: "new-source", type: "file" });
			vi.mocked(mockSourceDao.createSource).mockResolvedValue(created);

			const app = createApp();
			const response = await request(app).post("/sources").send({ name: "new-source", type: "file" });

			expect(response.status).toBe(201);
			expect(mockSourceDao.createSource).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "new-source",
					type: "file",
					enabled: true,
				}),
			);
		});

		it("creates source with all fields including repo, branch, integrationId", async () => {
			vi.mocked(mockIntegrationDao.getIntegration).mockResolvedValue({ id: 10 } as never);
			const created = mockSource({
				id: 6,
				name: "full-source",
				repo: "org/repo",
				branch: "dev",
				integrationId: 10,
			});
			vi.mocked(mockSourceDao.createSource).mockResolvedValue(created);

			const app = createApp();
			const response = await request(app).post("/sources").send({
				name: "  full-source  ",
				type: "git",
				repo: "  org/repo  ",
				branch: "  dev  ",
				integrationId: 10,
				enabled: false,
			});

			expect(response.status).toBe(201);
			expect(mockSourceDao.createSource).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "full-source",
					type: "git",
					repo: "org/repo",
					branch: "dev",
					integrationId: 10,
					enabled: false,
				}),
			);
		});

		it("trims name and passes enabled as true by default", async () => {
			vi.mocked(mockSourceDao.createSource).mockResolvedValue(mockSource({ name: "trimmed" }));

			const app = createApp();
			await request(app).post("/sources").send({ name: "  trimmed  ", type: "git" });

			expect(mockSourceDao.createSource).toHaveBeenCalledWith(
				expect.objectContaining({ name: "trimmed", enabled: true }),
			);
		});

		it("skips integrationId validation when integrationId is null", async () => {
			vi.mocked(mockSourceDao.createSource).mockResolvedValue(mockSource());

			const app = createApp();
			const response = await request(app)
				.post("/sources")
				.send({ name: "src", type: "git", integrationId: null });

			expect(response.status).toBe(201);
			expect(mockIntegrationDao.getIntegration).not.toHaveBeenCalled();
		});

		it("returns 400 when DAO throws", async () => {
			vi.mocked(mockSourceDao.createSource).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).post("/sources").send({ name: "my-source", type: "git" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to create source" });
		});
	});

	// ---- GET /sources/:id ----

	describe("GET /sources/:id", () => {
		it("returns 400 for an invalid ID", async () => {
			const app = createApp();
			const response = await request(app).get("/sources/abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid source ID" });
			expect(mockSourceDao.getSource).not.toHaveBeenCalled();
		});

		it("returns 404 when source is not found", async () => {
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/sources/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Source not found" });
			expect(mockSourceDao.getSource).toHaveBeenCalledWith(999);
		});

		it("returns 200 with the source when found", async () => {
			const source = mockSource({ id: 42, name: "my-source" });
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(source);

			const app = createApp();
			const response = await request(app).get("/sources/42");

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(42);
			expect(response.body.name).toBe("my-source");
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mockSourceDao.getSource).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).get("/sources/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get source" });
		});
	});

	// ---- PATCH /sources/:id ----

	describe("PATCH /sources/:id", () => {
		it("returns 400 when integrationId is not a positive integer", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ integrationId: 0 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "integrationId must be a positive integer" });
			expect(mockSourceDao.updateSource).not.toHaveBeenCalled();
		});

		it("returns 400 when integrationId does not exist", async () => {
			vi.mocked(mockIntegrationDao.getIntegration).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ integrationId: 999 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Integration 999 not found" });
			expect(mockIntegrationDao.getIntegration).toHaveBeenCalledWith(999);
			expect(mockSourceDao.updateSource).not.toHaveBeenCalled();
		});

		it("updates source when integrationId exists", async () => {
			vi.mocked(mockIntegrationDao.getIntegration).mockResolvedValue({ id: 42 } as never);
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(
				mockSource({ id: 1, name: "updated-source", integrationId: 42 }),
			);

			const app = createApp();
			const response = await request(app)
				.patch("/sources/1")
				.send({ name: "  updated-source  ", integrationId: 42 });

			expect(response.status).toBe(200);
			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					name: "updated-source",
					integrationId: 42,
				}),
			);
		});

		it("returns 400 for an invalid ID", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/abc").send({ name: "x" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid source ID" });
			expect(mockSourceDao.updateSource).not.toHaveBeenCalled();
		});

		it("returns 404 when source is not found", async () => {
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).patch("/sources/999").send({ name: "new-name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Source not found" });
		});

		it("returns 400 when name is empty string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ name: "" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name must be a non-empty string" });
		});

		it("returns 400 when name is whitespace only", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ name: "   " });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name must be a non-empty string" });
		});

		it("returns 400 when name is not a string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ name: 42 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name must be a non-empty string" });
		});

		it("returns 400 when type is invalid", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ type: "svn" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "type must be 'git' or 'file'" });
		});

		it("returns 400 when enabled is not a boolean", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ enabled: "yes" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "enabled must be a boolean" });
		});

		it("returns 400 when repo is not a string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ repo: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "repo must be a string" });
		});

		it("returns 400 when branch is not a string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ branch: true });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "branch must be a string" });
		});

		it("returns 400 when integrationId is a negative integer", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ integrationId: -5 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "integrationId must be a positive integer" });
		});

		it("returns 400 when integrationId is a non-integer number", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ integrationId: 2.5 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "integrationId must be a positive integer" });
		});

		it("allows null integrationId to clear the integration", async () => {
			const { integrationId: _, ...noIntegrationFields } = mockSource();
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(noIntegrationFields as Source);

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ integrationId: null });

			expect(response.status).toBe(200);
			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ integrationId: null }),
			);
		});

		it("updates only the provided fields", async () => {
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(mockSource({ enabled: false }));

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ enabled: false });

			expect(response.status).toBe(200);
			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(1, { enabled: false });
		});

		it("trims repo and branch strings", async () => {
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(mockSource());

			const app = createApp();
			await request(app).patch("/sources/1").send({ repo: "  org/repo  ", branch: "  main  " });

			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ repo: "org/repo", branch: "main" }),
			);
		});

		it("accepts valid type values: git", async () => {
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(mockSource({ type: "git" }));

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ type: "git" });

			expect(response.status).toBe(200);
			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(1, expect.objectContaining({ type: "git" }));
		});

		it("accepts valid type values: file", async () => {
			vi.mocked(mockSourceDao.updateSource).mockResolvedValue(mockSource({ type: "file" }));

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ type: "file" });

			expect(response.status).toBe(200);
			expect(mockSourceDao.updateSource).toHaveBeenCalledWith(1, expect.objectContaining({ type: "file" }));
		});

		it("returns 400 when DAO throws", async () => {
			vi.mocked(mockSourceDao.updateSource).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).patch("/sources/1").send({ name: "x" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update source" });
		});
	});

	// ---- DELETE /sources/:id ----

	describe("DELETE /sources/:id", () => {
		it("returns 400 for an invalid ID", async () => {
			const app = createApp();
			const response = await request(app).delete("/sources/xyz");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid source ID" });
			expect(mockSourceDao.deleteSource).not.toHaveBeenCalled();
		});

		it("returns 204 on successful deletion", async () => {
			vi.mocked(mockSourceDao.deleteSource).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).delete("/sources/1");

			expect(response.status).toBe(204);
			expect(mockSourceDao.deleteSource).toHaveBeenCalledWith(1);
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mockSourceDao.deleteSource).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).delete("/sources/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete source" });
		});
	});

	// ---- PATCH /sources/:id/cursor ----

	describe("PATCH /sources/:id/cursor", () => {
		it("returns 400 for an invalid ID", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/abc/cursor").send({ value: "sha123" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid source ID" });
			expect(mockSourceDao.updateCursor).not.toHaveBeenCalled();
		});

		it("returns 400 when value is missing", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1/cursor").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "value is required" });
			expect(mockSourceDao.updateCursor).not.toHaveBeenCalled();
		});

		it("returns 400 when value is not a string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1/cursor").send({ value: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "value is required" });
		});

		it("returns 400 when value is empty string", async () => {
			const app = createApp();
			const response = await request(app).patch("/sources/1/cursor").send({ value: "" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "value is required" });
		});

		it("returns 404 when source is not found", async () => {
			vi.mocked(mockSourceDao.updateCursor).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).patch("/sources/999/cursor").send({ value: "sha-abc" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Source not found" });
		});

		it("returns 200 with updated source on success", async () => {
			const updated = mockSource({
				id: 1,
				cursor: { value: "sha-abc", updatedAt: "2024-01-01T00:00:00.000Z" },
			});
			vi.mocked(mockSourceDao.updateCursor).mockResolvedValue(updated);

			const app = createApp();
			const response = await request(app).patch("/sources/1/cursor").send({ value: "sha-abc" });

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(1);
			expect(mockSourceDao.updateCursor).toHaveBeenCalledWith(1, expect.objectContaining({ value: "sha-abc" }));
		});

		it("passes a cursor object with value and updatedAt", async () => {
			vi.mocked(mockSourceDao.updateCursor).mockResolvedValue(mockSource());

			const app = createApp();
			await request(app).patch("/sources/1/cursor").send({ value: "sha-xyz" });

			const cursorArg = vi.mocked(mockSourceDao.updateCursor).mock.calls[0][1];
			expect(cursorArg.value).toBe("sha-xyz");
			expect(cursorArg.updatedAt).toBeDefined();
			// Verify updatedAt is a valid ISO date string
			expect(Number.isNaN(Date.parse(cursorArg.updatedAt))).toBe(false);
		});

		it("returns 400 when DAO throws", async () => {
			vi.mocked(mockSourceDao.updateCursor).mockRejectedValue(new Error("db error"));

			const app = createApp();
			const response = await request(app).patch("/sources/1/cursor").send({ value: "sha-abc" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update source cursor" });
		});
	});

	// ---- GET /spaces/:spaceId/sources ----

	describe("GET /spaces/:spaceId/sources", () => {
		it("returns 400 for an invalid space ID", async () => {
			const app = createSpaceSourceApp();
			const response = await request(app).get("/spaces/bad/sources");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
			expect(mockSourceDao.listSourcesForSpace).not.toHaveBeenCalled();
		});

		it("returns 200 with sources for the space", async () => {
			const sources = [
				{
					...mockSource({ id: 1 }),
					binding: { spaceId: 5, sourceId: 1, enabled: true, createdAt: new Date(0) },
				},
			];
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue(sources as never);

			const app = createSpaceSourceApp();
			const response = await request(app).get("/spaces/5/sources");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(mockSourceDao.listSourcesForSpace).toHaveBeenCalledWith(5);
		});

		it("returns an empty array when no sources are bound", async () => {
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue([]);

			const app = createSpaceSourceApp();
			const response = await request(app).get("/spaces/5/sources");

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mockSourceDao.listSourcesForSpace).mockRejectedValue(new Error("db error"));

			const app = createSpaceSourceApp();
			const response = await request(app).get("/spaces/5/sources");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list sources for space" });
		});
	});

	// ---- POST /spaces/:spaceId/sources ----

	describe("POST /spaces/:spaceId/sources", () => {
		it("returns 404 when space does not exist", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(undefined);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/123/sources").send({ sourceId: 1 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space 123 not found" });
			expect(mockSourceDao.getSource).not.toHaveBeenCalled();
			expect(mockSourceDao.bindSourceToSpace).not.toHaveBeenCalled();
		});

		it("binds source when space and source both exist", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 123 } as never);
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(mockSource({ id: 1 }));
			vi.mocked(mockSourceDao.bindSourceToSpace).mockResolvedValue({
				spaceId: 123,
				sourceId: 1,
				enabled: true,
				createdAt: new Date(0),
			} as never);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/123/sources").send({ sourceId: 1 });

			expect(response.status).toBe(201);
			expect(mockSourceDao.bindSourceToSpace).toHaveBeenCalledWith(123, 1, undefined, undefined);
		});

		it("returns 400 for an invalid space ID", async () => {
			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/nope/sources").send({ sourceId: 1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
			expect(mockSpaceDao.getSpace).not.toHaveBeenCalled();
		});

		it("returns 400 when sourceId is missing", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "sourceId must be a positive integer" });
		});

		it("returns 400 when sourceId is zero", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({ sourceId: 0 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "sourceId must be a positive integer" });
		});

		it("returns 400 when sourceId is negative", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({ sourceId: -5 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "sourceId must be a positive integer" });
		});

		it("returns 400 when sourceId is a non-integer", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({ sourceId: 1.5 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "sourceId must be a positive integer" });
		});

		it("returns 404 when source does not exist", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(undefined);

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({ sourceId: 999 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Source 999 not found" });
			expect(mockSourceDao.bindSourceToSpace).not.toHaveBeenCalled();
		});

		it("passes jrnPattern and enabled to bindSourceToSpace", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(mockSource({ id: 2 }));
			vi.mocked(mockSourceDao.bindSourceToSpace).mockResolvedValue({
				spaceId: 1,
				sourceId: 2,
				jrnPattern: "jrn:*",
				enabled: false,
				createdAt: new Date(0),
			} as never);

			const app = createSpaceSourceApp();
			const response = await request(app)
				.post("/spaces/1/sources")
				.send({ sourceId: 2, jrnPattern: "jrn:*", enabled: false });

			expect(response.status).toBe(201);
			expect(mockSourceDao.bindSourceToSpace).toHaveBeenCalledWith(1, 2, "jrn:*", false);
		});

		it("returns 400 when DAO throws", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1 } as never);
			vi.mocked(mockSourceDao.getSource).mockResolvedValue(mockSource({ id: 1 }));
			vi.mocked(mockSourceDao.bindSourceToSpace).mockRejectedValue(new Error("db error"));

			const app = createSpaceSourceApp();
			const response = await request(app).post("/spaces/1/sources").send({ sourceId: 1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to bind source to space" });
		});
	});

	// ---- DELETE /spaces/:spaceId/sources/:sourceId ----

	describe("DELETE /spaces/:spaceId/sources/:sourceId", () => {
		it("returns 400 for an invalid space ID", async () => {
			const app = createSpaceSourceApp();
			const response = await request(app).delete("/spaces/bad/sources/1");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space or source ID" });
			expect(mockSourceDao.unbindSourceFromSpace).not.toHaveBeenCalled();
		});

		it("returns 400 for an invalid source ID", async () => {
			const app = createSpaceSourceApp();
			const response = await request(app).delete("/spaces/1/sources/bad");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space or source ID" });
			expect(mockSourceDao.unbindSourceFromSpace).not.toHaveBeenCalled();
		});

		it("returns 400 when both IDs are invalid", async () => {
			const app = createSpaceSourceApp();
			const response = await request(app).delete("/spaces/x/sources/y");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space or source ID" });
		});

		it("returns 204 on successful unbinding", async () => {
			vi.mocked(mockSourceDao.unbindSourceFromSpace).mockResolvedValue(undefined);

			const app = createSpaceSourceApp();
			const response = await request(app).delete("/spaces/5/sources/10");

			expect(response.status).toBe(204);
			expect(mockSourceDao.unbindSourceFromSpace).toHaveBeenCalledWith(5, 10);
		});

		it("returns 500 when DAO throws", async () => {
			vi.mocked(mockSourceDao.unbindSourceFromSpace).mockRejectedValue(new Error("db error"));

			const app = createSpaceSourceApp();
			const response = await request(app).delete("/spaces/5/sources/10");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to unbind source from space" });
		});
	});
});
