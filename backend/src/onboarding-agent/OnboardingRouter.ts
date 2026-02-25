/**
 * OnboardingRouter - API endpoints for first-login onboarding.
 *
 * Provides endpoints for:
 * - GET /api/onboarding - Get current onboarding state
 * - POST /api/onboarding/chat - Chat with agent (SSE stream)
 * - POST /api/onboarding/skip - Skip onboarding
 * - POST /api/onboarding/complete - Complete onboarding
 * - POST /api/onboarding/restart - Restart onboarding (soft reset)
 */

import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import type { UserOnboarding } from "../model/UserOnboarding";
import { createMercureService, type MercureService } from "../services/MercureService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import { createOnboardingAgentFsm, type OnboardingAgentFsmConfig } from "./OnboardingAgentFsm";
import express, { type Request, type Response, type Router } from "express";
import type {
	GetOnboardingResponse,
	OnboardingActionResponse,
	OnboardingChatRequest,
	OnboardingState,
	UserInfo,
} from "jolli-common";

const log = getLog(import.meta);

/**
 * Dependencies for the onboarding router.
 */
export interface OnboardingRouterDeps {
	userOnboardingDaoProvider: DaoProvider<UserOnboardingDao>;
	tokenUtil: TokenUtil<UserInfo>;
	/** Anthropic API key for the LLM agent */
	anthropicApiKey?: string;
	/** Optional model override */
	anthropicModel?: string;
	/** Optional MercureService for real-time event publishing */
	mercureService?: MercureService;
	// Phase 3: DAO providers for real GitHub integration
	/** Integration DAO provider */
	integrationDaoProvider?: DaoProvider<IntegrationDao>;
	/** Doc DAO provider */
	docDaoProvider?: DaoProvider<DocDao>;
	/** GitHub Installation DAO provider */
	githubInstallationDaoProvider?: DaoProvider<GitHubInstallationDao>;
	/** Space DAO provider */
	spaceDaoProvider?: DaoProvider<SpaceDao>;
	// Phase 4: DAO providers for smart import with update detection
	/** Doc Draft DAO provider */
	docDraftDaoProvider?: DaoProvider<DocDraftDao>;
	/** Section Changes DAO provider */
	docDraftSectionChangesDaoProvider?: DaoProvider<DocDraftSectionChangesDao>;
	/** User Preference DAO provider for managing favorites */
	userPreferenceDaoProvider?: DaoProvider<UserPreferenceDao>;
}

/**
 * Creates the onboarding router.
 */
