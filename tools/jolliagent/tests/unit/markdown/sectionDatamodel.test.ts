import fs from "node:fs";
import path from "node:path";
import { parseMarkdownToDocument } from "src/markdown/sections";
import { describe, expect, test } from "vitest";

describe("Markdown section data model", () => {
	test("produces numbered sections with title, text, and metadata; wrapper stores front-matter", () => {
		const samplePath = path.join(process.cwd(), "tests", "resource", "architecture-meta.md");
		const body = fs.readFileSync(samplePath, "utf8");

		const md = `---\ntitle: Example Architecture\ngenerated: 2025-01-01\n---\n\n${body}`;

		const model = parseMarkdownToDocument(md);

		// Front-matter present and parsed
		expect(model.frontmatter).toBeDefined();
		expect(model.frontmatter?.raw).toContain("title:");
		const yamlData = model.frontmatter?.yaml as { title?: string };
		expect(yamlData?.title).toBe("Example Architecture");

		// Sections
		expect(model.sections.length).toBe(4);
		expect(model.sections.map(s => s.number)).toEqual([1, 2, 3, 4]);
		expect(model.sections.map(s => s.title)).toEqual([
			"Project Architecture",
			"Overview",
			"Technology Stack",
			"Subsystem A",
		]);

		const s1 = model.sections[0];
		expect(s1.depth).toBe(1);
		expect(s1.text).toBe(""); // No body under H1 in sample
		const s1Metadata = s1.metadata as { citations?: Array<unknown> };
		expect(s1Metadata && Array.isArray(s1Metadata.citations)).toBe(true);

		const s2 = model.sections[1];
		expect(s2.depth).toBe(2);
		expect(s2.text).toContain("overview section");
		const s2Metadata = s2.metadata as { citations?: Array<unknown> };
		expect(Array.isArray(s2Metadata?.citations)).toBe(true);
		expect((s2Metadata?.citations ?? []).length).toBeGreaterThanOrEqual(1);

		const s3 = model.sections[2];
		expect(s3.depth).toBe(2);
		expect(s3.text).toContain("core technologies");

		const s4 = model.sections[3];
		expect(s4.depth).toBe(3);
		expect(s4.text).toContain("Subsystem A");
	});
});
