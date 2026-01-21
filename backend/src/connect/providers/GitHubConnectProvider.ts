import { getConfig } from "../../config/Config";
import type { DaoProvider } from "../../dao/DaoProvider";
import type { GitHubInstallationDao } from "../../dao/GitHubInstallationDao";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import type { TenantOrgContext } from "../../tenant/TenantContext";
import type { TenantRegistryClient } from "../../tenant/TenantRegistryClient";
import {
	createGitHubAppJWT,
	fetchInstallationRepositories,
	findInstallationInGithubApp,
	generateSlug,
	getInstallations,
	upsertInstallationContainer,
} from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type {
	AvailableInstallation,
	ConnectCallbackResult,
	ConnectCompleteResult,
	ConnectProvider,
	ConnectStatePayload,
} from "../ConnectProvider";
import { getConnectGatewayUrl } from "../ConnectRouter";
import { generateConnectCode, generateConnectState } from "../ConnectStateService";
import type { Request } from "express";

const log = getLog(import.meta);

/**
 * GitHub-specific code data included in the encrypted code.
 */
export interface GitHubConnectCodeData {
	/** GitHub App installation ID */
	installationId: number;
	/** GitHub account login (org or user name) */
	accountLogin: string;
	/** Container type: "org" for organization, "user" for user account */
	containerType: "org" | "user";
	/** List of repository full names (owner/repo) */
	repoNames: Array<string>;
}

/**
 * GitHub implementation of ConnectProvider.
 * Handles the multi-tenant GitHub App installation flow.
 */
export class GitHubConnectProvider implements ConnectProvider {
	readonly name = "github";

	constructor(
		private githubInstallationDaoProvider: DaoProvider<GitHubInstallationDao>,
		private registryClient?: TenantRegistryClient,
	) {}

	/**
	 * Get the redirect URL to start the GitHub App installation flow.
	 */
	getSetupRedirectUrl(
		tenantSlug: string,
		orgSlug: string | undefined,
		returnTo: string,
		_options?: Record<string, unknown>,
	): Promise<string> {
		// Get the Jolli GitHub App
		const jolliApp = getCoreJolliGithubApp();
		const jolliAppSlug = generateSlug(jolliApp.name);

		// Generate encrypted state with tenant info
		const state = generateConnectState("github", tenantSlug, orgSlug, returnTo);

		log.info({ tenantSlug, orgSlug, jolliAppSlug }, "Generating GitHub App installation URL with encrypted state");

		return Promise.resolve(`https://github.com/apps/${jolliAppSlug}/installations/new?state=${state}`);
	}

	/**
	 * Handle the callback from GitHub after app installation.
	 * This is called on the connect gateway.
	 */
	async handleCallback(req: Request, statePayload: ConnectStatePayload): Promise<ConnectCallbackResult> {
		const { installation_id, setup_action } = req.query;

		// Check if setup was cancelled
		if (setup_action !== "install") {
			log.info({ setup_action }, "GitHub App setup cancelled");
			return {
				success: false,
				error: "setup_cancelled",
				redirectUrl: `${statePayload.returnTo}/?error=setup_cancelled`,
			};
		}

		// Validate installation ID
		if (!installation_id || typeof installation_id !== "string") {
			log.warn("GitHub callback missing installation_id");
			return {
				success: false,
				error: "no_installation_id",
				redirectUrl: `${statePayload.returnTo}/?error=no_installation_id`,
			};
		}

		const installationId = Number.parseInt(installation_id);
		const app = getCoreJolliGithubApp();

		// Find the installation in the GitHub App
		const installation = await findInstallationInGithubApp(app, installationId);
		if (!installation) {
			log.warn({ installationId }, "Installation not found in configured app");
			return {
				success: false,
				error: "installation_not_found",
				redirectUrl: `${statePayload.returnTo}/?error=installation_not_found`,
			};
		}

		// Fetch repositories for this installation
		const repoNamesOrError = await fetchInstallationRepositories(app, installationId);
		if (!Array.isArray(repoNamesOrError)) {
			return {
				success: false,
				error: repoNamesOrError.error,
				redirectUrl: `${statePayload.returnTo}/?error=${repoNamesOrError.error}`,
			};
		}

		// Determine container type
		const targetType = installation.target_type || installation.account.type;
		const containerType = targetType === "Organization" ? "org" : "user";

		// Generate encrypted code with installation data
		const codeData: GitHubConnectCodeData = {
			installationId,
			accountLogin: installation.account.login,
			containerType,
			repoNames: repoNamesOrError,
		};

		const code = generateConnectCode("github", statePayload.tenantSlug, statePayload.orgSlug, codeData);

		// Redirect to tenant's complete endpoint
		const completeUrl = new URL("/api/connect/github/complete", statePayload.returnTo);
		completeUrl.searchParams.set("code", code);

		log.info(
			{ tenantSlug: statePayload.tenantSlug, accountLogin: installation.account.login, containerType },
			"GitHub App installation callback successful, redirecting to tenant",
		);

		return {
			success: true,
			redirectUrl: completeUrl.toString(),
		};
	}

