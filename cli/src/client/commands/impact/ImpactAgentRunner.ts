/**
 * Impact Agent Runner
 *
 * Orchestrates the impact agent workflow:
 * 1. Generate impact report from git changes
 * 2. Find impacted articles via attention frontmatter
 * 3. For each article, run agent to analyze and update
 * 4. Save audit trail
 */

import { getConfig } from "../../../shared/config";
import { findProjectRoot } from "../../../shared/ProjectRoot";
import { getLog, logError } from "../../../shared/logger";
import {
	type AgentConvoClient,
	type AgentEvent,
	type ContentChunkEvent,
	createAgentConvoClient,
	createMercureSubscription,
	createSSESubscription,
	type MercureSubscription,
	type ToolCallRequestEvent,
} from "../../agent";
import { loadAuthToken } from "../../auth/config";
import { createToolHost, type EditArticleResult, type ToolHost, type ToolResult } from "../AgentToolHost";
import { LOCAL_SOURCE_NAME, buildAttentionIndex, normalizeRepoPath } from "./AttentionIndex";
import { type DocAttention } from "./AttentionParser";
import { loadDocAttention } from "./DocLoader";
import {
	type ArticleAuditEntry,
	addArticleToRecord,
	createAuditRecord,
	loadAuditLog,
	saveAuditRecord,
} from "./AuditTrail";
import {
	type PropagationState,
	advancePropagationState,
	createPropagationState,
	shouldProcess,
} from "./CycleDetector";
import { createSimpleDiff } from "./DiffUtils";
import type { FileMatch } from "./FileMatcher";
import { generateImpactReport, generateUncommittedReport } from "./GitDiffParser";
import {
	buildImpactContext,
	buildInitialMessage,
	buildPropagationContext,
	type ImpactContext,
} from "./ImpactContextBuilder";
import {
	type Phase1Update,
	type MutablePropagationResult,
	type PropagationResult,
	buildInitialPropagationState,
	findDependentArticles,
	getPhase1Updates,
} from "./Propagation";
import {
	buildImpactMatches,
	resolveImpactSources,
	selectImpactSources,
	type ResolvedImpactSource,
	type SourcedRawFileChange,
} from "./search";
import type { ImpactReport } from "./Types";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const config = getConfig();
const logger = getLog(import.meta);

// ANSI colors
const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

/**
 * Options for running the impact agent.
 */
export interface ImpactAgentOptions {
	readonly base?: string;
	readonly uncommitted: boolean;
	readonly docsPath: string;
	readonly source?: string;
	readonly strict?: boolean;
	readonly autoConfirm: boolean;
	readonly dryRun: boolean;
	readonly limit?: number;
	readonly json: boolean;
	/** Run Phase 2 after Phase 1 (default: true) */
	readonly propagate: boolean;
	/** Skip Phase 1, only run Phase 2 */
	readonly propagateOnly: boolean;
	/** Max propagation depth (default: 5) */
	readonly maxDepth: number;
	/** Enable verbose logging for debugging (default: false) */
	readonly verbose: boolean;
}

/**
 * Result of processing a single article.
 */
export interface ArticleResult {
	readonly jrn: string;
	readonly path: string;
	readonly status: "updated" | "unchanged" | "skipped" | "error";
	readonly patch?: string;
	readonly reasoning?: string;
	readonly error?: string;
	readonly editReasons?: ReadonlyArray<string>;
}

/**
 * Result of the impact agent run.
 */
export interface ImpactAgentRunResult {
	readonly results: ReadonlyArray<ArticleResult>;
	readonly auditRecordId: string;
	readonly phase1Results?: ReadonlyArray<ArticleResult>;
	readonly phase2Results?: ReadonlyArray<ArticleResult>;
	readonly propagationResult?: PropagationResult;
}

/**
 * User action choices for interactive mode.
 */
type UserAction = "update" | "view" | "skip" | "quit";


/**
 * Prompts user for action on an article (interactive mode).
 */
