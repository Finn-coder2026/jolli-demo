/**
 * Unified Vercel Deployment Library
 *
 * Consolidates all Vercel API interactions into a single class:
 * - Deployment creation and file upload
 * - Real-time build streaming with event callbacks
 * - Status polling with automatic completion detection
 * - Project management (delete, protection settings)
 *
 * Uses latest Vercel API versions:
 * - v13 for deployments
 * - v3 for deployment events (with streaming support via follow=1)
 * - v9/v10 for project management
 *
 * @see https://vercel.com/docs/rest-api/reference/endpoints/deployments
 */

import { getConfig } from "../config/Config";
import { getLog } from "./Logger";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { AddDomainResult, DomainStatusResult, DomainVerificationChallenge } from "jolli-common";

const log = getLog(import.meta);

/**
 * Retry wrapper for Vercel API calls with exponential backoff.
 * Retries on rate limits (429) and server errors (5xx).
 */
async function withVercelRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			const status = (error as { status?: number }).status;
			const isRetryable = status === 429 || (status !== undefined && status >= 500 && status < 600);

			if (!isRetryable || attempt === maxRetries) {
				throw error;
			}

			const delayMs = 2 ** attempt * 1000; // 2s, 4s, 8s
			log.warn({ attempt, delayMs, status }, "Retrying Vercel API call after error");
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}
	// TypeScript needs this even though it's unreachable
	throw new Error("Retry loop exited unexpectedly");
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Event handlers for real-time build progress callbacks.
 * These are called as events arrive during deployment streaming.
 */
export interface DeployEventHandlers {
	/** Called when a command is executed (e.g., "npm install") */
	onCommand?: (command: string) => void;
	/** Called for stdout output from the build */
	onStdout?: (text: string) => void;
	/** Called for stderr output from the build */
	onStderr?: (text: string) => void;
	/** Called when deployment state changes (e.g., "BUILDING", "READY") */
	onStateChange?: (state: string) => void;
	/** Called for fatal errors during build (e.g., "Build command failed") */
	onError?: (message: string) => void;
}

/**
 * Options for deployment
 */
export interface DeployOptions {
	/** Name of the Vercel project */
	projectName: string;
	/** Path to the directory containing files to deploy */
	sourcePath: string;
	/** Framework-specific project settings */
	projectSettings?: ProjectSettings;
	/** Deployment target: "preview" or "production" (default: "production") */
	target?: "preview" | "production";
}

/**
 * Vercel project settings for deployment
 */
export interface ProjectSettings {
	framework?: string;
	buildCommand?: string;
	installCommand?: string;
	outputDirectory?: string;
}

/**
 * Result of a deployment operation
 */
export interface DeployResult {
	/** Deployment ID from Vercel */
	id: string;
	/** URL of the deployed site */
	url: string;
	/** Final deployment status */
	status: "ready" | "error" | "building" | "canceled" | "timeout";
	/** Error message if status is "error" */
	error?: string;
	/** Build logs collected during deployment */
	buildLogs?: Array<string>;
	/** Stable production domain (e.g., "project.vercel.app") */
	productionDomain?: string;
	/** Preview URL for preview deployments */
	previewUrl?: string;
}

/**
 * Options for waiting on a deployment
 */
export interface WaitOptions {
	/** Polling interval in milliseconds (default: 2000) */
	pollIntervalMs?: number;
	/** Timeout in milliseconds (default: 360000 = 6 minutes) */
	timeoutMs?: number;
}

/**
 * Protection status of a Vercel project
 */
export interface ProtectionStatus {
	isProtected: boolean;
	protectionType: "password" | "sso" | "vercel-auth" | "none";
}

/**
 * Event types from Vercel Deployment Events API (v3)
 */
export interface VercelBuildEvent {
	type:
		| "delimiter"
		| "command"
		| "stdout"
		| "stderr"
		| "exit"
		| "deployment-state"
		| "middleware"
		| "middleware-invocation"
		| "edge-function-invocation"
		| "metric"
		| "report"
		| "fatal";
	created: number;
	/** Text field may appear at top level (Vercel API sometimes puts it here) */
	text?: string;
	payload: {
		deploymentId?: string;
		id?: string;
		date?: number;
		serial?: string;
		text?: string;
		code?: number;
		statusCode?: number;
		requestId?: string;
		info?: {
			type?: string;
			name?: string;
			entrypoint?: string;
			path?: string;
			step?: string;
			readyState?: string;
		};
		exitCode?: number;
	};
}

/**
 * Deployment status response from Vercel API (v13)
 */
interface DeploymentStatusResponse {
	id: string;
	url?: string;
	status?: string;
	readyState?: string;
	errorCode?: string;
	errorMessage?: string;
	errorStep?: string;
	errorLink?: string;
}

/**
 * Stream handle with promise and abort function
 */
interface StreamHandle {
	promise: Promise<{ status: string; buildLogs: Array<string> }>;
	abort: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds
const DEFAULT_TIMEOUT = 360000; // 6 minutes

/** Directories to exclude when uploading files to Vercel */
const EXCLUDE_DIRS = ["node_modules", "build", ".git", ".vercel", "dist", ".docusaurus", ".next", "_pagefind"];

// ============================================================================
// VercelDeployer Class
// ============================================================================

/**
 * Unified Vercel deployment client.
 *
 * Usage:
 * ```typescript
 * const deployer = new VercelDeployer(vercelToken);
 *
 * // Deploy with event callbacks
 * const result = await deployer.deploy(options, {
 *   onStdout: text => console.log(text),
 *   onStderr: text => console.error(text),
 *   onError: msg => console.error("Fatal:", msg),
 * });
 *
 * // Or wait for an existing deployment
 * const result = await deployer.waitForDeployment(deploymentId, handlers);
 * ```
 */
export class VercelDeployer {
	private token: string;

