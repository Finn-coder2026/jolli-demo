/**
 * Workflow runner for E2B mode execution
 * This module extracts workflow functionality from jolli.ts to run in E2B sandbox mode
 * Designed to be called from job runners or other automated systems
 */

import type { Agent } from "./agents/Agent";
import type { SaveIt } from "./agents/finalizers";
import { createListAndSaveFinalizer } from "./agents/finalizers";
import type { AttendResource, JobStep } from "./jolliscript/types";
import { createCliLogger } from "./logger/CliLogger";
import type { JolliAgentLogger } from "./logger/Logger";
import { createServerLogger } from "./logger/ServerLogger";
import type { E2BSandbox, Message, RunState, StepResult, ToolCall, ToolExecutor } from "./Types";

// Re-export workflow types for backward compatibility
export type { WorkflowConfig, WorkflowResult, WorkflowType } from "./Types";

import type { WorkflowConfig, WorkflowResult, WorkflowType } from "./Types";
import { runToolCall } from "./tools/Tools";
import { Sandbox } from "e2b";

// Type for sandbox with kill method
type SandboxWithKill = { kill?: () => Promise<void> };

// Type for agent with optional finalizer
type AgentWithFinalizer = { finalizer?: () => Promise<void> };

// Minimal logger that writes directly to stdout/stderr
const createConsoleLogger = (debug: boolean) => ({
	error: (...args: Array<unknown>) => {
		try {
			process.stderr.write(`${args.map(a => String(a)).join(" ")}\n`);
		} catch {
			/* noop */
		}
	},
	info: (...args: Array<unknown>) => {
		if (debug) {
			try {
				process.stdout.write(`${args.map(a => String(a)).join(" ")}\n`);
			} catch {
				/* noop */
			}
		}
	},
	debug: (...args: Array<unknown>) => {
		if (debug) {
			try {
				process.stdout.write(`${args.map(a => String(a)).join(" ")}\n`);
			} catch {
				/* noop */
			}
		}
	},
});

/**
 * Create E2B sandbox with timeout protection
 */
async function createE2BSandbox(
	templateId: string,
	apiKey: string,
	timeoutMs = 20000,
	log: ReturnType<typeof createConsoleLogger>,
): Promise<Sandbox> {
	log.info(`Connecting to E2B sandbox...`);
	log.debug(`E2B config: template=${templateId.slice(0, 8)}... timeout=${timeoutMs}ms`);

	const connect = Sandbox.create(templateId, { apiKey });
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(
			() => reject(new Error(`E2B connection timed out after ${Math.round(timeoutMs / 1000)}s`)),
			timeoutMs,
		),
	);

	const t0 = Date.now();
	const sandbox = await Promise.race([connect, timeout]);
	log.info(`E2B sandbox ready in ${Date.now() - t0}ms`);
	return sandbox;
}

/**
 * Create agent factory for a specific workflow type
 */
async function createWorkflowAgent(
	workflowType: WorkflowType,
	runState: RunState,
	workflowArgs?: {
		githubUrl?: string;
		markdownContent?: string;
		filename?: string;
		currentDir?: string;
		outputDir?: string;
		projectName?: string;
	},
) {
	// Import agent factories
	const factories = await import("./agents/factory");

	switch (workflowType) {
		case "getting-started-guide":
			return factories.createGettingStartedGuideAgent({ runState });

		case "code-docs": {
			if (!workflowArgs?.githubUrl) {
				throw new Error("code-docs workflow requires githubUrl argument");
			}
			return factories.createCodeDocsAgent({ runState, githubUrl: workflowArgs.githubUrl });
		}

		case "code-to-docs": {
			if (!workflowArgs?.githubUrl) {
				throw new Error("code-to-docs workflow requires githubUrl argument");
			}
			return factories.createCodeToDocsAgent({
				runState,
				githubUrl: workflowArgs.githubUrl,
				...(workflowArgs.outputDir ? { outputDir: workflowArgs.outputDir } : {}),
			});
		}

		case "code-to-api-docs": {
			if (!workflowArgs?.githubUrl) {
				throw new Error("code-to-api-docs workflow requires githubUrl argument");
			}
			return factories.createCodeToApiDocsAgent({
				runState,
				githubUrl: workflowArgs.githubUrl,
				...(workflowArgs.outputDir ? { outputDir: workflowArgs.outputDir } : {}),
			});
		}

		case "docs-to-site": {
			if (!workflowArgs?.outputDir) {
				throw new Error("docs-to-site workflow requires outputDir argument");
			}
			return factories.createDocsToSiteAgent({
				runState,
				outputDir: workflowArgs.outputDir,
				...(workflowArgs.projectName ? { projectName: workflowArgs.projectName } : {}),
			});
		}

		case "architecture":
			return factories.createArchitectureAgent({ runState });

		case "architecture-doc": {
			if (!workflowArgs?.githubUrl) {
				throw new Error("architecture-doc workflow requires githubUrl argument");
			}
			return factories.createArchitectureDocAgent({
				runState,
				githubUrl: workflowArgs.githubUrl,
				...(workflowArgs.outputDir ? { outputDir: workflowArgs.outputDir } : {}),
			});
		}

		case "architecture-update":
			return factories.createArchitectureUpdateAgent({ runState });

		case "citations-graph": {
			if (!workflowArgs?.markdownContent) {
				throw new Error("citations-graph workflow requires markdownContent argument");
			}
			return factories.createSectionCitationsMermaidAgent({
				runState,
				currentDir: workflowArgs.currentDir || process.cwd(),
				filename: workflowArgs.filename || "input.md",
			});
		}

		default:
			throw new Error(`Unknown workflow type: ${workflowType}`);
	}
}

/**
 * Validate workflow configuration
 */
