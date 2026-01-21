import { parseSections, sectionsToMarkdown, sectionToMarkdown } from "../../../src/jolliscript/parser";
import { describe, expect, it } from "vitest";

describe("parseSections", () => {
	describe("front matter handling", () => {
		it("parses YAML front matter as first section with isFrontMatter flag", () => {
			const markdown = `---
title: My Article
author: John Doe
tags:
  - javascript
  - testing
---

# Introduction

Some intro text.
`;

			const sections = parseSections(markdown);

			expect(sections.length).toBe(3); // front matter, empty preamble, Introduction
			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].title).toBeNull();
			expect(sections[0].frontMatter).toEqual({
				title: "My Article",
				author: "John Doe",
				tags: ["javascript", "testing"],
			});
		});

		it("includes raw YAML content in front matter section", () => {
			const markdown = `---
title: Test
---

# Heading
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].content).toBe("title: Test");
		});

		it("handles front matter with complex nested objects", () => {
			const markdown = `---
metadata:
  version: 1.0
  config:
    enabled: true
    options:
      - opt1
      - opt2
---

# Content
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].frontMatter).toEqual({
				metadata: {
					version: 1.0,
					config: {
						enabled: true,
						options: ["opt1", "opt2"],
					},
				},
			});
		});

		it("handles markdown without front matter", () => {
			const markdown = `# Introduction

Some content here.

# Another Section

More content.
`;

			const sections = parseSections(markdown);

			expect(sections.every(s => !s.isFrontMatter)).toBe(true);
			expect(sections[0].title).toBeNull(); // preamble
			expect(sections[1].title).toBe("Introduction");
			expect(sections[2].title).toBe("Another Section");
		});

		it("handles front matter followed directly by heading (no preamble content)", () => {
			const markdown = `---
title: Direct Heading
---
# First Section

Content here.
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].frontMatter?.title).toBe("Direct Heading");
			// Empty preamble section after front matter
			expect(sections[1].title).toBeNull();
			expect(sections[1].isFrontMatter).toBeUndefined();
			expect(sections[2].title).toBe("First Section");
		});

		it("handles front matter with preamble content before first heading", () => {
			const markdown = `---
title: With Preamble
---

This is preamble text before any heading.

# First Heading

Section content.
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[1].title).toBeNull();
			expect(sections[1].isFrontMatter).toBeUndefined();
			expect(sections[1].content).toContain("This is preamble text");
			expect(sections[2].title).toBe("First Heading");
		});

		it("handles invalid YAML in front matter gracefully", () => {
			const markdown = `---
invalid: yaml: content: here
  badly: [indented
---

# Content
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].frontMatter).toBeUndefined(); // parsing failed
			expect(sections[0].content).toContain("invalid"); // raw content preserved
		});

		it("handles empty front matter", () => {
			const markdown = `---
---

# Content
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].frontMatter).toBeUndefined(); // empty YAML parses to null/undefined
		});

		it("sets correct line numbers for front matter section", () => {
			const markdown = `---
title: Test
author: Jane
---

# Content
`;

			const sections = parseSections(markdown);

			expect(sections[0].isFrontMatter).toBe(true);
			expect(sections[0].startLine).toBe(0); // 0-indexed, first line
			expect(sections[0].endLine).toBe(3); // closing ---
		});

		it("does not treat --- in middle of document as front matter", () => {
			const markdown = `# Introduction

Some content

---

More content after thematic break

# Another Section
`;

			const sections = parseSections(markdown);

			// No front matter section
			expect(sections.every(s => !s.isFrontMatter)).toBe(true);
		});
	});

	describe("existing functionality preserved", () => {
		it("parses sections by headings", () => {
			const markdown = `# First

Content 1

## Second

Content 2
`;

			const sections = parseSections(markdown);

			// preamble + First + Second
			expect(sections.filter(s => s.title !== null).length).toBe(2);
			expect(sections.find(s => s.title === "First")).toBeDefined();
			expect(sections.find(s => s.title === "Second")).toBeDefined();
		});

		it("collects code fences within sections", () => {
			const markdown = `# Code Section

\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
`;

			const sections = parseSections(markdown);
			const codeSection = sections.find(s => s.title === "Code Section");

			expect(codeSection?.fences.length).toBe(2);
			expect(codeSection?.fences[0].lang).toBe("javascript");
			expect(codeSection?.fences[1].lang).toBe("python");
		});

		it("respects minDepth and maxDepth options", () => {
			const markdown = `# H1

## H2

### H3
`;

			const sections = parseSections(markdown, { minDepth: 2, maxDepth: 2 });

			// Only H2 should be treated as section start
			const titledSections = sections.filter(s => s.title !== null);
			expect(titledSections.length).toBe(1);
			expect(titledSections[0].title).toBe("H2");
		});
	});
});

describe("sectionToMarkdown", () => {
	it("converts front matter section with --- delimiters", () => {
		const section = {
			title: null,
			content: "title: My Article\nauthor: Test",
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 2,
			isFrontMatter: true,
			frontMatter: { title: "My Article", author: "Test" },
		};

		const result = sectionToMarkdown(section);

		expect(result).toBe("---\ntitle: My Article\nauthor: Test\n---");
	});

	it("converts section with heading using headingDepth", () => {
		const section = {
			title: "My Section",
			content: "Some content here",
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 2,
			headingDepth: 2,
		};

		const result = sectionToMarkdown(section);

		expect(result).toBe("## My Section\n\nSome content here");
	});

	it("converts section with heading detecting level from original content", () => {
		const section = {
			title: "My Section",
			content: "Some content here",
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 2,
		};

		const originalContent = "### My Section\n\nSome content here";
		const result = sectionToMarkdown(section, originalContent);

		expect(result).toBe("### My Section\n\nSome content here");
	});

	it("converts preamble section without heading", () => {
		const section = {
			title: null,
			content: "Preamble content here",
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 0,
		};

		const result = sectionToMarkdown(section);

		expect(result).toBe("Preamble content here");
	});

	it("converts section with empty content", () => {
		const section = {
			title: "Empty Section",
			content: "",
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 0,
			headingDepth: 2,
		};

		const result = sectionToMarkdown(section);

		expect(result).toBe("## Empty Section");
	});
});

describe("sectionsToMarkdown", () => {
	it("converts sections array back to markdown preserving front matter", () => {
		const markdown = `---
title: My Article
---

# Section 1

Content 1

## Section 2

Content 2
`;

		const sections = parseSections(markdown);
		const result = sectionsToMarkdown(sections, markdown);

		expect(result).toContain("---\ntitle: My Article\n---");
		expect(result).toContain("# Section 1");
		expect(result).toContain("Content 1");
		expect(result).toContain("## Section 2");
		expect(result).toContain("Content 2");
	});

	it("round-trips content without front matter", () => {
		const markdown = `# First Section

Some content

## Second Section

More content
`;

		const sections = parseSections(markdown);
		const result = sectionsToMarkdown(sections, markdown);

		expect(result).toContain("# First Section");
		expect(result).toContain("Some content");
		expect(result).toContain("## Second Section");
		expect(result).toContain("More content");
	});

	it("preserves heading levels from original content", () => {
		const markdown = `### Deep Heading

Content here
`;

		const sections = parseSections(markdown);
		const result = sectionsToMarkdown(sections, markdown);

		expect(result).toContain("### Deep Heading");
	});
});
