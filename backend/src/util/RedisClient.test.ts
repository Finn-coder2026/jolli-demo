import { connectRedis, createRedisClient, testRedisConnection } from "./RedisClient";
import Redis, { Cluster } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ioredis - both default export (Redis) and named export (Cluster)
vi.mock("ioredis", () => {
	const MockRedis = vi.fn();
	const MockCluster = vi.fn();
	return { default: MockRedis, Cluster: MockCluster };
});
vi.mock("@aws-sdk/credential-provider-node", () => ({
	defaultProvider: vi.fn(() => async () => ({
		accessKeyId: "test-access-key",
		secretAccessKey: "test-secret-key",
	})),
}));
vi.mock("@smithy/signature-v4", () => ({
	SignatureV4: vi.fn(() => ({
		presign: vi.fn().mockResolvedValue({
			path: "/",
			query: {
				Action: "connect",
				User: "test-user",
				"X-Amz-Algorithm": "AWS4-HMAC-SHA256",
				"X-Amz-Credential": "test-credential",
				"X-Amz-Date": "20240101T000000Z",
				"X-Amz-SignedHeaders": "host",
				"X-Amz-Signature": "test-signature",
			},
		}),
	})),
}));

describe("RedisClient", () => {
	let mockRedisInstance: {
		ping: ReturnType<typeof vi.fn>;
		on: ReturnType<typeof vi.fn>;
		quit: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
		options: { password?: string };
	};

	let mockClusterInstance: {
		ping: ReturnType<typeof vi.fn>;
		on: ReturnType<typeof vi.fn>;
		quit: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		mockRedisInstance = {
			ping: vi.fn().mockResolvedValue("PONG"),
			on: vi.fn().mockReturnThis(),
			quit: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn(),
			options: {},
		};

		mockClusterInstance = {
			ping: vi.fn().mockResolvedValue("PONG"),
			on: vi.fn().mockReturnThis(),
			quit: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn(),
		};

		vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
		vi.mocked(Cluster).mockImplementation(() => mockClusterInstance as never);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("createRedisClient", () => {
		describe("standard Redis (password auth)", () => {
			it("should create client for standard Redis URL", async () => {
				const client = await createRedisClient("redis://localhost:6379", { name: "test" });

				expect(client).toBeDefined();
				expect(Redis).toHaveBeenCalledWith(
					"redis://localhost:6379",
					expect.objectContaining({
						maxRetriesPerRequest: 3,
						enableReadyCheck: true,
						connectTimeout: 5000,
					}),
				);
			});

			it("should create client for Stackhero Redis URL with password", async () => {
				const client = await createRedisClient("redis://user:password@redis.stackhero.io:6379", {
					name: "stackhero",
				});

				expect(client).toBeDefined();
				expect(Redis).toHaveBeenCalled();
			});

			it("should register event handlers for standard Redis", async () => {
				await createRedisClient("redis://localhost:6379", { name: "test" });

				expect(mockRedisInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("connect", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("close", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("reconnecting", expect.any(Function));
			});

			it("should implement retry strategy for standard Redis", async () => {
				let capturedRetryStrategy: ((times: number) => number | null) | undefined;

				vi.mocked(Redis).mockImplementation(((
					_url: string,
					options: { retryStrategy: (times: number) => number | null },
				) => {
					capturedRetryStrategy = options.retryStrategy;
					return mockRedisInstance;
				}) as never);

				await createRedisClient("redis://localhost:6379", { name: "test", maxRetries: 3 });

				expect(capturedRetryStrategy).toBeDefined();
				expect(capturedRetryStrategy?.(1)).toBe(50);
				expect(capturedRetryStrategy?.(2)).toBe(100);
				expect(capturedRetryStrategy?.(3)).toBe(150);
				expect(capturedRetryStrategy?.(4)).toBeNull(); // Exceeds maxRetries
			});

			it("should continue retrying when maxRetries is not set", async () => {
				let capturedRetryStrategy: ((times: number) => number | null) | undefined;

				vi.mocked(Redis).mockImplementation(((
					_url: string,
					options: { retryStrategy: (times: number) => number | null },
				) => {
					capturedRetryStrategy = options.retryStrategy;
					return mockRedisInstance;
				}) as never);

				await createRedisClient("redis://localhost:6379", { name: "test" });

				expect(capturedRetryStrategy).toBeDefined();
				// Without maxRetries, should keep returning delays
				expect(capturedRetryStrategy?.(10)).toBe(500);
				expect(capturedRetryStrategy?.(100)).toBe(2000); // Capped at 2000ms
			});
		});

		describe("MemoryDB (IAM auth)", () => {
			const memoryDbUrl = "rediss://jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com:6379";

			beforeEach(() => {
				// Mock PSTORE_ENV for IAM user name
				vi.stubEnv("PSTORE_ENV", "dev");
				vi.stubEnv("AWS_REGION", "us-west-2");
			});

			afterEach(() => {
				vi.unstubAllEnvs();
			});

			it("should detect MemoryDB URL and use IAM auth", async () => {
				const client = await createRedisClient(memoryDbUrl, { name: "memorydb" });

				expect(client).toBeDefined();
				expect(Redis).toHaveBeenCalledWith(
					expect.objectContaining({
						host: "jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com",
						port: 6379,
						tls: {},
						username: "jolli-iam-user-dev",
						password: expect.stringContaining("jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com"),
					}),
				);
			});

			it("should register event handlers for MemoryDB", async () => {
				await createRedisClient(memoryDbUrl, { name: "memorydb" });

				expect(mockRedisInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("connect", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("close", expect.any(Function));
				expect(mockRedisInstance.on).toHaveBeenCalledWith("reconnecting", expect.any(Function));
			});

			it("should implement retry strategy for MemoryDB", async () => {
				let capturedRetryStrategy: ((times: number) => number | null) | undefined;

				vi.mocked(Redis).mockImplementation(((options: { retryStrategy: (times: number) => number | null }) => {
					capturedRetryStrategy = options.retryStrategy;
					return mockRedisInstance;
				}) as never);

				await createRedisClient(memoryDbUrl, { name: "memorydb", maxRetries: 2 });

				expect(capturedRetryStrategy).toBeDefined();
				expect(capturedRetryStrategy?.(1)).toBe(50);
				expect(capturedRetryStrategy?.(2)).toBe(100);
				expect(capturedRetryStrategy?.(3)).toBeNull(); // Exceeds maxRetries
			});

			it("should use default AWS_REGION when not set", async () => {
				vi.unstubAllEnvs();
				vi.stubEnv("PSTORE_ENV", "prod");
				// AWS_REGION not set, should default to us-west-2

				await createRedisClient(memoryDbUrl, { name: "memorydb" });

				expect(Redis).toHaveBeenCalledWith(
					expect.objectContaining({
						username: "jolli-iam-user-prod",
					}),
				);
			});

			it("should use default PSTORE_ENV when not set", async () => {
				vi.unstubAllEnvs();
				// PSTORE_ENV not set, should default to dev

				await createRedisClient(memoryDbUrl, { name: "memorydb" });

				expect(Redis).toHaveBeenCalledWith(
					expect.objectContaining({
						username: "jolli-iam-user-dev",
					}),
				);
			});

			it("should clear token refresh interval on close", async () => {
				const clearIntervalSpy = vi.spyOn(global, "clearInterval");

				// Capture the close handler
				let closeHandler: (() => void) | undefined;
				mockRedisInstance.on = vi.fn().mockImplementation((event: string, handler: () => void) => {
					if (event === "close") {
						closeHandler = handler;
					}
					return mockRedisInstance;
				});

				await createRedisClient(memoryDbUrl, { name: "memorydb" });

				expect(closeHandler).toBeDefined();
				closeHandler?.();

				expect(clearIntervalSpy).toHaveBeenCalled();
			});
		});

		describe("MemoryDB (password auth - cluster mode)", () => {
			// MemoryDB with credentials in URL uses cluster mode (not IAM)
			const memoryDbUrlWithCreds =
				"rediss://jolli-user-dev:secretpassword@jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com:6379";

			it("should use cluster mode for MemoryDB with credentials in URL", async () => {
				await createRedisClient(memoryDbUrlWithCreds, { name: "memorydb-cluster" });

				// Should use Cluster, not Redis
				expect(Cluster).toHaveBeenCalled();
				expect(Cluster).toHaveBeenCalledWith(
					[{ host: "jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com", port: 6379 }],
					expect.objectContaining({
						redisOptions: expect.objectContaining({
							username: "jolli-user-dev",
							password: "secretpassword",
							tls: {},
						}),
					}),
				);
			});

			it("should register cluster event handlers", async () => {
				await createRedisClient(memoryDbUrlWithCreds, { name: "memorydb-cluster" });

				expect(mockClusterInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
				expect(mockClusterInstance.on).toHaveBeenCalledWith("connect", expect.any(Function));
				expect(mockClusterInstance.on).toHaveBeenCalledWith("close", expect.any(Function));
				expect(mockClusterInstance.on).toHaveBeenCalledWith("reconnecting", expect.any(Function));
				expect(mockClusterInstance.on).toHaveBeenCalledWith("+node", expect.any(Function));
				expect(mockClusterInstance.on).toHaveBeenCalledWith("-node", expect.any(Function));
			});

			it("should handle cluster events without crashing", async () => {
				const eventHandlers: Record<string, (arg?: unknown) => void> = {};
				mockClusterInstance.on = vi
					.fn()
					.mockImplementation((event: string, handler: (arg?: unknown) => void) => {
						eventHandlers[event] = handler;
						return mockClusterInstance;
					});

				await createRedisClient(memoryDbUrlWithCreds, { name: "memorydb-cluster" });

				// Trigger cluster events - should not throw
				expect(() => eventHandlers.error?.(new Error("Cluster error"))).not.toThrow();
				expect(() => eventHandlers.connect?.()).not.toThrow();
				expect(() => eventHandlers.close?.()).not.toThrow();
				expect(() => eventHandlers.reconnecting?.()).not.toThrow();
				expect(() => eventHandlers["+node"]?.({ options: { host: "node1" } })).not.toThrow();
				expect(() => eventHandlers["-node"]?.({ options: { host: "node1" } })).not.toThrow();
			});

			it("should implement cluster retry strategy", async () => {
				let capturedRetryStrategy: ((times: number) => number | null) | undefined;

				vi.mocked(Cluster).mockImplementation(((
					_nodes: unknown,
					options: { clusterRetryStrategy?: unknown },
				) => {
					capturedRetryStrategy = options?.clusterRetryStrategy as (times: number) => number | null;
					return mockClusterInstance;
				}) as never);

				await createRedisClient(memoryDbUrlWithCreds, { name: "memorydb-cluster", maxRetries: 2 });

				expect(capturedRetryStrategy).toBeDefined();
				expect(capturedRetryStrategy?.(1)).toBe(50);
				expect(capturedRetryStrategy?.(2)).toBe(100);
				expect(capturedRetryStrategy?.(3)).toBeNull(); // Exceeds maxRetries
			});
		});

		describe("URL detection", () => {
			it("should detect standard Redis URL (redis://)", async () => {
				await createRedisClient("redis://localhost:6379", { name: "test" });

				// Standard Redis uses URL-based constructor (standalone mode)
				expect(Redis).toHaveBeenCalledWith("redis://localhost:6379", expect.any(Object));
				expect(Cluster).not.toHaveBeenCalled();
			});

			it("should detect MemoryDB URL without credentials (IAM auth)", async () => {
				vi.stubEnv("PSTORE_ENV", "dev");
				vi.stubEnv("AWS_REGION", "us-west-2");

				await createRedisClient("rediss://cluster.abc.memorydb.us-west-2.amazonaws.com:6379", {
					name: "test",
				});

				// MemoryDB without credentials uses IAM auth (standalone Redis with host/tls options)
				expect(Redis).toHaveBeenCalledWith(
					expect.objectContaining({
						host: "cluster.abc.memorydb.us-west-2.amazonaws.com",
						tls: {},
					}),
				);
				// Should NOT use cluster mode for IAM auth (standalone mode handles MOVED internally)
				expect(Cluster).not.toHaveBeenCalled();

				vi.unstubAllEnvs();
			});

			it("should detect MemoryDB URL with credentials (cluster mode)", async () => {
				await createRedisClient("rediss://user:pass@cluster.abc.memorydb.us-west-2.amazonaws.com:6379", {
					name: "test",
				});

				// MemoryDB with credentials uses cluster mode
				expect(Cluster).toHaveBeenCalled();
				expect(Redis).not.toHaveBeenCalled();
			});

			it("should treat rediss:// without .memorydb. as standard Redis", async () => {
				await createRedisClient("rediss://redis.example.com:6379", { name: "test" });

				// Should use URL-based constructor (standard Redis with TLS)
				expect(Redis).toHaveBeenCalledWith("rediss://redis.example.com:6379", expect.any(Object));
				expect(Cluster).not.toHaveBeenCalled();
			});

			it("should use default port 6379 when not specified (IAM auth)", async () => {
				vi.stubEnv("PSTORE_ENV", "dev");
				vi.stubEnv("AWS_REGION", "us-west-2");

				await createRedisClient("rediss://cluster.abc.memorydb.us-west-2.amazonaws.com", {
					name: "test",
				});

				expect(Redis).toHaveBeenCalledWith(
					expect.objectContaining({
						port: 6379,
					}),
				);

				vi.unstubAllEnvs();
			});

			it("should use default port 6379 when not specified (cluster mode)", async () => {
				await createRedisClient("rediss://user:pass@cluster.abc.memorydb.us-west-2.amazonaws.com", {
					name: "test",
				});

				expect(Cluster).toHaveBeenCalledWith(
					[{ host: "cluster.abc.memorydb.us-west-2.amazonaws.com", port: 6379 }],
					expect.any(Object),
				);
			});
		});
	});

	describe("testRedisConnection", () => {
		it("should resolve when ping succeeds (standalone)", async () => {
			mockRedisInstance.ping.mockResolvedValue("PONG");

			await expect(testRedisConnection(mockRedisInstance as unknown as Redis)).resolves.toBeUndefined();
			expect(mockRedisInstance.ping).toHaveBeenCalled();
		});

		it("should resolve when ping succeeds (cluster)", async () => {
			mockClusterInstance.ping.mockResolvedValue("PONG");

			await expect(testRedisConnection(mockClusterInstance as unknown as Cluster)).resolves.toBeUndefined();
			expect(mockClusterInstance.ping).toHaveBeenCalled();
		});

		it("should reject when ping fails", async () => {
			mockRedisInstance.ping.mockRejectedValue(new Error("Connection failed"));

			await expect(testRedisConnection(mockRedisInstance as unknown as Redis)).rejects.toThrow(
				"Connection failed",
			);
		});

		it("should reject when ping times out", async () => {
			mockRedisInstance.ping.mockImplementation(
				() =>
					new Promise(() => {
						/* Never resolves */
					}),
			);

			vi.useFakeTimers();
			try {
				const promise = testRedisConnection(mockRedisInstance as unknown as Redis, 1000);
				vi.advanceTimersByTime(1100);

				await expect(promise).rejects.toThrow("Redis connection timeout");
			} finally {
				vi.useRealTimers();
			}
		});

		it("should use default timeout of 5000ms", async () => {
			mockRedisInstance.ping.mockImplementation(
				() =>
					new Promise(() => {
						/* Never resolves */
					}),
			);

			vi.useFakeTimers();
			try {
				const promise = testRedisConnection(mockRedisInstance as unknown as Redis);
				vi.advanceTimersByTime(5100);

				await expect(promise).rejects.toThrow("Redis connection timeout");
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("connectRedis", () => {
		it("should return client when connection succeeds", async () => {
			mockRedisInstance.ping.mockResolvedValue("PONG");

			const client = await connectRedis("redis://localhost:6379", { name: "test" });

			expect(client).toBeDefined();
			expect(mockRedisInstance.ping).toHaveBeenCalled();
			expect(mockRedisInstance.disconnect).not.toHaveBeenCalled();
		});

		it("should disconnect and rethrow when connection fails", async () => {
			mockRedisInstance.ping.mockRejectedValue(new Error("Connection refused"));

			await expect(connectRedis("redis://localhost:6379", { name: "test" })).rejects.toThrow(
				"Connection refused",
			);
			expect(mockRedisInstance.disconnect).toHaveBeenCalled();
		});

		it("should pass options through to createRedisClient", async () => {
			mockRedisInstance.ping.mockResolvedValue("PONG");

			await connectRedis("redis://localhost:6379", { name: "cache", maxRetries: 3 });

			expect(Redis).toHaveBeenCalledWith(
				"redis://localhost:6379",
				expect.objectContaining({ maxRetriesPerRequest: 3 }),
			);
		});
	});

	describe("event handlers", () => {
		it("should handle error event without crashing", async () => {
			const eventHandlers: Record<string, (arg?: unknown) => void> = {};
			mockRedisInstance.on = vi.fn().mockImplementation((event: string, handler: (arg?: unknown) => void) => {
				eventHandlers[event] = handler;
				return mockRedisInstance;
			});

			await createRedisClient("redis://localhost:6379", { name: "test" });

			// Trigger error event - should not throw
			expect(() => eventHandlers.error?.(new Error("Test error"))).not.toThrow();
		});

		it("should handle connect event without crashing", async () => {
			const eventHandlers: Record<string, () => void> = {};
			mockRedisInstance.on = vi.fn().mockImplementation((event: string, handler: () => void) => {
				eventHandlers[event] = handler;
				return mockRedisInstance;
			});

			await createRedisClient("redis://localhost:6379", { name: "test" });

			// Trigger connect event - should not throw
			expect(() => eventHandlers.connect?.()).not.toThrow();
		});

		it("should handle close event without crashing", async () => {
			const eventHandlers: Record<string, () => void> = {};
			mockRedisInstance.on = vi.fn().mockImplementation((event: string, handler: () => void) => {
				eventHandlers[event] = handler;
				return mockRedisInstance;
			});

			await createRedisClient("redis://localhost:6379", { name: "test" });

			// Trigger close event - should not throw
			expect(() => eventHandlers.close?.()).not.toThrow();
		});

		it("should handle reconnecting event without crashing", async () => {
			const eventHandlers: Record<string, () => void> = {};
			mockRedisInstance.on = vi.fn().mockImplementation((event: string, handler: () => void) => {
				eventHandlers[event] = handler;
				return mockRedisInstance;
			});

			await createRedisClient("redis://localhost:6379", { name: "test" });

			// Trigger reconnecting event - should not throw
			expect(() => eventHandlers.reconnecting?.()).not.toThrow();
		});
	});
});
