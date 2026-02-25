// Import the module to ensure it's loaded
import { SESSION_TYPES_LOADED } from "./SessionTypes";
import type { Request } from "express-serve-static-core";
import { describe, expect, it } from "vitest";

describe("SessionTypes", () => {
	it("should load session types module", () => {
		expect(SESSION_TYPES_LOADED).toBe(true);
	});

	it("should extend Request interface with session types", () => {
		// Create a mock request object that uses the extended types
		const mockRequest = {
			session: {
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "/dashboard",
				},
				userId: 456,
				tenantId: "tenant-123",
				orgId: "org-456",
			},
		} as unknown as Partial<Request>;

		// Verify the session structure
		expect(mockRequest.session?.gatewayAuth?.tenantSlug).toBe("test-tenant");
		expect(mockRequest.session?.gatewayAuth?.returnTo).toBe("/dashboard");
		expect(mockRequest.session?.userId).toBe(456);
		expect(mockRequest.session?.tenantId).toBe("tenant-123");
		expect(mockRequest.session?.orgId).toBe("org-456");
	});

	it("should allow optional session properties", () => {
		const mockRequest = {
			session: {},
		} as unknown as Partial<Request>;

		expect(mockRequest.session?.gatewayAuth).toBeUndefined();
		expect(mockRequest.session?.pendingSiteAuth).toBeUndefined();
	});

	it("should allow undefined session", () => {
		const mockRequest: Partial<Request> = {};

		expect(mockRequest.session).toBeUndefined();
	});
});
