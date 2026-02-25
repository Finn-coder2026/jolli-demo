/**
 * OnboardingResponses - Template response messages for each FSM state.
 *
 * These deterministic templates replace LLM-generated responses, ensuring
 * consistent and reliable messaging throughout the onboarding flow.
 */

import type { OnboardingGapAnalysisResult, OnboardingStepData } from "jolli-common";

/**
 * Welcome message greeting the user and explaining the 3 setup jobs.
 */
export function welcomeMessage(): string {
	return (
		"Welcome to Jolli! I'm here to help you get set up with 3 quick steps:\n\n" +
		"1. **Connect GitHub** - Link your repository so Jolli can access your code and docs\n" +
		"2. **Import & Generate Docs** - Bring in existing markdown files and/or generate new documentation from your code\n" +
		"3. **Test Auto-Sync** - Verify that changes you push to GitHub automatically update your docs\n\n" +
		"Ready to get started?"
	);
}

/**
 * Message when GitHub is already connected.
 */
export function githubAlreadyConnected(repo: string, branch: string): string {
	return (
		`Great news - GitHub is already connected! Your repository **${repo}** (branch: ${branch}) is linked.\n\n` +
		"Let's move on to scanning your repository for documentation files."
	);
}

/**
 * Message prompting the user to install the GitHub App.
 */
export function githubInstallPrompt(): string {
	return (
		"To get started, we need to install the Jolli GitHub App on your account. " +
		"This gives Jolli read access to your repositories so we can import documentation.\n\n" +
		"Would you like to install the GitHub App now?"
	);
}

/**
 * Message prompting the user to select a repository.
 *
 * - Single repo: prompts user to say "yes" to auto-connect it.
 * - Multiple repos: asks user to type a repo name.
 * - No repos: generic prompt.
 */
export function githubRepoPrompt(availableRepos?: Array<string>): string {
	if (availableRepos && availableRepos.length === 1) {
		return (
			`The GitHub App is installed! I found one repository: **${availableRepos[0]}**\n\n` +
			"Would you like to connect it? Say **yes** to connect."
		);
	}

	if (availableRepos && availableRepos.length > 1) {
		const displayRepos = availableRepos.slice(0, 20);
		const moreMsg = availableRepos.length > 20 ? `\n- ... and ${availableRepos.length - 20} more` : "";

		return (
			"The GitHub App is installed! Here are the repositories I have access to:\n\n" +
			displayRepos.map(r => `- **${r}**`).join("\n") +
			moreMsg +
			"\n\nType the name of the repository you'd like to connect (e.g., **owner/repo** or just the repo name)."
		);
	}

	return (
		"The GitHub App is installed! Now let's connect a repository.\n\n" +
		"Would you like to select a repository to connect?"
	);
}

/**
 * Message when the user typed a repo name that doesn't match any available repos.
 */
export function repoNotFound(userInput: string, availableRepos: Array<string>): string {
	const displayRepos = availableRepos.slice(0, 20);
	const moreMsg = availableRepos.length > 20 ? `\n- ... and ${availableRepos.length - 20} more` : "";

	return (
		`I couldn't find a repository matching "**${userInput}**". Here are the available repositories:\n\n` +
		displayRepos.map(r => `- **${r}**`).join("\n") +
		moreMsg +
		"\n\nPlease type the name of the repository you'd like to connect."
	);
}

/**
 * Message while waiting for GitHub installation/connection.
 */
export function githubWaiting(action: "install" | "select"): string {
	if (action === "install") {
		return "Opening the GitHub App installation page... Once you've completed the installation, let me know!";
	}
	return "Opening repository selection... Once you've selected a repository, let me know!";
}

/**
 * Message prompting to scan a repository.
 */
export function repoScanPrompt(repo: string): string {
	return (
		`Would you like me to scan **${repo}** for markdown documentation files? ` +
		"I'll look for .md and .mdx files throughout the repository."
	);
}

/**
 * Message showing scan results.
 */
export function scanResults(fileCount: number, repo: string, files: Array<string>): string {
	if (fileCount === 0) {
		return (
			`I scanned **${repo}** but didn't find any markdown files. ` +
			"No worries - you can still generate documentation from your code!\n\n" +
			"What would you like to do?\n" +
			"- **Generate** new docs from your code\n" +
			"- **Skip** this step"
		);
	}

	const displayFiles = files.slice(0, 15);
	const moreMsg = fileCount > 15 ? `\n- ... and ${fileCount - 15} more files` : "";

	return (
		`Found **${fileCount}** markdown files in **${repo}**:\n` +
		displayFiles.map(f => `- ${f}`).join("\n") +
		moreMsg +
		"\n\nWhat would you like to do?\n" +
		"- **Import** existing markdown files\n" +
		"- **Generate** new docs from your code\n" +
		"- **Both** - import existing files and generate additional docs\n" +
		"- **Skip** this step"
	);
}

