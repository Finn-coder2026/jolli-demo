/**
 * Impact Command
 *
 * Analyzes git diff between current branch and origin to build a structured
 * changeset for documentation impact analysis.
 *
 * Usage:
 *   jolli impact              # Diff against origin/main
 *   jolli impact --base=dev   # Diff against origin/dev
 *   jolli impact --json       # Output as JSON
 */

import { getLog, logError } from "../../shared/logger";
import { generateImpactReport, generateUncommittedReport, getChangeSummary } from "./impact/GitDiffParser";
import { runImpactAgent } from "./impact/ImpactAgentRunner";
import { type ImpactSearchOptions, runImpactSearch } from "./impact/search";
import type { ImpactReport } from "./impact/Types";
import type { Command } from "commander";

const logger = getLog(import.meta);

// =============================================================================
// SECTION: Constants
// =============================================================================

const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	blue: "\x1b[34m",
};

// =============================================================================
// SECTION: LLM Prompt Generation
// =============================================================================

/**
 * Generates the prompt for the LLM to fill in queryText fields.
 */
export function generateLLMPrompt(report: ImpactReport): string {
	const commitMessages = report.commits.map(c => `- ${c.sha}: ${c.message}`).join("\n");
	const filesChanged = [...new Set(report.commits.flatMap(c => c.hunks.map(h => h.file)))];

	let prompt = `You are analyzing code changes to find related documentation that may need updating.

## Branch Information
- Branch: ${report.branch}
- Base: ${report.base}
- Commits: ${report.commits.length}
- Files changed: ${filesChanged.length}

## Commit Messages
${commitMessages}

## Instructions

For each section below, write a \`queryText\` - a search query optimized for BM25+vector retrieval against architecture documentation.

Guidelines for queryText:
- Describe WHAT changed functionally, not the syntax
- Include: file paths, function/class names, module names, architectural concepts
- Use terms that would appear in architecture docs (e.g., "authentication flow", "API endpoint", "database schema", "event handling")
- Keep it 1-3 sentences, keyword-rich
- Focus on externally visible changes: APIs, configs, error messages, CLI flags

---

## Overall Branch Summary

Write:
1. \`summary\`: 1-2 sentence description of what this branch accomplishes
2. \`queryText\`: Search query to find architecture docs covering these changes

`;

	// Add each commit
	for (const commit of report.commits) {
		prompt += `\n---\n\n## Commit: ${commit.sha}\nMessage: ${commit.message}\nAuthor: ${commit.author}\n\nWrite:\n1. \`summary\`: What this commit does\n2. For each hunk below, write a \`queryText\`\n`;

		for (let i = 0; i < commit.hunks.length; i++) {
			const hunk = commit.hunks[i];
			prompt += `\n### Hunk ${i + 1}: ${hunk.file}\nStatus: ${hunk.status}\nContext: ${hunk.context || "(none)"}\n\nDiff:\n\`\`\`\n${hunk.diff}\n\`\`\`\n\nqueryText:\n`;
		}
	}

	return prompt;
}

// =============================================================================
// SECTION: Output Formatting
// =============================================================================

/**
 * Prints a colored message to the console.
 */
