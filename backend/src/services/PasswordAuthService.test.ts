import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import { PasswordAuthService } from "./PasswordAuthService";
import * as argon2 from "@node-rs/argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@node-rs/argon2");
vi.mock("../config/Config", () => ({
	getConfig: () => ({
		AUTH_GATEWAY_ORIGIN: "https://auth.example.com",
	}),
}));
vi.mock("../util/EmailService", () => ({
	sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
	sendOAuthAccountNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/RateLimitService", () => ({
	RateLimitService: vi.fn().mockImplementation(() => ({
		checkPasswordResetEmailLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 5 }),
		recordPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
	})),
}));

describe("PasswordAuthService", () => {
	let mockGlobalUserDao: GlobalUserDao;
	let mockGlobalAuthDao: GlobalAuthDao;
	let passwordAuthService: PasswordAuthService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockGlobalUserDao = {
			findUserByEmail: vi.fn(),
		} as unknown as GlobalUserDao;

		mockGlobalAuthDao = {
			findAuthByUserIdAndProvider: vi.fn(),
			hasPasswordAuth: vi.fn(),
		} as unknown as GlobalAuthDao;

		passwordAuthService = new PasswordAuthService(mockGlobalUserDao, mockGlobalAuthDao);
	});

	describe("login", () => {
		it("should login successfully with correct credentials", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuth = {
				id: 1,
				userId: 1,
				provider: "password",
				passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$salt$hash",
				passwordSalt: "salt",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
				providerId: undefined,
				providerEmail: undefined,
				accessToken: undefined,
				refreshToken: undefined,
				tokenExpiresAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(mockUser);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(mockAuth);
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const result = await passwordAuthService.login("test@example.com", "password123");

			expect(result.success).toBe(true);
			expect(result.user).toEqual({
				id: 1,
				email: "test@example.com",
				name: "Test User",
			});
			expect(mockGlobalUserDao.findUserByEmail).toHaveBeenCalledWith("test@example.com");
			expect(mockGlobalAuthDao.findAuthByUserIdAndProvider).toHaveBeenCalledWith(1, "password");
			expect(argon2.verify).toHaveBeenCalledWith("$argon2id$v=19$m=65536,t=3,p=4$salt$hash", "password123");
		});

		it("should fail when user not found", async () => {
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			const result = await passwordAuthService.login("test@example.com", "password123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("user_not_found");
			expect(result.user).toBeUndefined();
		});

		it("should fail when user is not active", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(mockUser);

			const result = await passwordAuthService.login("test@example.com", "password123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("account_inactive");
			expect(result.user).toBeUndefined();
		});

		it("should fail when password auth not found", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(mockUser);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(undefined);

			const result = await passwordAuthService.login("test@example.com", "password123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("invalid_password");
			expect(result.user).toBeUndefined();
		});

		it("should fail when password is incorrect", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuth = {
				id: 1,
				userId: 1,
				provider: "password",
				passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$salt$hash",
				passwordSalt: "salt",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
				providerId: undefined,
				providerEmail: undefined,
				accessToken: undefined,
				refreshToken: undefined,
				tokenExpiresAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(mockUser);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(mockAuth);
			vi.mocked(argon2.verify).mockResolvedValue(false);

			const result = await passwordAuthService.login("test@example.com", "wrongpassword");

			expect(result.success).toBe(false);
			expect(result.error).toBe("invalid_password");
			expect(result.user).toBeUndefined();
		});

		it("should fail when argon2.verify throws an error", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuth = {
				id: 1,
				userId: 1,
				provider: "password",
				passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$salt$hash",
				passwordSalt: "salt",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
				providerId: undefined,
				providerEmail: undefined,
				accessToken: undefined,
				refreshToken: undefined,
				tokenExpiresAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(mockUser);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(mockAuth);
			vi.mocked(argon2.verify).mockRejectedValue(new Error("Verification error"));

			const result = await passwordAuthService.login("test@example.com", "password123");

			expect(result.success).toBe(false);
			expect(result.error).toBe("invalid_password");
			expect(result.user).toBeUndefined();
		});
	});

	describe("hashPassword", () => {
		it("should hash a password", async () => {
			const hashedPassword = "$argon2id$v=19$m=65536,t=3,p=4$newsalt$newhash";
			vi.mocked(argon2.hash).mockResolvedValue(hashedPassword);

			const result = await passwordAuthService.hashPassword("mypassword");

			expect(result).toBe(hashedPassword);
			expect(argon2.hash).toHaveBeenCalledWith("mypassword");
		});
	});

	describe("verifyPassword", () => {
		it("should return true when password matches", async () => {
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const result = await passwordAuthService.verifyPassword("$argon2id$hash", "password123");

			expect(result).toBe(true);
			expect(argon2.verify).toHaveBeenCalledWith("$argon2id$hash", "password123");
		});

		it("should return false when password does not match", async () => {
			vi.mocked(argon2.verify).mockResolvedValue(false);

			const result = await passwordAuthService.verifyPassword("$argon2id$hash", "wrongpassword");

			expect(result).toBe(false);
		});

		it("should return false when argon2.verify throws an error", async () => {
			vi.mocked(argon2.verify).mockRejectedValue(new Error("Verification error"));

			const result = await passwordAuthService.verifyPassword("$argon2id$hash", "password123");

			expect(result).toBe(false);
		});
	});

	describe("handlePasswordResetRequest", () => {
		it("should do nothing when user is null (simulate work for timing)", async () => {
			const { sendPasswordResetEmail, sendOAuthAccountNotificationEmail } = await import("../util/EmailService");

			await passwordAuthService.handlePasswordResetRequest(null, "reset-token-123");

			expect(sendPasswordResetEmail).not.toHaveBeenCalled();
			expect(sendOAuthAccountNotificationEmail).not.toHaveBeenCalled();
		});

		it("should return silently when rate limit is exceeded", async () => {
			const { RateLimitService } = await import("../services/RateLimitService");
			vi.mocked(RateLimitService).mockImplementation(
				() =>
					({
						checkPasswordResetEmailLimit: vi.fn().mockResolvedValue({
							allowed: false,
							current: 5,
							limit: 5,
							resetInSeconds: 3600,
						}),
						recordPasswordResetEmail: vi.fn(),
					}) as unknown as InstanceType<typeof RateLimitService>,
			);

			const { sendPasswordResetEmail, sendOAuthAccountNotificationEmail } = await import("../util/EmailService");
			const user = { id: "1", email: "test@example.com", name: "Test User" };

			await passwordAuthService.handlePasswordResetRequest(user, "reset-token-123");

			expect(sendPasswordResetEmail).not.toHaveBeenCalled();
			expect(sendOAuthAccountNotificationEmail).not.toHaveBeenCalled();
		});

		it("should return when no reset token is provided", async () => {
			const { RateLimitService } = await import("../services/RateLimitService");
			vi.mocked(RateLimitService).mockImplementation(
				() =>
					({
						checkPasswordResetEmailLimit: vi
							.fn()
							.mockResolvedValue({ allowed: true, current: 0, limit: 5 }),
						recordPasswordResetEmail: vi.fn(),
					}) as unknown as InstanceType<typeof RateLimitService>,
			);

			const { sendPasswordResetEmail, sendOAuthAccountNotificationEmail } = await import("../util/EmailService");
			const user = { id: "1", email: "test@example.com", name: "Test User" };

			await passwordAuthService.handlePasswordResetRequest(user, "");

			expect(sendPasswordResetEmail).not.toHaveBeenCalled();
			expect(sendOAuthAccountNotificationEmail).not.toHaveBeenCalled();
		});

		it("should send password reset email when user has password auth", async () => {
			const { RateLimitService } = await import("../services/RateLimitService");
			const mockRecordPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
			vi.mocked(RateLimitService).mockImplementation(
				() =>
					({
						checkPasswordResetEmailLimit: vi
							.fn()
							.mockResolvedValue({ allowed: true, current: 0, limit: 5 }),
						recordPasswordResetEmail: mockRecordPasswordResetEmail,
					}) as unknown as InstanceType<typeof RateLimitService>,
			);

			mockGlobalAuthDao.hasPasswordAuth = vi.fn().mockResolvedValue(true);
			const { sendPasswordResetEmail, sendOAuthAccountNotificationEmail } = await import("../util/EmailService");
			vi.mocked(sendPasswordResetEmail).mockClear();
			vi.mocked(sendOAuthAccountNotificationEmail).mockClear();

			const user = { id: "1", email: "test@example.com", name: "Test User" };

			await passwordAuthService.handlePasswordResetRequest(user, "reset-token-123");

			expect(sendPasswordResetEmail).toHaveBeenCalledWith({
				toEmail: "test@example.com",
				toName: "Test User",
				resetUrl: "https://auth.example.com/reset-password?token=reset-token-123",
			});
			expect(sendOAuthAccountNotificationEmail).not.toHaveBeenCalled();
			expect(mockRecordPasswordResetEmail).toHaveBeenCalledWith("test@example.com");
		});

		it("should send OAuth notification email when user has OAuth only", async () => {
			const { RateLimitService } = await import("../services/RateLimitService");
			const mockRecordPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
			vi.mocked(RateLimitService).mockImplementation(
				() =>
					({
						checkPasswordResetEmailLimit: vi
							.fn()
							.mockResolvedValue({ allowed: true, current: 0, limit: 5 }),
						recordPasswordResetEmail: mockRecordPasswordResetEmail,
					}) as unknown as InstanceType<typeof RateLimitService>,
			);

			mockGlobalAuthDao.hasPasswordAuth = vi.fn().mockResolvedValue(false);
			const { sendPasswordResetEmail, sendOAuthAccountNotificationEmail } = await import("../util/EmailService");
			vi.mocked(sendPasswordResetEmail).mockClear();
			vi.mocked(sendOAuthAccountNotificationEmail).mockClear();

			const user = { id: "1", email: "test@example.com", name: "Test User" };

			await passwordAuthService.handlePasswordResetRequest(user, "reset-token-123");

			expect(sendOAuthAccountNotificationEmail).toHaveBeenCalledWith("test@example.com");
			expect(sendPasswordResetEmail).not.toHaveBeenCalled();
			expect(mockRecordPasswordResetEmail).toHaveBeenCalledWith("test@example.com");
		});
	});
});
