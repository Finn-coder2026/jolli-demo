import { parseSections } from "../../../../tools/jolliagent/src/jolliscript/parser";
import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { ActiveUserDao } from "../../dao/ActiveUserDao";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import type { Doc } from "../../model/Doc";
import { createSectionPathService, type SectionIdMapping, type SectionWithId } from "../../services/SectionPathService";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

/**
 * Creates a section change suggestion for an article edit.
 * Returns the result message, or undefined if falling back to direct edit.
 */
async function createArticleEditSuggestion(
	article: Doc,
	articleId: string,
	sectionTitle: string,
	newContent: string,
	newContentDescription: string | undefined,
	sections: Array<SectionWithId>,
	docDraftDao: DocDraftDao,
	docDraftSectionChangesDao: DocDraftSectionChangesDao,
	userDao?: ActiveUserDao,
): Promise<string | undefined> {
	// Find the target section by title
	const targetIndex = sections.findIndex(
		section => section.title === sectionTitle || (sectionTitle === "null" && section.title === null),
	);

	if (targetIndex === -1) {
		const errorMsg = `Section "${sectionTitle}" not found. Available sections: ${sections.map(s => s.title || "(preamble)").join(", ")}`;
		log.error(errorMsg);
		return errorMsg;
	}

	const targetSection = sections[targetIndex];
	const targetSectionId = targetSection.id;

	// Create or find a draft for this article
	let draft = (await docDraftDao.findByDocId(article.id))[0];
	if (!draft) {
		// Look up the article owner to use as draft creator
		let ownerId: number | undefined;
		if (userDao && article.updatedBy) {
			// article.updatedBy may be a numeric user ID (as string) or an email
			const numericId = Number.parseInt(article.updatedBy, 10);
			const owner = !Number.isNaN(numericId)
				? await userDao.findById(numericId)
				: await userDao.findByEmail(article.updatedBy);
			if (owner) {
				ownerId = owner.id;
				log.info("Found article owner %s (id: %d) for draft creation", article.updatedBy, ownerId);
			} else {
				log.warn("Could not find user %s for article %s, cannot create draft", article.updatedBy, articleId);
			}
		}

		if (!ownerId) {
			log.error("Cannot create draft for article %s: no valid user ID available", articleId);
			return; // Fall back to direct edit
		}

		const title =
			(article.contentMetadata as { title?: string })?.title || articleId.split("/").pop() || "Untitled";
		draft = await docDraftDao.createDocDraft({
			docId: article.id,
			title,
			content: article.content,
			createdBy: ownerId,
		});
		log.info("Created new draft %d for article %s to store suggestions", draft.id, articleId);
	}

	// Create section change suggestion
	try {
		await docDraftSectionChangesDao.createDocDraftSectionChanges({
			draftId: draft.id,
			docId: article.id,
			changeType: "update",
			path: `/sections/${targetIndex}`,
			sectionId: targetSectionId,
			baseContent: targetSection.content,
			content: targetSection.content,
			proposed: [
				{
					for: "content",
					who: { type: "agent", id: 1 },
					description: newContentDescription ?? "Updated section content",
					value: newContent,
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
		});
		log.info(
			"Created suggested section change for article %s via draft %d, section ID %s (index %d)",
			articleId,
			draft.id,
			targetSectionId,
			targetIndex,
		);
		return `Suggested edit for section "${sectionTitle}" has been created on draft ${draft.id}. The user can review and apply the change.`;
	} catch (error) {
		log.warn(error, "Failed to create section change record for article, falling back to direct edit");
		return;
	}
}

/**
 * Creates an edit_section tool definition for a specific draft or article
 * @param draftId - Optional draft ID to bind to this tool
 * @param articleId - Optional article ARN to bind to this tool
 */
export function createEditSectionToolDefinition(draftId?: number, articleId?: string): ToolDef {
	const idInfo =
		draftId !== undefined ? `Draft ID: ${draftId}` : articleId ? `Article ID: ${articleId}` : "No ID bound";
	return {
		name: "edit_section",
		description: `Edit a specific section of the article by title. This replaces ONLY the specified section, leaving all other sections unchanged. Use this instead of the [ARTICLE_UPDATE] marker for targeted edits. ${idInfo}`,
		parameters: {
			type: "object",
			properties: {
				sectionTitle: {
					type: "string",
					description:
						"The exact title of the section to edit (case-sensitive). Use null for the preamble (content before first heading).",
				},
				newContent: {
					type: "string",
					description:
						"The new markdown content for this section (without the heading - that's preserved automatically)",
				},
			},
			required: ["sectionTitle", "newContent"],
		},
	};
}

/**
 * Executes the edit_section tool
 * @param draftId - Optional draft ID
 * @param articleId - Optional article ARN
 * @param args - Tool arguments
 * @param docDraftDao - DAO for draft operations
 * @param userId - ID of the user executing the tool
 * @param docDao - Optional DAO for article operations
 * @param docDraftSectionChangesDao - Optional DAO for section changes
 * @param userDao - Optional DAO for user lookups (needed for article suggestion mode)
 */
export async function executeEditSectionTool(
	draftId: number | undefined,
	articleId: string | undefined,
	args: { sectionTitle: string; newContent: string; newContentDescription?: string },
	docDraftDao: DocDraftDao,
	userId: number,
	docDao?: DocDao,
	docDraftSectionChangesDao?: DocDraftSectionChangesDao,
	userDao?: ActiveUserDao,
): Promise<string> {
	const { sectionTitle, newContent } = args;

	if (draftId !== undefined) {
		log.info("edit_section tool called for draft %d, section: %s", draftId, sectionTitle);

		// Get current draft content
		const draft = await docDraftDao.getDocDraft(draftId);
		if (!draft) {
			const errorMsg = `Draft ${draftId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		// Section changes only make sense for drafts editing existing articles
		// For new articles (no docId), we skip suggestion mode and fall through to direct edit
		const canUseSuggestions = docDraftSectionChangesDao && draft.docId;

		const currentContent = draft.content;

		// Get or create section ID mapping from draft metadata
		const sectionPathService = createSectionPathService();
		/* v8 ignore next - sectionIds may not exist in older drafts */
		const existingMapping = (draft.contentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};
		const { sections, mapping: updatedMapping } = sectionPathService.parseSectionsWithIds(
			currentContent,
			existingMapping,
		);

		// Find the target section by title
		const targetIndex = sections.findIndex(
			section => section.title === sectionTitle || (sectionTitle === "null" && section.title === null),
		);

		if (targetIndex === -1) {
			const errorMsg = `Section "${sectionTitle}" not found. Available sections: ${sections.map(s => s.title || "(preamble)").join(", ")}`;
			log.error(errorMsg);
			return errorMsg;
		}

		const targetSection = sections[targetIndex];
		const targetSectionId = targetSection.id;

		// Create section change record if possible (suggest mode - don't apply directly)
		if (canUseSuggestions) {
			try {
				await docDraftSectionChangesDao.createDocDraftSectionChanges({
					draftId,
					docId: draft.docId,
					changeType: "update",
					path: `/sections/${targetIndex}`, // Keep for backward compatibility
					sectionId: targetSectionId,
					baseContent: targetSection.content, // Store base content for merge
					content: targetSection.content,
					proposed: [
						{
							for: "content",
							who: { type: "agent", id: 1 },
							description: args.newContentDescription ?? "Updated section content",
							value: newContent,
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
				});
				log.info(
					"Created suggested section change for draft %d, section ID %s (index %d)",
					draftId,
					targetSectionId,
					targetIndex,
				);
				// Return early - don't apply the edit directly, just suggest it
				return `Suggested edit for section "${sectionTitle}" has been created. The user can review and apply the change.`;
			} catch (error) {
				log.warn(error, "Failed to create section change record, continuing with direct edit");
			}
		}

		// Direct edit mode (no docDraftSectionChangesDao or failed to create suggestion)
		const result = performSectionEdit(currentContent, sectionTitle, newContent);
		/* v8 ignore start - section already validated at lines 91-100; this is defensive */
		if (result.error) {
			return result.error;
		}
		/* v8 ignore stop */

		// Save updated draft
		/* v8 ignore start - performSectionEdit always returns updatedContent or error */
		if (!result.updatedContent) {
			const errorMsg = "Failed to generate updated content";
			log.error(errorMsg);
			return errorMsg;
		}
		/* v8 ignore stop */

		// Update section ID mapping for the new content
		const { mapping: finalMapping } = sectionPathService.parseSectionsWithIds(
			result.updatedContent,
			updatedMapping,
		);

		await docDraftDao.updateDocDraft(draftId, {
			content: result.updatedContent,
			contentLastEditedAt: new Date(),
			contentLastEditedBy: userId,
			contentMetadata: {
				...(draft.contentMetadata as object),
				sectionIds: finalMapping,
			},
		});
		log.info("Draft %d saved successfully with updated section IDs", draftId);

		return `Section "${sectionTitle}" updated successfully. The draft has been saved.`;
	}

	if (articleId !== undefined) {
		if (!docDao) {
			const errorMsg = "DocDao is required for article operations";
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("edit_section tool called for article %s, section: %s", articleId, sectionTitle);

		// Get current article content
		const article = await docDao.readDoc(articleId);
		if (!article) {
			const errorMsg = `Article ${articleId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		const currentContent = article.content;

		// Suggestion mode for article edits: create a draft and add suggestion
		if (docDraftSectionChangesDao) {
			log.info("Article edit using suggestion mode for article %s", articleId);

			const sectionPathService = createSectionPathService();
			const { sections } = sectionPathService.parseSectionsWithIds(currentContent, {});

			const suggestionResult = await createArticleEditSuggestion(
				article,
				articleId,
				sectionTitle,
				newContent,
				args.newContentDescription,
				sections,
				docDraftDao,
				docDraftSectionChangesDao,
				userDao,
			);

			// If suggestion was created (or error found), return the result
			// undefined means we should fall back to direct edit
			if (suggestionResult !== undefined) {
				return suggestionResult;
			}
		}

		// Direct edit mode (no docDraftSectionChangesDao or failed to create suggestion)
		const result = performSectionEdit(currentContent, sectionTitle, newContent);
		if (result.error) {
			return result.error;
		}

		/* v8 ignore start - performSectionEdit always returns updatedContent or error */
		if (!result.updatedContent) {
			const errorMsg = "Failed to generate updated content";
			log.error(errorMsg);
			return errorMsg;
		}
		/* v8 ignore stop */

		// Save updated article
		const updated = await docDao.updateDoc({
			...article,
			content: result.updatedContent,
			version: article.version + 1,
		});
		if (!updated) {
			const errorMsg = `Failed to update article ${articleId}`;
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("Article %s saved successfully", articleId);

		return `Section "${sectionTitle}" updated successfully. The article has been saved.`;
	}

	const errorMsg = "Either draftId or articleId must be provided";
	log.error(errorMsg);
	return errorMsg;
}

/**
 * Performs the section editing logic on content
 */
function performSectionEdit(
	currentContent: string,
	sectionTitle: string,
	newContent: string,
): { updatedContent?: string; error?: string } {
	log.debug("Current content length: %d", currentContent.length);

	// Parse sections using jolliagent parser
	const sections = parseSections(currentContent);
	log.info("Parsed %d sections", sections.length);

	// Log all section titles for debugging
	/* v8 ignore start - debug logging loop */
	for (const section of sections) {
		log.debug("  Section: %s", section.title || "(preamble)");
	}
	/* v8 ignore stop */

	// Find the matching section
	const targetIndex = sections.findIndex(section => {
		const matches = section.title === sectionTitle || (sectionTitle === "null" && section.title === null);
		if (matches) {
			log.info(
				"Found matching section at index %d: %s",
				sections.indexOf(section),
				section.title || "(preamble)",
			);
		}
		return matches;
	});

	if (targetIndex === -1) {
		const errorMsg = `Section "${sectionTitle}" not found. Available sections: ${sections.map(s => s.title || "(preamble)").join(", ")}`;
		log.error(errorMsg);
		return { error: errorMsg };
	}

	// Rebuild the document with the edited section
	const updatedSections: Array<string> = [];

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];

		// Handle front matter sections specially - preserve the --- delimiters
		if (section.isFrontMatter) {
			updatedSections.push(`---\n${section.content}\n---`);
			continue;
		}

		if (i === targetIndex) {
			// Replace this section's content
			log.info("Replacing section %d content (length %d → %d)", i, section.content.length, newContent.length);

			if (section.title) {
				// Section has a heading - preserve it and any joi blocks
				// Determine heading level from original (default to 2)
				const headingMatch = currentContent.match(new RegExp(`^(#+)\\s+${section.title}`, "m"));
				const headingLevel = headingMatch ? headingMatch[1].length : 2;

				// Check if section has joi blocks that should be preserved
				const joiFences = section.fences.filter(f => f.lang === "joi");
				if (joiFences.length > 0) {
					/* v8 ignore next - defensive fallback, joi fences should always have lang property */
					const joiBlocks = joiFences.map(f => `\`\`\`${f.lang || ""}\n${f.value}\n\`\`\``).join("\n\n");
					const heading = `${"#".repeat(headingLevel)} ${section.title}`;
					updatedSections.push(`${heading}\n\n${joiBlocks}\n\n${newContent}`);
				} else {
					const heading = `${"#".repeat(headingLevel)} ${section.title}`;
					updatedSections.push(`${heading}\n\n${newContent}`);
				}
			} else {
				// Preamble - check for joi blocks
				const joiFences = section.fences.filter(f => f.lang === "joi");
				if (joiFences.length > 0) {
					/* v8 ignore next - defensive fallback, joi fences should always have lang property */
					const joiBlocks = joiFences.map(f => `\`\`\`${f.lang || ""}\n${f.value}\n\`\`\``).join("\n\n");
					updatedSections.push(`${joiBlocks}\n\n${newContent}`);
				} else {
					updatedSections.push(newContent);
				}
			}
		} else {
			// Keep original section unchanged (content already includes joi blocks)
			if (section.title) {
				// Determine heading level from original content
				const headingMatch = currentContent.match(new RegExp(`^(#+)\\s+${section.title}`, "m"));
				const headingLevel = headingMatch ? headingMatch[1].length : 2;
				const heading = `${"#".repeat(headingLevel)} ${section.title}`;
				updatedSections.push(`${heading}\n\n${section.content}`);
			} else {
				// Preamble
				updatedSections.push(section.content);
			}
		}
	}

	const updatedContent = updatedSections.join("\n\n");
	log.debug("Updated content length: %d", updatedContent.length);

	return { updatedContent };
}
