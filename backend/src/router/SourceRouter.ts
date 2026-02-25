import type { DaoProvider } from "../dao/DaoProvider";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { SourceDao } from "../dao/SourceDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { NewSource } from "../model/Source";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import express, { type Request, type Router } from "express";
import type { SourceKind } from "jolli-common";

const log = getLog(import.meta);

export interface SourceRouterDeps {
	sourceDaoProvider: DaoProvider<SourceDao>;
	integrationDaoProvider: DaoProvider<IntegrationDao>;
}

export interface SpaceSourceRouterDeps {
	sourceDaoProvider: DaoProvider<SourceDao>;
	spaceDaoProvider: DaoProvider<SpaceDao>;
}

/**
 * Source router — top-level source CRUD and space-source binding endpoints.
 *
 * Sources endpoints:
 *   GET    /sources           — list all sources
 *   POST   /sources           — create a source
 *   GET    /sources/:id       — get a source
 *   PATCH  /sources/:id       — update a source
 *   DELETE /sources/:id       — delete a source
 *   PATCH  /sources/:id/cursor — advance cursor
 *
 * Space-source binding endpoints:
 *   GET    /spaces/:spaceId/sources              — list sources for space
 *   POST   /spaces/:spaceId/sources              — bind source to space
 *   DELETE /spaces/:spaceId/sources/:sourceId    — unbind source from space
 */
export function createSourceRouter(deps: SourceRouterDeps): Router {
	const { sourceDaoProvider, integrationDaoProvider } = deps;
	const router = express.Router();

	// --- Source CRUD ---

	// GET /sources — list all sources
	router.get("/", async (_req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const sources = await sourceDao.listSources();
			res.json(sources);
		} catch (error) {
			log.error("Failed to list sources: %s", error);
			res.status(500).json({ error: "Failed to list sources" });
		}
	});

	// POST /sources — create a source
	router.post("/", async (req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const integrationDao = integrationDaoProvider.getDao(getTenantContext());
			const body = req.body as Record<string, unknown>;

			if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
				res.status(400).json({ error: "name is required" });
				return;
			}
			if (!body.type || (body.type !== "git" && body.type !== "file")) {
				res.status(400).json({ error: "type must be 'git' or 'file'" });
				return;
			}

			// Validate integrationId if provided
			if (body.integrationId !== undefined && body.integrationId !== null) {
				if (!Number.isInteger(body.integrationId) || (body.integrationId as number) <= 0) {
					res.status(400).json({ error: "integrationId must be a positive integer" });
					return;
				}
				const integration = await integrationDao.getIntegration(body.integrationId as number);
				if (!integration) {
					res.status(400).json({ error: `Integration ${body.integrationId} not found` });
					return;
				}
			}

			const newSource = buildNewSource(body);

			const source = await sourceDao.createSource(newSource);
			res.status(201).json(source);
		} catch (error) {
			log.error("Failed to create source: %s", error);
			res.status(400).json({ error: "Failed to create source" });
		}
	});

	// GET /sources/:id — get a source
	router.get("/:id", async (req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid source ID" });
				return;
			}
			const source = await sourceDao.getSource(id);
			if (source) {
				res.json(source);
			} else {
				res.status(404).json({ error: "Source not found" });
			}
		} catch (error) {
			log.error("Failed to get source: %s", error);
			res.status(500).json({ error: "Failed to get source" });
		}
	});

	// PATCH /sources/:id — update a source
	router.patch("/:id", async (req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const integrationDao = integrationDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid source ID" });
				return;
			}
			const body = req.body as Record<string, unknown>;

			const bodyValidationError = validateSourceUpdateBody(body);
			if (bodyValidationError) {
				res.status(400).json({ error: bodyValidationError });
				return;
			}

			// Validate integrationId if provided
			if (body.integrationId !== undefined && body.integrationId !== null) {
				const integrationId = body.integrationId as number;
				const integration = await integrationDao.getIntegration(integrationId);
				if (!integration) {
					res.status(400).json({ error: `Integration ${body.integrationId} not found` });
					return;
				}
			}

			const update = buildSourceUpdate(body);
			const source = await sourceDao.updateSource(id, update);
			if (source) {
				res.json(source);
			} else {
				res.status(404).json({ error: "Source not found" });
			}
		} catch (error) {
			log.error("Failed to update source: %s", error);
			res.status(400).json({ error: "Failed to update source" });
		}
	});

	// DELETE /sources/:id — delete a source
	router.delete("/:id", async (req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid source ID" });
				return;
			}
			await sourceDao.deleteSource(id);
			res.status(204).send();
		} catch (error) {
			log.error("Failed to delete source: %s", error);
			res.status(500).json({ error: "Failed to delete source" });
		}
	});

	// PATCH /sources/:id/cursor — advance cursor
	router.patch("/:id/cursor", async (req, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid source ID" });
				return;
			}
			const body = req.body as { value?: string };
			if (!body.value || typeof body.value !== "string") {
				res.status(400).json({ error: "value is required" });
				return;
			}
			const cursor = { value: body.value, updatedAt: new Date().toISOString() };
			const source = await sourceDao.updateCursor(id, cursor);
			if (source) {
				res.json(source);
			} else {
				res.status(404).json({ error: "Source not found" });
			}
		} catch (error) {
			log.error("Failed to update source cursor: %s", error);
			res.status(400).json({ error: "Failed to update source cursor" });
		}
	});

	return router;
}

