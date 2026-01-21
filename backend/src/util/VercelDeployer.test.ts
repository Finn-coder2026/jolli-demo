import { createBuildEventHandlers, VercelDeployer } from "./VercelDeployer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creates a mock ReadableStream body from an array of event strings.
 */
function createMockStreamBody(events: Array<string>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;

	return new ReadableStream({
		pull(controller) {
			if (index < events.length) {
				const event = events[index];
				controller.enqueue(encoder.encode(`${event}\n`));
				index++;
			} else {
				controller.close();
			}
		},
	});
}

/**
 * Creates a mock fetch response with a streaming body.
 */
function createMockStreamResponse(events: Array<string>): {
	ok: boolean;
	body: ReadableStream<Uint8Array>;
} {
	return {
		ok: true,
		body: createMockStreamBody(events),
	};
}

describe("VercelDeployer", () => {
	describe("constructor", () => {
		it("should throw if token is not provided", () => {
			expect(() => new VercelDeployer("")).toThrow("Vercel token is required");
		});

		it("should create instance with valid token", () => {
			const deployer = new VercelDeployer("valid_token");
			expect(deployer).toBeInstanceOf(VercelDeployer);
		});
	});

	describe("getDeploymentStatus", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should fetch deployment status from v13 API", async () => {
			const mockStatus = { id: "dep_123", readyState: "BUILDING" };

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockStatus,
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.getDeploymentStatus("dep_123");

			expect(status).toEqual(mockStatus);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v13/deployments/dep_123",
				expect.objectContaining({
					headers: { Authorization: "Bearer token" },
				}),
			);
		});

		it("should throw on API error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.getDeploymentStatus("dep_123")).rejects.toThrow(
				"Failed to get deployment status: 404 Not Found",
			);
		});
	});

	describe("checkDeploymentStatus", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return 'ready' when readyState is READY", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "READY" }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.checkDeploymentStatus("dep_123");
			expect(status).toBe("ready");
		});

		it("should return 'error' when readyState is ERROR", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "ERROR" }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.checkDeploymentStatus("dep_123");
			expect(status).toBe("error");
		});

		it("should return 'error' when readyState is CANCELED", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "CANCELED" }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.checkDeploymentStatus("dep_123");
			expect(status).toBe("error");
		});

		it("should return 'building' when readyState is BUILDING", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "BUILDING" }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.checkDeploymentStatus("dep_123");
			expect(status).toBe("building");
		});

		it("should return 'building' on error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

			const deployer = new VercelDeployer("token");
			const status = await deployer.checkDeploymentStatus("dep_123");
			expect(status).toBe("building");
		});
	});

	describe("waitForDeployment", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it("should return ready immediately if initial status is READY", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "READY" }),
			});

			const deployer = new VercelDeployer("token");
			const result = await deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			expect(result.status).toBe("ready");
		});

		it("should return error immediately if initial status is ERROR", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events")) {
					return Promise.resolve({
						ok: true,
						text: async () => "",
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR", errorMessage: "Build command failed" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toBe("Build command failed");
		});

		it("should call onStateChange handler for initial status", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "READY" }),
			});

			const onStateChange = vi.fn();
			const deployer = new VercelDeployer("token");
			await deployer.waitForDeployment("dep_123", { onStateChange }, { pollIntervalMs: 100 });

			expect(onStateChange).toHaveBeenCalledWith("READY");
		});

		it("should stream events and call handlers", async () => {
			let callCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				callCount++;
				if (url.includes("/events")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"command","created":1000,"payload":{"text":"npm install"}}',
							'{"type":"stdout","created":2000,"payload":{"text":"Building..."}}',
							'{"type":"stderr","created":3000,"payload":{"text":"Warning: something"}}',
							'{"type":"deployment-state","created":4000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const handlers = {
				onCommand: vi.fn(),
				onStdout: vi.fn(),
				onStderr: vi.fn(),
				onStateChange: vi.fn(),
			};

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", handlers, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
			expect(handlers.onCommand).toHaveBeenCalledWith("npm install");
			expect(handlers.onStdout).toHaveBeenCalledWith("Building...");
			expect(handlers.onStderr).toHaveBeenCalledWith("Warning: something");
			expect(handlers.onStateChange).toHaveBeenCalled();
		});

		it("should call onError and onStderr for fatal events", async () => {
			let callCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				callCount++;
				if (url.includes("/events")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"stdout","created":1000,"payload":{"text":"Starting..."}}',
							'{"type":"fatal","created":2000,"payload":{"text":"Fatal error: Module not found"}}',
						]),
					);
				}
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const handlers = {
				onStdout: vi.fn(),
				onStderr: vi.fn(),
				onError: vi.fn(),
			};

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", handlers, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;
			expect(result.status).toBe("error");
			// Fatal events should trigger both onError and onStderr
			expect(handlers.onError).toHaveBeenCalledWith("Fatal error: Module not found");
			expect(handlers.onStderr).toHaveBeenCalledWith("Fatal error: Module not found");
			expect(result.buildLogs).toContain("Fatal error: Module not found");
		});

		it("should capture fatal event text at top level", async () => {
			let callCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				callCount++;
				if (url.includes("/events")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"fatal","created":1000,"text":"Build command failed with exit code 1","payload":{}}',
						]),
					);
				}
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const onError = vi.fn();
			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", { onError }, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;
			expect(result.status).toBe("error");
			expect(onError).toHaveBeenCalledWith("Build command failed with exit code 1");
			expect(result.buildLogs).toContain("Build command failed with exit code 1");
		});

		it("should timeout after specified duration", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events")) {
					return new Promise(() => {
						// Never resolves
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, {
				pollIntervalMs: 100,
				timeoutMs: 500,
			});

			for (let i = 0; i < 10; i++) {
				await vi.advanceTimersByTimeAsync(100);
			}

			const result = await resultPromise;
			expect(result.status).toBe("timeout");
			expect(result.error).toContain("timed out");
		});

		it("should collect build logs from stream", async () => {
			let callCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				callCount++;
				if (url.includes("/events")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"stdout","created":1000,"payload":{"text":"Building..."}}',
							'{"type":"stderr","created":2000,"payload":{"text":"Warning: something"}}',
							'{"type":"deployment-state","created":3000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
			expect(result.buildLogs).toContain("Building...");
			expect(result.buildLogs).toContain("Warning: something");
		});

		it("should broadcast build logs when poll wins and status is ERROR", async () => {
			// This test simulates the scenario where poll detects ERROR before stream finishes
			// In this case, we fetch all events and broadcast them to handlers
			let statusCallCount = 0;

			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				// Streaming endpoint - stream returns events but no terminal state
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"stdout","created":1000,"payload":{"text":"Starting..."}}',
							// No terminal state event - stream just ends
						]),
					);
				}
				// Non-streaming events fetch (for fetchBuildLogsOnError)
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () =>
							'{"type":"stdout","created":1000,"payload":{"text":"Installing dependencies..."}}\n' +
							'{"type":"stderr","created":2000,"payload":{"text":"Error: Module not found"}}\n' +
							'{"type":"stderr","created":3000,"payload":{"text":"Build failed with exit code 1"}}',
					});
				}
				// Status polling
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR", errorMessage: "Build failed" }),
				});
			});

			const handlers = {
				onStdout: vi.fn(),
				onStderr: vi.fn(),
				onStateChange: vi.fn(),
			};

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", handlers, { pollIntervalMs: 100 });

			// Wait for initial setup and stream to complete
			await vi.advanceTimersByTimeAsync(0);
			// Advance time for polls to detect ERROR (after pollInterval)
			await vi.advanceTimersByTimeAsync(150);
			await vi.advanceTimersByTimeAsync(150);
			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			// Poll should have won and fetched + broadcast the logs
			expect(result.status).toBe("error");
			// Build logs should be broadcast to onStderr handler
			expect(handlers.onStderr).toHaveBeenCalledWith("Error: Module not found");
			expect(handlers.onStderr).toHaveBeenCalledWith("Build failed with exit code 1");
		});

		it("should broadcast build logs when initial status is ERROR", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				// Non-streaming events fetch (for fetchBuildLogsOnError on immediate ERROR)
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () =>
							'{"type":"stderr","created":1000,"payload":{"text":"Syntax error in file.tsx"}}\n' +
							'{"type":"fatal","created":2000,"payload":{"text":"Build command failed"}}',
					});
				}
				// Initial status check returns ERROR immediately
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR", errorMessage: "Build failed" }),
				});
			});

			const handlers = {
				onStderr: vi.fn(),
				onStateChange: vi.fn(),
			};

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", handlers, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			// Even for immediate ERROR, logs should be fetched and broadcast
			expect(handlers.onStderr).toHaveBeenCalledWith("Syntax error in file.tsx");
			expect(handlers.onStderr).toHaveBeenCalledWith("Build command failed");
		});
	});

	describe("deleteProject", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should delete a Vercel project", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: true,
				});

			const deployer = new VercelDeployer("token");
			await deployer.deleteProject("my-project");

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v9/projects/my-project",
				expect.objectContaining({ method: "GET" }),
			);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v9/projects/my-project",
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("should handle project not found (404)", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
			});

			const deployer = new VercelDeployer("token");
			// Should not throw
			await deployer.deleteProject("non-existent-project");
		});

		it("should handle project deleted between GET and DELETE", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				});

			const deployer = new VercelDeployer("token");
			// Should not throw
			await deployer.deleteProject("my-project");
		});

		it("should throw on API error when getting project", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Server error" }),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Failed to get Vercel project");
		});

		it("should throw on API error when deleting project", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
					json: async () => ({ error: "Server error" }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Failed to delete Vercel project");
		});
	});

	describe("ensureProjectExists", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return false when project already exists", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ id: "prj_123", name: "my-project" }),
			});

			const deployer = new VercelDeployer("token");
			const result = await deployer.ensureProjectExists("my-project");

			expect(result).toBe(false);
			expect(global.fetch).toHaveBeenCalledTimes(1);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.vercel.com/v9/projects/my-project",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should create project and return true when project does not exist", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123", name: "my-project" }),
				});

			const deployer = new VercelDeployer("token");
			const result = await deployer.ensureProjectExists("my-project");

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenNthCalledWith(
				1,
				"https://api.vercel.com/v9/projects/my-project",
				expect.objectContaining({ method: "GET" }),
			);
			expect(global.fetch).toHaveBeenNthCalledWith(
				2,
				"https://api.vercel.com/v9/projects",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ name: "my-project" }),
				}),
			);
		});

		it("should throw on API error when checking if project exists (non-404)", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Server error" }),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.ensureProjectExists("my-project")).rejects.toThrow("Failed to check Vercel project");
		});

		it("should throw on API error when creating project", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 400,
					statusText: "Bad Request",
					json: async () => ({ error: { message: "Invalid project name" } }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.ensureProjectExists("my-project")).rejects.toThrow(
				"Failed to create Vercel project: Invalid project name",
			);
		});

		it("should use statusText when json parse fails on check", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("JSON parse error")),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.ensureProjectExists("my-project")).rejects.toThrow(
				"Failed to check Vercel project: Internal Server Error",
			);
		});

		it("should use statusText when json parse fails on create", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 400,
					statusText: "Bad Request",
					json: () => Promise.reject(new Error("JSON parse error")),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.ensureProjectExists("my-project")).rejects.toThrow(
				"Failed to create Vercel project: Bad Request",
			);
		});
	});

	describe("getProjectProtection", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should return password protection status", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ passwordProtection: { deploymentType: "all" } }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.getProjectProtection("my-project");

			expect(status.isProtected).toBe(true);
			expect(status.protectionType).toBe("password");
		});

		it("should return SSO protection status", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ ssoProtection: { deploymentType: "all" } }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.getProjectProtection("my-project");

			expect(status.isProtected).toBe(true);
			expect(status.protectionType).toBe("sso");
		});

		it("should return vercel-auth protection status", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ protectionBypass: {} }),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.getProjectProtection("my-project");

			expect(status.isProtected).toBe(true);
			expect(status.protectionType).toBe("vercel-auth");
		});

		it("should return no protection status", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});

			const deployer = new VercelDeployer("token");
			const status = await deployer.getProjectProtection("my-project");

			expect(status.isProtected).toBe(false);
			expect(status.protectionType).toBe("none");
		});

		it("should throw on API error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Not found" }),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.getProjectProtection("my-project")).rejects.toThrow("Failed to get Vercel project");
		});
	});

	describe("setProjectProtection", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should enable SSO protection", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: true,
				});

			const deployer = new VercelDeployer("token");
			await deployer.setProjectProtection("my-project", true);

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenLastCalledWith(
				"https://api.vercel.com/v10/projects/prj_123",
				expect.objectContaining({
					method: "PATCH",
					body: JSON.stringify({ ssoProtection: { deploymentType: "all" } }),
				}),
			);
		});

		it("should disable protection", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: true,
				});

			const deployer = new VercelDeployer("token");
			await deployer.setProjectProtection("my-project", false);

			expect(global.fetch).toHaveBeenLastCalledWith(
				"https://api.vercel.com/v10/projects/prj_123",
				expect.objectContaining({
					method: "PATCH",
					body: JSON.stringify({ ssoProtection: null, passwordProtection: null }),
				}),
			);
		});

		it("should throw on API error when getting project", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({ error: "Not found" }),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow(
				"Failed to get Vercel project",
			);
		});

		it("should throw on API error when updating protection", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
					statusText: "Forbidden",
					json: async () => ({ error: "SSO not available on your plan" }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow(
				"Failed to update Vercel project protection",
			);
		});

		it("should extract error message from error object", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
					statusText: "Forbidden",
					json: async () => ({ error: { message: "SSO not available" } }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow("SSO not available");
		});

		it("should JSON.stringify error object without message property", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
					statusText: "Forbidden",
					json: async () => ({ error: { code: "FORBIDDEN", reason: "access_denied" } }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow("code");
		});

		it("should return default text when error is not present", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Server Error",
					json: async () => ({ someOtherField: "value" }),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow("Server Error");
		});
	});

	// Note: The deploy() method requires file system access which is difficult to mock.
	// The method is tested integration-style via SiteRouter.test.ts.
	// Here we test related private helper methods indirectly via error scenarios.

	describe("waitForDeployment - additional coverage", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it("should return canceled immediately if initial status is CANCELED", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => ({ readyState: "CANCELED" }),
			});

			const deployer = new VercelDeployer("token");
			const result = await deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			expect(result.status).toBe("canceled");
			expect(result.error).toBe("Deployment was canceled");
		});

		it("should handle error getting initial status gracefully", async () => {
			let callCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				callCount++;
				// First call for initial status fails
				if (callCount === 1) {
					return Promise.reject(new Error("Network error"));
				}
				// Streaming
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"deployment-state","created":1000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			// Should continue even after initial status error
			expect(result.status).toBe("ready");
		});

		it("should handle deployment-state event with CANCELED state", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"deployment-state","created":1000,"payload":{"info":{"readyState":"CANCELED"}}}',
						]),
					);
				}
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("canceled");
		});

		it("should handle exit event in stream", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"exit","created":1000,"payload":{"code":0}}',
							'{"type":"deployment-state","created":2000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should parse error message with errorStep", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () => '{"type":"stderr","created":1000,"payload":{"text":"Error in build"}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({
						readyState: "ERROR",
						errorMessage: "Build command failed",
						errorStep: "buildStep",
					}),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toContain("[buildStep]");
			expect(result.error).toContain("Build command failed");
		});

		it("should handle JSON parse errors in stream", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							"invalid json line",
							'{"type":"deployment-state","created":1000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should handle stream fetch error", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve({ ok: false, statusText: "Bad Request" });
				}
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				if (statusCallCount < 3) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "READY" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance time for polls
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should handle stream with no body", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve({ ok: true, body: null });
				}
				statusCallCount++;
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				if (statusCallCount < 3) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "READY" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance time for polls
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should handle buildLogs fetch failure on error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: false,
						statusText: "Internal Server Error",
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({
						readyState: "ERROR",
						errorMessage: "Build failed",
					}),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toBe("Build failed");
		});

		it("should parse mdx errors in build logs", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					// Use "Error" without colon to test the MDX-specific error detection path
					// The error block check looks for "Error:" but MDX check looks for "Error"
					return Promise.resolve({
						ok: true,
						text: async () =>
							'{"type":"stderr","created":1000,"payload":{"text":"Compilation Error in file.mdx at line 42"}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({
						readyState: "ERROR",
					}),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toContain("mdx");
		});

		it("should parse error block in build logs", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () =>
							'{"type":"stderr","created":1000,"payload":{"text":"Error: Module not found"}}\n' +
							'{"type":"stderr","created":2000,"payload":{"text":"  at line 42"}}\n' +
							'{"type":"stdout","created":3000,"payload":{"text":"info: continuing"}}\n' +
							'{"type":"stderr","created":4000,"payload":{"text":"fatal: cannot continue"}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toContain("Error: Module not found");
		});

		it("should return default message when no errors in logs", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () => '{"type":"stdout","created":1000,"payload":{"text":"Building..."}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			expect(result.error).toContain("Build failed");
		});

		it("should handle getDeploymentErrorMessage exception", async () => {
			let fetchCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				fetchCount++;
				// First call returns ERROR status
				if (fetchCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "ERROR" }),
					});
				}
				// Build logs fetch - include an Error: line so parseVercelBuildErrors picks it up
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () =>
							'{"type":"stderr","created":1000,"payload":{"text":"Error: Build compilation failed"}}',
					});
				}
				// Second deployment status fetch for error message throws
				return Promise.reject(new Error("Network error"));
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			// Should fall back to parsing build logs (now contains Error: which triggers the parser)
			expect(result.error).toContain("Error:");
		});

		it("should handle string error in API response", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						text: async () => "",
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Advance timers to allow the 2-second delay in fetchBuildLogsOnError to complete
			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;

			expect(result.status).toBe("error");
			// No error details available
			expect(result.error).toContain("Build failed");
		});

		it("should handle production domain fetch with 404", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/v9/projects/")) {
					return Promise.resolve({
						ok: false,
						status: 404,
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "READY" }),
				});
			});

			// This tests the getProductionDomain method handling 404
			const deployer = new VercelDeployer("token");
			const result = await deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			expect(result.status).toBe("ready");
		});

		it("should handle production domain fetch with project without alias", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/v9/projects/")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							// Project data without targets.production.alias
							name: "my-project",
						}),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "READY" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const result = await deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			expect(result.status).toBe("ready");
		});
	});

	describe("createBuildEventHandlers", () => {
		it("should create handlers that broadcast events", () => {
			const broadcast = vi.fn();
			const handlers = createBuildEventHandlers(broadcast, 123, 4);

			handlers.onStdout?.("stdout text");
			expect(broadcast).toHaveBeenCalledWith(123, { type: "build:stdout", step: 4, output: "stdout text" });

			handlers.onStderr?.("stderr text");
			expect(broadcast).toHaveBeenCalledWith(123, { type: "build:stderr", step: 4, output: "stderr text" });

			handlers.onError?.("error text");
			expect(broadcast).toHaveBeenCalledWith(123, { type: "build:stderr", step: 4, output: "error text" });

			handlers.onCommand?.("npm install");
			expect(broadcast).toHaveBeenCalledWith(123, { type: "build:command", step: 4, command: "npm install" });

			handlers.onStateChange?.("BUILDING");
			expect(broadcast).toHaveBeenCalledWith(123, { type: "build:state", step: 4, state: "BUILDING" });
		});
	});

	describe("deleteProject - fallback error handling", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should use statusText when json parse fails on GET", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Internal Server Error");
		});

		it("should use statusText when json has no error property on GET", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.resolve({ message: "something else" }), // No 'error' property
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Internal Server Error");
		});

		it("should use statusText when json parse fails on DELETE", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
					json: () => Promise.reject(new Error("Invalid JSON")),
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Internal Server Error");
		});

		it("should use statusText when json has no error property on DELETE", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ id: "prj_123" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
					json: () => Promise.resolve({ message: "something else" }), // No 'error' property
				});

			const deployer = new VercelDeployer("token");
			await expect(deployer.deleteProject("my-project")).rejects.toThrow("Internal Server Error");
		});
	});

	describe("getProjectProtection - fallback error handling", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should use statusText when json parse fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.getProjectProtection("my-project")).rejects.toThrow("Internal Server Error");
		});

		it("should use statusText when json has no error property", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.resolve({ message: "something else" }), // No 'error' property
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.getProjectProtection("my-project")).rejects.toThrow("Internal Server Error");
		});
	});

	describe("setProjectProtection - fallback error handling", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should use statusText when json parse fails on GET", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow("Internal Server Error");
		});

		it("should use statusText when json has no error property on GET", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.resolve({ message: "something else" }), // No 'error' property
			});

			const deployer = new VercelDeployer("token");
			await expect(deployer.setProjectProtection("my-project", true)).rejects.toThrow("Internal Server Error");
		});
	});

	describe("waitForDeployment - branch coverage", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it("should use default poll interval when options not provided", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"deployment-state","created":1000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			// Call without options to test default pollInterval
			const resultPromise = deployer.waitForDeployment("dep_123");

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should fallback to QUEUED when status response has no readyState or status", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					return Promise.resolve(
						createMockStreamResponse([
							'{"type":"deployment-state","created":1000,"payload":{"info":{"readyState":"READY"}}}',
						]),
					);
				}
				statusCallCount++;
				// First call returns no readyState or status
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ id: "dep_123" }), // No readyState or status
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const handlers = { onStateChange: vi.fn() };
			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", handlers, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			expect(result.status).toBe("ready");
			// Should have called onStateChange with "QUEUED" fallback
			expect(handlers.onStateChange).toHaveBeenCalledWith("QUEUED");
		});

		it("should fallback to UNKNOWN status in poll when response has no readyState or status", async () => {
			let statusCallCount = 0;
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					// Stream returns events but never terminal state
					return Promise.resolve(
						createMockStreamResponse(['{"type":"stdout","created":1000,"payload":{"text":"Starting..."}}']),
					);
				}
				statusCallCount++;
				// First call returns BUILDING, subsequent return no status, then READY
				if (statusCallCount === 1) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ readyState: "BUILDING" }),
					});
				}
				if (statusCallCount === 2) {
					// Return response with no readyState or status to trigger UNKNOWN branch
					return Promise.resolve({
						ok: true,
						json: async () => ({ id: "dep_123" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "READY" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			// Initial setup
			await vi.advanceTimersByTimeAsync(0);
			// Advance time for polls
			await vi.advanceTimersByTimeAsync(150); // First poll - BUILDING
			await vi.advanceTimersByTimeAsync(150); // Second poll - UNKNOWN
			await vi.advanceTimersByTimeAsync(150); // Third poll - READY

			const result = await resultPromise;
			expect(result.status).toBe("ready");
		});

		it("should handle event with no text in fetchBuildLogsOnError", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						// Event with no text property at all
						text: async () =>
							'{"type":"stdout","created":1000,"payload":{}}\n' +
							'{"type":"stderr","created":2000,"payload":{"text":"Error: Build failed"}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;
			expect(result.status).toBe("error");
			expect(result.error).toContain("Error: Build failed");
		});

		it("should detect mdx error with 'failed' keyword", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?builds=1")) {
					return Promise.resolve({
						ok: true,
						// MDX error with "failed" but not "Error"
						text: async () =>
							'{"type":"stderr","created":1000,"payload":{"text":"Build failed for content.mdx"}}',
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "ERROR" }),
				});
			});

			const deployer = new VercelDeployer("token");
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, { pollIntervalMs: 100 });

			await vi.advanceTimersByTimeAsync(3000);

			const result = await resultPromise;
			expect(result.status).toBe("error");
			expect(result.error).toContain("content.mdx");
		});

		it("should return timeout status from createDeployResult", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
				if (url.includes("/events?follow=1")) {
					// Stream returns events but no terminal state
					return Promise.resolve(
						createMockStreamResponse(['{"type":"stdout","created":1000,"payload":{"text":"Starting..."}}']),
					);
				}
				// Always return BUILDING to trigger timeout
				return Promise.resolve({
					ok: true,
					json: async () => ({ readyState: "BUILDING" }),
				});
			});

			const deployer = new VercelDeployer("token");
			// Very short timeout to trigger timeout status
			const resultPromise = deployer.waitForDeployment("dep_123", undefined, {
				pollIntervalMs: 50,
				timeoutMs: 100,
			});

			// Initial setup
			await vi.advanceTimersByTimeAsync(0);
			// Advance time past the timeout (multiple poll intervals)
			await vi.advanceTimersByTimeAsync(200);
			await vi.advanceTimersByTimeAsync(200);

			const result = await resultPromise;
			expect(result.status).toBe("timeout");
			expect(result.error).toBe("Deployment timed out");
		});
	});

	describe("Domain Management", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		describe("addDomainToProject", () => {
			it("should add domain and return verified status", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ verified: true }),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.addDomainToProject("my-project", "docs.acme.com");

				expect(result.verified).toBe(true);
				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v10/projects/my-project/domains"),
					expect.objectContaining({
						method: "POST",
						body: JSON.stringify({ name: "docs.acme.com" }),
					}),
				);
			});

			it("should return verification challenges when not verified", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						verified: false,
						verification: [
							{ type: "CNAME", domain: "docs", value: "cname.vercel-dns.com", reason: "Required" },
						],
					}),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.addDomainToProject("my-project", "docs.acme.com");

				expect(result.verified).toBe(false);
				expect(result.verification).toHaveLength(1);
				expect(result.verification?.[0].type).toBe("CNAME");
			});

			it("should handle 409 conflict as error (domain exists on another site)", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 409,
					json: async () => ({ error: { message: "Domain already exists" } }),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.addDomainToProject("my-project", "docs.acme.com");

				expect(result.verified).toBe(false);
				expect(result.error).toBe("Domain already exists on another site");
			});

			it("should handle 403 (domain owned by another account)", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 403,
					json: async () => ({ error: { message: "Domain owned by another account" } }),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.addDomainToProject("my-project", "docs.acme.com");

				expect(result.verified).toBe(false);
				expect(result.error).toContain("another Vercel account");
			});

			it("should retry on 429 rate limit", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: false,
						status: 429,
						json: async () => ({ error: { message: "Rate limited" } }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ verified: true }),
					});

				const deployer = new VercelDeployer("token");
				const resultPromise = deployer.addDomainToProject("my-project", "docs.acme.com");

				// Advance past the retry delay (2s for first retry)
				await vi.advanceTimersByTimeAsync(2500);

				const result = await resultPromise;
				expect(result.verified).toBe(true);
				expect(fetch).toHaveBeenCalledTimes(2);
			});

			it("should retry on 5xx server errors", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: false,
						status: 500,
						json: async () => ({ error: { message: "Server error" } }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ verified: true }),
					});

				const deployer = new VercelDeployer("token");
				const resultPromise = deployer.addDomainToProject("my-project", "docs.acme.com");

				// Advance past the retry delay
				await vi.advanceTimersByTimeAsync(2500);

				const result = await resultPromise;
				expect(result.verified).toBe(true);
				expect(fetch).toHaveBeenCalledTimes(2);
			});

			it("should throw after max retries exceeded", async () => {
				let callCount = 0;
				(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
					callCount++;
					return Promise.resolve({
						ok: false,
						status: 500,
						json: () => Promise.resolve({ error: { message: "Server error" } }),
					});
				});

				const deployer = new VercelDeployer("token");

				// Start the request - it will fail and start retrying
				const promise = deployer.addDomainToProject("my-project", "docs.acme.com");

				// Catch the rejection immediately to prevent unhandled rejection
				let caughtError: Error | undefined;
				promise.catch(e => {
					caughtError = e;
				});

				// Advance through all retry delays: 2s, 4s, 8s
				await vi.advanceTimersByTimeAsync(2000);
				await vi.advanceTimersByTimeAsync(4000);
				await vi.advanceTimersByTimeAsync(8000);

				// Await the promise to let it settle
				await vi.runAllTimersAsync();

				// Now verify it threw
				expect(caughtError).toBeDefined();
				expect(caughtError?.message).toBe("Server error");
				expect(callCount).toBe(3); // 3 retries max
			});

			it("should throw on non-retryable errors", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({ error: { message: "Bad request" } }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.addDomainToProject("my-project", "docs.acme.com")).rejects.toThrow("Bad request");
				expect(fetch).toHaveBeenCalledTimes(1); // No retries for 400
			});
		});

		describe("removeDomainFromProject", () => {
			it("should remove domain successfully", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.removeDomainFromProject("my-project", "docs.acme.com")).resolves.toBeUndefined();

				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v9/projects/my-project/domains/docs.acme.com"),
					expect.objectContaining({ method: "DELETE" }),
				);
			});

			it("should treat 404 as success (already removed)", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 404,
					json: async () => ({}),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.removeDomainFromProject("my-project", "docs.acme.com")).resolves.toBeUndefined();
			});

			it("should throw on other errors", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({ error: { message: "Bad request" } }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.removeDomainFromProject("my-project", "docs.acme.com")).rejects.toThrow(
					"Bad request",
				);
			});
		});

		describe("getDomainStatus", () => {
			it("should return verified domain status", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ verified: true }),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.getDomainStatus("my-project", "docs.acme.com");

				expect(result.verified).toBe(true);
				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v9/projects/my-project/domains/docs.acme.com"),
					expect.objectContaining({ method: "GET" }),
				);
			});

			it("should return pending status with verification challenges", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						verified: false,
						verification: [
							{ type: "CNAME", domain: "docs", value: "cname.vercel-dns.com", reason: "Required" },
						],
					}),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.getDomainStatus("my-project", "docs.acme.com");

				expect(result.verified).toBe(false);
				expect(result.verification).toHaveLength(1);
			});

			it("should throw on 404 (domain not found)", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 404,
					json: async () => ({}),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.getDomainStatus("my-project", "docs.acme.com")).rejects.toThrow(
					"Domain not found",
				);
			});

			it("should throw on other errors with error message", async () => {
				// Use 400 status - not retryable
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({ error: { message: "Bad request" } }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.getDomainStatus("my-project", "docs.acme.com")).rejects.toThrow("Bad request");
			});

			it("should throw with fallback message when no error message in response", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 403,
					json: async () => ({}),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.getDomainStatus("my-project", "docs.acme.com")).rejects.toThrow(
					"Failed to get domain status: 403",
				);
			});
		});

		describe("verifyDomain", () => {
			it("should trigger verification and return status", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ verified: true }),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.verifyDomain("my-project", "docs.acme.com");

				expect(result.verified).toBe(true);
				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v6/projects/my-project/domains/docs.acme.com/verify"),
					expect.objectContaining({ method: "POST" }),
				);
			});

			it("should return pending status if not yet verified", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						verified: false,
						verification: [
							{ type: "CNAME", domain: "docs", value: "cname.vercel-dns.com", reason: "Required" },
						],
					}),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.verifyDomain("my-project", "docs.acme.com");

				expect(result.verified).toBe(false);
				expect(result.verification).toHaveLength(1);
			});

			it("should throw on error", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({ error: { message: "Verification failed" } }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.verifyDomain("my-project", "docs.acme.com")).rejects.toThrow(
					"Verification failed",
				);
			});
		});
	});

	describe("Environment Variable Management", () => {
		beforeEach(() => {
			global.fetch = vi.fn();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		describe("getEnvVars", () => {
			it("should return list of environment variables", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						envs: [
							{ id: "env_1", key: "API_KEY", value: "secret123" },
							{ id: "env_2", key: "NODE_ENV", value: "production" },
						],
					}),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.getEnvVars("my-project");

				expect(result).toHaveLength(2);
				expect(result[0].key).toBe("API_KEY");
				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v9/projects/my-project/env"),
					expect.objectContaining({ method: "GET" }),
				);
			});

			it("should return empty array when no envs", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				});

				const deployer = new VercelDeployer("token");
				const result = await deployer.getEnvVars("my-project");

				expect(result).toEqual([]);
			});

			it("should throw on error", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({ error: { message: "Bad request" } }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.getEnvVars("my-project")).rejects.toThrow("Bad request");
			});
		});

		describe("setEnvVar", () => {
			it("should create new env var when it does not exist", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					// First call: getEnvVars returns empty
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ envs: [] }),
					})
					// Second call: createEnvVar
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ id: "env_new", key: "NEW_VAR", value: "new_value" }),
					});

				const deployer = new VercelDeployer("token");
				await deployer.setEnvVar("my-project", "NEW_VAR", "new_value");

				expect(fetch).toHaveBeenCalledTimes(2);
				expect(fetch).toHaveBeenLastCalledWith(
					expect.stringContaining("/v10/projects/my-project/env"),
					expect.objectContaining({
						method: "POST",
						body: JSON.stringify({
							key: "NEW_VAR",
							value: "new_value",
							type: "plain",
							target: ["production", "preview", "development"],
						}),
					}),
				);
			});

			it("should update existing env var", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					// First call: getEnvVars returns existing var
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							envs: [{ id: "env_existing", key: "EXISTING_VAR", value: "old_value" }],
						}),
					})
					// Second call: updateEnvVar
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ id: "env_existing", key: "EXISTING_VAR", value: "new_value" }),
					});

				const deployer = new VercelDeployer("token");
				await deployer.setEnvVar("my-project", "EXISTING_VAR", "new_value");

				expect(fetch).toHaveBeenCalledTimes(2);
				expect(fetch).toHaveBeenLastCalledWith(
					expect.stringContaining("/v10/projects/my-project/env/env_existing"),
					expect.objectContaining({
						method: "PATCH",
						body: JSON.stringify({
							key: "EXISTING_VAR",
							value: "new_value",
							type: "plain",
							target: ["production", "preview", "development"],
						}),
					}),
				);
			});

			it("should throw on create error", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ envs: [] }),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 400,
						json: async () => ({ error: { message: "Invalid key" } }),
					});

				const deployer = new VercelDeployer("token");
				await expect(deployer.setEnvVar("my-project", "INVALID KEY", "value")).rejects.toThrow("Invalid key");
			});

			it("should throw on update error", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							envs: [{ id: "env_1", key: "MY_VAR", value: "old" }],
						}),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 400,
						json: async () => ({ error: { message: "Update failed" } }),
					});

				const deployer = new VercelDeployer("token");
				await expect(deployer.setEnvVar("my-project", "MY_VAR", "new")).rejects.toThrow("Update failed");
			});
		});

		describe("deleteEnvVar", () => {
			it("should delete existing env var", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					// First call: getEnvVars
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							envs: [{ id: "env_to_delete", key: "DELETE_ME", value: "value" }],
						}),
					})
					// Second call: delete
					.mockResolvedValueOnce({
						ok: true,
					});

				const deployer = new VercelDeployer("token");
				await deployer.deleteEnvVar("my-project", "DELETE_ME");

				expect(fetch).toHaveBeenCalledWith(
					expect.stringContaining("/v9/projects/my-project/env/env_to_delete"),
					expect.objectContaining({ method: "DELETE" }),
				);
			});

			it("should silently succeed when env var does not exist", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ envs: [] }),
				});

				const deployer = new VercelDeployer("token");
				await expect(deployer.deleteEnvVar("my-project", "NON_EXISTENT")).resolves.toBeUndefined();
				expect(fetch).toHaveBeenCalledTimes(1); // Only getEnvVars called
			});

			it("should treat 404 as success", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							envs: [{ id: "env_1", key: "VAR", value: "value" }],
						}),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 404,
					});

				const deployer = new VercelDeployer("token");
				await expect(deployer.deleteEnvVar("my-project", "VAR")).resolves.toBeUndefined();
			});

			it("should throw on delete error", async () => {
				(global.fetch as ReturnType<typeof vi.fn>)
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							envs: [{ id: "env_1", key: "VAR", value: "value" }],
						}),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 400,
						json: async () => ({ error: { message: "Bad request" } }),
					});

				const deployer = new VercelDeployer("token");
				await expect(deployer.deleteEnvVar("my-project", "VAR")).rejects.toThrow("Bad request");
			});
		});

		describe("syncJwtAuthEnvVars", () => {
			it("should set all JWT auth env vars when enabled", async () => {
				// Mock getEnvVars (called 4 times) and createEnvVar (called 4 times)
				(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: string, options?: RequestInit) => {
					if (options?.method === "GET") {
						return Promise.resolve({
							ok: true,
							json: async () => ({ envs: [] }),
						});
					}
					return Promise.resolve({
						ok: true,
						json: async () => ({}),
					});
				});

				const deployer = new VercelDeployer("token");
				await deployer.syncJwtAuthEnvVars(
					"my-project",
					true,
					"full",
					"-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
					"https://app.jolli.com/api/sites/1/auth/jwt",
				);

				// Should have made 8 calls: 4 getEnvVars + 4 createEnvVar
				const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
				const postCalls = calls.filter(call => call[1]?.method === "POST");

				expect(postCalls).toHaveLength(4);

				// Verify the keys being set
				const keys = postCalls.map(call => JSON.parse(call[1].body as string).key);
				expect(keys).toContain("JWT_AUTH_ENABLED");
				expect(keys).toContain("JWT_AUTH_MODE");
				expect(keys).toContain("JWT_PUBLIC_KEY");
				expect(keys).toContain("JWT_LOGIN_URL");
			});

			it("should only set JWT_AUTH_ENABLED to false when disabled", async () => {
				(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: string, options?: RequestInit) => {
					if (options?.method === "GET") {
						return Promise.resolve({
							ok: true,
							json: async () => ({ envs: [] }),
						});
					}
					return Promise.resolve({
						ok: true,
						json: async () => ({}),
					});
				});

				const deployer = new VercelDeployer("token");
				await deployer.syncJwtAuthEnvVars("my-project", false, "full", "key", "url");

				// Should have made 2 calls: 1 getEnvVars + 1 createEnvVar for JWT_AUTH_ENABLED
				const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
				const postCalls = calls.filter(call => call[1]?.method === "POST");

				expect(postCalls).toHaveLength(1);
				const body = JSON.parse(postCalls[0][1].body as string);
				expect(body.key).toBe("JWT_AUTH_ENABLED");
				expect(body.value).toBe("false");
			});
		});
	});
});
