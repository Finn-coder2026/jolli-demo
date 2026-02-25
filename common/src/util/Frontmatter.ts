import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type FrontmatterData = Record<string, unknown>;

export interface AttentionFileRule {
	op: "file";
	path: string;
	keywords?: Array<string>;
	source?: string;
}

export interface AttentionFrontmatter {
	jrn?: string;
	attention?: Array<AttentionFileRule | Record<string, unknown>>;
}

export interface DocAttention {
	docId: string;
	docPath: string;
	rules: Array<AttentionFileRule>;
}

export interface ParsedFrontmatter {
	raw: string;
	data?: FrontmatterData;
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

function normalizeKeywords(value: unknown): Array<string> | undefined {
	if (Array.isArray(value)) {
		const keywords = value
			.map(item => (typeof item === "string" ? item.trim() : ""))
			.filter(item => item.length > 0);
		return keywords.length > 0 ? keywords : undefined;
	}
	const single = normalizeString(value);
	return single ? [single] : undefined;
}

/**
 * Extracts YAML frontmatter from a markdown string.
 */
export function parseYamlFrontmatter(content: string): ParsedFrontmatter | null {
	const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match?.[1]) {
		return null;
	}

	const raw = match[1];
	let data: FrontmatterData | undefined;
	try {
		const parsed = parseYaml(raw);
		if (isRecord(parsed)) {
			data = parsed;
		}
	} catch {
		data = undefined;
	}

	return data !== undefined ? { raw, data } : { raw };
}

/**
 * Parses attention file rules from frontmatter.
 */
export function parseAttentionFrontmatter(content: string, docPath: string): DocAttention | null {
	const frontmatter = parseYamlFrontmatter(content);
	if (!frontmatter?.data) {
		return null;
	}

	const docId = normalizeString(frontmatter.data.jrn);
	if (!docId) {
		return null;
	}

	const attention = frontmatter.data.attention;
	if (!Array.isArray(attention)) {
		return null;
	}

	const rules: Array<AttentionFileRule> = [];
	for (const item of attention) {
		if (!isRecord(item)) {
			continue;
		}
		const op = normalizeString(item.op) ?? "";
		if (op !== "file") {
			continue;
		}
		const path = normalizeString(item.path);
		if (!path) {
			continue;
		}
		const keywords = normalizeKeywords(item.keywords);
		const source = normalizeString(item.source) ?? undefined;
		const rule: AttentionFileRule = {
			op: "file",
			path,
		};
		if (keywords) {
			rule.keywords = keywords;
		}
		if (source) {
			rule.source = source;
		}
		rules.push(rule);
	}

	if (rules.length === 0) {
		return null;
	}

	return { docId, docPath, rules };
}

/** Shape of a single trigger entry in the `on:` frontmatter field. */
interface TriggerEntry {
	jrn?: string;
	verb?: string;
}

/**
 * Builds the JRN pattern for a GitHub source trigger.
 */
function buildGitPushJrn(org: string, repo: string, branch: string): string {
	return `jrn:*:path:/home/*/sources/github/${org}/${repo}/${branch}`;
}

/**
 * Checks whether a trigger entry matches the given JRN pattern and verb.
 */
function isTriggerMatch(entry: unknown, jrn: string): boolean {
	if (!isRecord(entry)) {
		return false;
	}
	return entry.jrn === jrn && entry.verb === "GIT_PUSH";
}

/**
 * Normalizes the `on:` field to an array of trigger entries.
 * Handles both single-object and array forms.
 */
function normalizeOnField(on: unknown): Array<TriggerEntry> {
	if (Array.isArray(on)) {
		return on;
	}
	if (isRecord(on)) {
		return [on as TriggerEntry];
	}
	return [];
}

/**
 * Injects a GIT_PUSH trigger into the frontmatter of a markdown string.
 *
 * Merging rules:
 * - No frontmatter → adds `---\non:\n  ...\n---\n` before content
 * - Frontmatter exists, no `on:` → adds `on:` field to existing frontmatter
 * - Frontmatter exists, `on:` exists without matching trigger → appends to array
 * - Frontmatter exists, `on:` already has matching trigger → no change
 * - Preserves all existing frontmatter fields
 */
