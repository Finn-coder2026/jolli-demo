import { middleware } from "./middleware";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock NextResponse
vi.mock("next/server", () => ({
	NextResponse: {
		next: vi.fn(() => ({ type: "next" })),
		redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.toString() })),
	},
}));

function createMockRequest(host: string, url: string) {
	return {
		headers: {
			get: (name: string) => (name === "host" ? host : null),
		},
		url,
	} as unknown as Parameters<typeof middleware>[0];
}

describe("middleware", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it("should pass through when ADMIN_DOMAIN is not set", () => {
		vi.stubEnv("ADMIN_DOMAIN", "");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/");
		const response = middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should redirect from localhost to ADMIN_DOMAIN", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants");
		const response = middleware(request);
		expect(response).toEqual({
			type: "redirect",
			url: "http://admin.localhost:3034/tenants",
		});
	});

	it("should preserve path when redirecting", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants/123/orgs");
		const response = middleware(request);
		expect(response).toEqual({
			type: "redirect",
			url: "http://admin.localhost:3034/tenants/123/orgs",
		});
	});

	it("should not redirect when already on ADMIN_DOMAIN", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = createMockRequest("admin.localhost:3034", "http://admin.localhost:3034/");
		const response = middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should handle missing host header", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.localhost");
		const request = {
			headers: {
				get: () => null,
			},
			url: "http://localhost:3034/",
		} as unknown as Parameters<typeof middleware>[0];
		const response = middleware(request);
		expect(response).toEqual({ type: "next" });
	});

	it("should use HTTPS without port when GATEWAY_DOMAIN is set", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.mydomain.dev");
		vi.stubEnv("GATEWAY_DOMAIN", "mydomain.dev");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants");
		const response = middleware(request);
		expect(response).toEqual({
			type: "redirect",
			url: "https://admin.mydomain.dev/tenants",
		});
	});

	it("should preserve port when GATEWAY_DOMAIN is not set", () => {
		vi.stubEnv("ADMIN_DOMAIN", "admin.lvh.me");
		vi.stubEnv("GATEWAY_DOMAIN", "");
		const request = createMockRequest("localhost:3034", "http://localhost:3034/tenants");
		const response = middleware(request);
		expect(response).toEqual({
			type: "redirect",
			url: "http://admin.lvh.me:3034/tenants",
		});
	});
});
