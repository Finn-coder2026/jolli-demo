import type { LogLevelService } from "../services/LogLevelService";
import { getLog } from "../util/Logger";
import crypto from "node:crypto";
import express, { type Router } from "express";
import { isValidLogLevel, type LogLevel } from "jolli-common";
import { DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS, isTimestampValid } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Options for creating the LogLevelRouter.
 */
export interface LogLevelRouterOptions {
	/** The LogLevelService instance for managing log levels */
	logLevelService: LogLevelService;
	/** The shared secret for HMAC authentication (same as BOOTSTRAP_SECRET) */
	adminSecret: string;
	/** Optional timestamp tolerance in milliseconds (default: 5 minutes) */
	timestampToleranceMs?: number;
}

/**
 * Request body for setting a log level.
 */
interface SetLogLevelRequest {
	type: "global" | "module" | "tenant-org" | "tenant-org-module";
	level?: LogLevel;
	moduleName?: string;
	tenantSlug?: string;
	orgSlug?: string;
}

/**
 * Request body for clearing a log level override.
 */
interface ClearLogLevelRequest {
	type: "module" | "tenant-org" | "tenant-org-module";
	moduleName?: string;
	tenantSlug?: string;
	orgSlug?: string;
}

/**
 * Query parameters for clearing the cache.
 */
interface ClearCacheQuery {
	type: "all" | "tenant-org";
	tenantSlug?: string;
	orgSlug?: string;
}

/**
 * Build message for HMAC signature verification.
 * Format: action:type:timestamp
 */
function buildMessage(action: string, type: string, timestamp: string): string {
	return `${action}:${type}:${timestamp}`;
}

/**
 * Verify HMAC signature for admin requests.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifySignature(
	action: string,
	type: string,
	timestamp: string,
	signature: string | undefined,
	secret: string,
): boolean {
	if (!signature?.startsWith("sha256=")) {
		return false;
	}

	const message = buildMessage(action, type, timestamp);
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(message);
	const expectedSignature = hmac.digest("hex");
	const receivedSignature = signature.substring(7); // Remove "sha256=" prefix

	if (receivedSignature.length !== expectedSignature.length) {
		return false;
	}

	return crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature));
}

/**
 * Creates the log level router with admin API endpoints.
 *
 * Endpoints:
 * - GET /api/admin/log-level - Get current log level state
 * - POST /api/admin/log-level - Set a log level (global, module, or tenant-org)
 * - DELETE /api/admin/log-level - Clear a log level override (module or tenant-org)
 *
 * All endpoints require HMAC authentication via:
 * - X-Bootstrap-Signature: sha256=<hmac_hex>
 * - X-Bootstrap-Timestamp: ISO 8601 timestamp
 */
