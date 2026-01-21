import { describe, expect, it } from "vitest";
import {
	analyzeCodeRefs,
	analyzeEnvChanges,
	buildOutput,
	categorizeChangedFiles,
	detectContractChanges,
	extractEnvRefsFromLine,
	extractEnvRefsFromLines,
	extractEnvVarFromLine,
	extractEnvVarsFromLines,
	getChangedFiles,
	getFileDiff,
	isEnvFile,
	isSourceFile,
	main,
	parseArgs,
	parseUnifiedDiff,
} from "./index.js";
import type {
	ChangeSummary,
	ContractChangeOutput,
	ContractRef,
	DetectorOptions,
	DiffLine,
	FileDiff,
} from "./index.js";

describe("index exports", () => {
	it("should export all Detector functions", () => {
		expect(detectContractChanges).toBeDefined();
		expect(typeof detectContractChanges).toBe("function");
		expect(buildOutput).toBeDefined();
		expect(typeof buildOutput).toBe("function");
	});

	it("should export all EnvParser functions", () => {
		expect(extractEnvVarFromLine).toBeDefined();
		expect(typeof extractEnvVarFromLine).toBe("function");
		expect(extractEnvVarsFromLines).toBeDefined();
		expect(typeof extractEnvVarsFromLines).toBe("function");
		expect(analyzeEnvChanges).toBeDefined();
		expect(typeof analyzeEnvChanges).toBe("function");
	});

	it("should export all CodeRefDetector functions", () => {
		expect(extractEnvRefsFromLine).toBeDefined();
		expect(typeof extractEnvRefsFromLine).toBe("function");
		expect(extractEnvRefsFromLines).toBeDefined();
		expect(typeof extractEnvRefsFromLines).toBe("function");
		expect(analyzeCodeRefs).toBeDefined();
		expect(typeof analyzeCodeRefs).toBe("function");
	});

	it("should export all GitDiff functions", () => {
		expect(getChangedFiles).toBeDefined();
		expect(typeof getChangedFiles).toBe("function");
		expect(getFileDiff).toBeDefined();
		expect(typeof getFileDiff).toBe("function");
		expect(parseUnifiedDiff).toBeDefined();
		expect(typeof parseUnifiedDiff).toBe("function");
		expect(isEnvFile).toBeDefined();
		expect(typeof isEnvFile).toBe("function");
		expect(isSourceFile).toBeDefined();
		expect(typeof isSourceFile).toBe("function");
		expect(categorizeChangedFiles).toBeDefined();
		expect(typeof categorizeChangedFiles).toBe("function");
	});

	it("should export all Cli functions", () => {
		expect(parseArgs).toBeDefined();
		expect(typeof parseArgs).toBe("function");
		expect(main).toBeDefined();
		expect(typeof main).toBe("function");
	});

	it("should export type-compatible objects", () => {
		// Test that types are properly exported by using them
		const contractRef: ContractRef = { type: "config", key: "TEST" };
		expect(contractRef.type).toBe("config");

		const summary: ChangeSummary = { added: [], removed: [], changed: [] };
		expect(summary.added).toEqual([]);

		const output: ContractChangeOutput = {
			source: "env",
			changed_contract_refs: [],
			summary: { added: [], removed: [], changed: [] },
		};
		expect(output.source).toBe("env");

		const diffLine: DiffLine = {
			content: "test",
			changeType: "added",
			filePath: "test.ts",
		};
		expect(diffLine.changeType).toBe("added");

		const fileDiff: FileDiff = {
			filePath: "test.ts",
			addedLines: [],
			removedLines: [],
		};
		expect(fileDiff.filePath).toBe("test.ts");

		const options: DetectorOptions = {
			base: "origin/main",
			output: "out.json",
			cwd: "/test",
		};
		expect(options.base).toBe("origin/main");
	});
});
