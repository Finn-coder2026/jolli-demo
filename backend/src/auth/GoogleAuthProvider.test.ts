import { resetConfig } from "../config/Config";
import { createGoogleAuthProvider } from "./GoogleAuthProvider";
import { describe, expect, it } from "vitest";

describe("GoogleAuthProvider", () => {
	describe("createConfig", () => {
		it("should return config when env vars are set", () => {
			const originalId = process.env.GOOGLE_CLIENT_ID;
			const originalSecret = process.env.GOOGLE_CLIENT_SECRET;

			process.env.GOOGLE_CLIENT_ID = "test-id";
			process.env.GOOGLE_CLIENT_SECRET = "test-secret";
			resetConfig();

			const provider = createGoogleAuthProvider();
			const config = provider.createConfig();

			expect(config).toEqual({
				key: "test-id",
				secret: "test-secret",
				scope: ["openid", "email", "profile"],
			});

			process.env.GOOGLE_CLIENT_ID = originalId;
			process.env.GOOGLE_CLIENT_SECRET = originalSecret;
			resetConfig();
		});

		it("should return undefined when env vars are missing", () => {
			const originalId = process.env.GOOGLE_CLIENT_ID;
			const originalSecret = process.env.GOOGLE_CLIENT_SECRET;

			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.GOOGLE_CLIENT_SECRET;
			resetConfig();

			const provider = createGoogleAuthProvider();
			const config = provider.createConfig();

			expect(config).toBeUndefined();

			process.env.GOOGLE_CLIENT_ID = originalId;
			process.env.GOOGLE_CLIENT_SECRET = originalSecret;
			resetConfig();
		});
	});

	describe("getSelectedEmail", () => {
		it("should return email from user data", () => {
			const provider = createGoogleAuthProvider();
			const userData = {
				id: "67890",
				email: "test@gmail.com",
			};

			const email = provider.getSelectedEmail(userData);

			expect(email).toBe("test@gmail.com");
		});
	});

	describe("getVerifiedEmails", () => {
		it("should return empty array", async () => {
			const provider = createGoogleAuthProvider();
			const emails = await provider.getVerifiedEmails("test-token");

			expect(emails).toEqual([]);
		});
	});

	describe("createAuth", () => {
		it("should convert user data with all fields", () => {
			const provider = createGoogleAuthProvider();
			const userData = {
				id: "67890",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			};

			const auth = provider.newAuth(userData, "test@gmail.com");

			expect(auth).toEqual({
				provider: "google",
				subject: "67890",
				email: "test@gmail.com",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			});
		});

		it("should set picture to undefined if missing", () => {
			const provider = createGoogleAuthProvider();
			const userData = {
				id: "67890",
				name: "Test User",
			};

			const auth = provider.newAuth(userData, "test@gmail.com");

			expect(auth.picture).toBeUndefined();
		});
	});

	describe("url", () => {
		it("should return Google OAuth2 userinfo endpoint", () => {
			const provider = createGoogleAuthProvider();
			expect(provider.url).toBe("https://www.googleapis.com/oauth2/v2/userinfo");
		});
	});
});
