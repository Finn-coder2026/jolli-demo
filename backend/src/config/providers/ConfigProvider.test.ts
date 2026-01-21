// Import the module to ensure coverage (TypeScript interfaces have no runtime, but the Symbol export has runtime presence)
import { CONFIG_PROVIDER_MODULE, type ConfigProvider, type ProviderLoadResult } from "./ConfigProvider";
import { describe, expect, it } from "vitest";

describe("CONFIG_PROVIDER_MODULE", () => {
	it("should export a module marker symbol", () => {
		expect(typeof CONFIG_PROVIDER_MODULE).toBe("symbol");
		expect(CONFIG_PROVIDER_MODULE.description).toBe("ConfigProvider");
	});
});

/**
 * Tests for ConfigProvider interface types.
 * These tests verify that the interfaces are correctly defined and can be implemented.
 */
describe("ConfigProvider", () => {
	it("should be implementable as a valid provider", () => {
		// Create a mock implementation to verify the interface shape
		const mockProvider: ConfigProvider = {
			name: "test-provider",
			priority: 1,
			isAvailable: () => true,
			load: async () => ({ TEST_VAR: "test-value" }),
		};

		expect(mockProvider.name).toBe("test-provider");
		expect(mockProvider.priority).toBe(1);
		expect(mockProvider.isAvailable()).toBe(true);
	});

	it("should define a provider with async load method", async () => {
		const mockProvider: ConfigProvider = {
			name: "async-provider",
			priority: 2,
			isAvailable: () => false,
			load: async () => Promise.resolve({ ASYNC_VAR: "async-value" }),
		};

		const result = await mockProvider.load();
		expect(result).toEqual({ ASYNC_VAR: "async-value" });
	});
});

describe("ProviderLoadResult", () => {
	it("should define the correct shape for provider results", () => {
		const result: ProviderLoadResult = {
			providerName: "test-provider",
			count: 5,
			variableNames: ["VAR1", "VAR2", "VAR3", "VAR4", "VAR5"],
		};

		expect(result.providerName).toBe("test-provider");
		expect(result.count).toBe(5);
		expect(result.variableNames).toHaveLength(5);
	});
});
