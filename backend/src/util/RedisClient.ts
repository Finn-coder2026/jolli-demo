import { getLog } from "./Logger";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import Redis, { Cluster } from "ioredis";

const log = getLog(import.meta);

/**
 * Union type for Redis client - can be standalone or cluster mode
 */
export type RedisClientType = Redis | Cluster;

/**
 * Options for creating a Redis client
 */
export interface RedisClientOptions {
	/** Name for logging purposes (e.g., "session", "cache", "auth") */
	name: string;
	/** Maximum retries before giving up (0 = infinite, default: infinite) */
	maxRetries?: number;
}

/**
 * Default Redis connection options used across all clients.
 * These settings ensure reliable connections with automatic reconnection.
 */
const DEFAULT_REDIS_OPTIONS = {
	maxRetriesPerRequest: 3,
	enableReadyCheck: true,
	connectTimeout: 5000,
	lazyConnect: false,
	keepAlive: 30000, // Send keep-alive every 30 seconds to prevent idle disconnection
};

/**
 * Check if URL is a MemoryDB endpoint (contains .memorydb.)
 * MemoryDB endpoints have the format: clustername.xxx.memorydb.region.amazonaws.com
 */
function isMemoryDbEndpoint(url: string): boolean {
	return url.includes(".memorydb.");
}

/**
 * Check if URL has credentials (username or password)
 */
function hasCredentials(url: string): boolean {
	const parsed = new URL(url);
	return Boolean(parsed.username || parsed.password);
}

/**
 * Parse Redis URL to extract host, port, and determine if IAM auth is needed.
 * IAM auth is only used for MemoryDB endpoints that don't have credentials in the URL.
 * If credentials are provided in the URL, standard password auth is used.
 */
function parseRedisUrl(url: string): { host: string; port: number; useIamAuth: boolean } {
	const parsed = new URL(url);
	const isMemoryDb = isMemoryDbEndpoint(url);
	const hasAuth = hasCredentials(url);

	return {
		host: parsed.hostname,
		port: Number.parseInt(parsed.port || "6379", 10),
		// Only use IAM auth for MemoryDB endpoints WITHOUT credentials in URL
		useIamAuth: isMemoryDb && !hasAuth,
	};
}

/**
 * Generate IAM auth token for MemoryDB.
 * Token is valid for 15 minutes.
 *
 * @param host - MemoryDB cluster endpoint hostname
 * @param region - AWS region
 * @param userId - MemoryDB user ID (default "iam-user")
 * @returns Presigned auth token for MemoryDB authentication
 */
async function generateMemoryDbAuthToken(host: string, region: string, userId: string): Promise<string> {
	const credentials = await defaultProvider()();

	const signer = new SignatureV4({
		credentials,
		region,
		service: "memorydb",
		sha256: Sha256,
	});

	const request = new HttpRequest({
		method: "GET",
		protocol: "http:",
		hostname: host,
		path: "/",
		query: {
			Action: "connect",
			User: userId,
		},
		headers: {
			host,
		},
	});

	const presigned = await signer.presign(request, { expiresIn: 900 });

	// Build the auth token from the presigned request
	// MemoryDB IAM auth token format: host/?query_params (no port, no scheme)
	const queryParams = new URLSearchParams(presigned.query as Record<string, string>);
	return `${host}/?${queryParams.toString()}`;
}

/**
 * Creates a Redis client for MemoryDB with IAM authentication.
 *
 * @param host - MemoryDB cluster endpoint hostname
 * @param port - MemoryDB cluster port
 * @param options - Client options including name for logging
 * @returns Configured Redis client with IAM auth
 */
