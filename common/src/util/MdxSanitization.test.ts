import { sanitizeMdToMdx } from "./MdxSanitization";
import { describe, expect, it } from "vitest";

describe("sanitizeMdToMdx", () => {
	describe("HTML comments", () => {
		it("should convert single-line HTML comments to MDX comments", () => {
			expect(sanitizeMdToMdx("<!-- comment -->")).toBe("{/* comment */}");
		});

		it("should convert multi-line HTML comments to MDX comments", () => {
			const input = `<!--
  This is a multi-line
  comment
-->`;
			const expected = `{/*
  This is a multi-line
  comment
*/}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should convert multiple HTML comments in content", () => {
			const input = `# Title
<!-- First comment -->
Some content
<!-- Second comment -->
More content`;
			const expected = `# Title
{/* First comment */}
Some content
{/* Second comment */}
More content`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});
	});

	describe("autolinks", () => {
		it("should convert https autolinks to standard links", () => {
			expect(sanitizeMdToMdx("<https://example.com>")).toBe("[https://example.com](https://example.com)");
		});

		it("should convert http autolinks to standard links", () => {
			expect(sanitizeMdToMdx("<http://example.com>")).toBe("[http://example.com](http://example.com)");
		});

		it("should convert autolinks with paths", () => {
			expect(sanitizeMdToMdx("<https://example.com/path/to/page>")).toBe(
				"[https://example.com/path/to/page](https://example.com/path/to/page)",
			);
		});

		it("should convert autolinks with query strings", () => {
			expect(sanitizeMdToMdx("<https://example.com?foo=bar&baz=qux>")).toBe(
				"[https://example.com?foo=bar&baz=qux](https://example.com?foo=bar&baz=qux)",
			);
		});

		it("should convert multiple autolinks in content", () => {
			const input = `Check out <https://example.com> and <https://other.com>`;
			const expected = `Check out [https://example.com](https://example.com) and [https://other.com](https://other.com)`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should not convert JSX/HTML tags", () => {
			expect(sanitizeMdToMdx("<div>content</div>")).toBe("<div>content</div>");
			expect(sanitizeMdToMdx("<Component />")).toBe("<Component />");
		});

		it("should not convert explicit mailto protocol autolinks", () => {
			// Explicit mailto: protocol is not converted (only bare email autolinks are)
			expect(sanitizeMdToMdx("<mailto:test@example.com>")).toBe("<mailto:test@example.com>");
		});
	});

	describe("email autolinks", () => {
		it("should convert email autolinks to mailto links", () => {
			expect(sanitizeMdToMdx("<security@mermaid.live>")).toBe(
				"[security@mermaid.live](mailto:security@mermaid.live)",
			);
		});

		it("should convert email autolinks with plus signs", () => {
			expect(sanitizeMdToMdx("<test+tag@example.com>")).toBe(
				"[test+tag@example.com](mailto:test+tag@example.com)",
			);
		});

		it("should convert email autolinks with dots in local part", () => {
			expect(sanitizeMdToMdx("<first.last@example.com>")).toBe(
				"[first.last@example.com](mailto:first.last@example.com)",
			);
		});

		it("should convert email autolinks with subdomains", () => {
			expect(sanitizeMdToMdx("<user@mail.example.co.uk>")).toBe(
				"[user@mail.example.co.uk](mailto:user@mail.example.co.uk)",
			);
		});

		it("should convert multiple email autolinks in content", () => {
			const input = `Contact <support@example.com> or <sales@example.com>`;
			const expected = `Contact [support@example.com](mailto:support@example.com) or [sales@example.com](mailto:sales@example.com)`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should not convert JSX tags that look similar to emails", () => {
			// This shouldn't match because there's no @ in a valid JSX tag
			expect(sanitizeMdToMdx("<div>@mention</div>")).toBe("<div>@mention</div>");
		});
	});

	describe("emoji shortcodes", () => {
		it("should convert common emoji shortcodes to unicode", () => {
			expect(sanitizeMdToMdx(":rocket:")).toBe("🚀");
			expect(sanitizeMdToMdx(":warning:")).toBe("⚠️");
			expect(sanitizeMdToMdx(":white_check_mark:")).toBe("✅");
		});

		it("should convert multiple emoji shortcodes in content", () => {
			const input = ":warning: This is important :rocket:";
			const expected = "⚠️ This is important 🚀";
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle emoji shortcodes with numbers", () => {
			expect(sanitizeMdToMdx(":100:")).toBe("💯");
			expect(sanitizeMdToMdx(":1234:")).toBe("🔢");
		});

		it("should handle emoji shortcodes with hyphens and plus signs", () => {
			expect(sanitizeMdToMdx(":+1:")).toBe("👍");
			expect(sanitizeMdToMdx(":-1:")).toBe("👎");
		});

		it("should preserve unknown shortcodes as-is", () => {
			expect(sanitizeMdToMdx(":not_a_real_emoji:")).toBe(":not_a_real_emoji:");
			expect(sanitizeMdToMdx(":fake:")).toBe(":fake:");
		});

		it("should handle case-insensitive shortcodes", () => {
			expect(sanitizeMdToMdx(":ROCKET:")).toBe("🚀");
			expect(sanitizeMdToMdx(":Rocket:")).toBe("🚀");
			expect(sanitizeMdToMdx(":WARNING:")).toBe("⚠️");
		});

		it("should not convert partial shortcode matches", () => {
			expect(sanitizeMdToMdx("text:rocket")).toBe("text:rocket");
			expect(sanitizeMdToMdx("rocket:text")).toBe("rocket:text");
			expect(sanitizeMdToMdx("::rocket::")).toBe(":🚀:");
		});

		it("should handle emoji shortcodes in markdown context", () => {
			const input = `# :rocket: Getting Started

:warning: **Important:** Read this first.

- :white_check_mark: Task 1 complete
- :x: Task 2 pending`;
			const expected = `# 🚀 Getting Started

⚠️ **Important:** Read this first.

- ✅ Task 1 complete
- ❌ Task 2 pending`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});
	});

	describe("style tags", () => {
		it("should comment out style tags", () => {
			const input = `<style scoped>
.badges > p {
  display: flex;
}
</style>`;
			const expected = `{/* <style scoped>
.badges > p {
  display: flex;
}
</style> */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should comment out style tags without attributes", () => {
			const input = `<style>.foo { color: red; }</style>`;
			const expected = `{/* <style>.foo { color: red; }</style> */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle multiple style tags", () => {
			const input = `<style>.a { }</style>
Some content
<style>.b { }</style>`;
			const expected = `{/* <style>.a { }</style> */}
Some content
{/* <style>.b { }</style> */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle style tags case-insensitively", () => {
			const input = `<STYLE>.foo { }</STYLE>`;
			const expected = `{/* <STYLE>.foo { }</STYLE> */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});
	});

	describe("code block protection", () => {
		it("should not sanitize HTML comments inside fenced code blocks", () => {
			const input = "```html\n<!-- This is a comment -->\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize autolinks inside fenced code blocks", () => {
			const input = "```markdown\n<https://example.com>\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize email autolinks inside fenced code blocks", () => {
			const input = "```\n<user@example.com>\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize style tags inside fenced code blocks", () => {
			const input = "```html\n<style>.foo { color: red; }</style>\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not convert emoji shortcodes inside fenced code blocks", () => {
			const input = "```markdown\n:rocket: This is a shortcode example\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not convert emoji shortcodes inside inline code", () => {
			const input = "Use `:rocket:` for the rocket emoji";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize HTML comments inside inline code", () => {
			const input = "Use `<!-- comment -->` for HTML comments";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize autolinks inside inline code", () => {
			const input = "Write `<https://example.com>` for autolinks";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should not sanitize email autolinks inside inline code", () => {
			const input = "Use `<user@example.com>` for email links";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should sanitize content outside code blocks while preserving code blocks", () => {
			const input = `# Documentation

Here's how to write a comment:

\`\`\`html
<!-- This stays unchanged -->
\`\`\`

<!-- This gets converted -->

And inline: \`<https://example.com>\` stays, but <https://example.com> converts.`;
			const expected = `# Documentation

Here's how to write a comment:

\`\`\`html
<!-- This stays unchanged -->
\`\`\`

{/* This gets converted */}

And inline: \`<https://example.com>\` stays, but [https://example.com](https://example.com) converts.`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle multiple code blocks and inline code", () => {
			const input = `Use \`<!-- -->\` for comments.

\`\`\`
<style>.foo { }</style>
\`\`\`

Or use \`<user@example.com>\` syntax.

<user@example.com>`;
			const expected = `Use \`<!-- -->\` for comments.

\`\`\`
<style>.foo { }</style>
\`\`\`

Or use \`<user@example.com>\` syntax.

[user@example.com](mailto:user@example.com)`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle double backtick inline code", () => {
			const input = "Use `` `code` `` for inline code with backticks";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should sanitize content after unclosed fenced code block", () => {
			// Unclosed code blocks should not protect subsequent content from sanitization
			const input = `\`\`\`javascript
const x = 1;

<!-- This comment comes after unclosed code block -->`;
			const expected = `\`\`\`javascript
const x = 1;

{/* This comment comes after unclosed code block */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should sanitize content after unclosed inline code", () => {
			// Unclosed inline code should not protect subsequent content
			const input = "Here is `unclosed code and <!-- a comment -->";
			const expected = "Here is `unclosed code and {/* a comment */}";
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});
	});

	describe("$ replacement pattern handling", () => {
		it("should handle $ replacement patterns in inline code", () => {
			// $ patterns like $&, $', $` have special meaning in String.replace()
			// They should be preserved literally in code blocks
			const input = "Use `$&` for the matched text and `$1` for capture groups";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should handle $ replacement patterns in fenced code blocks", () => {
			const input = "```javascript\nstr.replace(/foo/, '$& bar $1')\n```";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});

		it("should handle $$ pattern in code", () => {
			const input = "Use `$$` to insert a literal dollar sign";
			expect(sanitizeMdToMdx(input)).toBe(input);
		});
	});

	describe("mixed content", () => {
		it("should handle content with both HTML comments and autolinks", () => {
			const input = `# Documentation
<!-- This is a comment -->
Visit <https://example.com> for more info.
<!-- Another comment -->`;
			const expected = `# Documentation
{/* This is a comment */}
Visit [https://example.com](https://example.com) for more info.
{/* Another comment */}`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should handle content with HTML comments, URL autolinks, and email autolinks", () => {
			const input = `# Contact Us
<!-- Contact information -->
Visit <https://example.com> or email <support@example.com> for help.`;
			const expected = `# Contact Us
{/* Contact information */}
Visit [https://example.com](https://example.com) or email [support@example.com](mailto:support@example.com) for help.`;
			expect(sanitizeMdToMdx(input)).toBe(expected);
		});

		it("should not modify content without HTML comments or autolinks", () => {
			const input = `# Hello World

This is regular markdown with [a link](https://example.com).

- Item 1
- Item 2`;
			expect(sanitizeMdToMdx(input)).toBe(input);
		});
	});
});
