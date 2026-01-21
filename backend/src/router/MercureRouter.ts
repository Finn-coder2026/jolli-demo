import { getConfig } from "../config/Config";
import { createMercureService, type MercureService } from "../services/MercureService";
import { getLog } from "../util/Logger";
import express, { type Request, type Response, type Router } from "express";

const log = getLog(import.meta);

/**
 * Response for GET /api/mercure/config
 */
export interface MercureConfigResponse {
	enabled: boolean;
	hubUrl: string | null;
}

/**
 * Request body for POST /api/mercure/token
 */
export interface MercureTokenRequest {
	topics?: Array<string>;
	type?: "jobs" | "draft" | "convo";
	id?: number;
}

/**
 * Response for POST /api/mercure/token
 */
export interface MercureTokenResponse {
	token: string;
	topics: Array<string>;
}

/**
 * Creates a router for Mercure-related endpoints.
 *
 * Endpoints:
 * - GET /api/mercure/config - Returns Mercure configuration for the frontend
 * - POST /api/mercure/token - Generates a subscriber token for specified topics
 *
 * @param mercureService Optional MercureService for dependency injection (useful for testing)
 */
export function createMercureRouter(mercureService?: MercureService): Router {
	const router = express.Router();
	const service = mercureService ?? createMercureService();

	/**
	 * GET /api/mercure/config
	 * Returns Mercure configuration for the frontend to determine if Mercure is available.
	 */
	router.get("/config", (_req: Request, res: Response) => {
		try {
			const config = getConfig();
			const response: MercureConfigResponse = {
				enabled: service.isEnabled(),
				hubUrl: config.MERCURE_HUB_BASE_URL
					? `${config.MERCURE_HUB_BASE_URL.replace(/\/$/, "")}/.well-known/mercure`
					: null,
			};
			res.json(response);
			/* v8 ignore start - defensive error handling */
		} catch (error) {
			log.error(error, "Failed to get Mercure config");
			res.status(500).json({ error: "Failed to get Mercure configuration" });
		}
		/* v8 ignore stop */
	});

	/**
	 * POST /api/mercure/token
	 * Generates a subscriber JWT for the specified topics.
	 *
	 * Body options:
	 * - topics: Array of topic URIs to authorize
	 * - type + id: Shorthand to generate topics (e.g., type="draft", id=123)
	 */
	router.post("/token", (req: Request, res: Response) => {
		try {
			if (!service.isEnabled()) {
				return res.status(503).json({ error: "Mercure is not enabled" });
			}

			const body = req.body as MercureTokenRequest;
			const { topics, type, id } = body;

			let resolvedTopics: Array<string>;

			if (topics && Array.isArray(topics) && topics.length > 0) {
				// Use provided topics directly
				resolvedTopics = topics;
			} else if (type) {
				// Build topics from type/id shorthand
				switch (type) {
					case "jobs":
						resolvedTopics = [service.getJobEventsTopic()];
						break;
					case "draft":
						if (id === undefined) {
							return res.status(400).json({ error: "Draft ID required for type 'draft'" });
						}
						resolvedTopics = [service.getDraftTopic(id)];
						break;
					case "convo":
						if (id === undefined) {
							return res.status(400).json({ error: "Convo ID required for type 'convo'" });
						}
						resolvedTopics = [service.getConvoTopic(id)];
						break;
					default:
						return res.status(400).json({ error: `Invalid type: ${type}` });
				}
			} else {
				return res.status(400).json({ error: "Either 'topics' array or 'type' is required" });
			}

			const token = service.createSubscriberToken(resolvedTopics);
			const response: MercureTokenResponse = {
				token,
				topics: resolvedTopics,
			};

			res.json(response);
		} catch (error) {
			log.error(error, "Failed to create Mercure subscriber token");
			res.status(500).json({ error: "Failed to create subscriber token" });
		}
	});

	return router;
}