/**
 * Message when no files found and only generation is possible.
 */
export function docActionPromptNoFiles(): string {
	return (
		"No existing documentation files were found in your repository.\n\n" +
		"Would you like me to **generate** documentation from your code? " +
		"I'll analyze your codebase and create documentation articles for undocumented areas."
	);
}

/**
 * Message when space is created/found.
 */
export function spaceCreated(spaceName: string, created: boolean): string {
	if (created) {
		return `Created a documentation space called **"${spaceName}"** for your project.`;
	}
	return `Using existing documentation space **"${spaceName}"**.`;
}

/**
 * Message when import tool returns an error.
 */
export function importError(details: string): string {
	return (
		`Import encountered an issue: ${details}\n\n` +
		"Would you like me to analyze your code for documentation gaps instead?"
	);
}

/**
 * Message after import completes.
 */
export function importComplete(imported: number, skipped: number, failed: number): string {
	let msg = `Import complete! **${imported}** articles imported successfully.`;

	if (skipped > 0) {
		msg += ` ${skipped} files were skipped (already imported).`;
	}
	if (failed > 0) {
		msg += ` ${failed} files failed to import.`;
	}

	msg += "\n\nWould you like me to analyze your code for documentation gaps?";
	return msg;
}

/**
 * Message prompting gap analysis.
 */
export function gapAnalysisPrompt(): string {
	return (
		"I can analyze your codebase to find areas that could benefit from documentation. " +
		"This will compare your code with the imported docs and identify gaps.\n\n" +
		"Would you like to run a gap analysis?"
	);
}

/**
 * Message showing gap analysis results.
 */
export function gapAnalysisResults(gaps: Array<OnboardingGapAnalysisResult>): string {
	if (gaps.length === 0) {
		return "Your documentation looks comprehensive - no major gaps detected!";
	}

	const highGaps = gaps.filter(g => g.severity === "high");
	const medGaps = gaps.filter(g => g.severity === "medium");
	const lowGaps = gaps.filter(g => g.severity === "low");

	let msg = `Found **${gaps.length}** documentation gaps:\n\n`;

	if (highGaps.length > 0) {
		msg += "**High priority:**\n";
		msg += highGaps.map(g => `- ${g.title}: ${g.description}`).join("\n");
		msg += "\n\n";
	}
	if (medGaps.length > 0) {
		msg += "**Medium priority:**\n";
		msg += medGaps.map(g => `- ${g.title}: ${g.description}`).join("\n");
		msg += "\n\n";
	}
	if (lowGaps.length > 0) {
		msg += "**Low priority:**\n";
		msg += lowGaps.map(g => `- ${g.title}: ${g.description}`).join("\n");
		msg += "\n\n";
	}

	return msg;
}

/**
 * Message prompting doc generation.
 */
export function generatePrompt(hasGaps: boolean): string {
	if (hasGaps) {
		return (
			"Based on the gap analysis, I can generate documentation to fill these gaps. " +
			"I'll analyze your code and create articles covering the missing areas.\n\n" +
			"Would you like me to generate documentation?"
		);
	}
	return (
		"I can analyze your codebase and generate documentation articles. " +
		"I'll look at your code structure, APIs, and logic to create helpful docs.\n\n" +
		"Would you like me to generate documentation from your code?"
	);
}

/**
 * Message after generation completes.
 */
export function generateComplete(articleCount: number): string {
	return (
		`Generated **${articleCount}** documentation articles from your code!\n\n` +
		"You can review and edit these articles in the Articles section."
	);
}

/**
 * Message explaining auto-sync.
 */
export function syncExplanation(): string {
	return (
		"Almost done! Let's verify that auto-sync is working.\n\n" +
		"Jolli automatically updates your documentation when you push changes to GitHub. " +
		"To test this, try making a small edit to any markdown file in your repository and push it.\n\n" +
		"Would you like to test auto-sync now, or skip this step?"
	);
}

/**
 * Message while waiting for sync.
 */
export function syncWaiting(): string {
	return (
		"I'm watching for changes... Push an edit to a markdown file in your connected repository, " +
		'and I\'ll detect the sync automatically. Say "check" when you\'ve pushed a change, or "skip" to finish up.'
	);
}

