import type { RunState, ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDao } from "../../dao/DocDao";
import { getLog } from "../../util/Logger";
import type { Sandbox } from "e2b";
import { type DocContentMetadata, jrnParser } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Creates a sync_up_article tool definition.
 * This tool syncs a file from the E2B sandbox to the article database.
 */
export function createSyncUpArticleToolDefinition(): ToolDef {
	return {
		name: "sync_up_article",
		description: [
			"Sync a markdown file from the sandbox to the article database.",
			"Reads the file content from the specified path in the sandbox and creates/updates an article.",
			"The article JRN follows the pattern jrn:prod:global:docs:file/<name>",
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
						"Will be used to generate the JRN as jrn:prod:global:docs:file/<articleName>",
						"Examples: 'api-overview', 'getting-started', 'architecture'",
					].join(" "),
				},
			},
			required: ["sandboxPath", "articleName"],
		},
	};
}

export interface SyncUpArticleArgs {
	sandboxPath: string;
	articleName: string;
}

/**
 * Determine the content type based on the file extension from the sandbox path.
 */
export function getContentTypeFromPath(sandboxPath: string): string {
	const lowerPath = sandboxPath.toLowerCase();

	if (lowerPath.endsWith(".json")) {
		return "application/vnd.oai.openapi+json";
	}
	if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) {
		return "application/vnd.oai.openapi";
	}

	// Default to markdown
	return "text/markdown";
}

/**
 * Generate a human-readable title from the article name.
 * Converts kebab-case or snake_case to Title Case.
 */
export function generateTitleFromArticleName(articleName: string): string {
	return articleName
		.replace(/\.(md|json|yaml|yml)$/i, "") // Remove extension if present
		.replace(/[-_]/g, " ") // Replace dashes and underscores with spaces
		.replace(/\s+/g, " ") // Collapse multiple spaces
		.trim()
		.split(" ")
		.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

/**
 * Sanitize an article name into a valid resource ID.
 * Removes path separators, extensions, and invalid characters.
 */
export function sanitizeResourceId(articleName: string): string {
	return articleName
		.replace(/[/\\]/g, "-") // Replace path separators with dashes
		.replace(/\.(md|json|yaml|yml)$/i, "") // Remove common extensions if present
		.replace(/[^a-zA-Z0-9._-]/g, "-") // Replace invalid chars with dashes
		.replace(/-+/g, "-") // Collapse multiple dashes
		.replace(/^-|-$/g, ""); // Remove leading/trailing dashes
}

/**
 * Generate the JRN for an article based on the article name and content type.
 * Uses the new JRN format: jrn:prod:global:docs:article/<resourceId>
 * Note: article() also normalizes (lowercase, spaces to hyphens)
 */
export function generateArticleJrn(articleName: string, _contentType: string): string {
	const resourceId = sanitizeResourceId(articleName);
	return jrnParser.article(resourceId);
}

/**
 * Read file content from E2B sandbox.
 * Returns the file content or throws an error.
 */
async function readFileFromSandbox(runState: RunState, sandboxPath: string): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox | undefined;
	if (!sandbox) {
		throw new Error("E2B sandbox not initialized. This tool requires an E2B sandbox.");
	}

	const proc = await sandbox.commands.run(`cat "${sandboxPath}"`);

	if (proc.error) {
		throw new Error(`Failed to read file: ${proc.error}`);
	}

	if (proc.exitCode !== 0) {
		const errorMsg = proc.stderr.trim() || "Failed to read file";
		throw new Error(`Failed to read file: ${errorMsg}`);
	}

	return proc.stdout;
}

/**
 * Executes the sync_up_article tool.
 * Reads a file from the E2B sandbox and saves it to the article database.
 *
 * @param args - Tool arguments (sandboxPath and articleName)
 * @param runState - The current run state (includes e2bsandbox)
 * @param docDao - DAO for article operations
 */
export async function executeSyncUpArticleTool(
	args: SyncUpArticleArgs,
	runState: RunState,
	docDao: DocDao,
): Promise<string> {
	const { sandboxPath, articleName } = args;

	if (!sandboxPath) {
		return "Error: sandboxPath parameter is required for sync_up_article";
	}

	if (!articleName) {
		return "Error: articleName parameter is required for sync_up_article";
	}

	// Determine content type from the sandbox file extension
	const contentType = getContentTypeFromPath(sandboxPath);
	const jrn = generateArticleJrn(articleName, contentType);
	log.info(
		"sync_up_article: sandboxPath=%s, articleName=%s, contentType=%s, jrn=%s",
		sandboxPath,
		articleName,
		contentType,
		jrn,
	);

	try {
		// Read the file from the sandbox
		const content = await readFileFromSandbox(runState, sandboxPath);
		log.debug("sync_up_article: read %d characters from sandbox", content.length);

		// Check if article already exists
		const existingArticle = await docDao.readDoc(jrn);

		if (existingArticle) {
			// Update existing article
			const updated = await docDao.updateDoc({
				...existingArticle,
				content,
				contentType,
				version: existingArticle.version + 1,
			});

			if (!updated) {
				const errorMsg = `Failed to update article ${jrn}`;
				log.error(errorMsg);
				return errorMsg;
			}

			log.info(
				"Updated existing article %s with %d characters (contentType=%s)",
				jrn,
				content.length,
				contentType,
			);
			return `Article "${articleName}" updated successfully at ${jrn} (${contentType})`;
		}

		// Create new article with title in contentMetadata
		const title = generateTitleFromArticleName(articleName);
		const contentMetadata: DocContentMetadata = {
			title,
			sourceName: "sync_up_article",
			lastUpdated: new Date().toISOString(),
		};

		// Generate slug from the article name using SlugUtils (supports Chinese)
		const articleNameWithoutExt = articleName.replace(/\.(md|json|yaml|yml)$/i, "");
		const slug = generateSlug(articleNameWithoutExt);

		const newArticle = await docDao.createDoc({
			jrn,
			slug,
			path: "",
			content,
			contentType,
			updatedBy: "system",
			source: undefined,
			sourceMetadata: undefined,
			contentMetadata,
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			createdBy: "system",
		});

		log.info(
			"Created new article %s (id=%d) with %d characters (contentType=%s)",
			jrn,
			newArticle.id,
			content.length,
			contentType,
		);
		return `Article "${articleName}" created successfully at ${jrn} (${contentType})`;
	} catch (error) {
		const err = error as Error;
		log.error(err, "sync_up_article failed");
		return `Error syncing article: ${err.message}`;
	}
}
