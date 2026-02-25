import { getConfig } from "../config/Config";
import { GITHUB_WEBHOOK_EVENT_NAMES } from "../events/GithubEvents";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import { verifyWebhookSignature } from "../util/WebhookUtil";
import express, { type Request, type Router } from "express";

const log = getLog(import.meta);

/**
 * Extended Request type that includes the raw body string for signature verification
 */
interface WebhookRequest extends Request {
	rawBody?: string;
}

/**
 * Optional dependencies for multi-tenant webhook routing.
 */
interface WebhookRouterDependencies {
	registryClient?: TenantRegistryClient | undefined;
	schedulerManager?: MultiTenantJobSchedulerManager | undefined;
}

/** Resolved (non-optional) dependencies for multi-tenant routing. */
interface ResolvedWebhookDependencies {
	registryClient: TenantRegistryClient;
	schedulerManager: MultiTenantJobSchedulerManager;
}

/**
 * Route a webhook event to the correct tenant in multi-tenant mode.
 * Returns true if the event was handled (response sent), false to fall through to single-tenant mode.
 */
async function routeMultiTenant(
	req: WebhookRequest,
	res: express.Response,
	eventName: string,
	deps: ResolvedWebhookDependencies,
): Promise<boolean> {
	const event = req.headers["x-github-event"];

	// Extract installation ID from webhook payload
	const installationId = req.body?.installation?.id as number | undefined;
	if (!installationId) {
		log.warn({ event }, "No installation ID in webhook payload, skipping multi-tenant routing");
		res.status(200).json({ received: true, warning: "no_installation_id" });
		return true;
	}

	// Look up the tenant/org for this installation
	const tenantOrg = await deps.registryClient.getTenantOrgByInstallationId(installationId);
	if (!tenantOrg) {
		log.warn({ installationId, event }, "No tenant/org mapping for installation %d, skipping", installationId);
		res.status(200).json({ received: true, warning: "installation_not_mapped" });
		return true;
	}

	const { tenant, org } = tenantOrg;
	log.debug(
		{ tenantId: tenant.id, orgId: org.id, installationId, event },
		"Routing webhook to tenant %s, org %s",
		tenant.slug,
		org.slug,
	);

	// Emit events for job processing to the tenant-specific event emitter
	if (GITHUB_WEBHOOK_EVENT_NAMES.has(eventName)) {
		try {
			const tenantScheduler = await deps.schedulerManager.getScheduler(tenant, org);
			const tenantEventEmitter = tenantScheduler.scheduler.getEventEmitter();
			log.info("Emitting event %s to tenant %s", eventName, tenant.slug);
			tenantEventEmitter.emit(eventName, req.body);
		} catch (error) {
			log.error({ error, tenantId: tenant.id, orgId: org.id }, "Failed to get scheduler for tenant.");
			res.status(500).json({ error: "Failed to find tenant for webhook" });
			return true;
		}
	}
	res.status(200).json({ received: true });
	return true;
}

export function createWebhookRouter(eventEmitter: JobEventEmitter, deps?: WebhookRouterDependencies): Router {
	const router = express.Router();

	// Use express.json() with verify option to capture raw body for signature verification
	router.use(
		express.json({
			verify: (req, _res, buf) => {
				// Store raw body as string for signature verification
				(req as WebhookRequest).rawBody = buf.toString("utf8");
			},
		}),
	);

	router.post("/github", async (req: WebhookRequest, res) => {
		try {
			const event = req.headers["x-github-event"];
			const delivery = req.headers["x-github-delivery"];
			const signature = req.headers["x-hub-signature-256"];

			// Verify webhook signature
			const githubApp = getCoreJolliGithubApp();
			if (!githubApp) {
				log.warn("GitHub App not configured, cannot verify webhook signature");
				res.status(500).json({ error: "GitHub App not configured" });
				return;
			}

			const rawBody = req.rawBody;
			if (!rawBody) {
				log.warn("No raw body available for signature verification");
				res.status(400).json({ error: "Invalid request body" });
				return;
			}

			const isValid = verifyWebhookSignature(
				rawBody,
				typeof signature === "string" ? signature : undefined,
				githubApp.webhookSecret,
			);

			if (!isValid) {
				log.warn(
					{
						event,
						delivery,
						signature: signature ? "present" : "missing",
					},
					"Invalid webhook signature",
				);
				res.status(401).json({ error: "Invalid signature" });
				return;
			}

			log.info(
				{
					event,
					delivery,
					action: req.body.action,
				},
				"Received GitHub webhook: %s",
				req.body.action ? `${event}:${req.body.action}` : event,
			);

			// Construct event name - some events have actions, some don't
			const eventName = req.body.action ? `github:${event}:${req.body.action}` : `github:${event}`;

			// Route to tenant-specific handler in multi-tenant mode
			const config = getConfig();
			if (config.MULTI_TENANT_ENABLED && deps?.registryClient && deps?.schedulerManager) {
				await routeMultiTenant(req, res, eventName, {
					registryClient: deps.registryClient,
					schedulerManager: deps.schedulerManager,
				});
				return;
			}

			// Single-tenant mode: emit events for job processing to the shared event emitter
			if (GITHUB_WEBHOOK_EVENT_NAMES.has(eventName)) {
				log.info("Emitting event: %s", eventName);
				eventEmitter.emit(eventName, req.body);
			}
			res.status(200).json({ received: true });
		} catch (error) {
			log.error(error, "Error processing GitHub webhook:");
			res.status(500).json({ error: "Failed to process webhook" });
		}
	});

	return router;
}