	/**
	 * Complete the GitHub App installation on the tenant.
	 * This is called on the tenant's domain.
	 */
	async handleComplete(codePayload: unknown, tenantContext: TenantOrgContext): Promise<ConnectCompleteResult> {
		const data = codePayload as GitHubConnectCodeData;

		// Validate the code data structure
		if (
			!data ||
			typeof data.installationId !== "number" ||
			typeof data.accountLogin !== "string" ||
			!["org", "user"].includes(data.containerType) ||
			!Array.isArray(data.repoNames)
		) {
			log.warn({ codePayload }, "Invalid GitHub connect code data");
			return { success: false, error: "invalid_code_data" };
		}

		// Get the DAO for this tenant
		const githubInstallationDao = this.githubInstallationDaoProvider.getDao(tenantContext);

		// Create or update the installation record
		await upsertInstallationContainer(
			{
				account: {
					login: data.accountLogin,
					type: data.containerType === "org" ? "Organization" : "User",
				},
			},
			data.installationId,
			data.repoNames,
			githubInstallationDao,
			"connect flow",
		);

		// Record the installation mapping in the registry for multi-tenant webhook routing
		if (this.registryClient) {
			try {
				await this.registryClient.createInstallationMapping({
					installationId: data.installationId,
					tenantId: tenantContext.tenant.id,
					orgId: tenantContext.org.id,
					githubAccountLogin: data.accountLogin,
					githubAccountType: data.containerType === "org" ? "Organization" : "User",
				});
				log.info(
					{ installationId: data.installationId, tenantId: tenantContext.tenant.id },
					"Created installation mapping for webhook routing",
				);
			} catch (error) {
				// Log but don't fail the flow - webhook routing will just not work for this installation
				log.error({ error, installationId: data.installationId }, "Failed to create installation mapping");
			}
		}

		log.info(
			{
				tenantSlug: tenantContext.tenant.slug,
				accountLogin: data.accountLogin,
				containerType: data.containerType,
			},
			"GitHub App installation completed on tenant",
		);

		// Redirect to the org/user repo list page
		return {
			success: true,
			redirectPath: `/integrations/github/${data.containerType}/${data.accountLogin}?new_installation=true`,
		};
	}

