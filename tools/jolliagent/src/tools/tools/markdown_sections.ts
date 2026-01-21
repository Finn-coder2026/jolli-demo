import { parseMarkdownToDocument } from "../../markdown/sections";
import type { RunState, ToolDef } from "../../Types";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const markdown_sections_tool_def: ToolDef = {
	name: "markdown_sections",
	description:
		"Extract sections from markdown into { frontmatter, sections[] } with title, text, metadata, and citations links.",
	parameters: {
		type: "object",
		properties: {
			filename: { type: "string", description: "Filename to extract the sections" },
		},
		required: ["filename"],
	},
};

// Type for citation metadata
type Citation = {
	file?: string;
	lines?: string | number;
	description?: string;
};

type SectionMetadata = {
	citations?: Array<Citation>;
	[key: string]: unknown;
};

// Implementation (same for both local and E2B)
export function executeMarkdownSectionsTool(runState: RunState, content?: string): string {
	try {
		const fromEnv = runState?.env_vars?.MARKDOWN_INPUT;
		const contentResolved = content && typeof content === "string" && content.length > 0 ? content : fromEnv;
		if (!contentResolved || typeof contentResolved !== "string") {
			return "Error: 'content' (markdown text) is required for markdown_sections. You can also set env_vars.MARKDOWN_INPUT in run state.";
		}
		const model = parseMarkdownToDocument(contentResolved);
		const sections = model.sections.map(s => {
			const metadata = s.metadata as SectionMetadata | undefined;
			const citations = Array.isArray(metadata?.citations) ? (metadata.citations as Array<Citation>) : [];
			const links = citations
				.map(c => ({ file: c?.file, lines: c?.lines, description: c?.description }))
				.filter(c => typeof c.file === "string");
			return { title: s.title, body: s.text, metadata: s.metadata, links };
		});
		const out = { frontmatter: model.frontmatter?.yaml ?? null, sections };
		return JSON.stringify(out);
	} catch (error) {
		const err = error as { message?: string };
		return `Error extracting markdown sections: ${err.message ?? String(error)}`;
	}
}

// Unified executor
export const markdownSectionsExecutor: ToolExecutor = (runState, args) => {
	const typedArgs = args as { content?: string } | undefined;
	return executeMarkdownSectionsTool(runState, typedArgs?.content);
};
