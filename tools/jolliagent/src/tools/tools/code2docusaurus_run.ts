import type { RunState, ToolDef } from "../../Types";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

type Args = {
	repo_path: string; // Absolute path to the cloned repo in the E2B sandbox
	subdir?: string; // Optional subdirectory within the repo to treat as root
	output_dir?: string; // Output directory for docs (absolute or relative); defaults to ./api-docs inside working dir
	format?: "yaml" | "json"; // OpenAPI format (default: yaml)
	generate_docs?: boolean; // Whether to scaffold Docusaurus docs (default: true)
};

export const code2docusaurus_run_tool_def: ToolDef = {
	name: "code2docusaurus_run",
	description: "Run code2docusaurus inside the E2B sandbox to scan a repo and generate OpenAPI and Docusaurus docs.",
	parameters: {
		type: "object",
		properties: {
			repo_path: {
				type: "string",
				description: "Absolute path to the cloned repository inside the E2B sandbox.",
			},
			subdir: {
				type: "string",
				description: "Optional subdirectory within the repository to scan (e.g., 'examples/route-separation').",
			},
			output_dir: {
				type: "string",
				description: "Destination folder for generated docs (absolute or relative to working dir).",
			},
			format: {
				type: "string",
				enum: ["yaml", "json"],
				description: "OpenAPI output format (default: yaml).",
			},
			generate_docs: {
				type: "boolean",
				description: "Also generate Docusaurus docs (default: true).",
			},
		},
		required: ["repo_path"],
	},
};

export const code2docusaurusRunExecutor: ToolExecutor = async (runState: RunState, rawArgs: unknown) => {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Run with --e2b and ensure E2B env vars are set.";
	}

	const args = (rawArgs || {}) as Partial<Args>;
	const repoPath = (args.repo_path || "").trim();
	if (!repoPath) {
		return "Error: repo_path is required and must be an absolute path inside the E2B sandbox.";
	}

	const subdir = (args.subdir || "").trim();
	const outputDir = (args.output_dir || "").toString().trim();
	const format = (args.format || "yaml").toString().trim();
	const generateDocs = args.generate_docs === false ? "0" : "1";

	try {
		const script = [
			"set -e",
			'WORKDIR="$REPO_PATH"',
			'if [ -n "$SUBDIR" ]; then WORKDIR="$REPO_PATH/$SUBDIR"; fi',
			'mkdir -p "$WORKDIR"',
			// Resolve output dir: absolute if starts with /, else relative to WORKDIR
			'if [ -n "$OUTPUT_DIR" ]; then',
			'  case "$OUTPUT_DIR" in',
			'    /*) OUTDIR="$OUTPUT_DIR" ;;',
			'     *) OUTDIR="$WORKDIR/$OUTPUT_DIR" ;;',
			"  esac",
			"else",
			'  OUTDIR="$WORKDIR/api-docs"',
			"fi",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: This is a bash variable expansion, not a JS template
			'FORMAT="${FORMAT:-yaml}"',
			// biome-ignore lint/suspicious/noTemplateCurlyInString: This is a bash variable expansion, not a JS template
			'GEN="${GENERATE_DOCS:-1}"',
			'mkdir -p "$OUTDIR"',
			'cd "$WORKDIR"',
			'CMD="code2docusaurus \"$WORKDIR\" -o \"$OUTDIR\" -f \"$FORMAT\""',
			'if [ "$GEN" = "1" ]; then CMD="$CMD --generate-docs"; fi',
			'echo "[code2docusaurus_run] Running: $CMD"',
			// Run and stream output
			"$CMD",
			'SPEC_FILE="openapi.yaml"',
			'if [ "$FORMAT" = "json" ]; then SPEC_FILE="openapi.json"; fi',
			'SPEC_PATH="$OUTDIR/$SPEC_FILE"',
			'echo "[code2docusaurus_run] SPEC_PATH=$SPEC_PATH"',
			'echo "[code2docusaurus_run] DOCS_DIR=$OUTDIR"',
		].join("\n");

		const proc = await sandbox.commands.run(`bash -lc '\n${script}\n'`, {
			envs: {
				REPO_PATH: repoPath,
				SUBDIR: subdir,
				OUTPUT_DIR: outputDir,
				FORMAT: format,
				GENERATE_DOCS: generateDocs,
			},
			timeoutMs: 120_000,
		});

		const output = (proc.stdout + proc.stderr).trim();
		if (proc.error) {
			return `Error: ${proc.error}\nOutput:\n${output}`;
		}
		if (proc.exitCode !== 0) {
			return `Error running code2docusaurus (exit code ${proc.exitCode}):\n${output}`;
		}
		return output || "code2docusaurus completed.";
	} catch (err) {
		const e = err as { message?: string };
		return `Exception in code2docusaurus_run: ${e.message || String(err)}`;
	}
};
