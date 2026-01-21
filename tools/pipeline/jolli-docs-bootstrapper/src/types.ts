/**
 * Types for documentation bootstrapper.
 */

/** CLI options for the bootstrapper */
export interface BootstrapperOptions {
	/** Source identifier (e.g., "openapi-demo") */
	source: string;
	/** Path to the repository to scan */
	repo: string;
	/** Path to the documentation directory */
	docsDir: string;
	/** Whether to enhance with AI (optional, non-critical) */
	aiEnhance?: boolean;
}

/** Information about a discovered API endpoint */
export interface EndpointInfo {
	/** Operation ID (e.g., "RateLimitService_getLimits") */
	operationId: string;
	/** File path relative to repo */
	filePath: string;
	/** HTTP method (get, post, etc.) */
	method: string;
	/** Resource name (e.g., "rate-limit", "users") */
	resource: string;
	/** Friendly title for documentation */
	title: string;
}

/** Result of scanning a repository */
export interface ScanResult {
	/** List of discovered endpoints */
	endpoints: Array<EndpointInfo>;
	/** Source identifier */
	source: string;
}

/** MDX document to be generated */
export interface MdxDocument {
	/** File path relative to docsDir */
	filePath: string;
	/** Full MDX content including frontmatter */
	content: string;
}

/** Frontmatter for MDX documents */
export interface MdxFrontmatter {
	/** Document title */
	title: string;
	/** Contract references this document covers */
	covers: Array<string>;
	/** Tags for categorization */
	tags?: Array<string>;
	/** Description */
	description?: string;
}

/** Result of bootstrap operation */
export interface BootstrapResult {
	/** Number of files created */
	filesCreated: number;
	/** List of created file paths */
	createdFiles: Array<string>;
	/** Source identifier */
	source: string;
}
