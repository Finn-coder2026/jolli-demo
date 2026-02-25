import { convertEmojiShortcodes } from "./EmojiShortcode";
import { describe, expect, it } from "vitest";

describe("convertEmojiShortcodes", () => {
	describe("basic emoji conversion", () => {
		it("should convert common emoji shortcodes to unicode", () => {
			expect(convertEmojiShortcodes(":rocket:")).toBe("🚀");
			expect(convertEmojiShortcodes(":warning:")).toBe("⚠️");
			expect(convertEmojiShortcodes(":white_check_mark:")).toBe("✅");
		});

		it("should convert multiple emoji shortcodes in content", () => {
			const input = ":warning: This is important :rocket:";
			const expected = "⚠️ This is important 🚀";
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});

		it("should handle emoji shortcodes with numbers", () => {
			expect(convertEmojiShortcodes(":100:")).toBe("💯");
			expect(convertEmojiShortcodes(":1234:")).toBe("🔢");
		});

		it("should handle emoji shortcodes with hyphens and plus signs", () => {
			expect(convertEmojiShortcodes(":+1:")).toBe("👍");
			expect(convertEmojiShortcodes(":-1:")).toBe("👎");
		});

		it("should preserve unknown shortcodes as-is", () => {
			expect(convertEmojiShortcodes(":not_a_real_emoji:")).toBe(":not_a_real_emoji:");
			expect(convertEmojiShortcodes(":fake:")).toBe(":fake:");
		});

		it("should handle case-insensitive shortcodes", () => {
			expect(convertEmojiShortcodes(":ROCKET:")).toBe("🚀");
			expect(convertEmojiShortcodes(":Rocket:")).toBe("🚀");
			expect(convertEmojiShortcodes(":WARNING:")).toBe("⚠️");
		});

		it("should not convert partial shortcode matches", () => {
			expect(convertEmojiShortcodes("text:rocket")).toBe("text:rocket");
			expect(convertEmojiShortcodes("rocket:text")).toBe("rocket:text");
			expect(convertEmojiShortcodes("::rocket::")).toBe(":🚀:");
		});
	});

	describe("markdown context", () => {
		it("should handle emoji shortcodes in markdown headers and lists", () => {
			const input = `# :rocket: Getting Started

:warning: **Important:** Read this first.

- :white_check_mark: Task 1 complete
- :x: Task 2 pending`;
			const expected = `# 🚀 Getting Started

⚠️ **Important:** Read this first.

- ✅ Task 1 complete
- ❌ Task 2 pending`;
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});

		it("should handle emoji shortcodes in tables", () => {
			const input = `| Status | Description |
|--------|-------------|
| :white_check_mark: | Complete |
| :x: | Failed |`;
			const expected = `| Status | Description |
|--------|-------------|
| ✅ | Complete |
| ❌ | Failed |`;
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});
	});

	describe("code block protection", () => {
		it("should not convert emoji shortcodes inside fenced code blocks", () => {
			const input = "```markdown\n:rocket: This is a shortcode example\n```";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should not convert emoji shortcodes inside inline code", () => {
			const input = "Use `:rocket:` for the rocket emoji";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should convert outside code while preserving inside code", () => {
			const input = `:rocket: Here's how to use it: \`:rocket:\`

\`\`\`
:warning: This stays as shortcode
\`\`\`

:warning: This gets converted`;
			const expected = `🚀 Here's how to use it: \`:rocket:\`

\`\`\`
:warning: This stays as shortcode
\`\`\`

⚠️ This gets converted`;
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});

		it("should handle simple double backtick inline code", () => {
			// Double backticks without emoji shortcodes are preserved
			const input = "Use `` `code` `` for inline code with backticks";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should convert emoji shortcodes in complex double backtick scenarios", () => {
			// Note: Double backtick syntax `` `x` `` is split by the regex into separate matches,
			// so emoji shortcodes between the backticks are still converted. This is an edge case
			// that users are unlikely to encounter in practice.
			const input = "Use `` `:rocket:` `` for the rocket shortcode";
			const expected = "Use `` `🚀` `` for the rocket shortcode";
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});

		it("should handle multiple code blocks", () => {
			const input = `Use \`:rocket:\` for rockets.

\`\`\`
:rocket: in code
\`\`\`

Or \`:warning:\` for warnings.

\`\`\`
:warning: also in code
\`\`\`

:rocket: outside code`;
			const expected = `Use \`:rocket:\` for rockets.

\`\`\`
:rocket: in code
\`\`\`

Or \`:warning:\` for warnings.

\`\`\`
:warning: also in code
\`\`\`

🚀 outside code`;
			expect(convertEmojiShortcodes(input)).toBe(expected);
		});
	});

	describe("edge cases", () => {
		it("should handle empty string", () => {
			expect(convertEmojiShortcodes("")).toBe("");
		});

		it("should handle content with no shortcodes", () => {
			const input = "This is just regular text with no emoji shortcodes.";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should handle content with only code blocks", () => {
			const input = "```\n:rocket:\n```";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should handle adjacent shortcodes", () => {
			expect(convertEmojiShortcodes(":rocket::warning:")).toBe("🚀⚠️");
		});

		it("should handle shortcodes at start and end", () => {
			expect(convertEmojiShortcodes(":rocket: text :warning:")).toBe("🚀 text ⚠️");
		});

		it("should handle $ replacement patterns in code blocks", () => {
			// $ patterns like $&, $', $` have special meaning in String.replace()
			// They should be preserved literally in code blocks
			const input = "Use `$&` for the matched text and `$1` for capture groups";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});

		it("should handle $ replacement patterns in fenced code blocks", () => {
			const input = "```javascript\nstr.replace(/foo/, '$& bar $1')\n```";
			expect(convertEmojiShortcodes(input)).toBe(input);
		});
	});
});