	constructor(token: string) {
		if (!token) {
			throw new Error("Vercel token is required");
		}
		this.token = token;
	}

	// ========================================================================
	// Public Methods
	// ========================================================================

	/**
	 * Deploy files to Vercel and wait for completion with streaming.
	 * Note: This method requires file system access and is tested via SiteRouter integration tests.
	 *
	 * @param options - Deployment options including project name and source path
	 * @param handlers - Optional event handlers for real-time progress
	 * @param waitOptions - Optional timeout and polling settings
	 * @returns Deployment result with status and URL
	 */
	/* v8 ignore start */
	async deploy(
		options: DeployOptions,
		handlers?: DeployEventHandlers,
		waitOptions?: WaitOptions,
	): Promise<DeployResult> {
		const { projectName, sourcePath, target = "production" } = options;

		log.info({ projectName, sourcePath, target }, "Deploying to Vercel");

		// Read all files from source directory
		const files = await this.getFilesRecursively(sourcePath);
		const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
		log.info(
			{ projectName, fileCount: files.length, totalSizeKB: Math.round(totalSize / 1024) },
			"Uploading files",
		);

		// Create deployment using Vercel API
		const projectSettings = options.projectSettings || {
			framework: "nextjs",
			buildCommand: "npm run build",
			installCommand: "npm install",
			outputDirectory: ".next",
		};

		try {
			const response = await fetch("https://api.vercel.com/v13/deployments", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: projectName,
					files: files.map(f => ({
						file: f.path,
						data: f.content.toString("utf-8"),
					})),
					projectSettings,
					target,
					meta: {
						buildTimestamp: Date.now().toString(),
						buildType: "deployment",
					},
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: response.statusText }));
				const errorMessage = errorData.error?.message || errorData.error || response.statusText;
				return {
					id: "",
					url: "",
					status: "error",
					error: `Deployment failed: ${errorMessage}`,
				};
			}

			const deploymentData = await response.json();
			const deploymentId = deploymentData.id;
			const deploymentUrl = `https://${deploymentData.url}`;

			log.info({ projectName, deploymentId, deploymentUrl }, "Deployment created, waiting for build");

			// Get production domain if deploying to production
			let productionDomain: string | undefined;
			if (target === "production") {
				try {
					productionDomain = await this.getProductionDomain(projectName);
				} catch {
					productionDomain = deploymentUrl;
				}
			}

			// Wait for deployment to complete with streaming
			const waitResult = await this.waitForDeployment(deploymentId, handlers, waitOptions);