function validateWorkflowConfig(config: WorkflowConfig): void {
	if (!config.e2bApiKey || config.e2bApiKey.trim() === "") {
		throw new Error("Missing E2B_API_KEY in configuration");
	}
	if (!config.e2bTemplateId || config.e2bTemplateId.trim() === "") {
		throw new Error("Missing E2B_TEMPLATE_ID in configuration");
	}
	if (!config.anthropicApiKey || config.anthropicApiKey.trim() === "") {
		throw new Error("Missing ANTHROPIC_API_KEY in configuration");
	}
}

/**
 * Initialize run state with environment variables
 */
function initializeRunState(
	sandbox: Sandbox,
	config: WorkflowConfig,
	githubDetails?: { org?: string; repo?: string; branch?: string },
): RunState {
	const envVars: Record<string, string> = {};

	// Add optional environment variables
	if (config.githubToken) {
		envVars.GH_PAT = config.githubToken;
	}
	if (githubDetails?.org) {
		envVars.GH_ORG = githubDetails.org;
	}
	if (githubDetails?.repo) {
		envVars.GH_REPO = githubDetails.repo;
	}
	if (githubDetails?.branch) {
		envVars.GH_BRANCH = githubDetails.branch;
	}
	if (config.vercelToken) {
		envVars.VERCEL_TOKEN = config.vercelToken;
	}
	if (config.tavilyApiKey) {
		envVars.TAVILY_API_KEY = config.tavilyApiKey;
	}

	const runState: RunState = {
		executorNamespace: "e2b" as const,
		e2bsandbox: sandbox,
		env_vars: envVars,
	};

	return runState;
}

/**
 * Setup seed chat options for markdown workflows
 */
function setupMarkdownSeedOptions(
	workflowType: WorkflowType,
	workflowArgs: { markdownContent?: string; filename?: string; githubUrl?: string; currentDir?: string } | undefined,
	runState: RunState,
): { system?: string; messages?: Array<Message>; prompt?: string } {
	if (workflowType === "citations-graph" && workflowArgs?.markdownContent) {
		if (runState.env_vars) {
			runState.env_vars.MARKDOWN_INPUT = workflowArgs.markdownContent;
			runState.env_vars.MARKDOWN_FILE = workflowArgs.filename || "input.md";
		}
		return { prompt: workflowArgs.markdownContent };
	}
	return {};
}

/**
 * Build conversation history from base options
 */
function buildConversationHistory(base: { system?: string; messages?: Array<Message> }): Array<Message> {
	const history: Array<Message> = [];
	if (base.system) {
		history.push({ role: "system", content: base.system });
	}
	if (base.messages && base.messages.length > 0) {
		for (const m of base.messages) {
			history.push(m);
		}
	}
	return history;
}

/**
 * Clean up sandbox with error handling
 */
async function cleanupSandbox(
	sandbox: Sandbox,
	killSandbox: boolean,
	internalLog: ReturnType<typeof createConsoleLogger>,
	log?: JolliAgentLogger,
): Promise<void> {
	try {
		if (killSandbox) {
			internalLog.info("Killing sandbox as requested");
			if (log) {
				log.agentLog("Killing sandbox as requested");
			}
			await sandbox.kill();
		} else {
			internalLog.info("Sandbox left running (killSandbox=false)");
			if (log) {
				log.agentLog("Sandbox left running (killSandbox=false)");
			}
		}
	} catch (e) {
		internalLog.error("Failed to clean up sandbox:", e);
		if (log) {
			log.agentError(`Failed to clean up sandbox: ${String(e)}`);
		}
	}
}

/**
 * Generate a summary of previous step results for use with include_summary
 */
function generateStepSummary(results: Array<StepResult>): string {
	if (results.length === 0) {
		return "";
	}

	const lines: Array<string> = ["[Previous steps completed:]"];

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const status = r.success ? "success" : "failed";
		let typeLabel: string;
		let detail = "";

		switch (r.type) {
			case "run":
				typeLabel = "shell";
				break;
			case "run_tool":
				typeLabel = "tool";
				break;
			case "run_prompt":
				typeLabel = "prompt";
				// For prompts, include a truncated version of the output
				if (r.output?.trim()) {
					const truncated = r.output.trim().slice(0, 200);
					detail = truncated.length < r.output.trim().length ? `${truncated}...` : truncated;
				}
				break;
		}

		if (detail) {
			lines.push(`${i + 1}. "${r.name}" (${typeLabel}): ${status} - ${detail}`);
		} else {
			lines.push(`${i + 1}. "${r.name}" (${typeLabel}): ${status}`);
		}
	}

	return lines.join("\n");
}

/**
 * Options for job step execution
 */
interface JobStepExecutionOptions {
	sandbox: E2BSandbox;
	step: JobStep;
	internalLog: ReturnType<typeof createConsoleLogger>;
	log?: JolliAgentLogger | undefined;
	/** Optional tool executor for run_tool steps */
	toolExecutor?: ToolExecutor | undefined;
	/** RunState needed for tool execution and run_prompt steps */
	runState?: RunState | undefined;
	/** Workflow config needed for run_prompt steps to create an agent */
	workflowConfig?: WorkflowConfig | undefined;
	/** Additional tools to pass to the agent for run_prompt steps */
	additionalTools?: Array<import("./Types").ToolDef> | undefined;
	/** Previous step results for include_summary */
	previousResults?: Array<StepResult> | undefined;
}

/**
 * Execute a run_tool step using the tool executor
 */
