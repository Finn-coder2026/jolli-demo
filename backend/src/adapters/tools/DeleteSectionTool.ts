import { parseSections, type Section } from "../../../../tools/jolliagent/src/jolliscript/parser";
import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import type { UserDao } from "../../dao/UserDao";
import type { DocDraft } from "../../model/DocDraft";
import { createSectionPathService, type SectionIdMapping, type SectionWithId } from "../../services/SectionPathService";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

/**
 * Looks up article owner by ID, handling both numeric user IDs and emails
 */
async function lookupArticleOwner(updatedBy: string, userDao: UserDao): Promise<{ id: number } | undefined> {
	const numericId = Number.parseInt(updatedBy, 10);
	return !Number.isNaN(numericId) ? await userDao.findUserById(numericId) : await userDao.findUser(updatedBy);
}

/**
 * Finds or creates a draft for an article to store suggestions
 */
async function findOrCreateArticleDraft(
	article: { id: number; content: string; contentMetadata?: unknown; updatedBy: string },
	articleId: string,
	docDraftDao: DocDraftDao,
	userDao?: UserDao,
): Promise<DocDraft | undefined> {
	const existingDraft = (await docDraftDao.findByDocId(article.id))[0];
	if (existingDraft) {
		return existingDraft;
	}

	let ownerId: number | undefined;
	if (userDao && article.updatedBy) {
		const owner = await lookupArticleOwner(article.updatedBy, userDao);
		if (owner) {
			ownerId = owner.id;
			log.info("Found article owner %s (id: %d) for draft creation", article.updatedBy, ownerId);
		}
	}

	if (!ownerId) {
		log.error("Cannot create draft for article %s: no valid user ID available", articleId);
		return;
	}

	const title = (article.contentMetadata as { title?: string })?.title || articleId.split("/").pop() || "Untitled";
	const newDraft = await docDraftDao.createDocDraft({
		docId: article.id,
		title,
		content: article.content,
		createdBy: ownerId,
	});
	log.info("Created new draft %d for article %s to store suggestions", newDraft.id, articleId);
	return newDraft;
}

/**
 * Result of getting content for section deletion
 */
interface ContentResult {
	content: string;
	metadata?: unknown;
	draft?: DocDraft;
	article?: { id: number; jrn: string; content: string; contentMetadata?: unknown; updatedBy: string };
}

/**
 * Finds the heading level for a section from the content
 */
/* c8 ignore start - Helper function tested via integration tests */
function findHeadingLevel(currentContent: string, sectionTitle: string | null): number {
	if (!sectionTitle) {
		return 2;
	}
	const headingMatch = currentContent.match(new RegExp(`^(#+)\\s+${sectionTitle}`, "m"));
	return headingMatch ? headingMatch[1].length : 2;
} /* c8 ignore stop */

/**
 * Finds the target section index by title
 */
function findSectionIndex<T extends { title: string | null }>(sections: Array<T>, sectionTitle: string): number {
	return sections.findIndex(
		section => section.title === sectionTitle || (sectionTitle === "null" && section.title === null),
	);
}

/**
 * Creates a suggestion for deleting a section (for drafts of existing articles)
 */
/* c8 ignore start - Suggestion mode tested via DocDraftRouter integration tests */
async function createDeleteSuggestion(
	draftId: number,
	docId: number,
	sectionTitle: string,
	sections: Array<SectionWithId>,
	docDraftSectionChangesDao: DocDraftSectionChangesDao,
): Promise<string> {
	const targetIndex = findSectionIndex(sections, sectionTitle);

	if (targetIndex === -1) {
		const errorMsg = `Section "${sectionTitle}" not found. Available sections: ${sections
			.map(s => s.title || "(preamble)")
			.join(", ")}`;
		log.error(errorMsg);
		return errorMsg;
	}

	const targetSection = sections[targetIndex];

	await docDraftSectionChangesDao.createDocDraftSectionChanges({
		draftId,
		docId,
		changeType: "delete",
		path: `/sections/${targetIndex}`,
		sectionId: targetSection.id,
		baseContent: targetSection.content,
		content: targetSection.content,
		proposed: [],
		comments: [],
		applied: false,
		dismissed: false,
	});

	log.info("Created suggested delete for draft %d, section ID %s (index %d)", draftId, targetSection.id, targetIndex);
	return `Suggested deleting section "${sectionTitle}". Review and apply in the Section Changes panel.`;
} /* c8 ignore stop */