function promptForAction(article: FileMatch): Promise<UserAction> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise(resolve => {
		console.log(`\n${COLORS.bold}Article: ${article.docPath}${COLORS.reset} (${article.docId})`);
		console.log("Matched by:");
		for (const evidence of article.matches) {
			const sourceLabel = evidence.source === LOCAL_SOURCE_NAME ? "local" : evidence.source;
			console.log(`  • [${sourceLabel}] ${evidence.changedFile} matched ${evidence.pattern} (${evidence.matchType})`);
		}
		console.log();
		console.log("  [u] Update - Run agent to analyze and update");
		console.log("  [v] View   - Show the code changes");
		console.log("  [s] Skip   - Skip this article");
		console.log("  [q] Quit   - Exit without processing remaining");
		console.log();

		rl.question("> ", answer => {
			rl.close();
			const choice = answer.trim().toLowerCase();
			switch (choice) {
				case "u":
				case "update":
					resolve("update");
					break;
				case "v":
				case "view":
					resolve("view");
					break;
				case "s":
				case "skip":
					resolve("skip");
					break;
				case "q":
				case "quit":
					resolve("quit");
					break;
				default:
					// Default to skip for invalid input
					resolve("skip");
			}
		});
	});
}

/**
 * Displays the code or article changes for viewing.
 */
function displayChanges(context: ImpactContext): void {
	const isArticleChange = context.commits.length === 0;
	const header = isArticleChange ? "Article Changes:" : "Code Changes:";
	console.log(`\n${COLORS.bold}${header}${COLORS.reset}\n`);
	for (const change of context.changes) {
		console.log(`${COLORS.cyan}${change.path}${COLORS.reset} (${change.status})`);
		if (change.diff) {
			const lines = change.diff.split("\n");
			for (const line of lines) {
				if (line.startsWith("+")) {
					console.log(`${COLORS.green}${line}${COLORS.reset}`);
				} else if (line.startsWith("-")) {
					console.log(`${COLORS.red}${line}${COLORS.reset}`);
				} else {
					console.log(line);
				}
			}
		}
		console.log();
	}
}

/**
 * State for tracking agent session.
 */
interface AgentSessionState {
	isStreaming: boolean;
	pendingChunks: Array<ContentChunkEvent>;
	nextChunkSeq: number;
	fullResponse: string;
	isComplete: boolean;
	error: string | null;
	writtenFiles: Map<string, string>;
	editReasons: Array<string>;
}

/**
 * Runs the agent for a single article.
 */