export function injectGitPushTriggerFrontmatter(content: string, org: string, repo: string, branch: string): string {
	const jrn = buildGitPushJrn(org, repo, branch);
	const newTrigger: TriggerEntry = { jrn, verb: "GIT_PUSH" };

	const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);

	// No frontmatter — prepend a new block
	if (!match?.[1]) {
		const yaml = stringifyYaml({ on: [newTrigger] }, { lineWidth: 0 }).trimEnd();
		return `---\n${yaml}\n---\n${normalized}`;
	}

	const rawYaml = match[0];
	const yamlContent = match[1];
	const trailingNewline = match[2] ?? "";

	let data: FrontmatterData;
	try {
		const parsed = parseYaml(yamlContent);
		if (!isRecord(parsed)) {
			// Non-record YAML — cannot merge safely, return unchanged
			return content;
		}
		data = parsed;
	} catch {
		return content;
	}

	// Check existing `on:` field
	if (data.on !== undefined) {
		const triggers = normalizeOnField(data.on);
		if (triggers.some(t => isTriggerMatch(t, jrn))) {
			return content; // Matching trigger already present
		}
		data.on = [...triggers, newTrigger];
	} else {
		data.on = [newTrigger];
	}

	const afterFrontmatter = normalized.slice(rawYaml.length);
	const newYaml = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
	return `---\n${newYaml}\n---${trailingNewline}${afterFrontmatter}`;
}

/** Result of splitting brain frontmatter from article content. */
export interface BrainContentSplit {
	/** The raw YAML inside the first frontmatter block (empty string if none) */
	brainContent: string;
	/** The article body after the frontmatter block */
	articleContent: string;
}

/**
 * Extracts the first YAML frontmatter block (brain) from article content.
 *
 * Only the first `---\n...\n---` block is treated as brain content.
 * Any subsequent `---...---` blocks remain in the article content.
 *
 * Used by the article editor to split brain/article for editing, and by
 * the site generator to discard brain metadata before rendering.
 */
export function extractBrainContent(content: string): BrainContentSplit {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		return { brainContent: "", articleContent: content };
	}

	const brainContent = match[1];
	// Get everything after the frontmatter block, removing one leading newline if present
	const articleContent = content.slice(match[0].length).replace(/^\r?\n/, "");

	return { brainContent, articleContent };
}

/** Fields managed by jolli that should be stripped */
const JOLLI_FIELDS = ["jrn", "attention"];

/**
 * Strips jolli-specific fields (jrn, attention) from frontmatter.
 * If only jolli fields exist, removes the entire frontmatter block.
 * If other fields exist, preserves them and removes only jolli fields.
 * Returns the content unchanged if no frontmatter exists.
 */
export function stripJolliFrontmatter(content: string): string {
	const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);
	if (!match?.[1]) {
		return content;
	}

	const rawYaml = match[0];
	const yamlContent = match[1];
	const trailingNewline = match[2] ?? "";

	let data: FrontmatterData | undefined;
	try {
		const parsed = parseYaml(yamlContent);
		if (isRecord(parsed)) {
			data = parsed;
		}
	} catch {
		// Invalid YAML - return unchanged
		return content;
	}

	if (!data) {
		return content;
	}

	// Remove jolli-specific fields
	const remaining: FrontmatterData = {};
	for (const [key, value] of Object.entries(data)) {
		if (!JOLLI_FIELDS.includes(key)) {
			remaining[key] = value;
		}
	}

	const afterFrontmatter = normalized.slice(rawYaml.length);

	// If no fields remain, remove entire frontmatter
	if (Object.keys(remaining).length === 0) {
		return afterFrontmatter;
	}

	// Regenerate frontmatter with remaining fields
	const newYaml = stringifyYaml(remaining, { lineWidth: 0 }).trimEnd();
	return `---\n${newYaml}\n---${trailingNewline}${afterFrontmatter}`;
}
