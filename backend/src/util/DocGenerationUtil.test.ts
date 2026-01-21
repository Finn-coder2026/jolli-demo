import {
	cleanupTempDirectory,
	cloneRepository,
	deleteVercelProject,
	deployToVercel,
	generateDocusaurusFromCode,
	getToolsPath,
	getVercelProjectProtectionStatus,
	setVercelProjectProtection,
} from "./DocGenerationUtil";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import EventEmitter from "node:events";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock node modules
vi.mock("node:child_process");
vi.mock("node:fs/promises");
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		TOOLS_PATH: "/default/tools/path",
	})),
}));

// Mock global fetch
global.fetch = vi.fn();

describe("DocGenerationUtil", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// Helper to create mock child process
	function createMockChildProcess(): ChildProcess {
		const mockProcess = new EventEmitter();
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires flexible typing
		(mockProcess as any).stdout = new EventEmitter();
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires flexible typing
		(mockProcess as any).stderr = new EventEmitter();
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires flexible typing
		(mockProcess as any).stdin = new EventEmitter();
		return mockProcess as ChildProcess;
	}

	describe("cloneRepository", () => {
		it("should clone repository successfully", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);
			(mkdir as Mock).mockResolvedValue(undefined);

			const promise = cloneRepository("owner/repo", "main", "fake-token", "/tmp/test");

			// Simulate successful clone
			setImmediate(() => {
				mockProcess.emit("close", 0);
			});

			await promise;

			expect(mkdir).toHaveBeenCalledWith("/tmp/test", { recursive: true });
			expect(spawn).toHaveBeenCalledWith("git", [
				"clone",
				"--branch",
				"main",
				"--single-branch",
				"--depth",
				"1",
				"https://oauth2:fake-token@github.com/owner/repo.git",
				"/tmp/test",
			]);
		});

		it("should reject on clone failure", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);
			(mkdir as Mock).mockResolvedValue(undefined);

			const promise = cloneRepository("owner/repo", "main", "fake-token", "/tmp/test");

			// Simulate failure with stderr
			setImmediate(() => {
				if (mockProcess.stderr) {
					(mockProcess.stderr as EventEmitter).emit("data", Buffer.from("Repository not found"));
				}
				mockProcess.emit("close", 1);
			});

			await expect(promise).rejects.toThrow("Failed to clone repository: Repository not found");
		});

		it("should reject on git process error", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);
			(mkdir as Mock).mockResolvedValue(undefined);

			const promise = cloneRepository("owner/repo", "main", "fake-token", "/tmp/test");

			// Simulate process error
			setImmediate(() => {
				mockProcess.emit("error", new Error("Process spawn failed"));
			});

			await expect(promise).rejects.toThrow("Process spawn failed");
		});

		it("should handle multiple stderr chunks", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);
			(mkdir as Mock).mockResolvedValue(undefined);

			const promise = cloneRepository("owner/repo", "main", "fake-token", "/tmp/test");

			// Simulate multiple stderr chunks
			setImmediate(() => {
				if (mockProcess.stderr) {
					(mockProcess.stderr as EventEmitter).emit("data", Buffer.from("Error part 1 "));
					(mockProcess.stderr as EventEmitter).emit("data", Buffer.from("Error part 2"));
				}
				mockProcess.emit("close", 1);
			});

			await expect(promise).rejects.toThrow("Failed to clone repository: Error part 1 Error part 2");
		});
	});

	describe("generateDocusaurusFromCode", () => {
		it("should generate documentation successfully", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);

			const promise = generateDocusaurusFromCode("/tmp/repo", "/tmp/docs");

			// Simulate successful generation
			setImmediate(() => {
				if (mockProcess.stdout) {
					(mockProcess.stdout as EventEmitter).emit("data", Buffer.from("Generating docs..."));
				}
				mockProcess.emit("close", 0);
			});

			await promise;

			expect(spawn).toHaveBeenCalledWith("node", [
				expect.stringContaining("code2docusaurus"),
				"/tmp/repo",
				"--output",
				"/tmp/docs",
				"--generate-docs",
			]);
		});

		it("should reject on generation failure", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);

			const promise = generateDocusaurusFromCode("/tmp/repo", "/tmp/docs");

			// Simulate failure
			setImmediate(() => {
				if (mockProcess.stderr) {
					(mockProcess.stderr as EventEmitter).emit("data", Buffer.from("Failed to parse code"));
				}
				mockProcess.emit("close", 1);
			});

			await expect(promise).rejects.toThrow("Failed to generate documentation: Failed to parse code");
		});

		it("should reject on process error", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);

			const promise = generateDocusaurusFromCode("/tmp/repo", "/tmp/docs");

			// Simulate process error
			setImmediate(() => {
				mockProcess.emit("error", new Error("Tool not found"));
			});

			await expect(promise).rejects.toThrow("Tool not found");
		});

		it("should handle stdout and stderr output", async () => {
			const mockProcess = createMockChildProcess();
			(spawn as Mock).mockReturnValue(mockProcess);

			const promise = generateDocusaurusFromCode("/tmp/repo", "/tmp/docs");

			// Simulate mixed output
			setImmediate(() => {
				if (mockProcess.stdout) {
					(mockProcess.stdout as EventEmitter).emit("data", Buffer.from("Processing files..."));
					(mockProcess.stdout as EventEmitter).emit("data", Buffer.from("Done!"));
				}
				if (mockProcess.stderr) {
					(mockProcess.stderr as EventEmitter).emit("data", Buffer.from("Warning: deprecated API"));
				}
				mockProcess.emit("close", 0);
			});

			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe("deployToVercel", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("should deploy to production successfully", async () => {
			// Mock file system
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
			vi.mocked(readdir).mockResolvedValue([{ name: "package.json", isDirectory: () => false } as any]);
			vi.mocked(readFile).mockResolvedValue(Buffer.from('{"name": "test"}'));

			// Mock Vercel API responses
			globalThis.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ url: "my-project-abc123.vercel.app", id: "dpl_123456" }),
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ targets: { production: { alias: ["my-project.vercel.app"] } } }),
				} as Response);

			const result = await deployToVercel("/tmp/docs", "my-project", "vercel-token");

			expect(result.status).toBe("building");
			expect(result.productionDomain).toBe("https://my-project.vercel.app");
			expect(result.deploymentId).toBe("dpl_123456");
		});

		it("should deploy to preview successfully", async () => {
			// Mock file system
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
			vi.mocked(readdir).mockResolvedValue([{ name: "package.json", isDirectory: () => false } as any]);
			vi.mocked(readFile).mockResolvedValue(Buffer.from('{"name": "test"}'));

			// Mock Vercel API
			globalThis.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: "my-project-abc123.vercel.app", id: "dpl_preview_123" }),
			} as Response);

			const result = await deployToVercel("/tmp/docs", "my-project", "vercel-token", "preview");

			expect(result.status).toBe("building");
			expect(result.previewUrl).toBe("https://my-project-abc123.vercel.app");
			expect(result.productionDomain).toBeUndefined();
		});

		it("should deploy nextra project with nextjs framework settings", async () => {
			// Mock file system
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
			vi.mocked(readdir).mockResolvedValue([{ name: "package.json", isDirectory: () => false } as any]);
			vi.mocked(readFile).mockResolvedValue(Buffer.from('{"name": "test"}'));

			// Mock Vercel API
			globalThis.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ url: "nextra-site-abc123.vercel.app", id: "dpl_nextra_123" }),
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ targets: { production: { alias: ["nextra-site.vercel.app"] } } }),
				} as Response);

			const result = await deployToVercel("/tmp/docs", "nextra-site", "vercel-token", "production", "nextra");

			expect(result.status).toBe("building");
			expect(result.productionDomain).toBe("https://nextra-site.vercel.app");

			// Verify the deployment API was called with nextjs framework
			expect(globalThis.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v13/deployments",
				expect.objectContaining({
					body: expect.stringContaining('"framework":"nextjs"'),
				}),
			);
			// Verify outputDirectory is .next for Next.js
			expect(globalThis.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v13/deployments",
				expect.objectContaining({
					body: expect.stringContaining('"outputDirectory":".next"'),
				}),
			);
		});

		it("should handle deployment API errors", async () => {
			// Mock file system
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
			vi.mocked(readdir).mockResolvedValue([{ name: "package.json", isDirectory: () => false } as any]);
			vi.mocked(readFile).mockResolvedValue(Buffer.from('{"name": "test"}'));

			// Mock Vercel API error
			globalThis.fetch = vi.fn().mockResolvedValueOnce({
				ok: false,
				statusText: "Unauthorized",
				json: async () => ({ error: { message: "Invalid token" } }),
			} as Response);

			const result = await deployToVercel("/tmp/docs", "my-project", "invalid-token");

			expect(result.status).toBe("error");
			expect(result.error).toContain("Invalid token");
		});

		it("should base64 encode binary files (images) for Vercel deployment", async () => {
			// Create test data - binary image data that would be corrupted if treated as UTF-8
			const binaryImageData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header bytes
			const textFileData = Buffer.from('{"name": "test"}');
			const expectedBase64 = binaryImageData.toString("base64");

			// Mock file system - flat directory with both text and image files
			vi.mocked(readdir).mockResolvedValue([
				// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
				{ name: "package.json", isDirectory: () => false } as any,
				// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for Dirent type
				{ name: "logo.png", isDirectory: () => false } as any,
			]);

			// Return different content based on path
			vi.mocked(readFile).mockImplementation(path => {
				if (String(path).includes("logo.png")) {
					return Promise.resolve(binaryImageData);
				}
				return Promise.resolve(textFileData);
			});

			// Mock Vercel API - need two responses: deployment API + getProductionDomain
			globalThis.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ url: "test.vercel.app", id: "dpl_123" }),
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ targets: { production: { alias: ["test.vercel.app"] } } }),
				} as Response);

			await deployToVercel("/tmp/docs", "my-project", "vercel-token");

			// Verify fetch was called
			expect(globalThis.fetch).toHaveBeenCalled();

			// Get the request body that was sent (first call is the deployment)
			const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
			const options = callArgs[1] as { body: string };
			const body = JSON.parse(options.body);

			// Find the image file in the request
			const imageFile = body.files.find((f: { file: string }) => f.file.endsWith(".png"));
			const textFile = body.files.find((f: { file: string }) => f.file.endsWith(".json"));

			// Binary files should have encoding: "base64" and base64-encoded data
			expect(imageFile).toBeDefined();
			expect(imageFile.encoding).toBe("base64");
			expect(imageFile.data).toBe(expectedBase64);

			// Text files should NOT have encoding property and should be UTF-8 strings
			expect(textFile).toBeDefined();
			expect(textFile.encoding).toBeUndefined();
			expect(textFile.data).toBe('{"name": "test"}');
		});
	});

	describe("cleanupTempDirectory", () => {
		it("should cleanup directory successfully", async () => {
			(rm as Mock).mockResolvedValue(undefined);

			await cleanupTempDirectory("/tmp/test");

			expect(rm).toHaveBeenCalledWith("/tmp/test", { recursive: true, force: true });
		});

		it("should handle cleanup failure gracefully", async () => {
			(rm as Mock).mockRejectedValue(new Error("Permission denied"));

			// Should not throw
			await expect(cleanupTempDirectory("/tmp/test")).resolves.toBeUndefined();

			expect(rm).toHaveBeenCalledWith("/tmp/test", { recursive: true, force: true });
		});

		it("should handle non-existent directory", async () => {
			(rm as Mock).mockRejectedValue(new Error("ENOENT: no such file or directory"));

			// Should not throw
			await expect(cleanupTempDirectory("/tmp/nonexistent")).resolves.toBeUndefined();
		});
	});

	describe("getToolsPath", () => {
		it("should return absolute path as is", async () => {
			const { getConfig } = await import("../config/Config");
			(getConfig as Mock).mockReturnValueOnce({
				TOOLS_PATH: "/absolute/path/to/tools",
			});

			const result = getToolsPath();

			expect(result).toBe("/absolute/path/to/tools");
		});

		it("should join relative path with cwd", async () => {
			const { getConfig } = await import("../config/Config");
			(getConfig as Mock).mockReturnValueOnce({
				TOOLS_PATH: "../tools",
			});

			const result = getToolsPath();

			expect(result).toContain("tools");
			expect(result).not.toBe("../tools");
		});
	});

	describe("deleteVercelProject", () => {
		it("should delete Vercel project successfully", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request to get project
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock DELETE request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			await deleteVercelProject("my-project", "vercel-token");

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(1, "https://api.vercel.com/v9/projects/my-project", {
				method: "GET",
				headers: {
					Authorization: "Bearer vercel-token",
				},
			});
			expect(mockFetch).toHaveBeenNthCalledWith(2, "https://api.vercel.com/v9/projects/my-project", {
				method: "DELETE",
				headers: {
					Authorization: "Bearer vercel-token",
				},
			});
		});

		it("should handle project not found on GET (404)", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Project not found" }),
			});

			// Should not throw - project already deleted
			await expect(deleteVercelProject("my-project", "vercel-token")).resolves.toBeUndefined();

			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it("should handle project not found on DELETE (404)", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock DELETE request returning 404
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Project not found" }),
			});

			// Should not throw - project was deleted between GET and DELETE
			await expect(deleteVercelProject("my-project", "vercel-token")).resolves.toBeUndefined();

			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("should throw error on GET failure", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({ error: "Insufficient permissions" }),
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Insufficient permissions",
			);
		});

		it("should throw error on DELETE failure", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock DELETE request failure
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Server error" }),
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to delete Vercel project: Server error",
			);
		});

		it("should handle JSON parse error on GET", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});

		it("should handle JSON parse error on DELETE", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock DELETE request with JSON parse error
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to delete Vercel project: Internal Server Error",
			);
		});

		it("should use statusText fallback when error data has no error property on GET", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}), // Empty object, no error property
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});

		it("should use statusText fallback when error data has no error property on DELETE", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock DELETE request with no error property
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}), // Empty object, no error property
			});

			await expect(deleteVercelProject("my-project", "vercel-token")).rejects.toThrow(
				"Failed to delete Vercel project: Internal Server Error",
			);
		});
	});

	describe("getVercelProjectProtectionStatus", () => {
		it("should return password protection status", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					id: "prj_123",
					name: "my-project",
					passwordProtection: { password: "secret" },
				}),
			});

			const result = await getVercelProjectProtectionStatus("my-project", "vercel-token");

			expect(result).toEqual({
				isProtected: true,
				protectionType: "password",
			});
		});

		it("should return SSO protection status", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					id: "prj_123",
					name: "my-project",
					ssoProtection: { deploymentType: "all" },
				}),
			});

			const result = await getVercelProjectProtectionStatus("my-project", "vercel-token");

			expect(result).toEqual({
				isProtected: true,
				protectionType: "sso",
			});
		});

		it("should return Vercel auth protection status", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					id: "prj_123",
					name: "my-project",
					protectionBypass: {},
				}),
			});

			const result = await getVercelProjectProtectionStatus("my-project", "vercel-token");

			expect(result).toEqual({
				isProtected: true,
				protectionType: "vercel-auth",
			});
		});

		it("should return no protection status", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					id: "prj_123",
					name: "my-project",
				}),
			});

			const result = await getVercelProjectProtectionStatus("my-project", "vercel-token");

			expect(result).toEqual({
				isProtected: false,
				protectionType: "none",
			});
		});

		it("should throw error on API failure", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Project not found" }),
			});

			await expect(getVercelProjectProtectionStatus("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Project not found",
			);
		});

		it("should handle JSON parse error", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			await expect(getVercelProjectProtectionStatus("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});

		it("should use statusText fallback when error data has no error property", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}), // Empty object, no error property
			});

			await expect(getVercelProjectProtectionStatus("my-project", "vercel-token")).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});
	});

	describe("setVercelProjectProtection", () => {
		it("should enable protection successfully", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", ssoProtection: { deploymentType: "all" } }),
			});

			await setVercelProjectProtection("my-project", "vercel-token", true);

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(2, "https://api.vercel.com/v10/projects/prj_123", {
				method: "PATCH",
				headers: {
					Authorization: "Bearer vercel-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					ssoProtection: {
						deploymentType: "all",
					},
				}),
			});
		});

		it("should disable protection successfully", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", ssoProtection: null, passwordProtection: null }),
			});

			await setVercelProjectProtection("my-project", "vercel-token", false);

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(2, "https://api.vercel.com/v10/projects/prj_123", {
				method: "PATCH",
				headers: {
					Authorization: "Bearer vercel-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					ssoProtection: null,
					passwordProtection: null,
				}),
			});
		});

		it("should throw error on GET failure", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Project not found" }),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to get Vercel project: Project not found",
			);
		});

		it("should throw error on PATCH failure", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request failure
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({ error: "Insufficient permissions" }),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to update Vercel project protection: Insufficient permissions (status: 403)",
			);
		});

		it("should handle JSON parse error on GET", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});

		it("should handle JSON parse error on PATCH", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request with JSON parse error
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to update Vercel project protection: Internal Server Error (status: 500)",
			);
		});

		it("should use statusText fallback when error data has no error property on GET", async () => {
			const mockFetch = global.fetch as Mock;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}), // Empty object, no error property
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to get Vercel project: Internal Server Error",
			);
		});

		it("should use statusText fallback when error data has no error property on PATCH", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request with no error property
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}), // Empty object, no error property
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to update Vercel project protection: Internal Server Error (status: 500)",
			);
		});

		it("should handle error object with message property", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request with error object containing message
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({ error: { message: "Invalid ssoProtection configuration" } }),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to update Vercel project protection: Invalid ssoProtection configuration (status: 400)",
			);
		});

		it("should stringify error object without message property", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Mock PATCH request with complex error object
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 422,
				statusText: "Unprocessable Entity",
				json: async () => ({ error: { code: "invalid_config", details: "Missing required field" } }),
			});

			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				'Failed to update Vercel project protection: {\n  "code": "invalid_config",\n  "details": "Missing required field"\n} (status: 422)',
			);
		});

		it("should handle error object with circular references", async () => {
			const mockFetch = global.fetch as Mock;

			// Mock GET request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			// Create a circular reference object
			const circularError: { self?: unknown; code: string } = { code: "circular_ref" };
			circularError.self = circularError;

			// Mock PATCH request with circular reference in error
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: circularError }),
			});

			// The catch block should handle the circular reference and use String()
			await expect(setVercelProjectProtection("my-project", "vercel-token", true)).rejects.toThrow(
				"Failed to update Vercel project protection:",
			);
		});
	});
});
