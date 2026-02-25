import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

export interface EditArticleEntry {
	old_string: string;
	new_string: string;
	reason: string;
}

export interface EditArticleArgs {
	edits: Array<EditArticleEntry>;
}

/**
 * Draft-scoped targeted editing tool.
 * Similar to CLI edit_article, but bound to the current collab draft.
 */
export function createEditArticleToolDefinition(draftId?: number): ToolDef {
	const idInfo = draftId !== undefined ? ` Draft ID: ${draftId}.` : "";
	return {
		name: "edit_article",
		description: [
			"Make targeted edits to the current online article draft by exact string replacement.",
			"Each old_string MUST match exactly once in the current article content.",
			"Use this to preserve structure while applying precise updates.",
			idInfo,
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				edits: {
					type: "array",
					description: "Ordered targeted edits to apply.",
					items: {
						type: "object",
						properties: {
							old_string: {
								type: "string",
								description: "Exact unique text to replace in the current article content.",
							},
							new_string: { type: "string", description: "Replacement text." },
							reason: { type: "string", description: "Why this change is needed." },
						},
						required: ["old_string", "new_string", "reason"],
					},
				},
			},
			required: ["edits"],
		},
	};
}

function isValidEditEntry(value: unknown): value is EditArticleEntry {
	if (!value || typeof value !== "object") {
		return false;
	}
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.old_string === "string" && typeof entry.new_string === "string" && typeof entry.reason === "string"
	);
}

export async function executeEditArticleTool(
	draftId: number | undefined,
	args: EditArticleArgs,
	docDraftDao: DocDraftDao,
	userId: number,
): Promise<string> {
	if (draftId === undefined) {
		return "Draft ID is required for edit_article";
	}
	if (!Array.isArray(args.edits) || args.edits.length === 0) {
		return "Missing or invalid 'edits' argument - must be a non-empty array";
	}
	for (let i = 0; i < args.edits.length; i++) {
		if (!isValidEditEntry(args.edits[i])) {
			return `Edit ${i}: Missing or invalid fields (required: old_string, new_string, reason)`;
		}
	}

	const draft = await docDraftDao.getDocDraft(draftId);
	if (!draft) {
		return `Draft ${draftId} not found`;
	}

	let content = draft.content;
	const applied: Array<string> = [];

	for (let i = 0; i < args.edits.length; i++) {
		const edit = args.edits[i];
		const occurrences = content.split(edit.old_string).length - 1;
		if (occurrences === 0) {
			const preview =
				content.length > 800
					? `${content.slice(0, 800)}...\n\n[File truncated - ${content.length} chars]`
					: content;
			return [
				`Edit ${i}: Text not found in article content.`,
				"",
				"Actual article content preview:",
				"```",
				preview,
				"```",
				"",
				"Use exact text from the current article.",
			].join("\n");
		}
		if (occurrences > 1) {
			return `Edit ${i}: old_string appears ${occurrences} times. Include more context to make it unique.`;
		}
		content = content.replace(edit.old_string, edit.new_string);
		applied.push(edit.reason);
	}

	if (content === draft.content) {
		return "No article changes applied.";
	}

	await docDraftDao.updateDocDraft(draftId, {
		content,
		contentLastEditedAt: new Date(),
		contentLastEditedBy: userId,
	});

	log.info("edit_article applied %d edits on draft %d", args.edits.length, draftId);
	return `Applied ${args.edits.length} targeted edit${args.edits.length === 1 ? "" : "s"} to the article.`;
}