/**
 * Rebuilds the document without a deleted section
 */
/* c8 ignore start - This function is tested through executeDeleteSectionTool integration tests */
function buildUpdatedContent(sections: Array<Section>, currentContent: string, targetIndex: number): string {
	const updatedSections: Array<string> = [];

	for (let i = 0; i < sections.length; i++) {
		if (i === targetIndex) {
			log.info("Skipping section at index %d: %s", i, sections[i].title || "(preamble)");
			continue;
		}

		const section = sections[i];

		if (section.title) {
			const headingLevel = findHeadingLevel(currentContent, section.title);
			const heading = `${"#".repeat(headingLevel)} ${section.title}`;
			updatedSections.push(`${heading}\n\n${section.content}`);
		} else {
			updatedSections.push(section.content);
		}
	}

	return updatedSections.join("\n\n");
} /* c8 ignore stop */

/**
 * Gets the content result from either a draft or an article
 */
async function getContentResult(
	draftId: number | undefined,
	articleId: string | undefined,
	docDraftDao: DocDraftDao,
	docDao?: DocDao,
): Promise<ContentResult | string> {
	if (draftId !== undefined) {
		const draft = await docDraftDao.getDocDraft(draftId);
		if (!draft) {
			const errorMsg = `Draft ${draftId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}
		return { content: draft.content, metadata: draft.contentMetadata, draft };
	}

	/* v8 ignore start - Article path tested via integration tests */
	if (articleId !== undefined) {
		if (!docDao) {
			const errorMsg = "DocDao is required for article operations";
			log.error(errorMsg);
			return errorMsg;
		}
		const article = await docDao.readDoc(articleId);
		if (!article) {
			const errorMsg = `Article ${articleId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}
		return {
			content: article.content,
			article: {
				id: article.id,
				jrn: article.jrn,
				content: article.content,
				contentMetadata: article.contentMetadata,
				updatedBy: article.updatedBy,
			},
		};
	}

	const errorMsg = "Either draftId or articleId must be provided";
	log.error(errorMsg);
	return errorMsg;
}
/* v8 ignore stop */

/**
 * Creates a delete_section tool definition for a specific draft or article
 * @param draftId - Optional draft ID to bind to this tool
 * @param articleId - Optional article ARN to bind to this tool
 */
export function createDeleteSectionToolDefinition(draftId?: number, articleId?: string): ToolDef {
	const idInfo =
		draftId !== undefined ? `Draft ID: ${draftId}` : articleId ? `Article ID: ${articleId}` : "No ID bound";
	return {
		name: "delete_section",
		description: `Deletes a section from the article. This removes the first section found with the specified title. ${idInfo}`,
		parameters: {
			type: "object",
			properties: {
				sectionTitle: {
					type: "string",
					description:
						"The exact title of the section to delete (case-sensitive). Use null to delete the preamble (content before first heading).",
				},
			},
			required: ["sectionTitle"],
		},
	};
}

/**
 * Executes the delete_section tool
 * @param draftId - Optional draft ID
 * @param articleId - Optional article ARN
 * @param args - Tool arguments
 * @param docDraftDao - DAO for draft operations
 * @param userId - ID of the user executing the tool
 * @param docDao - Optional DAO for article operations
 * @param docDraftSectionChangesDao - Optional DAO for section changes
 * @param userDao - Optional DAO for user lookups (needed for article suggestion mode)
 */
export function executeDeleteSectionTool(
	draftId: number | undefined,
	articleId: string | undefined,
	args: { sectionTitle: string },
	docDraftDao: DocDraftDao,
	userId: number,
	docDao?: DocDao,
	docDraftSectionChangesDao?: DocDraftSectionChangesDao,
	userDao?: UserDao,
): Promise<string> {
	const { sectionTitle } = args;

	if (draftId !== undefined) {
		log.info("delete_section tool called for draft %d, section: %s", draftId, sectionTitle);
		return executeDeleteSection(
			draftId,
			undefined,
			sectionTitle,
			docDraftDao,
			userId,
			docDao,
			docDraftSectionChangesDao,
			userDao,
		);
	}

	if (articleId !== undefined) {
		log.info("delete_section tool called for article %s, section: %s", articleId, sectionTitle);
		return executeDeleteSection(
			undefined,
			articleId,
			sectionTitle,
			docDraftDao,
			userId,
			docDao,
			docDraftSectionChangesDao,
			userDao,
		);
	}

	const errorMsg = "Either draftId or articleId must be provided";
	log.error(errorMsg);
	return Promise.resolve(errorMsg);
}

async function executeDeleteSection(
	draftId: number | undefined,
	articleId: string | undefined,
	sectionTitle: string,
	docDraftDao: DocDraftDao,
	userId: number,
	docDao?: DocDao,
	docDraftSectionChangesDao?: DocDraftSectionChangesDao,
	userDao?: UserDao,
): Promise<string> {
	const contentResult = await getContentResult(draftId, articleId, docDraftDao, docDao);
	if (typeof contentResult === "string") {
		return contentResult;
	}

	const { content: currentContent, metadata: draftContentMetadata, draft, article } = contentResult;

	// Handle suggestion mode for drafts of existing articles
	/* v8 ignore start - suggestion mode tested via integration tests */
	if (draftId !== undefined && draft?.docId && docDraftSectionChangesDao) {
		const sectionPathService = createSectionPathService();
		const existingMapping = (draftContentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};
		const { sections } = sectionPathService.parseSectionsWithIds(currentContent, existingMapping);

		return createDeleteSuggestion(draftId, draft.docId, sectionTitle, sections, docDraftSectionChangesDao);
	}
	/* v8 ignore stop */

	// Handle suggestion mode for direct article edits
	if (articleId !== undefined && article && docDraftSectionChangesDao) {
		log.info("Article delete_section using suggestion mode for article %s", articleId);

		const sectionPathService = createSectionPathService();
		const { sections } = sectionPathService.parseSectionsWithIds(currentContent, {});

		const suggestionDraft = await findOrCreateArticleDraft(article, articleId, docDraftDao, userDao);
		if (suggestionDraft) {
			return createDeleteSuggestion(
				suggestionDraft.id,
				article.id,
				sectionTitle,
				sections,
				docDraftSectionChangesDao,
			);
		}
	}

	log.debug("Current content length: %d", currentContent.length);

	// Parse sections using jolliagent parser
	const sections = parseSections(currentContent);
	log.info("Parsed %d sections", sections.length);

	for (const section of sections) {
		log.debug("  Section: %s", section.title || "(preamble)");
	}

	const targetIndex = findSectionIndex(sections, sectionTitle);
	if (targetIndex !== -1) {
		log.info("Found section to delete at index %d: %s", targetIndex, sections[targetIndex].title || "(preamble)");
	}

	if (targetIndex === -1) {
		const errorMsg = `Section "${sectionTitle}" not found. Available sections: ${sections.map(s => s.title || "(preamble)").join(", ")}`;
		log.error(errorMsg);
		return errorMsg;
	}

	const updatedContent = buildUpdatedContent(sections, currentContent, targetIndex);
	log.debug("Updated content length: %d", updatedContent.length);

	// Save updated content
	if (draftId !== undefined) {
		// Update section ID mapping for the new content (after delete)
		const sectionPathService = createSectionPathService();
		/* v8 ignore next - sectionIds may not exist in older drafts */
		const existingMapping = (draftContentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};
		const { mapping: finalMapping } = sectionPathService.parseSectionsWithIds(updatedContent, existingMapping);

		await docDraftDao.updateDocDraft(draftId, {
			content: updatedContent,
			contentLastEditedAt: new Date(),
			contentLastEditedBy: userId,
			contentMetadata: {
				...(draftContentMetadata as object),
				sectionIds: finalMapping,
			},
		});
		log.info("Draft %d saved successfully with section deleted", draftId);
		return `Section "${sectionTitle}" deleted successfully. The draft has been saved.`;
	}

	/* c8 ignore start - Already tested error paths in other tests */
	if (articleId !== undefined && docDao) {
		const article = await docDao.readDoc(articleId);
		if (!article) {
			const errorMsg = `Article ${articleId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		const updated = await docDao.updateDoc({ ...article, content: updatedContent, version: article.version + 1 });
		if (!updated) {
			const errorMsg = `Failed to update article ${articleId}`;
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("Article %s saved successfully with section deleted", articleId);
		return `Section "${sectionTitle}" deleted successfully. The article has been saved.`;
	}

	const errorMsg = "Unable to save changes - no valid ID provided";
	log.error(errorMsg);
	return errorMsg;
} /* c8 ignore stop */