function printColored(color: string, prefix: string, message: string): void {
	console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

/**
 * Prints the impact report in human-readable format.
 */
function printReport(report: ImpactReport): void {
	console.log();
	console.log(`${COLORS.bold}Impact Analysis${COLORS.reset}`);
	console.log(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
	console.log();
	printColored(COLORS.cyan, "Branch:", report.branch);
	printColored(COLORS.cyan, "Base:", report.base);
	printColored(COLORS.cyan, "Summary:", getChangeSummary(report));
	console.log();

	for (const commit of report.commits) {
		console.log(`${COLORS.yellow}Commit ${commit.sha}${COLORS.reset}: ${commit.message}`);
		console.log(`${COLORS.dim}Author: ${commit.author}${COLORS.reset}`);

		if (commit.hunks.length === 0) {
			console.log(`  ${COLORS.dim}(no hunks)${COLORS.reset}`);
		} else {
			for (const hunk of commit.hunks) {
				const statusColor =
					hunk.status === "added" ? COLORS.green : hunk.status === "deleted" ? COLORS.red : COLORS.blue;
				const contextStr = hunk.context ? ` (${hunk.context})` : "";
				console.log(
					`  ${statusColor}${hunk.status}${COLORS.reset} ${hunk.file}${COLORS.dim}${contextStr}${COLORS.reset}`,
				);
			}
		}
		console.log();
	}
}

/**
 * Prints the LLM prompt for filling in queryText.
 */
function printPrompt(report: ImpactReport): void {
	console.log(generateLLMPrompt(report));
}

// =============================================================================
// SECTION: Command Implementation
// =============================================================================

interface ImpactOptions {
	base?: string;
	uncommitted: boolean;
	json: boolean;
	prompt: boolean;
}

/**
 * Runs the impact analysis.
 */
async function runImpact(options: ImpactOptions): Promise<void> {
	logger.debug("Running impact analysis (uncommitted: %s, base: %s)", options.uncommitted, options.base ?? "auto");

	try {
		let report: ImpactReport;

		if (options.uncommitted) {
			report = await generateUncommittedReport();
		} else {
			report = await generateImpactReport(options.base);
		}

		if (options.json) {
			console.log(JSON.stringify(report, null, 2));
		} else if (options.prompt) {
			printPrompt(report);
		} else {
			printReport(report);
			console.log(`${COLORS.dim}Use --prompt to generate LLM prompt for queryText generation${COLORS.reset}`);
			console.log(`${COLORS.dim}Use --json for machine-readable output${COLORS.reset}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${COLORS.red}Error:${COLORS.reset} ${message}`);
		process.exit(1);
	}
}

// =============================================================================
// SECTION: Command Registration
// =============================================================================

/**
 * Registers impact command on the provided Commander program.
 */
export function registerImpactCommands(program: Command): void {
	const impactCommand = program.command("impact").description("Documentation impact analysis tools");

	impactCommand
		.command("extract")
		.description("Extract changesets from git diff for documentation impact analysis")
		.option("-b, --base <ref>", "Base branch to diff against (auto-detects if not provided)")
		.option("-u, --uncommitted", "Only analyze uncommitted changes", false)
		.option("-j, --json", "Output as JSON", false)
		.option("-p, --prompt", "Output LLM prompt for queryText generation", false)
		.action(async (options: ImpactOptions) => {
			await runImpact(options);
		});

	impactCommand
		.command("search")
		.description("Search docs for impacted files using attention frontmatter")
		.option("-b, --base <ref>", "Base branch to diff against (auto-detects if not provided)")
		.option("-u, --uncommitted", "Only analyze uncommitted changes", false)
		.option("-j, --json", "Output as JSON", false)
		.option("-d, --docs <path>", "Docs directory to scan", "docs")
		.option("-s, --source <name>", "Only analyze one attention source (use \"local\" for workspace root)")
		.option("--strict", "Fail when referenced sources cannot be resolved", false)
		.action(async (options: ImpactSearchOptions) => {
			await runImpactSearch(options);
		});

	impactCommand
		.command("agent")
		.description("Run AI agent to update impacted documentation")
		.option("-b, --base <ref>", "Base branch to diff against (auto-detects if not provided)")
		.option("-u, --uncommitted", "Only analyze uncommitted changes", false)
		.option("-d, --docs <path>", "Docs directory to scan", "docs")
		.option("-s, --source <name>", "Only analyze one attention source (use \"local\" for workspace root)")
		.option("--strict", "Fail when referenced sources cannot be resolved", false)
		.option("-y, --yes", "Auto-confirm all updates", false)
		.option("-n, --dry-run", "Preview without making changes", false)
		.option("--limit <n>", "Max articles to process", (v: string) => Number.parseInt(v, 10))
		.option("-j, --json", "Output results as JSON", false)
		.option("--no-propagate", "Skip Phase 2 (article → article propagation)")
		.option("--propagate-only", "Skip Phase 1, only run Phase 2 (article → article)", false)
		.option("--max-depth <n>", "Max propagation depth", (v: string) => Number.parseInt(v, 10), 5)
		.option("-v, --verbose", "Enable verbose logging for debugging", false)
		.action(
			async (options: {
				base?: string;
				uncommitted: boolean;
				docs: string;
				source?: string;
				strict: boolean;
				yes: boolean;
				dryRun: boolean;
				limit?: number;
				json: boolean;
				propagate: boolean;
				propagateOnly: boolean;
				maxDepth: number;
				verbose: boolean;
			}) => {
				try {
					await runImpactAgent({
						base: options.base,
						uncommitted: options.uncommitted,
						docsPath: options.docs,
						source: options.source,
						strict: options.strict,
						autoConfirm: options.yes,
						dryRun: options.dryRun,
						limit: options.limit,
						json: options.json,
						propagate: options.propagate,
						propagateOnly: options.propagateOnly,
						maxDepth: options.maxDepth,
						verbose: options.verbose,
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`${COLORS.red}Error:${COLORS.reset} ${message}`);
					logError(logger, error, "Impact agent failed");
					process.exit(1);
				}
			},
		);
}

// =============================================================================
// SECTION: Exports
// =============================================================================

export { generateImpactReport, getChangeSummary } from "./impact/GitDiffParser";
export type { CommitChange, Hunk, ImpactReport } from "./impact/Types";
