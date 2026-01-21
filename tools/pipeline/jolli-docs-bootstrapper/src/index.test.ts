import { describe, expect, it } from "vitest";
import * as index from "./index.js";

describe("index exports", () => {
	it("should export main functions", () => {
		expect(index.bootstrapDocumentation).toBeDefined();
		expect(index.isDirectoryEmpty).toBeDefined();
		expect(index.generateApiReferenceDocs).toBeDefined();
		expect(index.generateOverviewDocs).toBeDefined();
		expect(index.scanRepository).toBeDefined();
		expect(index.parseArgs).toBeDefined();
		expect(index.main).toBeDefined();
	});

	it("should export templates", () => {
		expect(index.generateApiReferenceMdx).toBeDefined();
		expect(index.generateOverviewMdx).toBeDefined();
		expect(index.generateQuickstartMdx).toBeDefined();
	});

	it("should export scanner utilities", () => {
		expect(index.isRouteFile).toBeDefined();
		expect(index.extractEndpointInfo).toBeDefined();
	});
});
