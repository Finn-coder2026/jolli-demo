import {
	getForwardedHost,
	getForwardedProto,
	getRequestHost,
	getRequestHostname,
	getRequestProtocol,
} from "./RequestUtil";
import type { Request } from "express";

describe("RequestUtil", () => {
	describe("getForwardedHost", () => {
		it("should return X-Forwarded-Host when it is a string", () => {
			const req = { headers: { "x-forwarded-host": "forwarded.example.com" } } as unknown as Request;
			expect(getForwardedHost(req)).toBe("forwarded.example.com");
		});

		it("should return undefined when X-Forwarded-Host is an array", () => {
			const req = { headers: { "x-forwarded-host": ["a.com", "b.com"] } } as unknown as Request;
			expect(getForwardedHost(req)).toBeUndefined();
		});

		it("should return undefined when X-Forwarded-Host is not present", () => {
			const req = { headers: {} } as unknown as Request;
			expect(getForwardedHost(req)).toBeUndefined();
		});
	});

	describe("getForwardedProto", () => {
		it("should return X-Forwarded-Proto when it is a string", () => {
			const req = { headers: { "x-forwarded-proto": "https" } } as unknown as Request;
			expect(getForwardedProto(req)).toBe("https");
		});

		it("should return undefined when X-Forwarded-Proto is an array", () => {
			const req = { headers: { "x-forwarded-proto": ["https", "http"] } } as unknown as Request;
			expect(getForwardedProto(req)).toBeUndefined();
		});

		it("should return undefined when X-Forwarded-Proto is not present", () => {
			const req = { headers: {} } as unknown as Request;
			expect(getForwardedProto(req)).toBeUndefined();
		});
	});

	describe("getRequestHostname", () => {
		it("should return hostname without port from X-Forwarded-Host", () => {
			const req = { headers: { "x-forwarded-host": "example.com:8080" } } as unknown as Request;
			expect(getRequestHostname(req)).toBe("example.com");
		});

		it("should return hostname without port from host header", () => {
			const req = { headers: { host: "example.com:3000" } } as unknown as Request;
			expect(getRequestHostname(req)).toBe("example.com");
		});

		it("should return hostname when no port is present", () => {
			const req = { headers: { host: "example.com" } } as unknown as Request;
			expect(getRequestHostname(req)).toBe("example.com");
		});

		it("should return undefined when no host header is present", () => {
			const req = { headers: {} } as unknown as Request;
			expect(getRequestHostname(req)).toBeUndefined();
		});
	});

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
