import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { PasswordHistoryDao } from "../dao/PasswordHistoryDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { RememberMeService } from "../services/RememberMeService";
import { createPasswordAuthRouter } from "./PasswordAuthRouter";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PasswordAuthRouter", () => {
	let app: express.Application;
	let mockVerificationDao: {
		findByTokenHash: ReturnType<typeof vi.fn>;
		findByResetPasswordToken: ReturnType<typeof vi.fn>;
		markAsUsed: ReturnType<typeof vi.fn>;
	};
	let mockPasswordHistoryDao: {
		isPasswordReused: ReturnType<typeof vi.fn>;
		addPasswordHistory: ReturnType<typeof vi.fn>;
		cleanupOldPasswords: ReturnType<typeof vi.fn>;
	};
	let mockGlobalAuthDao: {
		findAuthByUserIdAndProvider: ReturnType<typeof vi.fn>;
		updateAuth: ReturnType<typeof vi.fn>;
	};
	let mockRememberMeService: {
		revokeAllTokensForUser: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		mockVerificationDao = {
			findByTokenHash: vi.fn(),
			findByResetPasswordToken: vi.fn(),
			markAsUsed: vi.fn(),
		};

		mockPasswordHistoryDao = {
			isPasswordReused: vi.fn(),
			addPasswordHistory: vi.fn(),
			cleanupOldPasswords: vi.fn(),
		};

		mockGlobalAuthDao = {
			findAuthByUserIdAndProvider: vi.fn(),
			updateAuth: vi.fn(),
		};

		mockRememberMeService = {
			revokeAllTokensForUser: vi.fn(),
		};

		app = express();
		app.use(express.json());
		app.use(
			"/api/auth",
			createPasswordAuthRouter({
				verificationDao: mockVerificationDao as unknown as VerificationDao,
				passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
				globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
				rememberMeService: mockRememberMeService as unknown as RememberMeService,
			}),
		);
	});

	describe("GET /password/validate-reset-token", () => {
		it("should return invalid when token is missing", async () => {
			const response = await request(app).get("/api/auth/password/validate-reset-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("missing_token");
		});

		it("should return invalid when token is not a string", async () => {
			const response = await request(app).get("/api/auth/password/validate-reset-token?token[]=array");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("missing_token");
		});

		it("should return invalid when token not found in database", async () => {
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue(null);

			const response = await request(app).get("/api/auth/password/validate-reset-token?token=invalid-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return invalid when token is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: expiredDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app).get("/api/auth/password/validate-reset-token?token=test-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return invalid when token has been used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: new Date(),
				value: "123",
			});

			const response = await request(app).get("/api/auth/password/validate-reset-token?token=test-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return valid when token is valid", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app).get("/api/auth/password/validate-reset-token?token=test-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(true);
		});

		it("should return 500 on server error", async () => {
			mockVerificationDao.findByResetPasswordToken.mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/auth/password/validate-reset-token?token=test-token");

			expect(response.status).toBe(500);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /password/reset-password", () => {
		const validPassword = "Test@1234";

		it("should return 400 when token is missing", async () => {
			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_request");
		});

		it("should return 400 when password is missing", async () => {
			const response = await request(app).post("/api/auth/password/reset-password").send({ token: "test-token" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_request");
		});

		it("should return 400 when token not found in database", async () => {
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "invalid-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when token is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: expiredDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return 400 when token has been used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: new Date(),
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return 400 when userId in verification is invalid", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when password is too short", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: "Ab@1" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at least 8");
		});

		it("should return 400 when password is too long", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: `${"A".repeat(30)}bcdef@1` });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password lacks uppercase letter", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: "test@1234" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("uppercase");
		});

		it("should return 400 when password lacks lowercase letter", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: "TEST@1234" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("lowercase");
		});

		it("should return 400 when password lacks number", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: "Test@abcd" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("number");
		});

		it("should return 400 when password lacks special character", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: "Test1234abc" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("special character");
		});

		it("should return 400 when password was recently used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(true);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("password_reused");
		});

		it("should return 400 when no auth record found for user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("no_auth_record");
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledTimes(2);
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledWith(123, "credential");
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledWith(123, "password");
		});

		it("should successfully reset password for legacy user with password provider", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			// First call (credential) returns null, second call (password) returns auth record
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValueOnce(null).mockResolvedValueOnce({
				id: "auth-1",
				userId: 123,
				provider: "password",
				passwordHash: "old-hash",
			});
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockVerificationDao.markAsUsed.mockResolvedValue(undefined);
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledTimes(2);
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledWith(123, "credential");
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledWith(123, "password");
			expect(mockPasswordHistoryDao.addPasswordHistory).toHaveBeenCalledWith(123, "old-hash");
		});

		it("should successfully reset password with existing password history", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 123,
				provider: "credential",
				passwordHash: "old-hash",
			});
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockVerificationDao.markAsUsed.mockResolvedValue(undefined);
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockPasswordHistoryDao.addPasswordHistory).toHaveBeenCalledWith(123, "old-hash");
			expect(mockGlobalAuthDao.updateAuth).toHaveBeenCalled();
			expect(mockVerificationDao.markAsUsed).toHaveBeenCalledWith("verification-1");
			expect(mockPasswordHistoryDao.cleanupOldPasswords).toHaveBeenCalledWith(123, 5);
		});

		it("should successfully reset password without existing password history", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 123,
				provider: "credential",
				passwordHash: null,
			});
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockVerificationDao.markAsUsed.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockPasswordHistoryDao.addPasswordHistory).not.toHaveBeenCalled();
		});

		it("should revoke all remember-me tokens on successful password reset", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);
			mockVerificationDao.findByResetPasswordToken.mockResolvedValue({
				id: "verification-1",
				identifier: "reset-password:test-token",
				expiresAt: futureDate,
				usedAt: null,
				value: "123",
			});
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 123,
				provider: "credential",
				passwordHash: "old-hash",
			});
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockVerificationDao.markAsUsed.mockResolvedValue(undefined);
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);
			mockRememberMeService.revokeAllTokensForUser.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockRememberMeService.revokeAllTokensForUser).toHaveBeenCalledWith(123);
		});

		it("should return 500 on server error", async () => {
			mockVerificationDao.findByResetPasswordToken.mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/auth/password/reset-password")
				.send({ token: "test-token", newPassword: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});
	});
});
