/**
 * ImportMarkdown Tool - Imports a markdown file from GitHub as a Jolli article.
 *
 * Features smart update detection:
 * - If an article with the same source path exists and content is identical: reports "already up to date"
 * - If an article with the same source path exists and content differs: creates a draft with section changes for review
 * - If no matching article exists: creates a new article (original behavior)
 */

import type { Doc } from "../../model/Doc";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { OnboardingTool, OnboardingToolContext, OnboardingToolExecutionResult } from "../types";
import { contentMatches, createSectionChangesFromImport } from "./SectionDiffHelper";
import {
	extractTitleFromContent,
	fetchFileContent,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
} from "./ToolUtils";
import { jrnParser } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * File data fetched from GitHub.
 */
interface FileData {
	content: string;
	sha: string;
}

/**
 * Repository info for import operations.
 */
interface RepoInfo {
	accessToken: string;
	owner: string;
	repo: string;
	branch: string;
	integrationId?: number;
}

/**
 * Gets repository info from integration or connected repo.
 */
async function getRepoInfo(context: OnboardingToolContext): Promise<RepoInfo | { error: string }> {
	const githubIntegration = await getActiveGithubIntegration(context);
	const connectedRepo = context.stepData.connectedRepo;

	if (githubIntegration) {
		const metadata = githubIntegration.metadata;
		const [owner, repo] = metadata.repo.split("/");
		const branch = metadata.branch || "main";
		const accessToken = await getAccessTokenForIntegration(metadata);
		if (!accessToken) {
			return { error: "Could not get access to the repository. Please reconnect GitHub." };
		}
		return { accessToken, owner, repo, branch, integrationId: githubIntegration.id };
	}

	if (connectedRepo) {
		const [owner, repo] = connectedRepo.split("/");
		const installations = await context.githubInstallationDao.listInstallations();
		const matchingInstallation = installations.find(
			inst => inst.name.toLowerCase() === owner.toLowerCase() && inst.installationId,
		);

		if (matchingInstallation?.installationId) {
			const app = getCoreJolliGithubApp();
			if (app && app.appId > 0) {
				const accessToken = await getAccessTokenForGitHubAppInstallation(
					app,
					matchingInstallation.installationId,
				);
				if (accessToken) {
					return { accessToken, owner, repo, branch: "main" };
				}
			}
		}
		return { error: "Could not get access to the repository. Please reconnect GitHub." };
	}

	return { error: "No GitHub integration connected. Please use connect_github first." };
}

/**
 * Handles updating an existing article with changed content.
 * Creates a draft with section-by-section changes for review.
 */
async function handleArticleUpdate(
	existingDoc: Doc,
	fileData: FileData,
	filePath: string,
	context: OnboardingToolContext,
): Promise<OnboardingToolExecutionResult> {
	const title = (existingDoc.contentMetadata as { title?: string })?.title ?? "Untitled";

	// Get or create a draft for this article
	let draft = await context.docDraftDao.findDraftByDocId(existingDoc.id);
	if (!draft) {
		// Create a new draft for this article
		draft = await context.docDraftDao.createDocDraft({
			docId: existingDoc.id,
			title,
			content: existingDoc.content,
			contentType: existingDoc.contentType || "text/markdown",
			createdBy: context.userId,
			contentLastEditedAt: new Date(),
			contentLastEditedBy: context.userId,
			contentMetadata: existingDoc.contentMetadata,
			isShared: false,
			sharedAt: null,
			sharedBy: null,
			createdByAgent: true,
		});
	}

	// Generate section-by-section changes
	const diffResult = await createSectionChangesFromImport(
		draft.id,
		existingDoc.id,
		existingDoc.content,
		fileData.content,
		context.docDraftSectionChangesDao,
	);

	log.info(
		"Created %d section changes for article %s from import of %s",
		diffResult.changeCount,
		existingDoc.jrn,
		filePath,
	);

	return {
		success: true,
		content:
			`Found existing article "${title}" that was previously imported from this file.\n\n` +
			`Changes detected: ${diffResult.summary}\n\n` +
			`Opening the article for you to review the suggested changes. You can accept or dismiss each change individually.`,
		uiAction: {
			type: "review_import_changes",
			draftId: draft.id,
			articleJrn: existingDoc.jrn,
			title,
			filePath,
			message: `Review ${diffResult.changeCount} changes to "${title}"`,
		},
	};
}

/**
 * Handles creating a new article (original import behavior).
 */
