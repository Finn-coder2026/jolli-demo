import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import { getLog } from "../../util/Logger";
import { jrnParser, jrnParserV3 } from "jolli-common";
import { Document, isMap, parseDocument } from "yaml";

const log = getLog(import.meta);

export interface UpsertFrontmatterArgs {
	set?: Record<string, unknown>;
	remove?: Array<string>;
}

export interface UpsertFrontmatterOptions {
	defaultAttentionSource?: string;
	requireAttentionSource?: boolean;
}

interface ResolvedUpsertFrontmatterOptions {
	defaultAttentionSource: string | undefined;
	requireAttentionSource: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isAbsoluteOrWorkspacePrefixedAttentionPath(pathValue: string): boolean {
	const trimmed = pathValue.trim();
	if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.startsWith("~")) {
		return true;
	}
	if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
		return true;
	}
	return trimmed.toLowerCase().startsWith("workspace/");
}

function validateJrnField(value: unknown): Array<string> {
	const issues: Array<string> = [];
	const normalized = normalizeString(value);
	if (!normalized) {
		issues.push("jrn must be a non-empty string");
		return issues;
	}
	if (!normalized.startsWith("jrn:")) {
		return issues;
	}

	if (jrnParserV3.isV3(normalized)) {
		const parsedV3 = jrnParserV3.parse(normalized);
		if (!parsedV3.success) {
			issues.push(`jrn is not a valid v3 JRN: ${parsedV3.error}`);
		}
		return issues;
	}

	const parsedV2 = jrnParser.parse(normalized);
	if (!parsedV2.success) {
		issues.push(`jrn is not a valid v2 JRN: ${parsedV2.error}`);
	}
	return issues;
}

function validateAttentionKeywords(value: unknown, ruleIndex: number): Array<string> {
	const issues: Array<string> = [];
	if (value === undefined) {
		return issues;
	}
	if (typeof value === "string") {
		if (value.trim().length === 0) {
			issues.push(`attention[${ruleIndex}].keywords must not be empty when provided as a string`);
		}
		return issues;
	}
	if (!Array.isArray(value)) {
		issues.push(`attention[${ruleIndex}].keywords must be a string or an array of strings`);
		return issues;
	}
	for (let i = 0; i < value.length; i++) {
		const item = value[i];
		if (typeof item !== "string" || item.trim().length === 0) {
			issues.push(`attention[${ruleIndex}].keywords[${i}] must be a non-empty string`);
		}
	}
	return issues;
}

function validateAttentionSource(
	value: unknown,
	ruleIndex: number,
	options: ResolvedUpsertFrontmatterOptions,
): Array<string> {
	const issues: Array<string> = [];
	const sourceValue = normalizeString(value);
	if (!sourceValue && (options.requireAttentionSource || value !== undefined)) {
		issues.push(`attention[${ruleIndex}].source must be a non-empty string`);
	}
	return issues;
}

function validateAttentionField(value: unknown, options: ResolvedUpsertFrontmatterOptions): Array<string> {
	const issues: Array<string> = [];
	if (!Array.isArray(value)) {
		issues.push("attention must be an array");
		return issues;
	}
	for (let i = 0; i < value.length; i++) {
		const rule = value[i];
		if (!isRecord(rule)) {
			issues.push(`attention[${i}] must be an object`);
			continue;
		}
		if (rule.op !== "file") {
			issues.push(`attention[${i}].op must be \"file\"`);
		}
		const pathValue = normalizeString(rule.path);
		if (!pathValue) {
			issues.push(`attention[${i}].path must be a non-empty string`);
		} else if (isAbsoluteOrWorkspacePrefixedAttentionPath(pathValue)) {
			issues.push(
				`attention[${i}].path must be repo-relative (for example "src/auth/login.ts"), not absolute or workspace-prefixed`,
			);
		}
		issues.push(...validateAttentionSource(rule.source, i, options));
		issues.push(...validateAttentionKeywords(rule.keywords, i));
	}
	return issues;
}

function validateManagedFrontmatter(
	frontmatter: Record<string, unknown>,
	options: ResolvedUpsertFrontmatterOptions,
): Array<string> {
	const issues: Array<string> = [];
	if ("jrn" in frontmatter) {
		issues.push(...validateJrnField(frontmatter.jrn));
	}
	if ("attention" in frontmatter) {
		issues.push(...validateAttentionField(frontmatter.attention, options));
	}
	return issues;
}

function resolveOptions(options?: UpsertFrontmatterOptions): ResolvedUpsertFrontmatterOptions {
	const defaultAttentionSource = normalizeString(options?.defaultAttentionSource) ?? undefined;
	return {
		defaultAttentionSource,
		requireAttentionSource: options?.requireAttentionSource ?? true,
	};
}

function applyAttentionSourcePolicy(
	frontmatter: Record<string, unknown>,
	options: ResolvedUpsertFrontmatterOptions,
): boolean {
	if (!("attention" in frontmatter) || !Array.isArray(frontmatter.attention)) {
		return false;
	}
	if (!options.defaultAttentionSource) {
		return false;
	}

	let changed = false;
	for (const rule of frontmatter.attention) {
		if (!isRecord(rule)) {
			continue;
		}
		const sourceValue = rule.source;
		const missingSource =
			sourceValue === undefined || (typeof sourceValue === "string" && sourceValue.trim().length === 0);
		if (missingSource) {
			rule.source = options.defaultAttentionSource;
			changed = true;
		}
	}
	return changed;
}