export function createOnboardingRouter(deps: OnboardingRouterDeps): Router {
	const router = express.Router();
	const {
		userOnboardingDaoProvider,
		tokenUtil,
		anthropicApiKey,
		anthropicModel,
		mercureService,
		integrationDaoProvider,
		docDaoProvider,
		githubInstallationDaoProvider,
		spaceDaoProvider,
		docDraftDaoProvider,
		docDraftSectionChangesDaoProvider,
		userPreferenceDaoProvider,
	} = deps;
	const mercure = mercureService ?? createMercureService();

	/**
	 * Get user ID from request (orgUser for multi-tenant, token for single-tenant).
	 */
	function getUserId(req: Request): number | undefined {
		return req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
	}

	/**
	 * Map a database UserOnboarding record to the API OnboardingState type.
	 * Converts nullable dates to undefined for JSON serialization.
	 */
	function toApiState(record: UserOnboarding): OnboardingState {
		return {
			...record,
			skippedAt: record.skippedAt ?? undefined,
			completedAt: record.completedAt ?? undefined,
		};
	}

	/**
	 * Shared handler for onboarding action endpoints (skip, complete, restart).
	 * Authenticates the user, ensures an onboarding record exists, calls the DAO
	 * action, and returns a consistent OnboardingActionResponse.
	 */
	async function handleAction(
		req: Request,
		res: Response,
		actionName: string,
		daoAction: (dao: UserOnboardingDao, userId: number) => Promise<UserOnboarding | undefined>,
	): Promise<void> {
		try {
			const userId = getUserId(req);
			if (!userId) {
				res.status(401).json({ error: "unauthorized" });
				return;
			}

			const context = getTenantContext();
			const dao = userOnboardingDaoProvider.getDao(context);

			await dao.getOrCreate(userId);

			const state = await daoAction(dao, userId);

			if (!state) {
				res.status(500).json({ error: "update_failed" });
				return;
			}

			const response: OnboardingActionResponse = {
				success: true,
				state: toApiState(state),
			};

			res.json(response);
		} catch (error) {
			log.error(error, "Failed to %s onboarding", actionName);
			res.status(500).json({ error: "server_error" });
		}
	}

	/**
	 * GET /api/onboarding
	 * Get the current onboarding state for the user.
	 */
	router.get("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(req);
			if (!userId) {
				res.status(401).json({ error: "unauthorized" });
				return;
			}

			const context = getTenantContext();
			const dao = userOnboardingDaoProvider.getDao(context);

			log.info("Checking onboarding state for userId=%d, schema=%s", userId, context?.schemaName ?? "default");

			const state = await dao.getByUserId(userId);

			log.info(
				"Onboarding state result: userId=%d, state=%s, status=%s",
				userId,
				state ? "found" : "not_found",
				state?.status ?? "N/A",
			);

			// User needs onboarding if they have no record or status is not_started/in_progress
			const needsOnboarding = !state || state.status === "not_started" || state.status === "in_progress";

			const response: GetOnboardingResponse = {
				state: state ? toApiState(state) : undefined,
				needsOnboarding,
			};

			res.json(response);
		} catch (error) {
			log.error(error, "Failed to get onboarding state");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * POST /api/onboarding/chat
	 * Chat with the onboarding agent. Streams response via SSE.
	 */
	router.post("/chat", async (req: Request, res: Response) => {
		const userId = getUserId(req);
		if (!userId) {
			res.status(401).json({ error: "unauthorized" });
			return;
		}

		try {
			const { message, history = [] } = req.body as OnboardingChatRequest;

			if (!message || typeof message !== "string") {
				res.status(400).json({ error: "message_required" });
				return;
			}

			const context = getTenantContext();
			const dao = userOnboardingDaoProvider.getDao(context);

			// Ensure user has an onboarding record
			await dao.getOrCreate(userId);

			// Update status to in_progress if not_started
			const currentState = await dao.getByUserId(userId);
			if (currentState && currentState.status === "not_started") {
				await dao.update(userId, { status: "in_progress" });
			}

			// Set SSE headers and flush immediately to establish the connection.
			// Without flushHeaders(), the response isn't sent until the first write,
			// which causes proxy chains (nginx → vite) to buffer the stream.
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");
			res.flushHeaders();

			// Create agent config — API key is optional; the FSM uses deterministic
			// pattern matching for ~90% of intents and only needs the LLM as a fallback.
			if (!anthropicApiKey) {
				log.warn("Anthropic API key not configured — LLM intent fallback disabled");
			}
			const agentConfig: OnboardingAgentFsmConfig = {
				...(anthropicApiKey && { apiKey: anthropicApiKey }),
				...(anthropicModel && { model: anthropicModel }),
			};

			// Build agent deps with available DAOs
			const agentDeps = buildAgentDeps(dao, userId, context);

			// Create FSM agent and stream response
			const agent = createOnboardingAgentFsm(agentConfig, agentDeps);

			for await (const event of agent.chat(message, history)) {
				// Send SSE event
				res.write(`data: ${JSON.stringify(event)}\n\n`);

				// Also publish to Mercure (fire-and-forget)
				if (mercure.isEnabled()) {
					mercure.publishOnboardingEvent(userId, event.type, event).catch(err => {
						log.warn(err, "Failed to publish onboarding event to Mercure");
					});
				}
			}

			// End stream
			res.write("data: [DONE]\n\n");
			res.end();
		} catch (error) {
			log.error(error, "Onboarding chat error");

			// If headers already sent, try to send error event
			if (res.headersSent) {
				try {
					res.write(`data: ${JSON.stringify({ type: "error", error: "server_error" })}\n\n`);
					res.end();
				} catch {
					// Connection already closed
				}
			} else {
				res.status(500).json({ error: "server_error" });
			}
		}
	});

	/** POST /api/onboarding/skip - Skip the onboarding process. */
	router.post("/skip", (req, res) => handleAction(req, res, "skip", (dao, uid) => dao.skip(uid)));

	/** POST /api/onboarding/complete - Complete the onboarding process. */
	router.post("/complete", (req, res) => handleAction(req, res, "complete", (dao, uid) => dao.complete(uid)));

	/** POST /api/onboarding/restart - Restart onboarding (soft reset, preserves progress data). */
	router.post("/restart", (req, res) => handleAction(req, res, "restart", (dao, uid) => dao.restart(uid)));

	/**
	 * Build agent deps from available DAO providers.
	 */
	function buildAgentDeps(
		dao: UserOnboardingDao,
		userId: number,
		context: ReturnType<typeof getTenantContext>,
	): Parameters<typeof createOnboardingAgentFsm>[1] {
		const agentDeps: Parameters<typeof createOnboardingAgentFsm>[1] = {
			userOnboardingDao: dao,
			userId,
		};
		if (integrationDaoProvider) {
			agentDeps.integrationDao = integrationDaoProvider.getDao(context);
		}
		if (docDaoProvider) {
			agentDeps.docDao = docDaoProvider.getDao(context);
		}
		if (githubInstallationDaoProvider) {
			agentDeps.githubInstallationDao = githubInstallationDaoProvider.getDao(context);
		}
		if (spaceDaoProvider) {
			agentDeps.spaceDao = spaceDaoProvider.getDao(context);
		}
		if (docDraftDaoProvider) {
			agentDeps.docDraftDao = docDraftDaoProvider.getDao(context);
		}
		if (docDraftSectionChangesDaoProvider) {
			agentDeps.docDraftSectionChangesDao = docDraftSectionChangesDaoProvider.getDao(context);
		}
		if (userPreferenceDaoProvider) {
			agentDeps.userPreferenceDao = userPreferenceDaoProvider.getDao(context);
		}
		return agentDeps;
	}

	return router;
}
