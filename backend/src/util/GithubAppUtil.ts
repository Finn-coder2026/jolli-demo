import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import { type GitHubApp, getCoreJolliGithubApp } from "../model/GitHubApp";
import type {
	GitHubAppConversionResponse,
	GitHubAppInstallation,
	GitHubAppRepository,
	GithubAppResponse,
} from "../types/GithubTypes";
import { getLog } from "./Logger";
import jwt from "jsonwebtoken";

const log = getLog(import.meta);

const githubApiBaseUrl = "https://api.github.com";
const githubAppsBaseUrl = "https://github.com/apps";

/**
 * Converts an app name to a GitHub-style slug
 * GitHub's slug generation:
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Removes consecutive hyphens
 * - Trims leading/trailing hyphens
 * @param name The app name to convert
 * @returns The generated slug
 */
export function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphens
		.replace(/-+/g, "-") // Replace consecutive hyphens with single hyphen
		.replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generates a JWT token for GitHub App authentication
 * @param appId The GitHub App ID
 * @param privateKey The GitHub App private key
 * @returns A JWT token for authenticating as the GitHub App
 */
export function createGitHubAppJWT(appId: number, privateKey: string): string {
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		iat: now - 60, // Issued 60 seconds in the past to account for clock drift
		exp: now + 60, // Expires in 60 seconds
		iss: appId.toString(),
	};

	return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

/**
 * Uninstalls a GitHub App installation
 * @param installationId The installation ID to uninstall
 * @returns true if uninstallation succeeded, false otherwise
 */
export async function uninstallGitHubApp(installationId: number): Promise<boolean> {
	try {
		// Get the GitHub App credentials
		const app: GitHubApp = getCoreJolliGithubApp();
		const { appId } = app;

		// Generate JWT for GitHub App authentication
		const token = createGitHubAppJWT(app.appId, app.privateKey);

		// Delete the installation
		const response = await fetch(`${githubApiBaseUrl}/app/installations/${installationId}`, {
			method: "DELETE",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (response.ok || response.status === 404) {
			// 204 = successfully deleted, 404 = already deleted
			log.info({ installationId, appId }, "GitHub App installation uninstalled successfully");
			return true;
		}

		log.warn({ installationId, appId, status: response.status }, "Failed to uninstall GitHub App installation");
		return false;
	} catch (error) {
		log.error(error, "Error uninstalling GitHub App installation");
		return false;
	}
}

export async function getInstallations(
	appId: number,
	token: string,
): Promise<Array<GitHubAppInstallation> | undefined> {
	// List all installations for this app
	const installationsResponse = await fetch(`${githubApiBaseUrl}/app/installations`, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});
	if (!installationsResponse.ok) {
		log.warn({ appId, status: installationsResponse.status }, "Failed to fetch installations");
		return;
	}
	return (await installationsResponse.json()) as unknown as Array<GitHubAppInstallation>;
}

/**
 * Checks if a GitHub App with the given slug exists on GitHub (not just in local database)
 * This helps detect apps that exist on GitHub but aren't registered locally
 * @param slug The app slug to check
 * @returns Promise resolving to true if the app exists on GitHub, false otherwise
 */
export async function checkGitHubAppExistsOnGitHub(slug: string): Promise<boolean> {
	try {
		// Try to fetch the public GitHub App page
		// This doesn't require authentication for public apps
		const response = await fetch(`${githubAppsBaseUrl}/${slug}`, {
			method: "HEAD",
		});
		return response.ok; // 200 = exists, 404 = doesn't exist
	} catch (error) {
		log.warn({ slug, error }, "Failed to check if GitHub App exists on GitHub");
		return false; // If we can't check, assume it doesn't exist to allow creation attempt
	}
}

async function getAppInfoResponse(token: string) {
	return await fetch(`${githubApiBaseUrl}/app`, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});
}

export async function getAppInfo(token: string): Promise<GithubAppResponse | undefined> {
	try {
		// Generate JWT for GitHub App authentication
		const appResponse = await getAppInfoResponse(token);

		if (!appResponse.ok) {
			log.warn({ status: appResponse.status }, "Failed to fetch app configuration for event subscription");
			return;
		}
		return (await appResponse.json()) as GithubAppResponse;
	} catch (error) {
		log.error(error, "Error getting GitHub App info");
		return;
	}
}

