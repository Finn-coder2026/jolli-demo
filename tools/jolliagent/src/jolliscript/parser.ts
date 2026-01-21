import type { Fence, FrontMatter, Section } from "./types";
import type { Code, Heading, Html as HtmlNode, Root, RootContent } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";

// Re-export types for consumers
export type {
	ArticleType,
	AttendResource,
	Fence,
	FrontMatter,
	JobConfig,
	JobStep,
	JolliScriptFrontMatter,
	JrnTriggerMatcher,
	RunToolConfig,
	Section,
} from "./types";

// YAML front matter node type from remark-frontmatter
interface YamlNode {
	type: "yaml";
	value: string;
	position?: {
		start: { line: number; column: number; offset: number };
		end: { line: number; column: number; offset: number };
	};
}

function headingText(h: Heading): string {
	// Use mdast-util-to-string to reliably extract plain text from heading content
	return mdastToString(h);
}

function collectFences(node: RootContent | Root, out: Array<Fence>): void {
	if (!node) {
		return;
	}
	if (node.type === "code") {
		const c = node as Code;
		// Collect ALL fences, including joi
		out.push({
			lang: c.lang ?? null,
			meta: c.meta ?? null,
			value: c.value ?? "",
			node: c,
		});
	}
	// Recursively walk children when present
	if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
		for (const child of (node as { children?: Array<RootContent> }).children ?? []) {
			collectFences(child, out);
		}
	}
}

// Convert nodes to content string, including ALL code blocks (including joi)
function nodesToContent(nodes: Array<RootContent>): string {
	const parts: Array<string> = [];

	for (const node of nodes) {
		if (node.type === "code") {
			const code = node as Code;
			// Include ALL code blocks with proper formatting (including joi)
			const fence = "```";
			const lang = code.lang || "";
			parts.push(`${fence}${lang}\n${code.value}\n${fence}`);
		} else if (node.type === "paragraph" || node.type === "heading") {
			// For paragraphs and headings, use toString
			parts.push(mdastToString(node));
		} else if (node.type === "list" || node.type === "blockquote") {
			// For lists and blockquotes, use toString
			parts.push(mdastToString(node));
		} else if (node.type === "thematicBreak") {
			parts.push("---");
		} else if (node.type === "html") {
			parts.push((node as HtmlNode).value || "");
		} else {
			// For other types, try toString
			parts.push(mdastToString(node));
		}
	}

	return parts.filter(p => p.length > 0).join("\n\n");
}

/**
 * Parse a YAML front matter node and return parsed data
 */
function parseFrontMatterYaml(yamlNode: YamlNode): FrontMatter | undefined {
	try {
		const parsed = parseYaml(yamlNode.value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as FrontMatter;
		}
		return;
	} catch {
		// Invalid YAML - return undefined
		return;
	}
}

/**
 * Create a front matter section from a YAML node
 */
function createFrontMatterSection(yamlNode: YamlNode): Section {
	const frontMatter = parseFrontMatterYaml(yamlNode);
	const startLine = yamlNode.position?.start.line ? yamlNode.position.start.line - 1 : 0;
	const endLine = yamlNode.position?.end.line ? yamlNode.position.end.line - 1 : 0;

	const section: Section = {
		title: null,
		content: yamlNode.value,
		rawContent: [yamlNode as unknown as RootContent],
		fences: [],
		startLine,
		endLine,
		isFrontMatter: true,
	};

	if (frontMatter) {
		section.frontMatter = frontMatter;
	}

	return section;
}

