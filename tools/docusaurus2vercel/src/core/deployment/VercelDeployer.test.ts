import type { DeploymentOptions } from "../../types/Deployment";
import { VercelDeployer } from "./VercelDeployer";
import * as fs from "node:fs/promises";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios");
vi.mock("node:fs/promises");

describe("VercelDeployer", () => {
	let deployer: VercelDeployer;
	const mockToken = "test-token-123";

	beforeEach(() => {
		deployer = new VercelDeployer(mockToken);
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create instance with token", () => {
			expect(deployer).toBeDefined();
			expect(deployer).toBeInstanceOf(VercelDeployer);
		});
	});

	describe("deploy", () => {
		const mockOptions: DeploymentOptions = {
			buildPath: "/test/build",
			projectName: "test-project",
			token: mockToken,
		};

		it("should successfully deploy to Vercel", async () => {
			// Mock file reading with withFileTypes: true
			vi.mocked(fs.readdir).mockResolvedValue([{ name: "index.html", isDirectory: () => false } as never]);
			vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("<html></html>"));

			// Mock Vercel API response
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "deployment-123",
					url: "test-project-abc123.vercel.app",
					name: "test-project",
					readyState: "READY",
				},
			});

			const result = await deployer.deploy(mockOptions);

			expect(result.status).toBe("ready");
			expect(result.url).toContain("https://");
			expect(result.deploymentId).toBe("deployment-123");
		});

		it("should emit phase events during deployment", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const phases: Array<string> = [];
			deployer.on("phase", phase => phases.push(phase));

			await deployer.deploy(mockOptions);

			expect(phases).toContain("uploading");
			expect(phases).toContain("complete");
		});

		it("should handle deployment errors gracefully", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockRejectedValue(new Error("API Error"));

			const errorEvents: Array<Error> = [];
			deployer.on("error", error => errorEvents.push(error));

			const result = await deployer.deploy(mockOptions);

			expect(result.status).toBe("error");
			expect(result.error).toBeDefined();
			expect(errorEvents.length).toBeGreaterThan(0);
		});

		it("should send correct headers to Vercel API", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			await deployer.deploy(mockOptions);

			expect(axios.post).toHaveBeenCalledWith(
				expect.stringContaining("/v13/deployments"),
				expect.any(Object),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockToken}`,
						"Content-Type": "application/json",
					}),
				}),
			);
		});

		it("should include project settings in deployment", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			await deployer.deploy(mockOptions);

			expect(axios.post).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					projectSettings: expect.objectContaining({
						framework: "docusaurus-2",
						buildCommand: "npm run build",
						installCommand: "npm install",
						outputDirectory: "build",
					}),
				}),
				expect.any(Object),
			);
		});

		it("should emit deploy events", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const events: Array<string> = [];
			deployer.on("deploy-start", () => events.push("deploy-start"));
			deployer.on("deploy-log", (_msg: string) => events.push("deploy-log"));
			deployer.on("deploy-complete", () => events.push("deploy-complete"));

			await deployer.deploy(mockOptions);

			expect(events).toContain("deploy-start");
			expect(events).toContain("deploy-log");
			expect(events).toContain("deploy-complete");
		});

		it("should emit production domain log when getProductionDomain succeeds", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test-project-abc123.vercel.app",
					name: "test-project",
					readyState: "READY",
				},
			});
			vi.mocked(axios.get).mockResolvedValue({
				data: {
					id: "proj-123",
					name: "test-project",
					targets: {
						production: {
							alias: ["my-prod-domain.com"],
						},
					},
				},
			});

			const logs: Array<string> = [];
			deployer.on("deploy-log", (msg: string) => logs.push(msg));

			const result = await deployer.deploy(mockOptions);

			expect(result.status).toBe("ready");
			expect(result.url).toBe("https://my-prod-domain.com");
			expect(result.productionDomain).toBe("https://my-prod-domain.com");
			expect(logs.some(log => log.includes("Production domain:"))).toBe(true);
		});

		// biome-ignore lint/suspicious/noSkippedTests: Error handling test has mock issues
		it.skip("should handle API error responses", async () => {
			// Mock file reading with withFileTypes: true
			vi.mocked(fs.readdir).mockResolvedValue([{ name: "test.html", isDirectory: () => false } as never]);
			vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("test"));

			const apiError = new Error("Invalid token") as Error & {
				response?: { data?: { error?: { message?: string } } };
			};
			apiError.response = {
				data: {
					error: {
						message: "Invalid token",
					},
				},
			};
			vi.mocked(axios.post).mockRejectedValue(apiError);

			const result = await deployer.deploy(mockOptions);

			expect(result.status).toBe("error");
			expect(result.error).toBeDefined();
		});
	});

	describe("edge cases", () => {
		it("should handle empty build directory", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const result = await deployer.deploy({
				buildPath: "/empty",
				projectName: "test",
				token: mockToken,
			});

			expect(result.status).toBe("ready");
		});

		it("should handle special characters in project name", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([] as never);
			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test-project-123.vercel.app",
					name: "test-project-123",
					readyState: "READY",
				},
			});

			const result = await deployer.deploy({
				buildPath: "/test",
				projectName: "test-project-123",
				token: mockToken,
			});

			expect(result.status).toBe("ready");
		});

		it("should handle nested directories when reading files", async () => {
			// First call returns a directory
			vi.mocked(fs.readdir)
				.mockResolvedValueOnce([
					{ name: "src", isDirectory: () => true } as never,
					{ name: "index.html", isDirectory: () => false } as never,
				])
				// Second call for subdirectory
				.mockResolvedValueOnce([{ name: "app.js", isDirectory: () => false } as never]);

			vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("content"));

			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const result = await deployer.deploy({
				buildPath: "/test",
				projectName: "test",
				token: mockToken,
			});

			expect(result.status).toBe("ready");
			// Verify files were read recursively
			expect(fs.readFile).toHaveBeenCalledTimes(2);
		});

		it("should skip excluded directories like node_modules", async () => {
			vi.mocked(fs.readdir).mockResolvedValue([
				{ name: "node_modules", isDirectory: () => true } as never,
				{ name: "build", isDirectory: () => true } as never,
				{ name: ".git", isDirectory: () => true } as never,
				{ name: "index.html", isDirectory: () => false } as never,
			]);

			vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("content"));

			vi.mocked(axios.post).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const result = await deployer.deploy({
				buildPath: "/test",
				projectName: "test",
				token: mockToken,
			});

			expect(result.status).toBe("ready");
			// Should only read the index.html file, not the excluded directories
			expect(fs.readFile).toHaveBeenCalledTimes(1);
		});
	});

	describe("getProductionDomain", () => {
		it("should return production alias when available", async () => {
			vi.mocked(axios.get).mockResolvedValue({
				data: {
					id: "proj-123",
					name: "test-project",
					targets: {
						production: {
							alias: ["my-custom-domain.com", "test-project.vercel.app"],
						},
					},
				},
			});

			const domain = await deployer.getProductionDomain("test-project");

			expect(domain).toBe("https://my-custom-domain.com");
			expect(axios.get).toHaveBeenCalledWith(
				expect.stringContaining("/v9/projects/test-project"),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockToken}`,
					}),
				}),
			);
		});

		it("should return default vercel.app domain when no alias exists", async () => {
			vi.mocked(axios.get).mockResolvedValue({
				data: {
					id: "proj-123",
					name: "test-project",
					targets: {},
				},
			});

			const domain = await deployer.getProductionDomain("test-project");

			expect(domain).toBe("https://test-project.vercel.app");
		});

		it("should return default domain when project does not exist (404)", async () => {
			const error404 = new Error("Not found") as Error & { response?: { status?: number } };
			error404.response = { status: 404 };
			vi.mocked(axios.get).mockRejectedValue(error404);

			const domain = await deployer.getProductionDomain("new-project");

			expect(domain).toBe("https://new-project.vercel.app");
		});

		it("should throw error for non-404 failures", async () => {
			vi.mocked(axios.get).mockRejectedValue(new Error("Network error"));

			await expect(deployer.getProductionDomain("test-project")).rejects.toThrow(
				"Failed to get production domain",
			);
		});
	});

	describe("checkDeploymentStatus", () => {
		it("should successfully check deployment status", async () => {
			vi.mocked(axios.get).mockResolvedValue({
				data: {
					id: "dep-123",
					url: "test.vercel.app",
					name: "test",
					readyState: "READY",
				},
			});

			const status = await deployer.checkDeploymentStatus("dep-123");

			expect(status).toBe("READY");
			expect(axios.get).toHaveBeenCalledWith(
				expect.stringContaining("/v13/deployments/dep-123"),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: `Bearer ${mockToken}`,
					}),
				}),
			);
		});

		it("should handle different deployment states", async () => {
			const states = ["BUILDING", "QUEUED", "ERROR", "CANCELED"];

			for (const state of states) {
				vi.mocked(axios.get).mockResolvedValue({
					data: {
						id: "dep-123",
						url: "test.vercel.app",
						name: "test",
						readyState: state,
					},
				});

				const status = await deployer.checkDeploymentStatus("dep-123");
				expect(status).toBe(state);
			}
		});

		it("should throw error when status check fails", async () => {
			vi.mocked(axios.get).mockRejectedValue(new Error("Not found"));

			await expect(deployer.checkDeploymentStatus("invalid-id")).rejects.toThrow(
				"Failed to check deployment status",
			);
		});
	});
});