/**
 * Verifies if a GitHub App still exists on GitHub's side
 * @param app The GitHub App to verify
 * @returns true if the app exists, false otherwise
 */
export async function verifyGitHubAppExists(app: GitHubApp): Promise<boolean> {
	try {
		// Generate JWT for GitHub App authentication
		const token = createGitHubAppJWT(app.appId, app.privateKey);

		// Make request to GitHub API to verify app exists
		const response = await getAppInfoResponse(token);

		if (response.ok) {
			return true;
		}

		// App doesn't exist or credentials are invalid
		log.warn({ appId: app.appId, slug: app.slug, status: response.status }, "GitHub App verification failed");
		return false;
	} catch (error) {
		log.error(error, "Error verifying GitHub App existence");
		return false;
	}
}

/**
 * Fetches repository information from GitHub API
 * @param owner Repository owner
 * @returns Repository ID or undefined if not found
 */
export async function getOwnerId(owner: string): Promise<number | undefined> {
	try {
		// Try to get organization info first (works for public orgs)
		let response = await fetch(`${githubApiBaseUrl}/orgs/${owner}`, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		// If org fetch fails, try as a user instead
		if (!response.ok) {
			response = await fetch(`${githubApiBaseUrl}/users/${owner}`, {
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});
		}

		if (!response.ok) {
			log.warn({ owner, status: response.status }, "Failed to fetch owner information");
			return;
		}

		const ownerData = await response.json();
		log.info({ owner, ownerId: ownerData.id }, "Successfully fetched owner ID");
		return ownerData.id;
	} catch (error) {
		log.error(error, "Error fetching owner information");
		return;
	}
}

/**
 * Subscribes a GitHub App to the installation_repositories event
 * This allows the app to receive notifications when repositories are added/removed from installations
 * @param app The GitHub App to configure
 * @returns Promise that resolves when subscription is complete
 */
export async function subscribeToInstallationRepositoriesEvent(app: GitHubApp): Promise<void> {
	try {
		const token = createGitHubAppJWT(app.appId, app.privateKey);
		const appData = await getAppInfo(token);
		if (!appData) {
			log.warn({ appId: app.appId, slug: app.slug }, "Failed to fetch app configuration for event subscription");
			return;
		}
		const currentEvents = appData.events || [];

		// Check if installation_repositories is already subscribed
		if (currentEvents.includes("installation_repositories")) {
			log.debug({ appId: app.appId, slug: app.slug }, "App already subscribed to installation_repositories");
			return;
		}

		// Add installation_repositories to the events list
		const updatedEvents = [...currentEvents, "installation_repositories"];

		// Update the app's webhook subscriptions
		const updateResponse = await fetch(`${githubApiBaseUrl}/app`, {
			method: "PATCH",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				events: updatedEvents,
			}),
		});

		if (!updateResponse.ok) {
			log.warn(
				{ appId: app.appId, slug: app.slug, status: updateResponse.status },
				"Failed to subscribe to installation_repositories event",
			);
			return;
		}

		log.info({ appId: app.appId, slug: app.slug }, "Successfully subscribed to installation_repositories event");
	} catch (error) {
		log.error({ error, appId: app.appId, slug: app.slug }, "Error subscribing to installation_repositories event");
	}
}

export async function getAccessTokenForInstallation(
	installationId: number,
	token: string,
): Promise<string | undefined> {
	const tokenResponse = await fetch(`${githubApiBaseUrl}/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!tokenResponse.ok) {
		log.warn({ installationId }, "Failed to get installation token");
		return;
	}

	const tokenData = await tokenResponse.json();
	return tokenData.token;
}

/**
 * Gets an access token for a GitHub App and installation id.
 * @param app the GitHub App
 * @param installationId the installation ID
 * @returns Promise resolving to the access token or undefined if failed
 */
export async function getAccessTokenForGitHubAppInstallation(
	app: GitHubApp,
	installationId: number,
): Promise<string | undefined> {
	// Generate JWT for GitHub App authentication
	const token = createGitHubAppJWT(app.appId, app.privateKey);
	return await getAccessTokenForInstallation(installationId, token);
}

async function getRepositoriesForInstallationToken(
	installationToken: string,
): Promise<Array<GitHubAppRepository> | undefined> {
	const reposResponse = await fetch(`${githubApiBaseUrl}/installation/repositories`, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `token ${installationToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});
	if (!reposResponse.ok) {
		log.debug({ installationToken }, "Failed to fetch installation repositories");
		return;
	}
	const reposData = await reposResponse.json();
	return reposData.repositories || [];
}

