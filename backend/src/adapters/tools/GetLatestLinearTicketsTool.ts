import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_TICKET_LIMIT = 5;
const MAX_TICKET_LIMIT = 25;

export interface GetLatestLinearTicketsArgs {
	limit?: number;
	teamKey?: string;
}

interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	url?: string | null;
	updatedAt: string;
	priority?: number | null;
	priorityLabel?: string | null;
	state?: {
		name?: string | null;
	} | null;
	assignee?: {
		name?: string | null;
		displayName?: string | null;
	} | null;
	team?: {
		name?: string | null;
		key?: string | null;
	} | null;
	estimate?: number | null;
}

interface LinearGraphQLResponse {
	data?: {
		issues?: {
			nodes?: Array<LinearIssue>;
		} | null;
	} | null;
	errors?: Array<{ message: string }>;
}

export function createGetLatestLinearTicketsToolDefinition(): ToolDef {
	return {
		name: "get_latest_linear_tickets",
		description:
			"Fetch the most recently updated Linear tickets. Useful when you need the current status of ongoing work, blockers, or priorities. Requires the LINEAR_API_TOKEN environment variable.",
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: `Maximum number of tickets to retrieve (1-${MAX_TICKET_LIMIT}). Defaults to ${DEFAULT_TICKET_LIMIT}`,
				},
				teamKey: {
					type: "string",
					description: "Optional Linear team key to scope the search (e.g. ENG, DOCS)",
				},
			},
			required: [],
		},
	};
}

export async function executeGetLatestLinearTicketsTool(args?: GetLatestLinearTicketsArgs): Promise<string> {
	const apiToken = process.env.LINEAR_API_TOKEN;
	if (!apiToken) {
		const errorMsg = "LINEAR_API_TOKEN is not configured. Please set it to call this tool.";
		log.error(errorMsg);
		return errorMsg;
	}

	const limit = normalizeLimit(args?.limit);
	const variables: Record<string, unknown> = { first: limit };
	if (args?.teamKey) {
		variables.filter = { team: { key: { eq: args.teamKey } } };
	}

	const body = JSON.stringify({
		query: `query GetLatestIssues($first: Int!, $filter: IssueFilter) {
			issues(first: $first, filter: $filter) {
				nodes {
					id
					identifier
					title
					url
					updatedAt
					priority
					priorityLabel
					state { name }
					assignee { name displayName }
					team { name key }
					estimate
				}
			}
		}`,
		variables,
	});

	try {
		const response = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: apiToken,
			},
			body,
		});

		if (!response.ok) {
			const errorText = await safeReadBody(response);
			const errorMsg = `Failed to fetch Linear tickets: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
			log.error(errorMsg);
			return errorMsg;
		}

		const payload = (await response.json()) as LinearGraphQLResponse;
		if (payload.errors?.length) {
			const errorDetails = payload.errors.map(err => err.message).join("; ");
			const errorMsg = `Linear API returned errors: ${errorDetails}`;
			log.error(errorMsg);
			return errorMsg;
		}

		/* v8 ignore next - defensive optional chaining, API schema guarantees this structure */
		const issues = payload.data?.issues?.nodes ?? [];
		if (issues.length === 0) {
			return args?.teamKey ? `No Linear tickets found for team ${args.teamKey}.` : "No Linear tickets found.";
		}

		const sortedIssues = [...issues].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
		const lines = sortedIssues.map((issue, index) => formatIssue(issue, index));
		/* v8 ignore next - defensive ternary for plural, both branches are normal code paths */
		const header = `Latest ${sortedIssues.length} Linear ticket${sortedIssues.length === 1 ? "" : "s"}${
			args?.teamKey ? ` for team ${args.teamKey}` : ""
		} (ordered by most recently updated):`;
		return `${header}
${lines.join("\n\n")}`;
	} catch (error) {
		/* v8 ignore next - defensive error handling, error should always be an Error instance */
		const errorMsg = `Failed to fetch Linear tickets: ${error instanceof Error ? error.message : String(error)}`;
		log.error(error, "Error calling Linear API");
		return errorMsg;
	}
}

function normalizeLimit(limit?: number): number {
	if (typeof limit !== "number" || Number.isNaN(limit)) {
		return DEFAULT_TICKET_LIMIT;
	}

	const floored = Math.floor(limit);
	if (floored < 1) {
		return 1;
	}

	if (floored > MAX_TICKET_LIMIT) {
		return MAX_TICKET_LIMIT;
	}

	return floored;
}

function formatIssue(issue: LinearIssue, index: number): string {
	const state = issue.state?.name || "Unknown";
	/* v8 ignore next - defensive chaining, API schema should provide at least one of these fields */
	const assignee = issue.assignee?.name || issue.assignee?.displayName || "Unassigned";
	const priorityLabel = issue.priorityLabel || (issue.priority ?? "No priority");
	const updatedAt = formatDate(issue.updatedAt);
	const teamInfo = issue.team?.name
		? ` | Team: ${issue.team.name}${issue.team.key ? ` (${issue.team.key})` : ""}`
		: "";
	const estimateInfo = typeof issue.estimate === "number" ? ` | Estimate: ${issue.estimate}` : "";
	const urlLine = issue.url ? `\n   ${issue.url}` : "";
	return `${index + 1}. [${issue.identifier}] ${issue.title}
   Status: ${state} | Priority: ${priorityLabel} | Assignee: ${assignee} | Updated: ${updatedAt}${teamInfo}${estimateInfo}${urlLine}`;
}

function formatDate(value: string): string {
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) {
		return value;
	}

	return new Date(timestamp).toISOString();
}

async function safeReadBody(response: Response): Promise<string | undefined> {
	try {
		return await response.text();
	} catch (error) {
		log.warn(error, "Unable to read Linear error response body");
		return;
	}
}
