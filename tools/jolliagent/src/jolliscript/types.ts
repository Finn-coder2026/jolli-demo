import type { Code, RootContent } from "mdast";

export type Fence = {
	lang: string | null;
	meta: string | null;
	value: string;
	node: Code;
};

/**
 * Parsed front matter data from YAML/TOML block at start of markdown
 */
export type FrontMatter = Record<string, unknown>;

/**
 * Article type for JolliScript front matter.
 * - "jolliscript": The entire markdown content (minus front matter) is used as the prompt
 * - "default": Traditional Jolli_Main section extraction is used
 */
export type ArticleType = "jolliscript" | "default";

/**
 * JRN trigger matcher configuration.
 * Defines a pattern and verb to match against JRN events.
 */
export interface JrnTriggerMatcher {
	/** JRN path pattern (supports glob patterns like .gitignore) */
	jrn?: string;
	/** Event verb that triggers this article */
	verb?: "CREATED" | "REMOVED" | "GIT_PUSH";
}

/**
 * Configuration for running a tool in a job step.
 * The tool name and its arguments are specified here.
 */
export interface RunToolConfig {
	/** Name of the tool to run (e.g., "sync_up_article") */
	name: string;
	/** Tool-specific arguments (varies by tool) */
	[key: string]: unknown;
}

/**
 * A single step in a job workflow.
 * Similar to GitHub Actions step syntax.
 * A step can run a shell command, execute a tool, or run an agent prompt.
 * Only one of run, run_tool, or run_prompt should be specified per step.
 */
export interface JobStep {
	/** Display name for the step */
	name?: string;
	/** Command or script to run (mutually exclusive with run_tool and run_prompt) */
	run?: string;
	/** Tool to execute (mutually exclusive with run and run_prompt) */
	run_tool?: RunToolConfig;
	/** Agent prompt to execute (mutually exclusive with run and run_tool). Supports multiline. */
	run_prompt?: string;
	/** When true, prepend a summary of previous step results to the prompt. Only applies to run_prompt steps. */
	include_summary?: boolean;
}

/**
 * Job configuration for workflow execution.
 * Contains a sequence of steps to execute.
 */
export interface JobConfig {
	/** Array of steps to execute in order */
	steps?: Array<JobStep>;
}

/**
 * Resource attachment configuration.
 * Defines a JRN resource to attach to the workflow context.
 */
export interface AttendResource {
	/** JRN path to the resource */
	jrn: string;
	/** Specific markdown section to include (by heading ID) */
	section_id?: string;
	/** Display name for the resource in the workflow context */
	name?: string;
}

/**
 * Front matter structure for JolliScript articles.
 * Used to configure how articles are processed and triggered.
 */
export interface JolliScriptFrontMatter extends FrontMatter {
	/** Version of the JolliScript format used by this article */
	version?: number;
	/** Article type - determines how the article is processed. Defaults to "default" if not specified. */
	article_type?: ArticleType;
	/** Trigger configuration for JRN events - can be a single matcher or an array of matchers */
	on?: JrnTriggerMatcher | Array<JrnTriggerMatcher>;
	/** Resource attachments - JRN resources to make available to the workflow */
	attend?: Array<AttendResource>;
	/** Job configuration with steps to execute */
	job?: JobConfig;
}

export type Section = {
	title: string | null; // preamble uses null; headings use plain-text title
	content: string; // flattened text content of this section
	rawContent: Array<RootContent>; // raw mdast nodes belonging to this section
	fences: Array<Fence>; // all fenced code blocks found within content (recursive)
	startLine: number; // 0-indexed line where section starts (heading line or first content line)
	endLine: number; // 0-indexed line where section ends (last content line before next section)
	headingDepth?: number | undefined; // 1-6 for headings (H1-H6), undefined for preamble
	isFrontMatter?: boolean; // true if this section represents YAML/TOML front matter
	frontMatter?: FrontMatter; // parsed front matter data (only present when isFrontMatter is true)
};

export type AST = {
	sections: Array<Section>;
};
