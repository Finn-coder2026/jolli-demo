import { createAuthClient, TenantSelectionError } from "./AuthClient";
import type { ClientAuth } from "./Client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
		authToken: undefined,
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("AuthClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	describe("getCliToken", () => {
		it("should get CLI token successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ token: "test-token-123", space: "default" }),
			});

			const client = createAuthClient("", createMockAuth());
			const result = await client.getCliToken();

			expect(result).toEqual({ token: "test-token-123", space: "default" });
		});

		it("should get CLI token without space", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ token: "test-token-123" }),
			});

			const client = createAuthClient("", createMockAuth());
			const result = await client.getCliToken();

			expect(result).toEqual({ token: "test-token-123" });
		});

		it("should throw error when getting CLI token fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const client = createAuthClient("", createMockAuth());

			await expect(client.getCliToken()).rejects.toThrow("Failed to get CLI token");
		});
	});

	describe("setAuthToken", () => {
		it("should set auth token", () => {
			const mockAuth = createMockAuth();
			const client = createAuthClient("", mockAuth);

			client.setAuthToken("new-token");

			expect(mockAuth.authToken).toBe("new-token");
		});

		it("should clear auth token when set to undefined", () => {
			const mockAuth = createMockAuth();
			mockAuth.authToken = "existing-token";
			const client = createAuthClient("", mockAuth);

			client.setAuthToken(undefined);

			expect(mockAuth.authToken).toBeUndefined();
		});
	});

	describe("getSessionConfig", () => {
		it("should get session config successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ idleTimeoutMs: 3600000 }),
			});

			const client = createAuthClient("", createMockAuth());
			const config = await client.getSessionConfig();

			expect(config).toEqual({ idleTimeoutMs: 3600000 });
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/auth/session-config",
				expect.objectContaining({
					method: "GET",
				}),
			);
		});

		it("should throw error when getting session config fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const client = createAuthClient("", createMockAuth());

			await expect(client.getSessionConfig()).rejects.toThrow("Failed to get session config");
		});
	});

	describe("selectTenant", () => {
		it("should select tenant successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true, url: "https://tenant.jolli.app" }),
			});

			const client = createAuthClient("http://localhost:7034", createMockAuth());
			const result = await client.selectTenant("tenant-123", "org-456");

			expect(global.fetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/auth/tenants/select",
				expect.objectContaining({
					method: "POST",
				}),
			);
			expect(result).toEqual({ success: true, url: "https://tenant.jolli.app" });
		});

		it("should throw TenantSelectionError with error code when selecting tenant fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "user_inactive", message: "Account is inactive" }),
			});

			const client = createAuthClient("http://localhost:7034", createMockAuth());

			await expect(client.selectTenant("tenant-123", "org-456")).rejects.toThrow(TenantSelectionError);
			await expect(client.selectTenant("tenant-123", "org-456")).rejects.toMatchObject({
				code: "user_inactive",
				message: "Account is inactive",
			});
		});

		it("should use fallback values when error response has no error or message fields", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createAuthClient("http://localhost:7034", createMockAuth());

			await expect(client.selectTenant("tenant-123", "org-456")).rejects.toMatchObject({
				code: "unknown",
				message: "Failed to select tenant",
			});
		});

		it("should throw TenantSelectionError with fallback when response has no json", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockRejectedValue(new Error("parse error")),
			});

			const client = createAuthClient("http://localhost:7034", createMockAuth());

			await expect(client.selectTenant("tenant-123", "org-456")).rejects.toThrow("Failed to select tenant");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for getCliToken", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ token: "test-token" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("", createMockAuth(checkUnauthorized));
			await client.getCliToken();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getSessionConfig", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ idleTimeoutMs: 3600000 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("", createMockAuth(checkUnauthorized));
			await client.getSessionConfig();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for selectTenant", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true, url: "https://tenant.jolli.app" }),
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("http://localhost:7034", createMockAuth(checkUnauthorized));
			await client.selectTenant("tenant-123", "org-456");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
