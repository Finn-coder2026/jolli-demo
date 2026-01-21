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
		const mockRequest: Partial<Request> = {
			session: {
				grant: {
					response: {
						access_token: "test-token",
					},
					provider: "github",
				},
				pendingAuth: {
					authJson: { userId: 123 },
					emails: ["test@example.com"],
				},
			},
		};

		// Verify the session structure
		expect(mockRequest.session?.grant?.response?.access_token).toBe("test-token");
		expect(mockRequest.session?.grant?.provider).toBe("github");
		expect(mockRequest.session?.pendingAuth?.authJson).toEqual({ userId: 123 });
		expect(mockRequest.session?.pendingAuth?.emails).toEqual(["test@example.com"]);
	});

	it("should allow optional session properties", () => {
		const mockRequest: Partial<Request> = {
			session: {},
		};

		expect(mockRequest.session?.grant).toBeUndefined();
		expect(mockRequest.session?.pendingAuth).toBeUndefined();
	});

	it("should allow undefined session", () => {
		const mockRequest: Partial<Request> = {};

		expect(mockRequest.session).toBeUndefined();
	});
});
