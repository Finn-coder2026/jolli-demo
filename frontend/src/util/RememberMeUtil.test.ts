import {
	clearRememberMePreference,
	getRememberMePreference,
	REMEMBER_ME_COOKIE_NAME,
	saveRememberMePreference,
	setRememberMeCookieDomain,
} from "./AuthCookieUtil";
import { beforeEach, describe, expect, it } from "vitest";

describe("RememberMeUtil", () => {
	beforeEach(() => {
		// Clear all cookies before each test
		for (const cookie of document.cookie.split(";")) {
			const name = cookie.split("=")[0].trim();
			// biome-ignore lint/suspicious/noDocumentCookie: test cleanup requires direct cookie manipulation
			document.cookie = `${name}=; path=/; max-age=0`;
		}
		// Reset cookie domain to undefined (no domain attribute)
		setRememberMeCookieDomain(undefined);
	});

	describe("REMEMBER_ME_COOKIE_NAME", () => {
		it("should have correct cookie name", () => {
			expect(REMEMBER_ME_COOKIE_NAME).toBe("jolli_rememberMe_pref");
		});
	});

	describe("getRememberMePreference", () => {
		it("should return false when cookie is not set", () => {
			expect(getRememberMePreference()).toBe(false);
		});

		it("should return false when cookie value is not 'true'", () => {
			// biome-ignore lint/suspicious/noDocumentCookie: test setup requires direct cookie manipulation
			document.cookie = `${REMEMBER_ME_COOKIE_NAME}=false; path=/`;
			expect(getRememberMePreference()).toBe(false);
		});

		it("should return true when cookie value is 'true'", () => {
			// biome-ignore lint/suspicious/noDocumentCookie: test setup requires direct cookie manipulation
			document.cookie = `${REMEMBER_ME_COOKIE_NAME}=true; path=/`;
			expect(getRememberMePreference()).toBe(true);
		});
	});

	describe("saveRememberMePreference", () => {
		it("should save true value to cookie", () => {
			saveRememberMePreference(true);
			expect(document.cookie).toContain(`${REMEMBER_ME_COOKIE_NAME}=true`);
		});

		it("should save false value to cookie", () => {
			saveRememberMePreference(false);
			expect(document.cookie).toContain(`${REMEMBER_ME_COOKIE_NAME}=false`);
		});
	});

	describe("clearRememberMePreference", () => {
		it("should remove preference cookie", () => {
			// Set the cookie first
			// biome-ignore lint/suspicious/noDocumentCookie: test setup requires direct cookie manipulation
			document.cookie = `${REMEMBER_ME_COOKIE_NAME}=true; path=/`;
			expect(document.cookie).toContain(REMEMBER_ME_COOKIE_NAME);

			// Clear it
			clearRememberMePreference();

			// Cookie should be gone (or empty value)
			expect(getRememberMePreference()).toBe(false);
		});

		it("should work when cookie does not exist", () => {
			// Should not throw when cookie doesn't exist
			expect(() => clearRememberMePreference()).not.toThrow();
		});
	});

	describe("setRememberMeCookieDomain", () => {
		it("should allow setting cookie domain", () => {
			// Just verify it doesn't throw
			expect(() => setRememberMeCookieDomain(".example.com")).not.toThrow();
		});

		it("should allow setting undefined domain", () => {
			// Just verify it doesn't throw
			expect(() => setRememberMeCookieDomain(undefined)).not.toThrow();
		});

		it("should work with save and clear after setting domain", () => {
			// Note: In jsdom, domain attribute may not work exactly like a real browser
			// but we can still verify the functions don't throw
			setRememberMeCookieDomain(".test.local");
			expect(() => saveRememberMePreference(true)).not.toThrow();
			expect(() => clearRememberMePreference()).not.toThrow();
		});
	});

	describe("error handling", () => {
		it("should return false when document.cookie getter throws in getRememberMePreference", () => {
			// Mock document.cookie to throw when accessed
			const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

			Object.defineProperty(document, "cookie", {
				get: () => {
					throw new Error("Cookie access denied");
				},
				configurable: true,
			});

			const result = getRememberMePreference();
			expect(result).toBe(false);

			// Restore original cookie behavior
			if (originalDescriptor) {
				Object.defineProperty(document, "cookie", originalDescriptor);
			}
		});

		it("should not throw when document.cookie setter throws in saveRememberMePreference", () => {
			// Mock document.cookie to throw when set
			const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

			Object.defineProperty(document, "cookie", {
				get: () => "",
				set: () => {
					throw new Error("Cookie write denied");
				},
				configurable: true,
			});

			// Should not throw, just silently fail
			expect(() => saveRememberMePreference(true)).not.toThrow();

			// Restore original cookie behavior
			if (originalDescriptor) {
				Object.defineProperty(document, "cookie", originalDescriptor);
			}
		});

		it("should not throw when document.cookie setter throws in clearRememberMePreference", () => {
			// Mock document.cookie to throw when set
			const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

			Object.defineProperty(document, "cookie", {
				get: () => "",
				set: () => {
					throw new Error("Cookie write denied");
				},
				configurable: true,
			});

			// Should not throw, just silently fail
			expect(() => clearRememberMePreference()).not.toThrow();

			// Restore original cookie behavior
			if (originalDescriptor) {
				Object.defineProperty(document, "cookie", originalDescriptor);
			}
		});
	});
});
