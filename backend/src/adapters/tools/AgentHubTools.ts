/**
 * Agent Hub tool definitions and executors (aggregator).
 * Re-exports individual tool definitions and executors, and provides
 * the dispatcher used by AgentConvoRouter.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DaoProvider } from "../../dao/DaoProvider";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { SourceDao } from "../../dao/SourceDao";
import type { SpaceDao } from "../../dao/SpaceDao";
import type { IntegrationsManager } from "../../integrations/IntegrationsManager";
import type { PermissionService } from "../../services/PermissionService";
import { getLog } from "../../util/Logger";
import { createCheckGitHubStatusToolDefinition, executeCheckGitHubStatusTool } from "./CheckGitHubStatusTool";
import { createCheckPermissionsToolDefinition, executeCheckPermissionsTool } from "./CheckPermissionsTool";
import {
	connectGitHubRepoArgsSchema,
	createConnectGitHubRepoToolDefinition,
	executeConnectGitHubRepoTool,
} from "./ConnectGitHubRepoTool";
import {
	createArticleDraftArgsSchema,
	createCreateArticleDraftToolDefinition,
	executeCreateArticleDraftTool,
} from "./CreateArticleDraftTool";
import { createCreateFolderToolDefinition, createFolderArgsSchema, executeCreateFolderTool } from "./CreateFolderTool";
import {
	createFindRelevantArticlesToolDefinition,
	executeFindRelevantArticlesTool,
	findRelevantArticlesArgsSchema,
} from "./FindRelevantArticlesTool";
import {
	createFindRelevantSpacesToolDefinition,
	executeFindRelevantSpacesTool,
	findRelevantSpacesArgsSchema,
} from "./FindRelevantSpacesTool";
import {
	createGetOrCreateSpaceToolDefinition,
	executeGetOrCreateSpaceTool,
	getOrCreateSpaceArgsSchema,
} from "./GetOrCreateSpaceTool";
import {
	createImportRepoDocsToolDefinition,
	executeImportRepoDocsTool,
	importRepoDocsArgsSchema,
} from "./ImportRepoDocsTool";
import {
	createListFolderContentsToolDefinition,
	executeListFolderContentsTool,
	listFolderContentsArgsSchema,
} from "./ListFolderContentsTool";
import { createListGitHubReposToolDefinition, executeListGitHubReposTool } from "./ListGitHubReposTool";
import { createListSpacesToolDefinition, executeListSpacesTool } from "./ListSpacesTool";
import { createNavigateUserToolDefinition, executeNavigateUserTool, navigateUserArgsSchema } from "./NavigateUserTool";
import { createScanRepoDocsToolDefinition, executeScanRepoDocsTool, scanRepoDocsArgsSchema } from "./ScanRepoDocsTool";
import {
	createSearchArticlesToolDefinition,
	executeSearchArticlesTool,
	searchArticlesArgsSchema,
} from "./SearchArticlesTool";
import { createUpdatePlanToolDefinition, updatePlanArgsSchema } from "./UpdatePlanTool";
import { createWebSearchToolDefinition, executeWebSearchTool, webSearchArgsSchema } from "./WebSearchTool";
import type { z } from "zod";

const log = getLog(import.meta);

/**
 * Dependencies required by agent hub tool executors.
 */
export interface AgentHubToolDeps {
	readonly spaceDaoProvider: DaoProvider<SpaceDao>;
	readonly docDaoProvider: DaoProvider<DocDao>;
	readonly docDraftDaoProvider: DaoProvider<DocDraftDao>;
	readonly sourceDaoProvider: DaoProvider<SourceDao>;
	readonly integrationDaoProvider: DaoProvider<IntegrationDao>;
	readonly permissionService: PermissionService;
	readonly integrationsManager?: IntegrationsManager;
}

/**
 * Result from the navigate_user tool, flagged for SSE emission.
 */
export interface NavigationActionResult {
	readonly __navigationAction: true;
	readonly path: string;
	readonly label: string;
}

/**
 * Checks if a tool result contains a navigation action.
 */
export function isNavigationAction(value: unknown): value is NavigationActionResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"__navigationAction" in value &&
		(value as NavigationActionResult).__navigationAction
	);
}

// ─── Tool Names ──────────────────────────────────────────────────────────────

export const AGENT_HUB_TOOL_NAMES = [
	"list_spaces",
	"list_folder_contents",
	"search_articles",
	"find_relevant_articles",
	"find_relevant_spaces",
	"check_permissions",
	"check_github_status",
	"connect_github_repo",
	"list_github_repos",
	"scan_repo_docs",
	"import_repo_docs",
	"get_or_create_space",
	"create_folder",
	"create_article_draft",
	"navigate_user",
	"web_search",
	"update_plan",
] as const;

export type AgentHubToolName = (typeof AGENT_HUB_TOOL_NAMES)[number];

/**
 * Tools that perform mutations (create, navigate). These are gated behind plan approval
 * in plan mode, or require user confirmation in exec mode.
 */
export const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set<AgentHubToolName>([
	"connect_github_repo",
	"import_repo_docs",
	"get_or_create_space",
	"create_folder",
	"create_article_draft",
	"navigate_user",
]);

/**
 * Subset of mutation tools that are destructive (delete, overwrite).
 * In exec-accept-all mode, only these tools require user confirmation.
 * Currently empty — all existing mutation tools are create-only.
 */
