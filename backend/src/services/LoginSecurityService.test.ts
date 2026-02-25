import * as Config from "../config/Config";
import type { CacheClient } from "./CacheService";
import * as CacheService from "./CacheService";
import { LoginSecurityService } from "./LoginSecurityService";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./CacheService");
vi.mock("../config/Config");

describe("LoginSecurityService", () => {
	let mockCache: CacheClient;
	let loginSecurityService: LoginSecurityService;

	beforeEach(() => {
		mockCache = {
			get: vi.fn(),
			set: vi.fn(),
			incr: vi.fn(),
			expire: vi.fn(),
			setex: vi.fn(),
			del: vi.fn(),
			ttl: vi.fn(),
		} as unknown as CacheClient;

		vi.mocked(CacheService.getCache).mockReturnValue(mockCache);
		vi.mocked(Config.getConfig).mockReturnValue({
			LOGIN_MAX_ATTEMPTS: 5,
			LOGIN_LOCK_DURATION_MINUTES: 15,
			LOGIN_RATE_LIMIT_PER_MINUTE: 10,
		} as never);

		loginSecurityService = new LoginSecurityService();
	});

	describe("isAccountLocked", () => {
		it("should return true when account is locked", async () => {
			vi.mocked(mockCache.get).mockResolvedValue("1");

			const result = await loginSecurityService.isAccountLocked("test@example.com");

			expect(result).toBe(true);
			expect(mockCache.get).toHaveBeenCalledWith("login:locked:test@example.com");
		});

		it("should return false when account is not locked", async () => {
			vi.mocked(mockCache.get).mockResolvedValue(null);

			const result = await loginSecurityService.isAccountLocked("test@example.com");

			expect(result).toBe(false);
		});
	});

	describe("checkRateLimit", () => {
		it("should allow request on first attempt", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(1);

			const result = await loginSecurityService.checkRateLimit("192.168.1.1");

			expect(result.allowed).toBe(true);
			expect(result.remainingAttempts).toBe(9);
			expect(mockCache.incr).toHaveBeenCalledWith("login:rate:192.168.1.1");
			expect(mockCache.expire).toHaveBeenCalledWith("login:rate:192.168.1.1", 60);
		});

		it("should allow request when under limit", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(5);

			const result = await loginSecurityService.checkRateLimit("192.168.1.1");

			expect(result.allowed).toBe(true);
			expect(result.remainingAttempts).toBe(5);
		});

		it("should deny request when limit exceeded", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(11);

			const result = await loginSecurityService.checkRateLimit("192.168.1.1");

			expect(result.allowed).toBe(false);
			expect(result.remainingAttempts).toBe(0);
		});
	});

	describe("recordLoginFailure", () => {
		it("should record first failure and set expiration", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(1);

			const result = await loginSecurityService.recordLoginFailure("test@example.com");

			expect(result.failCount).toBe(1);
			expect(result.isLocked).toBe(false);
			expect(mockCache.incr).toHaveBeenCalledWith("login:attempts:test@example.com");
			expect(mockCache.expire).toHaveBeenCalledWith("login:attempts:test@example.com", 900);
		});

		it("should record failure without locking when under max attempts", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(3);

			const result = await loginSecurityService.recordLoginFailure("test@example.com");

			expect(result.failCount).toBe(3);
			expect(result.isLocked).toBe(false);
		});

		it("should lock account when max attempts reached", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(5);

			const result = await loginSecurityService.recordLoginFailure("test@example.com");

			expect(result.failCount).toBe(5);
			expect(result.isLocked).toBe(true);
			expect(mockCache.setex).toHaveBeenCalledWith("login:locked:test@example.com", 900, "1");
		});
	});

	describe("clearLoginFailures", () => {
		it("should delete attempts record", async () => {
			await loginSecurityService.clearLoginFailures("test@example.com");

			expect(mockCache.del).toHaveBeenCalledWith("login:attempts:test@example.com");
		});
	});

	describe("getRemainingLockTime", () => {
		it("should return remaining time when locked", async () => {
			vi.mocked(mockCache.ttl).mockResolvedValue(600);

			const result = await loginSecurityService.getRemainingLockTime("test@example.com");

			expect(result).toBe(600);
			expect(mockCache.ttl).toHaveBeenCalledWith("login:locked:test@example.com");
		});

		it("should return 0 when not locked", async () => {
			vi.mocked(mockCache.ttl).mockResolvedValue(-2);

			const result = await loginSecurityService.getRemainingLockTime("test@example.com");

			expect(result).toBe(0);
		});
	});

	describe("getRemainingAttempts", () => {
		it("should return remaining attempts when failures exist", async () => {
			vi.mocked(mockCache.get).mockResolvedValue("3");

			const result = await loginSecurityService.getRemainingAttempts("test@example.com");

			expect(result).toBe(2);
			expect(mockCache.get).toHaveBeenCalledWith("login:attempts:test@example.com");
		});

		it("should return max attempts when no failures", async () => {
			vi.mocked(mockCache.get).mockResolvedValue(null);

			const result = await loginSecurityService.getRemainingAttempts("test@example.com");

			expect(result).toBe(5);
		});
	});

	describe("performSecurityCheck (static)", () => {
		it("should return blocked with rate_limit_exceeded when rate limit exceeded", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(11);

			const result = await LoginSecurityService.performSecurityCheck("test@example.com", "192.168.1.1");

			expect(result.blocked).toBe(true);
			expect(result.statusCode).toBe(429);
			expect(result.response?.error).toBe("rate_limit_exceeded");
		});

		it("should return blocked with account_locked when account is locked", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(1); // Rate limit OK
			vi.mocked(mockCache.get).mockResolvedValue("1"); // Account locked
			vi.mocked(mockCache.ttl).mockResolvedValue(600); // 10 minutes remaining

			const result = await LoginSecurityService.performSecurityCheck("test@example.com", "192.168.1.1");

			expect(result.blocked).toBe(true);
			expect(result.statusCode).toBe(423);
			expect(result.response?.error).toBe("account_locked");
			expect(result.response?.remainingSeconds).toBe(600);
		});

		it("should return not blocked when all checks pass", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(1); // Rate limit OK
			vi.mocked(mockCache.get).mockResolvedValue(null); // Not locked

			const result = await LoginSecurityService.performSecurityCheck("test@example.com", "192.168.1.1");

			expect(result.blocked).toBe(false);
			expect(result.statusCode).toBeUndefined();
			expect(result.response).toBeUndefined();
		});
	});

	describe("recordFailure (static)", () => {
		it("should record failure and return result", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(3);

			const result = await LoginSecurityService.recordFailure("test@example.com");

			expect(result.failCount).toBe(3);
			expect(result.isLocked).toBe(false);
		});

		it("should record failure and indicate account locked when max reached", async () => {
			vi.mocked(mockCache.incr).mockResolvedValue(5);

			const result = await LoginSecurityService.recordFailure("test@example.com");

			expect(result.failCount).toBe(5);
			expect(result.isLocked).toBe(true);
		});
	});
});
