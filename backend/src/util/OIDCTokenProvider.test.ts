import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OIDCTokenProvider", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("NoOpOIDCTokenProvider", () => {
		it("isAvailable always returns false", async () => {
			const { NoOpOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new NoOpOIDCTokenProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("getToken always returns undefined", async () => {
			const { NoOpOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new NoOpOIDCTokenProvider();
			expect(provider.getToken()).toBeUndefined();
		});

		it("extractFromRequest is a no-op", async () => {
			const { NoOpOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new NoOpOIDCTokenProvider();
			provider.extractFromRequest({ "some-header": "token" });
			expect(provider.getToken()).toBeUndefined();
		});

		it("has correct name", async () => {
			const { NoOpOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new NoOpOIDCTokenProvider();
			expect(provider.name).toBe("NoOp");
		});
	});

	describe("getOIDCTokenProvider and setOIDCTokenProvider", () => {
		it("returns default NoOp provider", async () => {
			const { getOIDCTokenProvider, resetOIDCTokenProvider } = await import("./OIDCTokenProvider");
			resetOIDCTokenProvider();
			const provider = getOIDCTokenProvider();
			expect(provider.name).toBe("NoOp");
		});

		it("can set custom provider", async () => {
			const { getOIDCTokenProvider, setOIDCTokenProvider, NoOpOIDCTokenProvider, resetOIDCTokenProvider } =
				await import("./OIDCTokenProvider");
			const customProvider = new NoOpOIDCTokenProvider();
			setOIDCTokenProvider(customProvider);
			expect(getOIDCTokenProvider()).toBe(customProvider);
			// Clean up
			resetOIDCTokenProvider();
		});

		it("resetOIDCTokenProvider restores NoOp provider", async () => {
			const { getOIDCTokenProvider, setOIDCTokenProvider, NoOpOIDCTokenProvider, resetOIDCTokenProvider } =
				await import("./OIDCTokenProvider");

			setOIDCTokenProvider(new NoOpOIDCTokenProvider());
			expect(getOIDCTokenProvider().name).toBe("NoOp");

			// Set a custom provider to verify reset works
			const customProvider = {
				name: "Custom",
				isAvailable: () => true,
				getToken: () => "custom-token",
				// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for test mock
				extractFromRequest: () => {},
			};
			setOIDCTokenProvider(customProvider);
			expect(getOIDCTokenProvider().name).toBe("Custom");
			resetOIDCTokenProvider();
			expect(getOIDCTokenProvider().name).toBe("NoOp");
		});
	});
});
