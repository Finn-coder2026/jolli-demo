/**
 * Types for documentation diff generator.
 */

/** CLI options for the diff generator */
export interface DiffGeneratorOptions {
	/** Source identifier (e.g., "openapi-demo") */
	source: string;
	/** From version (e.g., "v1") */
	fromVersion: string;
	/** To version (e.g., "v2") */
	toVersion: string;
	/** Path to artifacts directory */
	artifactsDir: string;
}

/** Section in content graph */
export interface GraphSection {
	/** Unique section ID */
	section_id: string;
	/** Document path */
	doc_path: string;
	/** Heading text */
	heading: string;
	/** Heading level */
	heading_level: number;
	/** Content hash */
	content_hash: string;
	/** Contract references */
	covers: Array<string>;
	/** Word count */
	word_count: number;
}

/** Content graph */
export interface ContentGraph {
	/** Version identifier */
	version: string;
	/** Generation timestamp */
	generated_at: string;
	/** Sections */
	sections: Array<GraphSection>;
}

/** Section that was added */
export interface AddedSection {
	/** Section ID */
	section_id: string;
	/** Content hash */
	content_hash: string;
	/** Contract references */
	covers: Array<string>;
}

/** Section that was removed */
export interface RemovedSection {
	/** Section ID */
	section_id: string;
	/** Content hash */
	content_hash: string;
}

/** Section that was modified */
export interface ModifiedSection {
	/** Section ID */
	section_id: string;
	/** Old content hash */
	old_hash: string;
	/** New content hash */
	new_hash: string;
}

/** Diff between two versions */
export interface VersionDiff {
	/** From version */
	from_version: string;
	/** To version */
	to_version: string;
	/** Generation timestamp */
	generated_at: string;
	/** Added sections */
	added: Array<AddedSection>;
	/** Removed sections */
	removed: Array<RemovedSection>;
	/** Modified sections */
	modified: Array<ModifiedSection>;
	/** Summary statistics */
	summary: {
		added_count: number;
		removed_count: number;
		modified_count: number;
		unchanged_count: number;
	};
}

/** Result of diff generation */
export interface DiffResult {
	/** Source identifier */
	source: string;
	/** From version */
	fromVersion: string;
	/** To version */
	toVersion: string;
	/** Number of added sections */
	addedCount: number;
	/** Number of removed sections */
	removedCount: number;
	/** Number of modified sections */
	modifiedCount: number;
	/** Path to output file */
	outputFile: string;
}
