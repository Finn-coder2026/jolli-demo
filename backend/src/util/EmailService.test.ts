import {
	sendInvitationEmail,
	sendOAuthAccountNotificationEmail,
	sendOwnerInvitationEmail,
	sendPasswordResetEmail,
} from "./EmailService";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sendgrid/mail");
vi.mock("../config/Config", () => ({
	getConfig: () => ({
		SENDGRID_API_KEY: "test-api-key",
		SENDGRID_FROM_EMAIL: "test@example.com",
		SENDGRID_FROM_NAME: "Test App",
		AUTH_GATEWAY_ORIGIN: "https://auth.example.com",
		ORIGIN: "https://example.com",
	}),
}));

describe("EmailService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("sendPasswordResetEmail", () => {
		it("should send password reset email with correct params", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				resetUrl: "https://example.com/reset-password?token=abc123",
			});

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "user@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: "Reset Your Password - Jolli",
					html: expect.stringContaining("Reset Your Password"),
				}),
			);
		});

		it("should include user name and reset URL in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				resetUrl: "https://example.com/reset-password?token=abc123",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("John Doe");
			expect(call.html).toContain("https://example.com/reset-password?token=abc123");
		});

		it("should use 'User' as default name when toName is null", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmail({
				toEmail: "user@example.com",
				toName: null,
				resetUrl: "https://example.com/reset-password?token=abc123",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Hi User,");
		});

		it("should include expiry information in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				resetUrl: "https://example.com/reset-password?token=abc123",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("1 hour");
		});

		it("should throw error when SendGrid send fails", async () => {
			const sendMock = vi.fn().mockRejectedValue(new Error("SendGrid API error"));
			(sgMail.send as unknown) = sendMock;

			await expect(
				sendPasswordResetEmail({
					toEmail: "user@example.com",
					toName: "John Doe",
					resetUrl: "https://example.com/reset-password?token=abc123",
				}),
			).rejects.toThrow("SendGrid API error");
		});

		it("should support Spanish locale", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmail({
				toEmail: "user@example.com",
				toName: "Juan García",
				resetUrl: "https://example.com/reset-password?token=abc123",
				locale: "es",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.subject).toBe("Restablece tu Contraseña - Jolli");
			expect(call.html).toContain("Hola Juan García,");
			expect(call.html).toContain("Restablecer Contraseña");
		});
	});

	describe("sendPasswordResetEmail - no SendGrid config", () => {
		it("should skip sending when SendGrid is not configured", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: undefined,
					SENDGRID_FROM_EMAIL: undefined,
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const { sendPasswordResetEmail: sendPasswordResetEmailNoConfig } = await import("./EmailService");
			const sendMock = vi.fn();
			(sgMail.send as unknown) = sendMock;

			await sendPasswordResetEmailNoConfig({
				toEmail: "user@example.com",
				toName: "John Doe",
				resetUrl: "https://example.com/reset-password?token=abc123",
			});

			expect(sendMock).not.toHaveBeenCalled();
		});
	});

	describe("sendInvitationEmail", () => {
		it("should send invitation email with correct params", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmail({
				toEmail: "invitee@example.com",
				toName: "Jane Smith",
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "member",
				expiresInDays: 7,
			});

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "invitee@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: "You're invited to join Acme Corp on Jolli",
					html: expect.stringContaining("You're Invited!"),
				}),
			);
		});

		it("should include organization name and inviter name in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmail({
				toEmail: "invitee@example.com",
				toName: "Jane Smith",
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "admin",
				expiresInDays: 7,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Acme Corp");
			expect(call.html).toContain("John Doe");
			expect(call.html).toContain("Admin");
		});

		it("should include invitation URL and expiry in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmail({
				toEmail: "invitee@example.com",
				toName: "Jane Smith",
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "member",
				expiresInDays: 14,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("https://example.com/invite/accept?token=xyz789");
			expect(call.html).toContain("14 days");
		});

		it("should use 'there' as default name when toName is null", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmail({
				toEmail: "invitee@example.com",
				toName: null,
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "member",
				expiresInDays: 7,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Hi there,");
		});

		it("should include Accept Invitation button in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmail({
				toEmail: "invitee@example.com",
				toName: "Jane Smith",
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "member",
				expiresInDays: 7,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Accept Invitation");
		});

		it("should throw error when SendGrid send fails", async () => {
			const sendMock = vi.fn().mockRejectedValue(new Error("SendGrid API error"));
			(sgMail.send as unknown) = sendMock;

			await expect(
				sendInvitationEmail({
					toEmail: "invitee@example.com",
					toName: "Jane Smith",
					invitationUrl: "https://example.com/invite/accept?token=xyz789",
					organizationName: "Acme Corp",
					inviterName: "John Doe",
					role: "member",
					expiresInDays: 7,
				}),
			).rejects.toThrow("SendGrid API error");
		});
	});

	describe("sendInvitationEmail - no SendGrid config", () => {
		it("should skip sending when SendGrid is not configured", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: undefined,
					SENDGRID_FROM_EMAIL: undefined,
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const { sendInvitationEmail: sendInvitationEmailNoConfig } = await import("./EmailService");
			const sendMock = vi.fn();
			(sgMail.send as unknown) = sendMock;

			await sendInvitationEmailNoConfig({
				toEmail: "invitee@example.com",
				toName: "Jane Smith",
				invitationUrl: "https://example.com/invite/accept?token=xyz789",
				organizationName: "Acme Corp",
				inviterName: "John Doe",
				role: "member",
				expiresInDays: 7,
			});

			expect(sendMock).not.toHaveBeenCalled();
		});
	});

	describe("sendOAuthAccountNotificationEmail", () => {
		it("should send OAuth notification email with correct params", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOAuthAccountNotificationEmail("user@example.com");

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "user@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: expect.stringContaining("Account"),
					html: expect.stringContaining("social login"),
				}),
			);
		});

		it("should include login URL in email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOAuthAccountNotificationEmail("user@example.com");

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("https://auth.example.com/login");
		});

		it("should support Spanish locale", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOAuthAccountNotificationEmail("user@example.com", "es");

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("inicio de sesión social");
		});

		it("should throw error when SendGrid send fails", async () => {
			const sendMock = vi.fn().mockRejectedValue(new Error("SendGrid API error"));
			(sgMail.send as unknown) = sendMock;

			await expect(sendOAuthAccountNotificationEmail("user@example.com")).rejects.toThrow("SendGrid API error");
		});
	});

	describe("sendOAuthAccountNotificationEmail - no SendGrid config", () => {
		it("should skip sending when SendGrid is not configured", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: undefined,
					SENDGRID_FROM_EMAIL: undefined,
					SENDGRID_FROM_NAME: "Test App",
					AUTH_GATEWAY_ORIGIN: "https://auth.example.com",
				}),
			}));

			const { sendOAuthAccountNotificationEmail: sendOAuthNoConfig } = await import("./EmailService");
			const sendMock = vi.fn();
			(sgMail.send as unknown) = sendMock;

			await sendOAuthNoConfig("user@example.com");

			expect(sendMock).not.toHaveBeenCalled();
		});
	});

	describe("sendOwnerInvitationEmail", () => {
		it("should send owner invitation email for new user with correct params", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "newowner@example.com",
				toName: "New Owner",
				invitationUrl: "https://example.com/owner/accept?token=abc123",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: false,
			});

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "newowner@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: "You've been invited as owner of Acme Corp on Jolli",
					html: expect.stringContaining("Create Account & Accept"),
				}),
			);
		});

		it("should send owner invitation email for existing user with correct params", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "existingowner@example.com",
				toName: "Existing Owner",
				invitationUrl: "https://example.com/owner/accept?token=xyz789",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: true,
			});

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "existingowner@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: "You've been invited as owner of Acme Corp on Jolli",
					html: expect.stringContaining("Accept Ownership"),
				}),
			);
		});

		it("should include tenant name, organization name and inviter name in new user email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "newowner@example.com",
				toName: "New Owner",
				invitationUrl: "https://example.com/owner/accept?token=abc123",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: false,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Acme Tenant");
			expect(call.html).toContain("Acme Corp");
			expect(call.html).toContain("Admin User");
			expect(call.html).toContain("Owner");
		});

		it("should include tenant name, organization name and inviter name in existing user email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "existingowner@example.com",
				toName: "Existing Owner",
				invitationUrl: "https://example.com/owner/accept?token=xyz789",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: true,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Acme Tenant");
			expect(call.html).toContain("Acme Corp");
			expect(call.html).toContain("Admin User");
			expect(call.html).toContain("Owner");
		});

		it("should include invitation URL and expiry in new user email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "newowner@example.com",
				toName: "New Owner",
				invitationUrl: "https://example.com/owner/accept?token=abc123",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 14,
				userExists: false,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("https://example.com/owner/accept?token=abc123");
			expect(call.html).toContain("14 days");
		});

		it("should include invitation URL and expiry in existing user email", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "existingowner@example.com",
				toName: "Existing Owner",
				invitationUrl: "https://example.com/owner/accept?token=xyz789",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 14,
				userExists: true,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("https://example.com/owner/accept?token=xyz789");
			expect(call.html).toContain("14 days");
		});

		it("should use 'there' as default name when toName is null for new user", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "newowner@example.com",
				toName: null,
				invitationUrl: "https://example.com/owner/accept?token=abc123",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: false,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Hi there,");
		});

		it("should use 'there' as default name when toName is null for existing user", async () => {
			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmail({
				toEmail: "existingowner@example.com",
				toName: null,
				invitationUrl: "https://example.com/owner/accept?token=xyz789",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: true,
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Hi there,");
		});

		it("should throw error when SendGrid send fails", async () => {
			const sendMock = vi.fn().mockRejectedValue(new Error("SendGrid API error"));
			(sgMail.send as unknown) = sendMock;

			await expect(
				sendOwnerInvitationEmail({
					toEmail: "newowner@example.com",
					toName: "New Owner",
					invitationUrl: "https://example.com/owner/accept?token=abc123",
					tenantName: "Acme Tenant",
					organizationName: "Acme Corp",
					inviterName: "Admin User",
					expiresInDays: 7,
					userExists: false,
				}),
			).rejects.toThrow("SendGrid API error");
		});
	});

	describe("sendOwnerInvitationEmail - no SendGrid config", () => {
		it("should skip sending when SendGrid is not configured", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: undefined,
					SENDGRID_FROM_EMAIL: undefined,
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const { sendOwnerInvitationEmail: sendOwnerInvitationEmailNoConfig } = await import("./EmailService");
			const sendMock = vi.fn();
			(sgMail.send as unknown) = sendMock;

			await sendOwnerInvitationEmailNoConfig({
				toEmail: "newowner@example.com",
				toName: "New Owner",
				invitationUrl: "https://example.com/owner/accept?token=abc123",
				tenantName: "Acme Tenant",
				organizationName: "Acme Corp",
				inviterName: "Admin User",
				expiresInDays: 7,
				userExists: false,
			});

			expect(sendMock).not.toHaveBeenCalled();
		});
	});

	describe("sendSecurityAlertEmail", () => {
		it("should send security alert email with correct params", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
			});

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "user@example.com",
					from: {
						email: "test@example.com",
						name: "Test App",
					},
					subject: expect.stringContaining("Security Alert"),
					html: expect.stringContaining("Security Alert"),
				}),
			);
		});

		it("should include IP address and User-Agent in email when provided", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
				ipAddress: "192.168.1.1",
				userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("192.168.1.1");
			expect(call.html).toContain("Mozilla/5.0");
		});

		it("should omit details section when neither IP address nor User-Agent is provided", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).not.toContain("IP Address:");
			expect(call.html).not.toContain("Device:");
		});

		it("should include only IP address when User-Agent is not provided", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
				ipAddress: "10.0.0.1",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("IP Address: 10.0.0.1");
			expect(call.html).not.toContain("Device:");
		});

		it("should use 'User' as default name when toName is null", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: null,
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("Hi User,");
		});

		it("should include security review URL in email", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.html).toContain("https://example.com/settings/security");
			expect(call.html).toContain("Review Account Security");
		});

		it("should support Spanish locale", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			await sendSecurityAlertEmail({
				toEmail: "user@example.com",
				toName: "Juan García",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
				locale: "es",
			});

			const call = sendMock.mock.calls[0][0];
			expect(call.subject).toContain("Alerta de Seguridad");
			expect(call.html).toContain("Hola Juan García,");
			expect(call.html).toContain("Revisar Seguridad de la Cuenta");
		});

		it("should not throw error when SendGrid send fails", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: "test-api-key",
					SENDGRID_FROM_EMAIL: "test@example.com",
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const sendMock = vi.fn().mockRejectedValue(new Error("SendGrid API error"));
			const sgMailMock = await import("@sendgrid/mail");
			(sgMailMock.default.send as unknown) = sendMock;

			const { sendSecurityAlertEmail } = await import("./EmailService");

			// Should not throw - security alert email failure shouldn't break the flow
			await expect(
				sendSecurityAlertEmail({
					toEmail: "user@example.com",
					toName: "John Doe",
					alertType: "token_theft",
					securityReviewUrl: "https://example.com/settings/security",
				}),
			).resolves.toBeUndefined();
		});
	});

	describe("sendSecurityAlertEmail - no SendGrid config", () => {
		it("should skip sending when SendGrid is not configured", async () => {
			vi.resetModules();
			vi.doMock("../config/Config", () => ({
				getConfig: () => ({
					SENDGRID_API_KEY: undefined,
					SENDGRID_FROM_EMAIL: undefined,
					SENDGRID_FROM_NAME: "Test App",
				}),
			}));

			const { sendSecurityAlertEmail: sendSecurityAlertEmailNoConfig } = await import("./EmailService");
			const sendMock = vi.fn();
			(sgMail.send as unknown) = sendMock;

			await sendSecurityAlertEmailNoConfig({
				toEmail: "user@example.com",
				toName: "John Doe",
				alertType: "token_theft",
				securityReviewUrl: "https://example.com/settings/security",
			});

			expect(sendMock).not.toHaveBeenCalled();
		});
	});
});
