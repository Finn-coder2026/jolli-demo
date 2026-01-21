/**
 * Matches code changes to impacted documentation sections.
 */

import type {
	ChangedContractRefs,
	ChangedField,
	ImpactedSection,
	ImpactedSectionEntry,
	ImpactMatchOptions,
	ReverseIndex,
	SectionCoverage,
} from "../types.js";

/**
 * Mapping of field name patterns to relevant section heading keywords.
 * When a field matches a pattern, only sections with matching keywords are impacted.
 */
const FIELD_TO_SECTION_MAPPINGS: Record<string, Array<string>> = {
	// Rate limiting fields
	limitPerMinute: ["rate limit", "response", "throttl"],
	rateLimit: ["rate limit", "response", "throttl"],
	rateLimiting: ["rate limit", "response", "throttl"],
	maxRequests: ["rate limit", "throttl", "limit"],

	// Request fields
	requestBody: ["request", "parameter", "body"],
	body: ["request", "body"],
	headers: ["request", "header", "parameter"],
	query: ["request", "query", "parameter"],
	params: ["request", "parameter", "path"],

	// Response fields
	response: ["response", "success", "error"],
	statusCode: ["response", "status", "error"],
	error: ["error", "response"],
	result: ["response", "result"],

	// Authentication fields
	authentication: ["auth", "security", "token"],
	authorization: ["auth", "security", "token"],
	token: ["auth", "security", "token"],
	apiKey: ["auth", "security", "api key"],

	// Timeout/retry fields
	timeout: ["timeout", "configuration", "option"],
	retry: ["retry", "configuration", "option"],
	maxRetries: ["retry", "configuration", "error"],
};

/**
 * Check if a section heading is relevant to a changed field.
 * @param sectionId - Section ID (e.g., "docs::rate-limiting")
 * @param changedFields - Array of changed field names
 * @returns True if the section is relevant to any changed field
 */
export function isSectionRelevantToFields(
	sectionId: string,
	changedFields: Array<ChangedField>,
): boolean {
	if (changedFields.length === 0) {
		return true; // No field info means all sections are potentially relevant
	}

	// Extract section heading from ID (after the last ::)
	const lastColonIndex = sectionId.lastIndexOf("::");
	const heading = lastColonIndex >= 0 ? sectionId.slice(lastColonIndex + 2) : sectionId;
	const normalizedHeading = heading.toLowerCase().replace(/[-_]/g, " ");

	for (const field of changedFields) {
		const keywords = FIELD_TO_SECTION_MAPPINGS[field.field];
		if (keywords) {
			// Check if any keyword matches the section heading
			for (const keyword of keywords) {
				if (normalizedHeading.includes(keyword.toLowerCase())) {
					return true;
				}
			}
		} else {
			// For unmapped fields, check if the field name appears in the heading
			if (normalizedHeading.includes(field.field.toLowerCase())) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Filter sections by field relevance.
 * @param sections - Sections to filter
 * @param changedFields - Changed fields from the contract
 * @returns Filtered sections
 */
export function filterSectionsByFieldRelevance(
	sections: Array<SectionCoverage>,
	changedFields?: Array<ChangedField>,
): Array<SectionCoverage> {
	if (!changedFields || changedFields.length === 0) {
		return sections; // No field info, return all
	}

	return sections.filter(s => isSectionRelevantToFields(s.section_id, changedFields));
}

/**
 * Match changed contract refs to impacted documentation sections.
 * @param changes - Changed contract references
 * @param reverseIndex - Reverse index mapping
 * @param options - Match options (e.g., directOnly)
 * @returns Array of impacted sections
 */
export function matchImpactedSections(
	changes: ChangedContractRefs,
	reverseIndex: ReverseIndex,
	options: ImpactMatchOptions = {},
): Array<ImpactedSection> {
	const impacted: Array<ImpactedSection> = [];

	// Determine reason for each contract change
	const added = new Set(changes.summary?.added || []);
	const removed = new Set(changes.summary?.removed || []);
	const changed = new Set(changes.summary?.changed || []);

	for (const contractRef of changes.changed_contract_refs) {
		// Format contract ref as "type:key" (e.g., "openapi:UsersService_get")
		const formattedRef = `${contractRef.type}:${contractRef.key}`;

		// Look up sections that cover this contract
		let sectionCoverages = reverseIndex[formattedRef] || [];

		// Filter by coverage type if requested
		if (options.directOnly) {
			sectionCoverages = sectionCoverages.filter(s => s.coverage_type === "direct");
		}

		// Filter by field relevance if requested and field info is available
		if (options.fieldFiltering && contractRef.changedFields) {
			sectionCoverages = filterSectionsByFieldRelevance(
				sectionCoverages,
				contractRef.changedFields,
			);
		}

		if (sectionCoverages.length > 0) {
			// Determine reason
			let reason: "added" | "removed" | "changed";
			if (added.has(contractRef.key)) {
				reason = "added";
			} else if (removed.has(contractRef.key)) {
				reason = "removed";
			} else if (changed.has(contractRef.key)) {
				reason = "changed";
			} else {
				// Default to changed if not in summary
				reason = "changed";
			}

			// Convert to entry format
			const sections: Array<ImpactedSectionEntry> = sectionCoverages.map(s => ({
				section_id: s.section_id,
				coverage_type: s.coverage_type,
			}));

			impacted.push({
				contract_ref: formattedRef,
				section_ids: sections.map(s => s.section_id),
				sections,
				reason,
			});
		}
	}

	return impacted;
}

/**
 * Count total unique sections impacted.
 * @param impacted - Array of impacted sections
 * @returns Count of unique sections
 */
export function countUniqueSections(impacted: Array<ImpactedSection>): number {
	const uniqueSections = new Set<string>();
	for (const impact of impacted) {
		for (const sectionId of impact.section_ids) {
			uniqueSections.add(sectionId);
		}
	}
	return uniqueSections.size;
}

/**
 * Count unique sections by coverage type.
 * @param impacted - Array of impacted sections
 * @returns Counts by coverage type
 */
export function countSectionsByCoverage(
	impacted: Array<ImpactedSection>,
): { direct: number; mentioned: number; listed: number } {
	const direct = new Set<string>();
	const mentioned = new Set<string>();
	const listed = new Set<string>();

	for (const impact of impacted) {
		for (const section of impact.sections) {
			switch (section.coverage_type) {
				case "direct":
					direct.add(section.section_id);
					break;
				case "mentioned":
					mentioned.add(section.section_id);
					break;
				case "listed":
					listed.add(section.section_id);
					break;
			}
		}
	}

	return {
		direct: direct.size,
		mentioned: mentioned.size,
		listed: listed.size,
	};
}
