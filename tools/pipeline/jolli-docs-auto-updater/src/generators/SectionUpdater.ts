/**
 * Updates documentation sections using LLM.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { generateUpdatedContent } from "../llm/AnthropicClient.js";
import { loadRouteFileContent, loadSectionContent } from "../loaders/MdxLoader.js";
import type { ImpactedSection, SectionContent, UpdatedSection } from "../types.js";

/**
 * Update a single section using LLM.
 * @param client - Anthropic client
 * @param model - Model to use
 * @param sectionId - Section ID to update
 * @param contractRef - Contract reference
 * @param docsDir - Documentation directory
 * @param repoPath - Repository path
 * @returns Updated section
 */
export async function updateSection(
	client: Anthropic,
	model: string,
	sectionId: string,
	contractRef: string,
	docsDir: string,
	repoPath: string,
): Promise<UpdatedSection> {
	// Load current section content
	const sectionContent = loadSectionContent(sectionId, docsDir);

	// Load route file content
	let routeFileContent: string;
	try {
		routeFileContent = loadRouteFileContent(contractRef, repoPath);
	} catch (error) {
		console.warn(`Warning: Could not load route file for ${contractRef}: ${error}`);
		// Return unchanged if we can't load the route file
		return {
			section_id: sectionId,
			doc_path: sectionContent.doc_path,
			original_content: sectionContent.content,
			updated_content: sectionContent.content,
			changed: false,
		};
	}

	// Generate updated content using LLM
	const updatedContent = await generateUpdatedContent(
		client,
		model,
		sectionContent.content,
		routeFileContent,
		contractRef,
	);

	// Check if content changed
	const changed = updatedContent.trim() !== sectionContent.content.trim();

	return {
		section_id: sectionId,
		doc_path: sectionContent.doc_path,
		original_content: sectionContent.content,
		updated_content: updatedContent,
		changed,
	};
}

/**
 * Update all sections for a contract.
 * @param client - Anthropic client
 * @param model - Model to use
 * @param impact - Impacted section data
 * @param docsDir - Documentation directory
 * @param repoPath - Repository path
 * @param onProgress - Progress callback
 * @returns Array of updated sections
 */
export async function updateImpactedSections(
	client: Anthropic,
	model: string,
	impact: ImpactedSection,
	docsDir: string,
	repoPath: string,
	onProgress?: (sectionId: string, index: number, total: number) => void,
): Promise<Array<UpdatedSection>> {
	const results: Array<UpdatedSection> = [];
	const total = impact.section_ids.length;

	for (let i = 0; i < impact.section_ids.length; i++) {
		const sectionId = impact.section_ids[i];

		if (onProgress) {
			onProgress(sectionId, i + 1, total);
		}

		try {
			const result = await updateSection(
				client,
				model,
				sectionId,
				impact.contract_ref,
				docsDir,
				repoPath,
			);
			results.push(result);
		} catch (error) {
			console.error(`Error updating section ${sectionId}:`, error);
			// Continue with other sections even if one fails
		}
	}

	return results;
}
