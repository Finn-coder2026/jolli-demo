import { describe, expect, it } from "vitest";
import * as index from "./index.js";

describe("index exports", () => {
	it("should export main functions", () => {
		expect(index.analyzeImpact).toBeDefined();
		expect(index.main).toBeDefined();
		expect(index.parseArgs).toBeDefined();
	});

	it("should export loader utilities", () => {
		expect(index.loadChangedContractRefs).toBeDefined();
		expect(index.loadReverseIndex).toBeDefined();
	});

	it("should export matcher utilities", () => {
		expect(index.matchImpactedSections).toBeDefined();
		expect(index.countUniqueSections).toBeDefined();
	});
});
