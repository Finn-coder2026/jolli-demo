import type { JolliAgentLogger } from "../logger/Logger";
import type { E2BSandbox, RunState } from "../Types";
import { code2docusaurusRunExecutor } from "../tools/tools/code2docusaurus_run";
import { githubCheckoutExecutor } from "../tools/tools/github_checkout";

function parseGitHubUrl(input: string): {
	ownerRepo: string;
	branch?: string;
	subdir?: string;
} {
	// Accept forms:
	// - owner/repo
	// - https://github.com/owner/repo
	// - https://github.com/owner/repo/tree/<ref>
	// - https://github.com/owner/repo/tree/<ref>/path/to/subdir
	try {
		if (!input.includes("github.com")) {
			// Assume owner/repo
			const parts = input.split("/").filter(Boolean);
			if (parts.length >= 2) {
				return { ownerRepo: `${parts[0]}/${parts[1]}` };
			}
			return { ownerRepo: input };
		}
		const url = new URL(input);
		const segments = url.pathname.split("/").filter(Boolean);
		const owner = segments[0];
		const repo = segments[1];
		if (!owner || !repo) {
			return { ownerRepo: input };
		}
		if (segments[2] === "tree" && segments[3]) {
			const branch = segments[3];
			const subdir = segments.length > 4 ? segments.slice(4).join("/") : undefined;
			return subdir
				? { ownerRepo: `${owner}/${repo}`, branch, subdir }
				: { ownerRepo: `${owner}/${repo}`, branch };
		}
		return { ownerRepo: `${owner}/${repo}` };
	} catch {
		return { ownerRepo: input };
	}
}

async function getSandboxHome(runState: RunState): Promise<string> {
	const sandbox = runState.e2bsandbox as E2BSandbox | undefined;
	if (!sandbox) {
		return "/home/runner";
	}
	const proc = await sandbox.commands.run('bash -lc "printenv HOME"');
	const home = (proc.stdout || "").trim();
	return home || "/home/runner";
}

export async function runDirectCodeToApiDocs(params: {
	runState: RunState;
	githubUrl: string;
	outputDir?: string;
	log?: JolliAgentLogger;
}): Promise<{ text: string; docsDir?: string }> {
	const { runState, githubUrl, outputDir, log } = params;
	const { ownerRepo, branch: urlBranch, subdir } = parseGitHubUrl(githubUrl);
	const branchCandidates = urlBranch ? [urlBranch] : ["main", "master"];

	let checkoutOutput = "";
	let chosenBranch: string | undefined;
	for (const b of branchCandidates) {
		const out = await githubCheckoutExecutor(runState, { repo: ownerRepo, branch: b });
		checkoutOutput += `${out}\n`;
		if (!out.startsWith("Error:")) {
			chosenBranch = b;
			break;
		}
	}
	if (!chosenBranch) {
		// Last attempt: try without branch param (gh will pick default)
		const out = await githubCheckoutExecutor(runState, { repo: ownerRepo });
		checkoutOutput += `${out}\n`;
		if (out.startsWith("Error:")) {
			return { text: checkoutOutput };
		}
		// Unknown branch path; assume main
		chosenBranch = "main";
	}

	const home = await getSandboxHome(runState);
	const project = ownerRepo.split("/")[1] || "project";
	const workdir = `${home}/workspace/${project}/${chosenBranch}`;

	// Run code2docusaurus
	const code2Out = await code2docusaurusRunExecutor(runState, {
		repo_path: workdir,
		...(subdir ? { subdir } : {}),
		...(outputDir ? { output_dir: outputDir } : {}),
		format: "yaml",
		generate_docs: true,
	});

	const text = `${checkoutOutput}${code2Out}`.trim();
	// Try to parse DOCS_DIR from tool output
	let docsDir: string | undefined;
	const m = text.match(/\[code2docusaurus_run\]\s+DOCS_DIR=([^\n\r]+)/);
	if (m?.[1]) {
		docsDir = m[1].trim();
	} else {
		// Fallback: resolve relative outputDir against workdir
		const out = outputDir && outputDir.trim().length > 0 ? outputDir : "./api-docs";
		docsDir = out.startsWith("/") ? out : `${workdir}/${out}`;
	}

	if (log) {
		log.agentLog("code-to-api-docs-complete", { docsDir });
	}

	return { text, docsDir };
}
