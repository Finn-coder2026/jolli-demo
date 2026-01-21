import type { RunState, ToolDef } from "../../Types";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const get_plan_tool_def: ToolDef = {
	name: "get_plan",
	description: "Get the current plan to check your progress",
	parameters: { type: "object", properties: {}, required: [] },
};

// Implementation (same for both local and E2B)
export function executeGetPlanTool(runState: RunState): string {
	try {
		if (!runState.currentPlan) {
			return "No plan has been set yet. Use set_plan to create a plan first.";
		}
		return `Current plan:\n${runState.currentPlan}`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error getting plan: ${err.message}`;
	}
}

// Unified executor
export const getPlanExecutor: ToolExecutor = (runState, _args) => {
	return executeGetPlanTool(runState);
};
