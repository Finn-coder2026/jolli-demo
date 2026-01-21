/**
 * Main updater orchestrator.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { createClient } from "./llm/AnthropicClient.js";
import { loadImpactAnalysis } from "./loaders/ImpactLoader.js";
import { parseSectionId, slugify } from "./loaders/MdxLoader.js";
import { updateImpactedSections } from "./generators/SectionUpdater.js";
import type { UpdatedSection, UpdateResult, UpdaterOptions } from "./types.js";

/**
 * Apply updates to MDX files.
 * @param updatedSections - Sections to update
 * @param docsDir - Documentation directory
 */
function applyUpdates(updatedSections: Array<UpdatedSection>, docsDir: string): void {
	// Group by document path
	const byDoc = new Map<string, Array<UpdatedSection>>();
	for (const section of updatedSections) {
		if (!section.changed) {
			continue; // Skip unchanged sections
		}

		if (!byDoc.has(section.doc_path)) {
			byDoc.set(section.doc_path, []);
		}
		byDoc.get(section.doc_path)!.push(section);
	}

	// Update each document
	for (const [docPath, sections] of byDoc) {
		const filePath = join(docsDir, `${docPath}.mdx`);

		if (!existsSync(filePath)) {
			console.warn(`Warning: File not found: ${filePath}`);
			continue;
		}

		// Read file
		const fileContent = readFileSync(filePath, "utf-8");
		const { data: frontmatter, content } = matter(fileContent);

		// Replace sections in content
		let updatedContent = content;

		for (const section of sections) {
			const { headingSlug } = parseSectionId(section.section_id);

			// Find and replace the section
			// We need to be careful to replace only the specific section
			const lines = updatedContent.split("\n");
			const newLines: Array<string> = [];
			let inTargetSection = false;
			let targetHeadingLevel = 0;
			let foundSection = false;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

				if (headingMatch) {
					const level = headingMatch[1].length;
					const heading = headingMatch[2].trim();
					const slug = slugify(heading);

					if (slug === headingSlug && !foundSection) {
						// Start of target section
						inTargetSection = true;
						targetHeadingLevel = level;
						foundSection = true;

						// Add heading and updated content
						newLines.push(line);
						newLines.push(section.updated_content);
					} else if (inTargetSection && level <= targetHeadingLevel) {
						// End of target section (next heading at same or higher level)
						inTargetSection = false;
						newLines.push(line);
					} else if (!inTargetSection) {
						// Not in target section, keep line
						newLines.push(line);
					}
					// Skip lines inside target section (already replaced)
				} else if (!inTargetSection) {
					// Keep lines outside target section
					newLines.push(line);
				}
			}

			updatedContent = newLines.join("\n");
		}

		// Write updated file
		const newFileContent = matter.stringify(updatedContent, frontmatter);
		writeFileSync(filePath, newFileContent, "utf-8");
		console.log(`  Updated: ${filePath}`);
	}
}

/**
 * Run the documentation auto-updater.
 * @param options - Updater options
 * @returns Update result
 */
export async function runUpdater(options: UpdaterOptions): Promise<UpdateResult> {
	const {
		source,
		artifactsDir,
		docsDir,
		repoPath,
		dryRun = false,
		apiKey,
		model = "claude-sonnet-4-5-20250929",
	} = options;

	// Load impact analysis
	console.log("Loading impact analysis...");
	const impact = loadImpactAnalysis(source, artifactsDir);

	if (impact.impacted_sections.length === 0) {
		console.log("No impacted sections to update.");
		return {
			sections_processed: 0,
			sections_updated: 0,
			sections_unchanged: 0,
			updated_sections: [],
			applied: false,
		};
	}

	console.log(`Found ${impact.summary.total_sections_impacted} impacted sections.`);
	console.log();

	// Create Anthropic client
	console.log("Initializing Anthropic client...");
	const client = createClient(apiKey);
	console.log(`Using model: ${model}`);
	console.log();

	// Process each impacted contract
	const allUpdated: Array<UpdatedSection> = [];

	for (let i = 0; i < impact.impacted_sections.length; i++) {
		const impactedSection = impact.impacted_sections[i];
		console.log(
			`Processing contract ${i + 1}/${impact.impacted_sections.length}: ${impactedSection.contract_ref}`,
		);
		console.log(`  Reason: ${impactedSection.reason}`);
		console.log(`  Sections: ${impactedSection.section_ids.length}`);

		const updated = await updateImpactedSections(
			client,
			model,
			impactedSection,
			docsDir,
			repoPath,
			(sectionId, index, total) => {
				console.log(`  [${index}/${total}] Updating: ${sectionId}`);
			},
		);

		allUpdated.push(...updated);
		console.log();
	}

	// Calculate statistics
	const sectionsUpdated = allUpdated.filter(s => s.changed).length;
	const sectionsUnchanged = allUpdated.length - sectionsUpdated;

	console.log("Update summary:");
	console.log(`  Total sections processed: ${allUpdated.length}`);
	console.log(`  Sections updated: ${sectionsUpdated}`);
	console.log(`  Sections unchanged: ${sectionsUnchanged}`);
	console.log();

	// Apply updates if not dry-run
	if (!dryRun && sectionsUpdated > 0) {
		console.log("Applying updates to MDX files...");
		applyUpdates(allUpdated, docsDir);
		console.log("Updates applied successfully!");
	} else if (dryRun && sectionsUpdated > 0) {
		console.log("DRY RUN: Changes would be applied to:");
		for (const section of allUpdated) {
			if (section.changed) {
				console.log(`  - ${section.doc_path} (${section.section_id})`);
			}
		}
		console.log();
		console.log("Run without --dry-run to apply changes.");
	}

	return {
		sections_processed: allUpdated.length,
		sections_updated: sectionsUpdated,
		sections_unchanged: sectionsUnchanged,
		updated_sections: allUpdated,
		applied: !dryRun && sectionsUpdated > 0,
	};
}
