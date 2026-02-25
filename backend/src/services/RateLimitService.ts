import { type CacheClient, getCache } from "./CacheService.js";

/**
 * Rate limit configuration for different resource types
 */
export interface RateLimitConfig {
	/** Maximum number of attempts allowed */
	maxAttempts: number;
	/** Time window in seconds */
	windowSeconds: number;
	/** Human-readable name for error messages */
	resourceName: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
	/** Whether the action is allowed */
	allowed: boolean;
	/** Current attempt count */
	current: number;
	/** Maximum allowed attempts */
	limit: number;
	/** Remaining attempts (0 if rate limited) */
	remaining: number;
	/** Time in seconds until the rate limit resets */
	resetInSeconds: number;
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
	// Email rate limits (per hour)
	EMAIL_PASSWORD_RESET: {
		maxAttempts: 3,
		windowSeconds: 3600, // 1 hour
		resourceName: "password reset email",
	},
	EMAIL_VERIFICATION: {
		maxAttempts: 5,
		windowSeconds: 3600, // 1 hour
		resourceName: "verification email",
	},
	EMAIL_INVITATION: {
		maxAttempts: 3,
		windowSeconds: 3600, // 1 hour
		resourceName: "invitation email",
	},

	// Login rate limits (per minute)
	LOGIN_IP: {
		maxAttempts: 10,
		windowSeconds: 60, // 1 minute
		resourceName: "login",
	},
	LOGIN_ACCOUNT: {
		maxAttempts: 5,
		windowSeconds: 300, // 5 minutes
		resourceName: "login",
	},

	// API rate limits (per minute)
	API_GENERAL: {
		maxAttempts: 60,
		windowSeconds: 60, // 1 minute
		resourceName: "API request",
	},
} as const;

/**
 * Unified rate limiting service for all rate limit needs
 * Supports email rate limiting, login rate limiting, API rate limiting, etc.
 */
export class RateLimitService {
	private cache: CacheClient;

	// Redis key naming functions
	private keys = {
		// Session storage
		session: (sessionId: string) => `session:${sessionId}`,

		// Account locking (for login failures)
		loginAttempts: (identifier: string) => `login:attempts:${identifier}`,
		loginLocked: (identifier: string) => `login:locked:${identifier}`,

		// Email rate limiting
		emailSent: (email: string, type: string) => `email:sent:${type}:${email}`,

		// Generic rate limiting
		rateLimit: (resource: string, identifier: string) => `rate:${resource}:${identifier}`,
	};

	constructor() {
		this.cache = getCache();
	}

	/**
	 * Check if a rate limit would be exceeded
	 * @param resource - The resource type (e.g., 'password_reset', 'login', 'api')
	 * @param identifier - Unique identifier (e.g., email, IP address, user ID)
	 * @param config - Rate limit configuration
	 * @returns Rate limit check result
	 */
	async checkRateLimit(resource: string, identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
		const key = this.keys.rateLimit(resource, identifier);

		// Get current count
		const currentStr = await this.cache.get(key);
		const current = currentStr ? Number.parseInt(currentStr, 10) : 0;

		// Get TTL
		const ttl = await this.cache.ttl(key);
		const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

		const allowed = current < config.maxAttempts;
		const remaining = Math.max(0, config.maxAttempts - current);

		return {
			allowed,
			current,
			limit: config.maxAttempts,
			remaining,
			resetInSeconds,
		};
	}

	/**
	 * Increment rate limit counter and check if limit is exceeded
	 * @param resource - The resource type
	 * @param identifier - Unique identifier
	 * @param config - Rate limit configuration
	 * @returns Rate limit check result after incrementing
	 */
	async incrementAndCheck(resource: string, identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
		const key = this.keys.rateLimit(resource, identifier);

		// Increment counter
		const current = await this.cache.incr(key);

		// Set expiration on first attempt
		if (current === 1) {
			await this.cache.expire(key, config.windowSeconds);
		}

		// Get TTL
		const ttl = await this.cache.ttl(key);
		const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

		const allowed = current <= config.maxAttempts;
		const remaining = Math.max(0, config.maxAttempts - current);

		return {
			allowed,
			current,
			limit: config.maxAttempts,
			remaining,
			resetInSeconds,
		};
	}

	/**
	 * Reset rate limit counter for a resource
	 */
	async resetRateLimit(resource: string, identifier: string): Promise<void> {
		const key = this.keys.rateLimit(resource, identifier);
		await this.cache.del(key);
	}