/**
 * Builds a NewSource from validated request body, avoiding explicit undefined
 * assignments for optional properties (exactOptionalPropertyTypes).
 */
function buildNewSource(body: Record<string, unknown>): NewSource {
	const source: Record<string, unknown> = {
		name: (body.name as string).trim(),
		type: body.type as SourceKind,
		enabled: body.enabled !== false,
	};
	if (typeof body.repo === "string") {
		source.repo = body.repo.trim();
	}
	if (typeof body.branch === "string") {
		source.branch = body.branch.trim();
	}
	if (typeof body.integrationId === "number") {
		source.integrationId = body.integrationId;
	}
	return source as unknown as NewSource;
}

/**
 * Validates PATCH /sources payload fields.
 */
function validateSourceUpdateBody(body: Record<string, unknown>): string | undefined {
	if ("name" in body && (typeof body.name !== "string" || body.name.trim() === "")) {
		return "name must be a non-empty string";
	}
	if ("type" in body && body.type !== "git" && body.type !== "file") {
		return "type must be 'git' or 'file'";
	}
	if ("enabled" in body && typeof body.enabled !== "boolean") {
		return "enabled must be a boolean";
	}
	if ("repo" in body && typeof body.repo !== "string") {
		return "repo must be a string";
	}
	if ("branch" in body && typeof body.branch !== "string") {
		return "branch must be a string";
	}
	if (
		"integrationId" in body &&
		body.integrationId !== undefined &&
		body.integrationId !== null &&
		(!Number.isInteger(body.integrationId) || (body.integrationId as number) <= 0)
	) {
		return "integrationId must be a positive integer";
	}
}

/**
 * Builds an update payload from a validated request body.
 */
function buildSourceUpdate(body: Record<string, unknown>): Partial<NewSource> {
	const source: Record<string, unknown> = {};
	if (typeof body.name === "string") {
		source.name = body.name.trim();
	}
	if (body.type === "git" || body.type === "file") {
		source.type = body.type as SourceKind;
	}
	if (typeof body.enabled === "boolean") {
		source.enabled = body.enabled;
	}
	if (typeof body.repo === "string") {
		source.repo = body.repo.trim();
	}
	if (typeof body.branch === "string") {
		source.branch = body.branch.trim();
	}
	if (typeof body.integrationId === "number" || body.integrationId === null) {
		source.integrationId = body.integrationId;
	}
	return source as unknown as Partial<NewSource>;
}

/**
 * Space-source binding router — mounts under /spaces/:spaceId/sources.
 * This is a separate router so it can be composed alongside SpaceRouter.
 */
export function createSpaceSourceRouter(deps: SpaceSourceRouterDeps): Router {
	const { sourceDaoProvider, spaceDaoProvider } = deps;
	const router = express.Router({ mergeParams: true });

	// GET /spaces/:spaceId/sources — list sources bound to a space
	router.get("/", async (req: Request<{ spaceId: string }>, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.spaceId, 10);
			if (Number.isNaN(spaceId)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			const sources = await sourceDao.listSourcesForSpace(spaceId);
			res.json(sources);
		} catch (error) {
			log.error("Failed to list sources for space: %s", error);
			res.status(500).json({ error: "Failed to list sources for space" });
		}
	});

	// POST /spaces/:spaceId/sources — bind a source to a space
	router.post("/", async (req: Request<{ spaceId: string }>, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.spaceId, 10);
			if (Number.isNaN(spaceId)) {
				res.status(400).json({ error: "Invalid space ID" });
				return;
			}
			const space = await spaceDao.getSpace(spaceId);
			if (!space) {
				res.status(404).json({ error: `Space ${spaceId} not found` });
				return;
			}
			const body = req.body as { sourceId?: number; jrnPattern?: string; enabled?: boolean };
			if (!body.sourceId || !Number.isInteger(body.sourceId) || body.sourceId <= 0) {
				res.status(400).json({ error: "sourceId must be a positive integer" });
				return;
			}

			// Verify the source exists
			const source = await sourceDao.getSource(body.sourceId);
			if (!source) {
				res.status(404).json({ error: `Source ${body.sourceId} not found` });
				return;
			}

			const binding = await sourceDao.bindSourceToSpace(spaceId, body.sourceId, body.jrnPattern, body.enabled);
			res.status(201).json(binding);
		} catch (error) {
			log.error("Failed to bind source to space: %s", error);
			res.status(400).json({ error: "Failed to bind source to space" });
		}
	});

	// DELETE /spaces/:spaceId/sources/:sourceId — unbind a source from a space
	router.delete("/:sourceId", async (req: Request<{ spaceId: string; sourceId: string }>, res) => {
		try {
			const sourceDao = sourceDaoProvider.getDao(getTenantContext());
			const spaceId = Number.parseInt(req.params.spaceId, 10);
			const sourceId = Number.parseInt(req.params.sourceId, 10);
			if (Number.isNaN(spaceId) || Number.isNaN(sourceId)) {
				res.status(400).json({ error: "Invalid space or source ID" });
				return;
			}
			await sourceDao.unbindSourceFromSpace(spaceId, sourceId);
			res.status(204).send();
		} catch (error) {
			log.error("Failed to unbind source from space: %s", error);
			res.status(500).json({ error: "Failed to unbind source from space" });
		}
	});

	return router;
}
