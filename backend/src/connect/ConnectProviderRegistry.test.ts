import type { ConnectCallbackResult, ConnectCompleteResult, ConnectProvider } from "./ConnectProvider";
import { ConnectProviderRegistry, connectProviderRegistry } from "./ConnectProviderRegistry";
import { beforeEach, describe, expect, it } from "vitest";

// Mock provider for testing
function createMockProvider(name: string): ConnectProvider {
	return {
		name,
		getSetupRedirectUrl: () => Promise.resolve(`https://example.com/${name}/auth`),
		handleCallback: () =>
			Promise.resolve({
				success: true,
				redirectUrl: "https://example.com/complete",
			} as ConnectCallbackResult),
		handleComplete: () =>
			Promise.resolve({
				success: true,
				redirectPath: "/success",
			} as ConnectCompleteResult),
	};
}

describe("ConnectProviderRegistry", () => {
	let registry: ConnectProviderRegistry;

	beforeEach(() => {
		registry = new ConnectProviderRegistry();
	});

	describe("register", () => {
		it("should register a provider", () => {
			const provider = createMockProvider("github");
			registry.register(provider);
			expect(registry.has("github")).toBe(true);
		});

		it("should silently ignore duplicate registration (supports HMR)", () => {
			const provider1 = createMockProvider("github");
			const provider2 = createMockProvider("github");
			registry.register(provider1);
			// Second registration should be a no-op, not throw
			registry.register(provider2);
			// Should still have only the first provider
			expect(registry.get("github")).toBe(provider1);
			expect(registry.list()).toHaveLength(1);
		});

		it("should normalize provider name to lowercase", () => {
			const provider = createMockProvider("GitHub");
			registry.register(provider);
			expect(registry.has("github")).toBe(true);
		});
	});

	describe("get", () => {
		it("should return the registered provider", () => {
			const provider = createMockProvider("github");
			registry.register(provider);
			expect(registry.get("github")).toBe(provider);
		});

		it("should return undefined for unregistered provider", () => {
			expect(registry.get("unknown")).toBeUndefined();
		});

		it("should be case insensitive", () => {
			const provider = createMockProvider("github");
			registry.register(provider);
			expect(registry.get("GITHUB")).toBe(provider);
			expect(registry.get("GitHub")).toBe(provider);
		});
	});

	describe("has", () => {
		it("should return true for registered provider", () => {
			const provider = createMockProvider("github");
			registry.register(provider);
			expect(registry.has("github")).toBe(true);
		});

		it("should return false for unregistered provider", () => {
			expect(registry.has("unknown")).toBe(false);
		});

		it("should be case insensitive", () => {
			const provider = createMockProvider("github");
			registry.register(provider);
			expect(registry.has("GITHUB")).toBe(true);
		});
	});

	describe("list", () => {
		it("should return empty array when no providers registered", () => {
			expect(registry.list()).toEqual([]);
		});

		it("should return all registered providers", () => {
			const github = createMockProvider("github");
			const gitlab = createMockProvider("gitlab");
			registry.register(github);
			registry.register(gitlab);
			const list = registry.list();
			expect(list).toHaveLength(2);
			expect(list).toContain(github);
			expect(list).toContain(gitlab);
		});
	});

	describe("names", () => {
		it("should return empty array when no providers registered", () => {
			expect(registry.names()).toEqual([]);
		});

		it("should return all provider names", () => {
			registry.register(createMockProvider("github"));
			registry.register(createMockProvider("gitlab"));
			const names = registry.names();
			expect(names).toHaveLength(2);
			expect(names).toContain("github");
			expect(names).toContain("gitlab");
		});
	});

	describe("clear", () => {
		it("should remove all registered providers", () => {
			registry.register(createMockProvider("github"));
			registry.register(createMockProvider("gitlab"));
			expect(registry.list()).toHaveLength(2);

			registry.clear();

			expect(registry.list()).toEqual([]);
			expect(registry.has("github")).toBe(false);
			expect(registry.has("gitlab")).toBe(false);
		});
	});
});

describe("connectProviderRegistry (global instance)", () => {
	beforeEach(() => {
		connectProviderRegistry.clear();
	});

	it("should be a singleton", () => {
		const provider = createMockProvider("test");
		connectProviderRegistry.register(provider);
		expect(connectProviderRegistry.has("test")).toBe(true);
	});
});