async function runAgentForArticle(
	client: AgentConvoClient,
	toolHost: ToolHost,
	authToken: string,
	article: FileMatch,
	context: ImpactContext,
	workspaceRoot: string,
): Promise<ArticleResult> {
	logger.info("Processing article %s (%s)", article.docPath, article.docId);

	// Read original article content
	const articlePath = path.join(workspaceRoot, article.docPath);
	let originalContent: string;
	try {
		originalContent = await fs.readFile(articlePath, "utf8");
	} catch {
		return {
			jrn: article.docId,
			path: article.docPath,
			status: "error",
			error: `Failed to read article: ${articlePath}`,
		};
	}

	// Create conversation with impact mode
	const convo = await client.createConvo({
		workspaceRoot,
		toolManifest: toolHost.getManifest(),
		clientVersion: "0.1.0",
		agentMode: "impact",
		impactContext: context,
	});

	logger.info("Created impact agent conversation %d for article %s", convo.id, article.docId);

	// Set up session state
	const state: AgentSessionState = {
		isStreaming: false,
		pendingChunks: [],
		nextChunkSeq: 0,
		fullResponse: "",
		isComplete: false,
		error: null,
		writtenFiles: new Map(),
		editReasons: [],
	};

	// Create a custom tool host wrapper to track writes and edits
	const wrappedExecute = async (
		toolName: string,
		args: Record<string, unknown>,
		skipConfirmation?: boolean,
	): Promise<ToolResult> => {
		const result = await toolHost.execute(toolName, args, skipConfirmation);
		if (toolName === "write_file" && result.success) {
			const filePath = args.path as string;
			const content = args.content as string;
			if (filePath && content) {
				state.writtenFiles.set(filePath, content);
			}
		} else if (toolName === "edit_article" && result.success) {
			const filePath = args.path as string;
			if (filePath) {
				// Read the updated file content for diff generation
				try {
					const updatedPath = path.join(workspaceRoot, filePath);
					const updatedContent = await fs.readFile(updatedPath, "utf8");
					state.writtenFiles.set(filePath, updatedContent);
				} catch {
					// Fall back to marking as edited if read fails
					state.writtenFiles.set(filePath, "edited");
				}
				// Extract and store edit reasons from the result
				const editResult = result as EditArticleResult;
				if (editResult.appliedEdits) {
					for (const edit of editResult.appliedEdits) {
						state.editReasons.push(edit.reason);
					}
				}
			}
		}
		return result;
	};

	// Set up SSE/Mercure subscription
	return new Promise(resolve => {
		let subscription: MercureSubscription | null = null;

		const handleEvent = async (event: AgentEvent): Promise<void> => {
			switch (event.type) {
				case "connected":
					logger.debug("Connected to conversation stream");
					break;

				case "content_chunk": {
					const chunk = event as ContentChunkEvent;
					state.isStreaming = true;
					state.pendingChunks.push(chunk);
					state.pendingChunks.sort((a, b) => a.seq - b.seq);
					while (state.pendingChunks.length > 0 && state.pendingChunks[0]?.seq === state.nextChunkSeq) {
						const c = state.pendingChunks.shift();
						if (c) {
							state.fullResponse += c.content;
							process.stdout.write(c.content);
							state.nextChunkSeq++;
						}
					}
					break;
				}

				case "tool_call_request": {
					const toolEvent = event as ToolCallRequestEvent;
					if (state.isStreaming) {
						console.log();
						state.isStreaming = false;
					}
					console.log(`${COLORS.yellow}[Tool]${COLORS.reset} Executing ${toolEvent.name}...`);

					try {
						const result = await wrappedExecute(toolEvent.name, toolEvent.arguments, true);
						if (result.success) {
							console.log(`${COLORS.green}[Tool]${COLORS.reset} ${toolEvent.name} completed`);
						} else {
							console.log(`${COLORS.red}[Tool]${COLORS.reset} ${toolEvent.name} failed: ${result.error}`);
						}
						await client.sendToolResult(convo.id, toolEvent.toolCallId, result.output, result.error);
					} catch (err) {
						const errorMsg = err instanceof Error ? err.message : String(err);
						console.log(`${COLORS.red}[Tool]${COLORS.reset} Error: ${errorMsg}`);
						await client.sendToolResult(convo.id, toolEvent.toolCallId, "", errorMsg);
					}
					break;
				}

				case "message_complete":
					if (state.isStreaming) {
						console.log();
						state.isStreaming = false;
					}
					state.isComplete = true;
					finishSession();
					break;

				case "error": {
					const errEvent = event as { error: string };
					state.error = errEvent.error;
					console.log(`${COLORS.red}[Error]${COLORS.reset} ${errEvent.error}`);
					state.isComplete = true;
					finishSession();
					break;
				}
			}
		};

		const finishSession = (): void => {
			if (subscription) {
				subscription.close();
			}

			// Determine result
			const articleRelPath = article.docPath;
			const writtenContent = state.writtenFiles.get(articleRelPath);

			if (state.error) {
				resolve({
					jrn: article.docId,
					path: article.docPath,
					status: "error",
					error: state.error,
					reasoning: state.fullResponse,
				});
				return;
			}

			if (writtenContent) {
				// Article was updated
				const patch = createSimpleDiff(originalContent, writtenContent, article.docPath);
				resolve({
					jrn: article.docId,
					path: article.docPath,
					status: "updated",
					patch,
					reasoning: state.fullResponse,
					editReasons: state.editReasons.length > 0 ? state.editReasons : undefined,
				});
			} else {
				// No update was made
				resolve({
					jrn: article.docId,
					path: article.docPath,
					status: "unchanged",
					reasoning: state.fullResponse,
				});
			}
		};

		// Setup function to initialize streaming
		const setupStreaming = async (): Promise<void> => {
			try {
				const mercureConfig = await client.getMercureConfig();
				if (mercureConfig.enabled && mercureConfig.hubUrl) {
					const tokenResponse = await client.getMercureToken(convo.id);
					subscription = createMercureSubscription(
						{
							hubUrl: mercureConfig.hubUrl,
							subscriberToken: tokenResponse.token,
							topic: tokenResponse.topics[0],
						},
						{
							onEvent: handleEvent,
							onError: err => {
								logger.warn("Mercure error: %s", err.message);
							},
						},
					);
				} else {
					// Fallback to direct SSE
					subscription = createSSESubscription(
						{
							serverUrl: config.JOLLI_URL,
							convoId: convo.id,
							authToken,
						},
						{
							onEvent: handleEvent,
							onError: err => {
								logger.warn("SSE error: %s", err.message);
							},
						},
					);
				}
			} catch (err) {
				logError(logger, err, "Failed to set up streaming");
				resolve({
					jrn: article.docId,
					path: article.docPath,
					status: "error",
					error: "Failed to set up streaming connection",
				});
				return;
			}

			// Send initial message with diffs
			const initialMessage = buildInitialMessage(context);
			try {
				await client.sendMessage(convo.id, initialMessage);
			} catch (err) {
				logError(logger, err, "Failed to send initial message");
				if (subscription) {
					subscription.close();
				}
				resolve({
					jrn: article.docId,
					path: article.docPath,
					status: "error",
					error: "Failed to send initial message",
				});
			}
		};

		// Kick off the async setup
		setupStreaming();
	});
}

