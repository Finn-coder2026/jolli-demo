import { issueVisitorCookie } from "./Cookies";
import type { Request, Response } from "express-serve-static-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./Env", () => ({
	getEnvOrError: vi.fn((key: string) => {
		if (key === "SESSION_SECRET") {
			return "test-session-secret";
		}
		if (key === "ORIGIN") {
			return "https://localhost:8034";
		}
		return "";
	}),
}));

describe("issueVisitorCookie", () => {
	let mockRequest: Request;
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest = {
			cookies: {},
		} as Request;

		mockResponse = {
			cookie: vi.fn(),
		} as unknown as Response;
	});

	it("should create a new visitor ID when no cookie exists", () => {
		const visitorId = issueVisitorCookie(mockRequest, mockResponse);

		expect(visitorId).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", visitorId, {
			httpOnly: true,
			maxAge: 365 * 24 * 60 * 60 * 1000,
			path: "/",
			sameSite: "strict",
			secure: true,
		});
	});

	it("should reuse existing visitor ID from cookie", () => {
		mockRequest.cookies = { visitorId: "existing-visitor-id" };

		const visitorId = issueVisitorCookie(mockRequest, mockResponse);

		expect(visitorId).toBe("existing-visitor-id");
		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", "existing-visitor-id", {
			httpOnly: true,
			maxAge: 365 * 24 * 60 * 60 * 1000,
			path: "/",
			sameSite: "strict",
			secure: true,
		});
	});

	it("should set correct cookie options", () => {
		issueVisitorCookie(mockRequest, mockResponse);

		const expectedOptions = {
			httpOnly: true,
			maxAge: 31536000000,
			path: "/",
			sameSite: "strict",
			secure: true,
		};

		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", expect.any(String), expectedOptions);
	});
});

describe("expressSessionHandler", () => {
	it("should create session handler", async () => {
		const { expressSessionHandler } = await import("./Cookies");
		const mockSequelize = {
			define: vi.fn().mockReturnValue({
				sync: vi.fn().mockResolvedValue(undefined),
			}),
		};

		const handler = await expressSessionHandler(mockSequelize as never);

		expect(handler).toBeDefined();
		expect(typeof handler).toBe("function");
	});
});