async function executeRunToolStep(
	options: JobStepExecutionOptions,
): Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string }> {
	const { step, internalLog, log, toolExecutor, runState } = options;
	const stepName = step.name || "(unnamed step)";
	const runTool = step.run_tool;

	if (!runTool) {
		return { success: false, exitCode: -1, stdout: "", stderr: "No run_tool configuration" };
	}

	if (!toolExecutor) {
		const errorMsg = `[step] Step "${stepName}" requires a tool executor but none was provided`;
		internalLog.error(errorMsg);
		if (log) {
			log.agentError(errorMsg);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: "No tool executor available" };
	}

	if (!runState) {
		const errorMsg = `[step] Step "${stepName}" requires runState but none was provided`;
		internalLog.error(errorMsg);
		if (log) {
			log.agentError(errorMsg);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: "No runState available" };
	}

	internalLog.info(`[step] Running tool step: ${stepName} (tool: ${runTool.name})`);
	if (log) {
		log.agentLog(`[step] Running tool step: ${stepName} (tool: ${runTool.name})`);
	}

	try {
		// Extract tool arguments (everything except 'name')
		const { name: toolName, ...toolArgs } = runTool;

		// Create a tool call object
		const toolCall: ToolCall = {
			id: `job-step-${Date.now()}`,
			name: toolName,
			arguments: toolArgs,
		};

		internalLog.debug(`[step] Executing tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
		if (log) {
			log.agentDebug(`[step] Executing tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
		}

		const output = await toolExecutor(toolCall, runState);

		internalLog.info(`[step] Tool step "${stepName}" completed successfully`);
		if (output.trim()) {
			internalLog.debug(`[step] tool output: ${output.trim()}`);
		}
		if (log) {
			log.agentLog(`[step] Tool step "${stepName}" completed successfully`);
			if (output.trim()) {
				log.agentDebug(`[step] tool output: ${output.trim()}`);
			}
		}

		return { success: true, exitCode: 0, stdout: output, stderr: "" };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		internalLog.error(`[step] Tool step "${stepName}" threw an error: ${errorMessage}`);
		if (log) {
			log.agentError(`[step] Tool step "${stepName}" threw an error: ${errorMessage}`);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: errorMessage };
	}
}

/**
 * Execute a run_prompt step by running an agent turn with the given prompt
 */
async function executeRunPromptStep(
	options: JobStepExecutionOptions,
): Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string }> {
	const { step, internalLog, log, runState, workflowConfig, toolExecutor, additionalTools, previousResults } =
		options;
	const stepName = step.name || "(unnamed step)";
	const runPrompt = step.run_prompt;

	if (!runPrompt) {
		return { success: false, exitCode: -1, stdout: "", stderr: "No run_prompt configuration" };
	}

	if (!runState) {
		const errorMsg = `[step] Step "${stepName}" requires runState but none was provided`;
		internalLog.error(errorMsg);
		if (log) {
			log.agentError(errorMsg);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: "No runState available" };
	}

	if (!workflowConfig) {
		const errorMsg = `[step] Step "${stepName}" requires workflowConfig but none was provided`;
		internalLog.error(errorMsg);
		if (log) {
			log.agentError(errorMsg);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: "No workflowConfig available" };
	}

	internalLog.info(`[step] Running prompt step: ${stepName}`);
	if (log) {
		log.agentLog(`[step] Running prompt step: ${stepName}`);
	}

	try {
		// Build the final prompt, optionally including summary of previous steps
		let finalPrompt = runPrompt;
		if (step.include_summary && previousResults && previousResults.length > 0) {
			const summary = generateStepSummary(previousResults);
			finalPrompt = `${summary}\n\n[Your task:]\n${runPrompt}`;
			internalLog.debug(`[step] Including summary of ${previousResults.length} previous step(s)`);
			if (log) {
				log.agentDebug(`[step] Including summary of ${previousResults.length} previous step(s)`);
			}
		}

		// Import E2B tool definitions
		const { e2bToolDefinitions } = await import("./tools/tools/index");

		// Merge tools: E2B tools + additional tools
		const mergedTools = additionalTools ? [...e2bToolDefinitions, ...additionalTools] : e2bToolDefinitions;

		// Create a fresh agent for this prompt step
		const { createAgent } = await import("./agents/factory");
		const { agent, withDefaults } = createAgent("general", {
			runState,
			tools: mergedTools,
		});

		// Build system prompt with context about pre-checkout
		// The workflow pre-checks out the GitHub repo, so the agent should know this
		let systemPrompt = "You are a precise, helpful, minimal assistant.";
		if (runState.env_vars?.GH_ORG && runState.env_vars?.GH_REPO) {
			const org = runState.env_vars.GH_ORG;
			const repo = runState.env_vars.GH_REPO;
			const branch = runState.env_vars?.GH_BRANCH || "main";
			const checkoutDir = `workspace/${repo}/${branch}`;
			systemPrompt = [
				"You are a precise, helpful, minimal assistant.",
				"",
				`The repository ${org}/${repo} (branch: ${branch}) has already been checked out to: ${checkoutDir}`,
				"You can use cat, ls, bash, git_history, git_diff, and other tools to explore that codebase.",
				"",
				"You may use github_checkout if you need to check out a DIFFERENT repository.",
			].join("\n");
			internalLog.debug(`[step] Informed agent about pre-checkout at ${checkoutDir}`);
			if (log) {
				log.agentDebug(`[step] Informed agent about pre-checkout at ${checkoutDir}`);
			}
		}

		// Build conversation history with the prompt
		const base = withDefaults({ system: systemPrompt, messages: [{ role: "user", content: finalPrompt }] });
		const history: Array<Message> = [];
		if (base.system) {
			history.push({ role: "system", content: base.system });
		}
		if (base.messages) {
			for (const m of base.messages) {
				history.push(m);
			}
		}

		// Run the agent turn
		let assistantText = "";
		await agent.chatTurn({
			history,
			runTool: async (call: ToolCall) => {
				internalLog.debug(`[step] Tool call: ${call.name}(${JSON.stringify(call.arguments)})`);
				if (log) {
					log.agentDebug(`[step] Tool call: ${call.name}(${JSON.stringify(call.arguments)})`);
				}

				// Check if this is an additional tool
				let output: string;
				if (toolExecutor && additionalTools?.some(t => t.name === call.name)) {
					output = await toolExecutor(call, runState);
				} else {
					output = await runToolCall(runState, call);
				}

				internalLog.debug(`[step] Tool result: ${call.name} completed`);
				if (log) {
					log.agentDebug(`[step] Tool result: ${call.name} completed`);
				}
				return output;
			},
			onTextDelta: (delta: string) => {
				assistantText += delta;
			},
		});

		internalLog.info(`[step] Prompt step "${stepName}" completed successfully`);
		if (assistantText.trim()) {
			internalLog.debug(`[step] assistant response: ${assistantText.trim().slice(0, 500)}...`);
		}
		if (log) {
			log.agentLog(`[step] Prompt step "${stepName}" completed successfully`);
			if (assistantText.trim()) {
				log.llmLog(assistantText.trim());
			}
		}

		return { success: true, exitCode: 0, stdout: assistantText, stderr: "" };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		internalLog.error(`[step] Prompt step "${stepName}" threw an error: ${errorMessage}`);
		if (log) {
			log.agentError(`[step] Prompt step "${stepName}" threw an error: ${errorMessage}`);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: errorMessage };
	}
}

