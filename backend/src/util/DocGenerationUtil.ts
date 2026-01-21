//noinspection ExceptionCaughtLocallyJS

import { getConfig } from "../config/Config";
import { isBinaryFile } from "./FileTypeUtil";
import { getLog } from "./Logger";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const log = getLog(import.meta);

export interface DeploymentResult {
	url: string;
	deploymentId: string;
	status: "ready" | "building" | "error";
	error?: string;
	productionDomain?: string;
	previewUrl?: string;
}

export function getToolsPath() {
	const toolsPath = getConfig().TOOLS_PATH;
	return toolsPath.startsWith("/") ? toolsPath : join(process.cwd(), toolsPath);
}

/**
 * Clone a GitHub repository using an access token
 */
export async function cloneRepository(
	repo: string,
	branch: string,
	accessToken: string,
	targetDir: string,
): Promise<void> {
	log.info({ repo, branch, targetDir }, "Cloning repository");

	// Create target directory
	await mkdir(targetDir, { recursive: true });

	// Construct authenticated Git URL
	const url = `https://oauth2:${accessToken}@github.com/${repo}.git`;

	return new Promise((resolve, reject) => {
		const git = spawn("git", ["clone", "--branch", branch, "--single-branch", "--depth", "1", url, targetDir]);

		let stderr = "";
		git.stderr.on("data", data => {
			stderr += data.toString();
		});

		git.on("close", code => {
			if (code === 0) {
				log.info({ repo, branch }, "Repository cloned successfully");
				resolve();
			} else {
				log.error({ repo, branch, stderr }, "Failed to clone repository");
				reject(new Error(`Failed to clone repository: ${stderr}`));
			}
		});

		git.on("error", error => {
			log.error({ repo, branch, error }, "Git process error");
			reject(error);
		});
	});
}

/**
 * Generate Docusaurus documentation from code using code2docusaurus tool
 */
export function generateDocusaurusFromCode(repoPath: string, outputPath: string): Promise<void> {
	log.info({ repoPath, outputPath }, "Generating Docusaurus documentation");

	// Get the path to the code2docusaurus tool
	const toolPath = join(getToolsPath(), "code2docusaurus", "dist", "index.js");

	return new Promise((resolve, reject) => {
		const tool = spawn("node", [toolPath, repoPath, "--output", outputPath, "--generate-docs"]);

		let stdout = "";
		let stderr = "";

		tool.stdout.on("data", data => {
			stdout += data.toString();
			log.debug({ output: data.toString() }, "code2docusaurus output");
		});

		tool.stderr.on("data", data => {
			stderr += data.toString();
			log.debug({ error: data.toString() }, "code2docusaurus error");
		});

		tool.on("close", code => {
			if (code === 0) {
				log.info({ repoPath }, "Documentation generated successfully");
				resolve();
			} else {
				log.error({ repoPath, stdout, stderr }, "Failed to generate documentation");
				reject(new Error(`Failed to generate documentation: ${stderr}`));
			}
		});

		tool.on("error", error => {
			log.error({ repoPath, error }, "code2docusaurus process error");
			reject(error);
		});
	});
}

/**
 * Deploy Docusaurus site to Vercel using Vercel API directly
 */