function validateUpsertInputs(draftId: number | undefined, args: UpsertFrontmatterArgs): string | undefined {
	if (draftId === undefined) {
		return "Draft ID is required for upsert_frontmatter";
	}
	if (args.set !== undefined && !isRecord(args.set)) {
		return "Invalid 'set' argument (must be an object when provided)";
	}
	if (args.remove !== undefined && (!Array.isArray(args.remove) || args.remove.some(k => typeof k !== "string"))) {
		return "Invalid 'remove' argument (must be an array of strings when provided)";
	}
	if (args.set === undefined && args.remove === undefined) {
		return "Provide at least one of 'set' or 'remove'";
	}
	return;
}

function isDefinedNumber(value: number | undefined): value is number {
	return value !== undefined;
}

export function createUpsertFrontmatterToolDefinition(draftId?: number): ToolDef {
	const idInfo = draftId !== undefined ? ` Draft ID: ${draftId}.` : "";
	return {
		name: "upsert_frontmatter",
		description: [
			"Upsert/remove frontmatter fields on the current online article draft.",
			"Validates managed schema for jrn and attention and returns detailed validation errors when invalid.",
			'attention entries should use { op: "file", source: <source name>, path: <repo-relative path>, keywords?: string | string[] }.',
			idInfo,
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				set: {
					type: "object",
					description: "Top-level frontmatter fields to merge.",
					additionalProperties: true,
				},
				remove: {
					type: "array",
					description: "Top-level frontmatter keys to remove.",
					items: { type: "string" },
				},
			},
			required: [],
		},
	};
}

export async function executeUpsertFrontmatterTool(
	draftId: number | undefined,
	args: UpsertFrontmatterArgs,
	docDraftDao: DocDraftDao,
	userId: number,
	options?: UpsertFrontmatterOptions,
): Promise<string> {
	const inputIssue = validateUpsertInputs(draftId, args);
	if (inputIssue) {
		return inputIssue;
	}
	/* v8 ignore next 3 - narrowed by validateUpsertInputs guard above */
	if (!isDefinedNumber(draftId)) {
		return "Draft ID is required for upsert_frontmatter";
	}

	const draft = await docDraftDao.getDocDraft(draftId);
	if (!draft) {
		return `Draft ${draftId} not found`;
	}

	const originalContent = draft.content;
	const hasBom = originalContent.startsWith("\ufeff");
	const normalized = hasBom ? originalContent.slice(1) : originalContent;
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);

	let afterFrontmatter = normalized;
	let trailingNewline = "\n";
	let frontmatterDoc: Document;

	if (match?.[1] !== undefined) {
		const rawYaml = match[1];
		trailingNewline = match[2] ?? "";
		afterFrontmatter = normalized.slice(match[0].length);
		frontmatterDoc = parseDocument(rawYaml);
		if (frontmatterDoc.errors.length > 0) {
			return `Existing frontmatter YAML is invalid: ${frontmatterDoc.errors[0].message}`;
		}
	} else {
		frontmatterDoc = new Document({});
	}

	if (!isMap(frontmatterDoc.contents)) {
		return "Existing frontmatter must be a YAML object for upsert operations";
	}
	const frontmatterMap = frontmatterDoc.contents;

	if (Array.isArray(args.remove)) {
		for (const key of args.remove) {
			frontmatterMap.delete(key);
		}
	}
	if (isRecord(args.set)) {
		for (const [key, value] of Object.entries(args.set)) {
			// YAMLMap#set updates existing keys in place and appends new keys at the end.
			frontmatterMap.set(key, value);
		}
	}

	const nextData = frontmatterDoc.toJSON();
	if (!isRecord(nextData)) {
		return "Existing frontmatter must be a YAML object for upsert operations";
	}
	const resolvedOptions = resolveOptions(options);
	const updatedAttention = applyAttentionSourcePolicy(nextData, resolvedOptions);
	if (updatedAttention && "attention" in nextData) {
		// Keep top-level key order stable while syncing any source-policy autofill back to YAML AST.
		frontmatterMap.set("attention", nextData.attention);
	}

	const validationIssues = validateManagedFrontmatter(nextData, resolvedOptions);
	if (validationIssues.length > 0) {
		return [
			"Frontmatter validation failed:",
			...validationIssues.map(issue => `- ${issue}`),
			"",
			"Expected managed schema:",
			"- jrn: non-empty string (if it starts with jrn:, it must parse as v2 or v3 JRN)",
			'- attention: array of { op: "file", source: non-empty string, path: repo-relative non-empty string, keywords?: string | string[] }',
		].join("\n");
	}

	let nextContent: string;
	if (frontmatterMap.items.length === 0) {
		nextContent = `${hasBom ? "\ufeff" : ""}${afterFrontmatter}`;
	} else {
		const yaml = frontmatterDoc.toString({ lineWidth: 0 }).trimEnd();
		const separator = match ? trailingNewline : "\n";
		nextContent = `${hasBom ? "\ufeff" : ""}---\n${yaml}\n---${separator}${afterFrontmatter}`;
	}

	if (nextContent === originalContent) {
		return "No frontmatter changes needed.";
	}

	await docDraftDao.updateDocDraft(draftId, {
		content: nextContent,
		contentLastEditedAt: new Date(),
		contentLastEditedBy: userId,
	});

	log.info("upsert_frontmatter updated draft %d", draftId);
	return "Frontmatter updated successfully.";
}