	/**
	 * List available GitHub App installations for the current user.
	 * Returns installations that can be connected to the current tenant/org.
	 *
	 * This is used when the GitHub App is already installed on a GitHub org
	 * and we want to allow connecting it without going through GitHub's
	 * installation flow again.
	 */
	async listAvailableInstallations(
		_userAccessToken: string,
		tenantContext: TenantOrgContext,
	): Promise<Array<AvailableInstallation>> {
		const app = getCoreJolliGithubApp();
		const token = createGitHubAppJWT(app.appId, app.privateKey);

		// Get all installations for this GitHub App
		const installations = await getInstallations(app.appId, token);
		if (!installations || installations.length === 0) {
			log.debug("No GitHub App installations found");
			return [];
		}

		// Get the DAO for current tenant to check which are already connected
		const githubInstallationDao = this.githubInstallationDaoProvider.getDao(tenantContext);
		const connectedInstallations = await githubInstallationDao.listInstallations();
		const connectedNames = new Set(connectedInstallations.map(i => i.name));

		// Build list of available installations
		const availableInstallations: Array<AvailableInstallation> = [];

		for (const installation of installations) {
			const accountLogin = installation.account.login;
			const accountType = installation.account.type;

			// Fetch repos for this installation
			const repoNamesOrError = await fetchInstallationRepositories(app, installation.id);
			const repos = Array.isArray(repoNamesOrError) ? repoNamesOrError : [];

			availableInstallations.push({
				accountLogin,
				accountType,
				installationId: installation.id,
				repos,
				alreadyConnectedToCurrentOrg: connectedNames.has(accountLogin),
			});
		}

		log.info(
			{
				tenantSlug: tenantContext.tenant.slug,
				orgSlug: tenantContext.org.slug,
				totalInstallations: installations.length,
				alreadyConnected: connectedInstallations.length,
			},
			"Listed available GitHub installations",
		);

		return availableInstallations;
	}

	/**
	 * Connect an existing GitHub App installation to the current tenant/org.
	 * Used when the GitHub App is already installed on a GitHub org elsewhere.
	 */
	async connectExistingInstallation(
		installationId: number,
		tenantContext: TenantOrgContext,
	): Promise<ConnectCompleteResult> {
		const app = getCoreJolliGithubApp();

		// Find the installation in the GitHub App
		const installation = await findInstallationInGithubApp(app, installationId);
		if (!installation) {
			log.warn({ installationId }, "Installation not found when connecting existing");
			return { success: false, error: "installation_not_found" };
		}

		// Fetch repositories for this installation
		const repoNamesOrError = await fetchInstallationRepositories(app, installationId);
		if (!Array.isArray(repoNamesOrError)) {
			log.warn(
				{ installationId, error: repoNamesOrError.error },
				"Failed to fetch repos for existing installation",
			);
			return { success: false, error: repoNamesOrError.error };
		}

		// Get the DAO for this tenant
		const githubInstallationDao = this.githubInstallationDaoProvider.getDao(tenantContext);

		// Create or update the installation record
		await upsertInstallationContainer(
			installation,
			installationId,
			repoNamesOrError,
			githubInstallationDao,
			"connect flow",
		);

		const accountLogin = installation.account.login;
		const targetType = installation.target_type || installation.account.type;
		const containerType = targetType === "Organization" ? "org" : "user";

		// Record the installation mapping in the registry for multi-tenant webhook routing
		if (this.registryClient) {
			try {
				await this.registryClient.createInstallationMapping({
					installationId,
					tenantId: tenantContext.tenant.id,
					orgId: tenantContext.org.id,
					githubAccountLogin: accountLogin,
					githubAccountType: containerType === "org" ? "Organization" : "User",
				});
				log.info(
					{ installationId, tenantId: tenantContext.tenant.id },
					"Created installation mapping for webhook routing",
				);
			} catch (error) {
				// Log but don't fail the flow - webhook routing will just not work for this installation
				log.error({ error, installationId }, "Failed to create installation mapping");
			}
		}

		log.info(
			{
				tenantSlug: tenantContext.tenant.slug,
				orgSlug: tenantContext.org.slug,
				accountLogin,
				containerType,
				installationId,
			},
			"Connected existing GitHub installation to tenant",
		);

		// Redirect to the org/user repo list page
		return {
			success: true,
			redirectPath: `/integrations/github/${containerType}/${accountLogin}?new_installation=true`,
		};
	}
}

/**
 * Check if multi-tenant mode is enabled.
 * When enabled, the GitHub flow uses the connect gateway pattern.
 */
export function isMultiTenantEnabled(): boolean {
	const config = getConfig();
	return config.MULTI_TENANT_ENABLED;
}

/**
 * Get the GitHub App installation URL for multi-tenant mode.
 * This returns the connect gateway URL for the setup endpoint.
 */
export function getGitHubSetupUrl(): string {
	return `${getConnectGatewayUrl()}/api/connect/github/setup`;
}