export async function getRepositoriesForInstallation(
	installationId: number,
	token: string,
): Promise<Array<GitHubAppRepository> | undefined> {
	const installationToken = await getAccessTokenForInstallation(installationId, token);
	if (!installationToken) {
		return;
	}
	// List repositories accessible to this installation
	return await getRepositoriesForInstallationToken(installationToken);
}

/**
 * Checks if a repository is already included in an existing GitHub App installation
 * @param app The GitHub App to check
 * @param repoFullName The repository full name (owner/repo)
 * @returns Installation info if found, undefined otherwise
 */
export async function findExistingInstallation(
	app: GitHubApp,
	repoFullName: string,
): Promise<
	| {
			installationId: number;
			defaultBranch: string;
			accountLogin: string;
			accountType: "Organization" | "User";
			repositories: Array<GitHubAppRepository>;
	  }
	| undefined
> {
	try {
		// Generate JWT for GitHub App authentication
		const token = createGitHubAppJWT(app.appId, app.privateKey);

		const installations = await getInstallations(app.appId, token);
		if (!installations) {
			return;
		}
		log.debug({ appId: app.appId, count: installations.length }, "Found installations for GitHub App");

		// Check each installation for the repository
		for (const installation of installations) {
			const repositories = await getRepositoriesForInstallation(installation.id, token);
			if (!repositories) {
				continue;
			}
			// Check if our target repository is in this installation
			const targetRepo = repositories.find(r => r.full_name === repoFullName);
			if (targetRepo) {
				log.info(
					{
						installationId: installation.id,
						repo: repoFullName,
						branch: targetRepo.default_branch,
						account: installation.account.login,
						type: installation.account.type,
					},
					"Found existing installation for repository",
				);
				return {
					installationId: installation.id,
					defaultBranch: targetRepo.default_branch || "main",
					accountLogin: installation.account.login,
					accountType: installation.account.type,
					repositories,
				};
			}
		}

		log.info({ repo: repoFullName }, "Repository not found in any installation");
		return;
	} catch (error) {
		log.error(error, "Error checking for existing installation");
		return;
	}
}

/**
 * Finds an existing installation for a GitHub App in a specific owner's account (org or user)
 * @param app The GitHub App to check
 * @param owner The owner (organization or user) to check for
 * @returns The installation ID if found, undefined otherwise
 */
export async function findInstallationForOwner(app: GitHubApp, owner: string): Promise<number | undefined> {
	try {
		// Generate JWT for GitHub App authentication
		const token = createGitHubAppJWT(app.appId, app.privateKey);
		const installations = await getInstallations(app.appId, token);
		if (!installations) {
			return;
		}

		// Find installation for the specified owner
		const installation = installations.find(inst => inst.account.login.toLowerCase() === owner.toLowerCase());

		if (installation) {
			log.debug({ installationId: installation.id, owner }, "Found existing installation for owner");
			return installation.id;
		}

		log.debug({ owner }, "No installation found for owner");
		return;
	} catch (error) {
		log.error(error, "Error finding installation for owner");
		return;
	}
}

/* c8 ignore next 17 */
export async function getGithubAppManefestConversions(code: string): Promise<GitHubAppConversionResponse | undefined> {
	// Exchange code for app credentials
	const response = await fetch(`${githubApiBaseUrl}/app-manifests/${code}/conversions`, {
		method: "POST",
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!response.ok) {
		log.error("GitHub App conversion failed: %s", await response.text());
		return;
	}

	return (await response.json()) as unknown as GitHubAppConversionResponse;
}

/**
 * Parses a GitHub repository URL and extracts owner and repo name.
 * @throws Error if URL is invalid
 */
export function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string; repoFullName: string } {
	const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	/* c8 ignore next 3 */
	if (!match) {
		throw new Error("Invalid GitHub repository URL");
	}
	const [, owner, repo] = match;
	return { owner, repo, repoFullName: `${owner}/${repo}` };
}

