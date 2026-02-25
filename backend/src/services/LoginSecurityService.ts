import { getConfig } from "../config/Config.js";
import { type CacheClient, getCache } from "./CacheService.js";

/**
 * Service for login security features (account locking, rate limiting)
 */
export class LoginSecurityService {
	private cache: CacheClient;
	private maxAttempts: number;
	private lockDurationMinutes: number;
	private rateLimitPerMinute: number;

	// Redis key naming functions
	private keys = {
		session: (sessionId: string) => `session:${sessionId}`,
		loginAttempts: (identifier: string) => `login:attempts:${identifier}`,
		loginLocked: (identifier: string) => `login:locked:${identifier}`,
		loginRate: (ip: string) => `login:rate:${ip}`,
	};

	constructor() {
		this.cache = getCache();
		const config = getConfig();
		this.maxAttempts = config.LOGIN_MAX_ATTEMPTS;
		this.lockDurationMinutes = config.LOGIN_LOCK_DURATION_MINUTES;
		this.rateLimitPerMinute = config.LOGIN_RATE_LIMIT_PER_MINUTE;
	}

	/**
	 * Check if an account is locked
	 */
	async isAccountLocked(email: string): Promise<boolean> {
		const lockKey = this.keys.loginLocked(email);
		const locked = await this.cache.get(lockKey);
		return locked === "1";
	}

	/**
	 * Check IP-based rate limiting
	 */
	async checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingAttempts: number }> {
		const rateKey = this.keys.loginRate(ip);
		const current = await this.cache.incr(rateKey);

		if (current === 1) {
			// First attempt, set expiration to 60 seconds
			await this.cache.expire(rateKey, 60);
		}

		return {
			allowed: current <= this.rateLimitPerMinute,
			remainingAttempts: Math.max(0, this.rateLimitPerMinute - current),
		};
	}

	/**
	 * Record a login failure and potentially lock the account
	 */
	async recordLoginFailure(email: string): Promise<{ failCount: number; isLocked: boolean }> {
		const attemptsKey = this.keys.loginAttempts(email);
		const lockKey = this.keys.loginLocked(email);
		const lockDurationSeconds = this.lockDurationMinutes * 60;

		const failCount = await this.cache.incr(attemptsKey);

		if (failCount === 1) {
			// First failure, set expiration
			await this.cache.expire(attemptsKey, lockDurationSeconds);
		}

		// Check if we should lock the account
		if (failCount >= this.maxAttempts) {
			await this.cache.setex(lockKey, lockDurationSeconds, "1");
			return { failCount, isLocked: true };
		}

		return { failCount, isLocked: false };
	}

	/**
	 * Clear login failure records (called after successful login)
	 */
	async clearLoginFailures(email: string): Promise<void> {
		const attemptsKey = this.keys.loginAttempts(email);
		await this.cache.del(attemptsKey);
	}

	/**
	 * Get remaining lock time in seconds
	 */
	async getRemainingLockTime(email: string): Promise<number> {
		const lockKey = this.keys.loginLocked(email);
		const ttl = await this.cache.ttl(lockKey);
		return ttl > 0 ? ttl : 0;
	}

	/**
	 * Get remaining attempts before account lockout
	 */
	async getRemainingAttempts(email: string): Promise<number> {
		const attemptsKey = this.keys.loginAttempts(email);
		const current = await this.cache.get(attemptsKey);
		const failCount = current ? Number.parseInt(current, 10) : 0;
		return Math.max(0, this.maxAttempts - failCount);
	}

	/**
	 * Static method: Perform pre-auth login security checks (rate limiting, account lockout)
	 * Returns a result indicating whether the request should be blocked
	 */
	static async performSecurityCheck(email: string, clientIp: string): Promise<LoginSecurityCheckResult> {
		const service = new LoginSecurityService();

		// Check IP-based rate limiting
		const rateLimit = await service.checkRateLimit(clientIp);
		if (!rateLimit.allowed) {
			return {
				blocked: true,
				statusCode: 429,
				response: { error: "rate_limit_exceeded", message: "Too many login attempts. Please try again later." },
			};
		}

		// Check account lockout
		const isLocked = await service.isAccountLocked(email);
		if (isLocked) {
			const remainingTime = await service.getRemainingLockTime(email);
			return {
				blocked: true,
				statusCode: 423,
				response: {
					error: "account_locked",
					message: `Account is temporarily locked. Try again in ${Math.ceil(remainingTime / 60)} minutes.`,
					remainingSeconds: remainingTime,
				},
			};
		}

		return { blocked: false };
	}

	/**
	 * Static method: Record login failure after unsuccessful authentication
	 */
	static async recordFailure(email: string): Promise<{ failCount: number; isLocked: boolean }> {
		const service = new LoginSecurityService();
		return await service.recordLoginFailure(email);
	}
}

/**
 * Result of a login security check
 */
export interface LoginSecurityCheckResult {
	blocked: boolean;
	statusCode?: number;
	response?: { error: string; message: string; remainingSeconds?: number };
}