/**
 * Message when sync check shows no sync yet.
 */
export function syncNotDetected(): string {
	return (
		"No sync detected yet. This could mean:\n" +
		"- The changes haven't been pushed yet\n" +
		"- The webhook hasn't fired yet (usually takes a few seconds)\n\n" +
		'Try pushing a change to a markdown file and say "check" again, or "skip" to finish.'
	);
}

/**
 * Message when sync is detected. Keeps the conversation open for further questions.
 */
export function syncDetected(): string {
	return (
		"Sync detected! Auto-sync is working correctly. Changes you push to GitHub will automatically update your documentation.\n\n" +
		"Feel free to ask me any questions about Jolli, or say **done** when you're ready to finish."
	);
}

/**
 * Final completion summary.
 */
export function completionSummary(stepData: OnboardingStepData): string {
	const importedCount = stepData.importedArticles?.length ?? 0;
	const generatedCount = stepData.generatedArticles?.length ?? 0;
	const hasGitHub = Boolean(stepData.connectedIntegration);
	const hasSyncVerified = Boolean(stepData.syncTriggered);

	let msg = "Onboarding complete! Here's what we accomplished:\n\n";
	msg += `- **GitHub**: ${hasGitHub ? `Connected (${stepData.connectedRepo})` : "Not connected"}\n`;

	if (importedCount > 0) {
		msg += `- **Imported**: ${importedCount} documentation articles\n`;
	}
	if (generatedCount > 0) {
		msg += `- **Generated**: ${generatedCount} documentation articles\n`;
	}
	if (hasSyncVerified) {
		msg += "- **Auto-Sync**: Verified and working\n";
	}

	msg +=
		"\nYou're all set! Explore your documentation in the **Articles** section, " +
		"or create a **Doc Site** to publish your docs.";

	return msg;
}

/**
 * Contextual status message showing what has been set up so far.
 */
export function statusMessage(currentStep: string, stepData: OnboardingStepData): string {
	const parts: Array<string> = ["Here's your current onboarding status:\n"];

	// GitHub connection status
	if (stepData.connectedIntegration && stepData.connectedRepo) {
		parts.push(`- **GitHub**: Connected to **${stepData.connectedRepo}**`);
	} else if (stepData.connectedInstallationId) {
		parts.push("- **GitHub**: App installed, no repository connected yet");
	} else {
		parts.push("- **GitHub**: Not connected");
	}

	// Space
	if (stepData.spaceName) {
		parts.push(`- **Space**: "${stepData.spaceName}"`);
	}

	// Discovered files
	const discovered = stepData.discoveredFiles ?? [];
	if (discovered.length > 0) {
		parts.push(`- **Scanned files**: ${discovered.length} markdown files found`);
	}

	// Doc action
	if (stepData.docAction) {
		parts.push(`- **Chosen action**: ${stepData.docAction}`);
	}

	// Imported articles
	const imported = stepData.importedArticles ?? [];
	if (imported.length > 0) {
		parts.push(`- **Imported**: ${imported.length} articles`);
	}

	// Generated articles
	const generated = stepData.generatedArticles ?? [];
	if (generated.length > 0) {
		parts.push(`- **Generated**: ${generated.length} articles`);
	}

	// Gap analysis
	const gaps = stepData.gapAnalysisResults ?? [];
	if (gaps.length > 0) {
		parts.push(`- **Gap analysis**: ${gaps.length} gaps found`);
	}

	// Sync
	if (stepData.syncTriggered) {
		parts.push("- **Auto-sync**: Verified and working");
	}

	// Current step hint
	const stepDescriptions: Record<string, string> = {
		WELCOME: "getting started",
		GITHUB_CHECK: "checking GitHub connection",
		GITHUB_INSTALL_PROMPT: "installing the GitHub App",
		GITHUB_INSTALLING: "waiting for GitHub App installation",
		GITHUB_REPO_PROMPT: "selecting a repository",
		GITHUB_REPO_SELECTING: "waiting for repository selection",
		REPO_SCAN_PROMPT: "ready to scan repository",
		DOC_ACTION_PROMPT: "choosing import/generate action",
		GAP_ANALYSIS_PROMPT: "ready for gap analysis",
		GENERATE_PROMPT: "ready for doc generation",
		SYNC_EXPLAIN: "ready to test auto-sync",
		SYNC_WAITING: "waiting for sync event",
		SYNC_CONFIRMED: "sync verified - ask questions or say done",
	};

	const stepDesc = stepDescriptions[currentStep];
	if (stepDesc) {
		parts.push(`\n**Current step**: ${stepDesc}`);
	}

	return parts.join("\n");
}

