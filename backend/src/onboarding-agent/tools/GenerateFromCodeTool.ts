/**
 * GenerateFromCodeTool - Generates documentation from code using E2B sandbox.
 *
 * Uses the jolliagent/E2B sandbox infrastructure to:
 * 1. Checkout the connected repository
 * 2. Analyze code structure
 * 3. Generate documentation articles using create_article / create_section tools
 *
 * Falls back to creating placeholder articles when E2B is not available.
 */

import { type AgentEnvironment, createAgentEnvironment } from "../../../../tools/jolliagent/src/direct/agentenv";
import type { Message, ToolCall } from "../../../../tools/jolliagent/src/Types";
import { runToolCall } from "../../../../tools/jolliagent/src/tools/Tools";
import { createCreateArticleToolDefinition } from "../../adapters/tools/CreateArticleTool";
import { createCreateSectionToolDefinition } from "../../adapters/tools/CreateSectionTool";
import { getConfig } from "../../config/Config";
import { getLog } from "../../util/Logger";
import type { OnboardingToolContext, OnboardingToolExecutionResult } from "../types";
import { getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";
import type { OnboardingGapAnalysisResult } from "jolli-common";

const log = getLog(import.meta);

/**
 * System prompt for the code-to-doc generation agent.
 */
const GENERATION_SYSTEM_PROMPT = `You are a documentation writer. Your task is to analyze code and generate high-quality documentation articles.

For each area that needs documentation:
1. Use the code browsing tools (ls, cat) to understand the code
2. Use create_article to create a new documentation article with comprehensive content

Write documentation that is:
- Clear and concise
- Includes code examples where helpful
- Structured with proper headings
- Practical and actionable

Focus on the most important gaps first (high severity before medium before low).`;

/**
 * Run doc generation using E2B sandbox.
 */
async function runE2BGeneration(
	context: OnboardingToolContext,
	gaps: Array<OnboardingGapAnalysisResult>,
): Promise<Array<string>> {
	const config = getConfig();
	const e2bApiKey = config.E2B_API_KEY;
	const e2bTemplateId = config.E2B_TEMPLATE_ID;

	if (!e2bApiKey || !e2bTemplateId) {
		log.info("E2B not configured, using placeholder generation");
		return runPlaceholderGeneration(context, gaps);
	}

	const githubIntegration = await getActiveGithubIntegration(context);
	if (!githubIntegration) {
		log.warn("No GitHub integration for doc generation");
		return runPlaceholderGeneration(context, gaps);
	}

	const metadata = githubIntegration.metadata;
	const accessToken = await getAccessTokenForIntegration(metadata);
	if (!accessToken) {
		log.warn("Could not get access token for doc generation");
		return runPlaceholderGeneration(context, gaps);
	}

	const [owner, repo] = metadata.repo.split("/");

	// Build context about gaps for the agent
	const gapsContext =
		gaps.length > 0
			? `\n\nDocumentation gaps to address (in priority order):\n${gaps.map(g => `- [${g.severity.toUpperCase()}] ${g.title}: ${g.description}`).join("\n")}`
			: "\n\nGenerate documentation for the main components and APIs in the repository.";

	let env: AgentEnvironment | undefined;
	const generatedArticleJrns: Array<string> = [];

	try {
		// Get space ID for creating articles
		const spaceId = context.stepData.spaceId;
		if (!spaceId) {
			log.warn("No space ID available for doc generation");
			return runPlaceholderGeneration(context, gaps);
		}

		env = await createAgentEnvironment({
			toolPreset: "e2b-code",
			useE2B: true,
			e2bApiKey,
			e2bTemplateId,
			systemPrompt: GENERATION_SYSTEM_PROMPT + gapsContext,
			additionalTools: [createCreateArticleToolDefinition(), createCreateSectionToolDefinition()],
			envVars: {
				GH_PAT: accessToken,
				GH_ORG: owner,
				GH_REPO: repo,
			},
		});

		// Run the agent to generate docs
		const maxArticles = Math.min(gaps.length || 3, 5);
		const messages: Array<Message> = [
			{
				role: "user",
				content: `Analyze the repository ${owner}/${repo} and generate up to ${maxArticles} documentation articles for the most important gaps. First checkout the repo, then analyze the code and create articles.`,
			},
		];

		const result = await env.agent.chatTurn({
			history: messages,
			runTool: async (call: ToolCall) => {
				log.debug("Generation tool call: %s", call.name);
				const output = await runToolCall({}, call);
				// Track created articles from tool results
				if (call.name === "create_article") {
					try {
						const parsed = JSON.parse(output) as { success?: boolean; jrn?: string };
						if (parsed.success && parsed.jrn) {
							generatedArticleJrns.push(parsed.jrn);
						}
					} catch {
						// Result parsing failed, skip tracking
					}
				}
				return output;
			},
		});

		log.info(
			"Doc generation completed, generated %d articles, response: %s",
			generatedArticleJrns.length,
			result.assistantText.slice(0, 100),
		);
		return generatedArticleJrns;
	} catch (error) {
		log.error(error, "E2B doc generation failed, falling back to placeholders");
		return runPlaceholderGeneration(context, gaps);
	} finally {
		if (env) {
			await env.dispose().catch(err => {
				log.warn(err, "Failed to dispose E2B environment");
			});
		}
	}
}

/**
 * Create placeholder articles when E2B is not available.
 */
async function runPlaceholderGeneration(
	context: OnboardingToolContext,
	gaps: Array<OnboardingGapAnalysisResult>,
): Promise<Array<string>> {
	const generatedJrns: Array<string> = [];
	const spaceId = context.stepData.spaceId;

	if (!spaceId) {
		// Try to get default space
		let space = await context.spaceDao.getDefaultSpace();
		if (!space) {
			space = await context.spaceDao.createDefaultSpaceIfNeeded(context.userId);
		}
		await context.updateStepData({ spaceId: space.id });
	}

	const targetSpaceId = context.stepData.spaceId ?? 1;
	const repo = context.stepData.connectedRepo ?? "repository";

	// Generate placeholder articles for each gap (up to 5)
	const gapsToProcess =
		gaps.length > 0
			? gaps.slice(0, 5)
			: [
					{
						title: "Getting Started",
						description: `Getting started guide for ${repo}`,
						severity: "high" as const,
					},
					{
						title: "Architecture Overview",
						description: `Architecture overview of ${repo}`,
						severity: "medium" as const,
					},
				];

	for (const gap of gapsToProcess) {
		try {
			const content = `# ${gap.title}\n\n> This article was generated during onboarding to address a documentation gap.\n>\n> **Gap:** ${gap.description}\n\nPlease edit this article to add your content.\n`;

			const doc = await context.docDao.createDoc({
				updatedBy: "onboarding",
				content,
				contentType: "text/markdown",
				contentMetadata: {
					title: gap.title,
					sourceName: repo,
				},
				docType: "document",
				spaceId: targetSpaceId,
				parentId: undefined,
				createdBy: "onboarding",
				source: undefined,
				sourceMetadata: undefined,
			});

			if (doc.jrn) {
				generatedJrns.push(doc.jrn);
			}
		} catch (error) {
			log.warn(error, "Failed to generate placeholder article: %s", gap.title);
		}
	}

	return generatedJrns;
}

/**
 * Execute doc generation and return results.
 */
export async function executeGenerateFromCode(context: OnboardingToolContext): Promise<OnboardingToolExecutionResult> {
	try {
		log.info({ userId: context.userId }, "Running doc generation from code");

		const gaps = context.stepData.gapAnalysisResults ?? [];
		const generatedJrns = await runE2BGeneration(context, gaps);

		// Update step data
		const existingGenerated = context.stepData.generatedArticles ?? [];
		await context.updateStepData({
			generatedArticles: [...existingGenerated, ...generatedJrns],
		});

		if (generatedJrns.length === 0) {
			return {
				success: false,
				content:
					"No articles were generated. This may be due to a temporary issue. You can try again later from the Articles section.",
			};
		}

		return {
			success: true,
			content: `Successfully generated ${generatedJrns.length} documentation articles from your code.`,
			uiAction: {
				type: "generation_completed",
				message: `Generated ${generatedJrns.length} articles`,
			},
		};
	} catch (error) {
		log.error(error, "Doc generation failed");
		return {
			success: false,
			content: `Doc generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
