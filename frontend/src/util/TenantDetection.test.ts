import {
	buildValidationRequest,
	detectTenantMode,
	extractTenantFromUrl,
	type TenantDetectionResult,
} from "./TenantDetection";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalLocation = window.location;

function mockLocation(overrides: Partial<Location>): void {
	Object.defineProperty(window, "location", {
		writable: true,
		value: {
			...originalLocation,
			hostname: "jolli.me",
			pathname: "/",
			port: "",
			protocol: "https:",
			origin: "https://jolli.me",
			...overrides,
		},
	});
}

beforeEach(() => {
	mockLocation({});
});

afterEach(() => {
	Object.defineProperty(window, "location", { writable: true, value: originalLocation });
});

describe("detectTenantMode", () => {
	it("returns subdomain mode when hostname is a subdomain of baseDomain", () => {
		mockLocation({ hostname: "acme.jolli.me", pathname: "/dashboard" });

		const result = detectTenantMode("jolli.me");

		expect(result).toEqual({
			mode: "subdomain",
			tenantSlug: "acme",
			basename: "",
			needsApiValidation: true,
		});
	});

	it("returns custom mode when hostname does not match baseDomain at all", () => {
		mockLocation({ hostname: "docs.acme.com", pathname: "/" });

		const result = detectTenantMode("jolli.me");

		expect(result).toEqual({
			mode: "custom",
			tenantSlug: null,
			basename: "",
			needsApiValidation: true,
		});
	});

	it("returns path mode with tenant slug when pathname contains segments", () => {
		mockLocation({ hostname: "jolli.me", pathname: "/myteam/dashboard" });

		const result = detectTenantMode("jolli.me");

		expect(result).toEqual({
			mode: "path",
			tenantSlug: "myteam",
			basename: "/myteam",
			needsApiValidation: true,
		});
	});

	it("returns path mode with null tenant slug when pathname is root", () => {
		mockLocation({ hostname: "jolli.me", pathname: "/" });

		const result = detectTenantMode("jolli.me");

		expect(result).toEqual({
			mode: "path",
			tenantSlug: null,
			basename: "",
			needsApiValidation: true,
		});
	});
});

describe("buildValidationRequest", () => {
	it("includes X-Tenant-Slug header when tenantSlug is present", () => {
		const detection: TenantDetectionResult = {
			mode: "subdomain",
			tenantSlug: "acme",
			basename: "",
			needsApiValidation: true,
		};

		const request = buildValidationRequest(detection);

		expect(request.method).toBe("GET");
		expect(request.credentials).toBe("include");
		expect(request.headers).toEqual({
			"Content-Type": "application/json",
			"X-Tenant-Slug": "acme",
		});
	});

	it("omits X-Tenant-Slug header when tenantSlug is null", () => {
		const detection: TenantDetectionResult = {
			mode: "custom",
			tenantSlug: null,
			basename: "",
			needsApiValidation: true,
		};

		const request = buildValidationRequest(detection);

		expect(request.method).toBe("GET");
		expect(request.credentials).toBe("include");
		expect(request.headers).toEqual({
			"Content-Type": "application/json",
		});
	});
});

describe("extractTenantFromUrl", () => {
	it("returns tenant slug for subdomain mode", () => {
		mockLocation({ hostname: "acme.jolli.me", pathname: "/" });

		expect(extractTenantFromUrl("jolli.me")).toBe("acme");
	});

	it("returns null for custom domain mode", () => {
		mockLocation({ hostname: "docs.acme.com", pathname: "/" });

		expect(extractTenantFromUrl("jolli.me")).toBeNull();
	});

	it("returns tenant slug for path-based mode", () => {
		mockLocation({ hostname: "jolli.me", pathname: "/myteam/settings" });

		expect(extractTenantFromUrl("jolli.me")).toBe("myteam");
	});

	it("returns null for path-based mode at root", () => {
		mockLocation({ hostname: "jolli.me", pathname: "/" });

		expect(extractTenantFromUrl("jolli.me")).toBeNull();
	});
});
