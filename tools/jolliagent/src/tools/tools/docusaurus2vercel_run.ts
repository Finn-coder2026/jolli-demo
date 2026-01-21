import type { RunState, ToolDef } from "../../Types";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

type Args = {
	docs_path: string; // Absolute path to generated Docusaurus project (output of code2docusaurus --generate-docs)
	project_name?: string; // Optional Vercel project name (defaults to basename of docs_path)
	vercel_token?: string; // Optional Vercel token; falls back to runState.env_vars.VERCEL_TOKEN
	subdomain?: string; // Optional custom subdomain
	domain?: string; // Optional domain (default vercel.app)
};

export const docusaurus2vercel_run_tool_def: ToolDef = {
	name: "docusaurus2vercel_run",
	description: "Deploy a Docusaurus site to Vercel from inside the E2B sandbox.",
	parameters: {
		type: "object",
		properties: {
			docs_path: {
				type: "string",
				description: "Absolute path to the documentation folder containing the Docusaurus project.",
			},
			project_name: { type: "string", description: "Vercel project name (optional)." },
			vercel_token: {
				type: "string",
				description: "Vercel API token (optional; otherwise use VERCEL_TOKEN from env).",
			},
			subdomain: { type: "string", description: "Custom subdomain (optional)." },
			domain: { type: "string", description: "Custom domain (optional; default vercel.app)." },
		},
		required: ["docs_path"],
	},
};

export const docusaurus2vercelRunExecutor: ToolExecutor = async (runState: RunState, rawArgs: unknown) => {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Run with --e2b and ensure E2B env vars are set.";
	}

	const args = (rawArgs || {}) as Partial<Args>;
	const docsPath = (args.docs_path || "").trim();
	if (!docsPath) {
		return "Error: docs_path is required and must be an absolute path inside the E2B sandbox.";
	}

	const token = (args.vercel_token || runState.env_vars?.VERCEL_TOKEN || "").trim();
	if (!token) {
		return "Error: No Vercel token provided. Set runState.env_vars.VERCEL_TOKEN or pass vercel_token.";
	}

	const projectName = (args.project_name || "").trim();
	const subdomain = (args.subdomain || "").trim();
	const domain = (args.domain || "").trim();

	try {
		const script = [
			"set -e",
			'DOCS_PATH="$DOCS_PATH"',
			'TOKEN="$VERCEL_TOKEN"',
			'PNAME="$PROJECT_NAME"',
			'SUBD="$SUBDOMAIN"',
			'DOM="$DOMAIN"',
			'if [ -z "$PNAME" ]; then PNAME="$(basename \"$DOCS_PATH\")"; fi',
			'CMD="docusaurus2vercel \"$DOCS_PATH\" -t \"$TOKEN\" -p \"$PNAME\""',
			'if [ -n "$SUBD" ]; then CMD="$CMD -s \"$SUBD\""; fi',
			'if [ -n "$DOM" ]; then CMD="$CMD -d \"$DOM\""; fi',
			'echo "[docusaurus2vercel_run] Running: $CMD"',
			"$CMD",
		].join("\n");

		const proc = await sandbox.commands.run(`bash -lc '\n${script}\n'`, {
			envs: {
				DOCS_PATH: docsPath,
				VERCEL_TOKEN: token,
				PROJECT_NAME: projectName,
				SUBDOMAIN: subdomain,
				DOMAIN: domain,
			},
			timeoutMs: 180_000,
		});

		const output = (proc.stdout + proc.stderr).trim();
		if (proc.error) {
			return `Error: ${proc.error}\nOutput:\n${output}`;
		}
		if (proc.exitCode !== 0) {
			return `Error running docusaurus2vercel (exit code ${proc.exitCode}):\n${output}`;
		}
		return output || "docusaurus2vercel deployment completed.";
	} catch (err) {
		const e = err as { message?: string };
		return `Exception in docusaurus2vercel_run: ${e.message || String(err)}`;
	}
};
