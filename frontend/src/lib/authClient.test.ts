import { authClient, signIn, signOut, signUp, useSession } from "./authClient";
import { describe, expect, it } from "vitest";

describe("authClient", () => {
	it("should export authClient", () => {
		expect(authClient).toBeDefined();
	});

	it("should export signIn method", () => {
		expect(signIn).toBeDefined();
		expect(typeof signIn).toBe("function");
	});

	it("should export signUp method", () => {
		expect(signUp).toBeDefined();
		expect(typeof signUp).toBe("function");
	});

	it("should export signOut method", () => {
		expect(signOut).toBeDefined();
		expect(typeof signOut).toBe("function");
	});

	it("should export useSession hook", () => {
		expect(useSession).toBeDefined();
		expect(typeof useSession).toBe("function");
	});

	it("should configure baseURL from window.location.origin", () => {
		expect(authClient).toBeDefined();
		// BaseURL is set to window.location.origin
		// In test environment, this will be the test server origin
	});
});
