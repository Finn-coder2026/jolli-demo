import {
	clearEmailSelectionCookie,
	getEmailSelectionCookieData,
	hasEmailSelectionCookie,
	saveLastAccessedTenant,
	saveRememberMePreference,
	setAuthCookieDomain,
	setEmailSelectionCookieDomain,
	setLastAccessedTenantCookieDomain,
	setRememberMeCookieDomain,
} from "./AuthCookieUtil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setTestCookie(cookie: string): void {
	// biome-ignore lint/suspicious/noDocumentCookie: Tests need to seed/clear jsdom cookies directly
	document.cookie = cookie;
}

function clearAllCookies(): void {
	for (const cookie of document.cookie.split(";")) {
		const name = cookie.split("=")[0]?.trim();
		if (!name) {
			continue;
		}
		setTestCookie(`${name}=; path=/; max-age=0`);
	}
}

describe("AuthCookieUtil email selection helpers", () => {
	beforeEach(() => {
		clearAllCookies();
		setAuthCookieDomain(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("hasEmailSelectionCookie should return false when cookie is absent", () => {
		expect(hasEmailSelectionCookie()).toBe(false);
	});

	it("hasEmailSelectionCookie should return true when cookie is present", () => {
		setTestCookie("email_selection=%7B%22code%22%3A%22abc%22%7D; path=/");
		expect(hasEmailSelectionCookie()).toBe(true);
	});

	it("getEmailSelectionCookieData should return undefined when cookie is absent", () => {
		expect(getEmailSelectionCookieData()).toBeUndefined();
	});

	it("getEmailSelectionCookieData should return undefined for invalid JSON", () => {
		setTestCookie("email_selection=not-json; path=/");
		expect(getEmailSelectionCookieData()).toBeUndefined();
	});

	it("getEmailSelectionCookieData should return undefined when code is missing", () => {
		setTestCookie(`email_selection=${encodeURIComponent(JSON.stringify({ primary: "u@example.com" }))}; path=/`);
		expect(getEmailSelectionCookieData()).toBeUndefined();
	});

	it("getEmailSelectionCookieData should parse code and primary when provided", () => {
		setTestCookie(
			`email_selection=${encodeURIComponent(JSON.stringify({ code: "abc", primary: "u@example.com" }))}; path=/`,
		);
		expect(getEmailSelectionCookieData()).toEqual({
			code: "abc",
			primary: "u@example.com",
		});
	});

	it("getEmailSelectionCookieData should return code-only payload when primary is absent", () => {
		setTestCookie(`email_selection=${encodeURIComponent(JSON.stringify({ code: "abc" }))}; path=/`);
		expect(getEmailSelectionCookieData()).toEqual({ code: "abc" });
	});

	it("clearEmailSelectionCookie should clear host-only cookie", () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
		const writes: Array<string> = [];
		Object.defineProperty(document, "cookie", {
			get: () => "",
			set: (value: string) => {
				writes.push(value);
			},
			configurable: true,
		});

		setEmailSelectionCookieDomain(undefined);
		clearEmailSelectionCookie();

		expect(writes.length).toBe(1);
		expect(writes[0]).toContain("email_selection=");
		expect(writes[0]).toContain("max-age=0");

		if (originalDescriptor) {
			Object.defineProperty(document, "cookie", originalDescriptor);
		}
	});

	it("clearEmailSelectionCookie should clear both host-only and configured domain cookie", () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
		const writes: Array<string> = [];
		Object.defineProperty(document, "cookie", {
			get: () => "",
			set: (value: string) => {
				writes.push(value);
			},
			configurable: true,
		});

		setEmailSelectionCookieDomain(".jolli.ai");
		clearEmailSelectionCookie();

		expect(writes.length).toBe(2);
		expect(writes[0]).toContain("email_selection=");
		expect(writes[1]).toContain("domain=.jolli.ai");

		if (originalDescriptor) {
			Object.defineProperty(document, "cookie", originalDescriptor);
		}
	});

	it("domain aliases should share the same domain configuration", () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
		const writes: Array<string> = [];
		Object.defineProperty(document, "cookie", {
			get: () => "",
			set: (value: string) => {
				writes.push(value);
			},
			configurable: true,
		});

		setRememberMeCookieDomain(".shared.test");
		saveRememberMePreference(true);
		setLastAccessedTenantCookieDomain(".shared-2.test");
		saveRememberMePreference(true);

		expect(writes.some(cookie => cookie.includes("domain=.shared.test"))).toBe(true);
		expect(writes.some(cookie => cookie.includes("domain=.shared-2.test"))).toBe(true);

		if (originalDescriptor) {
			Object.defineProperty(document, "cookie", originalDescriptor);
		}
	});

	it("saveLastAccessedTenant should swallow serialization errors", () => {
		vi.spyOn(JSON, "stringify").mockImplementation(() => {
			throw new Error("serialization failed");
		});
		expect(() => saveLastAccessedTenant("tenant-1", "org-1")).not.toThrow();
	});
});
