/**
 * SkipOnboarding Tool - Skips the onboarding flow.
 */

import type { OnboardingTool } from "../types";

export const skipOnboardingTool: OnboardingTool = {
	definition: {
		name: "skip_onboarding",
		description:
			"Skip the onboarding process. Use this when the user explicitly wants to skip and explore on their own.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: async (_args, context) => {
		await context.skipOnboarding();

		return {
			success: true,
			content:
				"Onboarding skipped. You can always come back to set up integrations later from the Integrations page.",
		};
	},
};
