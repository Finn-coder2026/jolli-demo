import type Agent from "../agents/Agent";
import type { AgentOptions, ChatOptions } from "../agents/Agent";
import { createAgent } from "../agents/factory";
import { parseSections } from "./parser";
import type { AST, JolliScriptFrontMatter, Section } from "./types";

type AgentKind = Parameters<typeof createAgent>[0];

export interface MarkdownAgentFactoryOptions {
	markdown: string;
	/**
	 * Heading to treat as the primary Jolli section.
	 * Defaults to "Jolli_Main" to match jollirender conventions.
	 * Ignored when front matter specifies article_type: "jolliscript".
	 */
	sectionTitle?: string;
	parserOptions?: { minDepth?: number; maxDepth?: number };
	agentKind?: AgentKind;
	agentOverrides?: AgentOptions;
}

export interface MarkdownAgentFactoryResult {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
	prompt: string;
	ast: AST;
	section: Section;
	/** The article type detected from front matter (defaults to "default") */
	articleType: "jolliscript" | "default";
}

function findSectionByTitle(sections: Array<Section>, wantedTitle: string): Section | undefined {
	const target = wantedTitle.trim().toLowerCase();
	return sections.find(section => (section.title ?? "").trim().toLowerCase() === target);
}

function extractJoiPrompt(section: Section): string {
	const joiFence = section.fences.find(fence => (fence.lang ?? "").toLowerCase() === "joi");
	if (!joiFence) {
		throw new Error(`Section "${section.title ?? "<preamble>"}" does not contain a \`\`\`joi block`);
	}
	const prompt = joiFence.value ?? "";
	if (!prompt.trim()) {
		throw new Error(`Section "${section.title ?? "<preamble>"}" has an empty \`\`\`joi block`);
	}
	return prompt;
}

/**
 * Extract the article type from front matter
 */
function getArticleType(sections: Array<Section>): "jolliscript" | "default" {
	const frontMatterSection = sections.find(s => s.isFrontMatter);
	if (!frontMatterSection?.frontMatter) {
		return "default";
	}
	const fm = frontMatterSection.frontMatter as JolliScriptFrontMatter;
	return fm.article_type === "jolliscript" ? "jolliscript" : "default";
}

/**
 * Extract the full content (minus front matter) as the prompt for jolliscript articles
 */
function extractFullContentPrompt(sections: Array<Section>): string {
	// Combine all non-front-matter sections into a single prompt
	const contentSections = sections.filter(s => !s.isFrontMatter);
	const contentParts: Array<string> = [];

	for (const section of contentSections) {
		// Include heading if present
		if (section.title) {
			const headingPrefix = "#".repeat(section.headingDepth || 1);
			contentParts.push(`${headingPrefix} ${section.title}`);
		}
		// Include content
		if (section.content) {
			contentParts.push(section.content);
		}
	}

	const prompt = contentParts.join("\n\n").trim();
	if (!prompt) {
		throw new Error("jolliscript article has no content after front matter");
	}
	return prompt;
}

/**
 * Create an Agent from a markdown document.
 *
 * If the front matter specifies `article_type: jolliscript`, the entire markdown content
 * (minus front matter) is used as the prompt.
 *
 * Otherwise, it treats the Jolli_Main section as the prompt source, extracting
 * the content from the ```joi code block within that section.
 */
export function createMarkdownAgentFromJolliSection(options: MarkdownAgentFactoryOptions): MarkdownAgentFactoryResult {
	if (!options.markdown || options.markdown.trim().length === 0) {
		throw new Error("createMarkdownAgentFromJolliSection requires non-empty markdown text");
	}

	const sections = parseSections(options.markdown, options.parserOptions);
	const ast: AST = { sections };
	const articleType = getArticleType(sections);

	let prompt: string;
	let section: Section;

	if (articleType === "jolliscript") {
		// For jolliscript articles, use the entire content (minus front matter) as the prompt
		prompt = extractFullContentPrompt(sections);
		// Use the first non-front-matter section as the "section" for compatibility
		const contentSections = sections.filter(s => !s.isFrontMatter);
		section = contentSections[0] || {
			title: null,
			content: prompt,
			rawContent: [],
			fences: [],
			startLine: 0,
			endLine: 0,
		};
	} else {
		// Traditional Jolli_Main section extraction
		const sectionTitle = options.sectionTitle ?? "Jolli_Main";
		const foundSection = findSectionByTitle(sections, sectionTitle);
		if (!foundSection) {
			throw new Error(`No section named "${sectionTitle}" was found in the supplied markdown`);
		}
		section = foundSection;
		prompt = extractJoiPrompt(section);
	}

	const { agent, withDefaults } = createAgent(options.agentKind ?? "general", options.agentOverrides);

	return { agent, withDefaults, prompt, ast, section, articleType };
}
