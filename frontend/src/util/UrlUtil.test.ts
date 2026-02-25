import {
	copyToClipboard,
	formatDomainUrl,
	getDefaultSiteDomain,
	getPrimarySiteDomain,
	getVerifiedCustomDomain,
	isAllowedLinkUrl,
} from "./UrlUtil";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("isAllowedLinkUrl", () => {
	it("should allow https: URLs", () => {
		expect(isAllowedLinkUrl("https://example.com")).toBe(true);
	});

	it("should allow http: URLs", () => {
		expect(isAllowedLinkUrl("http://example.com")).toBe(true);
	});

	it("should allow mailto: URLs", () => {
		expect(isAllowedLinkUrl("mailto:user@example.com")).toBe(true);
	});

	it("should allow tel: URLs", () => {
		expect(isAllowedLinkUrl("tel:+15555555555")).toBe(true);
	});

	it("should block javascript: URLs", () => {
		expect(isAllowedLinkUrl("javascript:alert(1)")).toBe(false);
	});

	it("should block data: URLs", () => {
		expect(isAllowedLinkUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
	});

	it("should block file: URLs", () => {
		expect(isAllowedLinkUrl("file:///etc/passwd")).toBe(false);
	});

	it("should return false when the URL constructor throws", () => {
		vi.stubGlobal("URL", () => {
			throw new TypeError("Invalid URL");
		});

		expect(isAllowedLinkUrl("definitely-not-a-url")).toBe(false);

		vi.unstubAllGlobals();
	});
});

describe("UrlUtil", () => {
	describe("formatDomainUrl", () => {
		it("should add https:// prefix to domain without protocol", () => {
			expect(formatDomainUrl("example.com")).toBe("https://example.com");
		});

		it("should add https:// prefix to subdomain without protocol", () => {
			expect(formatDomainUrl("docs.example.com")).toBe("https://docs.example.com");
		});

		it("should not modify URL with http:// prefix", () => {
			expect(formatDomainUrl("http://example.com")).toBe("http://example.com");
		});

		it("should not modify URL with https:// prefix", () => {
			expect(formatDomainUrl("https://example.com")).toBe("https://example.com");
		});

		it("should handle URL with path", () => {
			expect(formatDomainUrl("example.com/path")).toBe("https://example.com/path");
		});
	});

	describe("copyToClipboard", () => {
		const mockWriteText = vi.fn();

		beforeEach(() => {
			vi.clearAllMocks();
			Object.assign(navigator, {
				clipboard: {
					writeText: mockWriteText,
				},
			});
		});

		it("should copy text to clipboard and return true on success", async () => {
			mockWriteText.mockResolvedValue(undefined);

			const result = await copyToClipboard("test text");

			expect(mockWriteText).toHaveBeenCalledWith("test text");
			expect(result).toBe(true);
		});

		it("should return false when clipboard write fails", async () => {
			mockWriteText.mockRejectedValue(new Error("Clipboard error"));

			const result = await copyToClipboard("test text");

			expect(mockWriteText).toHaveBeenCalledWith("test text");
			expect(result).toBe(false);
		});
	});

	describe("getVerifiedCustomDomain", () => {
		it("should return verified custom domain when available", () => {
			const docsite = {
				metadata: {
					customDomains: [
						{ domain: "pending.example.com", status: "pending" },
						{ domain: "docs.example.com", status: "verified" },
					],
				},
			} as SiteWithUpdate;

			expect(getVerifiedCustomDomain(docsite)).toBe("docs.example.com");
		});

		it("should return undefined when no verified custom domain", () => {
			const docsite = {
				metadata: {
					customDomains: [{ domain: "pending.example.com", status: "pending" }],
				},
			} as SiteWithUpdate;

			expect(getVerifiedCustomDomain(docsite)).toBeUndefined();
		});

		it("should return undefined when customDomains is empty", () => {
			const docsite = {
				metadata: { customDomains: [] },
			} as unknown as SiteWithUpdate;

			expect(getVerifiedCustomDomain(docsite)).toBeUndefined();
		});

		it("should return undefined when metadata is undefined", () => {
			const docsite = {} as SiteWithUpdate;

			expect(getVerifiedCustomDomain(docsite)).toBeUndefined();
		});
	});

	describe("getDefaultSiteDomain", () => {
		it("should return jolliSiteDomain when available", () => {
			const docsite = {
				metadata: {
					jolliSiteDomain: "mysite.jolli.site",
					productionUrl: "prod.vercel.app",
					vercelUrl: "random.vercel.app",
				},
			} as SiteWithUpdate;

			expect(getDefaultSiteDomain(docsite)).toBe("mysite.jolli.site");
		});

		it("should return productionUrl when jolliSiteDomain is not available", () => {
			const docsite = {
				metadata: {
					productionUrl: "prod.vercel.app",
					vercelUrl: "random.vercel.app",
				},
			} as SiteWithUpdate;

			expect(getDefaultSiteDomain(docsite)).toBe("prod.vercel.app");
		});

		it("should return vercelUrl as fallback", () => {
			const docsite = {
				metadata: {
					vercelUrl: "random.vercel.app",
				},
			} as SiteWithUpdate;

			expect(getDefaultSiteDomain(docsite)).toBe("random.vercel.app");
		});

		it("should return undefined when no domain available", () => {
			const docsite = { metadata: {} } as SiteWithUpdate;

			expect(getDefaultSiteDomain(docsite)).toBeUndefined();
		});
	});

	describe("getPrimarySiteDomain", () => {
		it("should prefer verified custom domain over default", () => {
			const docsite = {
				metadata: {
					customDomains: [{ domain: "docs.example.com", status: "verified" }],
					jolliSiteDomain: "mysite.jolli.site",
				},
			} as SiteWithUpdate;

			expect(getPrimarySiteDomain(docsite)).toBe("docs.example.com");
		});

		it("should fall back to default domain when no custom domain", () => {
			const docsite = {
				metadata: {
					customDomains: [],
					jolliSiteDomain: "mysite.jolli.site",
				},
			} as unknown as SiteWithUpdate;

			expect(getPrimarySiteDomain(docsite)).toBe("mysite.jolli.site");
		});

		it("should return undefined when no domains available", () => {
			const docsite = { metadata: {} } as SiteWithUpdate;

			expect(getPrimarySiteDomain(docsite)).toBeUndefined();
		});
	});
});