			// Build result object, only including optional fields when they have values
			const result: DeployResult = {
				id: deploymentId,
				url: productionDomain || deploymentUrl,
				status: waitResult.status,
			};
			if (waitResult.error) {
				result.error = waitResult.error;
			}
			if (waitResult.buildLogs) {
				result.buildLogs = waitResult.buildLogs;
			}
			if (productionDomain) {
				result.productionDomain = productionDomain;
			}
			if (target === "preview") {
				result.previewUrl = deploymentUrl;
			}
			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error({ projectName, errorMessage }, "Failed to deploy");
			return {
				id: "",
				url: "",
				status: "error",
				error: errorMessage,
			};
		}
	}
	/* v8 ignore stop */

	/**
	 * Wait for an existing deployment to complete using streaming + parallel polling.
	 * Streaming provides real-time logs, polling detects completion faster.
	 *
	 * @param deploymentId - The Vercel deployment ID
	 * @param handlers - Optional event handlers for real-time progress
	 * @param options - Optional timeout and polling settings
	 * @returns Deployment result with status and build logs
	 */
	async waitForDeployment(
		deploymentId: string,
		handlers?: DeployEventHandlers,
		options?: WaitOptions,
	): Promise<DeployResult> {
		const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
		const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT;

		log.info("Waiting for Vercel deployment %s", deploymentId);

		// Check initial status
		let initialStatus = "QUEUED";
		try {
			const initialDeployment = await this.getDeploymentStatus(deploymentId);
			initialStatus = initialDeployment.readyState || initialDeployment.status || "QUEUED";

			log.debug("Deployment %s initial status: %s", deploymentId, initialStatus);

			// Notify of initial status
			if (handlers?.onStateChange) {
				handlers.onStateChange(initialStatus);
			}

			// If already complete, return early
			if (initialStatus === "READY") {
				return { id: deploymentId, url: "", status: "ready", buildLogs: [] };
			}
			if (initialStatus === "ERROR") {
				// Fetch and broadcast error logs even for immediate errors
				const buildLogs = await this.fetchBuildLogsOnError(deploymentId, [], handlers);
				const errorMessage = await this.getDeploymentErrorMessage(deploymentId, buildLogs);
				return { id: deploymentId, url: "", status: "error", error: errorMessage, buildLogs };
			}
			if (initialStatus === "CANCELED") {
				return {
					id: deploymentId,
					url: "",
					status: "canceled",
					error: "Deployment was canceled",
					buildLogs: [],
				};
			}
		} catch (error) {
			log.warn("Error getting initial deployment status: %s", String(error));
		}

		// Start streaming for real-time logs
		const stream = this.streamDeploymentEvents(deploymentId, handlers);

		// Poll status in parallel for faster completion detection
		const pollPromise = this.pollDeploymentStatus(deploymentId, pollInterval, timeout);

		// Race: whichever finishes first
		const streamPromise = stream.promise.then(result => {
			if (result.status === "READY" || result.status === "ERROR" || result.status === "CANCELED") {
				return { ...result, source: "stream" as const };
			}
			return new Promise<never>(() => {
				// Never resolves - allows poll to win
			});
		});

		const result = await Promise.race([streamPromise, pollPromise]);

		// Abort the stream
		stream.abort();

		// Get build logs
		let buildLogs: Array<string> = [];
		if (result.source === "stream") {
			buildLogs = result.buildLogs;
		} else {
			// If poll won, try to get logs from stream
			try {
				const streamResult = await Promise.race([
					stream.promise,
					new Promise<{ status: string; buildLogs: Array<string> }>(resolve =>
						setTimeout(() => resolve({ status: result.status, buildLogs: [] }), 500),
					),
				]);
				buildLogs = streamResult.buildLogs;
				/* v8 ignore start */
			} catch {
				// Ignore stream errors - we have the poll result
			}
			/* v8 ignore stop */
		}

		// If status is ERROR (from either stream or poll), fetch all events and broadcast them.
		// This is critical: the stream may terminate early when it sees deployment-state: ERROR,
		// but the detailed error messages (stderr, fatal events) may come after that.
		// Always fetch the complete event log to ensure we have all error details.
		if (result.status === "ERROR") {
			log.info(
				"%s won race with ERROR status. Stream logs count: %d. Fetching all error logs...",
				result.source,
				buildLogs.length,
			);
			buildLogs = await this.fetchBuildLogsOnError(deploymentId, buildLogs, handlers);
			log.info("After fetchBuildLogsOnError, total logs: %d", buildLogs.length);
		}

		// Notify final state change
		if (handlers?.onStateChange && result.status !== initialStatus) {
			handlers.onStateChange(result.status);
		}

		log.info("Deployment %s completed with status: %s (via %s)", deploymentId, result.status, result.source);

		// Return appropriate result
		return this.createDeployResult(deploymentId, result.status, buildLogs);
	}

	/**
	 * Get deployment status from Vercel API (v13).
	 */
	async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatusResponse> {
		const response = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get deployment status: ${response.status} ${response.statusText}`);
		}

		return response.json();
	}

	/**
	 * Check deployment status (simple interface for backwards compatibility).
	 */
	async checkDeploymentStatus(deploymentId: string): Promise<"building" | "ready" | "error"> {
		try {
			const deployment = await this.getDeploymentStatus(deploymentId);

			if (deployment.readyState === "READY") {
				return "ready";
			}
			if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
				return "error";
			}
			return "building";
		} catch (error) {
			log.error({ deploymentId, error }, "Error checking deployment status");
			return "building";
		}
	}

	/**
	 * Delete a Vercel project.
	 */
	async deleteProject(projectName: string): Promise<void> {
		log.info({ projectName }, "Deleting Vercel project");

		// Check if project exists
		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (projectResponse.status === 404) {
			log.info({ projectName }, "Vercel project already deleted or doesn't exist");
			return;
		}

		if (!projectResponse.ok) {
			const errorData = await projectResponse.json().catch(() => ({ error: projectResponse.statusText }));
			throw new Error(`Failed to get Vercel project: ${errorData.error || projectResponse.statusText}`);
		}

		// Delete the project
		const deleteResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (deleteResponse.status === 404) {
			log.info({ projectName }, "Vercel project already deleted");
			return;
		}

		if (!deleteResponse.ok) {
			const errorData = await deleteResponse.json().catch(() => ({ error: deleteResponse.statusText }));
			throw new Error(`Failed to delete Vercel project: ${errorData.error || deleteResponse.statusText}`);
		}

		log.info({ projectName }, "Vercel project deleted successfully");
	}

	/**
	 * Ensure a Vercel project exists, creating it if necessary.
	 * This is useful when you need to set environment variables before the first deployment.
	 *
	 * @param projectName - The name of the project to create or verify exists
	 * @returns true if the project was created, false if it already existed
	 */
	async ensureProjectExists(projectName: string): Promise<boolean> {
		log.info({ projectName }, "Ensuring Vercel project exists");

		// Check if project already exists
		const checkResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (checkResponse.ok) {
			log.info({ projectName }, "Vercel project already exists");
			return false;
		}

		if (checkResponse.status !== 404) {
			const errorData = await checkResponse.json().catch(() => ({ error: checkResponse.statusText }));
			throw new Error(`Failed to check Vercel project: ${errorData.error || checkResponse.statusText}`);
		}

		// Project doesn't exist, create it
		const createResponse = await fetch("https://api.vercel.com/v9/projects", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: projectName,
			}),
		});

		if (!createResponse.ok) {
			const errorData = await createResponse.json().catch(() => ({ error: createResponse.statusText }));
			const errorMessage = errorData.error?.message || errorData.error || createResponse.statusText;
			throw new Error(`Failed to create Vercel project: ${errorMessage}`);
		}

		log.info({ projectName }, "Vercel project created successfully");
		return true;
	}

	/**
	 * Get project protection status.
	 */
	async getProjectProtection(projectName: string): Promise<ProtectionStatus> {
		log.info({ projectName }, "Getting Vercel project protection status");

		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (!projectResponse.ok) {
			const errorData = await projectResponse.json().catch(() => ({ error: projectResponse.statusText }));
			throw new Error(`Failed to get Vercel project: ${errorData.error || projectResponse.statusText}`);
		}

		const projectData = await projectResponse.json();

		// Check for different types of protection
		const hasPasswordProtection =
			projectData.passwordProtection !== null && projectData.passwordProtection !== undefined;
		const hasSsoProtection = projectData.ssoProtection !== null && projectData.ssoProtection !== undefined;
		const hasVercelAuth = projectData.protectionBypass !== undefined;

		if (hasPasswordProtection) {
			return { isProtected: true, protectionType: "password" };
		}
		if (hasSsoProtection) {
			return { isProtected: true, protectionType: "sso" };
		}
		if (hasVercelAuth) {
			return { isProtected: true, protectionType: "vercel-auth" };
		}

		return { isProtected: false, protectionType: "none" };
	}

	/**
	 * Set or remove protection on a Vercel project.
	 */
	async setProjectProtection(projectName: string, enableProtection: boolean): Promise<void> {
		log.info({ projectName, enableProtection }, "Setting Vercel project protection");

		// Get project details to get the project ID
		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (!projectResponse.ok) {
			const errorData = await projectResponse.json().catch(() => ({ error: projectResponse.statusText }));
			throw new Error(`Failed to get Vercel project: ${errorData.error || projectResponse.statusText}`);
		}

		const projectData = await projectResponse.json();
		const projectId = projectData.id;

		// Update project protection settings
		const updatePayload = enableProtection
			? { ssoProtection: { deploymentType: "all" } }
			: { ssoProtection: null, passwordProtection: null };

		const updateResponse = await fetch(`https://api.vercel.com/v10/projects/${projectId}`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(updatePayload),
		});

		if (!updateResponse.ok) {
			const errorData = await updateResponse.json().catch(() => ({ error: updateResponse.statusText }));
			const errorDetail = this.extractErrorDetail(errorData, updateResponse.statusText);

			log.error(
				{ projectName, enableProtection, statusCode: updateResponse.status, errorData },
				"Vercel API returned error response",
			);

			throw new Error(
				`Failed to update Vercel project protection: ${errorDetail} (status: ${updateResponse.status})`,
			);
		}

		log.info({ projectName, enableProtection }, "Vercel project protection updated successfully");
	}

	// ========================================================================
	// Domain Management Methods
	// ========================================================================

	/**
	 * Build URL with optional team ID parameter.
	 */
	private buildDomainApiUrl(path: string): string {
		const config = getConfig();
		const teamId = config.VERCEL_TEAM_ID;
		const base = `https://api.vercel.com${path}`;
		return teamId ? `${base}?teamId=${teamId}` : base;
	}

	/**
	 * Add a domain to a Vercel project.
	 * Uses Vercel API v10: POST /v10/projects/{idOrName}/domains
	 *
	 * @param projectName - Vercel project ID or name
	 * @param domain - Domain to add (e.g., "docs.acme.com" or "docs.tenant.jolli.site")
	 * @returns Result with verified status and verification challenges
	 */
	addDomainToProject(projectName: string, domain: string): Promise<AddDomainResult> {
		log.info({ projectName, domain }, "Adding domain to Vercel project");
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(`/v10/projects/${encodeURIComponent(projectName)}/domains`);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: domain }),
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to add domain: ${response.status}`;

				// 409 = domain already exists (may be on a different project in the account)
				// Do NOT treat as success - return error so caller knows the domain is taken
				if (response.status === 409) {
					log.warn({ projectName, domain }, "Domain already exists in Vercel account");
					return { verified: false, error: "Domain already exists on another site" };
				}

				// 403 = domain owned by another account
				if (response.status === 403) {
					log.warn({ projectName, domain }, "Domain is owned by another Vercel account");
					return { verified: false, error: "Domain is owned by another Vercel account" };
				}

				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			const data = (await response.json()) as {
				verified: boolean;
				verification?: Array<DomainVerificationChallenge>;
			};

			const result: AddDomainResult = { verified: data.verified };
			if (data.verification) {
				result.verification = data.verification;
			}
			log.info({ projectName, domain, verified: result.verified }, "Domain added to Vercel project");
			return result;
		});
	}

	/**
	 * Remove a domain from a Vercel project.
	 * Uses Vercel API v9: DELETE /v9/projects/{idOrName}/domains/{domain}
	 *
	 * @param projectName - Vercel project ID or name
	 * @param domain - Domain to remove
	 */
	removeDomainFromProject(projectName: string, domain: string): Promise<void> {
		log.info({ projectName, domain }, "Removing domain from Vercel project");
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(
				`/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}`,
			);

			const response = await fetch(url, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			// 404 = domain already removed (treat as success)
			if (response.status === 404) {
				log.info({ projectName, domain }, "Domain already removed from project");
				return;
			}

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to remove domain: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			log.info({ projectName, domain }, "Domain removed from Vercel project");
		});
	}

	/**
	 * Get domain status from Vercel.
	 * Uses Vercel API v9: GET /v9/projects/{idOrName}/domains/{domain}
	 *
	 * @param projectName - Vercel project ID or name
	 * @param domain - Domain to check
	 * @returns Domain verification status
	 */
	getDomainStatus(projectName: string, domain: string): Promise<DomainStatusResult> {
		log.info({ projectName, domain }, "Getting domain status from Vercel");
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(
				`/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}`,
			);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (response.status === 404) {
				throw Object.assign(new Error("Domain not found on project"), { status: 404 });
			}

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to get domain status: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			const data = (await response.json()) as {
				verified: boolean;
				verification?: Array<DomainVerificationChallenge>;
			};

			const result: DomainStatusResult = { verified: data.verified };
			if (data.verification) {
				result.verification = data.verification;
			}
			return result;
		});
	}

	/**
	 * Trigger domain verification check.
	 * Uses Vercel API v6: POST /v6/projects/{idOrName}/domains/{domain}/verify
	 *
	 * @param projectName - Vercel project ID or name
	 * @param domain - Domain to verify
	 * @returns Domain verification status after check
	 */
	verifyDomain(projectName: string, domain: string): Promise<DomainStatusResult> {
		log.info({ projectName, domain }, "Triggering domain verification on Vercel");
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(
				`/v6/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}/verify`,
			);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to verify domain: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			const data = (await response.json()) as {
				verified: boolean;
				verification?: Array<DomainVerificationChallenge>;
			};

			const result: DomainStatusResult = { verified: data.verified };
			if (data.verification) {
				result.verification = data.verification;
			}
			log.info({ projectName, domain, verified: result.verified }, "Domain verification completed");
			return result;
		});
	}

	// ========================================================================
	// Environment Variable Management Methods
	// ========================================================================

	/**
	 * Set an environment variable on a Vercel project.
	 * Creates or updates the env var for production, preview, and development targets.
	 * Uses Vercel API v10: POST /v10/projects/{idOrName}/env
	 *
	 * @param projectName - Vercel project ID or name
	 * @param key - Environment variable name
	 * @param value - Environment variable value
	 * @param type - Variable type: "plain", "secret", or "encrypted" (default: "plain")
	 */
	async setEnvVar(
		projectName: string,
		key: string,
		value: string,
		type: "plain" | "secret" | "encrypted" = "plain",
	): Promise<void> {
		log.info({ projectName, key }, "Setting environment variable on Vercel project");

		// First, check if the env var already exists
		const existingEnvVars = await this.getEnvVars(projectName);
		const existing = existingEnvVars.find(env => env.key === key);

		if (existing) {
			// Update existing env var
			await this.updateEnvVar(projectName, existing.id, key, value, type);
		} else {
			// Create new env var
			await this.createEnvVar(projectName, key, value, type);
		}
	}

	/**
	 * Create a new environment variable on a Vercel project.
	 * Uses Vercel API v10: POST /v10/projects/{idOrName}/env
	 */
	private createEnvVar(
		projectName: string,
		key: string,
		value: string,
		type: "plain" | "secret" | "encrypted",
	): Promise<void> {
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(`/v10/projects/${encodeURIComponent(projectName)}/env`);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					key,
					value,
					type,
					target: ["production", "preview", "development"],
				}),
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to create env var: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			log.info({ projectName, key }, "Environment variable created");
		});
	}

	/**
	 * Update an existing environment variable on a Vercel project.
	 * Uses Vercel API v10: PATCH /v10/projects/{idOrName}/env/{id}
	 */
	private updateEnvVar(
		projectName: string,
		envId: string,
		key: string,
		value: string,
		type: "plain" | "secret" | "encrypted",
	): Promise<void> {
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(`/v10/projects/${encodeURIComponent(projectName)}/env/${envId}`);

			const response = await fetch(url, {
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					key,
					value,
					type,
					target: ["production", "preview", "development"],
				}),
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to update env var: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			log.info({ projectName, key }, "Environment variable updated");
		});
	}

	/**
	 * Get all environment variables for a Vercel project.
	 * Uses Vercel API v9: GET /v9/projects/{idOrName}/env
	 *
	 * @param projectName - Vercel project ID or name
	 * @returns Array of environment variables with id, key, and value
	 */
	getEnvVars(projectName: string): Promise<Array<{ id: string; key: string; value: string }>> {
		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(`/v9/projects/${encodeURIComponent(projectName)}/env`);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to get env vars: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			const data = (await response.json()) as {
				envs: Array<{ id: string; key: string; value: string }>;
			};

			return data.envs || [];
		});
	}

	/**
	 * Delete an environment variable from a Vercel project.
	 * Uses Vercel API v9: DELETE /v9/projects/{idOrName}/env/{id}
	 *
	 * @param projectName - Vercel project ID or name
	 * @param key - Environment variable name to delete
	 */
	async deleteEnvVar(projectName: string, key: string): Promise<void> {
		log.info({ projectName, key }, "Deleting environment variable from Vercel project");

		// Find the env var by key
		const envVars = await this.getEnvVars(projectName);
		const envVar = envVars.find(env => env.key === key);

		if (!envVar) {
			log.info({ projectName, key }, "Environment variable not found, nothing to delete");
			return;
		}

		return withVercelRetry(async () => {
			const url = this.buildDomainApiUrl(`/v9/projects/${encodeURIComponent(projectName)}/env/${envVar.id}`);

			const response = await fetch(url, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			// 404 = already deleted (treat as success)
			if (response.status === 404) {
				log.info({ projectName, key }, "Environment variable already deleted");
				return;
			}

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				const errorMessage = errorData.error?.message || `Failed to delete env var: ${response.status}`;
				throw Object.assign(new Error(errorMessage), { status: response.status });
			}

			log.info({ projectName, key }, "Environment variable deleted");
		});
	}

	/**
	 * Sync JWT auth configuration to Vercel environment variables.
	 * Sets or removes JWT_AUTH_ENABLED, JWT_AUTH_MODE, JWT_PUBLIC_KEY, and JWT_LOGIN_URL.
	 *
	 * @param projectName - Vercel project ID or name
	 * @param enabled - Whether JWT auth is enabled
	 * @param mode - JWT auth mode ("full" or "partial")
	 * @param publicKey - The public key for JWT verification
	 * @param loginUrl - The login URL for JWT authentication
	 */
	async syncJwtAuthEnvVars(
		projectName: string,
		enabled: boolean,
		mode: string,
		publicKey: string,
		loginUrl: string,
	): Promise<void> {
		log.info({ projectName, enabled, mode }, "Syncing JWT auth configuration to Vercel env vars");

		if (enabled) {
			// Set all JWT auth env vars
			await Promise.all([
				this.setEnvVar(projectName, "JWT_AUTH_ENABLED", "true"),
				this.setEnvVar(projectName, "JWT_AUTH_MODE", mode),
				this.setEnvVar(projectName, "JWT_PUBLIC_KEY", publicKey),
				this.setEnvVar(projectName, "JWT_LOGIN_URL", loginUrl),
			]);
		} else {
			// When disabling, set JWT_AUTH_ENABLED to false but keep other vars
			// This allows quick re-enabling without losing configuration
			await this.setEnvVar(projectName, "JWT_AUTH_ENABLED", "false");
		}

		log.info({ projectName, enabled }, "JWT auth env vars synced successfully");
	}

	// ========================================================================
	// Private Methods - Streaming
	// ========================================================================

	/**
	 * Stream deployment events using v3 API with follow=1 for real-time streaming.
	 */
	private streamDeploymentEvents(deploymentId: string, handlers?: DeployEventHandlers): StreamHandle {
		const buildLogs: Array<string> = [];
		let aborted = false;
		let abortController: AbortController | null = null;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

		const abort = () => {
			aborted = true;
			if (reader) {
				reader.cancel().catch(() => {
					// Ignore
				});
			}
			if (abortController) {
				abortController.abort();
			}
		};

		const promise = (async (): Promise<{ status: string; buildLogs: Array<string> }> => {
			const url = `https://api.vercel.com/v3/deployments/${deploymentId}/events?follow=1&builds=1&direction=forward`;
			abortController = new AbortController();

			try {
				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${this.token}`,
						Accept: "application/json",
					},
					signal: abortController.signal,
				});

				if (!response.ok) {
					throw new Error(`Events API error ${response.status}: ${response.statusText}`);
				}

				if (!response.body) {
					throw new Error("Response body is not readable");
				}

				reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let finalState = "BUILDING";

				while (!aborted) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						const terminalState = this.processStreamLine(line, buildLogs, handlers);
						if (terminalState) {
							finalState = terminalState;
							reader.cancel().catch(() => {
								// Ignore
							});
							return { status: finalState, buildLogs };
						}
					}
				}

				// Process remaining buffer
				/* v8 ignore start */
				if (buffer.trim()) {
					const terminalState = this.processStreamLine(buffer, buildLogs, handlers);
					if (terminalState) {
						finalState = terminalState;
					}
				}
				/* v8 ignore stop */

				return { status: finalState, buildLogs };
			} catch (error) {
				const isAbortError = error instanceof Error && error.name === "AbortError";
				if (!aborted && !isAbortError) {
					log.warn("Error streaming deployment events: %s", String(error));
				}
			}

			return { status: "BUILDING", buildLogs };
		})();

		return { promise, abort };
	}

	/**
	 * Process a single line from the event stream.
	 */
	private processStreamLine(line: string, buildLogs: Array<string>, handlers?: DeployEventHandlers): string | null {
		/* v8 ignore next 3 */
		if (!line.trim()) {
			return null;
		}

		const event = this.parseLine(line);
		if (!event) {
			return null;
		}

		this.handleEvent(event, buildLogs, handlers);
		return this.getTerminalState(event);
	}

	/**
	 * Handle individual deployment event - routes to appropriate callback.
	 * This is the key method that properly handles all event types including fatal.
	 */
	private handleEvent(event: VercelBuildEvent, buildLogs: Array<string>, handlers?: DeployEventHandlers): void {
		/* v8 ignore next 3 */
		if (!event || !event.type) {
			return;
		}

		const text = this.getEventText(event);

		// Log ALL events for debugging (temporarily verbose)
		log.debug({ eventType: event.type, text: text?.substring(0, 100) || "(no text)" }, "Vercel event");

		// Route to appropriate handler
		switch (event.type) {
			case "stdout":
				if (handlers?.onStdout && text) {
					handlers.onStdout(text);
				}
				if (text.trim()) {
					buildLogs.push(text);
				}
				break;

			case "stderr":
				if (handlers?.onStderr && text) {
					handlers.onStderr(text);
				}
				if (text.trim()) {
					buildLogs.push(text);
				}
				break;

			case "fatal":
				// Fatal events contain error messages from Vercel build failures
				// Call both onError and onStderr so errors are visible in build output
				if (handlers?.onError && text) {
					handlers.onError(text);
				}
				if (handlers?.onStderr && text) {
					handlers.onStderr(text);
				}
				if (text.trim()) {
					buildLogs.push(text);
				}
				break;

			case "command":
				if (handlers?.onCommand && text) {
					handlers.onCommand(text);
				}
				break;

			case "deployment-state": {
				const state = event.payload?.info?.readyState;
				if (handlers?.onStateChange && state) {
					handlers.onStateChange(state);
				}
				break;
			}
		}
	}

	/**
	 * Parse a line from the event stream (JSON or SSE format).
	 */
	private parseLine(line: string): VercelBuildEvent | null {
		try {
			return JSON.parse(line);
		} catch {
			/* v8 ignore start */
			if (line.startsWith("data: ")) {
				try {
					return JSON.parse(line.slice(6));
				} catch {
					// Ignore
				}
			}
			/* v8 ignore stop */
		}
		return null;
	}

	/**
	 * Get terminal state from event if it indicates completion.
	 */
	private getTerminalState(event: VercelBuildEvent): string | null {
		if (event.type === "deployment-state") {
			const state = event.payload?.info?.readyState;
			if (state === "READY" || state === "ERROR" || state === "CANCELED") {
				return state;
			}
		}
		if (event.type === "fatal") {
			return "ERROR";
		}
		return null;
	}

	/**
	 * Extract text from a Vercel event.
	 */
	private getEventText(event: VercelBuildEvent): string {
		return event.text || event.payload?.text || "";
	}

	// ========================================================================
	// Private Methods - Polling
	// ========================================================================

	/**
	 * Poll deployment status until completion or timeout.
	 */
	private async pollDeploymentStatus(
		deploymentId: string,
		pollInterval: number,
		timeout: number,
	): Promise<{ status: string; source: "poll"; buildLogs: Array<string> }> {
		const maxAttempts = Math.ceil(timeout / pollInterval);
		let attempts = 0;

		while (attempts < maxAttempts) {
			await new Promise(resolve => setTimeout(resolve, pollInterval));

			try {
				const deployment = await this.getDeploymentStatus(deploymentId);
				const newStatus = deployment.readyState || deployment.status || "UNKNOWN";

				log.debug("Deployment %s poll status: %s", deploymentId, newStatus);

				if (newStatus === "READY" || newStatus === "ERROR" || newStatus === "CANCELED") {
					return { status: newStatus, source: "poll", buildLogs: [] };
				}
			} catch (error) /* v8 ignore start */ {
				log.warn("Error polling deployment status: %s", String(error));
			}
			/* v8 ignore stop */

			attempts++;
		}

		return { status: "TIMEOUT", source: "poll", buildLogs: [] };
	}

	/**
	 * Fetch all events when status is ERROR.
	 * Always fetches from the API to ensure we have the complete error information,
	 * even if streaming already captured some logs.
	 */
	private async fetchBuildLogsOnError(
		deploymentId: string,
		existingLogs: Array<string>,
		handlers?: DeployEventHandlers,
	): Promise<Array<string>> {
		// Wait a moment for Vercel to finish recording all events
		// The events API may not have all logs immediately after the deployment status changes
		await new Promise(resolve => setTimeout(resolve, 2000));

		try {
			// Use limit=-1 to get ALL available logs, not just a limited set
			const response = await fetch(
				`https://api.vercel.com/v3/deployments/${deploymentId}/events?builds=1&direction=forward&limit=-1`,
				{
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error(`Failed to get deployment events: ${response.status}`);
			}

			const text = await response.text();
			const buildLogs: Array<string> = [];
			// Track existing logs to avoid duplicate broadcasts
			const existingSet = new Set(existingLogs);

			let broadcastCount = 0;
			let skippedCount = 0;
			let totalEvents = 0;
			for (const line of text.split("\n")) {
				if (!line.trim()) {
					continue;
				}
				const event = this.parseLine(line);
				if (event) {
					totalEvents++;
					// Log all event types to see what Vercel sends
					log.debug(
						"fetchBuildLogsOnError event: type=%s, text=%s",
						event.type,
						this.getEventText(event)?.substring(0, 80) || "(no text)",
					);

					if (event.type === "stdout" || event.type === "stderr" || event.type === "fatal") {
						const eventText = this.getEventText(event);
						if (eventText.trim()) {
							buildLogs.push(eventText);
							// Only broadcast events that were not already seen during streaming
							if (handlers && !existingSet.has(eventText)) {
								this.handleEvent(event, [], handlers);
								broadcastCount++;
							} else {
								skippedCount++;
							}
						}
					}
				}
			}
			log.info(
				"fetchBuildLogsOnError: total events=%d, broadcast=%d, skipped=%d",
				totalEvents,
				broadcastCount,
				skippedCount,
			);

			const newCount = buildLogs.length - existingLogs.length;
			log.debug(
				"Fetched %d build log entries after poll detected ERROR (%d new)",
				buildLogs.length,
				newCount > 0 ? newCount : 0,
			);

			// If we got logs from the API, use those (they're more complete)
			// Otherwise fall back to existing logs from streaming
			return buildLogs.length > 0 ? buildLogs : existingLogs;
		} catch (error) {
			log.warn("Failed to fetch deployment events for error logs: %s", String(error));
			return existingLogs;
		}
	}

	// ========================================================================
	// Private Methods - Helpers
	// ========================================================================

	/**
	 * Get detailed error message from Vercel deployment API.
	 */
	private async getDeploymentErrorMessage(deploymentId: string, buildLogs: Array<string>): Promise<string> {
		try {
			const deployment = await this.getDeploymentStatus(deploymentId);

			if (deployment.errorMessage) {
				let message = deployment.errorMessage;
				if (deployment.errorStep) {
					message = `[${deployment.errorStep}] ${message}`;
				}
				return message;
			}

			return this.parseVercelBuildErrors(buildLogs);
		} catch (error) {
			log.warn("Failed to fetch deployment error details: %s", String(error));
			return this.parseVercelBuildErrors(buildLogs);
		}
	}

	/**
	 * Parse build errors from Vercel build logs.
	 */
	private parseVercelBuildErrors(logs: Array<string>): string {
		const errorLines: Array<string> = [];
		let inErrorBlock = false;

		for (const line of logs) {
			if (
				line.includes("Error:") ||
				line.includes("error:") ||
				line.includes("ERROR") ||
				line.toLowerCase().includes("fatal") ||
				line.includes("failed")
			) {
				inErrorBlock = true;
			}

			if (inErrorBlock) {
				errorLines.push(line);
				if (line.trim() === "" || line.startsWith("info") || line.startsWith("ready")) {
					inErrorBlock = false;
				}
			}

			if (
				line.includes(".mdx") &&
				(line.includes("Error") || line.includes("failed")) &&
				!errorLines.includes(line)
			) {
				errorLines.push(line);
			}
		}

		if (errorLines.length === 0) {
			return "Build failed - no error details available in build logs";
		}

		return errorLines.slice(0, 20).join("\n");
	}

	/**
	 * Create deployment result from status.
	 */
	private async createDeployResult(
		deploymentId: string,
		status: string,
		buildLogs: Array<string>,
	): Promise<DeployResult> {
		if (status === "READY") {
			return { id: deploymentId, url: "", status: "ready", buildLogs };
		}
		if (status === "ERROR") {
			const errorMessage = await this.getDeploymentErrorMessage(deploymentId, buildLogs);
			return { id: deploymentId, url: "", status: "error", error: errorMessage, buildLogs };
		}
		if (status === "CANCELED") {
			return { id: deploymentId, url: "", status: "canceled", error: "Deployment was canceled", buildLogs };
		}
		if (status === "TIMEOUT") {
			return { id: deploymentId, url: "", status: "timeout", error: "Deployment timed out", buildLogs };
		}

		// This branch handles any unexpected status values (defensive code)
		/* v8 ignore next */
		return { id: deploymentId, url: "", status: "error", error: `Unknown deployment status: ${status}`, buildLogs };
	}

	/**
	 * Get stable production domain for a Vercel project.
	 * Note: Only used by deploy() method, tested via SiteRouter integration tests.
	 */
	/* v8 ignore start */
	private async getProductionDomain(projectName: string): Promise<string> {
		const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (response.status === 404) {
			return `https://${projectName}.vercel.app`;
		}

		if (!response.ok) {
			throw new Error(`Failed to get project: ${response.statusText}`);
		}

		const projectData = await response.json();

		if (projectData.targets?.production?.alias && projectData.targets.production.alias.length > 0) {
			return `https://${projectData.targets.production.alias[0]}`;
		}

		return `https://${projectName}.vercel.app`;
	}
	/* v8 ignore stop */

	/**
	 * Read all files from a directory recursively.
	 * Note: Only used by deploy() method, tested via SiteRouter integration tests.
	 */
	/* v8 ignore start */
	private async getFilesRecursively(
		dir: string,
		baseDir?: string,
	): Promise<Array<{ path: string; content: Buffer }>> {
		const base = baseDir || dir;
		const files: Array<{ path: string; content: Buffer }> = [];

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory() && EXCLUDE_DIRS.includes(entry.name)) {
				continue;
			}

			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				const subFiles = await this.getFilesRecursively(fullPath, base);
				files.push(...subFiles);
			} else {
				const relativePath = relative(base, fullPath).replace(/\\/g, "/");
				const content = await readFile(fullPath);
				files.push({ path: relativePath, content });
			}
		}

		return files;
	}
	/* v8 ignore stop */

	/**
	 * Extract error detail from Vercel API error response.
	 */
	private extractErrorDetail(errorData: Record<string, unknown>, defaultText: string): string {
		if (errorData.error) {
			if (typeof errorData.error === "string") {
				return errorData.error;
			}
			if (typeof errorData.error === "object" && errorData.error !== null) {
				const errorObj = errorData.error as Record<string, unknown>;
				if ("message" in errorObj && typeof errorObj.message === "string") {
					return errorObj.message;
				}
				try {
					return JSON.stringify(errorObj, null, 2);
					/* v8 ignore start */
				} catch {
					return String(errorObj);
				}
				/* v8 ignore stop */
			}
		}
		return defaultText;
	}
}