export async function deployToVercel(
	docsPath: string,
	projectName: string,
	vercelToken: string,
	target?: "preview" | "production",
	framework?: "nextra" | "docusaurus",
): Promise<DeploymentResult> {
	log.info({ docsPath, projectName, target, framework }, "Deploying to Vercel via API");

	// Determine Vercel framework settings based on the framework type
	// Nextra uses Next.js (nextjs framework), Docusaurus uses docusaurus-2
	const isNextjs = framework === "nextra";
	const projectSettings = isNextjs
		? {
				framework: "nextjs",
				buildCommand: "npm run build",
				installCommand: "npm install",
				outputDirectory: ".next",
			}
		: {
				framework: "docusaurus-2",
				buildCommand: "npm run build",
				installCommand: "npm install",
				outputDirectory: "build",
			};

	try {
		// Read all files from project directory (excludes node_modules, .next, build artifacts)
		const files = await getFilesRecursively(docsPath);
		const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
		log.info(
			{ projectName, fileCount: files.length, totalSizeKB: Math.round(totalSize / 1024) },
			"Uploading files to Vercel",
		);

		// Create deployment using Vercel API
		// Binary files (images, fonts, etc.) must be base64 encoded per Vercel API requirements
		const vercelFiles = files.map(f => {
			if (isBinaryFile(f.path)) {
				return {
					file: f.path,
					data: f.content.toString("base64"),
					encoding: "base64" as const,
				};
			}
			return {
				file: f.path,
				data: f.content.toString("utf-8"),
			};
		});

		const response = await fetch("https://api.vercel.com/v13/deployments", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${vercelToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: projectName,
				files: vercelFiles,
				projectSettings,
				target: target || "production", // Default to production
				// Force fresh build by adding build metadata
				meta: {
					buildTimestamp: Date.now().toString(),
					buildType: "regeneration",
				},
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: response.statusText }));
			const errorMessage = errorData.error?.message || errorData.error || response.statusText;
			throw new Error(`Deployment failed: ${errorMessage}`);
		}

		const deploymentData = await response.json();
		const deploymentUrl = `https://${deploymentData.url}`;
		const deploymentId = deploymentData.id;

		log.info({ projectName, deploymentUrl }, "Deployed to Vercel");

		// If deploying to production, fetch the stable production domain
		let productionDomain: string | undefined;
		if (target === "production" || !target) {
			try {
				productionDomain = await getProductionDomain(projectName, vercelToken);
				log.info({ projectName, productionDomain }, "Got production domain");
			} catch (error) {
				log.warn({ projectName, error }, "Could not fetch production domain, using deployment URL");
				productionDomain = deploymentUrl;
			}
		}

		return {
			url: productionDomain || deploymentUrl,
			deploymentId,
			status: "building", // Deployment is queued but build hasn't completed yet
			...(productionDomain ? { productionDomain } : {}),
			...(target === "preview" ? { previewUrl: deploymentUrl } : {}),
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error({ projectName, errorMessage }, "Failed to deploy to Vercel");
		return {
			url: "",
			deploymentId: "",
			status: "error",
			error: errorMessage,
		};
	}
}

/**
 * Get stable production domain for a Vercel project
 */
async function getProductionDomain(projectName: string, vercelToken: string): Promise<string> {
	try {
		const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			headers: {
				Authorization: `Bearer ${vercelToken}`,
			},
		});

		if (response.status === 404) {
			// Project doesn't exist yet, return expected production domain
			return `https://${projectName}.vercel.app`;
		}

		if (!response.ok) {
			throw new Error(`Failed to get project: ${response.statusText}`);
		}

		const projectData = await response.json();

		// Try to get production domain from targets
		if (projectData.targets?.production?.alias && projectData.targets.production.alias.length > 0) {
			return `https://${projectData.targets.production.alias[0]}`;
		}

		// Fallback: construct from project name
		return `https://${projectName}.vercel.app`;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to get production domain: ${errorMessage}`);
	}
}

/**
 * Check deployment status on Vercel
 */
export async function checkDeploymentStatus(
	deploymentId: string,
	vercelToken: string,
): Promise<"building" | "ready" | "error"> {
	try {
		const response = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
			headers: {
				Authorization: `Bearer ${vercelToken}`,
			},
		});

		if (!response.ok) {
			log.warn({ deploymentId }, "Failed to check deployment status");
			return "building"; // Assume still building if we can't check
		}

		const deployment = await response.json();

		// Vercel deployment states: BUILDING, READY, ERROR, CANCELED
		if (deployment.readyState === "READY") {
			return "ready";
		}
		if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
			return "error";
		}
		return "building";
	} catch (error) {
		log.error({ deploymentId, error }, "Error checking deployment status");
		return "building"; // Assume still building on error
	}
}

/**
 * Read all files from a directory recursively (excluding certain directories)
 */
async function getFilesRecursively(dir: string, baseDir?: string): Promise<Array<{ path: string; content: Buffer }>> {
	const { readdir, readFile } = await import("node:fs/promises");
	const { join, relative } = await import("node:path");

	const base = baseDir || dir;
	const files: Array<{ path: string; content: Buffer }> = [];
	// Exclude directories that shouldn't be uploaded to Vercel
	// - node_modules: dependencies (Vercel will install these)
	// - build: Docusaurus build output
	// - .next: Next.js/Nextra build output (can be 100MB+)
	// - .git, .vercel: version control and Vercel config
	// - dist, .docusaurus: other build artifacts
	// - _pagefind: pagefind search index generated during postbuild
	const excludeDirs = ["node_modules", "build", ".git", ".vercel", "dist", ".docusaurus", ".next", "_pagefind"];

	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		// Skip excluded directories
		if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
			continue;
		}

		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			const subFiles = await getFilesRecursively(fullPath, base);
			files.push(...subFiles);
		} else {
			const relativePath = relative(base, fullPath).replace(/\\/g, "/");
			const content = await readFile(fullPath);
			files.push({ path: relativePath, content });
		}
	}

	return files;
}

/**
 * Delete a Vercel project using the Vercel API
 * @deprecated Use VercelDeployer.deleteProject() instead
 */
export async function deleteVercelProject(projectName: string, vercelToken: string): Promise<void> {
	log.info({ projectName }, "Deleting Vercel project");

	try {
		// First, get the project ID
		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${vercelToken}`,
			},
		});

		if (projectResponse.status === 404) {
			// Project doesn't exist, consider it already deleted
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
				Authorization: `Bearer ${vercelToken}`,
			},
		});

		if (deleteResponse.status === 404) {
			// Project was deleted between the GET and DELETE calls
			log.info({ projectName }, "Vercel project already deleted");
			return;
		}

		if (!deleteResponse.ok) {
			const errorData = await deleteResponse.json().catch(() => ({ error: deleteResponse.statusText }));
			throw new Error(`Failed to delete Vercel project: ${errorData.error || deleteResponse.statusText}`);
		}

		log.info({ projectName }, "Vercel project deleted successfully");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : /* v8 ignore next */ String(error);
		log.error(
			{
				projectName,
				errorMessage,
				errorStack: error instanceof Error ? error.stack : /* v8 ignore next */ undefined,
			},
			"Failed to delete Vercel project",
		);
		throw error;
	}
}

