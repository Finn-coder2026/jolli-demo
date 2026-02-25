import { createLogLevelService, type LogLevelService } from "./LogLevelService";
import { type LogLevelState, loggerRegistry } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
	}),
}));

describe("LogLevelService", () => {
	let service: LogLevelService;
	let setGlobalLevelSpy: ReturnType<typeof vi.spyOn>;
	let setModuleLevelSpy: ReturnType<typeof vi.spyOn>;
	let setTenantOrgLevelSpy: ReturnType<typeof vi.spyOn>;
	let setTenantOrgModuleLevelSpy: ReturnType<typeof vi.spyOn>;
	let getStateSpy: ReturnType<typeof vi.spyOn>;
	let getRegisteredModulesSpy: ReturnType<typeof vi.spyOn>;
	let setStateSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		// Spy on loggerRegistry methods - using vi.fn() to avoid empty block lint errors
		setGlobalLevelSpy = vi.spyOn(loggerRegistry, "setGlobalLevel").mockImplementation(vi.fn());
		setModuleLevelSpy = vi.spyOn(loggerRegistry, "setModuleLevel").mockImplementation(vi.fn());
		setTenantOrgLevelSpy = vi.spyOn(loggerRegistry, "setTenantOrgLevel").mockImplementation(vi.fn());
		setTenantOrgModuleLevelSpy = vi.spyOn(loggerRegistry, "setTenantOrgModuleLevel").mockImplementation(vi.fn());
		getStateSpy = vi.spyOn(loggerRegistry, "getState").mockReturnValue({
			global: "info",
			modules: {},
			tenantOrg: {},
			tenantOrgModule: {},
		});
		getRegisteredModulesSpy = vi
			.spyOn(loggerRegistry, "getRegisteredModules")
			.mockReturnValue(["Module1", "Module2"]);
		setStateSpy = vi.spyOn(loggerRegistry, "setState").mockImplementation(vi.fn());

		service = await createLogLevelService({ initialLevel: "info" });
	});

	afterEach(async () => {
		await service.close();
		vi.restoreAllMocks();
	});

	describe("createLogLevelService", () => {
		it("should create service with default options", async () => {
			vi.clearAllMocks();
			const defaultService = await createLogLevelService();
			expect(defaultService).toBeDefined();
			expect(setGlobalLevelSpy).toHaveBeenCalledWith("info");
		});

		it("should initialize with custom initial level", async () => {
			vi.clearAllMocks();
			const customService = await createLogLevelService({ initialLevel: "debug" });
			expect(customService).toBeDefined();
			expect(setGlobalLevelSpy).toHaveBeenCalledWith("debug");
		});
	});

	describe("setGlobalLevel", () => {
		it("should call loggerRegistry.setGlobalLevel", async () => {
			await service.setGlobalLevel("debug");
			expect(setGlobalLevelSpy).toHaveBeenCalledWith("debug");
		});
	});

	describe("setModuleLevel", () => {
		it("should call loggerRegistry.setModuleLevel with level", async () => {
			await service.setModuleLevel("TestModule", "trace");
			expect(setModuleLevelSpy).toHaveBeenCalledWith("TestModule", "trace");
		});

		it("should call loggerRegistry.setModuleLevel with null to clear", async () => {
			await service.setModuleLevel("TestModule", null);
			expect(setModuleLevelSpy).toHaveBeenCalledWith("TestModule", null);
		});
	});

	describe("setTenantOrgLevel", () => {
		it("should call loggerRegistry.setTenantOrgLevel with level", async () => {
			await service.setTenantOrgLevel("acme", "engineering", "debug");
			expect(setTenantOrgLevelSpy).toHaveBeenCalledWith("acme", "engineering", "debug");
		});

		it("should call loggerRegistry.setTenantOrgLevel with null to clear", async () => {
			await service.setTenantOrgLevel("acme", "engineering", null);
			expect(setTenantOrgLevelSpy).toHaveBeenCalledWith("acme", "engineering", null);
		});
	});

	describe("setTenantOrgModuleLevel", () => {
		it("should call loggerRegistry.setTenantOrgModuleLevel with level", async () => {
			await service.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", "trace");
			expect(setTenantOrgModuleLevelSpy).toHaveBeenCalledWith("acme", "engineering", "JobRouter", "trace");
		});

		it("should call loggerRegistry.setTenantOrgModuleLevel with null to clear", async () => {
			await service.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", null);
			expect(setTenantOrgModuleLevelSpy).toHaveBeenCalledWith("acme", "engineering", "JobRouter", null);
		});
	});

	describe("getState", () => {
		it("should return current state from loggerRegistry", () => {
			const state = service.getState();
			expect(state).toEqual({
				global: "info",
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			});
			expect(getStateSpy).toHaveBeenCalled();
		});
	});

	describe("getRegisteredModules", () => {
		it("should return registered modules from loggerRegistry", () => {
			const modules = service.getRegisteredModules();
			expect(modules).toEqual(["Module1", "Module2"]);
			expect(getRegisteredModulesSpy).toHaveBeenCalled();
		});
	});

	describe("close", () => {
		it("should resolve without error when no Redis", async () => {
			await expect(service.close()).resolves.not.toThrow();
		});
	});

	describe("clearAll", () => {
		it("should reset all overrides but keep global level", async () => {
			getStateSpy.mockReturnValue({
				global: "debug",
				modules: { TestModule: "trace" },
				tenantOrg: { "acme:eng": "debug" },
				tenantOrgModule: { "acme:eng:JobRouter": "trace" },
			});

			await service.clearAll();

			expect(setStateSpy).toHaveBeenCalledWith({
				global: "debug",
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			});
		});
	});

	describe("clearTenantOrg", () => {
		it("should clear tenant-org and all tenant-org-module overrides for that tenant+org", async () => {
			getStateSpy.mockReturnValue({
				global: "info",
				modules: { TestModule: "trace" },
				tenantOrg: { "acme:eng": "debug", "other:org": "trace" },
				tenantOrgModule: {
					"acme:eng:JobRouter": "trace",
					"acme:eng:DocRouter": "debug",
					"other:org:JobRouter": "trace",
				},
			});

			await service.clearTenantOrg("acme", "eng");

			expect(setStateSpy).toHaveBeenCalledWith({
				global: "info",
				modules: { TestModule: "trace" },
				tenantOrg: { "other:org": "trace" },
				tenantOrgModule: { "other:org:JobRouter": "trace" },
			});
		});

		it("should handle tenant-org that has no entries", async () => {
			getStateSpy.mockReturnValue({
				global: "info",
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			});

			await service.clearTenantOrg("nonexistent", "org");

			expect(setStateSpy).toHaveBeenCalledWith({
				global: "info",
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			});
		});
	});

	describe("with Redis pub/sub", () => {
		/**
		 * Helper to create a mock Redis client with common mocks.
		 */
		function createMockRedisClient(
			options: {
				persistedState?: LogLevelState | null;
				onMessage?: (handler: (channel: string, message: string) => void) => void;
			} = {},
		) {
			const mockPublish = vi.fn().mockResolvedValue(1);
			const mockGet = vi
				.fn()
				.mockResolvedValue(options.persistedState ? JSON.stringify(options.persistedState) : null);
			const mockSet = vi.fn().mockResolvedValue("OK");
			const mockSetex = vi.fn().mockResolvedValue("OK");
			const mockSubscribe = vi.fn().mockResolvedValue(undefined);
			const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
			const mockQuit = vi.fn().mockResolvedValue(undefined);

			const mockDuplicateClient = {
				subscribe: mockSubscribe,
				unsubscribe: mockUnsubscribe,
				quit: mockQuit,
				on: vi.fn((event, handler) => {
					if (event === "message" && options.onMessage) {
						options.onMessage(handler);
					}
				}),
			};

			const mockRedisClient = {
				duplicate: vi.fn().mockReturnValue(mockDuplicateClient),
				publish: mockPublish,
				get: mockGet,
				set: mockSet,
				setex: mockSetex,
			} as unknown as import("ioredis").default;

			return {
				client: mockRedisClient,
				mocks: {
					publish: mockPublish,
					get: mockGet,
					set: mockSet,
					setex: mockSetex,
					subscribe: mockSubscribe,
					unsubscribe: mockUnsubscribe,
					quit: mockQuit,
					duplicateClient: mockDuplicateClient,
				},
			};
		}

		it("should set up subscriber when Redis client provided", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				initialLevel: "info",
			});

			// Verify subscriber was set up
			expect(client.duplicate).toHaveBeenCalled();
			expect(mocks.subscribe).toHaveBeenCalledWith("jolli:log-level:sync");
			expect(mocks.duplicateClient.on).toHaveBeenCalledWith("message", expect.any(Function));

			// Verify publish and persist are called when setting levels
			await redisService.setGlobalLevel("debug");
			expect(mocks.publish).toHaveBeenCalledWith(
				"jolli:log-level:sync",
				JSON.stringify({ global: "info", modules: {}, tenantOrg: {}, tenantOrgModule: {} }),
			);
			// Default persistToRedis=true and persistTtlSeconds=86400
			expect(mocks.setex).toHaveBeenCalledWith(
				"jolli:log-level:state",
				86400,
				JSON.stringify({ global: "info", modules: {}, tenantOrg: {}, tenantOrgModule: {} }),
			);

			// Clean up
			await redisService.close();
			expect(mocks.unsubscribe).toHaveBeenCalledWith("jolli:log-level:sync");
			expect(mocks.quit).toHaveBeenCalled();
		});

		it("should handle incoming sync messages", async () => {
			let messageHandler: ((channel: string, message: string) => void) | undefined;
			const { client } = createMockRedisClient({
				onMessage: handler => {
					messageHandler = handler;
				},
			});

			const redisService = await createLogLevelService({
				redisClient: client,
			});

			// Simulate receiving a sync message
			const newState: LogLevelState = {
				global: "debug",
				modules: { Test: "trace" },
				tenantOrg: {},
				tenantOrgModule: {},
			};
			messageHandler?.("jolli:log-level:sync", JSON.stringify(newState));

			expect(setStateSpy).toHaveBeenCalledWith(newState);

			await redisService.close();
		});

		it("should ignore messages from other channels", async () => {
			let messageHandler: ((channel: string, message: string) => void) | undefined;
			const { client } = createMockRedisClient({
				onMessage: handler => {
					messageHandler = handler;
				},
			});

			const redisService = await createLogLevelService({
				redisClient: client,
			});

			// Clear any setState calls from initialization
			setStateSpy.mockClear();

			// Simulate receiving a message on a different channel
			messageHandler?.("other:channel", JSON.stringify({ global: "error" }));

			expect(setStateSpy).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should handle invalid JSON in sync messages gracefully", async () => {
			let messageHandler: ((channel: string, message: string) => void) | undefined;
			const { client } = createMockRedisClient({
				onMessage: handler => {
					messageHandler = handler;
				},
			});

			const redisService = await createLogLevelService({
				redisClient: client,
			});

			// Clear any setState calls from initialization
			setStateSpy.mockClear();

			// Simulate receiving invalid JSON
			messageHandler?.("jolli:log-level:sync", "invalid json");

			expect(setStateSpy).not.toHaveBeenCalled();

			await redisService.close();
		});
	});

	describe("Redis persistence", () => {
		/**
		 * Helper to create a mock Redis client with common mocks.
		 */
		function createMockRedisClient(options: { persistedState?: LogLevelState | null; getError?: Error } = {}) {
			const mockPublish = vi.fn().mockResolvedValue(1);
			const mockGet = options.getError
				? vi.fn().mockRejectedValue(options.getError)
				: vi.fn().mockResolvedValue(options.persistedState ? JSON.stringify(options.persistedState) : null);
			const mockSet = vi.fn().mockResolvedValue("OK");
			const mockSetex = vi.fn().mockResolvedValue("OK");
			const mockSubscribe = vi.fn().mockResolvedValue(undefined);
			const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
			const mockQuit = vi.fn().mockResolvedValue(undefined);

			const mockDuplicateClient = {
				subscribe: mockSubscribe,
				unsubscribe: mockUnsubscribe,
				quit: mockQuit,
				on: vi.fn(),
			};

			const mockRedisClient = {
				duplicate: vi.fn().mockReturnValue(mockDuplicateClient),
				publish: mockPublish,
				get: mockGet,
				set: mockSet,
				setex: mockSetex,
			} as unknown as import("ioredis").default;

			return {
				client: mockRedisClient,
				mocks: {
					publish: mockPublish,
					get: mockGet,
					set: mockSet,
					setex: mockSetex,
					subscribe: mockSubscribe,
					unsubscribe: mockUnsubscribe,
					quit: mockQuit,
				},
			};
		}

		it("should load persisted state from Redis on startup", async () => {
			const persistedState: LogLevelState = {
				global: "debug",
				modules: { TestModule: "trace" },
				tenantOrg: { "acme:eng": "debug" },
				tenantOrgModule: {},
			};

			const { client, mocks } = createMockRedisClient({ persistedState });

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
			});

			// Verify state was loaded
			expect(mocks.get).toHaveBeenCalledWith("jolli:log-level:state");
			expect(setStateSpy).toHaveBeenCalledWith(persistedState);

			await redisService.close();
		});

		it("should not load persisted state when persistToRedis is false", async () => {
			const persistedState: LogLevelState = {
				global: "debug",
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			};

			const { client, mocks } = createMockRedisClient({ persistedState });

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: false,
			});

			// Verify get was not called
			expect(mocks.get).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should handle missing persisted state gracefully", async () => {
			const { client, mocks } = createMockRedisClient({ persistedState: null });

			setStateSpy.mockClear();
			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
			});

			// Verify get was called but setState was not called (no persisted state)
			expect(mocks.get).toHaveBeenCalledWith("jolli:log-level:state");
			expect(setStateSpy).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should handle Redis get error gracefully", async () => {
			const { client, mocks } = createMockRedisClient({
				getError: new Error("Redis connection failed"),
			});

			setStateSpy.mockClear();
			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
			});

			// Verify get was attempted but setState was not called
			expect(mocks.get).toHaveBeenCalled();
			expect(setStateSpy).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should persist state with TTL when setting levels", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
				persistTtlSeconds: 3600, // 1 hour
			});

			await redisService.setGlobalLevel("debug");

			expect(mocks.setex).toHaveBeenCalledWith(
				"jolli:log-level:state",
				3600,
				JSON.stringify({ global: "info", modules: {}, tenantOrg: {}, tenantOrgModule: {} }),
			);

			await redisService.close();
		});

		it("should persist state without TTL when persistTtlSeconds is 0", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
				persistTtlSeconds: 0,
			});

			await redisService.setGlobalLevel("debug");

			expect(mocks.set).toHaveBeenCalledWith(
				"jolli:log-level:state",
				JSON.stringify({ global: "info", modules: {}, tenantOrg: {}, tenantOrgModule: {} }),
			);
			expect(mocks.setex).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should not persist state when persistToRedis is false", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: false,
			});

			await redisService.setGlobalLevel("debug");

			// Publish should still work for pub/sub sync
			expect(mocks.publish).toHaveBeenCalled();
			// But persistence should not happen
			expect(mocks.set).not.toHaveBeenCalled();
			expect(mocks.setex).not.toHaveBeenCalled();

			await redisService.close();
		});

		it("should persist state when calling clearAll", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
				persistTtlSeconds: 86400,
			});

			await redisService.clearAll();

			expect(mocks.publish).toHaveBeenCalled();
			expect(mocks.setex).toHaveBeenCalled();

			await redisService.close();
		});

		it("should persist state when calling clearTenantOrg", async () => {
			const { client, mocks } = createMockRedisClient();

			const redisService = await createLogLevelService({
				redisClient: client,
				persistToRedis: true,
				persistTtlSeconds: 86400,
			});

			await redisService.clearTenantOrg("acme", "eng");

			expect(mocks.publish).toHaveBeenCalled();
			expect(mocks.setex).toHaveBeenCalled();

			await redisService.close();
		});
	});
});
