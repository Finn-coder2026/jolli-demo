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
 * Result of getting content for section creation
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
function findHeadingLevel(currentContent: string, sectionTitle: string | null): number {
	if (!sectionTitle) {
		return 2;
	}
	const headingMatch = currentContent.match(new RegExp(`^(#+)\\s+${sectionTitle}`, "m"));
	return headingMatch ? headingMatch[1].length : 2;
}

/**
 * Finds the target section index by title
 */
function findSectionIndex<T extends { title: string | null }>(sections: Array<T>, insertAfter: string): number {
	return sections.findIndex(
		section => section.title === insertAfter || (insertAfter === "null" && section.title === null),
	);
}

/**
 * Creates a suggestion for inserting a new section (for drafts of existing articles)
 */
async function createInsertSuggestion(
	draftId: number,
	docId: number,
	sectionTitle: string,
	content: string,
	insertAfter: string,
	currentContent: string,
	sections: Array<SectionWithId>,
	docDraftSectionChangesDao: DocDraftSectionChangesDao,
): Promise<string> {
	const targetIndex = findSectionIndex(sections, insertAfter);

	if (targetIndex === -1) {
		const errorMsg = `Section "${insertAfter}" not found. Available sections: ${sections
			.map(s => s.title || "(preamble)")
			.join(", ")}`;
		log.error(errorMsg);
		return errorMsg;
	}

	const anchorSection = sections[targetIndex];
	const newHeadingLevel = findHeadingLevel(currentContent, anchorSection.title);
	const heading = `${"#".repeat(newHeadingLevel)} ${sectionTitle}`;
	const proposedValue = `${heading}\n\n${content}`;

	await docDraftSectionChangesDao.createDocDraftSectionChanges({
		draftId,
		docId,
		changeType: "insert-after",
		path: `/sections/${targetIndex}`,
		sectionId: anchorSection.id,
		baseContent: anchorSection.content,
		content: anchorSection.content,
		proposed: [
			{
				for: "content",
				who: { type: "agent", id: 1 },
				description: `Insert new section "${sectionTitle}" after "${insertAfter}"`,
				value: proposedValue,
				appliedAt: undefined,
			},
		],
		comments: [],
		applied: false,
		dismissed: false,
	});

	log.info(
		"Created suggested insert-after for draft %d, after section ID %s (index %d)",
		draftId,
		anchorSection.id,
		targetIndex,
	);
	return `Suggested creating section "${sectionTitle}" after "${insertAfter}". Review and apply in the Section Changes panel.`;
}

/**
 * Rebuilds the document with a new section inserted
 */
function buildUpdatedContent(
	sections: Array<Section>,
	currentContent: string,
	targetIndex: number,
	sectionTitle: string,
	content: string,
): string {
	const updatedSections: Array<string> = [];

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];

		// Handle front matter sections specially - preserve the --- delimiters
		if (section.isFrontMatter) {
			updatedSections.push(`---\n${section.content}\n---`);
		} else if (section.title) {
			const headingLevel = findHeadingLevel(currentContent, section.title);
			const heading = `${"#".repeat(headingLevel)} ${section.title}`;
			updatedSections.push(`${heading}\n\n${section.content}`);
		} else {
			updatedSections.push(section.content);
		}

		if (i === targetIndex) {
			log.info("Inserting new section '%s' after index %d", sectionTitle, i);
			const newHeadingLevel = findHeadingLevel(currentContent, section.title);
			const heading = `${"#".repeat(newHeadingLevel)} ${sectionTitle}`;
			updatedSections.push(`${heading}\n\n${content}`);
		}
	}

	return updatedSections.join("\n\n");
}

/**
 * Creates a create_section tool definition for a specific draft or article
 * @param draftId - Optional draft ID to bind to this tool
 * @param articleId - Optional article ARN to bind to this tool
 */
export function createCreateSectionToolDefinition(draftId?: number, articleId?: string): ToolDef {
	const idInfo =
		draftId !== undefined ? `Draft ID: ${draftId}` : articleId ? `Article ID: ${articleId}` : "No ID bound";
	return {
		name: "create_section",
		description: `Create a new section in the article. This inserts a new section after a specified existing section. ${idInfo}`,
		parameters: {
			type: "object",
			properties: {
				sectionTitle: {
					type: "string",
					description: "The title for the new section (will become a heading)",
				},
				content: {
					type: "string",
					description:
						"The markdown content for the new section (without the heading - that's added automatically)",
				},
				insertAfter: {
					type: "string",
					description:
						"The exact title of the section to insert after (case-sensitive). Use null to insert at the very beginning (before first heading).",
				},
			},
			required: ["sectionTitle", "content", "insertAfter"],
		},
	};
}

