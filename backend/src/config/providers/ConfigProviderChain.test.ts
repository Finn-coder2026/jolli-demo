import type { ConfigProvider } from "./ConfigProvider";
import { ConfigProviderChain } from "./ConfigProviderChain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ConfigProviderChain", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.resetAllMocks();
	});

	function createMockProvider(
		name: string,
		priority: number,
		available: boolean,
		vars: Record<string, string>,
	): ConfigProvider {
		return {
			name,
			priority,
			isAvailable: () => available,
			load: vi.fn().mockResolvedValue(vars),
		};
	}

	describe("constructor", () => {
		it("sorts providers by priority (lower first)", () => {
			const provider1 = createMockProvider("high", 1, true, {});
			const provider2 = createMockProvider("medium", 2, true, {});
			const provider3 = createMockProvider("low", 3, true, {});

			// Pass in random order
			const chain = new ConfigProviderChain([provider2, provider3, provider1]);

			// Should be sorted by priority (lower number = higher priority)
			const providers = chain.getProviders();
			expect(providers[0].name).toBe("high");
			expect(providers[1].name).toBe("medium");
			expect(providers[2].name).toBe("low");
		});
	});

	describe("load", () => {
		it("loads from all available providers", async () => {
			const provider1 = createMockProvider("provider1", 1, true, { VAR1: "value1" });
			const provider2 = createMockProvider("provider2", 2, true, { VAR2: "value2" });

			const chain = new ConfigProviderChain([provider1, provider2], { applyToProcessEnv: false });
			const result = await chain.load();

			expect(result.config).toEqual({ VAR1: "value1", VAR2: "value2" });
			expect(result.providerResults).toHaveLength(2);
		});

		it("skips unavailable providers", async () => {
			const available = createMockProvider("available", 1, true, { VAR1: "value1" });
			const unavailable = createMockProvider("unavailable", 2, false, { VAR2: "value2" });

			const chain = new ConfigProviderChain([available, unavailable], { applyToProcessEnv: false });
			const result = await chain.load();

			expect(result.config).toEqual({ VAR1: "value1" });
			expect(result.providerResults).toHaveLength(1);
			expect(unavailable.load).not.toHaveBeenCalled();
		});

		it("higher priority providers override lower priority ones", async () => {
			const lowPriority = createMockProvider("low", 3, true, { VAR: "low-value", ONLY_LOW: "only-low" });
			const highPriority = createMockProvider("high", 1, true, { VAR: "high-value", ONLY_HIGH: "only-high" });

			const chain = new ConfigProviderChain([lowPriority, highPriority], { applyToProcessEnv: false });
			const result = await chain.load();

			// High priority should override VAR
			expect(result.config.VAR).toBe("high-value");
			// Both unique vars should be present
			expect(result.config.ONLY_LOW).toBe("only-low");
			expect(result.config.ONLY_HIGH).toBe("only-high");
		});

		it("applies to process.env when configured", async () => {
			const provider = createMockProvider("test", 1, true, { TEST_VAR: "test-value" });

			const chain = new ConfigProviderChain([provider], { applyToProcessEnv: true });
			await chain.load();

			expect(process.env.TEST_VAR).toBe("test-value");
		});

		it("does not apply to process.env when disabled", async () => {
			delete process.env.TEST_VAR;
			const provider = createMockProvider("test", 1, true, { TEST_VAR: "test-value" });

			const chain = new ConfigProviderChain([provider], { applyToProcessEnv: false });
			await chain.load();

			expect(process.env.TEST_VAR).toBeUndefined();
		});

		it("continues loading if a provider throws an error", async () => {
			const failingProvider: ConfigProvider = {
				name: "failing",
				priority: 1,
				isAvailable: () => true,
				load: vi.fn().mockRejectedValue(new Error("Provider failed")),
			};
			const workingProvider = createMockProvider("working", 2, true, { VAR: "value" });

			const chain = new ConfigProviderChain([failingProvider, workingProvider], { applyToProcessEnv: false });
			const result = await chain.load();

			// Should still get values from working provider
			expect(result.config).toEqual({ VAR: "value" });
			expect(result.providerResults).toHaveLength(1);
		});

		it("returns empty config when no providers are available", async () => {
			const unavailable = createMockProvider("unavailable", 1, false, { VAR: "value" });

			const chain = new ConfigProviderChain([unavailable], { applyToProcessEnv: false });
			const result = await chain.load();

			expect(result.config).toEqual({});
			expect(result.providerResults).toHaveLength(0);
		});

		it("returns empty config when providers return no values", async () => {
			const emptyProvider = createMockProvider("empty", 1, true, {});

			const chain = new ConfigProviderChain([emptyProvider], { applyToProcessEnv: false });
			const result = await chain.load();

			expect(result.config).toEqual({});
			// Empty provider shouldn't be in results
			expect(result.providerResults).toHaveLength(0);
		});
	});

	describe("getProviders", () => {
		it("returns providers in priority order", () => {
			const provider1 = createMockProvider("first", 1, true, {});
			const provider2 = createMockProvider("second", 2, true, {});

			const chain = new ConfigProviderChain([provider2, provider1]);

			const providers = chain.getProviders();
			expect(providers).toHaveLength(2);
			expect(providers[0].priority).toBe(1);
			expect(providers[1].priority).toBe(2);
		});
	});
});