export const DESTRUCTIVE_TOOL_NAMES: ReadonlySet<string> = new Set<AgentHubToolName>([]);

// ─── Aggregated Definitions ──────────────────────────────────────────────────

/**
 * Returns all agent hub tool definitions for the LLM.
 */
export function getAgentHubToolDefinitions(): Array<ToolDef> {
	return [
		createListSpacesToolDefinition(),
		createListFolderContentsToolDefinition(),
		createSearchArticlesToolDefinition(),
		createFindRelevantArticlesToolDefinition(),
		createFindRelevantSpacesToolDefinition(),
		createCheckPermissionsToolDefinition(),
		createCheckGitHubStatusToolDefinition(),
		createConnectGitHubRepoToolDefinition(),
		createListGitHubReposToolDefinition(),
		createScanRepoDocsToolDefinition(),
		createImportRepoDocsToolDefinition(),
		createGetOrCreateSpaceToolDefinition(),
		createCreateFolderToolDefinition(),
		createCreateArticleDraftToolDefinition(),
		createNavigateUserToolDefinition(),
		createWebSearchToolDefinition(),
		createUpdatePlanToolDefinition(),
	];
}

// ─── Argument Validation ─────────────────────────────────────────────────────

/**
 * Maps tool names to their Zod argument schemas.
 * Tools that accept no arguments are omitted.
 */
const TOOL_ARG_SCHEMAS: Partial<Record<AgentHubToolName, z.ZodSchema>> = {
	list_folder_contents: listFolderContentsArgsSchema,
	search_articles: searchArticlesArgsSchema,
	find_relevant_articles: findRelevantArticlesArgsSchema,
	find_relevant_spaces: findRelevantSpacesArgsSchema,
	connect_github_repo: connectGitHubRepoArgsSchema,
	scan_repo_docs: scanRepoDocsArgsSchema,
	import_repo_docs: importRepoDocsArgsSchema,
	get_or_create_space: getOrCreateSpaceArgsSchema,
	create_folder: createFolderArgsSchema,
	create_article_draft: createArticleDraftArgsSchema,
	navigate_user: navigateUserArgsSchema,
	web_search: webSearchArgsSchema,
	update_plan: updatePlanArgsSchema,
};

/**
 * Validates tool arguments against the registered Zod schema.
 * Returns parsed data on success, or a descriptive error string on failure.
 */
export function validateToolArgs(
	toolName: string,
	args: Record<string, unknown>,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
	const schema = TOOL_ARG_SCHEMAS[toolName as AgentHubToolName];
	if (!schema) {
		// No schema registered — tool has no args to validate
		return { success: true, data: args };
	}

	const result = schema.safeParse(args);
	if (result.success) {
		return { success: true, data: result.data as Record<string, unknown> };
	}

	const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
	return { success: false, error: `Invalid arguments for ${toolName}: ${issues}` };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Dispatches an agent hub tool call to the appropriate executor.
 */
export async function executeAgentHubTool(
	toolName: string,
	args: Record<string, unknown>,
	deps: AgentHubToolDeps,
	userId: number,
): Promise<string> {
	log.info("Executing agent hub tool: %s", toolName);

	const validation = validateToolArgs(toolName, args);
	if (!validation.success) {
		log.warn("Tool argument validation failed for %s: %s", toolName, validation.error);
		return validation.error;
	}
	const validatedArgs = validation.data;

	switch (toolName) {
		case "list_spaces":
			return await executeListSpacesTool(deps, userId);
		case "list_folder_contents":
			return await executeListFolderContentsTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof listFolderContentsArgsSchema>,
			);
		case "search_articles":
			return await executeSearchArticlesTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof searchArticlesArgsSchema>,
			);
		case "find_relevant_articles":
			return await executeFindRelevantArticlesTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof findRelevantArticlesArgsSchema>,
			);
		case "find_relevant_spaces":
			return await executeFindRelevantSpacesTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof findRelevantSpacesArgsSchema>,
			);
		case "check_permissions":
			return await executeCheckPermissionsTool(deps, userId);
		case "check_github_status":
			return await executeCheckGitHubStatusTool(deps);
		case "connect_github_repo":
			return await executeConnectGitHubRepoTool(
				deps,
				validatedArgs as z.infer<typeof connectGitHubRepoArgsSchema>,
			);
		case "list_github_repos":
			return await executeListGitHubReposTool(deps);
		case "scan_repo_docs":
			return await executeScanRepoDocsTool(deps, validatedArgs as z.infer<typeof scanRepoDocsArgsSchema>);
		case "import_repo_docs":
			return await executeImportRepoDocsTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof importRepoDocsArgsSchema>,
			);
		case "get_or_create_space":
			return await executeGetOrCreateSpaceTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof getOrCreateSpaceArgsSchema>,
			);
		case "create_folder":
			return await executeCreateFolderTool(deps, userId, validatedArgs as z.infer<typeof createFolderArgsSchema>);
		case "create_article_draft":
			return await executeCreateArticleDraftTool(
				deps,
				userId,
				validatedArgs as z.infer<typeof createArticleDraftArgsSchema>,
			);
		case "navigate_user":
			return executeNavigateUserTool(validatedArgs as z.infer<typeof navigateUserArgsSchema>);
		case "web_search":
			return await executeWebSearchTool(validatedArgs as z.infer<typeof webSearchArgsSchema>);
		default:
			return `Unknown tool: ${toolName}`;
	}
}