async function handleNewArticle(
	fileData: FileData,
	filePath: string,
	repoInfo: RepoInfo,
	context: OnboardingToolContext,
): Promise<OnboardingToolExecutionResult> {
	const { owner, repo, branch, integrationId } = repoInfo;

	// Extract title from content
	const title = extractTitleFromContent(fileData.content);
	const slug = generateSlug(title);

	// Use space from stepData (set by get_or_create_space tool), or fall back to default space
	let spaceId: number;
	let spaceName: string | undefined;

	if (context.stepData.spaceId) {
		spaceId = context.stepData.spaceId;
		spaceName = context.stepData.spaceName;
		log.debug("Using space from stepData: id=%d name=%s", spaceId, spaceName);
	} else {
		let space = await context.spaceDao.getDefaultSpace();
		if (!space) {
			space = await context.spaceDao.createDefaultSpaceIfNeeded(context.userId);
		}
		if (!space) {
			return {
				success: false,
				content: "Could not get or create a space for the import.",
			};
		}
		spaceId = space.id;
		spaceName = space.name;
		log.debug("Using default space: id=%d name=%s", spaceId, spaceName);
	}

	// Normalize the file path before storing (remove leading "./" and trim)
	const normalizedPath = filePath.replace(/^\.\//, "").trim();

	// Build source info if we have an integration
	const sourceInfo = integrationId
		? {
				source: { integrationId, type: "github" as const },
				sourceMetadata: {
					filename: normalizedPath.split("/").pop() || normalizedPath,
					path: normalizedPath,
					branch,
					sha: fileData.sha,
					importedAt: new Date().toISOString(),
				},
			}
		: {
				source: undefined,
				sourceMetadata: undefined,
			};

	// Create the document
	const doc = await context.docDao.createDoc({
		updatedBy: "onboarding",
		content: fileData.content,
		contentType: "text/markdown",
		contentMetadata: {
			title,
			sourceName: `${owner}/${repo}`,
			sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${normalizedPath}`,
			isSourceDoc: true,
		},
		docType: "document",
		spaceId,
		parentId: undefined,
		createdBy: "onboarding",
		source: sourceInfo.source,
		sourceMetadata: sourceInfo.sourceMetadata,
	});

	// Get the JRN for the created doc
	const docJrn = doc.jrn || jrnParser.document(slug);

	// Update imported articles list
	const currentImported = context.stepData.importedArticles || [];
	await context.updateStepData({
		importedArticles: [...currentImported, docJrn],
		spaceId,
	});

	await context.advanceStep("import_docs");

	// Generate a job ID for this import
	const jobId = `import-${Date.now()}`;

	return {
		success: true,
		content:
			`Successfully imported "${title}" from ${filePath}.\n\n` +
			`Article JRN: ${docJrn}\n` +
			`Space: ${spaceName || "Default Space"}\n\n` +
			`The article is now linked to the source file and will be updated when the file changes.`,
		uiAction: {
			type: "import_completed",
			jobId,
			filePath,
			title,
			message: `Imported "${title}"`,
		},
	};
}

export const importMarkdownTool: OnboardingTool = {
	definition: {
		name: "import_markdown",
		description:
			"Import a markdown file from GitHub as a Jolli article. " +
			"If the file was previously imported, detects changes and creates suggestions for review. " +
			"The article will be linked to the source file for future updates.",
		parameters: {
			type: "object",
			properties: {
				file_path: {
					type: "string",
					description: "Path to the markdown file in the repository (e.g., 'docs/getting-started.md')",
				},
			},
			required: ["file_path"],
		},
	},
	handler: async (args, context) => {
		const filePath = args.file_path as string;

		try {
			// Get repository info
			const repoInfoResult = await getRepoInfo(context);
			if ("error" in repoInfoResult) {
				return { success: false, content: repoInfoResult.error };
			}
			const repoInfo = repoInfoResult;

			// Fetch file content from GitHub
			const fileData = await fetchFileContent(
				repoInfo.accessToken,
				repoInfo.owner,
				repoInfo.repo,
				filePath,
				repoInfo.branch,
			);
			if (!fileData) {
				return {
					success: false,
					content: `Could not fetch file ${filePath}. Make sure the file exists and is accessible.`,
				};
			}

			// Check if article with same source path already exists
			const hasRealDao = typeof context.docDao?.findDocBySourcePathAnySpace === "function";
			log.info(
				"ImportMarkdownTool: Checking for existing doc with path='%s', hasRealDao=%s",
				filePath,
				hasRealDao,
			);
			const existingDoc = await context.docDao.findDocBySourcePathAnySpace(filePath, repoInfo.integrationId);
			log.info(
				"ImportMarkdownTool: Lookup result for path='%s': %s",
				filePath,
				existingDoc ? `found doc id=${existingDoc.id} jrn=${existingDoc.jrn}` : "not found",
			);

			if (existingDoc) {
				// Article exists - check if content changed
				if (contentMatches(existingDoc.content, fileData.content)) {
					const title = (existingDoc.contentMetadata as { title?: string })?.title ?? "Untitled";
					return {
						success: true,
						content:
							`"${title}" is already up to date. No changes needed.\n\n` +
							`The article was previously imported from ${filePath} and the content is identical.`,
					};
				}

				// Content differs - create draft with section changes for review
				return await handleArticleUpdate(existingDoc, fileData, filePath, context);
			}

			// Article doesn't exist - create new (original behavior)
			return await handleNewArticle(fileData, filePath, repoInfo, context);
		} catch (error) {
			log.error(error, "Error in import_markdown tool");
			const jobId = `import-${Date.now()}`;
			return {
				success: false,
				content: `Failed to import file: ${error instanceof Error ? error.message : "Unknown error"}`,
				uiAction: {
					type: "import_failed",
					jobId,
					filePath,
					message: `Failed to import ${filePath}`,
				},
			};
		}
	},
};
