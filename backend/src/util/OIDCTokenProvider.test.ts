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

	describe("VercelOIDCTokenProvider", () => {
		it("isAvailable returns true when VERCEL=1", async () => {
			process.env.VERCEL = "1";
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			expect(provider.isAvailable()).toBe(true);
		});

		it("isAvailable returns false when VERCEL is not set", async () => {
			delete process.env.VERCEL;
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("extractFromRequest stores token from string header", async () => {
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			provider.extractFromRequest({ "x-vercel-oidc-token": "token-123" });
			expect(provider.getToken()).toBe("token-123");
		});

		it("extractFromRequest stores first token from array header", async () => {
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			provider.extractFromRequest({ "x-vercel-oidc-token": ["first", "second"] });
			expect(provider.getToken()).toBe("first");
		});

		it("extractFromRequest handles missing header", async () => {
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			provider.extractFromRequest({ "other-header": "value" });
			expect(provider.getToken()).toBeUndefined();
		});

		it("getToken falls back to VERCEL_OIDC_TOKEN env var", async () => {
			process.env.VERCEL_OIDC_TOKEN = "env-token";
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			expect(provider.getToken()).toBe("env-token");
		});

		it("getToken prefers stored token over env var", async () => {
			process.env.VERCEL_OIDC_TOKEN = "env-token";
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			provider.extractFromRequest({ "x-vercel-oidc-token": "header-token" });
			expect(provider.getToken()).toBe("header-token");
		});

		it("clearToken removes stored token", async () => {
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			provider.extractFromRequest({ "x-vercel-oidc-token": "token" });
			expect(provider.getToken()).toBe("token");
			provider.clearToken();
			expect(provider.getToken()).toBeUndefined();
		});

		it("has correct name", async () => {
			const { VercelOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new VercelOIDCTokenProvider();
			expect(provider.name).toBe("Vercel");
		});
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
			provider.extractFromRequest({ "x-vercel-oidc-token": "token" });
			expect(provider.getToken()).toBeUndefined();
		});

		it("has correct name", async () => {
			const { NoOpOIDCTokenProvider } = await import("./OIDCTokenProvider");
			const provider = new NoOpOIDCTokenProvider();
			expect(provider.name).toBe("NoOp");
		});
	});

	describe("getOIDCTokenProvider and setOIDCTokenProvider", () => {
		it("returns default Vercel provider", async () => {
			const { getOIDCTokenProvider, resetOIDCTokenProvider } = await import("./OIDCTokenProvider");
			resetOIDCTokenProvider();
			const provider = getOIDCTokenProvider();
			expect(provider.name).toBe("Vercel");
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

		it("resetOIDCTokenProvider restores Vercel provider", async () => {
			const { getOIDCTokenProvider, setOIDCTokenProvider, NoOpOIDCTokenProvider, resetOIDCTokenProvider } =
				await import("./OIDCTokenProvider");
			setOIDCTokenProvider(new NoOpOIDCTokenProvider());
			expect(getOIDCTokenProvider().name).toBe("NoOp");
			resetOIDCTokenProvider();
			expect(getOIDCTokenProvider().name).toBe("Vercel");
		});
	});
});
