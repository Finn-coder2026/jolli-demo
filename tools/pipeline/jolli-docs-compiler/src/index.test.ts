import { describe, expect, it } from "vitest";
import * as index from "./index.js";

describe("index exports", () => {
	it("should export main functions", () => {
		expect(index.compileDocumentation).toBeDefined();
		expect(index.findMdxFiles).toBeDefined();
		expect(index.main).toBeDefined();
		expect(index.parseArgs).toBeDefined();
	});

	it("should export parser utilities", () => {
		expect(index.parseMdxFile).toBeDefined();
		expect(index.splitByHeadings).toBeDefined();
		expect(index.generateHeadingSlug).toBeDefined();
		expect(index.generateSectionId).toBeDefined();
	});

	it("should export graph builder utilities", () => {
		expect(index.buildContentGraph).toBeDefined();
		expect(index.computeContentHash).toBeDefined();
		expect(index.countWords).toBeDefined();
	});

	it("should export indexer utilities", () => {
		expect(index.buildReverseIndex).toBeDefined();
	});
});