/**
 * Execute a single job step in the E2B sandbox
 * Runs either a shell command (run), a tool (run_tool), or an agent prompt (run_prompt)
 */
async function executeJobStep(
	options: JobStepExecutionOptions,
): Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string }> {
	const { sandbox, step, internalLog, log } = options;
	const stepName = step.name || "(unnamed step)";

	// Handle run_prompt steps
	if (step.run_prompt) {
		return executeRunPromptStep(options);
	}

	// Handle run_tool steps
	if (step.run_tool) {
		return executeRunToolStep(options);
	}

	// Handle run (shell command) steps
	if (!step.run) {
		internalLog.info(`[step] Skipping step "${stepName}" - no run command, run_tool, or run_prompt`);
		if (log) {
			log.agentLog(`[step] Skipping step "${stepName}" - no run command, run_tool, or run_prompt`);
		}
		return { success: true, exitCode: 0, stdout: "", stderr: "" };
	}

	internalLog.info(`[step] Running step: ${stepName}`);
	if (log) {
		log.agentLog(`[step] Running step: ${stepName}`);
	}

	try {
		// Execute the run command as a bash script
		const proc = await sandbox.commands.run(`bash -lc '${step.run.replace(/'/g, "'\\''")}'`, {
			timeoutMs: 300_000, // 5 minute timeout per step
		});

		const stdout = proc.stdout || "";
		const stderr = proc.stderr || "";
		const exitCode = proc.exitCode ?? 0;

		if (exitCode !== 0) {
			internalLog.error(`[step] Step "${stepName}" failed with exit code ${exitCode}`);
			internalLog.error(`[step] stderr: ${stderr}`);
			if (log) {
				log.agentError(`[step] Step "${stepName}" failed with exit code ${exitCode}`);
				log.agentError(`[step] stderr: ${stderr}`);
			}
			return { success: false, exitCode, stdout, stderr };
		}

		internalLog.info(`[step] Step "${stepName}" completed successfully`);
		if (stdout.trim()) {
			internalLog.debug(`[step] stdout: ${stdout.trim()}`);
		}
		if (log) {
			log.agentLog(`[step] Step "${stepName}" completed successfully`);
			if (stdout.trim()) {
				log.agentDebug(`[step] stdout: ${stdout.trim()}`);
			}
		}

		return { success: true, exitCode, stdout, stderr };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		internalLog.error(`[step] Step "${stepName}" threw an error: ${errorMessage}`);
		if (log) {
			log.agentError(`[step] Step "${stepName}" threw an error: ${errorMessage}`);
		}
		return { success: false, exitCode: -1, stdout: "", stderr: errorMessage };
	}
}

/**
 * Options for executing multiple job steps
 */
interface JobStepsExecutionOptions {
	sandbox: E2BSandbox;
	steps: Array<JobStep>;
	internalLog: ReturnType<typeof createConsoleLogger>;
	log?: JolliAgentLogger | undefined;
	/** Optional tool executor for run_tool and run_prompt steps */
	toolExecutor?: ToolExecutor | undefined;
	/** RunState needed for tool execution and run_prompt steps */
	runState?: RunState | undefined;
	/** Workflow config needed for run_prompt steps */
	workflowConfig?: WorkflowConfig | undefined;
	/** Additional tools for run_prompt steps */
	additionalTools?: Array<import("./Types").ToolDef> | undefined;
}

/**
 * Determine the step type from a JobStep
 */
function getStepType(step: JobStep): "run" | "run_tool" | "run_prompt" {
	if (step.run_prompt) {
		return "run_prompt";
	}
	if (step.run_tool) {
		return "run_tool";
	}
	return "run";
}

/**
 * Execute all job steps sequentially
 * Stops on first failure. Tracks results for include_summary support.
 */