export function createLogLevelRouter(options: LogLevelRouterOptions): Router {
	const { logLevelService, adminSecret, timestampToleranceMs = DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS } = options;
	const router = express.Router();

	/**
	 * Middleware to verify HMAC authentication.
	 */
	function requireAuth(action: string) {
		return (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const signature = req.headers["x-bootstrap-signature"] as string | undefined;
			const timestamp = req.headers["x-bootstrap-timestamp"] as string | undefined;

			// Determine the type from request body or query
			const type = (req.body?.type ?? req.query?.type ?? "global") as string;

			// Validate timestamp
			if (!isTimestampValid(timestamp, timestampToleranceMs)) {
				log.warn("Log level request with invalid or expired timestamp");
				return res.status(401).json({ error: "invalid_request" });
			}

			// Verify signature
			if (!verifySignature(action, type, timestamp as string, signature, adminSecret)) {
				log.warn("Log level request with invalid signature");
				return res.status(401).json({ error: "invalid_request" });
			}

			next();
		};
	}

	/**
	 * GET /api/admin/log-level
	 *
	 * Get the current log level state.
	 *
	 * Response:
	 * {
	 *   global: "info",
	 *   modules: { "TenantMiddleware": "debug" },
	 *   tenantOrg: { "acme:engineering": "debug" },
	 *   registeredLoggers: ["Config", "AppFactory", "TenantMiddleware", ...]
	 * }
	 */
	router.get("/", requireAuth("get"), (_req, res) => {
		const state = logLevelService.getState();
		const registeredLoggers = logLevelService.getRegisteredModules();

		res.json({
			...state,
			registeredLoggers,
		});
	});

	/**
	 * POST /api/admin/log-level
	 *
	 * Set a log level (global, module, tenant-org, or tenant-org-module).
	 *
	 * Request body:
	 * - type: "global" | "module" | "tenant-org" | "tenant-org-module"
	 * - level: LogLevel (required)
	 * - moduleName: string (required for type="module" and type="tenant-org-module")
	 * - tenantSlug: string (required for type="tenant-org" and type="tenant-org-module")
	 * - orgSlug: string (required for type="tenant-org" and type="tenant-org-module")
	 *
	 * Examples:
	 *
	 * Set global level:
	 * { "type": "global", "level": "debug" }
	 *
	 * Set module level:
	 * { "type": "module", "moduleName": "TenantMiddleware", "level": "trace" }
	 *
	 * Set tenant+org level:
	 * { "type": "tenant-org", "tenantSlug": "acme", "orgSlug": "engineering", "level": "debug" }
	 *
	 * Set tenant+org+module level:
	 * { "type": "tenant-org-module", "tenantSlug": "acme", "orgSlug": "engineering", "moduleName": "JobRouter", "level": "trace" }
	 */
	router.post("/", requireAuth("set"), async (req, res) => {
		const { type, level, moduleName, tenantSlug, orgSlug } = req.body as SetLogLevelRequest;

		// Validate level
		if (!level || !isValidLogLevel(level)) {
			return res.status(400).json({
				error: "Invalid level",
				validLevels: ["trace", "debug", "info", "warn", "error", "fatal"],
			});
		}

		try {
			switch (type) {
				case "global":
					await logLevelService.setGlobalLevel(level);
					log.info({ level }, "Global log level set via admin API");
					return res.json({ success: true, type: "global", level });

				case "module":
					if (!moduleName) {
						return res.status(400).json({ error: "moduleName required for type=module" });
					}
					await logLevelService.setModuleLevel(moduleName, level);
					log.info({ moduleName, level }, "Module log level set via admin API");
					return res.json({ success: true, type: "module", moduleName, level });

				case "tenant-org":
					if (!tenantSlug || !orgSlug) {
						return res.status(400).json({ error: "tenantSlug and orgSlug required for type=tenant-org" });
					}
					await logLevelService.setTenantOrgLevel(tenantSlug, orgSlug, level);
					log.info({ tenantSlug, orgSlug, level }, "Tenant+org log level set via admin API");
					return res.json({ success: true, type: "tenant-org", tenantSlug, orgSlug, level });

				case "tenant-org-module":
					if (!tenantSlug || !orgSlug || !moduleName) {
						return res.status(400).json({
							error: "tenantSlug, orgSlug, and moduleName required for type=tenant-org-module",
						});
					}
					await logLevelService.setTenantOrgModuleLevel(tenantSlug, orgSlug, moduleName, level);
					log.info(
						{ tenantSlug, orgSlug, moduleName, level },
						"Tenant+org+module log level set via admin API",
					);
					return res.json({
						success: true,
						type: "tenant-org-module",
						tenantSlug,
						orgSlug,
						moduleName,
						level,
					});

				default:
					return res.status(400).json({
						error: "Invalid type",
						validTypes: ["global", "module", "tenant-org", "tenant-org-module"],
					});
			}
		} catch (error) {
			log.error(error, "Failed to set log level");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Failed to set log level", details: message });
		}
	});

	/**
	 * DELETE /api/admin/log-level
	 *
	 * Clear a log level override (module, tenant-org, or tenant-org-module).
	 * Cannot clear global level (use POST with type="global" to change it).
	 *
	 * Request body:
	 * - type: "module" | "tenant-org" | "tenant-org-module"
	 * - moduleName: string (required for type="module" and type="tenant-org-module")
	 * - tenantSlug: string (required for type="tenant-org" and type="tenant-org-module")
	 * - orgSlug: string (required for type="tenant-org" and type="tenant-org-module")
	 */
	router.delete("/", requireAuth("clear"), async (req, res) => {
		const { type, moduleName, tenantSlug, orgSlug } = req.body as ClearLogLevelRequest;

		try {
			switch (type) {
				case "module":
					if (!moduleName) {
						return res.status(400).json({ error: "moduleName required for type=module" });
					}
					await logLevelService.setModuleLevel(moduleName, null);
					log.info({ moduleName }, "Module log level override cleared via admin API");
					return res.json({ success: true, type: "module", moduleName, cleared: true });

				case "tenant-org":
					if (!tenantSlug || !orgSlug) {
						return res.status(400).json({ error: "tenantSlug and orgSlug required for type=tenant-org" });
					}
					await logLevelService.setTenantOrgLevel(tenantSlug, orgSlug, null);
					log.info({ tenantSlug, orgSlug }, "Tenant+org log level override cleared via admin API");
					return res.json({ success: true, type: "tenant-org", tenantSlug, orgSlug, cleared: true });

				case "tenant-org-module":
					if (!tenantSlug || !orgSlug || !moduleName) {
						return res.status(400).json({
							error: "tenantSlug, orgSlug, and moduleName required for type=tenant-org-module",
						});
					}
					await logLevelService.setTenantOrgModuleLevel(tenantSlug, orgSlug, moduleName, null);
					log.info(
						{ tenantSlug, orgSlug, moduleName },
						"Tenant+org+module log level override cleared via admin API",
					);
					return res.json({
						success: true,
						type: "tenant-org-module",
						tenantSlug,
						orgSlug,
						moduleName,
						cleared: true,
					});

				default:
					return res.status(400).json({
						error: "Invalid type for DELETE (only module, tenant-org, and tenant-org-module can be cleared)",
						validTypes: ["module", "tenant-org", "tenant-org-module"],
					});
			}
		} catch (error) {
			log.error(error, "Failed to clear log level override");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Failed to clear log level", details: message });
		}
	});

	/**
	 * DELETE /api/admin/log-level/cache
	 *
	 * Clear the persisted log level cache.
	 *
	 * Query parameters:
	 * - type: "all" | "tenant-org"
	 * - tenantSlug: string (required for type="tenant-org")
	 * - orgSlug: string (required for type="tenant-org")
	 *
	 * Examples:
	 * - Clear all overrides: DELETE /api/admin/log-level/cache?type=all
	 * - Clear specific tenant-org: DELETE /api/admin/log-level/cache?type=tenant-org&tenantSlug=acme&orgSlug=engineering
	 */
	router.delete("/cache", requireAuth("clear-cache"), async (req, res) => {
		const { type, tenantSlug, orgSlug } = req.query as unknown as ClearCacheQuery;

		try {
			switch (type) {
				case "all":
					await logLevelService.clearAll();
					log.info("All log level overrides cleared via admin API");
					return res.json({ success: true, type: "all", cleared: true });

				case "tenant-org":
					if (!tenantSlug || !orgSlug) {
						return res.status(400).json({
							error: "tenantSlug and orgSlug required for type=tenant-org",
						});
					}
					await logLevelService.clearTenantOrg(tenantSlug, orgSlug);
					log.info({ tenantSlug, orgSlug }, "Tenant+org log level overrides cleared via admin API");
					return res.json({ success: true, type: "tenant-org", tenantSlug, orgSlug, cleared: true });

				default:
					return res.status(400).json({
						error: "Invalid type",
						validTypes: ["all", "tenant-org"],
					});
			}
		} catch (error) {
			log.error(error, "Failed to clear log level cache");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Failed to clear log level cache", details: message });
		}
	});

	return router;
}

/**
 * Utility to create HMAC auth headers for log level admin requests.
 * Use this in client code or tests.
 *
 * @param action - The action being performed ("get", "set", or "clear")
 * @param type - The type of level operation ("global", "module", or "tenant-org")
 * @param secret - The admin secret for HMAC signing
 * @returns Object with X-Bootstrap-Signature and X-Bootstrap-Timestamp headers
 */
export function createLogLevelAuthHeaders(
	action: string,
	type: string,
	secret: string,
): {
	"X-Bootstrap-Signature": string;
	"X-Bootstrap-Timestamp": string;
} {
	const timestamp = new Date().toISOString();
	const message = buildMessage(action, type, timestamp);
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(message);
	const signature = `sha256=${hmac.digest("hex")}`;

	return {
		"X-Bootstrap-Signature": signature,
		"X-Bootstrap-Timestamp": timestamp,
	};
}
