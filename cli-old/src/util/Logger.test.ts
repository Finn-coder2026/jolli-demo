import { getLog } from "./Logger";
import { describe, expect, it } from "vitest";

describe("Logger", () => {
	it("should create a logger from string module name", () => {
		const log = getLog("TestModule");
		expect(log).toBeDefined();
		expect(log.info).toBeDefined();
		expect(log.error).toBeDefined();
		expect(log.warn).toBeDefined();
		expect(log.debug).toBeDefined();
	});

	it("should create a logger from import.meta", () => {
		const mockImportMeta = {
			url: "file:///path/to/module.ts",
		} as ImportMeta;
		const log = getLog(mockImportMeta);
		expect(log).toBeDefined();
		expect(log.info).toBeDefined();
		expect(log.error).toBeDefined();
		expect(log.warn).toBeDefined();
		expect(log.debug).toBeDefined();
	});
});
