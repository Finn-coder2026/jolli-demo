import { resetConfig } from "../config/Config";
import { createGrantConfig, findAuthProvider } from "./AuthProvider";
import { describe, expect, it } from "vitest";

describe("AuthProvider", () => {
	describe("findAuthProvider", () => {
		it("should return undefined for null provider", () => {
			const provider = findAuthProvider(undefined);
			expect(provider).toBeUndefined();
		});

		it("should return undefined for undefined provider", () => {
			const provider = findAuthProvider(undefined);
			expect(provider).toBeUndefined();
		});

		it("should return undefined for unknown provider", () => {
			const provider = findAuthProvider("unknown");
			expect(provider).toBeUndefined();
		});

		it("should return github provider", () => {
			const provider = findAuthProvider("github");
			expect(provider).toBeDefined();
			expect(provider?.url).toBe("https://api.github.com/user");
		});

		it("should return google provider", () => {
			const provider = findAuthProvider("google");
			expect(provider).toBeDefined();
			expect(provider?.url).toBe("https://www.googleapis.com/oauth2/v2/userinfo");
		});
	});

	describe("createGrantConfig", () => {
		it("should create config with defaults", () => {
			const config = createGrantConfig("https://example.com");

			expect(config.defaults).toEqual({
				origin: "https://example.com",
				transport: "session",
				state: true,
				callback: "/api/auth/callback",
			});
		});

		it("should include github provider config with redirect_uri when env vars set", () => {
			const originalGithubId = process.env.GITHUB_CLIENT_ID;
			const originalGithubSecret = process.env.GITHUB_CLIENT_SECRET;

			process.env.GITHUB_CLIENT_ID = "test-github-id";
			process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
			resetConfig();

			const config = createGrantConfig("https://example.com");

			expect(config.github).toBeDefined();
			expect((config.github as Record<string, unknown>).redirect_uri).toBe(
				"https://example.com/connect/github/callback",
			);
			expect((config.github as Record<string, unknown>).key).toBe("test-github-id");
			expect((config.github as Record<string, unknown>).secret).toBe("test-github-secret");

			process.env.GITHUB_CLIENT_ID = originalGithubId;
			process.env.GITHUB_CLIENT_SECRET = originalGithubSecret;
			resetConfig();
		});

		it("should include google provider config with redirect_uri when env vars set", () => {
			const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
			const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

			process.env.GOOGLE_CLIENT_ID = "test-google-id";
			process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
			resetConfig();

			const config = createGrantConfig("https://example.com");

			expect(config.google).toBeDefined();
			expect((config.google as Record<string, unknown>).redirect_uri).toBe(
				"https://example.com/connect/google/callback",
			);
			expect((config.google as Record<string, unknown>).key).toBe("test-google-id");
			expect((config.google as Record<string, unknown>).secret).toBe("test-google-secret");
			expect((config.google as Record<string, unknown>).dynamic).toBeUndefined();

			process.env.GOOGLE_CLIENT_ID = originalGoogleId;
			process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
			resetConfig();
		});

		it("should include dynamic config when enableDynamic is true", () => {
			const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
			const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

			process.env.GOOGLE_CLIENT_ID = "test-google-id";
			process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
			resetConfig();

			const config = createGrantConfig("https://example.com", true);

			expect(config.google).toBeDefined();
			expect((config.google as Record<string, unknown>).dynamic).toEqual(["origin", "redirect_uri"]);

			process.env.GOOGLE_CLIENT_ID = originalGoogleId;
			process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
			resetConfig();
		});

		it("should skip providers without env vars configured", () => {
			const originalGithubId = process.env.GITHUB_CLIENT_ID;
			const originalGithubSecret = process.env.GITHUB_CLIENT_SECRET;
			const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
			const originalGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

			delete process.env.GITHUB_CLIENT_ID;
			delete process.env.GITHUB_CLIENT_SECRET;
			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.GOOGLE_CLIENT_SECRET;
			resetConfig();

			const config = createGrantConfig("https://example.com");

			expect(config.github).toBeUndefined();
			expect(config.google).toBeUndefined();
			expect(config.defaults).toBeDefined();

			process.env.GITHUB_CLIENT_ID = originalGithubId;
			process.env.GITHUB_CLIENT_SECRET = originalGithubSecret;
			process.env.GOOGLE_CLIENT_ID = originalGoogleId;
			process.env.GOOGLE_CLIENT_SECRET = originalGoogleSecret;
			resetConfig();
		});
	});
});
