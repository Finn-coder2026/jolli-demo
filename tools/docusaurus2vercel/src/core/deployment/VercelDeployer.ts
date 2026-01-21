import type { DeploymentOptions, DeploymentResult } from "../../types/Deployment";
import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import axios from "axios";

interface VercelDeploymentResponse {
	id: string;
	url: string;
	name: string;
	readyState: "READY" | "BUILDING" | "ERROR" | "QUEUED" | "CANCELED";
	aliasError?: {
		code: string;
		message: string;
	};
}

export class VercelDeployer extends EventEmitter {
	private token: string;
	private apiUrl = "https://api.vercel.com";

	constructor(token: string) {
		super();
		this.token = token;
	}

	async deploy(options: DeploymentOptions): Promise<DeploymentResult> {
		try {
			this.emit("phase", "uploading");

			// Deploy using Vercel API
			const { url: deploymentUrl, id: deploymentId } = await this.deployWithAPI(options);

			// If deploying to production, fetch the stable production domain
			let productionDomain: string | undefined;
			if (options.target === "production" || !options.target) {
				// Default to production for backward compatibility
				try {
					productionDomain = await this.getProductionDomain(options.projectName);
					this.emit("deploy-log", `Production domain: ${productionDomain}`);
				} catch (_error) {
					// If we can't get production domain, fall back to deployment URL
					this.emit("deploy-log", `Could not fetch production domain, using deployment URL`);
					productionDomain = deploymentUrl;
				}
			}

			this.emit("phase", "complete");

			return {
				url: productionDomain || deploymentUrl, // Use production domain if available, otherwise deployment URL
				deploymentId,
				status: "ready" as const,
				...(productionDomain ? { productionDomain } : {}),
				...(options.target === "preview" ? { previewUrl: deploymentUrl } : {}),
			};
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.emit("error", err);
			return {
				url: "",
				deploymentId: "",
				status: "error",
				error: err.message,
			};
		}
	}

	// Deploy using Vercel API (SDK) - replicates `vercel --prod` behavior
	private async deployWithAPI(options: DeploymentOptions): Promise<{ url: string; id: string }> {
		this.emit("deploy-start");

		try {
			this.emit("deploy-log", "Reading project files...");

			// Read all files from project directory (excluding node_modules, build, etc.)
			const files = await this.getFilesRecursively(options.buildPath);

			this.emit("deploy-log", `Uploading ${files.length} files to Vercel...`);

			// Create deployment using Vercel API
			const response = await axios.post<VercelDeploymentResponse>(
				`${this.apiUrl}/v13/deployments`,
				{
					name: options.projectName,
					files: files.map(f => ({
						file: f.path,
						// Send text files as UTF-8, binary files as base64
						data: f.content.toString("utf-8"),
					})),
					projectSettings: {
						framework: "docusaurus-2",
						buildCommand: "npm run build",
						installCommand: "npm install",
						outputDirectory: "build",
					},
					target: options.target || "production", // Use provided target or default to production
				},
				{
					headers: {
						Authorization: `Bearer ${this.token}`,
						"Content-Type": "application/json",
					},
				},
			);

			const deploymentUrl = `https://${response.data.url}`;
			const deploymentId = response.data.id;

			this.emit("deploy-log", `Deployed to: ${deploymentUrl}`);
			this.emit("deploy-complete", deploymentUrl);

			return { url: deploymentUrl, id: deploymentId };
		} catch (error: unknown) {
			const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
			const errorMessage = err.response?.data?.error?.message || err.message || String(error);
			throw new Error(`Deployment failed: ${errorMessage}`);
		}
	}

	private async getFilesRecursively(
		dir: string,
		baseDir?: string,
	): Promise<Array<{ path: string; content: Buffer }>> {
		const base = baseDir || dir;
		const files: Array<{ path: string; content: Buffer }> = [];

		const entries = await fs.readdir(dir, { withFileTypes: true });

		// Folders to exclude from upload
		const excludeDirs = ["node_modules", "build", ".git", ".vercel", "dist", ".docusaurus"];

		for (const entry of entries) {
			// Skip excluded directories
			if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
				continue;
			}

			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				const subFiles = await this.getFilesRecursively(fullPath, base);
				files.push(...subFiles);
			} else {
				const relativePath = path.relative(base, fullPath).replace(/\\/g, "/");
				const content = await fs.readFile(fullPath);
				files.push({ path: relativePath, content });
			}
		}

		return files;
	}

	// Utility: Check deployment status
	async checkDeploymentStatus(deploymentId: string): Promise<string> {
		try {
			const response = await axios.get<VercelDeploymentResponse>(
				`${this.apiUrl}/v13/deployments/${deploymentId}`,
				{
					headers: {
						Authorization: `Bearer ${this.token}`,
					},
				},
			);

			return response.data.readyState;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to check deployment status: ${message}`);
		}
	}

	// Utility: Get stable production domain for a project
	async getProductionDomain(projectName: string): Promise<string> {
		try {
			const response = await axios.get(`${this.apiUrl}/v9/projects/${projectName}`, {
				headers: {
					Authorization: `Bearer ${this.token}`,
				},
			});

			// Get the production domain from the project
			// Vercel projects have a default production domain like projectname.vercel.app
			const projectData = response.data;

			// Try to get production domain from targets
			if (projectData.targets?.production?.alias && projectData.targets.production.alias.length > 0) {
				return `https://${projectData.targets.production.alias[0]}`;
			}

			// Fallback: construct from project name
			return `https://${projectName}.vercel.app`;
		} catch (error: unknown) {
			const err = error as { response?: { status?: number }; message?: string };
			// If project doesn't exist yet (404), return the expected production domain
			if (err.response?.status === 404) {
				return `https://${projectName}.vercel.app`;
			}
			const message = err.message || String(error);
			throw new Error(`Failed to get production domain: ${message}`);
		}
	}
}
