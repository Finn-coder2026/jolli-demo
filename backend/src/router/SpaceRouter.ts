import { auditLog, computeAuditChanges } from "../audit";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserSpacePreferenceDao, UserSpacePreferenceUpdate } from "../dao/UserSpacePreferenceDao";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { NewSpace, Space } from "../model/Space";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import { DEFAULT_SPACE_FILTERS, type SpaceSortOption, type UserInfo } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Request body for creating a new space.
 * Only name is required; slug, jrn, and defaults are generated server-side.
 */
interface CreateSpaceRequest {
	name: string;
	description?: string;
}

/**
 * Gets the pre-validated space from req.space (set by router.param).
 * Throws if not present — this should never happen since router.param runs first.
 */
function getReqSpace(req: Request): Space {
	const space = req.space;
	if (!space) {
		throw new Error("req.space not set — router.param('id') should have run before this handler");
	}
	return space;
}

export function createSpaceRouter(
	spaceDaoProvider: DaoProvider<SpaceDao>,
	docDaoProvider: DaoProvider<DocDao>,
	userSpacePreferenceDaoProvider: DaoProvider<UserSpacePreferenceDao>,
	tokenUtil: TokenUtil<UserInfo>,
	permissionMiddleware: PermissionMiddlewareFactory,
): Router {
	const router = express.Router();

	// Centralized space access control for all :id routes.
	// Parses the ID, fetches the space with personal space filtering, and attaches to req.space.
	// Returns 404 for non-existent spaces and inaccessible personal spaces (avoids leaking existence).
	router.param("id", async (req, res, next) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const space = await spaceDao.getSpace(id, userId);
			if (!space) {
				res.status(404).json({ error: "Space not found" });
				return;
			}
			req.space = space;
			next();
		} catch (error) {
			log.error("Failed to resolve space: %s", error);
			res.status(500).json({ error: "Failed to resolve space" });
		}
	});

	// GET /spaces - List all spaces visible to the current user
	router.get("/", permissionMiddleware.requirePermission("spaces.view"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}
			const spaces = await spaceDao.listSpaces(userId);
			res.json(spaces);
		} catch (error) {
			log.error("Failed to list spaces: %s", error);
			res.status(500).json({ error: "Failed to list spaces" });
		}
	});

	// GET /spaces/default - Get or create the default space
	router.get("/default", permissionMiddleware.requirePermission("spaces.view"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const space = await spaceDao.getDefaultSpace();

			if (!space) {
				return res.status(404).json({
					error: "No default space found - please create a space first",
				});
			}

			res.json(space);
		} catch (error) {
			log.error("Failed to get default space: %s", error);
			res.status(500).json({ error: "Failed to get default space" });
		}
	});

	// GET /spaces/slug/:slug - Get a space by slug
	router.get("/slug/:slug", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}
			const slug = req.params.slug;
			const space = await spaceDao.getSpaceBySlug(slug, userId);
			if (space) {
				res.json(space);
			} else {
				res.status(404).json({ error: "Space not found" });
			}
		} catch (error) {
			log.error("Failed to get space by slug: %s", error);
			res.status(500).json({ error: "Failed to get space" });
		}
	});

	// GET /spaces/personal - Get or create the current user's personal space (safety net)
	router.get("/personal", permissionMiddleware.requirePermission("spaces.view"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const space = await spaceDao.createPersonalSpaceIfNeeded(userId);
			res.json(space);
		} catch (error) {
			log.error("Failed to get personal space: %s", error);
			res.status(500).json({ error: "Failed to get personal space" });
		}
	});

	// GET /spaces/:id - Get a space by ID (access validated by router.param)
	router.get("/:id", permissionMiddleware.requirePermission("spaces.view"), (req, res) => {
		try {
			res.json(getReqSpace(req));
		} catch (error) {
			log.error("Failed to get space: %s", error);
			res.status(500).json({ error: "Failed to get space" });
		}
	});

	// POST /spaces - Create a new space
	router.post("/", permissionMiddleware.requirePermission("spaces.edit"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const body = req.body as CreateSpaceRequest;

			// Validate required fields
			if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
				res.status(400).json({ error: "Name is required" });
				return;
			}

			const name = body.name.trim();
			const slugFromName = generateSlug(name);
			const uniqueSlug = `${slugFromName}-${Date.now()}`;

			const newSpace: NewSpace = {
				name,
				slug: uniqueSlug,
				description: body.description,
				ownerId: userId,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: { ...DEFAULT_SPACE_FILTERS },
			};
			const space = await spaceDao.createSpace(newSpace);

			// Audit log space creation
			auditLog({
				action: "create",
				resourceType: "space",
				resourceId: space.id,
				resourceName: space.name,
				actorId: userId,
				changes: computeAuditChanges(null, space as unknown as Record<string, unknown>, "space"),
			});

			res.status(201).json(space);
		} catch (error) {
			log.error("Failed to create space: %s", error);
			res.status(400).json({ error: "Failed to create space" });
		}
	});

	// PUT /spaces/:id - Update a space (access validated by router.param)
	router.put("/:id", permissionMiddleware.requirePermission("spaces.edit"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const existingSpace = getReqSpace(req);
			const body = req.body as Partial<NewSpace>;

			// Guard: personal spaces cannot be renamed or have isPersonal changed
			if (existingSpace.isPersonal && body.name !== undefined && body.name !== existingSpace.name) {
				res.status(403).json({ error: "Cannot rename a personal space" });
				return;
			}

			// Never allow isPersonal to be changed via update
			const { isPersonal: _stripped, ...sanitizedBody } = body;
			const space = await spaceDao.updateSpace(existingSpace.id, sanitizedBody);
			if (space) {
				// Audit log space update
				auditLog({
					action: "update",
					resourceType: "space",
					resourceId: existingSpace.id,
					resourceName: space.name,
					actorId: userId,
					changes: computeAuditChanges(
						existingSpace as unknown as Record<string, unknown>,
						space as unknown as Record<string, unknown>,
						"space",
					),
				});

				res.json(space);
			} else {
				res.status(404).json({ error: "Space not found" });
			}
		} catch (error) {
			log.error("Failed to update space: %s", error);
			res.status(400).json({ error: "Failed to update space" });
		}
	});

	// DELETE /spaces/:id - Soft delete a space (access validated by router.param)
	// Query params:
	//   deleteContent=true - Also soft delete all docs in the space (cascade delete)
	router.delete("/:id", permissionMiddleware.requirePermission("spaces.edit"), async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			// Validate: cannot delete the last space (uses unfiltered count for org-level check)
			const allSpaces = await spaceDao.listSpaces();
			if (allSpaces.length <= 1) {
				res.status(400).json({ error: "Cannot delete the last space. At least one space must exist." });
				return;
			}

			const existingSpace = getReqSpace(req);

			// Guard: personal spaces cannot be deleted
			if (existingSpace.isPersonal) {
				res.status(403).json({ error: "Cannot delete a personal space" });
				return;
			}

			// Parse deleteContent query parameter
			const deleteContent = req.query.deleteContent === "true";

			await spaceDao.deleteSpace(existingSpace.id, deleteContent);

			// Audit log space deletion
			auditLog({
				action: "delete",
				resourceType: "space",
				resourceId: existingSpace.id,
				resourceName: existingSpace.name,
				actorId: userId,
				changes: computeAuditChanges(existingSpace as unknown as Record<string, unknown>, null, "space"),
				metadata: { deleteContent },
			});

			res.status(204).send();
		} catch (error) {
			log.error("Failed to delete space: %s", error);
			res.status(500).json({ error: "Failed to delete space" });
		}
	});

	// POST /spaces/:id/migrate-content - Migrate all content to another space (access validated by router.param)
	router.post(
		"/:id/migrate-content",
		permissionMiddleware.requirePermission("spaces.edit"),
		async (req: Request, res) => {
			try {
				const spaceDao = spaceDaoProvider.getDao(getTenantContext());
				const userId = getUserId(tokenUtil, req);
				if (isLookupError(userId)) {
					return handleLookupError(res, userId);
				}

				const sourceSpace = getReqSpace(req);

				const { targetSpaceId } = req.body as { targetSpaceId: number };
				if (!targetSpaceId || Number.isNaN(targetSpaceId)) {
					res.status(400).json({ error: "Target space ID is required" });
					return;
				}

				if (sourceSpace.id === targetSpaceId) {
					res.status(400).json({ error: "Source and target space cannot be the same" });
					return;
				}

				// Verify target space is accessible to this user
				const targetSpace = await spaceDao.getSpace(targetSpaceId, userId);
				if (!targetSpace) {
					res.status(404).json({ error: "Target space not found" });
					return;
				}

				await spaceDao.migrateContent(sourceSpace.id, targetSpaceId);

				// Audit log content migration
				auditLog({
					action: "move",
					resourceType: "space",
					resourceId: sourceSpace.id,
					resourceName: sourceSpace.name,
					actorId: userId,
					metadata: { sourceSpaceId: sourceSpace.id, targetSpaceId },
				});

				res.json({ success: true });
			} catch (error) {
				log.error("Failed to migrate content: %s", error);
				res.status(500).json({ error: "Failed to migrate content" });
			}
		},
	);

	// GET /spaces/:id/stats - Get statistics for a space (access validated by router.param)
	router.get("/:id/stats", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const space = getReqSpace(req);
			const stats = await spaceDao.getSpaceStats(space.id);
			res.json(stats);
		} catch (error) {
			log.error("Failed to get space stats: %s", error);
			res.status(500).json({ error: "Failed to get space stats" });
		}
	});

	// GET /spaces/:id/tree - Get tree content for a space (access validated by router.param)
	router.get("/:id/tree", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const space = getReqSpace(req);
			const docs = await docDao.getTreeContent(space.id);
			res.json(docs);
		} catch (error) {
			log.error("Failed to get tree content: %s", error);
			res.status(500).json({ error: "Failed to get tree content" });
		}
	});

	// GET /spaces/:id/trash - Get trash content for a space (access validated by router.param)
	router.get("/:id/trash", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const space = getReqSpace(req);
			const docs = await docDao.getTrashContent(space.id);
			res.json(docs);
		} catch (error) {
			log.error("Failed to get trash content: %s", error);
			res.status(500).json({ error: "Failed to get trash content" });
		}
	});

	// GET /spaces/:id/has-trash - Check if space has deleted docs (access validated by router.param)
	router.get("/:id/has-trash", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const space = getReqSpace(req);
			const hasTrash = await docDao.hasDeletedDocs(space.id);
			res.json({ hasTrash });
		} catch (error) {
			log.error("Failed to check trash: %s", error);
			res.status(500).json({ error: "Failed to check trash" });
		}
	});

	// POST /spaces/:id/search - Search documents in a space (access validated by router.param)
	router.post("/:id/search", permissionMiddleware.requirePermission("spaces.view"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const space = getReqSpace(req);

			const { query } = req.body;
			if (!query || typeof query !== "string" || query.trim() === "") {
				res.status(400).json({ error: "Query parameter is required" });
				return;
			}

			const response = await docDao.searchInSpace(space.id, query.trim());
			res.json(response);
		} catch (error) {
			log.error(error, "Failed to search in space %s with query '%s'", req.params.id, req.body.query);
			res.status(500).json({ error: "Search failed" });
		}
	});

	// GET /spaces/:id/preferences - Get user preferences for a space (access validated by router.param)
	router.get("/:id/preferences", permissionMiddleware.requirePermission("spaces.view"), async (req: Request, res) => {
		try {
			const userSpacePreferenceDao = userSpacePreferenceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const space = getReqSpace(req);
			const preference = await userSpacePreferenceDao.getPreference(userId, space.id);

			// Return response with null for undefined sort (JSON-compatible)
			res.json({
				sort: preference?.sort ?? null,
				filters: preference?.filters ?? { ...DEFAULT_SPACE_FILTERS },
				expandedFolders: preference?.expandedFolders ?? [],
			});
		} catch (error) {
			log.error("Failed to get preferences: %s", error);
			res.status(500).json({ error: "Failed to get preferences" });
		}
	});

	// PUT /spaces/:id/preferences - Update user preferences for a space (access validated by router.param)
	router.put("/:id/preferences", permissionMiddleware.requirePermission("spaces.view"), async (req: Request, res) => {
		try {
			const userSpacePreferenceDao = userSpacePreferenceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const space = getReqSpace(req);
			const updates: UserSpacePreferenceUpdate = {};
			const body = req.body as Record<string, unknown>;

			// Handle sort field (can be string or null in JSON body)
			if ("sort" in body) {
				const sortValue = body.sort;
				if (sortValue === null || typeof sortValue === "string") {
					// Explicit cast to SpaceSortOption | null (not undefined) for exactOptionalPropertyTypes
					updates.sort = sortValue as SpaceSortOption | null;
				}
			}

			// Handle filters field
			// TODO: Currently filters are stored here but applied on the frontend (useSpaceTree.ts).
			// The 'creator' filter matches against the Doc.createdBy field on the frontend.
			// When member/permission features are implemented, consider moving filter logic to backend
			// for better performance with large document sets and proper access control.
			if ("filters" in body && typeof body.filters === "object") {
				updates.filters = body.filters as Record<string, unknown>;
			}

			// Handle expandedFolders field
			if ("expandedFolders" in body && Array.isArray(body.expandedFolders)) {
				updates.expandedFolders = body.expandedFolders as Array<number>;
			}

			const preference = await userSpacePreferenceDao.upsertPreference(userId, space.id, updates);

			// Return response with null for undefined sort (JSON-compatible)
			res.json({
				sort: preference.sort ?? null,
				filters: preference.filters ?? { ...DEFAULT_SPACE_FILTERS },
				expandedFolders: preference.expandedFolders ?? [],
			});
		} catch (error) {
			log.error("Failed to update preferences: %s", error);
			res.status(500).json({ error: "Failed to update preferences" });
		}
	});

	return router;
}
