import type { RunState, ToolDef } from "../../Types";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const set_plan_tool_def: ToolDef = {
	name: "set_plan",
	description:
		"Set a plan with a list of tasks to execute. Use this BEFORE starting any work. Format as a checklist with [ ] for pending tasks and [x] for completed tasks. Update this plan as you complete each step.",
	parameters: {
		type: "object",
		properties: {
			plan: {
				type: "string",
				description: "The plan text with checklist items. Use [ ] for pending and [x] for completed tasks.",
			},
		},
		required: ["plan"],
	},
};

// Implementation (same for both local and E2B)
export function executeSetPlanTool(runState: RunState, plan: string | undefined): string {
	try {
		if (!plan) {
			return "Error: Plan content is required";
		}
		runState.currentPlan = plan;
		return `Plan has been set successfully. Current plan:\n${plan}`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error setting plan: ${err.message}`;
	}
}

// Unified executor
export const setPlanExecutor: ToolExecutor = (runState, args) => {
	const plan = (args as { plan?: string })?.plan;
	return executeSetPlanTool(runState, plan);
};
