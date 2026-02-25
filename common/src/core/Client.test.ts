import { createClient } from "./Client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Client", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		// Clear any sessionStorage mocks
		if (typeof sessionStorage !== "undefined") {
			sessionStorage.clear();
		}
	});

	afterEach(() => {
		if (typeof sessionStorage !== "undefined") {
			sessionStorage.clear();
		}
	});

	it("should create a client with visit, status, sync, and syncChangesets methods", () => {
		const client = createClient();

		expect(client).toBeDefined();
		expect(client.visit).toBeDefined();
		expect(typeof client.visit).toBe("function");
		expect(client.status).toBeDefined();
		expect(typeof client.status).toBe("function");
		expect(client.sync).toBeDefined();
		expect(typeof client.sync).toBe("function");
		expect(client.syncChangesets).toBeDefined();
		expect(typeof client.syncChangesets).toBe("function");
	});

	it("should call fetch with correct URL and method on visit", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => void 0,
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.visit();

		expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
			headers: {},
			method: "POST",
			body: null,
			credentials: "include",
		});
	});

	it("should handle fetch errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const client = createClient();

		await expect(client.visit()).rejects.toThrow("Network error");
	});

	it("should handle response errors", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.visit();

		expect(mockFetch).toHaveBeenCalled();
	});

	it("should use POST method", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => void 0,
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.visit();

		expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST" }));
	});

	it("should call status endpoint with GET method", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => "ok",
		});
		global.fetch = mockFetch;

		const client = createClient();
		const result = await client.status();

		expect(mockFetch).toHaveBeenCalledWith("/api/status/check", {
			method: "GET",
			headers: {},
			body: null,
			credentials: "include",
		});
		expect(result).toBe("ok");
	});

	it("should return ERROR when status endpoint fails", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const client = createClient();
		const result = await client.status();

		expect(result).toBe("ERROR");
	});

	it("should fetch and return user info when login is called", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				user: {
					email: "test@example.com",
					name: "Test User",
					userId: "123",
				},
			}),
		});
		global.fetch = mockFetch;

		const client = createClient();
		const loginResponse = await client.login();

		expect(mockFetch).toHaveBeenCalledWith("/api/auth/login", {
			method: "GET",
			headers: {},
			body: null,
			credentials: "include",
		});
		expect(loginResponse).toEqual({
			user: {
				email: "test@example.com",
				name: "Test User",
				userId: "123",
			},
		});
	});

	it("should call logout endpoint when logout is called", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true }),
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.logout();

		expect(mockFetch).toHaveBeenCalledWith("/api/auth/logout", {
			method: "POST",
			headers: {},
			body: null,
			credentials: "include",
		});
	});

	it("should return empty response when login fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
		});

		const client = createClient();
		const loginResponse = await client.login();

		expect(loginResponse).toEqual({ user: undefined });
	});

	it("should include credentials in all requests", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => void 0,
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.visit();

		expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
			headers: {},
			method: "POST",
			body: null,
			credentials: "include",
		});
	});

	it("should call sync endpoint with correct URL and body", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, url: "https://github.com/owner/repo" }),
		});
		global.fetch = mockFetch;

		const client = createClient();
		await client.sync("https://github.com/owner/repo");

		expect(mockFetch).toHaveBeenCalledWith("/api/ingest/sync", {
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify({ url: "https://github.com/owner/repo" }),
		});
	});

	it("should throw error when sync fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({ error: "Internal Server Error" }),
		});

		const client = createClient();

		await expect(client.sync("https://github.com/owner/repo")).rejects.toThrow(
			"Failed to sync: Internal Server Error",
		);
	});

	it("should handle network errors on sync", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const client = createClient();

		await expect(client.sync("https://github.com/owner/repo")).rejects.toThrow("Network error");
	});

	it("should include auth token in Authorization header when provided", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true }),
		});
		global.fetch = mockFetch;

		const client = createClient("", "test-token-123");
		await client.sync("https://github.com/owner/repo");

		expect(mockFetch).toHaveBeenCalledWith("/api/ingest/sync", {
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-token-123",
			},
			method: "POST",
			body: JSON.stringify({ url: "https://github.com/owner/repo" }),
		});
	});

	it("should include auth token in Authorization header for visit", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => void 0,
		});
		global.fetch = mockFetch;

		const client = createClient("", "test-token");
		await client.visit();

		expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
			method: "POST",
			headers: {
				Authorization: "Bearer test-token",
			},
			body: null,
			credentials: "include",
		});
	});

	it("should throw specific error message for 401 on sync", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ error: "Not authorized" }),
		});

		const client = createClient();

		await expect(client.sync("https://github.com/owner/repo")).rejects.toThrow("Failed to sync: Not authorized");
	});

	it("should return a DocClient instance from docs() method", () => {
		const client = createClient();
		const docClient = client.docs();

		expect(docClient).toBeDefined();
		expect(docClient.createDoc).toBeDefined();
		expect(docClient.listDocs).toBeDefined();
		expect(docClient.findDoc).toBeDefined();
		expect(docClient.updateDoc).toBeDefined();
		expect(docClient.deleteDoc).toBeDefined();
		expect(docClient.clearAll).toBeDefined();
		expect(docClient.search).toBeDefined();
	});

	it("should update auth token and use it in subsequent requests", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => void 0,
		});
		global.fetch = mockFetch;

		const client = createClient();

		// First request without token
		await client.visit();
		expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
			method: "POST",
			headers: {},
			body: null,
			credentials: "include",
		});

		// Set auth token
		client.auth().setAuthToken("new-token-456");

		// Second request with token
		await client.visit();
		expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
			method: "POST",
			headers: {
				Authorization: "Bearer new-token-456",
			},
			body: null,
			credentials: "include",
		});
	});

	describe("X-Tenant-Slug header for path-based multi-tenant", () => {
		// Mock sessionStorage for Node.js environment
		const mockStorage: Record<string, string> = {};
		const mockSessionStorage = {
			getItem: (key: string) => mockStorage[key] ?? null,
			setItem: (key: string, value: string) => {
				mockStorage[key] = value;
			},
			clear: () => {
				for (const key of Object.keys(mockStorage)) {
					delete mockStorage[key];
				}
			},
			removeItem: (key: string) => {
				delete mockStorage[key];
			},
			key: (_index: number) => null,
			length: 0,
		};

		beforeEach(() => {
			Object.defineProperty(globalThis, "sessionStorage", {
				value: mockSessionStorage,
				writable: true,
				configurable: true,
			});
			mockSessionStorage.clear();
		});

		afterEach(() => {
			mockSessionStorage.clear();
		});

		it("should include X-Tenant-Slug header when tenantSlug is in sessionStorage", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			mockSessionStorage.setItem("tenantSlug", "flyer6");

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {
					"X-Tenant-Slug": "flyer6",
				},
				body: null,
				credentials: "include",
			});
		});

		it("should not include X-Tenant-Slug header when tenantSlug is not set", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should include both X-Tenant-Slug and X-Org-Slug when both are set", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			mockSessionStorage.setItem("tenantSlug", "flyer6");
			mockSessionStorage.setItem("selectedOrgSlug", "engineering");

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {
					"X-Tenant-Slug": "flyer6",
					"X-Org-Slug": "engineering",
				},
				body: null,
				credentials: "include",
			});
		});
	});

	describe("X-Org header for multi-tenant", () => {
		// Mock sessionStorage for Node.js environment
		const mockStorage: Record<string, string> = {};
		const mockSessionStorage = {
			getItem: (key: string) => mockStorage[key] ?? null,
			setItem: (key: string, value: string) => {
				mockStorage[key] = value;
			},
			clear: () => {
				for (const key of Object.keys(mockStorage)) {
					delete mockStorage[key];
				}
			},
			removeItem: (key: string) => {
				delete mockStorage[key];
			},
			key: (_index: number) => null,
			length: 0,
		};

		beforeEach(() => {
			// Setup sessionStorage mock
			Object.defineProperty(globalThis, "sessionStorage", {
				value: mockSessionStorage,
				writable: true,
				configurable: true,
			});
			mockSessionStorage.clear();
		});

		afterEach(() => {
			mockSessionStorage.clear();
		});

		it("should include X-Org-Slug header when selectedOrgSlug is in sessionStorage", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			// Set selected org in sessionStorage
			mockSessionStorage.setItem("selectedOrgSlug", "engineering");

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {
					"X-Org-Slug": "engineering",
				},
				body: null,
				credentials: "include",
			});
		});

		it("should not include X-Org-Slug header when selectedOrgSlug is not set", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should not include X-Org-Slug header when sessionStorage is unavailable", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			// Simulate non-browser/runtime contexts where sessionStorage does not exist.
			Object.defineProperty(globalThis, "sessionStorage", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const client = createClient();
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should include both Authorization and X-Org-Slug headers when both are present", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			// Set selected org in sessionStorage
			mockSessionStorage.setItem("selectedOrgSlug", "marketing");

			const client = createClient("", "test-token");
			await client.visit();

			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"X-Org-Slug": "marketing",
				},
				body: null,
				credentials: "include",
			});
		});

		it("should include X-Org-Slug header with Content-Type for POST with body", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});
			global.fetch = mockFetch;

			// Set selected org in sessionStorage
			mockSessionStorage.setItem("selectedOrgSlug", "sales");

			const client = createClient();
			await client.sync("https://github.com/owner/repo");

			expect(mockFetch).toHaveBeenCalledWith("/api/ingest/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Org-Slug": "sales",
				},
				body: JSON.stringify({ url: "https://github.com/owner/repo" }),
				credentials: "include",
			});
		});

		it("should handle sessionStorage access throwing an error", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => void 0,
			});
			global.fetch = mockFetch;

			// Save original sessionStorage reference
			const originalSessionStorage = mockSessionStorage;

			// Mock sessionStorage to throw when accessed
			Object.defineProperty(globalThis, "sessionStorage", {
				get: () => {
					throw new Error("sessionStorage access denied");
				},
				configurable: true,
			});

			const client = createClient();
			await client.visit();

			// Restore sessionStorage before assertions to avoid afterEach issues
			Object.defineProperty(globalThis, "sessionStorage", {
				value: originalSessionStorage,
				writable: true,
				configurable: true,
			});

			// Should still work without X-Org header when sessionStorage throws
			expect(mockFetch).toHaveBeenCalledWith("/api/visit/create", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});
	});

	describe("onUnauthorized callback", () => {
		it("should call onUnauthorized callback when status endpoint returns 401", async () => {
			const onUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "Unauthorized",
			});

			const client = createClient("", undefined, { onUnauthorized });
			await client.status();

			expect(onUnauthorized).toHaveBeenCalledTimes(1);
		});

		it("should call onUnauthorized callback when visit endpoint returns 401", async () => {
			const onUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});

			const client = createClient("", undefined, { onUnauthorized });
			await client.visit();

			expect(onUnauthorized).toHaveBeenCalledTimes(1);
		});

		it("should call onUnauthorized and throw error when sync returns 401", async () => {
			const onUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ error: "Unauthorized" }),
			});

			const client = createClient("", undefined, { onUnauthorized });

			await expect(client.sync("https://github.com/owner/repo")).rejects.toThrow("Unauthorized");
			expect(onUnauthorized).toHaveBeenCalledTimes(1);
		});

		it("should not call onUnauthorized when login returns 401 (expected behavior)", async () => {
			const onUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});

			const client = createClient("", undefined, { onUnauthorized });
			const result = await client.login();

			expect(result).toEqual({ user: undefined });
			// Login should NOT trigger onUnauthorized because 401 is expected when not logged in
			expect(onUnauthorized).not.toHaveBeenCalled();
		});

		it("should not call onUnauthorized when response is not 401", async () => {
			const onUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Server Error",
			});

			const client = createClient("", undefined, { onUnauthorized });
			await client.status();

			expect(onUnauthorized).not.toHaveBeenCalled();
		});

		it("should work without callbacks provided", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "Unauthorized",
			});

			// Client without callbacks should not throw
			const client = createClient();
			const result = await client.status();

			expect(result).toBe("Unauthorized");
		});
	});
});