/**
 * Generates an installation URL for a GitHub App.
 * Checks if an installation exists for the owner and generates the appropriate URL.
 */
export async function generateInstallationUrl(githubApp: GitHubApp, owner: string): Promise<string> {
	// Check if there's an existing installation for this owner
	const installationId = await findInstallationForOwner(githubApp, owner);

	if (installationId) {
		// Installation exists for this owner - direct them to add repos to it
		const url = `${githubAppsBaseUrl}/${githubApp.slug}/installations/${installationId}`;
		log.info({ owner, installationId, installUrl: url }, "Returning existing installation URL");
		return url;
	}

	// No installation exists for this owner - need to create a new installation
	const ownerId = await getOwnerId(owner);
	const baseUrl = `${githubAppsBaseUrl}/${githubApp.slug}/installations/new`;

	if (ownerId) {
		// Use suggested_target_id to pre-select the organization
		const url = new URL(baseUrl);
		url.searchParams.append("suggested_target_id", ownerId.toString());
		const installUrl = url.toString();
		log.info({ owner, ownerId, installUrl }, "Returning new installation URL with pre-selected org");
		return installUrl;
	}

	log.warn({ owner }, "Could not fetch owner info, using base installation URL");
	return baseUrl;
}

/**
 * Syncs all GitHub App installations with the current installation information from Github.
 * Creates new installation entries for installations that don't exist in the database,
 * and updates existing installation entries with the latest repositories and metadata.
 *
 * @param githubApp the github app to check for installation changes for.
 * @param githubInstallationDao the github installation DAO.
 * @return an array of GithubAppInstallations that were synced (created or updated).
 */
export async function syncAllInstallationsForApp(
	githubApp: GitHubApp,
	githubInstallationDao: GitHubInstallationDao,
): Promise<Array<GitHubAppInstallation>> {
	try {
		const dbInstallations = await githubInstallationDao.listInstallations();

		const token = createGitHubAppJWT(githubApp.appId, githubApp.privateKey);
		const installations = (await getInstallations(githubApp.appId, token)) ?? [];
		const linkedAppInstallations: Array<GitHubAppInstallation> = [];
		for (const installation of installations) {
			const installationId = installation.id;
			const accountLogin = installation.account.login;
			const existing = dbInstallations.find(installation => installation.name === accountLogin);
			if (existing) {
				// update existing installations with the latest installation data from github
				const accountType = installation.account.type;

				// Determine container type: trust GitHub's account.type field
				// "Organization" -> "org", "User" -> "user"
				const containerType = accountType === "Organization" ? "org" : "user";

				log.info(
					{
						installationId,
						accountLogin,
						accountType,
						containerType,
					},
					"Syncing installation from GitHub",
				);

				// Get repositories for this installation
				const reposResponse = await fetch(
					`${githubApiBaseUrl}/app/installations/${installationId}/access_tokens`,
					{
						method: "POST",
						headers: {
							Accept: "application/vnd.github.v3+json",
							Authorization: `Bearer ${token}`,
						},
					},
				);

				if (!reposResponse.ok) {
					log.warn({ appId: githubApp.appId, installationId }, "Failed to get access token for installation");
					continue;
				}

				const tokenData = await reposResponse.json();
				const installationToken = tokenData.token;

				const reposListResponse = await fetch(`${githubApiBaseUrl}/installation/repositories`, {
					headers: {
						Accept: "application/vnd.github.v3+json",
						Authorization: `token ${installationToken}`,
					},
				});

				if (!reposListResponse.ok) {
					log.warn(
						{ appId: githubApp.appId, installationId },
						"Failed to fetch repositories for installation",
					);
					continue;
				}

				const reposData = await reposListResponse.json();
				const repoNames = reposData.repositories?.map((r: { full_name: string }) => r.full_name) || [];

				// Update existing entry
				await githubInstallationDao.updateInstallation({
					...existing,
					repos: repoNames,
					installationId,
					containerType, // Update type in case it changed
				});
				log.debug(
					{ name: accountLogin, containerType, installationId, repoCount: repoNames.length },
					"Updated GitHub installation entry",
				);
				linkedAppInstallations.push(installation);
			} else {
				// Installation exists in GitHub but not in database - skip it
				log.info(
					{
						installationId,
						accountLogin,
						accountType: installation.account.type,
					},
					"Skipping installation that exists in GitHub but not in database",
				);
				// Note: Not creating the installation in database anymore
			}
		}

		log.info(
			{ appId: githubApp.appId, installationCount: installations.length },
			"Synced all installations for GitHub App",
		);
		return linkedAppInstallations;
	} catch (error) {
		log.error(error, "Error syncing installations for GitHub App");
		throw error;
	}
}

