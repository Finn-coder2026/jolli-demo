/**
 * Tests for AdvanceStepTool.
 */

import { advanceStepTool } from "./AdvanceStepTool";
import { createMockToolContext } from "./ToolTestUtils";
import { describe, expect, it } from "vitest";

describe("AdvanceStepTool", () => {
	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(advanceStepTool.definition.name).toBe("advance_step");
		});

		it("should require next_step parameter", () => {
			expect(advanceStepTool.definition.parameters.required).toContain("next_step");
		});

		it("should have enum values for next_step", () => {
			const prop = advanceStepTool.definition.parameters.properties.next_step;
			expect(prop.enum).toBeDefined();
			expect(prop.enum).toContain("welcome");
			expect(prop.enum).toContain("connect_github");
			expect(prop.enum).toContain("scan_repos");
			expect(prop.enum).toContain("import_docs");
			expect(prop.enum).toContain("complete");
		});
	});

	describe("handler", () => {
		it("should call advanceStep with the provided step", async () => {
			const ctx = createMockToolContext();
			const result = await advanceStepTool.handler({ next_step: "scan_repos" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("scan_repos");
			expect(ctx.advanceStep).toHaveBeenCalledWith("scan_repos");
		});

		it("should return success for each valid step", async () => {
			const steps = ["welcome", "connect_github", "scan_repos", "import_docs", "complete"];
			for (const step of steps) {
				const ctx = createMockToolContext();
				const result = await advanceStepTool.handler({ next_step: step }, ctx);
				expect(result.success).toBe(true);
				expect(result.content).toContain(step);
			}
		});
	});
});
