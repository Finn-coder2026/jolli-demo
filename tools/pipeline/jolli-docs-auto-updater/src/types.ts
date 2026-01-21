/**
 * Type definitions for documentation auto-updater.
 */

/** Options for running the auto-updater */
export interface UpdaterOptions {
	/** Source identifier (e.g., "openapi-demo") */
	source: string;
	/** Path to artifacts directory */
	artifactsDir: string;
	/** Path to documentation directory */
	docsDir: string;
	/** Path to external repository */
	repoPath: string;
	/** Dry run mode (preview changes without writing) */
	dryRun?: boolean;
	/** Anthropic API key (loaded from env if not provided) */
	apiKey?: string;
	/** Model to use (default: claude-sonnet-4-5-20250929) */
	model?: string;
}

/** Impacted section from impact analyzer */
export interface ImpactedSection {
	/** Contract reference (e.g., "openapi:ServiceName_method") */
	contract_ref: string;
	/** List of section IDs impacted */
	section_ids: Array<string>;
	/** Reason for impact (added, removed, changed) */
	reason: "added" | "removed" | "changed";
}

/** Impact analysis result */
export interface ImpactAnalysis {
	/** When the analysis was performed */
	analyzed_at: string;
	/** Base version analyzed */
	base_version: string;
	/** Source identifier */
	source: string;
	/** List of impacted sections */
	impacted_sections: Array<ImpactedSection>;
	/** Summary statistics */
	summary: {
		total_contracts_changed: number;
		total_sections_impacted: number;
	};
}

/** Section content from MDX file */
export interface SectionContent {
	/** Section ID (e.g., "api/auth/handler::overview") */
	section_id: string;
	/** Document path relative to docs dir */
	doc_path: string;
	/** Heading text */
	heading: string;
	/** Heading level (2, 3, 4, etc.) */
	heading_level: number;
	/** Section content (markdown) */
	content: string;
	/** Page frontmatter */
	frontmatter: Record<string, unknown>;
}

/** Updated section with new content */
export interface UpdatedSection {
	/** Section ID */
	section_id: string;
	/** Document path */
	doc_path: string;
	/** Original content */
	original_content: string;
	/** Updated content from LLM */
	updated_content: string;
	/** Whether the content changed */
	changed: boolean;
}

/** Result of update operation */
export interface UpdateResult {
	/** Total sections processed */
	sections_processed: number;
	/** Sections that were updated */
	sections_updated: number;
	/** Sections that had no changes */
	sections_unchanged: number;
	/** List of updated sections */
	updated_sections: Array<UpdatedSection>;
	/** Whether changes were applied (false in dry-run mode) */
	applied: boolean;
}
