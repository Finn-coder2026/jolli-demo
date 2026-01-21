import type { RunState, ToolDef } from "../../Types";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const github_checkout_tool_def: ToolDef = {
	name: "github_checkout",
	description:
		"Clone a GitHub repository into the E2B sandbox workspace with full git history. Clones to ~/workspace/<repo-name>/<branch>/ (e.g., 'octocat/Hello-World' on branch 'main' goes to ~/workspace/Hello-World/main/). Requires GH_PAT environment variable to be set.",
	parameters: {
		type: "object",
		properties: {
			repo: {
				type: "string",
				description: "Repository in owner/repo format (e.g., 'octocat/Hello-World')",
			},
			branch: {
				type: "string",
				description: "Optional branch name to checkout (defaults to 'main')",
			},
		},
		required: ["repo"],
	},
};

// E2B-only implementation
export async function executeGithubCheckoutTool(
	runState: RunState,
	args: { repo: string; branch?: string },
): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
	}

	if (!args?.repo) {
		return "Error: Repository argument required (format: owner/repo)";
	}

	const repo = args.repo.trim();
	const branch = args.branch?.trim() || "main";

	// Get GH_PAT from runState env_vars
	const ghPat = runState.env_vars?.GH_PAT;
	if (!ghPat) {
		// Log what environment variables are available for debugging
		const availableEnvVars = runState.env_vars ? Object.keys(runState.env_vars).join(", ") : "none";
		return `Error: GH_PAT environment variable not set. Available env vars: ${availableEnvVars}. Please add GH_PAT to your .env or .env.local file.`;
	}

	try {
		// Perform the GitHub clone directly via gh in the sandbox with full history
		// Use env vars to avoid shell-escaping issues
		const script = [
			"set -e",
			// Prepare variables and target dir (mirrors previous script layout)
			'PROJECT="$(echo \"$REPO\" | cut -d\"/\" -f2)"',
			'WORKSPACE_DIR="$HOME/workspace/$PROJECT/$BRANCH"',
			'mkdir -p "$WORKSPACE_DIR"',
			// Auth and clone
			'echo "$GH_PAT" | gh auth login --with-token',
			'echo "Cloning $REPO (branch: $BRANCH) with full history into $WORKSPACE_DIR..."',
			// Full-depth clone - explicitly pass --no-single-branch to get all branches and full history
			'gh repo clone "$REPO" "$WORKSPACE_DIR" -- --branch "$BRANCH" --no-single-branch',
			'echo "Successfully cloned $REPO to $WORKSPACE_DIR with full git history"',
		].join("\n");
		const proc = await sandbox.commands.run(`bash -lc '\n${script}\n'`, {
			envs: {
				GH_PAT: ghPat,
				REPO: repo,
				BRANCH: branch,
			},
			timeoutMs: 120_000,
		});

		// Combine stdout and stderr for complete output
		const output = (proc.stdout + proc.stderr).trim();

		if (proc.error) {
			console.error(`[github_checkout] Error: ${proc.error}`);
			return `Error: ${proc.error}\nOutput:\n${output}`;
		}

		if (proc.exitCode !== 0) {
			console.error(`[github_checkout] Failed with exit code ${proc.exitCode}`);
			return `Error cloning repository (exit code ${proc.exitCode}):\nOutput:\n${output}`;
		}
		return output || `Successfully cloned ${repo} (branch: ${branch})`;
	} catch (error) {
		const err = error as { message?: string; stdout?: string; stderr?: string };
		let errorMsg = `Error executing github checkout: ${err.message || String(error)}`;

		// Try to get stdout/stderr from the error object if available
		if (err.stdout || err.stderr) {
			errorMsg += `\nStdout: ${err.stdout || "(empty)"}`;
			errorMsg += `\nStderr: ${err.stderr || "(empty)"}`;
		}

		return errorMsg;
	}
}

// Unified executor (E2B only)
export const githubCheckoutExecutor: ToolExecutor = async (runState, args) => {
	return await executeGithubCheckoutTool(runState, args as { repo: string; branch?: string });
};
