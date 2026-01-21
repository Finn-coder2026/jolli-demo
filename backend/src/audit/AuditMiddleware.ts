import { getLog } from "../util/Logger";
import { createInitialAuditContext, runWithAuditContext, updateAuditContextActor } from "./AuditContext";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const log = getLog(import.meta);

/**
 * Middleware that initializes the audit context for each request.
 * This captures request metadata (IP, user-agent, request ID) early in the pipeline.
 * Actor information is populated later after authentication.
 */
export function createAuditMiddleware(): RequestHandler {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const context = createInitialAuditContext(req);

		log.debug(
			{ requestId: context.requestId, method: context.httpMethod, path: context.endpoint },
			"Audit context initialized",
		);

		// Run the rest of the request within the audit context
		runWithAuditContext(context, () => {
			next();
		});
	};
}

/**
 * Middleware that updates the audit context with authenticated user information.
 * This should be called after authentication middleware has identified the user.
 */
export function createAuditUserMiddleware(): RequestHandler {
	return (req: Request, _res: Response, next: NextFunction): void => {
		// Get user info from orgUser (multi-tenant) or from request
		const orgUser = req.orgUser;

		if (orgUser) {
			updateAuditContextActor({
				actorId: orgUser.id,
				actorEmail: orgUser.email,
				actorType: "user",
			});
			log.debug({ actorId: orgUser.id, actorEmail: orgUser.email }, "Audit context updated with user info");
		}

		next();
	};
}

/**
 * Middleware that marks the actor as a system actor.
 * Use this for endpoints that are called by internal systems.
 */
export function createSystemActorMiddleware(): RequestHandler {
	return (_req: Request, _res: Response, next: NextFunction): void => {
		updateAuditContextActor({
			actorId: null,
			actorEmail: null,
			actorType: "system",
		});
		next();
	};
}

/**
 * Middleware that marks the actor as a webhook actor.
 * Use this for webhook endpoints.
 */
export function createWebhookActorMiddleware(): RequestHandler {
	return (_req: Request, _res: Response, next: NextFunction): void => {
		updateAuditContextActor({
			actorId: null,
			actorEmail: null,
			actorType: "webhook",
		});
		next();
	};
}

/**
 * Middleware that marks the actor as a scheduler/cron actor.
 * Use this for scheduled job endpoints.
 */
export function createSchedulerActorMiddleware(): RequestHandler {
	return (_req: Request, _res: Response, next: NextFunction): void => {
		updateAuditContextActor({
			actorId: null,
			actorEmail: null,
			actorType: "scheduler",
		});
		next();
	};
}
