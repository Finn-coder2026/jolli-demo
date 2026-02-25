/**
 * Onboarding Tools Index - Exports all onboarding agent tools.
 */

import type { OnboardingTool, OnboardingToolDefinition } from "../types";
import { advanceStepTool } from "./AdvanceStepTool";
import { checkGitHubStatusTool } from "./CheckGitHubStatusTool";
import { checkSyncTriggeredTool } from "./CheckSyncTriggeredTool";
import { completeOnboardingTool } from "./CompleteOnboardingTool";
import { connectGitHubRepoTool } from "./ConnectGitHubRepoTool";
import { generateArticleTool } from "./GenerateArticleTool";
import { getOrCreateSpaceTool } from "./GetOrCreateSpaceTool";
import { importAllMarkdownTool } from "./ImportAllMarkdownTool";
import { importMarkdownTool } from "./ImportMarkdownTool";
import { installGitHubAppTool } from "./InstallGitHubAppTool";
import { listReposTool } from "./ListReposTool";
import { scanRepositoryTool } from "./ScanRepositoryTool";
import { skipOnboardingTool } from "./SkipOnboardingTool";

/**
 * All available onboarding tools.
 */
export const onboardingTools: Array<OnboardingTool> = [
	// GitHub App connection
	checkGitHubStatusTool,
	installGitHubAppTool,
	connectGitHubRepoTool,
	// Space and import tools
	getOrCreateSpaceTool,
	listReposTool,
	scanRepositoryTool,
	importMarkdownTool,
	importAllMarkdownTool,
	generateArticleTool,
	// Sync verification
	checkSyncTriggeredTool,
	// Flow control tools
	advanceStepTool,
	skipOnboardingTool,
	completeOnboardingTool,
];

/**
 * Get tool definitions formatted for LLM APIs.
 */
export function getToolDefinitions(): Array<OnboardingToolDefinition> {
	return onboardingTools.map(tool => tool.definition);
}

/**
 * Get a tool by name.
 */
export function getToolByName(name: string): OnboardingTool | undefined {
	return onboardingTools.find(tool => tool.definition.name === name);
}

// Re-export individual tools for direct access
export { advanceStepTool } from "./AdvanceStepTool";
export { checkGitHubStatusTool } from "./CheckGitHubStatusTool";
export { checkSyncTriggeredTool } from "./CheckSyncTriggeredTool";
export { completeOnboardingTool } from "./CompleteOnboardingTool";
export { connectGitHubRepoTool } from "./ConnectGitHubRepoTool";
export { generateArticleTool } from "./GenerateArticleTool";
export { getOrCreateSpaceTool } from "./GetOrCreateSpaceTool";
export { importAllMarkdownTool } from "./ImportAllMarkdownTool";
export { importMarkdownTool } from "./ImportMarkdownTool";
export { installGitHubAppTool } from "./InstallGitHubAppTool";
export { listReposTool } from "./ListReposTool";
export { scanRepositoryTool } from "./ScanRepositoryTool";
export { skipOnboardingTool } from "./SkipOnboardingTool";
