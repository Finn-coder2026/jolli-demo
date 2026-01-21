import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { Space } from "../model/Space";
import * as TenantContext from "../tenant/TenantContext";
import type { TokenUtil } from "../util/TokenUtil";
import { createSpaceRouter } from "./SpaceRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext");

// Use ISO strings for dates to match JSON serialization
function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: "Test description",
		ownerId: 1,
		defaultSort: "default",
		defaultFilters: {},
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

describe("SpaceRouter", () => {
	let mockSpaceDao: SpaceDao;
	let mockDocDao: DocDao;

	function mockDaoProvider<T>(dao: T): DaoProvider<T> {
		return { getDao: () => dao };
	}

	function createApp(isAuthenticated = true): Express {
		const mockTokenUtil = {
			generateToken: vi.fn(),
			verifyToken: vi.fn().mockReturnValue(isAuthenticated ? { userId: 1, name: "Test User" } : undefined),
			getTokenFromRequest: vi.fn().mockReturnValue(isAuthenticated ? "valid-token" : undefined),
			decodePayload: vi.fn().mockReturnValue(isAuthenticated ? { userId: 1, name: "Test User" } : undefined),
		} as unknown as TokenUtil<UserInfo>;

		const app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use(
			"/spaces",
			createSpaceRouter(mockDaoProvider(mockSpaceDao), mockDaoProvider(mockDocDao), mockTokenUtil),
		);
		return app;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(TenantContext.getTenantContext).mockReturnValue(undefined);

		mockSpaceDao = {
			createSpace: vi.fn(),
			getSpace: vi.fn(),
			getSpaceByJrn: vi.fn(),
			getSpaceBySlug: vi.fn(),
			listSpaces: vi.fn(),
			updateSpace: vi.fn(),
			deleteSpace: vi.fn(),
			getOrCreateDefaultSpace: vi.fn(),
		};

		mockDocDao = {
			createDoc: vi.fn(),
			readDoc: vi.fn(),
			updateDoc: vi.fn(),
			deleteDoc: vi.fn(),
			listDocs: vi.fn(),
			searchDocsByTitle: vi.fn(),
			deleteAllDocs: vi.fn(),
			getTreeContent: vi.fn(),
			getTrashContent: vi.fn(),
			softDelete: vi.fn(),
			restore: vi.fn(),
			getMaxSortOrder: vi.fn(),
			hasDeletedDocs: vi.fn(),
		} as unknown as DocDao;
	});

	describe("GET /spaces", () => {
		it("should return list of spaces for user", async () => {
			const spaces = [mockSpace({ id: 1 }), mockSpace({ id: 2 })];
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue(spaces);

			const app = createApp();
			const response = await request(app).get("/spaces");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(mockSpaceDao.listSpaces).toHaveBeenCalledWith(1);
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).get("/spaces");

			expect(response.status).toBe(401);
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list spaces" });
		});
	});

	describe("GET /spaces/default", () => {
		it("should return or create default space", async () => {
			const defaultSpace = mockSpace({ jrn: "default", name: "Default Space" });
			vi.mocked(mockSpaceDao.getOrCreateDefaultSpace).mockResolvedValue(defaultSpace);

			const app = createApp();
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(200);
			expect(response.body.jrn).toBe("default");
			expect(response.body.name).toBe("Default Space");
			expect(mockSpaceDao.getOrCreateDefaultSpace).toHaveBeenCalledWith(1);
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(401);
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getOrCreateDefaultSpace).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get default space" });
		});
	});

	describe("GET /spaces/:id", () => {
		it("should return space when found", async () => {
			const space = mockSpace({ id: 1 });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(space);

			const app = createApp();
			const response = await request(app).get("/spaces/1");

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(1);
		});

		it("should return 404 when space not found", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
		});

		it("should return 400 for invalid ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get space" });
		});
	});

	describe("POST /spaces", () => {
		it("should create a new space", async () => {
			const newSpace = { name: "New Space", jrn: "space:new" };
			const createdSpace = mockSpace({ ...newSpace, id: 1 });
			vi.mocked(mockSpaceDao.createSpace).mockResolvedValue(createdSpace);

			const app = createApp();
			const response = await request(app).post("/spaces").send(newSpace);

			expect(response.status).toBe(201);
			expect(response.body.name).toBe("New Space");
			expect(mockSpaceDao.createSpace).toHaveBeenCalledWith(expect.objectContaining({ ...newSpace, ownerId: 1 }));
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).post("/spaces").send({ name: "New Space" });

			expect(response.status).toBe(401);
		});

		it("should return 400 on error", async () => {
			vi.mocked(mockSpaceDao.createSpace).mockRejectedValue(new Error("Validation error"));

			const app = createApp();
			const response = await request(app).post("/spaces").send({ name: "New Space" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to create space" });
		});
	});

	describe("PUT /spaces/:id", () => {
		it("should update a space", async () => {
			const updatedSpace = mockSpace({ id: 1, name: "Updated Name" });
			vi.mocked(mockSpaceDao.updateSpace).mockResolvedValue(updatedSpace);

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ name: "Updated Name" });

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("Updated Name");
		});

		it("should return 404 when space not found", async () => {
			vi.mocked(mockSpaceDao.updateSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).put("/spaces/999").send({ name: "Updated Name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
		});

		it("should return 400 for invalid ID", async () => {
			const app = createApp();
			const response = await request(app).put("/spaces/invalid").send({ name: "Updated Name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 400 on error", async () => {
			vi.mocked(mockSpaceDao.updateSpace).mockRejectedValue(new Error("Validation error"));

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ name: "Updated Name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update space" });
		});
	});

	describe("DELETE /spaces/:id", () => {
		it("should delete a space", async () => {
			vi.mocked(mockSpaceDao.deleteSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).delete("/spaces/1");

			expect(response.status).toBe(204);
			expect(mockSpaceDao.deleteSpace).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid ID", async () => {
			const app = createApp();
			const response = await request(app).delete("/spaces/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.deleteSpace).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).delete("/spaces/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete space" });
		});
	});

	describe("GET /spaces/:id/tree", () => {
		it("should return tree content for space", async () => {
			const docs = [
				{ id: 1, jrn: "doc:1" },
				{ id: 2, jrn: "doc:2" },
			];
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue(docs as never);

			const app = createApp();
			const response = await request(app).get("/spaces/1/tree");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(mockDocDao.getTreeContent).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid/tree");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockDocDao.getTreeContent).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/tree");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get tree content" });
		});
	});

	describe("GET /spaces/:id/trash", () => {
		it("should return trash content for space", async () => {
			const docs = [{ id: 1, jrn: "doc:1", deletedAt: "2024-01-01T00:00:00.000Z" }];
			vi.mocked(mockDocDao.getTrashContent).mockResolvedValue(docs as never);

			const app = createApp();
			const response = await request(app).get("/spaces/1/trash");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(mockDocDao.getTrashContent).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid/trash");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockDocDao.getTrashContent).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/trash");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get trash content" });
		});
	});

	describe("GET /spaces/:id/has-trash", () => {
		it("should return hasTrash true when there are deleted docs", async () => {
			vi.mocked(mockDocDao.hasDeletedDocs).mockResolvedValue(true);

			const app = createApp();
			const response = await request(app).get("/spaces/1/has-trash");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasTrash: true });
			expect(mockDocDao.hasDeletedDocs).toHaveBeenCalledWith(1);
		});

		it("should return hasTrash false when there are no deleted docs", async () => {
			vi.mocked(mockDocDao.hasDeletedDocs).mockResolvedValue(false);

			const app = createApp();
			const response = await request(app).get("/spaces/1/has-trash");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasTrash: false });
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid/has-trash");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockDocDao.hasDeletedDocs).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/has-trash");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check trash" });
		});
	});
});
