import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { NewSpace } from "../model/Space";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

export function createSpaceRouter(
	spaceDaoProvider: DaoProvider<SpaceDao>,
	docDaoProvider: DaoProvider<DocDao>,
	tokenUtil: TokenUtil<UserInfo>,
): Router {
	const router = express.Router();

	// GET /spaces - List all spaces for the current user
	router.get("/", async (req: Request, res) => {
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
	router.get("/default", async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}
			const space = await spaceDao.getOrCreateDefaultSpace(userId);
			res.json(space);
		} catch (error) {
			log.error("Failed to get default space: %s", error);
			res.status(500).json({ error: "Failed to get default space" });
		}
	});

	// GET /spaces/:id - Get a space by ID
	router.get("/:id", async (req, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			const space = await spaceDao.getSpace(id);
			if (space) {
				res.json(space);
			} else {
				res.status(404).json({ error: "Space not found" });
			}
		} catch (error) {
			log.error("Failed to get space: %s", error);
			res.status(500).json({ error: "Failed to get space" });
		}
	});

	// POST /spaces - Create a new space
	router.post("/", async (req: Request, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}
			const newSpace: NewSpace = {
				...req.body,
				ownerId: userId,
			};
			const space = await spaceDao.createSpace(newSpace);
			res.status(201).json(space);
		} catch (error) {
			log.error("Failed to create space: %s", error);
			res.status(400).json({ error: "Failed to create space" });
		}
	});

	// PUT /spaces/:id - Update a space
	router.put("/:id", async (req, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			const space = await spaceDao.updateSpace(id, req.body);
			if (space) {
				res.json(space);
			} else {
				res.status(404).json({ error: "Space not found" });
			}
		} catch (error) {
			log.error("Failed to update space: %s", error);
			res.status(400).json({ error: "Failed to update space" });
		}
	});

	// DELETE /spaces/:id - Delete a space
	router.delete("/:id", async (req, res) => {
		try {
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			await spaceDao.deleteSpace(id);
			res.status(204).send();
		} catch (error) {
			log.error("Failed to delete space: %s", error);
			res.status(500).json({ error: "Failed to delete space" });
		}
	});

	// GET /spaces/:id/tree - Get tree content for a space
	router.get("/:id/tree", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(spaceId)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}

			// Get all non-deleted docs for the space (full tree)
			const docs = await docDao.getTreeContent(spaceId);
			res.json(docs);
		} catch (error) {
			log.error("Failed to get tree content: %s", error);
			res.status(500).json({ error: "Failed to get tree content" });
		}
	});

	// GET /spaces/:id/trash - Get trash content for a space
	router.get("/:id/trash", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(spaceId)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}

			const docs = await docDao.getTrashContent(spaceId);
			res.json(docs);
		} catch (error) {
			log.error("Failed to get trash content: %s", error);
			res.status(500).json({ error: "Failed to get trash content" });
		}
	});

	// GET /spaces/:id/has-trash - Check if space has deleted docs
	router.get("/:id/has-trash", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(spaceId)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}

			const hasTrash = await docDao.hasDeletedDocs(spaceId);
			res.json({ hasTrash });
		} catch (error) {
			log.error("Failed to check trash: %s", error);
			res.status(500).json({ error: "Failed to check trash" });
		}
	});

	return router;
}
