import type { RunState, ToolDef } from "../../Types";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

type Args = {
	docs_path: string; // Absolute path to the docs folder in the E2B sandbox
	output_dir?: string; // Output directory for Docusaurus config (absolute or relative); defaults to parent of docs_path
	title?: string; // Site title (default: "API Documentation")
	url?: string; // Site URL (default: "https://example.com")
	base_url?: string; // Base URL path (default: "/")
	org?: string; // Organization name (default: "your-org")
	project?: string; // Project name (default: "your-project")
};

export const docs2docusaurus_run_tool_def: ToolDef = {
	name: "docs2docusaurus_run",
	description:
		"Run docs2docusaurus inside the E2B sandbox to generate Docusaurus configuration from existing documentation folders.",
	parameters: {
		type: "object",
		properties: {
			docs_path: {
				type: "string",
				description: "Absolute path to the docs folder inside the E2B sandbox.",
			},
			output_dir: {
				type: "string",
				description:
					"Output directory for Docusaurus config (absolute or relative to docs_path parent). Defaults to parent directory of docs_path.",
			},
			title: {
				type: "string",
				description: "Site title (default: 'API Documentation').",
			},
			url: {
				type: "string",
				description: "Site URL (default: 'https://example.com').",
			},
			base_url: {
				type: "string",
				description: "Base URL path (default: '/').",
			},
			org: {
				type: "string",
				description: "Organization name (default: 'your-org').",
			},
			project: {
				type: "string",
				description: "Project name (default: 'your-project').",
			},
		},
		required: ["docs_path"],
	},
};

export const docs2docusaurusRunExecutor: ToolExecutor = async (runState: RunState, rawArgs: unknown) => {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Run with --e2b and ensure E2B env vars are set.";
	}

	const args = (rawArgs || {}) as Partial<Args>;
	const docsPath = (args.docs_path || "").trim();
	if (!docsPath) {
		return "Error: docs_path is required and must be an absolute path inside the E2B sandbox.";
	}

	const outputDir = (args.output_dir || "").toString().trim();
	const title = (args.title || "API Documentation").toString().trim();
	const url = (args.url || "https://example.com").toString().trim();
	const baseUrl = (args.base_url || "/").toString().trim();
	const org = (args.org || "your-org").toString().trim();
	const project = (args.project || "your-project").toString().trim();

	try {
		const script = [
			"set -e",
			'DOCS_PATH="$DOCS_PATH_ARG"',
			// Resolve output dir: if specified, use it (absolute if starts with /, else relative to docs parent)
			// If not specified, use parent directory of DOCS_PATH
			'if [ -n "$OUTPUT_DIR" ]; then',
			'  case "$OUTPUT_DIR" in',
			'    /*) OUTDIR="$OUTPUT_DIR" ;;',
			'     *) OUTDIR="$(dirname "$DOCS_PATH")/$OUTPUT_DIR" ;;',
			"  esac",
			"else",
			'  OUTDIR="$(dirname "$DOCS_PATH")"',
			"fi",
			'mkdir -p "$OUTDIR"',
			'CMD="docs2docusaurus --docs \\"$DOCS_PATH\\" --output \\"$OUTDIR\\" --title \\"$TITLE\\" --url \\"$URL\\" --base-url \\"$BASE_URL\\" --org \\"$ORG\\" --project \\"$PROJECT\\""',
			'echo "[docs2docusaurus_run] Running: $CMD"',
			// Run and stream output
			"$CMD",
			'echo "[docs2docusaurus_run] CONFIG_DIR=$OUTDIR"',
			'echo "[docs2docusaurus_run] DOCS_DIR=$DOCS_PATH"',
		].join("\n");

		const proc = await sandbox.commands.run(`bash -lc '\n${script}\n'`, {
			envs: {
				DOCS_PATH_ARG: docsPath,
				OUTPUT_DIR: outputDir,
				TITLE: title,
				URL: url,
				BASE_URL: baseUrl,
				ORG: org,
				PROJECT: project,
			},
			timeoutMs: 120_000,
		});

		const output = (proc.stdout + proc.stderr).trim();
		if (proc.error) {
			return `Error: ${proc.error}\nOutput:\n${output}`;
		}
		if (proc.exitCode !== 0) {
			return `Error running docs2docusaurus (exit code ${proc.exitCode}):\n${output}`;
		}
		return output || "docs2docusaurus completed.";
	} catch (err) {
		const e = err as { message?: string };
		return `Exception in docs2docusaurus_run: ${e.message || String(err)}`;
	}
};
