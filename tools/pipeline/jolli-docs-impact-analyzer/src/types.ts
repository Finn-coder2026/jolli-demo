/**
 * Types for documentation impact analyzer.
 */

/** CLI options for the analyzer */
export interface AnalyzerOptions {
	/** Source identifier (e.g., "openapi-demo") */
	source: string;
	/** Version identifier (e.g., "v1") */
	version: string;
	/** Path to artifacts directory */
	artifactsDir: string;
	/** Only include sections with direct coverage (filters out listed/mentioned) */
	directOnly?: boolean;
}

/** A single field-level change within a contract */
export interface ChangedField {
	/** Field path (e.g., "response.rateLimit.limitPerMinute") */
	field: string;
	/** Previous value (if available from removed line) */
	oldValue?: string;
	/** New value (if available from added line) */
	newValue?: string;
}

/** Contract reference from code changes */
export interface ContractRef {
	/** Type of contract (e.g., "openapi", "config") */
	type: string;
	/** Contract key/identifier */
	key: string;
	/** Field-level changes within this contract (optional) */
	changedFields?: Array<ChangedField>;
}

/** Changed contract references from code scanner */
export interface ChangedContractRefs {
	/** Source identifier */
	source: string;
	/** Array of changed contract references */
	changed_contract_refs: Array<ContractRef>;
	/** Summary of changes */
	summary?: {
		added: Array<string>;
		removed: Array<string>;
		changed: Array<string>;
	};
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

/** Legacy reverse index (section IDs only) */
export interface LegacyReverseIndex {
	[contractRef: string]: Array<string>;
}

/** Options for impact matching */
export interface ImpactMatchOptions {
	/** Only include direct coverage (default: false, include all) */
	directOnly?: boolean;
	/** Filter sections by field relevance (default: false) */
	fieldFiltering?: boolean;
}

/** Impacted section entry with coverage info */
export interface ImpactedSectionEntry {
	/** Section ID */
	section_id: string;
	/** Coverage type */
	coverage_type: CoverageType;
}

/** Impacted section with reason */
export interface ImpactedSection {
	/** Contract reference that changed */
	contract_ref: string;
	/** Section IDs impacted by this change (legacy format) */
	section_ids: Array<string>;
	/** Sections with coverage type info */
	sections: Array<ImpactedSectionEntry>;
	/** Reason for impact (added, removed, changed) */
	reason: "added" | "removed" | "changed";
}

/** Impact analysis result */
export interface ImpactAnalysis {
	/** ISO timestamp when analyzed */
	analyzed_at: string;
	/** Base version analyzed */
	base_version: string;
	/** Source identifier */
	source: string;
	/** Array of impacted sections */
	impacted_sections: Array<ImpactedSection>;
	/** Summary statistics */
	summary: {
		total_contracts_changed: number;
		total_sections_impacted: number;
	};
}

/** Result of analysis operation */
export interface AnalysisResult {
	/** Source identifier */
	source: string;
	/** Version analyzed */
	version: string;
	/** Number of contracts changed */
	contractsChanged: number;
	/** Number of sections impacted */
	sectionsImpacted: number;
	/** Path to output file */
	outputFile: string;
}