/**
 * GitHub installation info returned by findInstallationInGithubApp.
 */
export interface GitHubInstallationInfo {
	id: number;
	account: { login: string; type: string };
	target_type?: string;
}

/**
 * Find which GitHub App an installation belongs to and get its details.
 * @param app The GitHub App to search
 * @param installationId The installation ID to find
 * @returns Installation info if found, undefined otherwise
 */
export async function findInstallationInGithubApp(
	app: GitHubApp,
	installationId: number,
): Promise<GitHubInstallationInfo | undefined> {
	try {
		const token = createGitHubAppJWT(app.appId, app.privateKey);
		const installations = await getInstallations(app.appId, token);

		if (installations) {
			const foundInstallation = installations.find(i => i.id === installationId);
			if (foundInstallation) {
				log.info({ appId: app.appId, appSlug: app.slug, installationId }, "Found installation in app");
				return foundInstallation;
			}
		}
	} catch (error) {
		log.warn({ appId: app.appId, error }, "Error checking app for installation");
	}
	return;
}

/**
 * Fetch repository names for a GitHub App installation.
 * @param githubApp The GitHub App
 * @param installationId The installation ID
 * @returns Array of repository full names (owner/repo) or error object
 */
export async function fetchInstallationRepositories(
	githubApp: GitHubApp,
	installationId: number,
): Promise<Array<string> | { error: string }> {
	const accessToken = await getAccessTokenForGitHubAppInstallation(githubApp, installationId);
	if (!accessToken) {
		log.error({ installationId }, "Failed to get access token for installation");
		return { error: "failed_to_get_access_token" };
	}

	const reposResponse = await fetch(`${githubApiBaseUrl}/installation/repositories`, {
		headers: {
			Accept: "application/vnd.github.v3+json",
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!reposResponse.ok) {
		log.error({ installationId, status: reposResponse.status }, "Failed to fetch installation repositories");
		return { error: "failed_to_fetch_repositories" };
	}

	const reposData = await reposResponse.json();
	const repositories = reposData.repositories || [];
	return repositories.map((r: { full_name: string }) => r.full_name);
}

/**
 * Flow names for GitHub installation operations.
 */
export type GitHubInstallationFlowName = "setup flow" | "connect flow" | "installation";

/**
 * Create or update a GitHub installation entry in the database.
 * @param installation Installation info from GitHub API
 * @param installationId The GitHub installation ID
 * @param repoNames Array of repository full names
 * @param githubInstallationDao The DAO to use for database operations
 * @param flowName Name of the flow for logging
 */
export async function upsertInstallationContainer(
	installation: { account: { login: string; type: string }; target_type?: string },
	installationId: number,
	repoNames: Array<string>,
	githubInstallationDao: GitHubInstallationDao,
	flowName: GitHubInstallationFlowName = "installation",
): Promise<void> {
	const accountLogin = installation.account.login;
	const targetType = installation.target_type || installation.account.type;
	const containerType = targetType === "Organization" ? "org" : "user";

	const existing = await githubInstallationDao.lookupByName(accountLogin);
	if (!existing) {
		await githubInstallationDao.createInstallation({
			containerType,
			name: accountLogin,
			installationId,
			repos: repoNames,
		});
		log.info(
			{ name: accountLogin, containerType, installationId, repoCount: repoNames.length },
			"Created GitHub installation entry from %s",
			flowName,
		);
	} else {
		await githubInstallationDao.updateInstallation({
			...existing,
			repos: repoNames,
			installationId,
			containerType,
		});
		log.info(
			{ name: accountLogin, containerType, installationId, repoCount: repoNames.length },
			"Updated GitHub installation entry from %s",
			flowName,
		);
	}
}
