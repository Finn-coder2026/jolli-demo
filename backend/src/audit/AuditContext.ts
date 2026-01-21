import type { AuditActorType } from "../model/AuditEvent";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request } from "express";

/**
 * Context for the current request that will be used for audit logging.
 * This is stored in AsyncLocalStorage and available throughout the request lifecycle.
 */
export interface AuditRequestContext {
	/** Unique identifier for this request */
	readonly requestId: string;
	/** The user ID who performed the action (null for unauthenticated requests) */
	readonly actorId: number | null;
	/** Email of the actor */
	readonly actorEmail: string | null;
	/** Type of actor performing the action */
	readonly actorType: AuditActorType;
	/** IP address of the actor */
	readonly actorIp: string | null;
	/** Device/user-agent of the actor */
	readonly actorDevice: string | null;
	/** HTTP method of the request */
	readonly httpMethod: string;
	/** Endpoint path of the request */
	readonly endpoint: string;
}

/**
 * Mutable context that can be updated during request processing
 */
interface MutableAuditContext {
	requestId: string;
	actorId: number | null;
	actorEmail: string | null;
	actorType: AuditActorType;
	actorIp: string | null;
	actorDevice: string | null;
	httpMethod: string;
	endpoint: string;
}

/** AsyncLocalStorage instance for request-scoped audit context */
const auditContextStorage = new AsyncLocalStorage<MutableAuditContext>();

/**
 * Get the current audit context, if available.
 * Returns undefined if called outside of an audit context.
 */
export function getAuditContext(): AuditRequestContext | undefined {
	return auditContextStorage.getStore();
}

/**
 * Get the current audit context, throwing if not available.
 * Use this when audit context is required.
 */
export function requireAuditContext(): AuditRequestContext {
	const ctx = auditContextStorage.getStore();
	if (!ctx) {
		throw new Error("Audit context not initialized. This endpoint requires audit middleware.");
	}
	return ctx;
}

/**
 * Run a function within an audit context.
 * The context will be available to all code executed within the function,
 * including async operations.
 */
export function runWithAuditContext<T>(context: AuditRequestContext, fn: () => T): T {
	// Create a mutable copy for the storage
	const mutableContext: MutableAuditContext = { ...context };
	return auditContextStorage.run(mutableContext, fn);
}

/**
 * Update the actor information in the current audit context.
 * This is typically called after authentication to add user details.
 */
export function updateAuditContextActor(actor: {
	actorId: number | null;
	actorEmail: string | null;
	actorType?: AuditActorType;
}): void {
	const ctx = auditContextStorage.getStore();
	if (ctx) {
		ctx.actorId = actor.actorId;
		ctx.actorEmail = actor.actorEmail;
		if (actor.actorType !== undefined) {
			ctx.actorType = actor.actorType;
		}
	}
}

/**
 * Create an initial audit context from request information.
 * Actor information will be populated later after authentication.
 */
export function createInitialAuditContext(req: Request): AuditRequestContext {
	// Get the client IP address (handle proxied requests)
	const forwardedFor = req.headers["x-forwarded-for"];
	const clientIp = forwardedFor
		? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0]).trim()
		: req.ip || req.socket?.remoteAddress || null;

	return {
		requestId: (req.headers["x-request-id"] as string) || randomUUID(),
		actorId: null, // Will be set after authentication
		actorEmail: null, // Will be set after authentication
		actorType: "user", // Default, can be changed
		actorIp: clientIp,
		actorDevice: (req.headers["user-agent"] as string) || null,
		httpMethod: req.method,
		endpoint: req.originalUrl,
	};
}
