import { getConfig } from "../config/Config";
import { getTenantOrigin } from "../tenant/DomainUtils";
import { getTenantContext, requireTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { ConnectProviderRegistry } from "./ConnectProviderRegistry";
import { validateConnectCode, validateConnectState } from "./ConnectStateService";
import express, { type Router } from "express";

const log = getLog(import.meta);

// Origin is now obtained from getConfig().ORIGIN to support multi-tenant mode
export type ConnectRouterOptions = Record<string, never>;

/**
 * Create the connect router.
 * This router handles the multi-tenant connect flow for all registered providers.
 *
 * Routes:
 * - POST /:provider/setup - Get redirect URL to start the connect flow
 * - GET /:provider/callback - Handle callback from external service (on connect gateway)
 * - GET /:provider/complete - Complete setup on tenant
 * - POST /:provider/list-available - List available installations to connect
 * - POST /:provider/connect-existing - Connect an existing installation
 * - POST /:provider/webhook - Handle webhooks from external service
 *
 * @param registry - The connect provider registry
 * @param options - Router options
 * @returns Express router
 */
export function createConnectRouter(registry: ConnectProviderRegistry, _options: ConnectRouterOptions): Router {
	const router = express.Router();

	/**
	 * POST /:provider/setup
	 * Get the redirect URL to start the connect flow.
	 * Called on the tenant's domain.
	 */
	router.post("/:provider/setup", async (req, res) => {
		const { provider: providerName } = req.params;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				res.status(404).json({ error: `Connect provider not found: ${providerName}` });
				return;
			}

			const tenantContext = getTenantContext();
			if (!tenantContext) {
				res.status(400).json({ error: "Tenant context required for connect setup" });
				return;
			}

			// Get the return URL - use the request origin or configured origin (tenant-scoped)
			const returnTo = req.body.returnTo || getConfig().ORIGIN;

			const redirectUrl = await provider.getSetupRedirectUrl(
				tenantContext.tenant.slug,
				tenantContext.org.slug,
				returnTo,
				req.body.options,
			);

			res.json({ redirectUrl });
		} catch (error) {
			log.error({ provider: providerName, error }, "Error in connect setup");
			res.status(500).json({ error: "Failed to generate connect redirect URL" });
		}
	});

	/**
	 * GET /:provider/callback
	 * Handle callback from external service.
	 * Called on the connect gateway (connect.{BASE_DOMAIN}).
	 * Tenant middleware is SKIPPED for this endpoint.
	 */
	router.get("/:provider/callback", async (req, res) => {
		const { provider: providerName } = req.params;
		const { state } = req.query;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				log.warn({ provider: providerName }, "Connect callback for unknown provider");
				return res.redirect(`${getConfig().ORIGIN}/?error=unknown_provider`);
			}

			// Validate and decrypt the state
			if (!state || typeof state !== "string") {
				log.warn({ provider: providerName }, "Connect callback missing state");
				return res.redirect(`${getConfig().ORIGIN}/?error=missing_state`);
			}

			const statePayload = validateConnectState(state);
			if (!statePayload) {
				log.warn({ provider: providerName }, "Connect callback invalid state");
				return res.redirect(`${getConfig().ORIGIN}/?error=invalid_state`);
			}

			// Verify the provider matches
			if (statePayload.provider !== providerName) {
				log.warn(
					{ expected: providerName, actual: statePayload.provider },
					"Connect callback provider mismatch",
				);
				return res.redirect(`${statePayload.returnTo}/?error=provider_mismatch`);
			}

			// Handle the callback
			const result = await provider.handleCallback(req, statePayload);

			// Redirect based on result
			return res.redirect(result.redirectUrl);
		} catch (error) {
			log.error({ provider: providerName, error }, "Error in connect callback");
			return res.redirect(`${getConfig().ORIGIN}/?error=callback_failed`);
		}
	});

	/**
	 * GET /:provider/complete
	 * Complete the connect setup on the tenant.
	 * Called on the tenant's domain after callback redirects here.
	 */
	router.get("/:provider/complete", async (req, res) => {
		const { provider: providerName } = req.params;
		const { code } = req.query;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				return res.redirect(`/?error=unknown_provider`);
			}

			// Validate the code
			if (!code || typeof code !== "string") {
				log.warn({ provider: providerName }, "Connect complete missing code");
				return res.redirect(`/?error=missing_code`);
			}

			const codePayload = validateConnectCode(providerName, code);
			if (!codePayload) {
				log.warn({ provider: providerName }, "Connect complete invalid code");
				return res.redirect(`/?error=invalid_code`);
			}

			// Verify tenant context matches
			const tenantContext = requireTenantContext();
			if (tenantContext.tenant.slug !== codePayload.tenantSlug) {
				log.warn(
					{ expected: codePayload.tenantSlug, actual: tenantContext.tenant.slug },
					"Connect complete tenant mismatch",
				);
				return res.redirect(`/?error=tenant_mismatch`);
			}

			// If orgSlug was specified, verify it matches (if org context is available)
			if (codePayload.orgSlug && tenantContext.org.slug !== codePayload.orgSlug) {
				log.warn(
					{ expected: codePayload.orgSlug, actual: tenantContext.org.slug },
					"Connect complete org mismatch",
				);
				// This is a warning but not a hard failure - org might have changed
			}

			// Complete the setup
			const result = await provider.handleComplete(codePayload.data, tenantContext);

			if (result.success) {
				return res.redirect(result.redirectPath);
			}
			return res.redirect(`/?error=${result.error}`);
		} catch (error) {
			log.error({ provider: providerName, error }, "Error in connect complete");
			return res.redirect(`/?error=complete_failed`);
		}
	});

	/**
	 * POST /:provider/list-available
	 * List available installations that can be connected to the current tenant/org.
	 * Called on the tenant's domain.
	 * Requires user to be authenticated (to check their access).
	 */
	router.post("/:provider/list-available", async (req, res) => {
		const { provider: providerName } = req.params;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				res.status(404).json({ error: `Connect provider not found: ${providerName}` });
				return;
			}

			// Check if provider supports listing available installations
			if (!provider.listAvailableInstallations) {
				res.status(404).json({ error: "Provider does not support listing available installations" });
				return;
			}

			const tenantContext = getTenantContext();
			if (!tenantContext) {
				res.status(400).json({ error: "Tenant context required" });
				return;
			}

			// Get user access token from request (e.g., from session or auth header)
			// For now, we don't require user-specific token since GitHub App uses app-level auth
			const userAccessToken = req.body?.accessToken || "";

			const installations = await provider.listAvailableInstallations(userAccessToken, tenantContext);

			res.json({ installations });
		} catch (error) {
			log.error(
				{ provider: providerName, error: error instanceof Error ? error.message : String(error) },
				"Error listing available installations",
			);
			res.status(500).json({ error: "Failed to list available installations" });
		}
	});

	/**
	 * POST /:provider/connect-existing
	 * Connect an existing installation to the current tenant/org.
	 * Called on the tenant's domain.
	 */
	router.post("/:provider/connect-existing", async (req, res) => {
		const { provider: providerName } = req.params;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				res.status(404).json({ error: `Connect provider not found: ${providerName}` });
				return;
			}

			// Check if provider supports connecting existing installations
			if (!provider.connectExistingInstallation) {
				res.status(404).json({ error: "Provider does not support connecting existing installations" });
				return;
			}

			const tenantContext = getTenantContext();
			if (!tenantContext) {
				res.status(400).json({ error: "Tenant context required" });
				return;
			}

			// Get installation ID from request body
			const { installationId } = req.body;
			if (typeof installationId !== "number") {
				res.status(400).json({ error: "installationId is required and must be a number" });
				return;
			}

			const result = await provider.connectExistingInstallation(installationId, tenantContext);

			if (result.success) {
				// Construct full redirect URL using centralized domain utility
				const config = getConfig();
				const tenant = tenantContext.tenant;

				// Use HTTPS when gateway is enabled OR in production (Vercel)
				const useHttps = config.USE_GATEWAY || config.NODE_ENV === "production";

				const origin = getTenantOrigin({
					primaryDomain: tenant.primaryDomain,
					tenantSlug: tenant.slug,
					baseDomain: config.BASE_DOMAIN,
					useHttps,
					port: new URL(config.ORIGIN).port || undefined,
					fallbackOrigin: config.ORIGIN,
				});

				const redirectUrl = `${origin}${result.redirectPath}`;
				log.info(
					{
						tenant: tenant.slug,
						primaryDomain: tenant.primaryDomain,
						baseDomain: config.BASE_DOMAIN,
						useGateway: config.USE_GATEWAY,
						origin,
						redirectPath: result.redirectPath,
						redirectUrl,
					},
					"Connect existing installation redirect",
				);
				res.json({ success: true, redirectUrl });
			} else {
				res.status(400).json({ success: false, error: result.error });
			}
		} catch (error) {
			log.error({ provider: providerName, error }, "Error connecting existing installation");
			res.status(500).json({ error: "Failed to connect existing installation" });
		}
	});

	/**
	 * POST /:provider/webhook
	 * Handle webhooks from external service.
	 * Note: Webhook routing might need to go to the correct tenant based on payload.
	 */
	router.post("/:provider/webhook", async (req, res) => {
		const { provider: providerName } = req.params;

		try {
			const provider = registry.get(providerName);
			if (!provider) {
				log.warn({ provider: providerName }, "Webhook for unknown provider");
				res.status(404).json({ error: "Unknown provider" });
				return;
			}

			if (!provider.handleWebhook) {
				log.warn({ provider: providerName }, "Provider does not support webhooks");
				res.status(404).json({ error: "Webhooks not supported" });
				return;
			}

			await provider.handleWebhook(req);
			res.status(200).json({ success: true });
		} catch (error) {
			log.error({ provider: providerName, error }, "Error handling webhook");
			res.status(500).json({ error: "Webhook processing failed" });
		}
	});

	return router;
}

/**
 * Check if the current request is on the connect gateway.
 *
 * @param host - The request host
 * @returns true if the request is on the connect gateway
 */
export function isConnectGateway(host: string): boolean {
	const config = getConfig();
	const baseDomain = config.BASE_DOMAIN;

	if (!baseDomain) {
		return false;
	}

	// Check configured connect gateway domain
	const connectGatewayDomain = config.CONNECT_GATEWAY_DOMAIN || `connect.${baseDomain}`;
	const hostWithoutPort = host.split(":")[0];

	return hostWithoutPort === connectGatewayDomain;
}

/**
 * Get the connect gateway URL.
 *
 * @returns The connect gateway URL (e.g., "https://connect.jolli.ai")
 */
export function getConnectGatewayUrl(): string {
	const config = getConfig();
	const baseDomain = config.BASE_DOMAIN;
	const useGateway = config.USE_GATEWAY;

	if (!baseDomain) {
		// Fallback to origin for local development
		return config.ORIGIN;
	}

	const connectGatewayDomain = config.CONNECT_GATEWAY_DOMAIN || `connect.${baseDomain}`;
	const protocol = useGateway ? "https" : "http";

	return `${protocol}://${connectGatewayDomain}`;
}
