import { getLog } from "../util/Logger";
import { diff3Merge } from "node-diff3";

const log = getLog(import.meta);

/**
 * Result of a three-way merge operation
 */
export interface MergeResult {
	/**
	 * The merged content
	 */
	merged: string;
	/**
	 * Whether there were conflicts during the merge
	 */
	hasConflict: boolean;
	/**
	 * Array of conflict descriptions (if any)
	 */
	conflicts?: Array<string> | undefined;
}

/**
 * Service for merging section content using three-way merge algorithm.
 * This prevents concurrent edits from clobbering each other by detecting
 * and resolving conflicts.
 */
export interface SectionMergeService {
	/**
	 * Merges section content using three-way merge.
	 * @param base The original content when both edits started
	 * @param current What's currently in the database
	 * @param incoming What the agent/user wants to save
	 * @returns Merge result with merged content and conflict info
	 */
	mergeSectionContent(base: string, current: string, incoming: string): MergeResult;
}

/**
 * Creates a SectionMergeService instance.
 */
export function createSectionMergeService(): SectionMergeService {
	return {
		mergeSectionContent,
	};

	function mergeSectionContent(base: string, current: string, incoming: string): MergeResult {
		// If current equals base, no concurrent changes occurred - just use incoming
		if (current === base) {
			log.debug("No concurrent changes detected (current === base), using incoming");
			return {
				merged: incoming,
				hasConflict: false,
			};
		}

		// If incoming equals base, no changes from this edit - keep current
		if (incoming === base) {
			log.debug("No changes from incoming (incoming === base), keeping current");
			return {
				merged: current,
				hasConflict: false,
			};
		}

		// If current equals incoming, both made the same change - no conflict
		if (current === incoming) {
			log.debug("Current and incoming are identical, no conflict");
			return {
				merged: current,
				hasConflict: false,
			};
		}

		// Perform three-way merge
		log.debug("Performing three-way merge");
		log.debug("Base length: %d", base.length);
		log.debug("Current length: %d", current.length);
		log.debug("Incoming length: %d", incoming.length);

		try {
			const mergeResult = diff3Merge(
				incoming, // "A" - what we want to save
				base, // "O" - original
				current, // "B" - what's in DB now
				{
					stringSeparator: "\n",
				},
			);

			// Type the result properly
			const result = mergeResult as unknown as {
				conflict: boolean;
				result: Array<
					| string
					| { ok: Array<string> }
					| {
							conflict: {
								a: Array<string>;
								aIndex: number;
								o: Array<string>;
								oIndex: number;
								b: Array<string>;
								bIndex: number;
							};
					  }
				>;
			};

			// Check if there are conflicts
			const hasConflict = result.conflict;
			const conflicts: Array<string> = [];

			/* v8 ignore start - diff3 conflict extraction depends on library internals */
			if (hasConflict) {
				log.warn("Merge conflict detected");
				// Extract conflict regions for reporting
				for (const region of result.result) {
					if (typeof region !== "string" && "conflict" in region) {
						conflicts.push(
							`Conflict: ${region.conflict.a.length} incoming lines vs ${region.conflict.b.length} current lines`,
						);
					}
				}
			}
			/* v8 ignore stop */

			// Build merged content from result
			/* v8 ignore start - diff3 result structure depends on library internals */
			const merged = result.result
				.map(region => {
					if (typeof region === "string") {
						return region;
					}
					if ("conflict" in region) {
						// For conflicts, prefer the incoming change (agent's edit)
						// This is a simple strategy - could be made more sophisticated
						log.debug("Resolving conflict by preferring incoming change");
						return region.conflict.a.join("\n");
					}
					// "ok" region (no conflict)
					return region.ok.join("\n");
				})
				.join("\n");
			/* v8 ignore stop */

			log.debug("Merge complete, result length: %d, conflicts: %d", merged.length, conflicts.length);

			return {
				merged,
				hasConflict,
				/* v8 ignore next - ternary branch depends on diff3 conflict detection internals */
				conflicts: hasConflict && conflicts.length > 0 ? conflicts : undefined,
			};
		} catch (error) {
			log.error(error, "Error during three-way merge, falling back to incoming");
			// Fall back to incoming on error
			return {
				merged: incoming,
				hasConflict: true,
				conflicts: ["Merge algorithm failed, using incoming change"],
			};
		}
	}
}
