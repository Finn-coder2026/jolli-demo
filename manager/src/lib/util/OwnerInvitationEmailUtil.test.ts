import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLogInfo = vi.fn();
const mockLogWarn = vi.fn();
const mockCreateBootstrapAuthHeaders = vi.fn();
const mockFindOrCreateUser = vi.fn();
const mockFindOrCreateUserOrg = vi.fn();

// Mock jolli-common/server
vi.mock("jolli-common/server", () => ({
	createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
}));

// Mock Logger
vi.mock("./Logger", () => ({
	getLog: vi.fn().mockReturnValue({
		info: mockLogInfo,
		error: vi.fn(),
		warn: mockLogWarn,
		debug: vi.fn(),
	}),
}));

// Mock Config (default: auto-accept disabled)
vi.mock("../Config", () => ({
	env: {
		AUTO_ACCEPT_OWNER_INVITATIONS: false,
		BACKEND_INTERNAL_URL: "http://localhost:3000",
		BOOTSTRAP_SECRET: "test-secret",
	},
}));

// Mock getDatabase
vi.mock("../db/getDatabase", () => ({
	getDatabase: vi.fn().mockResolvedValue({
		globalUserDao: {
			findOrCreate: mockFindOrCreateUser,
		},
		userOrgDao: {
			findOrCreate: mockFindOrCreateUserOrg,
		},
	}),
}));

