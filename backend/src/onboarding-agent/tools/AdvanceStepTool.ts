/**
 * AdvanceStep Tool - Advances to the next onboarding step.
 */

import type { OnboardingTool } from "../types";

export const advanceStepTool: OnboardingTool = {
	definition: {
		name: "advance_step",
		description: "Move to the next step in the onboarding flow.",
		parameters: {
			type: "object",
			properties: {
				next_step: {
					type: "string",
					description: "The step to advance to",
					enum: ["welcome", "connect_github", "scan_repos", "import_docs", "complete"],
				},
			},
			required: ["next_step"],
		},
	},
	handler: async (args, context) => {
		const nextStep = args.next_step as "welcome" | "connect_github" | "scan_repos" | "import_docs" | "complete";
		await context.advanceStep(nextStep);

		return {
			success: true,
			content: `Advanced to step: ${nextStep}`,
		};
	},
};
