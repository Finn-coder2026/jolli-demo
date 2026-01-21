import * as Config from "../config/Config";
import { resetConfig } from "../config/Config";
import { createAuthHandler } from "./AuthHandler";
import { createTokenUtil } from "./TokenUtil";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AuthHandler", () => {
	let app: Express;
	let authToken: string;
	let nonJolliAuthToken: string;
	let partnerAuthToken: string;
	let originalAuthEmails: string | undefined;
	let originalSuperAdminEmails: string | undefined;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	beforeEach(() => {
		// Save original env
		originalAuthEmails = process.env.AUTH_EMAILS;
		originalSuperAdminEmails = process.env.SUPER_ADMIN_EMAILS;

		// Set default auth emails for tests
		process.env.AUTH_EMAILS = "@jolli\\.ai$";
		delete process.env.SUPER_ADMIN_EMAILS;
		resetConfig(); // Reset config cache after env change

		app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use(createAuthHandler(tokenUtil));
		app.get("/protected", (_req, res) => {
			res.json({ message: "success" });
		});

		// Generate valid auth token for Jolli user
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});

		// Generate auth token for non-Jolli user
		nonJolliAuthToken = tokenUtil.generateToken({
			userId: 2,
			name: "External User",
			email: "test@external.com",
			picture: "https://example.com/pic.jpg",
		});

		// Generate auth token for partner user
		partnerAuthToken = tokenUtil.generateToken({
			userId: 3,
			name: "Partner User",
			email: "test@partner.com",
			picture: "https://example.com/pic.jpg",
		});
	});

	afterEach(() => {
		// Restore original env
		if (originalAuthEmails === undefined) {
			delete process.env.AUTH_EMAILS;
		} else {
			process.env.AUTH_EMAILS = originalAuthEmails;
		}
		if (originalSuperAdminEmails === undefined) {
			delete process.env.SUPER_ADMIN_EMAILS;
		} else {
			process.env.SUPER_ADMIN_EMAILS = originalSuperAdminEmails;
		}
		resetConfig(); // Reset config cache after env restore
		vi.restoreAllMocks();
	});

	it("should allow access with valid Jolli auth token", async () => {
		const response = await request(app).get("/protected").set("Cookie", `authToken=${authToken}`);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ message: "success" });
	});

	it("should deny access without auth token", async () => {
		const response = await request(app).get("/protected");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Not authorized" });
	});

	it("should deny access with invalid auth token", async () => {
		const response = await request(app).get("/protected").set("Cookie", "authToken=invalid-token");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Not authorized" });
	});

	it("should deny access with expired auth token", async () => {
		const expiredTokenUtil = createTokenUtil<UserInfo>("test-secret", {
			algorithm: "HS256",
			expiresIn: "0s",
		});

		const expiredToken = expiredTokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});

		const response = await request(app).get("/protected").set("Cookie", `authToken=${expiredToken}`);

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Not authorized" });
	});

	it("should deny access with non-Jolli email", async () => {
		const response = await request(app).get("/protected").set("Cookie", `authToken=${nonJolliAuthToken}`);

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Email not authorized" });
	});

	it("should deny access with missing cookie header", async () => {
		const response = await request(app).get("/protected");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Not authorized" });
	});

	it("should allow access with multiple allowed email patterns", async () => {
		process.env.AUTH_EMAILS = "@jolli\\.ai$,@partner\\.com$";
		resetConfig(); // Reset config cache after env change

		const customApp = express();
		customApp.use(cookieParser());
		customApp.use(express.json());
		customApp.use(createAuthHandler(tokenUtil));
		customApp.get("/protected", (_req, res) => {
			res.json({ message: "success" });
		});

		// Test jolli.ai email
		const jolliResponse = await request(customApp).get("/protected").set("Cookie", `authToken=${authToken}`);
		expect(jolliResponse.status).toBe(200);
		expect(jolliResponse.body).toEqual({ message: "success" });

		// Test partner.com email
		const partnerResponse = await request(customApp)
			.get("/protected")
			.set("Cookie", `authToken=${partnerAuthToken}`);
		expect(partnerResponse.status).toBe(200);
		expect(partnerResponse.body).toEqual({ message: "success" });

		// Test external.com email (not allowed)
		const externalResponse = await request(customApp)
			.get("/protected")
			.set("Cookie", `authToken=${nonJolliAuthToken}`);
		expect(externalResponse.status).toBe(401);
		expect(externalResponse.body).toEqual({ error: "Email not authorized" });
	});

	it("should support complex regex patterns", async () => {
		process.env.AUTH_EMAILS = "^admin@.*,@jolli\\.ai$";
		resetConfig(); // Reset config cache after env change

		const adminToken = tokenUtil.generateToken({
			userId: 4,
			name: "Admin User",
			email: "admin@anywhere.com",
			picture: "https://example.com/pic.jpg",
		});

		const customApp = express();
		customApp.use(cookieParser());
		customApp.use(express.json());
		customApp.use(createAuthHandler(tokenUtil));
		customApp.get("/protected", (_req, res) => {
			res.json({ message: "success" });
		});

		// Test admin@ pattern
		const adminResponse = await request(customApp).get("/protected").set("Cookie", `authToken=${adminToken}`);
		expect(adminResponse.status).toBe(200);
		expect(adminResponse.body).toEqual({ message: "success" });

		// Test jolli.ai pattern
		const jolliResponse = await request(customApp).get("/protected").set("Cookie", `authToken=${authToken}`);
		expect(jolliResponse.status).toBe(200);
		expect(jolliResponse.body).toEqual({ message: "success" });
	});

	it("should allow access for super admin emails regardless of AUTH_EMAILS", async () => {
		// Set AUTH_EMAILS to only allow jolli.ai, but SUPER_ADMIN_EMAILS allows external.com
		process.env.AUTH_EMAILS = "@jolli\\.ai$";
		process.env.SUPER_ADMIN_EMAILS = "@external\\.com$";
		resetConfig();

		const customApp = express();
		customApp.use(cookieParser());
		customApp.use(express.json());
		customApp.use(createAuthHandler(tokenUtil));
		customApp.get("/protected", (_req, res) => {
			res.json({ message: "success" });
		});

		// External user should be allowed as super admin
		const externalResponse = await request(customApp)
			.get("/protected")
			.set("Cookie", `authToken=${nonJolliAuthToken}`);
		expect(externalResponse.status).toBe(200);
		expect(externalResponse.body).toEqual({ message: "success" });

		// Jolli user should still be allowed via AUTH_EMAILS
		const jolliResponse = await request(customApp).get("/protected").set("Cookie", `authToken=${authToken}`);
		expect(jolliResponse.status).toBe(200);
		expect(jolliResponse.body).toEqual({ message: "success" });
	});

	it("should allow all emails when AUTH_EMAILS is wildcard", async () => {
		process.env.AUTH_EMAILS = "*";
		resetConfig();

		const customApp = express();
		customApp.use(cookieParser());
		customApp.use(express.json());
		customApp.use(createAuthHandler(tokenUtil));
		customApp.get("/protected", (_req, res) => {
			res.json({ message: "success" });
		});

		// Any email should be allowed
		const externalResponse = await request(customApp)
			.get("/protected")
			.set("Cookie", `authToken=${nonJolliAuthToken}`);
		expect(externalResponse.status).toBe(200);
		expect(externalResponse.body).toEqual({ message: "success" });

		const partnerResponse = await request(customApp)
			.get("/protected")
			.set("Cookie", `authToken=${partnerAuthToken}`);
		expect(partnerResponse.status).toBe(200);
		expect(partnerResponse.body).toEqual({ message: "success" });
	});

	describe("token refresh", () => {
		it("should refresh token when within refresh window", async () => {
			// Note: TOKEN_REFRESH_WINDOW can be overridden in .env.local (e.g., 45s for testing)
			// So we use a very short-lived token (10s) that will always be within the refresh window
			const shortLivedTokenUtil = createTokenUtil<UserInfo>("test-secret", {
				algorithm: "HS256",
				expiresIn: "10s",
			});

			const shortLivedToken = shortLivedTokenUtil.generateToken({
				userId: 1,
				name: "Test User",
				email: "test@jolli.ai",
				picture: "https://example.com/pic.jpg",
			});

			const customApp = express();
			customApp.use(cookieParser());
			customApp.use(express.json());
			customApp.use(createAuthHandler(shortLivedTokenUtil));
			customApp.get("/protected", (_req, res) => {
				res.json({ message: "success" });
			});

			const response = await request(customApp).get("/protected").set("Cookie", `authToken=${shortLivedToken}`);

			expect(response.status).toBe(200);
			expect(response.headers["x-token-refreshed"]).toBe("true");
			// Check that a new cookie was set
			expect(response.headers["set-cookie"]).toBeDefined();
		});

		it("should not refresh token when outside refresh window", async () => {
			// The default token expires in 1h, which is outside the 45m refresh window
			const response = await request(app).get("/protected").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.headers["x-token-refreshed"]).toBeUndefined();
		});

		it("should refresh token when using Authorization header", async () => {
			// Note: TOKEN_REFRESH_WINDOW can be overridden in .env.local (e.g., 45s for testing)
			// So we use a very short-lived token (10s) that will always be within the refresh window
			const shortLivedTokenUtil = createTokenUtil<UserInfo>("test-secret", {
				algorithm: "HS256",
				expiresIn: "10s",
			});

			const shortLivedToken = shortLivedTokenUtil.generateToken({
				userId: 1,
				name: "Test User",
				email: "test@jolli.ai",
				picture: "https://example.com/pic.jpg",
			});

			const customApp = express();
			customApp.use(cookieParser());
			customApp.use(express.json());
			customApp.use(createAuthHandler(shortLivedTokenUtil));
			customApp.get("/protected", (_req, res) => {
				res.json({ message: "success" });
			});

			// Use Authorization header instead of cookie
			const response = await request(customApp)
				.get("/protected")
				.set("Authorization", `Bearer ${shortLivedToken}`);

			expect(response.status).toBe(200);
			// Token refresh should still work with Authorization header
			expect(response.headers["x-token-refreshed"]).toBe("true");
		});

		it("should handle token without exp claim gracefully", async () => {
			// Create a token without exp claim (manually signed)
			const tokenWithoutExp = jwt.sign(
				{
					userId: 1,
					name: "Test User",
					email: "test@jolli.ai",
					picture: "https://example.com/pic.jpg",
				},
				"test-secret",
				{ algorithm: "HS256" }, // No expiresIn
			);

			const customApp = express();
			customApp.use(cookieParser());
			customApp.use(express.json());
			customApp.use(createAuthHandler(tokenUtil));
			customApp.get("/protected", (_req, res) => {
				res.json({ message: "success" });
			});

			const response = await request(customApp).get("/protected").set("Cookie", `authToken=${tokenWithoutExp}`);

			expect(response.status).toBe(200);
			// No refresh should happen since there's no exp
			expect(response.headers["x-token-refreshed"]).toBeUndefined();
		});

		it("should gracefully handle config errors during token refresh", async () => {
			// Mock getConfig to return config for email auth, but throw on second call (token refresh)
			let callCount = 0;
			vi.spyOn(Config, "getConfig").mockImplementation(() => {
				callCount++;
				if (callCount > 2) {
					// Third+ call (for token refresh) throws
					throw new Error("Config not available");
				}
				// First/second calls (for isMultiTenantAuthEnabled and email auth) return valid config
				return {
					AUTH_EMAILS: "@jolli\\.ai$",
					USE_MULTI_TENANT_AUTH: false,
				} as ReturnType<typeof Config.getConfig>;
			});

			const shortLivedTokenUtil = createTokenUtil<UserInfo>("test-secret", {
				algorithm: "HS256",
				expiresIn: "10s",
			});

			const shortLivedToken = shortLivedTokenUtil.generateToken({
				userId: 1,
				name: "Test User",
				email: "test@jolli.ai",
				picture: "https://example.com/pic.jpg",
			});

			const customApp = express();
			customApp.use(cookieParser());
			customApp.use(express.json());
			customApp.use(createAuthHandler(shortLivedTokenUtil));
			customApp.get("/protected", (_req, res) => {
				res.json({ message: "success" });
			});

			// Request should still succeed even if token refresh fails
			const response = await request(customApp).get("/protected").set("Cookie", `authToken=${shortLivedToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "success" });
			// No token refresh should happen since config failed
			expect(response.headers["x-token-refreshed"]).toBeUndefined();
		});
	});
});
