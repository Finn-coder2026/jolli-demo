/**
 * Types for documentation compiler.
 */

/** CLI options for the compiler */
export interface CompilerOptions {
	/** Source identifier (e.g., "openapi-demo") */
	source: string;
	/** Path to the documentation directory */
	docsDir: string;
	/** Version identifier (e.g., "v1", "v2") */
	version: string;
	/** Output directory for artifacts */
	outputDir: string;
}

/** Parsed MDX document with frontmatter */
export interface ParsedMdxDocument {
	/** File path relative to docsDir */
	filePath: string;
	/** Parsed frontmatter data */
	frontmatter: MdxFrontmatter;
	/** Document content (without frontmatter) */
	content: string;
	/** Sections split by headings */
	sections: Array<DocumentSection>;
}

/** MDX document frontmatter */
export interface MdxFrontmatter {
	/** Document title */
	title?: string;
	/** Contract references this document covers */
	covers?: Array<string>;
	/** Tags for categorization */
	tags?: Array<string>;
	/** Description */
	description?: string;
}

/** A section within a document */
export interface DocumentSection {
	/** Heading text */
	heading: string;
	/** Heading level (2 for ##, 3 for ###, etc.) */
	headingLevel: number;
	/** Content of this section (excluding the heading) */
	content: string;
	/** Section-specific frontmatter (if any) */
	frontmatter?: MdxFrontmatter;
}

/** Contract coverage with type information */
export interface ContractCoverage {
	/** Contract reference (e.g., "openapi:UsersService_get") */
	contract_ref: string;
	/** How this section covers the contract */
	coverage_type: CoverageType;
}

/** A section in the content graph */
export interface GraphSection {
	/** Unique section ID: "<doc_path>::<heading_slug>" */
	section_id: string;
	/** Document path relative to docsDir */
	doc_path: string;
	/** Heading text */
	heading: string;
	/** Heading level (2, 3, 4, etc.) */
	heading_level: number;
	/** SHA256 hash of section content */
	content_hash: string;
	/** Contract references covered by this section (legacy, just refs) */
	covers: Array<string>;
	/** Contract coverage with type information */
	covers_with_type: Array<ContractCoverage>;
	/** Word count of section content */
	word_count: number;
}

/** Content graph output */
export interface ContentGraph {
	/** Version identifier */
	version: string;
	/** ISO timestamp when generated */
	generated_at: string;
	/** All sections in the graph */
	sections: Array<GraphSection>;
}

/** Coverage type indicating how a section relates to a contract */
export type CoverageType = "direct" | "mentioned" | "listed";

/** Section coverage entry with type information */
export interface SectionCoverage {
	/** Section ID */
	section_id: string;
	/** How this section covers the contract */
	coverage_type: CoverageType;
}

/** Reverse index mapping contract refs to section coverage entries */
export interface ReverseIndex {
	[contractRef: string]: Array<SectionCoverage>;
}

/** Legacy reverse index format (section IDs only) */
export interface LegacyReverseIndex {
	[contractRef: string]: Array<string>;
}

/** Result of compilation */
export interface CompilationResult {
	/** Version identifier */
	version: string;
	/** Source identifier */
	source: string;
	/** Number of documents processed */
	documentsProcessed: number;
	/** Number of sections created */
	sectionsCreated: number;
	/** Paths to generated files */
	outputFiles: {
		graph: string;
		reverseIndex: string;
		sections: string;
	};
}