/**
 * Prints the final summary of the impact agent run.
 */
function printSummary(results: ReadonlyArray<ArticleResult>): void {
	const updated = results.filter(r => r.status === "updated").length;
	const unchanged = results.filter(r => r.status === "unchanged").length;
	const skipped = results.filter(r => r.status === "skipped").length;
	const errors = results.filter(r => r.status === "error").length;

	console.log();
	console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
	console.log(`${COLORS.bold}Summary${COLORS.reset}`);
	console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
	console.log(`  ${COLORS.green}Updated:${COLORS.reset}   ${updated}`);
	console.log(`  ${COLORS.dim}Unchanged:${COLORS.reset} ${unchanged}`);
	console.log(`  ${COLORS.yellow}Skipped:${COLORS.reset}   ${skipped}`);
	console.log(`  ${COLORS.red}Errors:${COLORS.reset}    ${errors}`);
}

/**
 * Prints a combined summary for Phase 1 + Phase 2.
 */
function printCombinedSummary(
	phase1Results: ReadonlyArray<ArticleResult>,
	phase2Results: ReadonlyArray<ArticleResult>,
	propagationResult?: PropagationResult,
): void {
	const p1Updated = phase1Results.filter(r => r.status === "updated").length;
	const p1Unchanged = phase1Results.filter(r => r.status === "unchanged").length;
	const p2Updated = phase2Results.filter(r => r.status === "updated").length;
	const p2Unchanged = phase2Results.filter(r => r.status === "unchanged").length;
	const totalUpdated = p1Updated + p2Updated;
	const totalUnchanged = p1Unchanged + p2Unchanged;

	console.log();
	console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
	console.log(`${COLORS.bold}Summary${COLORS.reset}`);
	console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
	console.log(`  ${COLORS.cyan}Phase 1:${COLORS.reset}   ${p1Updated} updated, ${p1Unchanged} unchanged`);
	console.log(`  ${COLORS.cyan}Phase 2:${COLORS.reset}   ${p2Updated} updated, ${p2Unchanged} unchanged`);
	if (propagationResult?.cyclesDetected && propagationResult.cyclesDetected.length > 0) {
		console.log(`  ${COLORS.yellow}Cycles:${COLORS.reset}    ${propagationResult.cyclesDetected.length} detected (skipped)`);
	}
	if (propagationResult?.maxDepthReached) {
		console.log(`  ${COLORS.yellow}Depth:${COLORS.reset}     Max depth reached`);
	}
	console.log(`${COLORS.bold}  Total:     ${totalUpdated} updated${COLORS.reset}`);
}

/**
 * Displays source names consistently in output.
 */
function displaySource(source: string): string {
	return source === LOCAL_SOURCE_NAME ? "local" : source;
}

/**
 * Applies source metadata to each commit/hunk in a report.
 */
function attachSourceToReport(report: ImpactReport, source: string): ImpactReport {
	return {
		...report,
		commits: report.commits.map(commit => ({
			...commit,
			source,
			hunks: commit.hunks.map(hunk => ({
				...hunk,
				source,
			})),
		})),
	};
}

/**
 * Creates RawFileChange-like entries from an impact report.
 */
function collectSourcedFileChanges(report: ImpactReport, source: string): Array<SourcedRawFileChange> {
	const changesByPath = new Map<string, SourcedRawFileChange>();
	for (const commit of report.commits) {
		for (const hunk of commit.hunks) {
			const normalizedFile = normalizeRepoPath(hunk.file);
			if (!normalizedFile) {
				continue;
			}
			const existing = changesByPath.get(normalizedFile);
			if (existing) {
				if (existing.status !== "modified" && existing.status !== hunk.status) {
					changesByPath.set(normalizedFile, { ...existing, status: "modified" });
				}
				continue;
			}
			changesByPath.set(normalizedFile, {
				status: hunk.status,
				file: normalizedFile,
				source,
			});
		}
	}
	return Array.from(changesByPath.values());
}

/**
 * Formats changed files for audit trail, with source prefixes for non-local sources.
 */
function formatChangedFilesForAudit(changes: ReadonlyArray<SourcedRawFileChange>): Array<string> {
	const formatted = new Set<string>();
	for (const change of changes) {
		const source = change.source?.trim() || LOCAL_SOURCE_NAME;
		const file = normalizeRepoPath(change.file);
		if (!file) {
			continue;
		}
		formatted.add(source === LOCAL_SOURCE_NAME ? file : `${source}:${file}`);
	}
	return Array.from(formatted).sort((a, b) => a.localeCompare(b));
}