/**
 * Executes the create_section tool
 * @param draftId - Optional draft ID
 * @param articleId - Optional article ARN
 * @param args - Tool arguments
 * @param docDraftDao - DAO for draft operations
 * @param userId - ID of the user executing the tool
 * @param docDao - Optional DAO for article operations
 */
export function executeCreateSectionTool(
	draftId: number | undefined,
	articleId: string | undefined,
	args: { sectionTitle: string; content: string; insertAfter: string },
	docDraftDao: DocDraftDao,
	userId: number,
	docDao?: DocDao,
	docDraftSectionChangesDao?: DocDraftSectionChangesDao,
	userDao?: UserDao,
): Promise<string> {
	const { sectionTitle, content, insertAfter } = args;

	if (draftId !== undefined) {
		log.info(
			"create_section tool called for draft %d, section: %s, insertAfter: %s",
			draftId,
			sectionTitle,
			insertAfter,
		);

		return executeCreateSection(
			draftId,
			undefined,
			sectionTitle,
			content,
			insertAfter,
			docDraftDao,
			userId,
			docDao,
			docDraftSectionChangesDao,
			userDao,
		);
	}

	if (articleId !== undefined) {
		log.info(
			"create_section tool called for article %s, section: %s, insertAfter: %s",
			articleId,
			sectionTitle,
			insertAfter,
		);

		return executeCreateSection(
			undefined,
			articleId,
			sectionTitle,
			content,
			insertAfter,
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

	/* c8 ignore start - Article path tested via integration tests */
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
} /* c8 ignore stop */

async function executeCreateSection(
	draftId: number | undefined,
	articleId: string | undefined,
	sectionTitle: string,
	content: string,
	insertAfter: string,
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
	if (draftId !== undefined && draft?.docId && docDraftSectionChangesDao) {
		const sectionPathService = createSectionPathService();
		/* v8 ignore next - sectionIds may not exist in older drafts */
		const existingMapping = (draftContentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};
		const { sections } = sectionPathService.parseSectionsWithIds(currentContent, existingMapping);

		return createInsertSuggestion(
			draftId,
			draft.docId,
			sectionTitle,
			content,
			insertAfter,
			currentContent,
			sections,
			docDraftSectionChangesDao,
		);
	}

	// Handle suggestion mode for direct article edits
	if (articleId !== undefined && article && docDraftSectionChangesDao) {
		log.info("Article create_section using suggestion mode for article %s", articleId);

		const sectionPathService = createSectionPathService();
		const { sections } = sectionPathService.parseSectionsWithIds(currentContent, {});

		const suggestionDraft = await findOrCreateArticleDraft(article, articleId, docDraftDao, userDao);
		if (suggestionDraft) {
			return createInsertSuggestion(
				suggestionDraft.id,
				article.id,
				sectionTitle,
				content,
				insertAfter,
				currentContent,
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

	const targetIndex = findSectionIndex(sections, insertAfter);
	if (targetIndex !== -1) {
		log.info("Found insertion point at index %d: %s", targetIndex, sections[targetIndex].title || "(preamble)");
	}

	if (targetIndex === -1) {
		const errorMsg = `Section "${insertAfter}" not found. Available sections: ${sections.map(s => s.title || "(preamble)").join(", ")}`;
		log.error(errorMsg);
		return errorMsg;
	}

	const existingSection = sections.find(s => s.title === sectionTitle);
	if (existingSection) {
		const errorMsg = `Section "${sectionTitle}" already exists. Use edit_section to modify it instead.`;
		log.error(errorMsg);
		return errorMsg;
	}

	const updatedContent = buildUpdatedContent(sections, currentContent, targetIndex, sectionTitle, content);
	log.debug("Updated content length: %d", updatedContent.length);

	// Save updated content
	if (draftId !== undefined) {
		await docDraftDao.updateDocDraft(draftId, {
			content: updatedContent,
			contentLastEditedAt: new Date(),
			contentLastEditedBy: userId,
		});
		log.info("Draft %d saved successfully with new section", draftId);
		return `Section "${sectionTitle}" created successfully after "${insertAfter}". The draft has been saved.`;
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

		log.info("Article %s saved successfully with new section", articleId);
		return `Section "${sectionTitle}" created successfully after "${insertAfter}". The article has been saved.`;
	}

	const errorMsg = "Unable to save changes - no valid ID provided";
	log.error(errorMsg);
	return errorMsg;
} /* c8 ignore stop */
