import { escapeHtml, escapeJsString, sanitizeSiteName, sanitizeUrl, validateNumberRange } from "./sanitize.js";
import { describe, expect, it } from "vitest";

describe("sanitize utilities", () => {
	describe("escapeHtml", () => {
		it("should escape HTML special characters", () => {
			expect(escapeHtml("<script>alert('XSS')</script>")).toBe(
				"&lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;",
			);
		});

		it("should escape ampersand", () => {
			expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
		});

		it("should escape double quotes", () => {
			expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
		});

		it("should escape single quotes", () => {
			expect(escapeHtml("It's fine")).toBe("It&#039;s fine");
		});

		it("should escape greater than and less than", () => {
			expect(escapeHtml("a < b > c")).toBe("a &lt; b &gt; c");
		});

		it("should handle combined XSS attack vectors", () => {
			const malicious = '"><script>alert(document.cookie)</script><img x="';
			const result = escapeHtml(malicious);
			expect(result).not.toContain("<script>");
			expect(result).not.toContain("</script>");
			expect(result).toBe("&quot;&gt;&lt;script&gt;alert(document.cookie)&lt;/script&gt;&lt;img x=&quot;");
		});

		it("should not modify safe strings", () => {
			expect(escapeHtml("Hello World")).toBe("Hello World");
			expect(escapeHtml("simple-text_123")).toBe("simple-text_123");
		});

		it("should handle empty string", () => {
			expect(escapeHtml("")).toBe("");
		});

		it("should preserve unicode characters", () => {
			expect(escapeHtml("Hello 世界 🎉")).toBe("Hello 世界 🎉");
		});
	});

	describe("escapeJsString", () => {
		it("should escape single quotes", () => {
			expect(escapeJsString("It's a test")).toBe("It\\'s a test");
		});

		it("should escape backslashes", () => {
			expect(escapeJsString("path\\to\\file")).toBe("path\\\\to\\\\file");
		});

		it("should escape both backslashes and quotes", () => {
			expect(escapeJsString("It's a \\path")).toBe("It\\'s a \\\\path");
		});

		it("should not modify safe strings", () => {
			expect(escapeJsString("Hello World")).toBe("Hello World");
		});

		it("should escape newlines", () => {
			expect(escapeJsString("Line1\nLine2")).toBe("Line1\\nLine2");
		});

		it("should escape carriage returns", () => {
			expect(escapeJsString("Line1\r\nLine2")).toBe("Line1\\r\\nLine2");
		});

		it("should handle empty string", () => {
			expect(escapeJsString("")).toBe("");
		});

		it("should preserve unicode characters", () => {
			expect(escapeJsString("Hello 世界")).toBe("Hello 世界");
		});
	});

	describe("sanitizeUrl", () => {
		it("should allow https URLs", () => {
			expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
		});

		it("should allow http URLs", () => {
			expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
		});

		it("should reject javascript: URLs", () => {
			expect(sanitizeUrl("javascript:alert('XSS')")).toBe("#");
		});

		it("should reject data: URLs", () => {
			expect(sanitizeUrl("data:text/html,<script>alert('XSS')</script>")).toBe("#");
		});

		it("should reject file: URLs", () => {
			expect(sanitizeUrl("file:///etc/passwd")).toBe("#");
		});

		it("should reject ftp: URLs", () => {
			expect(sanitizeUrl("ftp://example.com")).toBe("#");
		});

		it("should return fallback for invalid URLs", () => {
			expect(sanitizeUrl("not a url")).toBe("#");
		});

		it("should use custom fallback", () => {
			expect(sanitizeUrl("javascript:alert('XSS')", "https://safe.com")).toBe("https://safe.com");
		});

		it("should allow URLs with paths and query strings", () => {
			expect(sanitizeUrl("https://example.com/path?query=value")).toBe("https://example.com/path?query=value");
		});

		it("should handle empty string", () => {
			expect(sanitizeUrl("")).toBe("#");
		});

		it("should allow URLs with fragments", () => {
			expect(sanitizeUrl("https://example.com/page#section")).toBe("https://example.com/page#section");
		});

		it("should reject case variations of javascript:", () => {
			expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("#");
			expect(sanitizeUrl("JavaScript:alert(1)")).toBe("#");
		});

		it("should reject vbscript: URLs", () => {
			expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("#");
		});
	});

	describe("validateNumberRange", () => {
		it("should return value if within range", () => {
			expect(validateNumberRange(50, 0, 100, 25)).toBe(50);
		});

		it("should return default if value is below minimum", () => {
			expect(validateNumberRange(-5, 0, 100, 25)).toBe(25);
		});

		it("should return default if value is above maximum", () => {
			expect(validateNumberRange(150, 0, 100, 25)).toBe(25);
		});

		it("should return default if value is undefined", () => {
			expect(validateNumberRange(undefined, 0, 100, 25)).toBe(25);
		});

		it("should return default if value is NaN", () => {
			expect(validateNumberRange(Number.NaN, 0, 100, 25)).toBe(25);
		});

		it("should accept boundary values", () => {
			expect(validateNumberRange(0, 0, 100, 25)).toBe(0);
			expect(validateNumberRange(100, 0, 100, 25)).toBe(100);
		});

		it("should validate primaryHue range (0-360)", () => {
			expect(validateNumberRange(180, 0, 360, 212)).toBe(180);
			expect(validateNumberRange(400, 0, 360, 212)).toBe(212);
			expect(validateNumberRange(-10, 0, 360, 212)).toBe(212);
		});

		it("should validate sidebarCollapse range (1-6)", () => {
			expect(validateNumberRange(3, 1, 6, 2)).toBe(3);
			expect(validateNumberRange(0, 1, 6, 2)).toBe(2);
			expect(validateNumberRange(7, 1, 6, 2)).toBe(2);
		});

		it("should return default for Infinity", () => {
			expect(validateNumberRange(Number.POSITIVE_INFINITY, 0, 100, 25)).toBe(25);
			expect(validateNumberRange(Number.NEGATIVE_INFINITY, 0, 100, 25)).toBe(25);
		});

		it("should accept floats within range", () => {
			expect(validateNumberRange(50.5, 0, 100, 25)).toBe(50.5);
		});
	});

	describe("sanitizeSiteName", () => {
		it("should allow alphanumeric characters", () => {
			expect(sanitizeSiteName("mysite123")).toBe("mysite123");
		});

		it("should allow hyphens and underscores", () => {
			expect(sanitizeSiteName("my-site_name")).toBe("my-site_name");
		});

		it("should replace special characters with hyphens", () => {
			expect(sanitizeSiteName("my site!")).toBe("my-site-");
		});

		it("should prevent path traversal", () => {
			expect(sanitizeSiteName("../../../etc/passwd")).toBe("---------etc-passwd");
		});

		it("should handle empty string", () => {
			expect(sanitizeSiteName("")).toBe("");
		});

		it("should handle mixed characters", () => {
			expect(sanitizeSiteName("My Site (v2.0)")).toBe("My-Site--v2-0-");
		});

		it("should replace unicode characters with hyphens", () => {
			expect(sanitizeSiteName("我的网站")).toBe("----");
		});
	});
});
