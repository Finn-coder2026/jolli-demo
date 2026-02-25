import { auditLog, computeAuditChanges } from "../audit";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Integration, NewIntegration, StaticFileIntegration } from "../model/Integration";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import { jrnParser, type StaticFileIntegrationMetadata } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

export interface IntegrationRouterDeps {
	manager: IntegrationsManager;
	docDaoProvider: DaoProvider<DocDao>;
	permissionMiddleware: PermissionMiddlewareFactory;
}

export function createIntegrationRouter(deps: IntegrationRouterDeps): Router {
	const { manager, docDaoProvider, permissionMiddleware } = deps;
	const router = express.Router();

	async function getIntegrationFromRequest(
		req: express.Request,
		res: express.Response,
	): Promise<Integration | undefined> {
		const id = Number.parseInt(req.params.id);
		if (Number.isNaN(id)) {
			res.status(400).json({ error: "Invalid integration ID" });
			return;
		}
		const integration = await manager.getIntegration(id);
		if (!integration) {
			res.status(404).json({ error: "Integration not found" });
			return;
		}
		return integration;
	}

	// Permission-free: any authenticated user can check if integrations exist
	// Used by NavigationContext to decide whether to show onboarding
	router.get("/exists", async (_req, res) => {
		const count = await manager.countIntegrations();
		res.json({ exists: count > 0 });
	});

	router.get("/", permissionMiddleware.requirePermission("integrations.view"), async (_req, res) => {
		const integrations = await manager.listIntegrations();
		res.json(integrations);
	});

	router.post("/", permissionMiddleware.requirePermission("integrations.edit"), async (req, res) => {
		const newIntegration = req.body as NewIntegration;
		const response = await manager.createIntegration(newIntegration);
		if (response.error) {
			const { statusCode, error } = response.error;
			res.status(statusCode).json({ error });
		} else {
			const integration = response.result;
			if (integration) {
				// Audit log integration creation
				auditLog({
					action: "create",
					resourceType: "integration",
					resourceId: integration.id,
					resourceName: integration.name,
					changes: computeAuditChanges(
						null,
						integration as unknown as Record<string, unknown>,
						"integration",
					),
				});
			}
			res.status(201).json(response.result);
		}
	});

	router.get("/:id", permissionMiddleware.requirePermission("integrations.view"), async (req, res) => {
		const id = Number.parseInt(req.params.id);
		if (Number.isNaN(id)) {
			res.status(400).json({ error: "Invalid integration ID" });
			return;
		}

		const integration = await manager.getIntegration(id);
		if (integration) {
			res.json(integration);
		} else {
			res.status(404).json({ error: "Integration not found" });
		}
	});

	router.put("/:id", permissionMiddleware.requirePermission("integrations.edit"), async (req, res) => {
		try {
			const integration = await getIntegrationFromRequest(req, res);
			if (!integration) {
				return;
			}
			const response = await manager.updateIntegration(integration, { ...req.body });
			if (response.error) {
				const { statusCode, error } = response.error;
				res.status(statusCode).json({ error });
			} else {
				const updated = response.result;
				if (updated) {
					// Audit log integration update
					auditLog({
						action: "update",
						resourceType: "integration",
						resourceId: updated.id,
						resourceName: updated.name,
						changes: computeAuditChanges(
							integration as unknown as Record<string, unknown>,
							updated as unknown as Record<string, unknown>,
							"integration",
						),
					});
				}
				res.json(response.result);
			}
		} catch {
			res.status(400).json({ error: "Failed to update integration" });
		}
	});

	router.delete("/:id", permissionMiddleware.requirePermission("integrations.edit"), async (req, res) => {
		try {
			// Get the integration to check for GitHub App metadata
			const integration = await getIntegrationFromRequest(req, res);
			if (!integration) {
				return;
			}
			const response = await manager.deleteIntegration(integration);
			if (response.error) {
				const { statusCode, error } = response.error;
				res.status(statusCode).json({ error });
			} else {
				// Audit log integration deletion
				auditLog({
					action: "delete",
					resourceType: "integration",
					resourceId: integration.id,
					resourceName: integration.name,
					changes: computeAuditChanges(
						integration as unknown as Record<string, unknown>,
						null,
						"integration",
					),
				});
				res.status(204).send();
			}
		} catch (err) {
			log.error(err, "Failed to lookup integration to delete.");
			res.status(400).json({ error: "Unable to delete integration." });
		}
	});

	router.post("/:id/check-access", permissionMiddleware.requirePermission("integrations.view"), async (req, res) => {
		try {
			const integration = await getIntegrationFromRequest(req, res);
			if (!integration) {
				return;
			}
			const accessCheckResponse = await manager.handleAccessCheck(integration);
			if (accessCheckResponse.error) {
				const {
					error: { code, reason, context = {} },
				} = accessCheckResponse;
				res.status(code).json({
					...context,
					error: reason,
				});
			} else if (accessCheckResponse.result) {
				const {
					result: { hasAccess, status },
				} = accessCheckResponse;
				res.json({ hasAccess, status });
			}
		} catch (error) {
			log.error(error, "Unexpected Error checking integration access");
			res.status(500).json({ error: "Failed to check access" });
		}
	});

	/**
	 * Upload a file to a static_file integration.
	 * Creates a doc entry in the docs table linked to this integration.
	 */
	router.post("/:id/upload", permissionMiddleware.requirePermission("integrations.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const integration = await getIntegrationFromRequest(req, res);
			if (!integration) {
				return;
			}

			// Only allow uploads for static_file integrations
			if (integration.type !== "static_file") {
				res.status(400).json({ error: "File upload is only supported for static file integrations" });
				return;
			}

			const { filename, content, contentType = "text/markdown" } = req.body;

			if (!filename || typeof filename !== "string") {
				res.status(400).json({ error: "Filename is required" });
				return;
			}

			if (!content || typeof content !== "string") {
				res.status(400).json({ error: "Content is required" });
				return;
			}

			// Create the JRN for this file using structured format (integration name + filename as resource ID)
			const jrn = jrnParser.article(`${integration.name}-${filename}`);

			// Source doc permissions: read-only
			const sourceDocPermissions = { read: true, write: false, execute: false };

			// Check if doc already exists
			const existingDoc = await docDao.readDoc(jrn);
			if (existingDoc) {
				// Update existing doc - must increment version for updateDoc to accept the change
				const updatedDoc = await docDao.updateDoc({
					...existingDoc,
					version: existingDoc.version + 1,
					content,
					contentType,
					updatedBy: "static-file-upload",
					contentMetadata: {
						...existingDoc.contentMetadata,
						isSourceDoc: true,
						permissions: sourceDocPermissions,
					},
				});
				if (updatedDoc) {
					res.json({ doc: updatedDoc, created: false });
				} else {
					res.status(500).json({ error: "Failed to update document" });
				}
				return;
			}

			// Generate slug from the filename using SlugUtils
			const fileNameWithoutExt = filename.replace(/\.(md|mdx)$/i, "");
			const slug = generateSlug(fileNameWithoutExt);

			// Create new doc
			const doc = await docDao.createDoc({
				jrn,
				slug,
				path: "",
				content,
				contentType,
				updatedBy: "static-file-upload",
				source: { integrationId: integration.id, type: "static_file" },
				sourceMetadata: { filename, uploadedAt: new Date().toISOString() },
				contentMetadata: {
					title: filename,
					isSourceDoc: true,
					permissions: sourceDocPermissions,
				},
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				createdBy: "static-file-upload",
			});

			// Update integration metadata with new file count
			const staticFileIntegration = integration as StaticFileIntegration;
			const currentMetadata = staticFileIntegration.metadata || { fileCount: 0 };
			const newMetadata: StaticFileIntegrationMetadata = {
				...currentMetadata,
				fileCount: currentMetadata.fileCount + 1,
				lastUpload: new Date().toISOString(),
			};

			await manager.updateIntegration(integration, {
				...integration,
				metadata: newMetadata,
			});

			res.status(201).json({ doc, created: true });
		} catch (error) {
			log.error(error, "Error uploading file to static integration");
			res.status(500).json({ error: "Failed to upload file" });
		}
	});

	return router;
}
