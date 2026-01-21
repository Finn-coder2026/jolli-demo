import type { ConvoDao } from "../dao/ConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { NewConvo } from "../model/Convo";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Helper to extract user identity from request.
 * In multi-tenant mode, prefers the org-specific user ID from req.orgUser.
 * Falls back to the JWT userId for single-tenant mode.
 */
function getUserIdentity(
	req: Request,
	tokenUtil: TokenUtil<UserInfo>,
): { userId: number | undefined; visitorId: string | undefined } {
	// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
	const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
	const visitorId = req.cookies.visitorId;
	return { userId, visitorId };
}

/**
 * Generate a title from the first user message (truncated to 50 chars)
 */
function generateTitle(firstMessage: string): string {
	const truncated = firstMessage.trim().slice(0, 50);
	return truncated.length < firstMessage.trim().length ? `${truncated}...` : truncated;
}

export function createConvoRouter(convoDaoProvider: DaoProvider<ConvoDao>, tokenUtil: TokenUtil<UserInfo>): Router {
	const router = express.Router();

	// POST /api/convos - Create new conversation
	router.post("/", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			const { title, messages = [] } = req.body;

			// Auto-generate title from first user message if not provided
			const finalTitle =
				title ||
				(messages.length > 0 && messages[0].role === "user"
					? generateTitle(messages[0].content)
					: "New Conversation");

			const newConvo: NewConvo = {
				userId,
				visitorId,
				title: finalTitle,
				messages,
			};

			const convo = await convoDao.createConvo(newConvo);
			res.status(201).json(convo);
		} catch (error) {
			log.error(error, "Error creating convo.");
			res.status(500).json({ error: "Failed to create convo" });
		}
	});

	// GET /api/convos - List all conversations for current user
	router.get("/", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			const convos = await convoDao.listConvos(userId, visitorId);
			res.json(convos);
		} catch (error) {
			log.error(error, "Error listing convos.");
			res.status(500).json({ error: "Failed to list convos" });
		}
	});

	// GET /api/convos/:id - Get specific conversation
	router.get("/:id", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);
			const id = Number.parseInt(req.params.id);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await convoDao.getConvo(id, userId, visitorId);

			if (!convo) {
				return res.status(404).json({ error: "Convo not found" });
			}

			res.json(convo);
		} catch (error) {
			log.error(error, "Error getting convo.");
			res.status(500).json({ error: "Failed to get convo" });
		}
	});

	// PATCH /api/convos/:id - Update convo (title or messages)
	router.patch("/:id", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);
			const id = Number.parseInt(req.params.id);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { title, messages } = req.body;

			if (!title && !messages) {
				return res.status(400).json({ error: "Must provide title or messages" });
			}

			const updates: { title?: string; messages?: Array<{ role: "user" | "assistant"; content: string }> } = {};
			if (title) {
				updates.title = title;
			}
			if (messages) {
				// Validate messages format
				if (
					!Array.isArray(messages) ||
					!messages.every(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
				) {
					return res.status(400).json({ error: "Invalid messages format" });
				}
				updates.messages = messages;
			}

			const convo = await convoDao.updateConvo(id, updates, userId, visitorId);

			if (!convo) {
				return res.status(404).json({ error: "Convo not found" });
			}

			res.json(convo);
		} catch (error) {
			log.error(error, "Error updating convo.");
			res.status(500).json({ error: "Failed to update convo" });
		}
	});

	// DELETE /api/convos/:id - Delete conversation
	router.delete("/:id", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);
			const id = Number.parseInt(req.params.id);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const deleted = await convoDao.deleteConvo(id, userId, visitorId);

			if (!deleted) {
				return res.status(404).json({ error: "Convo not found" });
			}

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error deleting convo.");
			res.status(500).json({ error: "Failed to delete convo" });
		}
	});

	// POST /api/convos/:id/messages - Add a message to conversation
	router.post("/:id/messages", async (req: Request, res: Response) => {
		try {
			const convoDao = convoDaoProvider.getDao(getTenantContext());
			const { userId, visitorId } = getUserIdentity(req, tokenUtil);
			const id = Number.parseInt(req.params.id);

			if (!userId && !visitorId) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { role, content } = req.body;

			if (!role || !content) {
				return res.status(400).json({ error: "Message must have role and content" });
			}

			if (role !== "user" && role !== "assistant") {
				return res.status(400).json({ error: "Invalid message role" });
			}

			const convo = await convoDao.addMessage(id, { role, content }, userId, visitorId);

			if (!convo) {
				return res.status(404).json({ error: "Convo not found" });
			}

			res.json(convo);
		} catch (error) {
			log.error(error, "Error adding message.");
			res.status(500).json({ error: "Failed to add message" });
		}
	});

	return router;
}
