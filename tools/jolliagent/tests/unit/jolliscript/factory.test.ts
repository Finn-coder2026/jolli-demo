import { createMarkdownAgentFromJolliSection } from "../../../src/jolliscript/factory";
import type { LLMClient, LLMStreamEvent, StreamOptions } from "../../../src/Types";
import { describe, expect, it } from "vitest";

/**
 * JRN Format History:
 * - v1 (path-based): /root/integrations/{org}/{repo}/{branch}
 *   Example: /root/integrations/my-org/my-repo/main
 *
 * - v2 (structured): jrn:/global:sources:github/{org}/{repo}/{branch}
 *   Example: jrn:/global:sources:github/my-org/my-repo/main
 *
 * The JOLLISCRIPT_MARKDOWN fixture below uses v1 format for testing.
 * Use DEMO_MIGRATE_JRNS job to migrate from v1 to v2 format.
 */

class DummyClient implements LLMClient {
	// biome-ignore lint/suspicious/useAwait: async generator must be async to match interface
	async *stream(_opts: StreamOptions): AsyncGenerator<LLMStreamEvent, void, unknown> {
		yield* [];
	}

	// biome-ignore lint/suspicious/useAwait: async generator must be async to match interface
	async *continueWithToolResult(
		_params: Parameters<LLMClient["continueWithToolResult"]>[0],
	): AsyncGenerator<LLMStreamEvent, void, unknown> {
		yield* [];
	}
}

const JOI_MARKDOWN = `
# Intro
Some description

# Jolli_Main
\`\`\`joi
system:
  You are a helper.

user:
  Say hello.
\`\`\`
`;

// Test fixture uses v1 (path-based) JRN format
const JOLLISCRIPT_MARKDOWN = `---
article_type: jolliscript
on:
  jrn: /root/integrations/my-org/my-repo/main
  verb: GIT_PUSH
---

# My Script

This is a jolliscript article where the entire content becomes the prompt.

## Instructions

Please do the following:
1. Step one
2. Step two

\`\`\`javascript
console.log("example code");
\`\`\`
`;

const JOLLISCRIPT_NO_CONTENT = `---
article_type: jolliscript
---
`;

describe("createMarkdownAgentFromJolliSection", () => {
	it("returns prompt and agent wiring from the Jolli_Main section", () => {
		const result = createMarkdownAgentFromJolliSection({
			markdown: JOI_MARKDOWN,
			agentOverrides: { client: new DummyClient(), tools: [] },
		});

		expect(result.prompt).toContain("You are a helper.");
		expect(result.prompt).toContain("Say hello.");
		expect(result.section.title).toBe("Jolli_Main");
		expect(result.ast.sections.length).toBeGreaterThan(0);
		expect(result.articleType).toBe("default");
	});

	it("throws when the requested section is missing", () => {
		expect(() =>
			createMarkdownAgentFromJolliSection({
				markdown: "# Something Else\ncontent",
			}),
		).toThrow(/No section named/);
	});

	it("throws when the section lacks a joi fence", () => {
		const markdown = `
# Jolli_Main
This section is missing a joi block.
`;

		expect(() =>
			createMarkdownAgentFromJolliSection({
				markdown,
				agentOverrides: { client: new DummyClient() },
			}),
		).toThrow(/does not contain a ```joi block/);
	});

	describe("jolliscript article type", () => {
		it("uses full content as prompt when article_type is jolliscript", () => {
			const result = createMarkdownAgentFromJolliSection({
				markdown: JOLLISCRIPT_MARKDOWN,
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("jolliscript");
			expect(result.prompt).toContain("# My Script");
			expect(result.prompt).toContain("This is a jolliscript article");
			expect(result.prompt).toContain("## Instructions");
			expect(result.prompt).toContain("Step one");
			expect(result.prompt).toContain('console.log("example code")');
			// Front matter should NOT be in the prompt
			expect(result.prompt).not.toContain("article_type");
			expect(result.prompt).not.toContain("GIT_PUSH");
		});

		it("does not require Jolli_Main section for jolliscript articles", () => {
			const markdown = `---
article_type: jolliscript
---

# Simple Script

Just some content without a Jolli_Main section.
`;
			const result = createMarkdownAgentFromJolliSection({
				markdown,
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("jolliscript");
			expect(result.prompt).toContain("# Simple Script");
			expect(result.prompt).toContain("Just some content");
		});

		it("throws when jolliscript article has no content after front matter", () => {
			expect(() =>
				createMarkdownAgentFromJolliSection({
					markdown: JOLLISCRIPT_NO_CONTENT,
					agentOverrides: { client: new DummyClient() },
				}),
			).toThrow(/jolliscript article has no content after front matter/);
		});

		it("treats missing article_type as default", () => {
			const result = createMarkdownAgentFromJolliSection({
				markdown: JOI_MARKDOWN,
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("default");
		});

		it("treats explicit article_type: default as default", () => {
			const markdown = `---
article_type: default
---

# Jolli_Main
\`\`\`joi
You are a helper.
\`\`\`
`;
			const result = createMarkdownAgentFromJolliSection({
				markdown,
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("default");
			expect(result.prompt).toContain("You are a helper.");
		});

		it("ignores sectionTitle option for jolliscript articles", () => {
			const result = createMarkdownAgentFromJolliSection({
				markdown: JOLLISCRIPT_MARKDOWN,
				sectionTitle: "NonExistent", // This would throw for default articles
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("jolliscript");
			expect(result.prompt).toContain("# My Script");
		});

		it("supports optional version field in front matter", () => {
			const markdown = `---
article_type: jolliscript
version: 3
---

# Versioned Script

Content with version specified.
`;
			const result = createMarkdownAgentFromJolliSection({
				markdown,
				agentOverrides: { client: new DummyClient(), tools: [] },
			});

			expect(result.articleType).toBe("jolliscript");
			expect(result.prompt).toContain("# Versioned Script");
			// Version should not appear in the prompt (it's metadata)
			expect(result.prompt).not.toContain("version:");
		});
	});
});
