import { createUpdatePlanToolDefinition, updatePlanArgsSchema } from "./UpdatePlanTool";
import { describe, expect, it } from "vitest";

describe("UpdatePlanTool", () => {
	describe("createUpdatePlanToolDefinition", () => {
		it("returns a tool definition with correct name", () => {
			const def = createUpdatePlanToolDefinition();

			expect(def.name).toBe("update_plan");
		});

		it("returns a tool definition with description", () => {
			const def = createUpdatePlanToolDefinition();

			expect(def.description).toBeTruthy();
		});

		it("returns a tool definition with object parameters", () => {
			const def = createUpdatePlanToolDefinition();

			expect(def.parameters.type).toBe("object");
			expect(def.parameters.properties).toBeDefined();
			expect(def.parameters.required).toContain("plan");
		});

		it("has plan and phase properties", () => {
			const def = createUpdatePlanToolDefinition();
			const props = def.parameters.properties as Record<string, { type: string }>;

			expect(props.plan).toBeDefined();
			expect(props.plan.type).toBe("string");
			expect(props.phase).toBeDefined();
			expect(props.phase.type).toBe("string");
		});
	});

	describe("updatePlanArgsSchema", () => {
		it("accepts valid plan with default phase", () => {
			const result = updatePlanArgsSchema.safeParse({ plan: "# My Plan\n- Step 1" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.plan).toBe("# My Plan\n- Step 1");
				expect(result.data.phase).toBe("planning");
			}
		});

		it("accepts valid plan with explicit phase", () => {
			const result = updatePlanArgsSchema.safeParse({ plan: "The plan", phase: "executing" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.phase).toBe("executing");
			}
		});

		it("accepts complete phase", () => {
			const result = updatePlanArgsSchema.safeParse({ plan: "Done", phase: "complete" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.phase).toBe("complete");
			}
		});

		it("rejects empty plan", () => {
			const result = updatePlanArgsSchema.safeParse({ plan: "" });

			expect(result.success).toBe(false);
		});

		it("rejects missing plan", () => {
			const result = updatePlanArgsSchema.safeParse({});

			expect(result.success).toBe(false);
		});

		it("rejects invalid phase value", () => {
			const result = updatePlanArgsSchema.safeParse({ plan: "OK", phase: "invalid" });

			expect(result.success).toBe(false);
		});
	});
});
