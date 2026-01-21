import { describe, expect, it, vi } from "vitest";
import { git } from "../GitDiff.js";
import { getDetector, runDetector } from "./DetectorFactory.js";
import type { DetectorOptions } from "../types.js";

describe("DetectorFactory", () => {
	describe("getDetector", () => {
		it("should return env detector for env type", () => {
			const options: DetectorOptions = {
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			};

			const detector = getDetector(options);

			expect(typeof detector).toBe("function");
		});

		it("should return openapi detector for openapi type", () => {
			const options: DetectorOptions = {
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external",
			};

			const detector = getDetector(options);

			expect(typeof detector).toBe("function");
		});

		it("should throw error for unknown detector type", () => {
			const options = {
				detector: "unknown" as unknown,
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			} as DetectorOptions;

			expect(() => getDetector(options)).toThrow("Unknown detector type: unknown");
		});
	});

	describe("runDetector", () => {
		it("should run env detector and return results", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({ stdout: "", stderr: "" });

			const options: DetectorOptions = {
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			};

			const result = await runDetector(options);

			expect(result).toHaveProperty("source");
			expect(result).toHaveProperty("changed_contract_refs");
			expect(result).toHaveProperty("summary");

			vi.restoreAllMocks();
		});

		it("should throw error for openapi detector without repo", async () => {
			const options: DetectorOptions = {
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			};

			await expect(runDetector(options)).rejects.toThrow("OpenAPI detector requires --repo option");
		});
	});
});
