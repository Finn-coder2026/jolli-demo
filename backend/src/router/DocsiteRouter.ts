import { auditLog, computeAuditChanges } from "../audit";
import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocsiteDao } from "../dao/DocsiteDao";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Docsite, Site } from "../model/Docsite";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import { getTenantContext } from "../tenant/TenantContext";
import type { DeploymentResult } from "../util/DocGenerationUtil";
import {
	cleanupTempDirectory,
	cloneRepository,
	deployToVercel,
	generateDocusaurusFromCode,
} from "../util/DocGenerationUtil";
import { createGitHubAppJWT, getInstallations, getRepositoriesForInstallation } from "../util/GithubAppUtil";
import { getAccessTokenForGithubRepoIntegration, lookupGithubRepoIntegration } from "../util/IntegrationUtil";
import { getLog } from "../util/Logger";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Router } from "express";
import type { GithubRepoIntegrationMetadata } from "jolli-common";

const log = getLog(import.meta);

export function createDocsiteRouter(
	docsiteDaoProvider: DaoProvider<DocsiteDao>,
	integrationDaoProvider: DaoProvider<IntegrationDao>,
	integrationsManager: IntegrationsManager,
	permissionMiddleware: PermissionMiddlewareFactory,
): Router {
	const router = express.Router();

	// List all docsites
	router.get("/", permissionMiddleware.requirePermission("sites.view"), async (_req, res) => {
		try {
			const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
			const docsites = await docsiteDao.listDocsites();
			res.json(docsites);
		} catch (error) {
			log.error(error, "Failed to list docsites");
			res.status(500).json({ error: "Failed to list docsites" });
		}
	});

	// Get docsite by ID
	router.get("/:id", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			const docsite = await docsiteDao.getDocsite(id);
			if (docsite) {
				res.json(docsite);
			} else {
				res.status(404).json({ error: "Docsite not found" });
			}
		} catch (error) {
			log.error(error, "Failed to get docsite");
			res.status(500).json({ error: "Failed to get docsite" });
		}
	});

	// Create docsite
	router.post("/", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
			const newDocsite: Site = req.body;

			// Validate required fields
			if (!newDocsite.name || !newDocsite.displayName) {
				res.status(400).json({ error: "Name and displayName are required" });
				return;
			}

			const docsite = await docsiteDao.createDocsite(newDocsite);

			// Audit log docsite creation
			auditLog({
				action: "create",
				resourceType: "site",
				resourceId: docsite.id,
				resourceName: docsite.displayName,
				actorId: docsite.userId ?? null,
				changes: computeAuditChanges(null, docsite as unknown as Record<string, unknown>, "site"),
			});

			res.status(201).json(docsite);
		} catch (error) {
			log.error(error, "Failed to create docsite");
			res.status(500).json({ error: "Failed to create docsite" });
		}
	});

	// Update docsite
	router.put("/:id", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			const docsiteData: Docsite = req.body;
			if (docsiteData.id !== id) {
				res.status(400).json({ error: "ID mismatch" });
				return;
			}

			// Read existing docsite for change tracking
			const existingDocsite = await docsiteDao.getDocsite(id);
			const updated = await docsiteDao.updateDocsite(docsiteData);

			if (updated) {
				// Audit log docsite update
				auditLog({
					action: "update",
					resourceType: "site",
					resourceId: id,
					resourceName: updated.displayName,
					actorId: updated.userId ?? null,
					changes: computeAuditChanges(
						existingDocsite as unknown as Record<string, unknown> | null,
						updated as unknown as Record<string, unknown>,
						"site",
					),
				});

				res.json(updated);
			} else {
				res.status(404).json({ error: "Docsite not found" });
			}
		} catch (error) {
			log.error(error, "Failed to update docsite");
			res.status(500).json({ error: "Failed to update docsite" });
		}
	});

	// Delete docsite
	router.delete("/:id", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			// Read existing docsite before deletion for audit trail
			const existingDocsite = await docsiteDao.getDocsite(id);
			await docsiteDao.deleteDocsite(id);

			// Audit log docsite deletion
			if (existingDocsite) {
				auditLog({
					action: "delete",
					resourceType: "site",
					resourceId: id,
					resourceName: existingDocsite.displayName,
					actorId: existingDocsite.userId ?? null,
					changes: computeAuditChanges(existingDocsite as unknown as Record<string, unknown>, null, "site"),
				});
			}

			res.status(204).send();
		} catch (error) {
			log.error(error, "Failed to delete docsite");
			res.status(500).json({ error: "Failed to delete docsite" });
		}
	});

	// Generate docsite from repositories (enables repos and generates docsite atomically)
	/* c8 ignore start */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This endpoint handles multiple sequential operations atomically
	router.post("/generate-from-repos", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
		const integrationDao = integrationDaoProvider.getDao(getTenantContext());
		const { repositories, name, displayName, visibility } = req.body;
		const userId: number | undefined = undefined; // TODO: Get userId from auth token

		const config = getConfig();

		try {
			// Validate required fields
			if (!repositories || !Array.isArray(repositories) || repositories.length === 0 || !name || !displayName) {
				res.status(400).json({
					error: "repositories (array with at least one repo), name, and displayName are required",
				});
				return;
			}

			// Validate each repository has required fields
			for (const repo of repositories) {
				if (!repo.fullName || !repo.defaultBranch) {
					res.status(400).json({
						error: "Each repository must have fullName and defaultBranch",
					});
					return;
				}
			}

			log.info({ repositories, name }, "Generating docsite from repositories");

			// Step 1: Enable all repositories and collect integration IDs
			const integrationIds: Array<number> = [];
			const app = getCoreJolliGithubApp();
			const token = createGitHubAppJWT(app.appId, app.privateKey);
			const installations = await getInstallations(app.appId, token);

			for (const repo of repositories) {
				const repoFullName = repo.fullName;
				const branch = repo.defaultBranch;

				// Check if integration already exists
				const existingIntegrations = await integrationsManager.listIntegrations();
				const existing = existingIntegrations.find(i => {
					const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
					return i.type === "github" && metadata?.repo === repoFullName;
				});

				if (existing) {
					log.info({ repo: repoFullName, integrationId: existing.id }, "Using existing integration");
					integrationIds.push(existing.id);
					continue;
				}

				// Find the installation for this repo
				let foundInstallation: { installationId: number; githubAppId: number } | undefined;

				if (installations) {
					for (const installation of installations) {
						const repos = await getRepositoriesForInstallation(installation.id, token);
						if (repos?.some(r => r.full_name === repoFullName)) {
							foundInstallation = {
								installationId: installation.id,
								githubAppId: app.appId,
							};
							break;
						}
					}
				}

				if (!foundInstallation) {
					res.status(404).json({
						error: `Repository ${repoFullName} not found in any GitHub App installation`,
					});
					return;
				}

				// Create new integration
				log.info(
					{ repo: repoFullName, installationId: foundInstallation.installationId },
					"Creating integration",
				);
				const response = await integrationsManager.createIntegration({
					type: "github",
					name: repoFullName,
					status: "active",
					metadata: {
						repo: repoFullName,
						branch,
						features: [],
						githubAppId: foundInstallation.githubAppId,
						installationId: foundInstallation.installationId,
						lastAccessCheck: new Date().toISOString(),
					},
				});

				if (response.error || !response.result) {
					res.status(response.error?.statusCode || 500).json({
						error: response.error?.error || "Failed to create integration",
					});
					return;
				}

				integrationIds.push(response.result.id);
			}

			log.info({ integrationIds }, "All integrations enabled, generating docsite");

			// Step 2: Now call the existing generate logic with integration IDs
			// Create temp directory structure
			const tempDir = join(tmpdir(), `docsite-${Date.now()}`);
			const docsOutputDir = join(tempDir, "docs-output");

			const repoSources: Array<{ repo: string; branch: string; integrationId: number }> = [];

			// Process each integration
			for (const integrationId of integrationIds) {
				// Step 1: Lookup integration
				log.info({ integrationId }, "Looking up integration");
				const integration = await lookupGithubRepoIntegration(integrationDao, integrationId);
				if (!integration) {
					await cleanupTempDirectory(tempDir);
					res.status(404).json({ error: `Integration not found: ${integrationId}` });
					return;
				}

				// Step 2: Get access token
				log.info({ integrationId, repo: integration.metadata.repo }, "Getting access token");
				let accessToken: string;
				try {
					accessToken = await getAccessTokenForGithubRepoIntegration(integration);
				} catch (error) {
					log.error({ integrationId, error }, "Failed to get access token");
					await cleanupTempDirectory(tempDir);
					res.status(400).json({
						error: `Failed to get access token for ${integration.metadata.repo}: ${error}`,
					});
					return;
				}

				// Step 3: Clone repository to subdirectory
				const repoSlug = integration.metadata.repo.replace("/", "-");
				const repoDir = join(tempDir, repoSlug);
				log.info({ repo: integration.metadata.repo, repoDir }, "Cloning repository");

				try {
					await cloneRepository(integration.metadata.repo, integration.metadata.branch, accessToken, repoDir);
					repoSources.push({
						repo: integration.metadata.repo,
						branch: integration.metadata.branch,
						integrationId,
					});
				} catch (error) {
					log.error({ repo: integration.metadata.repo, error }, "Failed to clone repository");
					await cleanupTempDirectory(tempDir);
					res.status(500).json({
						error: `Failed to clone repository ${integration.metadata.repo}: ${error}`,
					});
					return;
				}
			}

			// Step 4: Generate documentation using code2docusaurus
			log.info({ tempDir, docsOutputDir }, "Generating documentation");
			try {
				await generateDocusaurusFromCode(tempDir, docsOutputDir);
			} catch (error) {
				log.error({ error }, "Failed to generate documentation");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: `Failed to generate documentation: ${error}` });
				return;
			}

			// Step 5: Deploy to Vercel
			const vercelToken = config.VERCEL_TOKEN;
			if (!vercelToken) {
				log.error("VERCEL_TOKEN environment variable not set");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: "VERCEL_TOKEN not configured" });
				return;
			}

			log.info({ projectName: name }, "Deploying to Vercel");
			let deploymentResult: DeploymentResult;
			try {
				deploymentResult = await deployToVercel(docsOutputDir, name, vercelToken);
			} catch (error) {
				log.error({ name, error }, "Failed to deploy to Vercel");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: `Failed to deploy to Vercel: ${error}` });
				return;
			}

			// Step 6: Create docsite record
			const docsiteData: Site = {
				name,
				displayName,
				userId,
				visibility: visibility || "external",
				status: "active",
				metadata: {
					repos: repoSources.map(rs => ({
						repo: rs.repo,
						branch: rs.branch,
						integrationId: rs.integrationId,
					})),
					deployments: [
						{
							environment: "production",
							url: deploymentResult.url,
							deploymentId: deploymentResult.deploymentId,
							deployedAt: new Date().toISOString(),
							status: "ready",
						},
					],
					lastDeployedAt: new Date().toISOString(),
				},
			};

			const docsite = await docsiteDao.createDocsite(docsiteData);

			// Cleanup temp directory
			await cleanupTempDirectory(tempDir);

			log.info({ docsiteId: docsite.id, url: deploymentResult.url }, "Docsite generated successfully");
			res.status(201).json(docsite);
		} catch (error) {
			log.error(error, "Error generating docsite from repositories");
			res.status(500).json({ error: "Failed to generate docsite" });
		}
	});
	/* c8 ignore stop */

	// Generate docsite from one or more integrations
	router.post("/generate", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		const docsiteDao = docsiteDaoProvider.getDao(getTenantContext());
		const integrationDao = integrationDaoProvider.getDao(getTenantContext());
		const { integrationIds, name, displayName, visibility } = req.body;
		const userId: number | undefined = undefined; // TODO: Get userId from auth token

		try {
			const config = getConfig();
			// Validate required fields
			if (
				!integrationIds ||
				!Array.isArray(integrationIds) ||
				integrationIds.length === 0 ||
				!name ||
				!displayName
			) {
				res.status(400).json({
					error: "integrationIds (array with at least one ID), name, and displayName are required",
				});
				return;
			}

			// Create temp directory structure
			const tempDir = join(tmpdir(), `docsite-${Date.now()}`);
			const docsOutputDir = join(tempDir, "docs-output");

			const repoSources: Array<{ repo: string; branch: string; integrationId: number }> = [];

			// Process each integration
			for (const integrationId of integrationIds) {
				// Step 1: Lookup integration
				log.info({ integrationId }, "Looking up integration");
				const integration = await lookupGithubRepoIntegration(integrationDao, integrationId);
				if (!integration) {
					await cleanupTempDirectory(tempDir);
					res.status(404).json({ error: `Integration not found: ${integrationId}` });
					return;
				}

				// Step 2: Get access token
				log.info({ integrationId, repo: integration.metadata.repo }, "Getting access token");
				let accessToken: string;
				try {
					accessToken = await getAccessTokenForGithubRepoIntegration(integration);
				} catch (error) {
					log.error({ integrationId, error }, "Failed to get access token");
					await cleanupTempDirectory(tempDir);
					res.status(400).json({
						error: `Failed to get access token for ${integration.metadata.repo}: ${error}`,
					});
					return;
				}

				// Step 3: Clone repository to subdirectory
				const repoSlug = integration.metadata.repo.replace("/", "-");
				const repoDir = join(tempDir, repoSlug);
				log.info({ repo: integration.metadata.repo, repoDir }, "Cloning repository");

				try {
					await cloneRepository(integration.metadata.repo, integration.metadata.branch, accessToken, repoDir);
					repoSources.push({
						repo: integration.metadata.repo,
						branch: integration.metadata.branch,
						integrationId,
					});
				} catch (error) {
					log.error({ repo: integration.metadata.repo, error }, "Failed to clone repository");
					await cleanupTempDirectory(tempDir);
					res.status(500).json({
						error: `Failed to clone repository ${integration.metadata.repo}: ${error}`,
					});
					return;
				}
			}

			// Step 4: Generate documentation using code2docusaurus
			log.info({ tempDir, docsOutputDir }, "Generating documentation");
			try {
				await generateDocusaurusFromCode(tempDir, docsOutputDir);
			} catch (error) {
				log.error({ tempDir, error }, "Failed to generate documentation");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: `Failed to generate documentation: ${error}` });
				return;
			}

			// Step 5: Deploy to Vercel
			const vercelToken = config.VERCEL_TOKEN;
			if (!vercelToken) {
				log.error("VERCEL_TOKEN environment variable not set");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: "VERCEL_TOKEN not configured" });
				return;
			}

			log.info({ projectName: name }, "Deploying to Vercel");
			let deployment: DeploymentResult;
			try {
				deployment = await deployToVercel(docsOutputDir, name, vercelToken);
			} catch (error) {
				log.error({ name, error }, "Failed to deploy to Vercel");
				await cleanupTempDirectory(tempDir);
				res.status(500).json({ error: `Failed to deploy to Vercel: ${error}` });
				return;
			}

			// Step 6: Create docsite record
			log.info({ name, deploymentUrl: deployment.url }, "Creating docsite record");
			const docsite = await docsiteDao.createDocsite({
				name,
				displayName,
				userId,
				visibility: visibility || "internal",
				status: deployment.status === "ready" ? "active" : "building",
				metadata: {
					repos: repoSources,
					deployments: [
						{
							environment: "production",
							url: deployment.url,
							deploymentId: deployment.deploymentId,
							deployedAt: new Date().toISOString(),
							status: deployment.status,
							...(deployment.error && { error: deployment.error }),
						},
					],
					framework: "docusaurus-2",
					buildCommand: "npm run build",
					outputDirectory: "build",
					lastBuildAt: new Date().toISOString(),
					lastDeployedAt: new Date().toISOString(),
				},
			});

			// Step 7: Cleanup temp directory
			await cleanupTempDirectory(tempDir);

			log.info({ docsiteId: docsite.id, url: deployment.url }, "Docsite generated successfully");
			res.status(201).json(docsite);
		} catch (error) {
			log.error({ integrationIds, name, error }, "Failed to generate docsite");
			res.status(500).json({ error: "Failed to generate docsite" });
		}
	});

	return router;
}
