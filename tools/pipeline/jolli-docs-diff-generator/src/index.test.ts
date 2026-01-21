import { describe, expect, it } from "vitest";
import * as exports from "./index.js";

describe("index", () => {
	it("should export generateDiff function", () => {
		expect(exports.generateDiff).toBeDefined();
		expect(typeof exports.generateDiff).toBe("function");
	});

	it("should export loadContentGraph function", () => {
		expect(exports.loadContentGraph).toBeDefined();
		expect(typeof exports.loadContentGraph).toBe("function");
	});

	it("should export generateVersionDiff function", () => {
		expect(exports.generateVersionDiff).toBeDefined();
		expect(typeof exports.generateVersionDiff).toBe("function");
	});

	it("should export parseArgs function", () => {
		expect(exports.parseArgs).toBeDefined();
		expect(typeof exports.parseArgs).toBe("function");
	});

	it("should export main function", () => {
		expect(exports.main).toBeDefined();
		expect(typeof exports.main).toBe("function");
	});

	it("should have correct number of named exports", () => {
		const exportedKeys = Object.keys(exports);
		expect(exportedKeys.length).toBeGreaterThanOrEqual(5);
	});
});
