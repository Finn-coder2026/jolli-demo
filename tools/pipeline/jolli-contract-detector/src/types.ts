/**
 * Types for contract detection (environment variables and OpenAPI).
 */

/** Type of contract reference */
export type ContractType = "config" | "openapi";

/** A single contract reference */
export interface ContractRef {
	/** Type of contract: "config" for env vars, "openapi" for API operations */
	type: ContractType;
	/** The contract identifier (env var name or operationId) */
	key: string;
}

/** Summary of changes by category */
export interface ChangeSummary {
	/** Newly added contracts */
	added: Array<string>;
	/** Removed contracts */
	removed: Array<string>;
	/** Modified contracts (value changed or referenced in changed code) */
	changed: Array<string>;
}

/** Output format for changed_contract_refs.json */
export interface ContractChangeOutput {
	/** Source type of contracts detected */
	source: "env" | "openapi";
	/** List of all changed contract references */
	changed_contract_refs: Array<ContractRef>;
	/** Summary categorized by change type */
	summary: ChangeSummary;
}

/** Parsed line from a git diff */
export interface DiffLine {
	/** The line content (without +/- prefix) */
	content: string;
	/** Whether the line was added (+) or removed (-) */
	changeType: "added" | "removed";
	/** The file this line belongs to */
	filePath: string;
}

/** Result of parsing a diff for a single file */
export interface FileDiff {
	/** Path to the file */
	filePath: string;
	/** Lines that were added */
	addedLines: Array<string>;
	/** Lines that were removed */
	removedLines: Array<string>;
}

/** Detector type to use */
export type DetectorType = "env" | "openapi";

/** CLI options for the detector */
export interface DetectorOptions {
	/** Type of detector to use (default: env for backward compatibility) */
	detector: DetectorType;
	/** Base branch/ref to compare against (default: origin/main) */
	base: string;
	/** Output file path (default: changed_contract_refs.json) */
	output: string;
	/** Working directory (default: current directory) */
	cwd: string;
	/** Repository path for external repo scanning (required for openapi detector) */
	repo?: string;
}
