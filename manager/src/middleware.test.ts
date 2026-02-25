import { middleware } from "./middleware";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock jose
vi.mock("jose", () => ({
	jwtVerify: vi.fn(),
}));

// Mock NextResponse
vi.mock("next/server", () => ({
	NextResponse: {
		next: vi.fn((options?: { request?: { headers: Headers } }) => ({
			type: "next",
			...(options?.request?.headers && { headers: options.request.headers }),
		})),
		redirect: vi.fn((url: URL) => ({
			type: "redirect",
			url: url.toString(),
			cookies: {
				set: vi.fn(),
			},
		})),
		json: vi.fn((data: unknown, init?: { status?: number }) => ({
			type: "json",
			data,
			status: init?.status,
		})),
	},
}));

function createMockRequest(host: string, url: string, pathname?: string, options?: { cookie?: string }) {
	const urlObj = new URL(url);
	return {
		headers: {
			get: (name: string) => (name === "host" ? host : null),
		},
		url,
		nextUrl: {
			pathname: pathname ?? urlObj.pathname,
		},
		cookies: {
			get: (name: string) =>
				name === "manager_auth_token" && options?.cookie ? { value: options.cookie } : undefined,
		},
	} as unknown as Parameters<typeof middleware>[0];
}

describe("middleware", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		// Stub required auth env vars as empty to disable auth checks for these tests
		vi.stubEnv("TOKEN_SECRET", "");
	});

	it("should pass through when ADMIN_DOMAIN is not set", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/", "/");
		const response = await middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should redirect from localhost to ADMIN_DOMAIN", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants");
		const response = await middleware(request);
		expect(response).toMatchObject({
			type: "redirect",
			url: "http://admin.localhost:3034/tenants",
		});
	});

	it("should preserve path when redirecting", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest(
			"localhost:3034",
			"http://localhost:3034/tenants/123/orgs",
			"/tenants/123/orgs",
		);
		const response = await middleware(request);
		expect(response).toMatchObject({
			type: "redirect",
			url: "http://admin.localhost:3034/tenants/123/orgs",
		});
	});

	it("should not redirect when already on ADMIN_DOMAIN", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest("admin.localhost:3034", "http://admin.localhost:3034/", "/");
		const response = await middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should handle missing host header", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = {
			headers: {
				get: () => null,
			},
			url: "http://localhost:3034/",
			nextUrl: {
				pathname: "/",
			},
			cookies: {
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Intentionally returns undefined
				get: () => {},
			},
		} as unknown as Parameters<typeof middleware>[0];
		const response = await middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should use HTTPS without port when GATEWAY_DOMAIN is set", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.mydomain.dev");
		vi.stubEnv("GATEWAY_DOMAIN", "mydomain.dev");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants");
		const response = await middleware(request);
		expect(response).toMatchObject({
			type: "redirect",
			url: "https://admin.mydomain.dev/tenants",
		});
	});

	it("should preserve port when GATEWAY_DOMAIN is not set", async () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.lvh.me");
		vi.stubEnv("GATEWAY_DOMAIN", "");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants");
		const response = await middleware(request);
		expect(response).toMatchObject({
			type: "redirect",
			url: "http://admin.lvh.me:3034/tenants",
		});
	});

	describe("authentication", () => {
		beforeEach(() => {
			vi.stubEnv("ADMIN_DOMAIN", "");
			vi.stubEnv("TOKEN_SECRET", "test-secret");
			vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
			vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
		});

		it("should allow public paths without auth", async () => {
			const request = createMockRequest("localhost:3034", "http://localhost:3034/login", "/login");
			const response = await middleware(request);
			expect(response).toEqual({ type: "next" });
		});

		it("should allow /api/auth/login without auth", async () => {
			const request = createMockRequest(
				"localhost:3034",
				"http://localhost:3034/api/auth/login",
				"/api/auth/login",
			);
			const response = await middleware(request);
			expect(response).toEqual({ type: "next" });
		});

		it("should allow /api/auth/callback without auth", async () => {
			const request = createMockRequest(
				"localhost:3034",
				"http://localhost:3034/api/auth/callback",
				"/api/auth/callback",
			);
			const response = await middleware(request);
			expect(response).toEqual({ type: "next" });
		});

		it("should redirect pages to login when no token", async () => {
			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants");
			const response = await middleware(request);
			expect(response).toMatchObject({
				type: "redirect",
				url: "http://localhost:3034/login",
			});
		});

		it("should return 401 for API routes when no token", async () => {
			const request = createMockRequest("localhost:3034", "http://localhost:3034/api/tenants", "/api/tenants");
			await middleware(request);
			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Unauthorized" }, { status: 401 });
		});

		it("should attach user info to headers when token is valid", async () => {
			vi.mocked(jwtVerify).mockResolvedValue({
				payload: { userId: 1, email: "test@example.com", role: "super_admin" },
				protectedHeader: { alg: "HS256" },
			});

			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants", {
				cookie: "valid-token",
			});
			const response = await middleware(request);

			expect(response.type).toBe("next");
			expect(response.headers).toBeDefined();
			expect(response.headers.get("x-user-id")).toBe("1");
			expect(response.headers.get("x-user-email")).toBe("test@example.com");
			expect(response.headers.get("x-user-role")).toBe("super_admin");
		});

		it("should redirect pages to login when token is invalid", async () => {
			vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid token"));

			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants", {
				cookie: "invalid-token",
			});
			const response = await middleware(request);

			expect(response).toMatchObject({
				type: "redirect",
				url: "http://localhost:3034/login",
			});
		});

		it("should return 401 for API routes when token is invalid", async () => {
			vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid token"));

			const request = createMockRequest("localhost:3034", "http://localhost:3034/api/tenants", "/api/tenants", {
				cookie: "invalid-token",
			});
			await middleware(request);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Unauthorized" }, { status: 401 });
		});

		it("should reject token with missing userId", async () => {
			vi.mocked(jwtVerify).mockResolvedValue({
				payload: { email: "test@example.com", role: "super_admin" },
				protectedHeader: { alg: "HS256" },
			});

			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants", {
				cookie: "incomplete-token",
			});
			const response = await middleware(request);

			expect(response).toMatchObject({
				type: "redirect",
				url: "http://localhost:3034/login",
			});
		});

		it("should reject token with missing email", async () => {
			vi.mocked(jwtVerify).mockResolvedValue({
				payload: { userId: 1, role: "super_admin" },
				protectedHeader: { alg: "HS256" },
			});

			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants", {
				cookie: "incomplete-token",
			});
			const response = await middleware(request);

			expect(response).toMatchObject({
				type: "redirect",
				url: "http://localhost:3034/login",
			});
		});

		it("should reject token with missing role", async () => {
			vi.mocked(jwtVerify).mockResolvedValue({
				payload: { userId: 1, email: "test@example.com" },
				protectedHeader: { alg: "HS256" },
			});

			const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants", "/tenants", {
				cookie: "incomplete-token",
			});
			const response = await middleware(request);

			expect(response).toMatchObject({
				type: "redirect",
				url: "http://localhost:3034/login",
			});
		});
	});
});
