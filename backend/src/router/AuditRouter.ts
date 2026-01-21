import type { AuditService } from "../audit/AuditService";
import type { AuditEventDao, AuditFilterOptions } from "../dao/AuditEventDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { AuditAction, AuditEvent, AuditResourceType } from "../model/AuditEvent";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";

const log = getLog(import.meta);

export interface AuditRouterOptions {
	readonly auditEventDaoProvider: DaoProvider<AuditEventDao>;
	readonly auditService: AuditService;
}

/**
 * Create the audit router for querying and managing audit events.
 * All endpoints require authentication (via authHandler middleware).
 */
export function createAuditRouter(options: AuditRouterOptions): Router {
	const { auditEventDaoProvider, auditService } = options;
	const router = express.Router();

	/**
	 * GET /api/audit
	 * List audit events with optional filters
	 * Query params:
	 *   - actorId: Filter by actor ID
	 *   - action: Filter by action type
	 *   - resourceType: Filter by resource type
	 *   - resourceId: Filter by resource ID
	 *   - startDate: Filter events after this date (ISO string)
	 *   - endDate: Filter events before this date (ISO string)
	 *   - limit: Max records to return (default 50, max 1000)
	 *   - offset: Number of records to skip
	 */
	router.get("/", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());

			const filters: AuditFilterOptions = {
				limit: Math.min(Number(req.query.limit) || 50, 1000),
				offset: Number(req.query.offset) || 0,
				orderBy: "timestamp",
				orderDir: "DESC",
			};

			if (req.query.actorId) {
				(filters as Record<string, unknown>).actorId = Number(req.query.actorId);
			}
			if (req.query.action) {
				(filters as Record<string, unknown>).action = req.query.action as AuditAction;
			}
			if (req.query.resourceType) {
				(filters as Record<string, unknown>).resourceType = req.query.resourceType as AuditResourceType;
			}
			if (req.query.resourceId) {
				(filters as Record<string, unknown>).resourceId = req.query.resourceId as string;
			}
			if (req.query.startDate) {
				(filters as Record<string, unknown>).startDate = new Date(req.query.startDate as string);
			}
			if (req.query.endDate) {
				(filters as Record<string, unknown>).endDate = new Date(req.query.endDate as string);
			}

			const [events, total] = await Promise.all([auditEventDao.query(filters), auditEventDao.count(filters)]);

			res.json({
				events,
				total,
				limit: filters.limit,
				offset: filters.offset,
			});
		} catch (error) {
			log.error(error, "Failed to query audit events");
			res.status(500).json({ error: "Failed to query audit events" });
		}
	});

	/**
	 * GET /api/audit/export
	 * Export audit events as JSON or CSV
	 * Query params same as GET /api/audit plus:
	 *   - format: 'json' (default) or 'csv'
	 *   - decrypt: 'true' to decrypt PII fields
	 *
	 * NOTE: This route must be defined BEFORE /:id to avoid matching "export" as an ID
	 */
	router.get("/export", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const format = (req.query.format as string) || "json";
			const decrypt = req.query.decrypt === "true";

			const filters: AuditFilterOptions = {
				limit: Math.min(Number(req.query.limit) || 10000, 100000),
				offset: Number(req.query.offset) || 0,
				orderBy: "timestamp",
				orderDir: "DESC",
			};

			if (req.query.actorId) {
				(filters as Record<string, unknown>).actorId = Number(req.query.actorId);
			}
			if (req.query.action) {
				(filters as Record<string, unknown>).action = req.query.action as AuditAction;
			}
			if (req.query.resourceType) {
				(filters as Record<string, unknown>).resourceType = req.query.resourceType as AuditResourceType;
			}
			if (req.query.resourceId) {
				(filters as Record<string, unknown>).resourceId = req.query.resourceId as string;
			}
			if (req.query.startDate) {
				(filters as Record<string, unknown>).startDate = new Date(req.query.startDate as string);
			}
			if (req.query.endDate) {
				(filters as Record<string, unknown>).endDate = new Date(req.query.endDate as string);
			}

			let events = await auditEventDao.query(filters);

			// Decrypt PII if requested
			if (decrypt) {
				events = events.map(event => ({
					...event,
					actorEmail: event.actorEmail ? auditService.decryptPii(event.actorEmail) : null,
					actorIp: event.actorIp ? auditService.decryptPii(event.actorIp) : null,
					actorDevice: event.actorDevice ? auditService.decryptPii(event.actorDevice) : null,
					changes: auditService.decryptChanges(event.changes, event.resourceType),
				}));
			}

			if (format === "csv") {
				const csv = convertToCSV(events);
				res.setHeader("Content-Type", "text/csv");
				res.setHeader("Content-Disposition", "attachment; filename=audit-events.csv");
				res.send(csv);
			} else {
				res.setHeader("Content-Type", "application/json");
				res.setHeader("Content-Disposition", "attachment; filename=audit-events.json");
				res.json(events);
			}
		} catch (error) {
			log.error(error, "Failed to export audit events");
			res.status(500).json({ error: "Failed to export audit events" });
		}
	});

	/**
	 * GET /api/audit/resource/:type/:id
	 * Get audit events for a specific resource
	 *
	 * NOTE: This route must be defined BEFORE /:id to avoid matching "resource" as an ID
	 */
	router.get("/resource/:type/:resourceId", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const resourceType = req.params.type as AuditResourceType;
			const resourceId = req.params.resourceId;
			const limit = Math.min(Number(req.query.limit) || 50, 1000);
			const offset = Number(req.query.offset) || 0;

			const events = await auditEventDao.getByResource(resourceType, resourceId, {
				limit,
				offset,
				orderBy: "timestamp",
				orderDir: "DESC",
			});

			res.json({ events, resourceType, resourceId });
		} catch (error) {
			log.error(error, "Failed to get audit events for resource");
			res.status(500).json({ error: "Failed to get audit events for resource" });
		}
	});

	/**
	 * GET /api/audit/user/:userId
	 * Get audit events for a specific user (actor)
	 *
	 * NOTE: This route must be defined BEFORE /:id to avoid matching "user" as an ID
	 */
	router.get("/user/:userId", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const actorId = Number(req.params.userId);
			const limit = Math.min(Number(req.query.limit) || 50, 1000);
			const offset = Number(req.query.offset) || 0;

			if (Number.isNaN(actorId)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			const events = await auditEventDao.getByActor(actorId, {
				limit,
				offset,
				orderBy: "timestamp",
				orderDir: "DESC",
			});

			res.json({ events, actorId });
		} catch (error) {
			log.error(error, "Failed to get audit events for user");
			res.status(500).json({ error: "Failed to get audit events for user" });
		}
	});

	/**
	 * GET /api/audit/:id
	 * Get a single audit event by ID
	 */
	router.get("/:id", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const id = Number(req.params.id);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid audit event ID" });
				return;
			}

			const event = await auditEventDao.getById(id);
			if (!event) {
				res.status(404).json({ error: "Audit event not found" });
				return;
			}

			res.json(event);
		} catch (error) {
			log.error(error, "Failed to get audit event");
			res.status(500).json({ error: "Failed to get audit event" });
		}
	});

	/**
	 * GET /api/audit/:id/decrypted
	 * Get a single audit event by ID with PII fields decrypted
	 */
	router.get("/:id/decrypted", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const id = Number(req.params.id);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid audit event ID" });
				return;
			}

			const event = await auditEventDao.getById(id);
			if (!event) {
				res.status(404).json({ error: "Audit event not found" });
				return;
			}

			// Decrypt PII fields
			const decryptedEvent: AuditEvent = {
				...event,
				actorEmail: event.actorEmail ? auditService.decryptPii(event.actorEmail) : null,
				actorIp: event.actorIp ? auditService.decryptPii(event.actorIp) : null,
				actorDevice: event.actorDevice ? auditService.decryptPii(event.actorDevice) : null,
				changes: auditService.decryptChanges(event.changes, event.resourceType),
			};

			res.json(decryptedEvent);
		} catch (error) {
			log.error(error, "Failed to get decrypted audit event");
			res.status(500).json({ error: "Failed to get decrypted audit event" });
		}
	});

	/**
	 * POST /api/audit/:id/verify
	 * Verify the integrity of an audit event by recomputing its hash
	 */
	router.post("/:id/verify", async (req, res) => {
		try {
			const auditEventDao = auditEventDaoProvider.getDao(getTenantContext());
			const id = Number(req.params.id);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid audit event ID" });
				return;
			}

			const isValid = await auditEventDao.verifyEventIntegrity(id);

			res.json({ id, valid: isValid });
		} catch (error) {
			log.error(error, "Failed to verify audit event integrity");
			res.status(500).json({ error: "Failed to verify audit event integrity" });
		}
	});

	return router;
}

/**
 * Convert audit events to CSV format
 */
function convertToCSV(events: Array<AuditEvent>): string {
	const headers = [
		"id",
		"timestamp",
		"actorId",
		"actorType",
		"actorEmail",
		"actorIp",
		"action",
		"resourceType",
		"resourceId",
		"resourceName",
		"changes",
		"metadata",
	];

	const rows = events.map(event => [
		event.id,
		event.timestamp.toISOString(),
		event.actorId ?? "",
		event.actorType,
		event.actorEmail ?? "",
		event.actorIp ?? "",
		event.action,
		event.resourceType,
		event.resourceId,
		event.resourceName ?? "",
		event.changes ? JSON.stringify(event.changes) : "",
		event.metadata ? JSON.stringify(event.metadata) : "",
	]);

	const csvContent = [headers.join(","), ...rows.map(row => row.map(escapeCSV).join(","))].join("\n");

	return csvContent;
}

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: unknown): string {
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}
