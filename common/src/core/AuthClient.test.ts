import { createAuthClient } from "./AuthClient";
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
				json: vi.fn().mockResolvedValue({ token: "test-token-123" }),
			});

			const client = createAuthClient("", createMockAuth());
			const token = await client.getCliToken();

			expect(token).toBe("test-token-123");
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

	describe("getEmails", () => {
		it("should get available emails successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ emails: ["user1@example.com", "user2@example.com"] }),
			});

			const client = createAuthClient("", createMockAuth());
			const emails = await client.getEmails();

			expect(emails).toEqual(["user1@example.com", "user2@example.com"]);
		});

		it("should throw error when getting emails fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const client = createAuthClient("", createMockAuth());

			await expect(client.getEmails()).rejects.toThrow("Failed to get emails");
		});
	});

	describe("selectEmail", () => {
		it("should select email successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ success: true }),
			});

			const client = createAuthClient("", createMockAuth());
			const result = await client.selectEmail("user@example.com");

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/auth/select-email",
				expect.objectContaining({
					method: "POST",
				}),
			);
			expect(result).toEqual({});
		});

		it("should return redirectTo when present in response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ success: true, redirectTo: "https://tenant.example.com" }),
			});

			const client = createAuthClient("", createMockAuth());
			const result = await client.selectEmail("user@example.com");

			expect(result).toEqual({ redirectTo: "https://tenant.example.com" });
		});

		it("should throw error when selecting email fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const client = createAuthClient("", createMockAuth());

			await expect(client.selectEmail("user@example.com")).rejects.toThrow("Failed to select email");
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

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for getCliToken", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ token: "test-token" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("", createMockAuth(checkUnauthorized));
			await client.getCliToken();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getEmails", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ emails: [] }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("", createMockAuth(checkUnauthorized));
			await client.getEmails();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for selectEmail", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createAuthClient("", createMockAuth(checkUnauthorized));
			await client.selectEmail("test@example.com");

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
	});
});
