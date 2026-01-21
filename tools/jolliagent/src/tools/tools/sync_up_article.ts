import type { ToolDef } from "../../Types";

/**
 * Tool definition for sync_up_article.
 * This tool reads a file from the E2B sandbox and syncs it to the article database.
 *
 * Note: This tool is only available in the run-jolliscript workflow via additionalTools.
 * The actual execution happens in KnowledgeGraphJobs.ts which has access to both
 * the E2B sandbox (via runState) and the DocDao.
 */
export const sync_up_article_tool_def: ToolDef = {
	name: "sync_up_article",
	description: [
		"Sync a markdown file from the sandbox to the article database.",
		"Reads the file content from the specified path in the sandbox and creates/updates an article.",
		"The article JRN follows the pattern /home/space-1/<name>.md",
		"Use this to persist generated documentation or articles to the database.",
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			sandboxPath: {
				type: "string",
				description: [
					"Path to the markdown file in the sandbox to sync.",
					"Examples: '/home/user/docs/api.md', './output/guide.md'",
				].join(" "),
			},
			articleName: {
				type: "string",
				description: [
					"Name for the article (without path or extension).",
					"Will be used to generate the JRN as /home/space-1/<articleName>.md",
					"Examples: 'api-overview', 'getting-started', 'architecture'",
				].join(" "),
			},
		},
		required: ["sandboxPath", "articleName"],
	},
};

// Note: There is no executor here because sync_up_article requires backend access (DocDao)
// The executor is implemented in backend/src/adapters/tools/SyncUpArticleTool.ts