/**
 * Message when user wants to change their GitHub connection.
 */
export function changeGithubMessage(): string {
	return "No problem! Let me check your GitHub connection again so you can make changes.";
}

/**
 * Message when user wants to re-import articles.
 */
export function reimportMessage(): string {
	return "Sure! Let me re-scan your repository and import the documentation again.";
}

/**
 * Polite redirect for off-topic messages.
 */
export function offTopicRedirect(currentStep: string): string {
	const stepDescriptions: Record<string, string> = {
		WELCOME: "getting started with setup",
		GITHUB_CHECK: "connecting GitHub",
		GITHUB_INSTALL_PROMPT: "installing the GitHub App",
		GITHUB_INSTALLING: "completing the GitHub App installation",
		GITHUB_REPO_PROMPT: "selecting a repository",
		GITHUB_REPO_SELECTING: "completing repository selection",
		REPO_SCAN_PROMPT: "scanning your repository",
		REPO_SCANNING: "scanning for documentation files",
		DOC_ACTION_PROMPT: "choosing what to do with your docs",
		SPACE_CREATING: "setting up your documentation space",
		IMPORTING: "importing your documentation",
		GAP_ANALYSIS_PROMPT: "analyzing documentation gaps",
		GAP_ANALYZING: "running gap analysis",
		GENERATE_PROMPT: "generating documentation",
		GENERATING: "generating documentation from code",
		SYNC_EXPLAIN: "testing auto-sync",
		SYNC_WAITING: "waiting for a sync event",
		SYNC_CHECKING: "checking sync status",
		SYNC_CONFIRMED: "wrapping up",
		COMPLETING: "completing setup",
	};

	const description = stepDescriptions[currentStep] ?? "completing setup";
	return (
		`That's a great question! I'd be happy to help with that after we finish setup. ` +
		`Right now, let's focus on ${description}.`
	);
}

/**
 * Help message for the current step.
 */
export function helpMessage(currentStep: string): string {
	const helpMessages: Record<string, string> = {
		WELCOME:
			"I'm here to help you set up Jolli in 3 steps: connect GitHub, import/generate docs, and test auto-sync. " +
			'Say "yes" to get started, or "skip" if you want to explore on your own.',
		GITHUB_INSTALL_PROMPT:
			"The GitHub App lets Jolli read your repositories to import documentation. " +
			'It\'s safe and you can revoke access anytime. Say "yes" to install, or "skip" to move on.',
		GITHUB_REPO_PROMPT:
			'Select the repository you want to use for documentation. Say "yes" to open the selection dialog.',
		REPO_SCAN_PROMPT:
			"Scanning will look through your repository for .md and .mdx files that could be imported as documentation articles.",
		DOC_ACTION_PROMPT:
			"You have three options:\n" +
			'- **Import**: Bring your existing markdown files into Jolli\n- **Generate**: Create new docs from your code\n- **Both**: Do both import and generation\n\nJust say "import", "generate", or "both".',
		GAP_ANALYSIS_PROMPT:
			"Gap analysis compares your code with existing documentation to find areas that need documentation. " +
			'It helps prioritize what to document. Say "yes" to run it, or "skip".\n\n' +
			'You can also say "change repo" to switch repositories, or "import again" to re-import.',
		GENERATE_PROMPT:
			"Document generation analyzes your code and creates documentation articles. " +
			'Say "yes" to start, or "skip".\n\n' +
			'You can also say "change repo" to switch repositories, or "import again" to re-import.',
		SYNC_EXPLAIN:
			"Auto-sync means when you push changes to a markdown file in GitHub, Jolli automatically updates the corresponding article. " +
			'Push a change and say "check" to verify it works.\n\n' +
			'You can also say "change repo" to switch repositories, or "import again" to re-import.',
		SYNC_WAITING:
			'Push a change to any markdown file in your connected repository. When done, say "check" and I\'ll verify the sync worked.\n\n' +
			'You can also say "change repo" to switch repositories, or "import again" to re-import.',
		SYNC_CONFIRMED:
			"Auto-sync is verified and working! You can ask me anything about Jolli — for example:\n" +
			"- How to create a Doc Site\n" +
			"- How to organize articles into spaces\n" +
			"- How auto-sync keeps docs up to date\n\n" +
			'When you\'re ready to finish, just say "done" or "bye".',
	};

	return (
		helpMessages[currentStep] ?? "I'm here to help you complete the onboarding setup. What would you like to know?"
	);
}
