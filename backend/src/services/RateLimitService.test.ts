import type { CacheClient } from "./CacheService";
import { RATE_LIMIT_CONFIGS, RateLimitService } from "./RateLimitService";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock CacheService
vi.mock("./CacheService", () => ({
	getCache: vi.fn(),
}));

describe("RateLimitService", () => {
	let service: RateLimitService;
	let mockCache: {
		get: Mock;
		set: Mock;
		incr: Mock;
		expire: Mock;
		del: Mock;
		ttl: Mock;
	};

	beforeEach(async () => {
		// Create mock cache client
		mockCache = {
			get: vi.fn(),
			set: vi.fn(),
			incr: vi.fn(),
			expire: vi.fn(),
			del: vi.fn(),
			ttl: vi.fn(),
		};

		// Mock getCache to return our mock client
		const { getCache } = await import("./CacheService");
		vi.mocked(getCache).mockReturnValue(mockCache as unknown as CacheClient);

		service = new RateLimitService();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("checkRateLimit", () => {
		it("should allow action when under limit", async () => {
			mockCache.get.mockResolvedValue("2");
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.checkRateLimit(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.allowed).toBe(true);
			expect(result.current).toBe(2);
			expect(result.limit).toBe(3);
			expect(result.remaining).toBe(1);
			expect(result.resetInSeconds).toBe(3000);
		});

		it("should deny action when at limit", async () => {
			mockCache.get.mockResolvedValue("3");
			mockCache.ttl.mockResolvedValue(1800);

			const result = await service.checkRateLimit(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(3);
			expect(result.remaining).toBe(0);
		});

		it("should handle first attempt (no existing key)", async () => {
			mockCache.get.mockResolvedValue(null);
			mockCache.ttl.mockResolvedValue(-2); // Key doesn't exist

			const result = await service.checkRateLimit(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.allowed).toBe(true);
			expect(result.current).toBe(0);
			expect(result.remaining).toBe(3);
			expect(result.resetInSeconds).toBe(3600);
		});
	});

	describe("incrementAndCheck", () => {
		it("should increment counter and set expiration on first attempt", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(3600);

			const result = await service.incrementAndCheck(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(mockCache.incr).toHaveBeenCalledWith("rate:password_reset:test@example.com");
			expect(mockCache.expire).toHaveBeenCalledWith("rate:password_reset:test@example.com", 3600);
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(1);
			expect(result.remaining).toBe(2);
		});

		it("should not set expiration on subsequent attempts", async () => {
			mockCache.incr.mockResolvedValue(2);
			mockCache.ttl.mockResolvedValue(3000);

			await service.incrementAndCheck(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(mockCache.incr).toHaveBeenCalled();
			expect(mockCache.expire).not.toHaveBeenCalled();
		});

		it("should deny when limit is exceeded", async () => {
			mockCache.incr.mockResolvedValue(4);
			mockCache.ttl.mockResolvedValue(2000);

			const result = await service.incrementAndCheck(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(4);
			expect(result.remaining).toBe(0);
		});

		it("should use default TTL when key has no expiration in incrementAndCheck", async () => {
			mockCache.incr.mockResolvedValue(2);
			mockCache.ttl.mockResolvedValue(-1); // No expiration

			const result = await service.incrementAndCheck(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.resetInSeconds).toBe(3600); // Default window
		});

		it("should use default TTL when key does not exist in incrementAndCheck", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(-2); // Key doesn't exist

			const result = await service.incrementAndCheck(
				"password_reset",
				"test@example.com",
				RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET,
			);

			expect(result.resetInSeconds).toBe(3600); // Default window
		});
	});

	describe("resetRateLimit", () => {
		it("should delete the rate limit key", async () => {
			mockCache.del.mockResolvedValue(1);

			await service.resetRateLimit("password_reset", "test@example.com");

			expect(mockCache.del).toHaveBeenCalledWith("rate:password_reset:test@example.com");
		});
	});

	describe("checkEmailLimit (generic)", () => {
		it("should check email limit with custom config", async () => {
			mockCache.get.mockResolvedValue("2");
			mockCache.ttl.mockResolvedValue(1800);

			const result = await service.checkEmailLimit("custom_type", "user@example.com", {
				maxAttempts: 10,
				windowSeconds: 7200,
				resourceName: "custom email",
			});

			expect(mockCache.get).toHaveBeenCalledWith("email:sent:custom_type:user@example.com");
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(2);
			expect(result.limit).toBe(10);
			expect(result.remaining).toBe(8);
		});
	});

	describe("recordEmailSent (generic)", () => {
		it("should record email sent with custom config", async () => {
			mockCache.incr.mockResolvedValue(3);
			mockCache.ttl.mockResolvedValue(5000);

			const result = await service.recordEmailSent("custom_type", "user@example.com", {
				maxAttempts: 10,
				windowSeconds: 7200,
				resourceName: "custom email",
			});

			expect(mockCache.incr).toHaveBeenCalledWith("email:sent:custom_type:user@example.com");
			expect(result.current).toBe(3);
			expect(result.remaining).toBe(7);
		});

		it("should set expiration on first email sent", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(7200);

			await service.recordEmailSent("custom_type", "user@example.com", {
				maxAttempts: 10,
				windowSeconds: 7200,
				resourceName: "custom email",
			});

			expect(mockCache.expire).toHaveBeenCalledWith("email:sent:custom_type:user@example.com", 7200);
		});
	});

	describe("Password reset email rate limiting", () => {
		it("should check password reset email limit", async () => {
			mockCache.get.mockResolvedValue("1");
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.checkPasswordResetEmailLimit("test@example.com");

			expect(mockCache.get).toHaveBeenCalledWith("email:sent:password_reset:test@example.com");
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(3);
		});

		it("should handle null value when checking password reset limit", async () => {
			mockCache.get.mockResolvedValue(null);
			mockCache.ttl.mockResolvedValue(-2); // Key doesn't exist

			const result = await service.checkPasswordResetEmailLimit("test@example.com");

			expect(result.current).toBe(0);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(3);
			expect(result.resetInSeconds).toBe(3600); // Default window
		});

		it("should use default TTL when checking email with no expiration", async () => {
			mockCache.get.mockResolvedValue("2");
			mockCache.ttl.mockResolvedValue(-1); // No expiration

			const result = await service.checkPasswordResetEmailLimit("test@example.com");

			expect(result.resetInSeconds).toBe(3600); // Default window
		});

		it("should record password reset email with correct key", async () => {
			mockCache.incr.mockResolvedValue(2);
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.recordPasswordResetEmail("test@example.com");

			expect(mockCache.incr).toHaveBeenCalledWith("email:sent:password_reset:test@example.com");
			expect(result.current).toBe(2);
		});

		it("should set expiration on first password reset email", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(3600);

			const result = await service.recordPasswordResetEmail("test@example.com");

			expect(mockCache.incr).toHaveBeenCalledWith("email:sent:password_reset:test@example.com");
			expect(mockCache.expire).toHaveBeenCalledWith("email:sent:password_reset:test@example.com", 3600);
			expect(result.allowed).toBe(true);
			expect(result.current).toBe(1);
			expect(result.remaining).toBe(2);
		});

		it("should not set expiration on subsequent password reset emails", async () => {
			mockCache.incr.mockResolvedValue(2);
			mockCache.ttl.mockResolvedValue(3000);

			await service.recordPasswordResetEmail("test@example.com");

			expect(mockCache.incr).toHaveBeenCalled();
			expect(mockCache.expire).not.toHaveBeenCalled();
		});

		it("should use default TTL when key has no expiration", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(-1); // No expiration

			const result = await service.recordPasswordResetEmail("test@example.com");

			expect(result.resetInSeconds).toBe(3600); // Default window
		});
	});

	describe("Verification email rate limiting", () => {
		it("should check verification email limit", async () => {
			mockCache.get.mockResolvedValue("2");
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.checkVerificationEmailLimit("test@example.com");

			expect(mockCache.get).toHaveBeenCalledWith("email:sent:verification:test@example.com");
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(5);
		});

		it("should record verification email with correct key", async () => {
			mockCache.incr.mockResolvedValue(3);
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.recordVerificationEmail("test@example.com");

			expect(mockCache.incr).toHaveBeenCalledWith("email:sent:verification:test@example.com");
			expect(result.current).toBe(3);
		});

		it("should set expiration on first verification email", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(3600);

			const result = await service.recordVerificationEmail("test@example.com");

			expect(mockCache.expire).toHaveBeenCalledWith("email:sent:verification:test@example.com", 3600);
			expect(result.current).toBe(1);
		});

		it("should deny when verification email limit exceeded", async () => {
			mockCache.get.mockResolvedValue("5");
			mockCache.ttl.mockResolvedValue(2000);

			const result = await service.checkVerificationEmailLimit("test@example.com");

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(5);
			expect(result.remaining).toBe(0);
		});
	});

	describe("Invitation email rate limiting", () => {
		it("should check invitation email limit", async () => {
			mockCache.get.mockResolvedValue("1");
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.checkInvitationEmailLimit("test@example.com");

			expect(mockCache.get).toHaveBeenCalledWith("email:sent:invitation:test@example.com");
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(3);
		});

		it("should record invitation email with correct key", async () => {
			mockCache.incr.mockResolvedValue(2);
			mockCache.ttl.mockResolvedValue(3000);

			const result = await service.recordInvitationEmail("test@example.com");

			expect(mockCache.incr).toHaveBeenCalledWith("email:sent:invitation:test@example.com");
			expect(result.current).toBe(2);
		});

		it("should set expiration on first invitation email", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(3600);

			const result = await service.recordInvitationEmail("test@example.com");

			expect(mockCache.expire).toHaveBeenCalledWith("email:sent:invitation:test@example.com", 3600);
			expect(result.current).toBe(1);
		});

		it("should deny when invitation email limit exceeded", async () => {
			mockCache.incr.mockResolvedValue(4);
			mockCache.ttl.mockResolvedValue(2500);

			const result = await service.recordInvitationEmail("test@example.com");

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(4);
			expect(result.remaining).toBe(0);
		});
	});

	describe("Login rate limiting", () => {
		it("should check login rate by IP", async () => {
			mockCache.get.mockResolvedValue("5");
			mockCache.ttl.mockResolvedValue(30);

			const result = await service.checkLoginRateByIP("192.168.1.1");

			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(10);
		});

		it("should record login attempt by IP", async () => {
			mockCache.incr.mockResolvedValue(6);
			mockCache.ttl.mockResolvedValue(30);

			const result = await service.recordLoginAttemptByIP("192.168.1.1");

			expect(mockCache.incr).toHaveBeenCalledWith("rate:login_ip:192.168.1.1");
			expect(result.current).toBe(6);
		});

		it("should deny when IP login rate limit exceeded", async () => {
			mockCache.incr.mockResolvedValue(11);
			mockCache.ttl.mockResolvedValue(40);

			const result = await service.recordLoginAttemptByIP("192.168.1.1");

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(11);
			expect(result.remaining).toBe(0);
		});

		it("should set expiration on first login attempt by IP", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(60);

			const result = await service.recordLoginAttemptByIP("192.168.1.1");

			expect(mockCache.expire).toHaveBeenCalledWith("rate:login_ip:192.168.1.1", 60);
			expect(result.current).toBe(1);
		});

		it("should check login rate by account", async () => {
			mockCache.get.mockResolvedValue("2");
			mockCache.ttl.mockResolvedValue(200);

			const result = await service.checkLoginRateByAccount("test@example.com");

			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(5);
		});

		it("should record login attempt by account", async () => {
			mockCache.incr.mockResolvedValue(3);
			mockCache.ttl.mockResolvedValue(200);

			const result = await service.recordLoginAttemptByAccount("test@example.com");

			expect(result.current).toBe(3);
		});

		it("should deny when account login rate limit exceeded", async () => {
			mockCache.incr.mockResolvedValue(6);
			mockCache.ttl.mockResolvedValue(150);

			const result = await service.recordLoginAttemptByAccount("test@example.com");

			expect(result.allowed).toBe(false);
			expect(result.current).toBe(6);
			expect(result.remaining).toBe(0);
		});

		it("should set expiration on first login attempt by account", async () => {
			mockCache.incr.mockResolvedValue(1);
			mockCache.ttl.mockResolvedValue(300);

			const result = await service.recordLoginAttemptByAccount("test@example.com");

			expect(mockCache.expire).toHaveBeenCalledWith("rate:login_account:test@example.com", 300);
			expect(result.current).toBe(1);
		});
	});

	describe("formatResetTime", () => {
		it("should format seconds correctly", () => {
			expect(service.formatResetTime(1)).toBe("1 second");
			expect(service.formatResetTime(30)).toBe("30 seconds");
		});

		it("should format minutes correctly", () => {
			expect(service.formatResetTime(60)).toBe("1 minute");
			expect(service.formatResetTime(120)).toBe("2 minutes");
			expect(service.formatResetTime(90)).toBe("2 minutes");
		});

		it("should format hours correctly", () => {
			expect(service.formatResetTime(3600)).toBe("1 hour");
			expect(service.formatResetTime(7200)).toBe("2 hours");
			expect(service.formatResetTime(5400)).toBe("2 hours");
		});

		it("should handle zero seconds", () => {
			expect(service.formatResetTime(0)).toBe("0 seconds");
		});
	});

	describe("createRateLimitError", () => {
		it("should create error message with remaining time", () => {
			const result = {
				allowed: false,
				current: 4,
				limit: 3,
				remaining: 0,
				resetInSeconds: 1800,
			};

			const message = service.createRateLimitError(result, RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET);

			expect(message).toBe("Too many password reset email requests. Please try again in 30 minutes.");
		});
	});

	describe("Redis key naming", () => {
		it("should generate correct key names using private key functions", () => {
			// Access private keys property to test key generation
			// biome-ignore lint/suspicious/noExplicitAny: Accessing private property for testing
			const keys = (service as any).keys;

			expect(keys.session("abc123")).toBe("session:abc123");
			expect(keys.loginAttempts("user@example.com")).toBe("login:attempts:user@example.com");
			expect(keys.loginLocked("user@example.com")).toBe("login:locked:user@example.com");
			expect(keys.emailSent("user@example.com", "password_reset")).toBe(
				"email:sent:password_reset:user@example.com",
			);
			expect(keys.rateLimit("login_ip", "192.168.1.1")).toBe("rate:login_ip:192.168.1.1");
		});
	});
});