/**
 * Merges per-source reports into one combined report for agent context.
 */
function mergeSourceReports(reports: ReadonlyArray<ImpactReport>): ImpactReport {
	if (reports.length === 0) {
		return {
			branch: "none",
			base: "none",
			commits: [],
			summary: "",
			queryText: "",
		};
	}
	if (reports.length === 1) {
		return reports[0];
	}

	return {
		branch: "multi-source",
		base: reports.map(report => report.base).filter(base => base.length > 0).join(", "),
		commits: reports.flatMap(report => report.commits),
		summary: reports.map(report => report.summary).filter(Boolean).join("\n"),
		queryText: reports.map(report => report.queryText).filter(Boolean).join("\n"),
	};
}

/**
 * Generates impact reports and file changes per resolved source.
 */
async function collectPhase1SourceData(
	resolvedSources: ReadonlyArray<ResolvedImpactSource>,
	options: ImpactAgentOptions,
): Promise<{
	reports: Array<ImpactReport>;
	fileChanges: Array<SourcedRawFileChange>;
}> {
	const reports: Array<ImpactReport> = [];
	const fileChanges: Array<SourcedRawFileChange> = [];

	for (const source of resolvedSources) {
		try {
			const rawReport = options.uncommitted
				? await generateUncommittedReport(source.repoRoot)
				: await generateImpactReport(options.base, source.repoRoot);
			const report = attachSourceToReport(rawReport, source.source);
			reports.push(report);
			fileChanges.push(...collectSourcedFileChanges(report, source.source));
			console.log(
				`  • ${displaySource(source.source)}: ${report.commits.length} commit${report.commits.length === 1 ? "" : "s"}`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(
				`Warning: Failed to read git changes for source "${source.source}" at ${source.repoRoot}: ${message}. Skipping source.`,
			);
			logger.warn(
				"Failed to read git changes for source %s (%s): %s",
				source.source,
				source.repoRoot,
				message,
			);
		}
	}

	return { reports, fileChanges };
}

/**
 * Handles dry run mode output.
 */
function handleDryRun(articlesToProcess: ReadonlyArray<FileMatch>, auditRecordId: string): ImpactAgentRunResult {
	console.log();
	console.log(`${COLORS.bold}[DRY RUN] Would process:${COLORS.reset}`);
	for (let i = 0; i < articlesToProcess.length; i++) {
		const article = articlesToProcess[i];
		if (!article) {
			continue;
		}
		console.log(`\n${i + 1}. ${article.docPath} (${article.docId})`);
		console.log(
			`   Matched by: ${article.matches.map(m => `[${m.source === LOCAL_SOURCE_NAME ? "local" : m.source}] ${m.changedFile}`).join(", ")}`,
		);
	}
	console.log();
	console.log("Run without --dry-run to process these articles.");

	const results = articlesToProcess.map(a => ({
		jrn: a.docId,
		path: a.docPath,
		status: "skipped" as const,
	}));

	return { results, auditRecordId };
}

/**
 * Prints article processing result.
 */
function printArticleResult(result: ArticleResult, docPath: string): void {
	if (result.status === "updated") {
		console.log(`${COLORS.green}✓ Updated${COLORS.reset} ${docPath}`);
	} else if (result.status === "unchanged") {
		console.log(`${COLORS.dim}○ No update needed${COLORS.reset}`);
	} else if (result.status === "error") {
		console.log(`${COLORS.red}✗ Error: ${result.error}${COLORS.reset}`);
	}
}

/**
 * Processes a single article with interactive prompts.
 */
async function processArticleInteractive(
	article: FileMatch,
	context: ImpactContext,
	options: ImpactAgentOptions,
): Promise<{ action: UserAction }> {
	if (options.autoConfirm) {
		return { action: "update" };
	}

	let action: UserAction;
	do {
		action = await promptForAction(article);
		if (action === "view") {
			displayChanges(context);
		}
	} while (action === "view");

	return { action };
}

/**
 * Runs Phase 2: Article-to-Article Propagation.
 * Takes Phase 1 updates and finds dependent articles, then runs the agent on each.
 */
async function runPropagation(
	phase1Updates: ReadonlyArray<Phase1Update>,
	docs: ReadonlyArray<DocAttention>,
	options: ImpactAgentOptions,
	client: AgentConvoClient,
	toolHost: ToolHost,
	authToken: string,
	cwd: string,
): Promise<{ results: Array<ArticleResult>; propagationResult: PropagationResult }> {
	const results: Array<ArticleResult> = [];
	const propagationResult: MutablePropagationResult = {
		articlesUpdated: [],
		articlesUnchanged: [],
		articlesSkipped: [],
		articlesError: [],
		cyclesDetected: [],
		maxDepthReached: false,
		depth: 0,
	};

	if (phase1Updates.length === 0) {
		logger.debug("No Phase 1 updates to propagate");
		return { results, propagationResult };
	}

	// Initialize state with Phase 1 articles marked as visited
	let state = buildInitialPropagationState(phase1Updates, options.maxDepth);
	let currentUpdates: ReadonlyArray<Phase1Update> = phase1Updates;
	let depth = 1;

	// Recursive propagation loop
	while (currentUpdates.length > 0 && depth <= options.maxDepth) {
		console.log();
		console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
		console.log(`${COLORS.bold}Phase 2: Article → Article Propagation (depth ${depth})${COLORS.reset}`);
		console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
		console.log();
		console.log(`Checking for articles watching: ${currentUpdates.map(u => u.path).join(", ")}`);

		// Find dependent articles
		const dependents = findDependentArticles(currentUpdates, docs, state);

		if (dependents.length === 0) {
			console.log("No additional dependent articles found");
			break;
		}

		console.log(`Found ${dependents.length} dependent articles`);

		// Track updates at this depth for next iteration
		const updatesAtThisDepth: Array<Phase1Update> = [];

		// Process each dependent article
		for (let i = 0; i < dependents.length; i++) {
			const dependent = dependents[i];
			if (!dependent) {
				continue;
			}

			// Check if we should process this article
			const processCheck = shouldProcess(dependent.docId, state);
			if (!processCheck.allowed) {
				if (processCheck.reason?.includes("Cycle detected")) {
					propagationResult.cyclesDetected.push(dependent.docId);
					logger.info("Cycle detected, skipping: %s", dependent.docId);
				} else if (processCheck.reason?.includes("Max depth")) {
					propagationResult.maxDepthReached = true;
					logger.info("Max depth reached, skipping: %s", dependent.docId);
				}
				continue;
			}

			console.log();
			console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
			console.log(`${COLORS.bold}Article ${i + 1}/${dependents.length}: ${dependent.docPath}${COLORS.reset}`);
			console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);

			// Build context for Phase 2 (article-to-article)
			const context = buildPropagationContext(
				dependent.docPath,
				dependent.docId,
				dependent.triggeringArticles,
				dependent.evidence,
			);

			// Create a FileMatch-like object for the agent
			const articleMatch: FileMatch = {
				docId: dependent.docId,
				docPath: dependent.docPath,
				matches: dependent.evidence.map(e => ({
					changedFile: e.changedFile,
					pattern: e.pattern,
					matchType: e.matchType,
					source: e.source,
				})),
			};

			if (options.dryRun) {
				console.log(`  [DRY RUN] Would process: ${dependent.docPath}`);
				console.log(`  Triggered by: ${dependent.triggeringArticles.map(a => a.path).join(", ")}`);
				results.push({
					jrn: dependent.docId,
					path: dependent.docPath,
					status: "skipped",
				});
				continue;
			}

			// Process interactively if not auto-confirm
			const { action } = await processArticleInteractive(articleMatch, context, options);

			if (action === "quit") {
				console.log("Exiting propagation...");
				break;
			}

			if (action === "skip") {
				results.push({
					jrn: dependent.docId,
					path: dependent.docPath,
					status: "skipped",
				});
				propagationResult.articlesSkipped.push(dependent.docPath);
				continue;
			}

			// Run agent
			console.log();
			console.log(`${COLORS.cyan}Processing ${dependent.docPath}...${COLORS.reset}`);
			const result = await runAgentForArticle(client, toolHost, authToken, articleMatch, context, cwd);
			results.push(result);

			// Track result
			if (result.status === "updated") {
				propagationResult.articlesUpdated.push(dependent.docPath);
				// Add to updates for next depth
				updatesAtThisDepth.push({
					path: dependent.docPath,
					jrn: dependent.docId,
					diff: result.patch,
				});
			} else if (result.status === "unchanged") {
				propagationResult.articlesUnchanged.push(dependent.docPath);
			} else if (result.status === "error") {
				propagationResult.articlesError.push(dependent.docPath);
			}

			// Mark as visited
			state = advancePropagationState(state, dependent.docId);
			printArticleResult(result, dependent.docPath);
		}

		// Update current updates for next iteration
		currentUpdates = updatesAtThisDepth;
		propagationResult.depth = depth;
		depth++;
	}

	if (depth > options.maxDepth) {
		propagationResult.maxDepthReached = true;
		logger.info("Max propagation depth %d reached", options.maxDepth);
	}

	return { results, propagationResult };
}

