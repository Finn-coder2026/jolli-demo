import { describe, expect, it, vi } from "vitest";
import { detectContractChanges } from "./Detector.js";
import * as DetectorFactory from "./detectors/DetectorFactory.js";

describe("Detector", () => {
	describe("detectContractChanges", () => {
		it("should delegate to runDetector from factory", async () => {
			const mockResult = {
				source: "env" as const,
				changed_contract_refs: [],
				summary: { added: [], removed: [], changed: [] },
			};

			const runDetectorSpy = vi.spyOn(DetectorFactory, "runDetector").mockResolvedValue(mockResult);

			const options = {
				detector: "env" as const,
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			};

			const result = await detectContractChanges(options);

			expect(runDetectorSpy).toHaveBeenCalledWith(options);
			expect(result).toEqual(mockResult);

			vi.restoreAllMocks();
		});

		it("should work with openapi detector", async () => {
			const mockResult = {
				source: "openapi" as const,
				changed_contract_refs: [{ type: "openapi" as const, key: "TestService_get" }],
				summary: { added: [], removed: [], changed: ["TestService_get"] },
			};

			vi.spyOn(DetectorFactory, "runDetector").mockResolvedValue(mockResult);

			const result = await detectContractChanges({
				detector: "openapi",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
				repo: "/external/repo",
			});

			expect(result.source).toBe("openapi");
			expect(result.changed_contract_refs[0].type).toBe("openapi");

			vi.restoreAllMocks();
		});
	});
});