describe("OwnerInvitationEmailUtil", () => {
	const baseParams = {
		tenantId: "tenant-123",
		orgId: "org-456",
		email: "owner@example.com",
		name: "Test Owner",
		invitedBy: 1,
		previousOwnerId: null,
	};

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

	describe("sendOwnerInvitationEmail", () => {
		it("should send email request to backend successfully", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/admin/send-owner-invitation-email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bootstrap-Tenant": "test-tenant",
					"X-Bootstrap-Org": "test-org",
					"X-Bootstrap-Timestamp": "1234567890",
					"X-Bootstrap-Signature": "mock-signature",
				},
				body: JSON.stringify({
					tenantId: "tenant-123",
					orgId: "org-456",
					email: "owner@example.com",
					name: "Test Owner",
					invitedBy: 1,
					previousOwnerId: null,
				}),
			});

			expect(mockCreateBootstrapAuthHeaders).toHaveBeenCalledWith("tenant-123", "org-456", "test-secret");
			expect(mockLogInfo).toHaveBeenCalledWith(
				{ tenantId: "tenant-123", orgId: "org-456", email: "owner@example.com" },
				"Owner invitation email sent",
			);
		});

		it("should throw error when backend returns error response with JSON body", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Invalid email format" })),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: Invalid email format",
			);
		});

		it("should throw error with details field when present", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: vi.fn().mockResolvedValue(JSON.stringify({ details: "Detailed error message" })),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: Detailed error message",
			);
		});

		it("should throw error with statusText when response has no error field", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				text: vi.fn().mockResolvedValue(JSON.stringify({})),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: Service Unavailable",
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

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: HTTP 502: <html>Bad Gateway</html>",
			);
		});

		it("should handle network error when backend is not reachable", async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: Could not connect to backend - fetch failed",
			);
		});

		it("should handle non-Error fetch rejection", async () => {
			const mockFetch = vi.fn().mockRejectedValue("string error");
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: Could not connect to backend - string error",
			);
		});

		it("should handle text() failure with statusText", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: vi.fn().mockRejectedValue(new Error("text() failed")),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await expect(sendOwnerInvitationEmail(baseParams)).rejects.toThrow(
				"Failed to send owner invitation email: HTTP 500: Internal Server Error",
			);
		});

		it("should include Vercel bypass header when VERCEL_BYPASS_SECRET is set", async () => {
			vi.resetModules();

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: false,
					BACKEND_INTERNAL_URL: "http://localhost:3000",
					BOOTSTRAP_SECRET: "test-secret",
					VERCEL_BYPASS_SECRET: "test-bypass-secret",
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: mockFindOrCreateUser },
					userOrgDao: { findOrCreate: mockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ success: true }),
			});
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/admin/send-owner-invitation-email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Bootstrap-Tenant": "test-tenant",
					"X-Bootstrap-Org": "test-org",
					"X-Bootstrap-Timestamp": "1234567890",
					"X-Bootstrap-Signature": "mock-signature",
					"x-vercel-protection-bypass": "test-bypass-secret",
				},
				body: JSON.stringify({
					tenantId: "tenant-123",
					orgId: "org-456",
					email: "owner@example.com",
					name: "Test Owner",
					invitedBy: 1,
					previousOwnerId: null,
				}),
			});
		});

		it("should skip sending email when BACKEND_INTERNAL_URL is not configured", async () => {
			vi.resetModules();

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: false,
					BACKEND_INTERNAL_URL: undefined,
					BOOTSTRAP_SECRET: "test-secret",
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: mockFindOrCreateUser },
					userOrgDao: { findOrCreate: mockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			expect(mockFetch).not.toHaveBeenCalled();
			expect(mockLogWarn).toHaveBeenCalledWith(
				"BACKEND_INTERNAL_URL or BOOTSTRAP_SECRET not configured, skipping owner invitation email",
			);
		});

		it("should skip sending email when BOOTSTRAP_SECRET is not configured", async () => {
			vi.resetModules();

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: false,
					BACKEND_INTERNAL_URL: "http://localhost:3000",
					BOOTSTRAP_SECRET: undefined,
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: mockFindOrCreateUser },
					userOrgDao: { findOrCreate: mockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			expect(mockFetch).not.toHaveBeenCalled();
			expect(mockLogWarn).toHaveBeenCalled();
		});
	});

	describe("auto-accept owner invitations", () => {
		it("should create global user and user-org when AUTO_ACCEPT_OWNER_INVITATIONS is true", async () => {
			vi.resetModules();

			const localMockFindOrCreateUser = vi
				.fn()
				.mockResolvedValue({ id: 42, email: "owner@example.com", name: "Test Owner" });
			const localMockFindOrCreateUserOrg = vi.fn().mockResolvedValue({ id: 1, userId: 42, role: "owner" });

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: true,
					BACKEND_INTERNAL_URL: "http://localhost:3000",
					BOOTSTRAP_SECRET: "test-secret",
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: localMockFindOrCreateUser },
					userOrgDao: { findOrCreate: localMockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			// Should NOT call fetch (no email sent)
			expect(mockFetch).not.toHaveBeenCalled();

			// Should create global user
			expect(localMockFindOrCreateUser).toHaveBeenCalledWith({
				email: "owner@example.com",
				name: "Test Owner",
				isActive: true,
			});

			// Should create user-org binding with owner role
			expect(localMockFindOrCreateUserOrg).toHaveBeenCalledWith({
				userId: 42,
				tenantId: "tenant-123",
				orgId: "org-456",
				role: "owner",
				isDefault: true,
			});

			// Should log the auto-accept
			expect(mockLogInfo).toHaveBeenCalledWith(
				{ tenantId: "tenant-123", orgId: "org-456", email: "owner@example.com", userId: 42 },
				"Owner invitation auto-accepted",
			);
		});

		it("should use email as name when name is null", async () => {
			vi.resetModules();

			const localMockFindOrCreateUser = vi
				.fn()
				.mockResolvedValue({ id: 99, email: "noname@example.com", name: "noname@example.com" });
			const localMockFindOrCreateUserOrg = vi.fn().mockResolvedValue({ id: 1, userId: 99, role: "owner" });

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: true,
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: localMockFindOrCreateUser },
					userOrgDao: { findOrCreate: localMockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail({ ...baseParams, name: null });

			// Should use email as fallback name
			expect(localMockFindOrCreateUser).toHaveBeenCalledWith({
				email: "owner@example.com",
				name: "owner@example.com",
				isActive: true,
			});
		});

		it("should not send email when auto-accept is enabled even if backend is configured", async () => {
			vi.resetModules();

			const localMockFindOrCreateUser = vi
				.fn()
				.mockResolvedValue({ id: 10, email: "owner@example.com", name: "Test Owner" });
			const localMockFindOrCreateUserOrg = vi.fn().mockResolvedValue({ id: 1, userId: 10, role: "owner" });

			vi.doMock("../Config", () => ({
				env: {
					AUTO_ACCEPT_OWNER_INVITATIONS: true,
					BACKEND_INTERNAL_URL: "http://localhost:3000",
					BOOTSTRAP_SECRET: "test-secret",
				},
			}));

			vi.doMock("jolli-common/server", () => ({
				createBootstrapAuthHeaders: mockCreateBootstrapAuthHeaders,
			}));

			vi.doMock("./Logger", () => ({
				getLog: vi.fn().mockReturnValue({
					info: mockLogInfo,
					error: vi.fn(),
					warn: mockLogWarn,
					debug: vi.fn(),
				}),
			}));

			vi.doMock("../db/getDatabase", () => ({
				getDatabase: vi.fn().mockResolvedValue({
					globalUserDao: { findOrCreate: localMockFindOrCreateUser },
					userOrgDao: { findOrCreate: localMockFindOrCreateUserOrg },
				}),
			}));

			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);

			const { sendOwnerInvitationEmail } = await import("./OwnerInvitationEmailUtil");

			await sendOwnerInvitationEmail(baseParams);

			// Auto-accept takes precedence over email sending
			expect(mockFetch).not.toHaveBeenCalled();
			expect(localMockFindOrCreateUser).toHaveBeenCalled();
			expect(localMockFindOrCreateUserOrg).toHaveBeenCalled();
		});
	});
});