/**
 * Runs Phase 1: Code → Articles (git-based).
 * Returns phase 1 results and the updated audit record.
 */
async function runPhase1(
	options: ImpactAgentOptions,
	docs: Array<DocAttention>,
	client: AgentConvoClient,
	toolHost: ToolHost,
	authToken: string,
	cwd: string,
): Promise<{
	results: Array<ArticleResult>;
	auditRecordId: string;
	phase1Updates: Array<Phase1Update>;
}> {
	console.log();
	console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
	console.log(`${COLORS.bold}Phase 1: Code → Articles${COLORS.reset}`);
	console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
	console.log();

	// Generate impact report
	console.log("Analyzing git changes...");
	const attentionIndex = buildAttentionIndex(docs);
	const resolvedSources = await resolveImpactSources(attentionIndex, cwd);
	const { sources, warnings } = selectImpactSources(resolvedSources, {
		source: options.source,
		strict: options.strict,
		commandName: "impact agent",
	});
	for (const warning of warnings) {
		console.warn(`Warning: ${warning}`);
		logger.warn(warning);
	}

	const { reports, fileChanges } = await collectPhase1SourceData(sources, options);
	const report = mergeSourceReports(reports);
	if (report.commits.length === 0) {
		console.log("No changes detected.");
		return { results: [], auditRecordId: "", phase1Updates: [] };
	}

	console.log(
		`Found ${report.commits.length} commits across ${reports.length} source${reports.length === 1 ? "" : "s"}`,
	);

	// Find matches
	console.log(`Scanning ${options.docsPath} for impacted articles...`);
	const matches = buildImpactMatches(docs, fileChanges);
	const changedFilesForAudit = formatChangedFilesForAudit(fileChanges);

	if (matches.length === 0) {
		console.log("No impacted articles found.");
		return { results: [], auditRecordId: "", phase1Updates: [] };
	}

	console.log(`Found ${matches.length} impacted articles`);

	const articlesToProcess = options.limit ? matches.slice(0, options.limit) : matches;
	let auditRecord = createAuditRecord("git", {
		base: report.base,
		commits: report.commits.map(c => ({ sha: c.sha, message: `[${displaySource(c.source ?? LOCAL_SOURCE_NAME)}] ${c.message}` })),
		changedFiles: changedFilesForAudit,
	});

	if (options.dryRun) {
		console.log();
		console.log(`${COLORS.bold}[DRY RUN] Phase 1 would process:${COLORS.reset}`);
		for (let i = 0; i < articlesToProcess.length; i++) {
			const article = articlesToProcess[i];
			if (!article) {
				continue;
			}
			console.log(`  ${i + 1}. ${article.docPath} (${article.docId})`);
		}
		return {
			results: articlesToProcess.map(a => ({ jrn: a.docId, path: a.docPath, status: "skipped" as const })),
			auditRecordId: auditRecord.id,
			phase1Updates: [],
		};
	}

	// Process each article
	const results: Array<ArticleResult> = [];
	const phase1Updates: Array<Phase1Update> = [];

	for (let i = 0; i < articlesToProcess.length; i++) {
		const article = articlesToProcess[i];
		if (!article) {
			continue;
		}

		console.log();
		console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);
		console.log(`${COLORS.bold}Article ${i + 1}/${articlesToProcess.length}: ${article.docPath}${COLORS.reset}`);
		console.log(`${COLORS.bold}─────────────────────────────────────────────${COLORS.reset}`);

		const context = buildImpactContext(article, report);
		const { action } = await processArticleInteractive(article, context, options);

		if (action === "quit") {
			console.log("Exiting...");
			break;
		}

		if (action === "skip") {
			const result: ArticleResult = { jrn: article.docId, path: article.docPath, status: "skipped" };
			results.push(result);
			auditRecord = addArticleToRecord(auditRecord, { ...result, evidence: article.matches });
			continue;
		}

		// Run agent
		console.log();
		console.log(`${COLORS.cyan}Processing ${article.docPath}...${COLORS.reset}`);
		const result = await runAgentForArticle(client, toolHost, authToken, article, context, cwd);
		results.push(result);

		// Track updated articles for Phase 2
		if (result.status === "updated") {
			phase1Updates.push({
				path: article.docPath,
				jrn: article.docId,
				diff: result.patch,
			});
		}

		const auditEntry: ArticleAuditEntry = {
			jrn: result.jrn,
			path: result.path,
			status: result.status,
			evidence: article.matches,
			patch: result.patch,
			reasoning: result.reasoning,
			error: result.error,
			editReasons: result.editReasons,
		};
		auditRecord = addArticleToRecord(auditRecord, auditEntry);
		printArticleResult(result, article.docPath);
	}

	// Save audit record
	await saveAuditRecord(cwd, auditRecord);
	logger.info("Saved Phase 1 audit record %s", auditRecord.id);

	return { results, auditRecordId: auditRecord.id, phase1Updates };
}

