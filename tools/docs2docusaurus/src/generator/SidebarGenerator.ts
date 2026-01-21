import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface SidebarItem {
	type?: string;
	label?: string;
	items?: Array<SidebarItem | string>;
	collapsed?: boolean;
}

export interface SidebarConfig {
	docs: Array<string | SidebarItem>;
}

export class SidebarGenerator {
	/**
	 * Generate sidebar configuration from docs directory structure
	 */
	generate(docsPath: string, outputPath: string): void {
		const sidebar = this.scanDocsDirectory(docsPath);
		const sidebarContent = this.generateSidebarFile(sidebar);

		const sidebarPath = join(outputPath, "sidebars.js");
		writeFileSync(sidebarPath, sidebarContent);
	}

	/**
	 * Scan docs directory and build sidebar structure
	 */
	private scanDocsDirectory(docsPath: string): SidebarConfig {
		const items: Array<string | SidebarItem> = [];

		// Check for intro.md or index.md at root
		if (existsSync(join(docsPath, "intro.md"))) {
			items.push("intro");
		} else if (existsSync(join(docsPath, "index.md"))) {
			items.push("index");
		}

		// Scan for directories and files
		const entries = readdirSync(docsPath).filter(
			entry => !entry.startsWith(".") && entry !== "intro.md" && entry !== "index.md",
		);

		for (const entry of entries) {
			const entryPath = join(docsPath, entry);
			const stat = statSync(entryPath);

			if (stat.isDirectory()) {
				// Process directory as category
				const categoryItems = this.scanDirectory(entryPath, docsPath);
				if (categoryItems.length > 0) {
					items.push({
						type: "category",
						label: this.humanizeLabel(entry),
						items: categoryItems,
						collapsed: true,
					});
				}
			} else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
				// Process markdown file
				const docId = this.getDocId(entryPath, docsPath);
				items.push(docId);
			}
		}

		return { docs: items };
	}

	/**
	 * Recursively scan a directory for documentation
	 */
	private scanDirectory(dirPath: string, docsRoot: string): Array<string | SidebarItem> {
		const items: Array<string | SidebarItem> = [];
		const entries = readdirSync(dirPath).filter(entry => !entry.startsWith("."));

		// Check for overview.md or index.md first
		if (entries.includes("overview.md")) {
			items.push(this.getDocId(join(dirPath, "overview.md"), docsRoot));
		} else if (entries.includes("index.md")) {
			items.push(this.getDocId(join(dirPath, "index.md"), docsRoot));
		}

		// Process other entries
		for (const entry of entries) {
			if (entry === "overview.md" || entry === "index.md") {
				continue;
			}

			const entryPath = join(dirPath, entry);
			const stat = statSync(entryPath);

			if (stat.isDirectory()) {
				// Recursively process subdirectory
				const subItems = this.scanDirectory(entryPath, docsRoot);
				if (subItems.length > 0) {
					items.push({
						type: "category",
						label: this.humanizeLabel(entry),
						items: subItems,
						collapsed: true,
					});
				}
			} else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
				// Add markdown file
				const docId = this.getDocId(entryPath, docsRoot);
				items.push(docId);
			}
		}

		return items;
	}

	/**
	 * Get document ID from file path
	 */
	private getDocId(filePath: string, docsRoot: string): string {
		// Get relative path from docs root
		let docId = relative(docsRoot, filePath);

		// Remove file extension
		docId = docId.replace(/\.(md|mdx)$/, "");

		// Convert backslashes to forward slashes (Windows compatibility)
		docId = docId.replace(/\\/g, "/");

		return docId;
	}

	/**
	 * Convert directory/file name to human-readable label
	 */
	private humanizeLabel(name: string): string {
		return name
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, char => char.toUpperCase())
			.replace(/Api/g, "API")
			.replace(/Id/g, "ID")
			.replace(/Url/g, "URL");
	}

	/**
	 * Generate the sidebars.js file content
	 */
	private generateSidebarFile(sidebar: SidebarConfig): string {
		return `/**
 * Creating a sidebar enables you to:
 * - create an ordered group of docs
 * - render a sidebar for each doc of that group
 * - provide next/previous navigation
 *
 * The sidebars can be generated from the filesystem, or explicitly defined here.
 * Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = ${JSON.stringify(sidebar, null, 2)};

module.exports = sidebars;
`;
	}
}
