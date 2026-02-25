/**
 * CompleteOnboarding Tool - Completes the onboarding flow with validation.
 */

import type { OnboardingTool, OnboardingToolContext } from "../types";

/**
 * Check if onboarding can be completed.
 */
function canCompleteOnboarding(context: OnboardingToolContext): { canComplete: boolean; reason?: string } {
	const { connectedIntegration, importedArticles, generatedCount } = context.stepData;

	// Must have at least one article (imported or generated)
	const hasArticles = (importedArticles?.length ?? 0) > 0 || (generatedCount ?? 0) > 0;

	if (!hasArticles) {
		// If they have an integration but no articles, that's still progress
		if (connectedIntegration) {
			return {
				canComplete: false,
				reason: "You have connected GitHub but haven't imported any articles yet. Import at least one article to complete onboarding, or use skip_onboarding if you want to explore on your own.",
			};
		}
		return {
			canComplete: false,
			reason: "Please import at least one article or generate some documentation before completing onboarding. If you want to explore on your own, use skip_onboarding instead.",
		};
	}

	return { canComplete: true };
}

export const completeOnboardingTool: OnboardingTool = {
	definition: {
		name: "complete_onboarding",
		description:
			"Mark the onboarding as complete. Use this when the user has imported or generated at least one article. If they haven't completed any tasks, suggest using skip_onboarding instead.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: async (_args, context) => {
		// Validate that onboarding can be completed
		const { canComplete, reason } = canCompleteOnboarding(context);

		if (!canComplete) {
			return {
				success: false,
				content: reason || "Cannot complete onboarding at this time.",
			};
		}

		await context.completeOnboarding();

		const articleCount = (context.stepData.importedArticles?.length ?? 0) + (context.stepData.generatedCount ?? 0);
		const hasIntegration = !!context.stepData.connectedIntegration;

		return {
			success: true,
			content: `Onboarding completed! 🎉\n\nSummary:\n- Articles created: ${articleCount}\n- GitHub connected: ${hasIntegration ? "Yes" : "No"}\n\nWelcome to Jolli! You can now:\n- View and edit your articles in the Articles section\n- Set up more integrations from the Integrations page\n- Create Doc Sites to publish your documentation`,
		};
	},
};