async function executeJobSteps(
	options: JobStepsExecutionOptions,
): Promise<{ success: boolean; failedStep?: string; error?: string }> {
	const { sandbox, steps, internalLog, log, toolExecutor, runState, workflowConfig, additionalTools } = options;

	internalLog.info(`[steps] Executing ${steps.length} job step(s)`);
	if (log) {
		log.agentLog(`[steps] Executing ${steps.length} job step(s)`);
	}

	// Track results for include_summary
	const stepResults: Array<StepResult> = [];

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const stepName = step.name || `Step ${i + 1}`;

		const result = await executeJobStep({
			sandbox,
			step,
			internalLog,
			log,
			toolExecutor,
			runState,
			workflowConfig,
			additionalTools,
			previousResults: stepResults,
		});

		// Track this step's result
		stepResults.push({
			name: stepName,
			type: getStepType(step),
			success: result.success,
			output: result.stdout,
		});

		if (!result.success) {
			return {
				success: false,
				failedStep: stepName,
				error: result.stderr || `Exit code: ${result.exitCode}`,
			};
		}
	}

	internalLog.info(`[steps] All ${steps.length} step(s) completed successfully`);
	if (log) {
		log.agentLog(`[steps] All ${steps.length} step(s) completed successfully`);
	}

	return { success: true };
}