	/**
	 * Check if an email can be sent (generic email rate limit check)
	 * @param emailType - Type of email (e.g., 'password_reset', 'verification', 'invitation')
	 * @param email - User email address
	 * @param config - Rate limit configuration
	 * @returns Rate limit check result
	 */
	async checkEmailLimit(emailType: string, email: string, config: RateLimitConfig): Promise<RateLimitResult> {
		const key = this.keys.emailSent(email, emailType);

		// Get current count
		const currentStr = await this.cache.get(key);
		const current = currentStr ? Number.parseInt(currentStr, 10) : 0;

		// Get TTL
		const ttl = await this.cache.ttl(key);
		const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

		const allowed = current < config.maxAttempts;
		const remaining = Math.max(0, config.maxAttempts - current);

		return {
			allowed,
			current,
			limit: config.maxAttempts,
			remaining,
			resetInSeconds,
		};
	}

	/**
	 * Record an email sent and check rate limit
	 * @param emailType - Type of email
	 * @param email - User email address
	 * @param config - Rate limit configuration
	 * @returns Rate limit check result after recording
	 */
	async recordEmailSent(emailType: string, email: string, config: RateLimitConfig): Promise<RateLimitResult> {
		const key = this.keys.emailSent(email, emailType);

		// Increment counter
		const current = await this.cache.incr(key);

		// Set expiration on first attempt
		if (current === 1) {
			await this.cache.expire(key, config.windowSeconds);
		}

		// Get TTL
		const ttl = await this.cache.ttl(key);
		const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

		const allowed = current <= config.maxAttempts;
		const remaining = Math.max(0, config.maxAttempts - current);

		return {
			allowed,
			current,
			limit: config.maxAttempts,
			remaining,
			resetInSeconds,
		};
	}

	/**
	 * Check if password reset email can be sent
	 * @param email - User email address
	 * @returns Rate limit check result
	 */
	checkPasswordResetEmailLimit(email: string): Promise<RateLimitResult> {
		return this.checkEmailLimit("password_reset", email, RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET);
	}

	/**
	 * Record a password reset email sent
	 * @param email - User email address
	 * @returns Rate limit check result after recording
	 */
	recordPasswordResetEmail(email: string): Promise<RateLimitResult> {
		return this.recordEmailSent("password_reset", email, RATE_LIMIT_CONFIGS.EMAIL_PASSWORD_RESET);
	}

	/**
	 * Check if verification email can be sent
	 */
	checkVerificationEmailLimit(email: string): Promise<RateLimitResult> {
		return this.checkEmailLimit("verification", email, RATE_LIMIT_CONFIGS.EMAIL_VERIFICATION);
	}

	/**
	 * Record a verification email sent
	 */
	recordVerificationEmail(email: string): Promise<RateLimitResult> {
		return this.recordEmailSent("verification", email, RATE_LIMIT_CONFIGS.EMAIL_VERIFICATION);
	}

	/**
	 * Check if invitation email can be sent
	 */
	checkInvitationEmailLimit(email: string): Promise<RateLimitResult> {
		return this.checkEmailLimit("invitation", email, RATE_LIMIT_CONFIGS.EMAIL_INVITATION);
	}

	/**
	 * Record an invitation email sent
	 */
	recordInvitationEmail(email: string): Promise<RateLimitResult> {
		return this.recordEmailSent("invitation", email, RATE_LIMIT_CONFIGS.EMAIL_INVITATION);
	}

	/**
	 * Check IP-based login rate limit
	 */
	checkLoginRateByIP(ip: string): Promise<RateLimitResult> {
		return this.checkRateLimit("login_ip", ip, RATE_LIMIT_CONFIGS.LOGIN_IP);
	}

	/**
	 * Record a login attempt by IP
	 */
	recordLoginAttemptByIP(ip: string): Promise<RateLimitResult> {
		return this.incrementAndCheck("login_ip", ip, RATE_LIMIT_CONFIGS.LOGIN_IP);
	}

	/**
	 * Check account-based login rate limit
	 */
	checkLoginRateByAccount(email: string): Promise<RateLimitResult> {
		return this.checkRateLimit("login_account", email, RATE_LIMIT_CONFIGS.LOGIN_ACCOUNT);
	}

	/**
	 * Record a login attempt by account
	 */
	recordLoginAttemptByAccount(email: string): Promise<RateLimitResult> {
		return this.incrementAndCheck("login_account", email, RATE_LIMIT_CONFIGS.LOGIN_ACCOUNT);
	}

	/**
	 * Format remaining time as a human-readable string
	 */
	formatResetTime(seconds: number): string {
		if (seconds < 60) {
			return `${seconds} second${seconds !== 1 ? "s" : ""}`;
		}
		const minutes = Math.ceil(seconds / 60);
		if (minutes < 60) {
			return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
		}
		const hours = Math.ceil(minutes / 60);
		return `${hours} hour${hours !== 1 ? "s" : ""}`;
	}

	/**
	 * Create a rate limit error message
	 */
	createRateLimitError(result: RateLimitResult, config: RateLimitConfig): string {
		const timeRemaining = this.formatResetTime(result.resetInSeconds);
		return `Too many ${config.resourceName} requests. Please try again in ${timeRemaining}.`;
	}
}
