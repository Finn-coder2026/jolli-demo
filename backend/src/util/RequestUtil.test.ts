import { getRequestHost, getRequestProtocol } from "./RequestUtil";
import type { Request } from "express";

describe("RequestUtil", () => {
	describe("getRequestHost", () => {
		it("should return X-Forwarded-Host when present", () => {
			const req = {
				headers: { "x-forwarded-host": "tenant.example.com", host: "backend.local" },
			} as unknown as Request;
			expect(getRequestHost(req)).toBe("tenant.example.com");
		});

		it("should return host header when X-Forwarded-Host is not present", () => {
			const req = { headers: { host: "backend.local" } } as unknown as Request;
			expect(getRequestHost(req)).toBe("backend.local");
		});

		it("should return undefined when no host headers present", () => {
			const req = { headers: {} } as unknown as Request;
			expect(getRequestHost(req)).toBeUndefined();
		});

		it("should ignore non-string X-Forwarded-Host", () => {
			const req = { headers: { "x-forwarded-host": ["a", "b"], host: "backend.local" } } as unknown as Request;
			expect(getRequestHost(req)).toBe("backend.local");
		});
	});

	describe("getRequestProtocol", () => {
		it("should return X-Forwarded-Proto when present", () => {
			const req = { headers: { "x-forwarded-proto": "https" }, protocol: "http" } as unknown as Request;
			expect(getRequestProtocol(req)).toBe("https");
		});

		it("should return req.protocol when X-Forwarded-Proto is not present", () => {
			const req = { headers: {}, protocol: "http" } as unknown as Request;
			expect(getRequestProtocol(req)).toBe("http");
		});

		it("should ignore non-string X-Forwarded-Proto", () => {
			const req = { headers: { "x-forwarded-proto": ["https", "http"] }, protocol: "http" } as unknown as Request;
			expect(getRequestProtocol(req)).toBe("http");
		});
	});
});