/**
 * Run a workflow in E2B mode
 * This is the main entry point for job runners
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Main workflow orchestration function requires complex branching logic
export async function runWorkflow(
	workflowType: WorkflowType,
	config: WorkflowConfig,
	workflowArgs?: {
		/** For code-docs workflow: GitHub URL to process */
		githubUrl?: string;
		/** For citations-graph/run-jolliscript workflows: Markdown content to process */
		markdownContent?: string;
		/** For citations-graph workflow: Original filename */
		filename?: string;
		/** Working directory for file operations */
		currentDir?: string;
		/** Optional output directory used by code-to-docs agent */
		outputDir?: string;
		/** Optional project name for docs-to-site agent */
		projectName?: string;
		/**
		 * When provided, a finalizer is created that lists files under finalizerRoot and calls saveIt(file, data) for each
		 * Deprecated in favor of syncIt (post) adapter, but kept for backward compatibility.
		 */
		saveIt?: SaveIt;
		/** Root directory to scan for the finalizer; defaults to outputDir or './api-docs' for code-to-docs */
		finalizerRoot?: string;
		/** If true, kill the sandbox after the workflow completes; defaults to false */
		killSandbox?: boolean;
		/** Unified sync hook: called either before or after the agent with FS adapter */
		syncIt?: (fs: {
			writeFile: (location: string, data: string) => Promise<void>;
			listFiles: (root?: string) => Promise<Array<string>>;
			readFile: (path: string) => Promise<string>;
			/** Preferred base docs root (OUTDIR), if known; typically contains a 'docs' subdir */
			docsRoot?: string;
		}) => Promise<void>;
		/** When to invoke syncIt: 'before' (default for legacy docs-to-site) or 'after' (for pushing generated docs). */
		syncItPhase?: "before" | "after";
		/** Additional tools to add to the agent (for custom backend tools like article editing) */
		additionalTools?: Array<import("./Types").ToolDef>;
		/** Tool executor for additional tools (backend tools that aren't in the sandbox)
		 * @param call - The tool call to execute
		 * @param runState - The current run state (includes e2bsandbox for sandbox access)
		 */
		additionalToolExecutor?: (
			call: import("./Types").ToolCall,
			runState: import("./Types").RunState,
		) => Promise<string>;
		/** Flag to use updatePrompt instead of Jolli_Main section */
		useUpdatePrompt?: boolean;
		/** Alternative prompt to use when useUpdatePrompt is true */
		updatePrompt?: string;
		/** GitHub repository organization/owner */
		githubOrg?: string;
		/** GitHub repository name */
		githubRepo?: string;
		/** GitHub branch name */
		githubBranch?: string;
		/** Job steps to execute before the agent runs (from front matter job.steps) */
		jobSteps?: Array<JobStep>;
		/** Resource attachments from front matter attend field */
		attend?: Array<AttendResource>;
	},
	log?: JolliAgentLogger,
): Promise<WorkflowResult> {
	const internalLog = createConsoleLogger(config.debug || false);

	let sandboxRef: Sandbox | undefined;
	try {
		// Validate configuration
		validateWorkflowConfig(config);

		// Set up environment for agent to use
		process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;

		// Create E2B sandbox
		const sandbox = await createE2BSandbox(
			config.e2bTemplateId,
			config.e2bApiKey,
			config.connectTimeoutMs || 20000,
			internalLog,
		);
		sandboxRef = sandbox;

		// Log sandbox id when started - E2B SDK uses sandboxId property
		const sandboxId: string = sandbox.sandboxId;
		if (log) {
			// Use format that matches createSandboxCapturingLogger regex for ID extraction
			log.agentLog(`Created sandbox: ${sandboxId}`);
		}
		internalLog.info(`Created sandbox: ${sandboxId}`);

		// Initialize run state with GitHub details if provided
		const githubDetails =
			workflowArgs?.githubOrg && workflowArgs?.githubRepo
				? {
						org: workflowArgs.githubOrg as string,
						repo: workflowArgs.githubRepo as string,
						...(workflowArgs.githubBranch && { branch: workflowArgs.githubBranch as string }),
					}
				: undefined;
		const runState = initializeRunState(sandbox, config, githubDetails);

		// FS adapter for syncIt hooks (both pre and post phases)
		const { writeFileExecutor } = await import("./tools/tools/write_file");
		const { listAllFiles, readMarkdownFile } = await import("./sandbox/utils");

		const fsAdapter: {
			writeFile: (location: string, data: string) => Promise<void>;
			listFiles: (root?: string) => Promise<Array<string>>;
			readFile: (path: string) => Promise<string>;
			docsRoot?: string;
		} = {
			writeFile: async (location: string, data: string): Promise<void> => {
				const result = await writeFileExecutor(runState, {
					filename: location,
					content: data,
				});
				if (result.includes("Error")) {
					internalLog.error(`[syncIt] writeFile error: ${result}`);
					if (log) {
						log.agentLog(`[syncIt] writeFile error: ${result}`);
					}
					throw new Error(result);
				} else {
					internalLog.info(`[syncIt] ${result}`);
					if (log) {
						log.agentDebug(`[syncIt] ${result}`);
					}
				}
			},
			listFiles: async (root?: string): Promise<Array<string>> => {
				try {
					const files = await listAllFiles(runState, root);
					return files;
				} catch (e) {
					internalLog.error(`[syncIt] listFiles error: ${String(e)}`);
					if (log) {
						log.agentLog(`[syncIt] listFiles error: ${String(e)}`);
					}
					return [];
				}
			},
			readFile: async (path: string): Promise<string> => {
				try {
					return await readMarkdownFile(runState, path);
				} catch (e) {
					internalLog.error(`[syncIt] readFile error: ${String(e)}`);
					if (log) {
						log.agentLog(`[syncIt] readFile error: ${String(e)}`);
					}
					return "";
				}
			},
		};

		// Pre-checkout GitHub repository if we have the necessary information (similar to CollabConvoRouter)
		if (config.githubToken && workflowArgs?.githubOrg && workflowArgs?.githubRepo) {
			try {
				const githubOrg = workflowArgs.githubOrg as string;
				const githubRepo = workflowArgs.githubRepo as string;
				const githubBranch = (workflowArgs.githubBranch as string) || "main";

				internalLog.info(
					`[workflow] Pre-checking out GitHub repo ${githubOrg}/${githubRepo} (branch: ${githubBranch})`,
				);
				if (log) {
					log.agentLog(`Pre-checking out GitHub repo ${githubOrg}/${githubRepo} (branch: ${githubBranch})`);
				}

				// Log the runState to verify it has the necessary environment variables
				internalLog.info(
					`[workflow] RunState for checkout - executorNamespace: ${runState.executorNamespace}, has e2bsandbox: ${!!runState.e2bsandbox}, GH_PAT: ${
						runState.env_vars?.GH_PAT ? "present" : "missing"
					}, GH_ORG: ${runState.env_vars?.GH_ORG || "missing"}, GH_REPO: ${runState.env_vars?.GH_REPO || "missing"}`,
				);

				const checkoutResult = await runToolCall(runState, {
					id: `pre-checkout-${Date.now()}`,
					name: "github_checkout",
					arguments: {
						repo: `${githubOrg}/${githubRepo}`,
						branch: githubBranch,
					},
				});

				internalLog.info(`[workflow] GitHub repo checkout result: ${checkoutResult}`);
				if (log) {
					log.agentLog(`GitHub repo checkout result: ${checkoutResult}`);
				}
			} catch (error) {
				internalLog.error(`[workflow] Failed to pre-checkout GitHub repo: ${String(error)}`);
				if (log) {
					log.agentLog(`Failed to pre-checkout GitHub repo: ${String(error)}`);
				}
				// Don't fail the workflow, just log the error
			}
		} else {
			internalLog.info(
				`[workflow] Skipping pre-checkout - githubToken: ${config.githubToken ? "present" : "missing"}, githubOrg: ${
					workflowArgs?.githubOrg || "missing"
				}, githubRepo: ${workflowArgs?.githubRepo || "missing"}`,
			);
			if (log && config.githubToken) {
				log.agentDebug(
					`Skipping pre-checkout - missing GitHub details (org: ${workflowArgs?.githubOrg || "missing"}, repo: ${
						workflowArgs?.githubRepo || "missing"
					})`,
				);
			}
		}

		// STUB: Process attend resources (resource attachments from front matter)
		if (workflowArgs?.attend && workflowArgs.attend.length > 0) {
			internalLog.info(`[workflow] Found ${workflowArgs.attend.length} attend resource(s)`);
			if (log) {
				log.agentLog(`[workflow] Found ${workflowArgs.attend.length} attend resource(s)`);
			}
			for (const resource of workflowArgs.attend) {
				const name = resource.name || resource.jrn;
				const sectionInfo = resource.section_id ? ` (section: ${resource.section_id})` : "";
				internalLog.info(`[workflow] [STUB] Attend resource: ${name} -> jrn: ${resource.jrn}${sectionInfo}`);
				if (log) {
					log.agentLog(`[workflow] [STUB] Attend resource: ${name} -> jrn: ${resource.jrn}${sectionInfo}`);
				}
			}
		}

		// Execute job steps after checkout but before agent runs
		if (workflowArgs?.jobSteps && workflowArgs.jobSteps.length > 0) {
			internalLog.info(`[workflow] Found ${workflowArgs.jobSteps.length} job step(s) to execute`);
			if (log) {
				log.agentLog(`[workflow] Found ${workflowArgs.jobSteps.length} job step(s) to execute`);
			}

			const stepsResult = await executeJobSteps({
				sandbox,
				steps: workflowArgs.jobSteps,
				internalLog,
				log,
				toolExecutor: workflowArgs.additionalToolExecutor,
				runState,
				workflowConfig: config,
				additionalTools: workflowArgs.additionalTools,
			});

			if (!stepsResult.success) {
				const errorMsg = `Job step "${stepsResult.failedStep}" failed: ${stepsResult.error}`;
				internalLog.error(`[workflow] ${errorMsg}`);
				if (log) {
					log.agentError(`[workflow] ${errorMsg}`);
				}
				throw new Error(errorMsg);
			}
		}

		// Pre-agent sync: execute when syncItPhase is BEFORE (default for legacy)
		if (
			workflowArgs &&
			typeof workflowArgs.syncIt === "function" &&
			(workflowArgs.syncItPhase ?? "before") === "before"
		) {
			internalLog.info("[workflow] Found syncIt(before), executing now");
			if (log) {
				log.agentLog("[workflow] Found syncIt(before), executing now");
			}
			try {
				await workflowArgs.syncIt(fsAdapter);
				internalLog.info("[workflow] syncIt(before) completed successfully");
				if (log) {
					log.agentLog("[workflow] syncIt(before) completed successfully");
				}
			} catch (error) {
				internalLog.error(`[workflow] syncIt(before) failed: ${String(error)}`);
				if (log) {
					log.agentLog(`[workflow] syncIt(before) failed: ${String(error)}`);
				}
				// Continue execution even if syncIt fails
			}
		}

		// Set up agent factory and seed options (supports custom markdown-driven run-jolliscript workflow)
		type AgentFactoryResult = Awaited<ReturnType<typeof createWorkflowAgent>>;
		let agentFactory: AgentFactoryResult | undefined;
		let seedChatOpts: { system?: string; messages?: Array<Message>; prompt?: string } = {};
		let skipAgent = false;

		if (workflowType === "run-jolliscript") {
			// run-jolliscript only executes job steps from front matter
			// Prompts are handled via run_prompt steps, not markdown body content
			internalLog.info("[workflow] run-jolliscript: prompts come from run_prompt steps only");
			if (log) {
				log.agentLog("[workflow] run-jolliscript: prompts come from run_prompt steps only");
			}
			skipAgent = true;

			if (runState.env_vars && workflowArgs?.markdownContent) {
				runState.env_vars.MARKDOWN_INPUT = workflowArgs.markdownContent;
				runState.env_vars.MARKDOWN_FILE = workflowArgs.filename || "input.md";
			}
		} else {
			agentFactory = await createWorkflowAgent(workflowType, runState, workflowArgs);
			seedChatOpts = setupMarkdownSeedOptions(workflowType, workflowArgs, runState);
		}

		const outputFiles: Record<string, string> = {};

		// Decide direct vs agent-based execution
		let assistantText = "";
		let discoveredDocsDir: string | undefined;
		let usedDirect = false;
		let agent: Agent | undefined;

		// Skip agent execution if we only have job steps (no content after front matter)
		if (skipAgent) {
			internalLog.info("[workflow] Skipping agent execution (job steps only mode)");
			if (log) {
				log.agentLog("[workflow] Skipping agent execution (job steps only mode)");
			}
			usedDirect = true; // Treat as direct execution to skip agent-related post-processing
		} else if (!agentFactory) {
			throw new Error("Agent factory not initialized");
		} else {
			const { agent: factoryAgent, withDefaults } = agentFactory;
			agent = factoryAgent;

			// Attach optional finalizer if requested
			if (workflowArgs?.saveIt) {
				const root = workflowArgs.finalizerRoot || workflowArgs.outputDir || "./api-docs";
				const report = (msg: string) => {
					internalLog.info(msg);
					if (log) {
						log.agentLog(msg);
					}
				};
				agent.finalizer = createListAndSaveFinalizer(runState, workflowArgs.saveIt, { root, report });
			}

			if (workflowType === "code-to-api-docs") {
				usedDirect = true;
				const { runDirectCodeToApiDocs } = await import("./direct/workflows");
				const { text, docsDir } = await runDirectCodeToApiDocs({
					runState,
					githubUrl: workflowArgs?.githubUrl || "",
					...(workflowArgs?.outputDir ? { outputDir: workflowArgs.outputDir } : {}),
					...(log ? { log } : {}),
				});
				assistantText = text;
				discoveredDocsDir = docsDir;
			} else {
				// Build conversation history and run agent turn
				const base = withDefaults(seedChatOpts);
				const history = buildConversationHistory(base);

				const _result = await agent.chatTurn({
					history,
					runTool: async (call: ToolCall) => {
						internalLog.debug(`Tool call: ${call.name}(${JSON.stringify(call.arguments)})`);
						if (log) {
							log.agentDebug(`Tool call: ${call.name}(${JSON.stringify(call.arguments)})`);
						}

						// Check if this is an additional tool (article editing tool)
						let output: string;
						if (
							workflowArgs?.additionalToolExecutor &&
							workflowArgs?.additionalTools?.some(t => t.name === call.name)
						) {
							// Execute using the additional tool executor (backend tools)
							// Pass runState so tools can access the sandbox if needed
							internalLog.debug(`Executing additional tool: ${call.name}`);
							if (log) {
								log.agentDebug(`Executing additional tool: ${call.name}`);
							}
							output = await workflowArgs.additionalToolExecutor(call, runState);
						} else {
							// Execute using the standard E2B tool runner
							output = await runToolCall(runState, call);
						}

						if (call.name === "code2docusaurus_run" && typeof output === "string") {
							const m = output.match(/\[code2docusaurus_run\]\s+DOCS_DIR=([^\n\r]+)/);
							if (m?.[1]) {
								discoveredDocsDir = m[1].trim();
								internalLog.info(`Detected DOCS_DIR from tool output: ${discoveredDocsDir}`);
								if (log) {
									log.agentLog(`Detected DOCS_DIR from tool output: ${discoveredDocsDir}`);
								}
							}
						}
						internalLog.debug(`Tool result: ${call.name} completed`);
						if (log) {
							log.agentDebug(`Tool result: ${call.name} completed`);
						}
						return output;
					},
					onTextDelta: (delta: string) => {
						assistantText += delta;
					},
				});

				// Emit a single user-visible LLM log entry for the entire assistant turn
				if (log && assistantText.trim().length > 0) {
					log.llmLog(assistantText.trim());
				}
			}
		}

		// If a saveIt finalizer was requested, try to refine the root using tool output
		if (!usedDirect && agent && workflowArgs?.saveIt) {
			if (discoveredDocsDir) {
				const report = (msg: string) => {
					internalLog.info(msg);
					if (log) {
						log.agentLog(msg);
					}
				};
				agent.finalizer = createListAndSaveFinalizer(runState, workflowArgs.saveIt, {
					root: discoveredDocsDir,
					report,
				});
			}
			const m = assistantText.match(/\[code2docusaurus_run\]\s+DOCS_DIR=([^\n\r]+)/);
			if (m?.[1]) {
				const parsedRoot = m[1].trim();
				// Override the finalizer to use the absolute DOCS_DIR path reported by the tool
				const report = (msg: string) => {
					internalLog.info(msg);
					if (log) {
						log.agentLog(msg);
					}
				};
				agent.finalizer = createListAndSaveFinalizer(runState, workflowArgs.saveIt, {
					root: parsedRoot,
					report,
				});
			}
		}

		// Post-processing for specific workflows
		if (!usedDirect && workflowType === "citations-graph") {
			outputFiles["citations.md"] = `${assistantText.trim()}\n`;
		}

		// Clean up sandbox

		// Optional finalizer: allow the agent to perform final side effects using runState
		if (agent) {
			try {
				const agentWithFinalizer = agent as AgentWithFinalizer;
				if (!usedDirect && typeof agentWithFinalizer.finalizer === "function") {
					await agentWithFinalizer.finalizer();
				}
			} catch (e) {
				internalLog.error("Finalizer failed:", e);
				if (log) {
					log.agentError(`Finalizer failed: ${String(e)}`);
				}
			}
		}

		// Post-agent sync: execute when syncItPhase is AFTER (used to push files -> DocDao)
		if (workflowArgs && typeof workflowArgs.syncIt === "function" && workflowArgs.syncItPhase === "after") {
			// Populate docsRoot for post-sync if we detected it (fallback to provided outputDir)
			let derivedRoot: string | undefined;
			if (discoveredDocsDir) {
				derivedRoot = discoveredDocsDir;
			} else {
				const m2 = assistantText.match(/\[code2docusaurus_run\]\s+DOCS_DIR=([^\n\r]+)/);
				if (m2?.[1]) {
					derivedRoot = m2[1].trim();
				}
			}
			fsAdapter.docsRoot = derivedRoot || workflowArgs?.outputDir || "./api-docs";
			internalLog.info(`[workflow] Using docsRoot=${fsAdapter.docsRoot} for post-sync`);
			if (log) {
				log.agentLog(`[workflow] Using docsRoot=${fsAdapter.docsRoot} for post-sync`);
			}
			internalLog.info("[workflow] Found syncIt(after), executing now");
			if (log) {
				log.agentLog("[workflow] Found syncIt(after), executing now");
			}
			try {
				await workflowArgs.syncIt(fsAdapter);
				internalLog.info("[workflow] syncIt(after) completed successfully");
				if (log) {
					log.agentLog("[workflow] syncIt(after) completed successfully");
				}
			} catch (error) {
				internalLog.error(`[workflow] syncIt(after) failed: ${String(error)}`);
				if (log) {
					log.agentLog(`[workflow] syncIt(after) failed: ${String(error)}`);
				}
				// Continue cleanup even if sync fails
			}
		}

		// Proactively cleanup before returning; finally block will also ensure cleanup
		if (workflowArgs?.killSandbox && sandboxRef) {
			try {
				internalLog.info("Killing sandbox as requested (proactive cleanup)");
				if (log) {
					log.agentLog("Killing sandbox as requested (proactive cleanup)");
				}
				await (sandboxRef as SandboxWithKill)?.kill?.();
			} catch (e) {
				internalLog.error("Failed to kill sandbox during proactive cleanup:", e);
				if (log) {
					log.agentError(`Failed to kill sandbox during proactive cleanup: ${String(e)}`);
				}
			}
		}

		return {
			success: true,
			assistantText,
			outputFiles,
			outputData: {
				workflowType,
				executionTime: Date.now(),
				...(sandboxId ? { sandboxId } : {}),
			},
		};
	} catch (error) {
		if (log) {
			log.agentError(`Workflow fatal error: ${error instanceof Error ? error.message : String(error)}`);
		}
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			outputData: {
				workflowType,
				executionTime: Date.now(),
			},
		};
	} finally {
		if (sandboxRef) {
			await cleanupSandbox(sandboxRef, workflowArgs?.killSandbox ?? false, internalLog, log);
		}
	}
}