/**
 * Runs the impact agent workflow.
 * Orchestrates Phase 1 (code → articles) and Phase 2 (article → article propagation).
 */
export async function runImpactAgent(options: ImpactAgentOptions): Promise<ImpactAgentRunResult> {
	const cwd = (await findProjectRoot()) ?? process.cwd();
	logger.info(
		"Starting impact agent (base: %s, uncommitted: %s, source: %s, strict: %s, propagate: %s, propagateOnly: %s)",
		options.base ?? "auto",
		options.uncommitted,
		options.source ?? "all",
		options.strict ?? false,
		options.propagate,
		options.propagateOnly,
	);

	// Load auth token
	const authToken = await loadAuthToken();
	if (!authToken) {
		throw new Error("Not authenticated. Run 'jolli auth login' first.");
	}

	// Load docs once (used by both phases)
	console.log(`Loading docs from ${options.docsPath}...`);
	let docs: Array<DocAttention>;
	try {
		docs = await loadDocAttention(options.docsPath, cwd);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to load docs: ${msg}`);
	}

	// Create client and tool host
	const client = createAgentConvoClient(authToken);
	const toolHost = createToolHost(cwd);

	let phase1Results: Array<ArticleResult> = [];
	let phase1Updates: Array<Phase1Update> = [];
	let auditRecordId = "";

	// Run Phase 1 (unless propagateOnly)
	if (!options.propagateOnly) {
		const phase1 = await runPhase1(options, docs, client, toolHost, authToken, cwd);
		phase1Results = phase1.results;
		phase1Updates = phase1.phase1Updates;
		auditRecordId = phase1.auditRecordId;
	} else {
		// Load Phase 1 updates from existing audit trail
		console.log("Loading Phase 1 updates from audit trail...");
		const auditLog = await loadAuditLog(cwd);
		phase1Updates = getPhase1Updates(auditLog);
		if (phase1Updates.length === 0) {
			console.log("No Phase 1 updates found in audit trail. Run without --propagate-only first.");
			return { results: [], auditRecordId: "" };
		}
		console.log(`Found ${phase1Updates.length} updates from Phase 1`);
	}

	// Run Phase 2 (unless propagate is false)
	let phase2Results: Array<ArticleResult> = [];
	let propagationResult: PropagationResult | undefined;

	if (options.propagate && phase1Updates.length > 0) {
		const phase2 = await runPropagation(
			phase1Updates,
			docs,
			options,
			client,
			toolHost,
			authToken,
			cwd,
		);
		phase2Results = phase2.results;
		propagationResult = phase2.propagationResult;

		// Save Phase 2 audit records (one per depth level)
		if (phase2Results.length > 0) {
			const syncAuditRecord = createAuditRecord("sync", {
				commits: [],
				changedFiles: phase1Updates.map(u => u.path),
			});
			let currentSyncRecord = syncAuditRecord;
			for (const result of phase2Results) {
				currentSyncRecord = addArticleToRecord(currentSyncRecord, {
					jrn: result.jrn,
					path: result.path,
					status: result.status,
					evidence: [],
					patch: result.patch,
					reasoning: result.reasoning,
					error: result.error,
					editReasons: result.editReasons,
				});
			}
			await saveAuditRecord(cwd, currentSyncRecord);
			logger.info("Saved Phase 2 audit record %s", currentSyncRecord.id);
		}
	}

	// Combine results
	const allResults = [...phase1Results, ...phase2Results];

	// Print/output results
	if (options.json) {
		console.log(
			JSON.stringify(
				{
					results: allResults,
					auditRecordId,
					phase1Results,
					phase2Results,
					propagationResult,
				},
				null,
				2,
			),
		);
	} else if (phase2Results.length > 0 || propagationResult) {
		printCombinedSummary(phase1Results, phase2Results, propagationResult);
	} else {
		printSummary(allResults);
	}

	return {
		results: allResults,
		auditRecordId,
		phase1Results,
		phase2Results,
		propagationResult,
	};
}