/**
 * Get the protection status of a Vercel project
 * @deprecated Use VercelDeployer.getProjectProtection() instead
 */
export async function getVercelProjectProtectionStatus(
	projectName: string,
	vercelToken: string,
): Promise<{
	isProtected: boolean;
	protectionType: "password" | "sso" | "vercel-auth" | "none";
}> {
	log.info({ projectName }, "Getting Vercel project protection status");

	try {
		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${vercelToken}`,
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
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : /* v8 ignore next */ String(error);
		log.error(
			{
				projectName,
				errorMessage,
				errorStack: error instanceof Error ? error.stack : /* v8 ignore next */ undefined,
			},
			"Failed to get Vercel project protection status",
		);
		throw error;
	}
}

/**
 * Set or remove protection on a Vercel project
 * @deprecated Use VercelDeployer.setProjectProtection() instead
 */
export async function setVercelProjectProtection(
	projectName: string,
	vercelToken: string,
	enableProtection: boolean,
): Promise<void> {
	log.info({ projectName, enableProtection }, "Setting Vercel project protection");

	try {
		// Get project details first to get the project ID
		const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${vercelToken}`,
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
			? {
					// Enable Vercel Authentication (SSO)
					ssoProtection: {
						deploymentType: "all",
					},
				}
			: {
					// Remove all protection
					ssoProtection: null,
					passwordProtection: null,
				};

		const updateResponse = await fetch(`https://api.vercel.com/v10/projects/${projectId}`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${vercelToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(updatePayload),
		});

		if (!updateResponse.ok) {
			const errorData = await updateResponse.json().catch(() => ({ error: updateResponse.statusText }));

			// Extract meaningful error details from the Vercel API response
			let errorDetail = updateResponse.statusText;
			if (errorData.error) {
				if (typeof errorData.error === "string") {
					errorDetail = errorData.error;
				} else if (typeof errorData.error === "object") {
					// Handle error objects with message property
					if ("message" in errorData.error && typeof errorData.error.message === "string") {
						errorDetail = errorData.error.message;
					} else {
						// Safely stringify the error object
						try {
							errorDetail = JSON.stringify(errorData.error, null, 2);
						} catch {
							errorDetail = String(errorData.error);
						}
					}
				}
			}

			// Log the full error data and response for debugging
			log.error(
				{
					projectName,
					enableProtection,
					statusCode: updateResponse.status,
					statusText: updateResponse.statusText,
					errorData,
				},
				"Vercel API returned error response",
			);

			throw new Error(
				`Failed to update Vercel project protection: ${errorDetail} (status: ${updateResponse.status})`,
			);
		}

		log.info({ projectName, enableProtection }, "Vercel project protection updated successfully");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : /* v8 ignore next */ String(error);
		log.error(
			{
				projectName,
				enableProtection,
				errorMessage,
				errorStack: error instanceof Error ? error.stack : /* v8 ignore next */ undefined,
			},
			"Failed to set Vercel project protection",
		);
		throw error;
	}
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDirectory(dirPath: string): Promise<void> {
	try {
		await rm(dirPath, { recursive: true, force: true });
		log.info({ dirPath }, "Cleaned up temporary directory");
	} catch (error) {
		log.warn({ dirPath, error }, "Failed to clean up temporary directory");
	}
}