async function createMemoryDbClient(host: string, port: number, options: RedisClientOptions): Promise<Redis> {
	const { name, maxRetries } = options;
	const region = process.env.AWS_REGION || "us-west-2";

	// Extract IAM user name from environment - matches CDK stack naming convention
	// Default format: jolli-iam-user-{environment}
	const environment = process.env.PSTORE_ENV || "dev";
	const userId = `jolli-iam-user-${environment}`;

	log.info({ name, host, port, region, userId }, "Connecting to MemoryDB with IAM auth");

	// Generate initial auth token
	const authToken = await generateMemoryDbAuthToken(host, region, userId);

	const client = new Redis({
		...DEFAULT_REDIS_OPTIONS,
		host,
		port,
		tls: {}, // TLS required for MemoryDB with IAM auth
		username: userId,
		password: authToken,
		retryStrategy: times => {
			if (maxRetries !== undefined && maxRetries > 0 && times > maxRetries) {
				log.warn({ name, attempts: times }, "MemoryDB max retries exceeded, giving up");
				return null;
			}
			const delay = Math.min(times * 50, 2000);
			log.info({ name, attempt: times, delayMs: delay }, "MemoryDB reconnecting");
			return delay;
		},
	});

	// Refresh auth token before expiry (every 10 minutes)
	// IAM tokens are valid for 15 minutes, so 10 minutes provides safety margin
	const refreshInterval = setInterval(
		async () => {
			try {
				const newToken = await generateMemoryDbAuthToken(host, region, userId);
				// Update the password for future reconnections
				// Note: ioredis uses this password on reconnect
				client.options.password = newToken;
				log.debug({ name }, "Refreshed MemoryDB auth token");
			} catch (error) {
				log.error({ name, error }, "Failed to refresh MemoryDB auth token");
			}
		},
		10 * 60 * 1000,
	);

	// Clean up refresh interval on client close
	client.on("close", () => {
		clearInterval(refreshInterval);
		log.debug({ name }, "MemoryDB connection closed, stopped token refresh");
	});

	// Handle Redis errors to prevent unhandled promise rejections
	client.on("error", err => {
		log.warn({ name, err: err.message }, "MemoryDB connection error (non-fatal)");
	});

	client.on("connect", () => {
		log.info({ name }, "MemoryDB connected");
	});

	client.on("reconnecting", () => {
		log.debug({ name }, "MemoryDB reconnecting");
	});

	return client;
}

/**
 * Creates a standard Redis client with password authentication (standalone mode).
 * Used for non-MemoryDB Redis instances like Stackhero or local Redis.
 * TLS is automatically enabled for rediss:// URLs.
 *
 * @param redisUrl - Redis connection URL
 * @param options - Client options including name for logging
 * @returns Configured Redis client in standalone mode
 */
function createStandaloneRedisClient(redisUrl: string, options: RedisClientOptions): Redis {
	const { name, maxRetries } = options;

	log.info({ name }, "Connecting to Redis (standalone mode) with password auth");

	const client = new Redis(redisUrl, {
		...DEFAULT_REDIS_OPTIONS,
		retryStrategy: times => {
			// If maxRetries is set and exceeded, stop retrying
			if (maxRetries !== undefined && maxRetries > 0 && times > maxRetries) {
				log.warn({ name, attempts: times }, "Redis max retries exceeded, giving up");
				return null;
			}
			// Exponential backoff: 50ms, 100ms, 200ms, ... up to 2 seconds
			const delay = Math.min(times * 50, 2000);
			log.info({ name, attempt: times, delayMs: delay }, "Redis reconnecting");
			return delay;
		},
	});

	// Handle Redis errors to prevent unhandled promise rejections
	client.on("error", err => {
		log.warn({ name, err: err.message }, "Redis connection error (non-fatal)");
	});

	client.on("connect", () => {
		log.info({ name }, "Redis connected");
	});

	client.on("close", () => {
		log.debug({ name }, "Redis connection closed");
	});

	client.on("reconnecting", () => {
		log.debug({ name }, "Redis reconnecting");
	});

	return client;
}

/**
 * Creates a Redis cluster client for MemoryDB with password authentication.
 * MemoryDB operates in cluster mode even with a single shard, so we must use
 * Cluster to handle MOVED redirects properly.
 *
 * @param redisUrl - Redis connection URL (rediss://user:pass@host:port)
 * @param options - Client options including name for logging
 * @returns Configured Redis cluster client
 */
function createMemoryDbClusterClient(redisUrl: string, options: RedisClientOptions): Cluster {
	const { name, maxRetries } = options;
	const parsed = new URL(redisUrl);
	const host = parsed.hostname;
	const port = Number.parseInt(parsed.port || "6379", 10);
	const username = parsed.username || "";
	const password = parsed.password || "";
	const useTls = parsed.protocol === "rediss:";

	log.info({ name, host, port, useTls }, "Connecting to MemoryDB (cluster mode) with password auth");

	const client = new Cluster([{ host, port }], {
		// MemoryDB requires TLS for password auth
		dnsLookup: (address, callback) => callback(null, address),
		redisOptions: {
			...DEFAULT_REDIS_OPTIONS,
			...(username ? { username } : {}),
			...(password ? { password } : {}),
			...(useTls ? { tls: {} } : {}),
		},
		// Cluster-specific options
		clusterRetryStrategy: times => {
			if (maxRetries !== undefined && maxRetries > 0 && times > maxRetries) {
				log.warn({ name, attempts: times }, "MemoryDB cluster max retries exceeded, giving up");
				return null;
			}
			const delay = Math.min(times * 50, 2000);
			log.info({ name, attempt: times, delayMs: delay }, "MemoryDB cluster reconnecting");
			return delay;
		},
		// Enable read from replicas for better performance
		scaleReads: "slave",
		// Use the natural slot distribution
		slotsRefreshTimeout: 5000,
		slotsRefreshInterval: 10000,
	});

	// Handle cluster errors
	client.on("error", err => {
		log.warn({ name, err: err.message }, "MemoryDB cluster error (non-fatal)");
	});

	client.on("connect", () => {
		log.info({ name }, "MemoryDB cluster connected");
	});

	client.on("close", () => {
		log.debug({ name }, "MemoryDB cluster connection closed");
	});

	client.on("reconnecting", () => {
		log.debug({ name }, "MemoryDB cluster reconnecting");
	});

	client.on("+node", node => {
		log.debug({ name, node: node.options?.host }, "MemoryDB cluster node added");
	});

	client.on("-node", node => {
		log.debug({ name, node: node.options?.host }, "MemoryDB cluster node removed");
	});

	return client;
}