// ============================================================================
// Helper function for creating event handlers (for SiteRouter)
// ============================================================================

/**
 * Build event types for SSE broadcasting (matches BuildStreamService.BuildEventType).
 */
type BuildEventType =
	| "build:clear"
	| "build:mode"
	| "build:step"
	| "build:stdout"
	| "build:stderr"
	| "build:command"
	| "build:state"
	| "build:completed"
	| "build:failed";

/**
 * Build event type for SSE broadcasting (matches BuildStreamService.BuildEvent).
 */
interface BuildEvent {
	type: BuildEventType;
	[key: string]: unknown;
}

/**
 * Creates a DeployEventHandlers object that broadcasts events to SSE clients.
 * This is a convenience factory for use in SiteRouter.
 *
 * @param broadcast - Function to broadcast build events (e.g., broadcastBuildEvent)
 * @param siteId - The site ID for the broadcast
 * @param step - The current build step number
 * @returns DeployEventHandlers configured for SSE broadcasting
 */
export function createBuildEventHandlers(
	broadcast: (siteId: number, event: BuildEvent) => void,
	siteId: number,
	step: number,
): DeployEventHandlers {
	return {
		onStdout: text => broadcast(siteId, { type: "build:stdout", step, output: text }),
		onStderr: text => broadcast(siteId, { type: "build:stderr", step, output: text }),
		onError: text => broadcast(siteId, { type: "build:stderr", step, output: text }),
		onCommand: cmd => broadcast(siteId, { type: "build:command", step, command: cmd }),
		onStateChange: state => broadcast(siteId, { type: "build:state", step, state }),
	};
}
