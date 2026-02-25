import { auditLog, computeAuditChanges } from "../audit";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserSpacePreferenceDao } from "../dao/UserSpacePreferenceDao";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Space } from "../model/Space";
import type { UserSpacePreference } from "../model/UserSpacePreference";
import * as TenantContext from "../tenant/TenantContext";
import type { TokenUtil } from "../util/TokenUtil";
import { createSpaceRouter } from "./SpaceRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext");

// Mock audit module to verify audit logging calls
vi.mock("../audit", () => ({
	auditLog: vi.fn(),
	computeAuditChanges: vi.fn(() => []),
}));

// Use ISO strings for dates to match JSON serialization
function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: "Test description",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		deletedAt: undefined,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

function mockUserSpacePreference(partial?: Partial<UserSpacePreference>): UserSpacePreference {
	return {
		id: 1,
		userId: 1,
		spaceId: 1,
		sort: "alphabetical_asc",
		filters: { updated: "any_time", creator: "" },
		expandedFolders: [],
		updatedAt: new Date(0),
		...partial,
	};
}

describe("SpaceRouter", () => {
	let mockSpaceDao: SpaceDao;
	let mockDocDao: DocDao;
	let mockUserSpacePreferenceDao: UserSpacePreferenceDao;

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

		const passthrough = vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next());
		const mockPermissionMiddleware = {
			requireAuth: passthrough,
			requirePermission: passthrough,
			requireAllPermissions: passthrough,
			requireRole: passthrough,
			loadPermissions: passthrough,
		} as unknown as PermissionMiddlewareFactory;

		const app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use(
			"/spaces",
			createSpaceRouter(
				mockDaoProvider(mockSpaceDao),
				mockDaoProvider(mockDocDao),
				mockDaoProvider(mockUserSpacePreferenceDao),
				mockTokenUtil,
				mockPermissionMiddleware,
			),
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
			getDefaultSpace: vi.fn(),
			createDefaultSpaceIfNeeded: vi.fn(),
			migrateOrphanedDocs: vi.fn(),
			migrateContent: vi.fn(),
			getSpaceStats: vi.fn(),
			getPersonalSpace: vi.fn(),
			createPersonalSpaceIfNeeded: vi.fn(),
			orphanPersonalSpace: vi.fn(),
			deleteAllSpaces: vi.fn(),
		};

		mockDocDao = {
			createDoc: vi.fn(),
			readDoc: vi.fn(),
			readDocById: vi.fn(),
			updateDoc: vi.fn(),
			updateDocIfVersion: vi.fn(),
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
			renameDoc: vi.fn(),
			searchInSpace: vi.fn(),
		} as unknown as DocDao;

		mockUserSpacePreferenceDao = {
			getPreference: vi.fn(),
			upsertPreference: vi.fn(),
			deletePreference: vi.fn(),
		};
	});

	describe("GET /spaces", () => {
		it("should return list of spaces filtered by userId", async () => {
			const spaces = [mockSpace({ id: 1 }), mockSpace({ id: 2 })];
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue(spaces);

			const app = createApp();
			const response = await request(app).get("/spaces");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(mockSpaceDao.listSpaces).toHaveBeenCalledWith(1);
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
		it("should return default space if exists", async () => {
			const defaultSpace = mockSpace({ jrn: "default", name: "Default Space" });
			vi.mocked(mockSpaceDao.getDefaultSpace).mockResolvedValue(defaultSpace);

			const app = createApp();
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(200);
			expect(response.body.jrn).toBe("default");
			expect(response.body.name).toBe("Default Space");
			expect(mockSpaceDao.getDefaultSpace).toHaveBeenCalledWith();
		});

		it("should return 404 if no default space exists", async () => {
			vi.mocked(mockSpaceDao.getDefaultSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({
				error: "No default space found - please create a space first",
			});
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(401);
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getDefaultSpace).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/default");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get default space" });
		});
	});

	describe("GET /spaces/slug/:slug", () => {
		it("should return space by slug with userId filtering", async () => {
			const space = mockSpace({ slug: "my-space" });
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(space);

			const app = createApp();
			const response = await request(app).get("/spaces/slug/my-space");

			expect(response.status).toBe(200);
			expect(response.body.slug).toBe("my-space");
			expect(mockSpaceDao.getSpaceBySlug).toHaveBeenCalledWith("my-space", 1);
		});

		it("should return 404 when space not found by slug", async () => {
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/slug/nonexistent");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
		});

		it("should return 404 for another user's personal space by slug", async () => {
			// DAO returns undefined when userId doesn't match personal space owner
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/slug/other-users-personal");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
			expect(mockSpaceDao.getSpaceBySlug).toHaveBeenCalledWith("other-users-personal", 1);
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/slug/my-space");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get space" });
		});
	});

	describe("GET /spaces/personal", () => {
		it("should return or create the personal space for the current user", async () => {
			const personalSpace = mockSpace({ id: 5, name: "Personal Space", isPersonal: true, ownerId: 1 });
			vi.mocked(mockSpaceDao.createPersonalSpaceIfNeeded).mockResolvedValue(personalSpace);

			const app = createApp();
			const response = await request(app).get("/spaces/personal");

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("Personal Space");
			expect(response.body.isPersonal).toBe(true);
			expect(mockSpaceDao.createPersonalSpaceIfNeeded).toHaveBeenCalledWith(1);
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).get("/spaces/personal");

			expect(response.status).toBe(401);
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.createPersonalSpaceIfNeeded).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/personal");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get personal space" });
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
			// router.param passes userId for personal space filtering
			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(1, 1);
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
			expect(response.body).toEqual({ error: "Failed to resolve space" });
		});
	});

	describe("POST /spaces", () => {
		it("should create a new space with auto-generated slug", async () => {
			const createdSpace = mockSpace({ id: 1, name: "New Space" });
			vi.mocked(mockSpaceDao.createSpace).mockResolvedValue(createdSpace);

			const app = createApp();
			const response = await request(app)
				.post("/spaces")
				.send({ name: "New Space", description: "A description" });

			expect(response.status).toBe(201);
			expect(response.body.name).toBe("New Space");
			// Backend should generate slug and set defaults (jrn is generated by DAO)
			expect(mockSpaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "New Space",
					description: "A description",
					ownerId: 1,
					isPersonal: false,
					defaultSort: "default",
					defaultFilters: { updated: "any_time", creator: "" },
				}),
			);
			// Verify slug was generated (contains timestamp)
			const createCall = vi.mocked(mockSpaceDao.createSpace).mock.calls[0][0];
			expect(createCall.slug).toMatch(/^new-space-\d+$/);
			// Note: jrn is auto-generated by SpaceDao from the slug, not passed from Router

			// Verify audit logging
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "create",
					resourceType: "space",
					resourceId: 1,
					resourceName: "New Space",
					actorId: 1,
				}),
			);
			expect(computeAuditChanges).toHaveBeenCalledWith(null, expect.objectContaining({ id: 1 }), "space");
		});

		it("should return 400 when name is missing", async () => {
			const app = createApp();
			const response = await request(app).post("/spaces").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name is required" });
		});

		it("should return 400 when name is empty", async () => {
			const app = createApp();
			const response = await request(app).post("/spaces").send({ name: "   " });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name is required" });
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
			const existingSpace = mockSpace({ id: 1, name: "Old Name" });
			const updatedSpace = mockSpace({ id: 1, name: "Updated Name" });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(existingSpace);
			vi.mocked(mockSpaceDao.updateSpace).mockResolvedValue(updatedSpace);

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ name: "Updated Name" });

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("Updated Name");
			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(1, 1);

			// Verify audit logging with change tracking
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "update",
					resourceType: "space",
					resourceId: 1,
					resourceName: "Updated Name",
					actorId: 1,
				}),
			);
			expect(computeAuditChanges).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Old Name" }),
				expect.objectContaining({ name: "Updated Name" }),
				"space",
			);
		});

		it("should return 404 when space not found", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).put("/spaces/999").send({ name: "Updated Name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
			expect(mockSpaceDao.updateSpace).not.toHaveBeenCalled();
			expect(auditLog).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid ID", async () => {
			const app = createApp();
			const response = await request(app).put("/spaces/invalid").send({ name: "Updated Name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 400 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockSpaceDao.updateSpace).mockRejectedValue(new Error("Validation error"));

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ name: "Updated Name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update space" });
		});

		it("should return 403 when renaming a personal space", async () => {
			const personalSpace = mockSpace({ id: 1, name: "Personal Space", isPersonal: true });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(personalSpace);

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ name: "My Custom Name" });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot rename a personal space" });
			expect(mockSpaceDao.updateSpace).not.toHaveBeenCalled();
		});

		it("should allow updating non-name fields on a personal space", async () => {
			const personalSpace = mockSpace({ id: 1, name: "Personal Space", isPersonal: true });
			const updatedSpace = mockSpace({ id: 1, name: "Personal Space", isPersonal: true, description: "Updated" });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(personalSpace);
			vi.mocked(mockSpaceDao.updateSpace).mockResolvedValue(updatedSpace);

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ description: "Updated" });

			expect(response.status).toBe(200);
			expect(mockSpaceDao.updateSpace).toHaveBeenCalled();
		});

		it("should strip isPersonal from update body", async () => {
			const existingSpace = mockSpace({ id: 1, name: "Test Space" });
			const updatedSpace = mockSpace({ id: 1, name: "Test Space" });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(existingSpace);
			vi.mocked(mockSpaceDao.updateSpace).mockResolvedValue(updatedSpace);

			const app = createApp();
			const response = await request(app).put("/spaces/1").send({ isPersonal: true, description: "New desc" });

			expect(response.status).toBe(200);
			// Verify isPersonal was stripped from the body passed to updateSpace
			const updateCall = vi.mocked(mockSpaceDao.updateSpace).mock.calls[0][1] as Record<string, unknown>;
			expect(updateCall).not.toHaveProperty("isPersonal");
			expect(updateCall.description).toBe("New desc");
		});
	});

	describe("DELETE /spaces/:id", () => {
		it("should delete a space", async () => {
			const existingSpace = mockSpace({ id: 1, name: "Test Space" });
			// Must have at least 2 spaces to allow deletion
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([mockSpace({ id: 1 }), mockSpace({ id: 2 })]);
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(existingSpace);
			vi.mocked(mockSpaceDao.deleteSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).delete("/spaces/1");

			expect(response.status).toBe(204);
			expect(mockSpaceDao.deleteSpace).toHaveBeenCalledWith(1, false);
			// Unfiltered listSpaces() for org-level "last space" check
			expect(mockSpaceDao.listSpaces).toHaveBeenCalledWith();

			// Verify audit logging
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "delete",
					resourceType: "space",
					resourceId: 1,
					resourceName: "Test Space",
					actorId: 1,
					metadata: { deleteContent: false },
				}),
			);
			expect(computeAuditChanges).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), null, "space");
		});

		it("should delete a space with deleteContent=true", async () => {
			const existingSpace = mockSpace({ id: 1, name: "Test Space" });
			// Must have at least 2 spaces to allow deletion
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([mockSpace({ id: 1 }), mockSpace({ id: 2 })]);
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(existingSpace);
			vi.mocked(mockSpaceDao.deleteSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).delete("/spaces/1?deleteContent=true");

			expect(response.status).toBe(204);
			expect(mockSpaceDao.deleteSpace).toHaveBeenCalledWith(1, true);

			// Verify audit logging includes deleteContent metadata
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "delete",
					metadata: { deleteContent: true },
				}),
			);
		});

		it("should return 400 when trying to delete the last space", async () => {
			// Only 1 space exists - cannot delete
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([mockSpace({ id: 1 })]);

			const app = createApp();
			const response = await request(app).delete("/spaces/1");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Cannot delete the last space. At least one space must exist." });
			expect(mockSpaceDao.deleteSpace).not.toHaveBeenCalled();
		});

		it("should return 403 when trying to delete a personal space", async () => {
			const personalSpace = mockSpace({ id: 1, name: "Personal Space", isPersonal: true });
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([personalSpace, mockSpace({ id: 2 })]);
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(personalSpace);

			const app = createApp();
			const response = await request(app).delete("/spaces/1");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot delete a personal space" });
			expect(mockSpaceDao.deleteSpace).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid ID", async () => {
			const app = createApp();
			const response = await request(app).delete("/spaces/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			// Must have at least 2 spaces to allow deletion
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([mockSpace({ id: 1 }), mockSpace({ id: 2 })]);
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
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
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
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
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
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
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
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
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.getTrashContent).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/trash");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get trash content" });
		});
	});

	describe("GET /spaces/:id/has-trash", () => {
		it("should return hasTrash true when there are deleted docs", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.hasDeletedDocs).mockResolvedValue(true);

			const app = createApp();
			const response = await request(app).get("/spaces/1/has-trash");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasTrash: true });
			expect(mockDocDao.hasDeletedDocs).toHaveBeenCalledWith(1);
		});

		it("should return hasTrash false when there are no deleted docs", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
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
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.hasDeletedDocs).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/has-trash");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check trash" });
		});
	});

	describe("POST /spaces/:id/search", () => {
		it("should return search results", async () => {
			const searchResponse = {
				results: [
					{
						doc: { id: 1, jrn: "doc:1", contentMetadata: { title: "Test Doc" } },
						contentSnippet: "snippet",
						matchType: "title",
						relevance: 1.0,
					},
				],
				total: 1,
				limited: false,
			};
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue(searchResponse as never);

			const app = createApp();
			const response = await request(app).post("/spaces/1/search").send({ query: "test" });

			expect(response.status).toBe(200);
			expect(response.body.results).toHaveLength(1);
			expect(response.body.total).toBe(1);
			expect(mockDocDao.searchInSpace).toHaveBeenCalledWith(1, "test");
		});

		it("should return 400 for missing query", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));

			const app = createApp();
			const response = await request(app).post("/spaces/1/search").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Query parameter is required" });
		});

		it("should return 400 for empty query", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));

			const app = createApp();
			const response = await request(app).post("/spaces/1/search").send({ query: "   " });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Query parameter is required" });
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).post("/spaces/invalid/search").send({ query: "test" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error without leaking internal details", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.searchInSpace).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).post("/spaces/1/search").send({ query: "test" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Search failed");
			expect(response.body.details).toBeUndefined();
		});
	});

	describe("GET /spaces/:id/preferences", () => {
		it("should return user preferences for a space", async () => {
			const pref = mockUserSpacePreference({ sort: "alphabetical_asc", filters: { test: true } });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.getPreference).mockResolvedValue(pref);

			const app = createApp();
			const response = await request(app).get("/spaces/1/preferences");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				sort: "alphabetical_asc",
				filters: { test: true },
				expandedFolders: [],
			});
			expect(mockUserSpacePreferenceDao.getPreference).toHaveBeenCalledWith(1, 1);
		});

		it("should return defaults when no preference exists", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.getPreference).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/1/preferences");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				sort: null,
				filters: { updated: "any_time", creator: "" },
				expandedFolders: [],
			});
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).get("/spaces/1/preferences");

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid/preferences");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.getPreference).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/preferences");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get preferences" });
		});
	});

	describe("PUT /spaces/:id/preferences", () => {
		it("should update sort preference", async () => {
			const updatedPref = mockUserSpacePreference({ sort: "alphabetical_desc" });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockResolvedValue(updatedPref);

			const app = createApp();
			const response = await request(app).put("/spaces/1/preferences").send({ sort: "alphabetical_desc" });

			expect(response.status).toBe(200);
			expect(response.body.sort).toBe("alphabetical_desc");
			expect(mockUserSpacePreferenceDao.upsertPreference).toHaveBeenCalledWith(1, 1, {
				sort: "alphabetical_desc",
			});
		});

		it("should update sort preference with null to reset", async () => {
			const updatedPref = mockUserSpacePreference({ sort: undefined });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockResolvedValue(updatedPref);

			const app = createApp();
			const response = await request(app).put("/spaces/1/preferences").send({ sort: null });

			expect(response.status).toBe(200);
			expect(response.body.sort).toBeNull();
			expect(mockUserSpacePreferenceDao.upsertPreference).toHaveBeenCalledWith(1, 1, {
				sort: null,
			});
		});

		it("should update filters", async () => {
			const newFilters = { showArchived: true };
			const updatedPref = mockUserSpacePreference({ filters: newFilters });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockResolvedValue(updatedPref);

			const app = createApp();
			const response = await request(app).put("/spaces/1/preferences").send({ filters: newFilters });

			expect(response.status).toBe(200);
			expect(response.body.filters).toEqual(newFilters);
			expect(mockUserSpacePreferenceDao.upsertPreference).toHaveBeenCalledWith(1, 1, {
				filters: newFilters,
			});
		});

		it("should update expandedFolders", async () => {
			const newFolders = [1, 2, 3];
			const updatedPref = mockUserSpacePreference({ expandedFolders: newFolders });
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockResolvedValue(updatedPref);

			const app = createApp();
			const response = await request(app).put("/spaces/1/preferences").send({ expandedFolders: newFolders });

			expect(response.status).toBe(200);
			expect(response.body.expandedFolders).toEqual(newFolders);
			expect(mockUserSpacePreferenceDao.upsertPreference).toHaveBeenCalledWith(1, 1, {
				expandedFolders: newFolders,
			});
		});

		it("should update multiple fields at once", async () => {
			const updatedPref = mockUserSpacePreference({
				sort: "updatedAt_desc",
				filters: { a: 1 },
				expandedFolders: [5, 6],
			});
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockResolvedValue(updatedPref);

			const app = createApp();
			const response = await request(app)
				.put("/spaces/1/preferences")
				.send({
					sort: "updatedAt_desc",
					filters: { a: 1 },
					expandedFolders: [5, 6],
				});

			expect(response.status).toBe(200);
			expect(response.body.sort).toBe("updatedAt_desc");
			expect(response.body.filters).toEqual({ a: 1 });
			expect(response.body.expandedFolders).toEqual([5, 6]);
		});

		it("should return 401 when not authenticated", async () => {
			const app = createApp(false);
			const response = await request(app).put("/spaces/1/preferences").send({ sort: "default" });

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).put("/spaces/invalid/preferences").send({ sort: "default" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockUserSpacePreferenceDao.upsertPreference).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).put("/spaces/1/preferences").send({ sort: "default" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update preferences" });
		});
	});

	describe("POST /spaces/:id/migrate-content", () => {
		it("should migrate content from source to target space", async () => {
			vi.mocked(mockSpaceDao.getSpace)
				.mockResolvedValueOnce(mockSpace({ id: 1 })) // router.param (source)
				.mockResolvedValueOnce(mockSpace({ id: 2, name: "Target" })); // handler (target)
			vi.mocked(mockSpaceDao.migrateContent).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).post("/spaces/1/migrate-content").send({ targetSpaceId: 2 });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(mockSpaceDao.migrateContent).toHaveBeenCalledWith(1, 2);
			// Verify target space access check includes userId
			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(2, 1);

			// Verify audit logging
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "move",
					resourceType: "space",
					resourceId: 1,
					actorId: 1,
					metadata: { sourceSpaceId: 1, targetSpaceId: 2 },
				}),
			);
		});

		it("should return 404 when target space is inaccessible", async () => {
			vi.mocked(mockSpaceDao.getSpace)
				.mockResolvedValueOnce(mockSpace({ id: 1 })) // router.param (source)
				.mockResolvedValueOnce(undefined); // handler (target not found / inaccessible)

			const app = createApp();
			const response = await request(app).post("/spaces/1/migrate-content").send({ targetSpaceId: 99 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Target space not found" });
			expect(mockSpaceDao.migrateContent).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid source space ID", async () => {
			const app = createApp();
			const response = await request(app).post("/spaces/invalid/migrate-content").send({ targetSpaceId: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 400 when targetSpaceId is missing", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));

			const app = createApp();
			const response = await request(app).post("/spaces/1/migrate-content").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Target space ID is required" });
		});

		it("should return 400 when source equals target", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));

			const app = createApp();
			const response = await request(app).post("/spaces/1/migrate-content").send({ targetSpaceId: 1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Source and target space cannot be the same" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace)
				.mockResolvedValueOnce(mockSpace({ id: 1 })) // router.param (source)
				.mockResolvedValueOnce(mockSpace({ id: 2 })); // handler (target)
			vi.mocked(mockSpaceDao.migrateContent).mockRejectedValue(new Error("Migration failed"));

			const app = createApp();
			const response = await request(app).post("/spaces/1/migrate-content").send({ targetSpaceId: 2 });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to migrate content" });
		});
	});

	describe("GET /spaces/:id/stats", () => {
		it("should return space statistics", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockSpaceDao.getSpaceStats).mockResolvedValue({ docCount: 10, folderCount: 3 });

			const app = createApp();
			const response = await request(app).get("/spaces/1/stats");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ docCount: 10, folderCount: 3 });
			expect(mockSpaceDao.getSpaceStats).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid space ID", async () => {
			const app = createApp();
			const response = await request(app).get("/spaces/invalid/stats");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid space ID" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockSpaceDao.getSpaceStats).mockRejectedValue(new Error("Database error"));

			const app = createApp();
			const response = await request(app).get("/spaces/1/stats");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get space stats" });
		});
	});

	describe("Personal space access control", () => {
		it("should pass userId to getSpace via router.param for all :id routes", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue([] as never);

			const app = createApp();
			await request(app).get("/spaces/1/tree");

			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(1, 1);
		});

		it("should return 404 for another user's personal space on :id routes", async () => {
			// DAO returns undefined when userId doesn't match personal space owner
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(undefined);

			const app = createApp();
			const response = await request(app).get("/spaces/5");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Space not found" });
			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(5, 1);
		});

		it("should pass userId to listSpaces for GET /spaces", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const app = createApp();
			await request(app).get("/spaces");

			expect(mockSpaceDao.listSpaces).toHaveBeenCalledWith(1);
		});

		it("should pass userId to getSpaceBySlug for GET /spaces/slug/:slug", async () => {
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(mockSpace({ slug: "test" }));

			const app = createApp();
			await request(app).get("/spaces/slug/test");

			expect(mockSpaceDao.getSpaceBySlug).toHaveBeenCalledWith("test", 1);
		});

		it("should use unfiltered listSpaces for last-space deletion check", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(mockSpace({ id: 1 }));
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([mockSpace({ id: 1 }), mockSpace({ id: 2 })]);
			vi.mocked(mockSpaceDao.deleteSpace).mockResolvedValue(undefined);

			const app = createApp();
			await request(app).delete("/spaces/1");

			// The "last space" check uses unfiltered listSpaces (no userId)
			expect(mockSpaceDao.listSpaces).toHaveBeenCalledWith();
		});
	});
});