/**
 * Creates a Redis client with standardized configuration.
 *
 * Connection mode is determined by the endpoint:
 * - MemoryDB endpoints (.memorydb.) use cluster mode (handles MOVED redirects)
 * - Standard Redis endpoints use standalone mode
 *
 * Authentication method is determined by the URL:
 * - If the URL contains credentials (username/password), uses password authentication
 * - For MemoryDB endpoints without credentials, uses IAM authentication (experimental)
 *
 * For MemoryDB with password auth, use rediss:// (TLS) with credentials in the URL.
 *
 * @param redisUrl - Redis connection URL (e.g., redis://host:port or rediss://host:port for TLS)
 * @param options - Client options including name for logging
 * @returns Configured Redis client (cluster mode for MemoryDB, standalone for others)
 *
 * @example
 * ```typescript
 * // Standard Redis (Stackhero, local, etc.) - standalone mode
 * const client = await createRedisClient("redis://user:pass@host:6379", { name: "cache" });
 *
 * // MemoryDB with password auth (recommended) - cluster mode
 * const client = await createRedisClient("rediss://user:pass@cluster.xxx.memorydb.us-west-2.amazonaws.com:6379", { name: "cache" });
 *
 * // MemoryDB with IAM auth (experimental) - cluster mode
 * const client = await createRedisClient("rediss://cluster.xxx.memorydb.us-west-2.amazonaws.com:6379", { name: "cache" });
 * ```
 */
// biome-ignore lint/suspicious/useAwait: Function is async for MemoryDB IAM auth path; standard Redis path is sync but API must be consistent
export async function createRedisClient(redisUrl: string, options: RedisClientOptions): Promise<RedisClientType> {
	const { host, port, useIamAuth } = parseRedisUrl(redisUrl);
	const isMemoryDb = isMemoryDbEndpoint(redisUrl);

	// MemoryDB requires cluster mode to handle MOVED redirects
	if (isMemoryDb) {
		if (useIamAuth) {
			// IAM auth path - returns cluster client
			return createMemoryDbClient(host, port, options);
		}
		// Password auth path for MemoryDB - use cluster mode
		return createMemoryDbClusterClient(redisUrl, options);
	}

	// Standard Redis - use standalone mode
	return createStandaloneRedisClient(redisUrl, options);
}

/**
 * Tests a Redis connection with a timeout.
 * Works with both standalone Redis and Redis.Cluster clients.
 *
 * @param client - Redis client (standalone or cluster) to test
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns Promise that resolves if connection succeeds, rejects on timeout or error
 */
export async function testRedisConnection(client: RedisClientType, timeoutMs = 5000): Promise<void> {
	let timeoutId: NodeJS.Timeout;
	await Promise.race([
		client.ping().finally(() => clearTimeout(timeoutId)),
		new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error("Redis connection timeout")), timeoutMs);
		}),
	]);
}

/**
 * Creates a Redis client and verifies the connection. If the connection test
 * fails, the client is disconnected to prevent resource leaks (retry timers,
 * open sockets) and the error is re-thrown.
 *
 * Use this instead of calling createRedisClient + testRedisConnection separately.
 *
 * @param redisUrl - Redis connection URL
 * @param options - Client options including name for logging
 * @returns Verified Redis client ready for use
 * @throws Error if connection fails (client is cleaned up before throwing)
 */
export async function connectRedis(redisUrl: string, options: RedisClientOptions): Promise<RedisClientType> {
	const client = await createRedisClient(redisUrl, options);
	try {
		await testRedisConnection(client);
		return client;
	} catch (error) {
		client.disconnect();
		throw error;
	}
}
