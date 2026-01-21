import { createSectionPathService, findSectionByTitle } from "./SectionPathService";
import { describe, expect, it } from "vitest";

describe("SectionPathService", () => {
	const service = createSectionPathService();

	describe("parseSectionsWithIds", () => {
		it("should generate new IDs for sections without existing mapping", () => {
			const content = "Preamble\n\n# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const { sections, mapping } = service.parseSectionsWithIds(content);

			expect(sections.length).toBeGreaterThanOrEqual(2);
			// Find the actual Section 1 and Section 2
			const section1 = sections.find(s => s.title === "Section 1");
			const section2 = sections.find(s => s.title === "Section 2");

			expect(section1).toBeDefined();
			expect(section2).toBeDefined();
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(section1!.id).toBeDefined();
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(section2!.id).toBeDefined();
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(section1!.id).not.toBe(section2!.id);

			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(mapping[section1!.id]).toBe("Section 1");
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(mapping[section2!.id]).toBe("Section 2");
		});

		it("should reuse existing IDs when titles match", () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";

			// First parse
			const firstParse = service.parseSectionsWithIds(content);
			const section1Id = firstParse.sections[0].id;
			const section2Id = firstParse.sections[1].id;

			// Second parse with same content
			const secondParse = service.parseSectionsWithIds(content, firstParse.mapping);

			expect(secondParse.sections[0].id).toBe(section1Id);
			expect(secondParse.sections[1].id).toBe(section2Id);
		});

		it("should generate new ID when section title changes", () => {
			const content1 = "# Section 1\n\nContent";
			const content2 = "# Section 1 Renamed\n\nContent";

			const firstParse = service.parseSectionsWithIds(content1);
			const section1 = firstParse.sections.find(s => s.title === "Section 1");

			const secondParse = service.parseSectionsWithIds(content2, firstParse.mapping);
			const renamedSection = secondParse.sections.find(s => s.title === "Section 1 Renamed");

			expect(section1).toBeDefined();
			expect(renamedSection).toBeDefined();
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(renamedSection!.id).not.toBe(section1!.id);
			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			expect(secondParse.mapping[renamedSection!.id]).toBe("Section 1 Renamed");
		});

		it("should handle preamble section", () => {
			const content = "Preamble content\n\n# Section 1\n\nContent";
			const { sections, mapping } = service.parseSectionsWithIds(content);

			expect(sections).toHaveLength(2);
			expect(sections[0].title).toBeNull();
			expect(mapping[sections[0].id]).toBeNull();
		});

		it("should reuse preamble ID", () => {
			const content = "Preamble content\n\n# Section 1\n\nContent";

			const firstParse = service.parseSectionsWithIds(content);
			const preambleId = firstParse.sections[0].id;

			const secondParse = service.parseSectionsWithIds(content, firstParse.mapping);

			expect(secondParse.sections[0].id).toBe(preambleId);
		});
	});

	describe("findSectionById", () => {
		it("should find section by ID", () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const { sections } = service.parseSectionsWithIds(content);

			const section1 = sections.find(s => s.title === "Section 1");
			expect(section1).toBeDefined();

			// biome-ignore lint/style/noNonNullAssertion: checked with toBeDefined
			const found = service.findSectionById(sections, section1!.id);

			expect(found).toBeDefined();
			expect(found?.title).toBe("Section 1");
		});

		it("should return null when section ID not found", () => {
			const content = "# Section 1\n\nContent";
			const { sections } = service.parseSectionsWithIds(content);

			const found = service.findSectionById(sections, "nonexistent-id");

			expect(found).toBeNull();
		});
	});

	describe("pathToSectionId", () => {
		it("should convert path to section ID by index", () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const { sections } = service.parseSectionsWithIds(content);

			const id = service.pathToSectionId(sections, "/sections/0");

			expect(id).toBe(sections[0].id);
		});

		it("should return null for invalid path", () => {
			const content = "# Section 1\n\nContent";
			const { sections } = service.parseSectionsWithIds(content);

			const id = service.pathToSectionId(sections, "invalid-path");

			expect(id).toBeNull();
		});

		it("should return null for out-of-range index", () => {
			const content = "# Section 1\n\nContent";
			const { sections } = service.parseSectionsWithIds(content);

			const id = service.pathToSectionId(sections, "/sections/999");

			expect(id).toBeNull();
		});
	});

	describe("getSectionIndex", () => {
		it("should get index of section by ID", () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const { sections } = service.parseSectionsWithIds(content);

			const index = service.getSectionIndex(sections, sections[1].id);

			expect(index).toBe(1);
		});

		it("should return -1 when section ID not found", () => {
			const content = "# Section 1\n\nContent";
			const { sections } = service.parseSectionsWithIds(content);

			const index = service.getSectionIndex(sections, "nonexistent-id");

			expect(index).toBe(-1);
		});
	});
});

describe("findSectionByTitle", () => {
	it("should find section by title", () => {
		const sections = [
			{ title: "Section 1", content: "Content 1", rawContent: [], fences: [], startLine: 0, endLine: 2 },
			{ title: "Section 2", content: "Content 2", rawContent: [], fences: [], startLine: 4, endLine: 6 },
		];

		const index = findSectionByTitle(sections, "Section 1");

		expect(index).toBe(0);
	});

	it("should find preamble section with null title", () => {
		const sections = [
			{ title: null, content: "Preamble", rawContent: [], fences: [], startLine: 0, endLine: 1 },
			{ title: "Section 1", content: "Content", rawContent: [], fences: [], startLine: 3, endLine: 5 },
		];

		const index = findSectionByTitle(sections, null);

		expect(index).toBe(0);
	});

	it("should find preamble when searching for 'null' string", () => {
		const sections = [{ title: null, content: "Preamble", rawContent: [], fences: [], startLine: 0, endLine: 1 }];

		const index = findSectionByTitle(sections, "null");

		expect(index).toBe(0);
	});

	it("should return null when section not found", () => {
		const sections = [
			{ title: "Section 1", content: "Content", rawContent: [], fences: [], startLine: 0, endLine: 2 },
		];

		const index = findSectionByTitle(sections, "Nonexistent");

		expect(index).toBeNull();
	});
});