/**
 * Helper function to run workflow from a job context
 * This wraps runWorkflow with job-specific error handling and logging
 */
export async function runWorkflowForJob(
	workflowType: WorkflowType,
	config: WorkflowConfig,
	workflowArgs?: Parameters<typeof runWorkflow>[2],
	jobLogger?: (message: string) => void,
): Promise<WorkflowResult> {
	// Choose environment-appropriate log
	const log: JolliAgentLogger = jobLogger ? createServerLogger(jobLogger) : createCliLogger({ withPrefixes: true });

	log.agentLog(`Starting ${workflowType} workflow in E2B mode`);

	try {
		// Force debug=true on server runs so internal debug logs are enabled
		const serverConfig = { ...config, debug: true };
		const result = await runWorkflow(workflowType, serverConfig, workflowArgs, log);

		if (result.success) {
			log.agentLog(`Workflow completed successfully`);
			if (result.outputFiles) {
				const fileCount = Object.keys(result.outputFiles).length;
				log.agentLog(`Generated ${fileCount} output file(s)`);
			}
		} else {
			log.agentError(`Workflow failed: ${result.error}`);
		}

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.agentError(`Workflow execution error: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
			outputData: {
				workflowType,
				executionTime: Date.now(),
			},
		};
	}
}

// Export workflow types for use in job definitions
export const WORKFLOW_TYPES: Array<WorkflowType> = [
	"getting-started-guide",
	"code-docs",
	"code-to-docs",
	"code-to-api-docs",
	"docs-to-site",
	"architecture",
	"architecture-doc",
	"architecture-update",
	"citations-graph",
	"run-jolliscript",
];
