/**
 * Registry of seeded conversation definitions.
 * Maps AgentHubConvoKind to pre-created conversation templates.
 */

import type { AgentHubConvoKind, AgentHubMode, AgentPlanPhase } from "jolli-common";

/**
 * Definition of a seeded conversation template.
 */
export interface SeededConversationDefinition {
	readonly kind: AgentHubConvoKind;
	readonly title: string;
	readonly introMessage: string;
	readonly plan: string;
	readonly planPhase: AgentPlanPhase;
	/** Default mode for this seeded conversation kind. Defaults to "plan" if omitted. */
	readonly defaultMode?: AgentHubMode;
	readonly systemPromptAddendum?: string;
	/** Per-turn instructions appended to the plan reminder on every turn for this convo kind. */
	readonly turnReminder?: string;
	/** Synthetic LLM trigger for auto-advance. If absent, auto-advance is disabled for this kind. */
	readonly autoAdvancePrompt?: string;
}

const GETTING_STARTED_PLAN = `# Getting Started with Jolli

Help the new user set up their documentation workspace. Gather all needed information before executing.

## Step 1: Connect GitHub Repository
- [ ] Use \`check_github_status\` to see if GitHub is already connected
- [ ] If not connected, ask the user for their GitHub repository URL
- [ ] Use \`connect_github_repo\` to connect the repository
- [ ] If the GitHub App needs to be installed, share the installation URL with the user and wait for them to complete it, then retry

## Step 2: Select a Repository
- [ ] Use \`list_github_repos\` to show available repositories
- [ ] Ask the user which repository contains their documentation
- [ ] Confirm the selection

## Step 3: Scan for Documentation
- [ ] Use \`scan_repo_docs\` to find markdown files in the selected repo
- [ ] Present the results to the user

## Step 4: Create a Documentation Space
- [ ] Use \`get_or_create_space\` to create a space for the documentation
- [ ] Name it after the repository or let the user choose a name

## Step 5: Import Documentation
- [ ] Ask the user which files they'd like to import (or suggest importing all)
- [ ] Use \`import_repo_docs\` to import the selected files as Articles

## Step 6: Review & Next Steps
- [ ] Summarize what was imported
- [ ] Offer to navigate the user to their new documentation space
- [ ] Explain auto-sync: changes pushed to GitHub will automatically update their docs`;

const GETTING_STARTED_INTRO = `Welcome to Jolli! I'm here to help you set up your documentation workspace.

I've prepared a plan to get you started -- you can see it in the Plan panel. Here's what we'll do:

1. **Connect your GitHub repository** -- just share the URL and I'll set it up
2. **Select a repository** that contains your documentation
3. **Scan for markdown files** in that repository
4. **Create a documentation space** to organize your docs
5. **Import your files** as Jolli Articles

Let me check your current setup...`;

const GETTING_STARTED_SYSTEM_ADDENDUM = `You are guiding a new user through their first documentation setup in Jolli. Be encouraging, explain concepts clearly, and help them connect GitHub, select a repository, scan for documentation files, and import them. If they don't have GitHub connected yet, ask for their repository URL and use the connect_github_repo tool to connect it. If the GitHub App is not installed, share the installation URL with the user. Keep your responses concise and action-oriented.

## Proactive Behavior

You MUST proactively gather information before responding to the user. On each turn, follow this sequence:

1. **Gather state first**: Run all applicable read-only tools to assess the current state (e.g., check_github_status, list_github_repos, scan_repo_docs). Do NOT ask the user questions you could answer by running a tool.
2. **Update the plan with findings**: After receiving tool results, call \`update_plan\` to reflect what you discovered — check off completed steps, add details, note blockers. The plan should always reflect reality.
3. **Advance as far as possible**: If tool results unlock the next step (e.g., GitHub is connected → list repos → scan docs), keep going. Chain tool calls to advance through multiple plan steps in a single turn.
4. **Only then respond to the user**: Present your findings concisely. Ask only the next decision that genuinely requires user input (e.g., which repo to select, or confirmation to proceed with a write action).`;

const GETTING_STARTED_TURN_REMINDER =
	"[Be proactive: run applicable read-only tools to gather current state, then call update_plan to reflect your findings before responding. Only ask the user questions you cannot answer with tools.]";

const GETTING_STARTED_AUTO_ADVANCE_PROMPT =
	"[The user just opened this conversation. Proactively run read-only tools to assess the current state (e.g., check_github_status, list_github_repos). After getting results, call update_plan to reflect your findings (check off completed steps, add details). Continue advancing through the plan until you need user input. Then present your findings and ask only the first question that requires the user's decision.]";

/**
 * Registry of all seeded conversation definitions.
 */
const SEEDED_CONVERSATIONS: ReadonlyMap<AgentHubConvoKind, SeededConversationDefinition> = new Map([
	[
		"getting_started",
		{
			kind: "getting_started",
			title: "Getting Started with Jolli",
			introMessage: GETTING_STARTED_INTRO,
			plan: GETTING_STARTED_PLAN,
			planPhase: "planning" as const,
			defaultMode: "plan",
			systemPromptAddendum: GETTING_STARTED_SYSTEM_ADDENDUM,
			turnReminder: GETTING_STARTED_TURN_REMINDER,
			autoAdvancePrompt: GETTING_STARTED_AUTO_ADVANCE_PROMPT,
		},
	],
]);

/**
 * Looks up a seeded conversation definition by kind.
 * Returns undefined if the kind is not registered.
 */
export function getSeededConversationDefinition(kind: AgentHubConvoKind): SeededConversationDefinition | undefined {
	return SEEDED_CONVERSATIONS.get(kind);
}

/**
 * Returns all registered seeded conversation kinds.
 */
export function getSeededConversationKinds(): ReadonlyArray<AgentHubConvoKind> {
	return [...SEEDED_CONVERSATIONS.keys()];
}
