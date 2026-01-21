import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Create mock functions at the top level
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();
const mockLogInfo = vi.fn();
const mockCreateBootstrapAuthHeaders = vi.fn();

// Create a mock class for Client
class MockClient {
	connect = mockConnect;
	query = mockQuery;
	end = mockEnd;
}

// Mock pg module
vi.mock("pg", () => {
	return {
		default: {
			Client: MockClient,
		},
	};
});

// Mock jolli-common/server
vi.mock("jolli-common/server", () => ({
	createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
}));

// Mock Logger
vi.mock("./Logger", () => ({
	getLog: vi.fn().mockReturnValue({
		info: mockLogInfo,
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}),
}));

// Mock Config
vi.mock("../Config", () => ({
	env: {
		ADMIN_POSTGRES_URL: "postgres://admin:password@localhost:5432/admin",
		BACKEND_INTERNAL_URL: "http://localhost:3000",
		BOOTSTRAP_SECRET: "test-secret",
	},
}));

describe("BootstrapUtil", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCreateBootstrapAuthHeaders.mockReturnValue({
			"X-Bootstrap-Tenant": "test-tenant",
			"X-Bootstrap-Org": "test-org",
			"X-Bootstrap-Timestamp": "1234567890",
			"X-Bootstrap-Signature": "mock-signature",
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("quoteIdent", () => {
		it("should quote a simple identifier", async () => {
			const { quoteIdent } = await import("./BootstrapUtil");
			expect(quoteIdent("username")).toBe('"username"');
		});

		it("should escape double quotes in identifier", async () => {
			const { quoteIdent } = await import("./BootstrapUtil");
			expect(quoteIdent('user"name')).toBe('"user""name"');
		});

		it("should escape multiple double quotes", async () => {
			const { quoteIdent } = await import("./BootstrapUtil");
			expect(quoteIdent('user""name')).toBe('"user""""name"');
		});
	});

	describe("bootstrapDatabaseWithSuperuser", () => {
		const baseOptions = {
			tenantId: "tenant-123",
			orgId: "org-456",
			username: "tenant_user",
			providerType: "connection_string" as const,
		};

		it("should grant superuser, call bootstrap, and revoke superuser on success", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await bootstrapDatabaseWithSuperuser(baseOptions);

			// Should connect to admin database
			expect(mockConnect).toHaveBeenCalled();

			// Should grant superuser
			expect(mockQuery).toHaveBeenCalledWith('ALTER USER "tenant_user" WITH SUPERUSER');

			// Should call bootstrap endpoint
			expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/admin/bootstrap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bootstrap-Tenant": "test-tenant",
					"X-Bootstrap-Org": "test-org",
					"X-Bootstrap-Timestamp": "1234567890",
					"X-Bootstrap-Signature": "mock-signature",
				},
				body: JSON.stringify({ tenantId: "tenant-123", orgId: "org-456" }),
			});

			// Should create auth headers with correct params
			expect(mockCreateBootstrapAuthHeaders).toHaveBeenCalledWith("tenant-123", "org-456", "test-secret");

			// Should revoke superuser
			expect(mockQuery).toHaveBeenCalledWith('ALTER USER "tenant_user" WITH NOSUPERUSER');

			// Should close connection
			expect(mockEnd).toHaveBeenCalled();
		});

		it("should revoke superuser even when bootstrap fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Database error" })),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				"Bootstrap failed: Database error",
			);

			// Should still revoke superuser
			expect(mockQuery).toHaveBeenCalledWith('ALTER USER "tenant_user" WITH NOSUPERUSER');

			// Should still close connection
			expect(mockEnd).toHaveBeenCalled();
		});

		it("should use statusText when error response has no error field", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				text: vi.fn().mockResolvedValue(JSON.stringify({})),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				"Bootstrap failed: Service Unavailable",
			);
		});

		it("should handle non-JSON error response with status code", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 502,
				statusText: "Bad Gateway",
				text: vi.fn().mockResolvedValue("<html>Bad Gateway</html>"),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				"Bootstrap failed: HTTP 502: <html>Bad Gateway</html>",
			);
		});

		it("should handle network error when backend is not reachable", async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				"Bootstrap failed: Could not connect to backend",
			);
		});

		it("should handle non-Error fetch rejection", async () => {
			const mockFetch = vi.fn().mockRejectedValue("string error");
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				/Bootstrap failed: Could not connect to backend at .* - string error/,
			);
		});

		it("should use statusText when text() fails and body is empty", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: vi.fn().mockRejectedValue(new Error("text() failed")),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow(
				"Bootstrap failed: HTTP 500: Internal Server Error",
			);
		});

		it("should log appropriate messages during bootstrap", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true, message: "Bootstrap complete" }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await bootstrapDatabaseWithSuperuser(baseOptions);

			// Verify logging calls
			expect(mockLogInfo).toHaveBeenCalledWith("Granting temporary superuser privileges to %s", "tenant_user");
			expect(mockLogInfo).toHaveBeenCalledWith(
				"Calling backend bootstrap endpoint for tenant %s, org %s",
				"tenant-123",
				"org-456",
			);
			expect(mockLogInfo).toHaveBeenCalledWith("Bootstrap completed successfully: %o", {
				success: true,
				message: "Bootstrap complete",
			});
			expect(mockLogInfo).toHaveBeenCalledWith("Revoking superuser privileges from %s", "tenant_user");
		});

		it("should revoke superuser and close connection when connect fails", async () => {
			mockConnect.mockRejectedValueOnce(new Error("Connection failed"));

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await expect(bootstrapDatabaseWithSuperuser(baseOptions)).rejects.toThrow("Connection failed");

			// Should still close connection
			expect(mockEnd).toHaveBeenCalled();
		});

		it("should skip superuser grant for Neon providers", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await bootstrapDatabaseWithSuperuser({
				...baseOptions,
				providerType: "neon",
			});

			// Should NOT connect to admin database or grant superuser
			expect(mockConnect).not.toHaveBeenCalled();
			expect(mockQuery).not.toHaveBeenCalled();

			// Should still call bootstrap endpoint
			expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/admin/bootstrap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bootstrap-Tenant": "test-tenant",
					"X-Bootstrap-Org": "test-org",
					"X-Bootstrap-Timestamp": "1234567890",
					"X-Bootstrap-Signature": "mock-signature",
				},
				body: JSON.stringify({ tenantId: "tenant-123", orgId: "org-456" }),
			});

			// Should log that Neon provider is detected
			expect(mockLogInfo).toHaveBeenCalledWith(
				"Neon provider detected, skipping superuser grant (pgvector is built-in)",
			);
		});

		it("should handle local provider type same as connection_string", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await bootstrapDatabaseWithSuperuser({
				...baseOptions,
				providerType: "local",
			});

			// Should connect and grant superuser for local provider
			expect(mockConnect).toHaveBeenCalled();
			expect(mockQuery).toHaveBeenCalledWith('ALTER USER "tenant_user" WITH SUPERUSER');
			expect(mockQuery).toHaveBeenCalledWith('ALTER USER "tenant_user" WITH NOSUPERUSER');
		});

		it("should include Vercel bypass header when VERCEL_BYPASS_SECRET is set", async () => {
			// Reset modules to pick up new mock
			vi.resetModules();

			// Re-mock with VERCEL_BYPASS_SECRET
			vi.doMock("../Config", () => ({
				env: {
					ADMIN_POSTGRES_URL: "postgres://admin:password@localhost:5432/admin",
					BACKEND_INTERNAL_URL: "http://localhost:3000",
					BOOTSTRAP_SECRET: "test-secret",
					VERCEL_BYPASS_SECRET: "test-bypass-secret",
				},
			}));

			// Re-mock jolli-common/server after resetModules
			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			// Re-mock Logger after resetModules
			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: vi.fn(),
					debug: vi.fn(),
				}),
			}));

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { bootstrapDatabaseWithSuperuser } = await import("./BootstrapUtil");

			await bootstrapDatabaseWithSuperuser({
				...baseOptions,
				providerType: "neon", // Use neon to skip superuser logic
			});

			// Should include Vercel bypass header
			expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/admin/bootstrap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bootstrap-Tenant": "test-tenant",
					"X-Bootstrap-Org": "test-org",
					"X-Bootstrap-Timestamp": "1234567890",
					"X-Bootstrap-Signature": "mock-signature",
					"x-vercel-protection-bypass": "test-bypass-secret",
				},
				body: JSON.stringify({ tenantId: "tenant-123", orgId: "org-456" }),
			});
		});
	});
});