export function parseSections(
	markdown: string,
	{ minDepth = 1, maxDepth = 6 }: { minDepth?: number; maxDepth?: number } = {},
): Array<Section> {
	// Use unified with remark-parse and remark-frontmatter to parse markdown with front matter support
	const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
	const tree = processor.parse(markdown) as Root;
	const children = tree.children ?? [];

	const sections: Array<Section> = [];
	let currentRawContent: Array<RootContent> = [];
	let currentFences: Array<Fence> = [];
	let currentTitle: string | null = null;
	let currentHeading: Heading | null = null;

	const isStart = (n: RootContent): n is Heading =>
		n.type === "heading" && (n as Heading).depth >= minDepth && (n as Heading).depth <= maxDepth;

	const finishSection = () => {
		// Calculate startLine and endLine from mdast position information
		let startLine = 0;
		let endLine = 0;
		let headingDepth: number | undefined;

		if (currentHeading?.position) {
			// Section starts at heading line (convert from 1-indexed to 0-indexed)
			startLine = currentHeading.position.start.line - 1;
			headingDepth = currentHeading.depth;

			// If there's content after the heading, end at last content node
			// Otherwise, end at the heading itself
			if (currentRawContent.length > 0) {
				const lastNode = currentRawContent[currentRawContent.length - 1];
				if (lastNode.position) {
					endLine = lastNode.position.end.line - 1;
				} else {
					endLine = currentHeading.position.end.line - 1;
				}
			} else {
				endLine = currentHeading.position.end.line - 1;
			}
		} else if (currentRawContent.length > 0) {
			// Preamble section (no heading)
			const firstNode = currentRawContent[0];
			const lastNode = currentRawContent[currentRawContent.length - 1];

			if (firstNode.position) {
				startLine = firstNode.position.start.line - 1;
			}
			if (lastNode.position) {
				endLine = lastNode.position.end.line - 1;
			}
		}
		// else: Empty preamble section - startLine and endLine remain 0

		sections.push({
			title: currentTitle,
			content: nodesToContent(currentRawContent),
			rawContent: currentRawContent,
			fences: currentFences,
			startLine,
			endLine,
			headingDepth,
		});
		currentRawContent = [];
		currentFences = [];
		currentHeading = null;
	};

	for (const node of children) {
		// Handle YAML front matter as a special first section
		if (node.type === "yaml") {
			// Front matter must be first - if we have any sections or content, skip it
			if (sections.length === 0 && currentRawContent.length === 0 && currentHeading === null) {
				sections.push(createFrontMatterSection(node as YamlNode));
			}
			continue;
		}

		if (isStart(node)) {
			// close current section (preamble or prior section)
			finishSection();
			const h = node as Heading;
			currentTitle = headingText(h);
			currentHeading = h;
		} else {
			// Collect fences from ALL nodes (including joi)
			collectFences(node, currentFences);

			// Include ALL nodes in rawContent (including joi blocks)
			currentRawContent.push(node);
		}
	}

	finishSection();
	return sections;
}

/**
 * Convert a single section back to markdown string.
 * Handles front matter, headings, and preamble sections.
 * @param section the section to convert
 * @param originalContent optional original markdown content for heading level detection
 */
export function sectionToMarkdown(section: Section, originalContent?: string): string {
	// Front matter - wrap with --- delimiters
	if (section.isFrontMatter) {
		return `---\n${section.content}\n---`;
	}

	// Section with heading
	if (section.title) {
		// Use headingDepth if available, otherwise try to detect from original content
		let headingLevel = section.headingDepth ?? 2;
		if (!section.headingDepth && originalContent) {
			const escapedTitle = section.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const headingMatch = originalContent.match(new RegExp(`^(#+)\\s+${escapedTitle}`, "m"));
			if (headingMatch) {
				headingLevel = headingMatch[1].length;
			}
		}
		const heading = `${"#".repeat(headingLevel)} ${section.title}`;
		return section.content ? `${heading}\n\n${section.content}` : heading;
	}

	// Preamble - just return content
	return section.content;
}

/**
 * Convert an array of sections back to a markdown string.
 * Preserves front matter, headings, and content.
 * @param sections the sections to convert
 * @param originalContent optional original markdown content for heading level detection
 */
export function sectionsToMarkdown(sections: Array<Section>, originalContent?: string): string {
	return sections.map(s => sectionToMarkdown(s, originalContent)).join("\n\n");
}
