/**
 * GapAnalysisTool - Analyzes code vs existing docs to find documentation gaps.
 *
 * Uses the jolliagent/E2B sandbox infrastructure to:
 * 1. Checkout the connected repository
 * 2. Read code files
 * 3. Compare against imported articles
 * 4. Identify documentation gaps
 *
 * Falls back to a simpler heuristic analysis when E2B is not available.
 */

import { type AgentEnvironment, createAgentEnvironment } from "../../../../tools/jolliagent/src/direct/agentenv";
import type { Message, ToolCall } from "../../../../tools/jolliagent/src/Types";
import { runToolCall } from "../../../../tools/jolliagent/src/tools/Tools";
import { getConfig } from "../../config/Config";
import { getLog } from "../../util/Logger";
import type { OnboardingToolContext, OnboardingToolExecutionResult } from "../types";
import { getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";
import type { OnboardingGapAnalysisResult } from "jolli-common";

const log = getLog(import.meta);

/**
 * System prompt for the gap analysis agent in the E2B sandbox.
 */
const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a documentation gap analyzer. Your task is to:

1. Explore the repository code structure using the provided tools (ls, cat)
2. Identify key components, APIs, and modules
3. Compare against the list of existing documentation articles provided
4. Identify areas that need documentation but don't have it

Respond with a JSON array of gaps, where each gap has:
- "title": Short title for the gap (e.g., "API Authentication")
- "description": Brief explanation of what documentation is missing
- "severity": "high", "medium", or "low"

Focus on:
- HIGH: Core APIs, authentication, getting started guides
- MEDIUM: Configuration, deployment, architecture overview
- LOW: Internal utilities, edge cases, advanced usage

Return ONLY valid JSON in this format:
[{"title": "...", "description": "...", "severity": "high|medium|low"}]`;

/**
 * Run gap analysis using E2B sandbox.
 */
async function runE2BGapAnalysis(context: OnboardingToolContext): Promise<Array<OnboardingGapAnalysisResult>> {
	const config = getConfig();
	const e2bApiKey = config.E2B_API_KEY;
	const e2bTemplateId = config.E2B_TEMPLATE_ID;

	if (!e2bApiKey || !e2bTemplateId) {
		log.info("E2B not configured, using heuristic gap analysis");
		return runHeuristicGapAnalysis(context);
	}

	const githubIntegration = await getActiveGithubIntegration(context);
	if (!githubIntegration) {
		log.warn("No GitHub integration for gap analysis");
		return runHeuristicGapAnalysis(context);
	}

	const metadata = githubIntegration.metadata;
	const accessToken = await getAccessTokenForIntegration(metadata);
	if (!accessToken) {
		log.warn("Could not get access token for gap analysis");
		return runHeuristicGapAnalysis(context);
	}

	const [owner, repo] = metadata.repo.split("/");
	const importedArticles = context.stepData.importedArticles ?? [];

	// Build context about existing docs for the agent
	const existingDocsContext =
		importedArticles.length > 0
			? `\n\nExisting documentation articles (${importedArticles.length} total):\n${importedArticles.map(jrn => `- ${jrn}`).join("\n")}`
			: "\n\nNo existing documentation articles have been imported yet.";

	let env: AgentEnvironment | undefined;
	try {
		env = await createAgentEnvironment({
			toolPreset: "e2b-code",
			useE2B: true,
			e2bApiKey,
			e2bTemplateId,
			systemPrompt: GAP_ANALYSIS_SYSTEM_PROMPT + existingDocsContext,
			envVars: {
				GH_PAT: accessToken,
				GH_ORG: owner,
				GH_REPO: repo,
			},
		});

		// Run the agent to analyze the repo
		const messages: Array<Message> = [
			{
				role: "user",
				content: `Analyze the repository ${owner}/${repo} for documentation gaps. First checkout the repo, explore the code structure, then identify what needs documentation.`,
			},
		];

		const result = await env.agent.chatTurn({
			history: messages,
			runTool: (call: ToolCall) => {
				log.debug("Gap analysis tool call: %s", call.name);
				return runToolCall({}, call);
			},
		});

		// Parse the response for gaps
		return parseGapResults(result.assistantText);
	} catch (error) {
		log.error(error, "E2B gap analysis failed, falling back to heuristic");
		return runHeuristicGapAnalysis(context);
	} finally {
		if (env) {
			await env.dispose().catch(err => {
				log.warn(err, "Failed to dispose E2B environment");
			});
		}
	}
}

/**
 * Parse gap analysis results from agent response.
 */
function parseGapResults(content: string): Array<OnboardingGapAnalysisResult> {
	try {
		// Try to extract JSON array from the response
		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			log.warn("Could not find JSON array in gap analysis response");
			return [];
		}

		const parsed = JSON.parse(jsonMatch[0]) as Array<{
			title?: string;
			description?: string;
			severity?: string;
		}>;

		return parsed
			.filter(item => item.title && item.description)
			.map(item => ({
				title: item.title as string,
				description: item.description as string,
				severity: (["high", "medium", "low"].includes(item.severity ?? "") ? item.severity : "medium") as
					| "high"
					| "medium"
					| "low",
			}));
	} catch (error) {
		log.warn(error, "Failed to parse gap analysis results");
		return [];
	}
}

/**
 * Heuristic gap analysis when E2B is not available.
 * Compares discovered files against imported articles to find obvious gaps.
 */
function runHeuristicGapAnalysis(context: OnboardingToolContext): Array<OnboardingGapAnalysisResult> {
	const discoveredFiles = context.stepData.discoveredFiles ?? [];
	const importedArticles = context.stepData.importedArticles ?? [];
	const gaps: Array<OnboardingGapAnalysisResult> = [];

	// Check for common documentation files that should exist
	const commonDocs = [
		{ pattern: /readme/i, title: "README", severity: "high" as const },
		{ pattern: /getting[_-]?started/i, title: "Getting Started Guide", severity: "high" as const },
		{ pattern: /install|setup/i, title: "Installation Guide", severity: "high" as const },
		{ pattern: /api[_-]?ref|api[_-]?doc/i, title: "API Reference", severity: "medium" as const },
		{ pattern: /contribut/i, title: "Contributing Guide", severity: "medium" as const },
		{ pattern: /architect/i, title: "Architecture Overview", severity: "medium" as const },
		{ pattern: /changelog|release/i, title: "Changelog", severity: "low" as const },
		{ pattern: /deploy|ci|cd/i, title: "Deployment Guide", severity: "medium" as const },
	];

	for (const doc of commonDocs) {
		const hasFile = discoveredFiles.some(f => doc.pattern.test(f));
		if (!hasFile) {
			gaps.push({
				title: doc.title,
				description: `No ${doc.title.toLowerCase()} found in the repository. Consider creating one.`,
				severity: doc.severity,
			});
		}
	}

	// If very few docs exist, add a general gap
	if (importedArticles.length < 3 && discoveredFiles.length < 3) {
		gaps.push({
			title: "General Documentation",
			description:
				"The repository has very little documentation. Consider adding guides for key features and workflows.",
			severity: "high",
		});
	}

	return gaps;
}

/**
 * Execute gap analysis and return results.
 */
export async function executeGapAnalysis(context: OnboardingToolContext): Promise<OnboardingToolExecutionResult> {
	try {
		log.info({ userId: context.userId }, "Running gap analysis");

		const gaps = await runE2BGapAnalysis(context);

		// Update step data with results
		await context.updateStepData({
			gapAnalysisResults: gaps,
		});

		if (gaps.length === 0) {
			return {
				success: true,
				content: "Gap analysis complete. Your documentation looks comprehensive - no major gaps detected!",
			};
		}

		const highCount = gaps.filter(g => g.severity === "high").length;
		const medCount = gaps.filter(g => g.severity === "medium").length;
		const lowCount = gaps.filter(g => g.severity === "low").length;

		return {
			success: true,
			content: `Gap analysis found ${gaps.length} documentation gaps (${highCount} high, ${medCount} medium, ${lowCount} low priority).`,
			uiAction: {
				type: "open_gap_analysis",
				message: `Found ${gaps.length} documentation gaps`,
			},
		};
	} catch (error) {
		log.error(error, "Gap analysis failed");
		return {
			success: false,
			content: `Gap analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
