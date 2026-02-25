import { isRetryableConnectionError } from "./Sequelize";
import { describe, expect, it } from "vitest";

describe("isRetryableConnectionError", () => {
	it("returns false for non-Error values", () => {
		expect(isRetryableConnectionError("string error")).toBe(false);
		expect(isRetryableConnectionError(null)).toBe(false);
		expect(isRetryableConnectionError(undefined)).toBe(false);
		expect(isRetryableConnectionError(42)).toBe(false);
	});

	it("returns true for ECONNREFUSED", () => {
		const error = Object.assign(new Error("Connection refused"), {
			parent: { code: "ECONNREFUSED" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for ECONNRESET", () => {
		const error = Object.assign(new Error("Connection reset"), {
			parent: { code: "ECONNRESET" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for ECONNABORTED", () => {
		const error = Object.assign(new Error("Connection aborted"), {
			parent: { code: "ECONNABORTED" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for ENOTFOUND (DNS)", () => {
		const error = Object.assign(new Error("DNS lookup failed"), {
			parent: { code: "ENOTFOUND" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for EAI_AGAIN (DNS)", () => {
		const error = Object.assign(new Error("DNS temporary failure"), {
			parent: { code: "EAI_AGAIN" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for ETIMEDOUT", () => {
		const error = Object.assign(new Error("Connection timed out"), {
			parent: { code: "ETIMEDOUT" },
		});
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for timeout in error message", () => {
		const error = new Error("Connection timeout exceeded");
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for Neon endpoint not found", () => {
		const error = new Error("endpoint is not found");
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns true for DNS translation failure", () => {
		const error = new Error("could not translate host name");
		expect(isRetryableConnectionError(error)).toBe(true);
	});

	it("returns false for authentication errors", () => {
		const error = new Error("password authentication failed for user");
		expect(isRetryableConnectionError(error)).toBe(false);
	});

	it("returns false for generic errors without parent code", () => {
		const error = new Error("Some other error");
		expect(isRetryableConnectionError(error)).toBe(false);
	});
});
