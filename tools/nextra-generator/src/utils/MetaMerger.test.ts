import { MetaMerger } from "./MetaMerger";
import type { ExistingNavMeta, FolderMetaInfo, VirtualGroupMeta } from "jolli-common";
import { describe, expect, test } from "vitest";

describe("MetaMerger", () => {
	// ===== validateSyntax tests =====

	describe("validateSyntax", () => {
		const merger = new MetaMerger();

		test("returns valid for correct TypeScript syntax", () => {
			const content = `export default {
  'index': 'Home',
  'getting-started': 'Getting Started',
  'api-reference': 'API Reference'
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.line).toBeUndefined();
			expect(result.column).toBeUndefined();
		});

		test("returns error with line/column for missing comma", () => {
			const content = `export default {
  'index': 'Home',
  'getting-started': 'Getting Started'
  'api-reference': 'API Reference'
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.line).toBe(4); // Line where error occurs (1-based)
			expect(result.column).toBeDefined();
		});

		test("returns error for missing closing brace", () => {
			const content = `export default {
  'index': 'Home',
  'getting-started': 'Getting Started'
`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});

		test("returns error for missing export default", () => {
			const content = `{
  'index': 'Home',
  'getting-started': 'Getting Started'
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined(); // TypeScript sees this as invalid syntax
		});

		test("returns error for invalid object literal", () => {
			const content = `export default {
  'index': undefined_variable,
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});

		test("handles complex valid content with separators and groups", () => {
			const content = `export default {
  'index': { display: 'hidden' },
  'setup-with-php': 'Setup with PHP',
  'using': {
    type: 'separator',
    title: 'Using LinkAce'
  },
  'the-dashboard': 'The Dashboard',
  'guides': {
    type: 'separator',
    title: 'Guides'
  },
  'api-reference': {
    title: 'API Reference',
    type: 'page',
    href: '/api-docs/linkace-openapi'
  }
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(true);
		});

		test("returns error for syntax error in nested object", () => {
			const content = `export default {
  'index': 'Home',
  'docs': {
    title: 'Docs',
    type: 'page',
    items: {
      'intro': 'Introduction'
      'guide': 'Guide'
    }
  }
}`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(false);
			expect(result.line).toBeGreaterThan(1);
		});

		test("handles trailing semicolon", () => {
			const content = `export default {
  index: 'Home',
  about: 'About',
};`;
			const result = merger.validateSyntax(content);
			expect(result.valid).toBe(true);
		});
	});

	// ===== validateConsistency tests =====

	describe("validateConsistency", () => {
		const merger = new MetaMerger();

		test("returns valid when all entries match content folder", () => {
			const content = `export default {
  'index': 'Home',
  'introduction': 'Introduction',
  'getting-started': 'Getting Started'
}`;
			const contentSlugs = ["index", "introduction", "getting-started"];

			const result = merger.validateConsistency(content, contentSlugs);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toEqual([]);
			expect(result.missingEntries).toEqual([]);
			expect(result.canProceed).toBe(true);
		});

		test("detects orphaned entries (in meta but not in content)", () => {
			const content = `export default {
  'index': 'Home',
  'introduction': 'Introduction',
  'old-article': 'Old Article'
}`;
			const contentSlugs = ["index", "introduction"];

			const result = merger.validateConsistency(content, contentSlugs);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toContain("old-article");
			expect(result.missingEntries).toEqual([]);
			expect(result.canProceed).toBe(true); // Always allow proceed
		});

		test("detects missing entries (in content but not in meta)", () => {
			const content = `export default {
  'index': 'Home'
}`;
			const contentSlugs = ["index", "new-article"];

			const result = merger.validateConsistency(content, contentSlugs);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toEqual([]);
			expect(result.missingEntries).toContain("new-article");
			expect(result.canProceed).toBe(true);
		});

		test("detects both orphaned and missing entries", () => {
			const content = `export default {
  'index': 'Home',
  'orphan-1': 'Orphan 1',
  'orphan-2': 'Orphan 2'
}`;
			const contentSlugs = ["index", "missing-1", "missing-2"];

			const result = merger.validateConsistency(content, contentSlugs);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toContain("orphan-1");
			expect(result.orphanedEntries).toContain("orphan-2");
			expect(result.missingEntries).toContain("missing-1");
			expect(result.missingEntries).toContain("missing-2");
			expect(result.canProceed).toBe(true);
		});

		test("handles virtual groups correctly", () => {
			const content = `export default {
  'index': 'Home',
  'docs': {
    title: 'Docs',
    type: 'page',
    items: {
      'introduction': 'Introduction',
      'getting-started': 'Getting Started'
    }
  }
}`;
			const contentSlugs = ["index", "introduction", "getting-started"];

			const result = merger.validateConsistency(content, contentSlugs);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toEqual([]);
			expect(result.missingEntries).toEqual([]);
		});

		test("returns canProceed true even with syntax errors", () => {
			const content = `export default {
  'index': 'Home'
  'broken': 'Broken'
}`;
			const contentSlugs = ["index"];

			const result = merger.validateConsistency(content, contentSlugs);

			// Can't validate consistency, but still allow proceed
			expect(result.valid).toBe(false);
			expect(result.canProceed).toBe(true);
		});

		test("ignores separators and API pages in consistency check", () => {
			const content = `export default {
  'index': 'Home',
  '---': { type: 'separator' },
  'api-reference': {
    title: 'API Reference',
    type: 'page',
    href: '/api-docs'
  }
}`;
			const contentSlugs = ["index"];

			const result = merger.validateConsistency(content, contentSlugs);

			// Separators and API pages should not count as orphaned
			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toEqual([]);
		});
	});

	// ===== extractSlugsFromMeta tests =====

	describe("extractSlugsFromMeta", () => {
		const merger = new MetaMerger();

		test("extracts slugs from simple entries", () => {
			const content = `export default {
  'index': 'Home',
  'introduction': 'Introduction',
  'getting-started': 'Getting Started'
}`;
			const slugs = merger.extractSlugsFromMeta(content);

			expect(slugs).toContain("index");
			expect(slugs).toContain("introduction");
			expect(slugs).toContain("getting-started");
			expect(slugs).toHaveLength(3);
		});

		test("extracts slugs from virtual groups", () => {
			const content = `export default {
  'index': 'Home',
  'docs': {
    title: 'Docs',
    type: 'page',
    items: {
      'intro': 'Introduction',
      'guide': 'Guide'
    }
  }
}`;
			const slugs = merger.extractSlugsFromMeta(content);

			expect(slugs).toContain("index");
			expect(slugs).toContain("intro");
			expect(slugs).toContain("guide");
			expect(slugs).not.toContain("docs"); // Group key is not an article slug
		});

		test("ignores separators", () => {
			const content = `export default {
  'index': 'Home',
  '---': { type: 'separator' }
}`;
			const slugs = merger.extractSlugsFromMeta(content);

			expect(slugs).toContain("index");
			expect(slugs).not.toContain("---");
		});

		test("ignores API pages", () => {
			const content = `export default {
  'index': 'Home',
  'api-reference': {
    title: 'API Reference',
    type: 'page',
    href: '/api-docs'
  }
}`;
			const slugs = merger.extractSlugsFromMeta(content);

			expect(slugs).toContain("index");
			expect(slugs).not.toContain("api-reference");
		});

		test("returns empty array for invalid content", () => {
			const content = "invalid content";
			const slugs = merger.extractSlugsFromMeta(content);

			expect(slugs).toEqual([]);
		});
	});

	// ===== merge tests =====

	describe("merge", () => {
		const merger = new MetaMerger();

		test("returns skipRegeneration true on syntax error", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home'
  'broken': 'Broken'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(false);
			expect(result.skipRegeneration).toBe(true);
			expect(result.error).toContain("Cannot merge"); // Error message format
			expect(result.report.warnings.length).toBeGreaterThan(0);
		});

		test("returns skipRegeneration true on any unexpected error", () => {
			// Force an error by passing invalid content that passes syntax but fails parsing
			const result = merger.merge({
				existingContent: "not valid at all",
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(false);
			expect(result.skipRegeneration).toBe(true);
		});

		test("successful merge preserves user customizations", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'introduction': '🚀 Getting Started',
  'api-guide': 'API Guide'
}`,
				newArticleSlugs: ["index", "introduction", "api-guide"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"], // Different title
					["api-guide", "API Guide"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.skipRegeneration).toBe(false);
			expect(result.meta).toBeDefined();
			// User's custom title should be preserved
			expect(result.meta?.introduction).toBe("🚀 Getting Started");
			expect(result.report.preserved).toContain("introduction");
		});

		test("adds new articles at the end", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'introduction': 'Introduction'
}`,
				newArticleSlugs: ["index", "introduction", "new-article"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
					["new-article", "New Article"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["new-article"]).toBe("New Article");
			expect(result.report.added).toContain("new-article");
		});

		test("removes orphaned entries", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'introduction': 'Introduction',
  'old-article': 'Old Article'
}`,
				newArticleSlugs: ["index", "introduction"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["old-article"]).toBeUndefined();
			expect(result.report.removed).toContain("old-article");
		});

		test("preserves separators", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  '---': { type: 'separator' },
  'about': 'About'
}`,
				newArticleSlugs: ["index", "about"],
				articleTitles: new Map([
					["index", "Home"],
					["about", "About"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["---"]).toEqual({ type: "separator" });
			expect(result.report.preserved).toContain("---");
		});

		test("preserves API page entries when base has them", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'api-reference': {
    title: 'My Custom API Title',
    type: 'page',
    href: '/api-docs'
  }
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				baseNavMeta: {
					index: "Home",
					"api-reference": {
						title: "API Reference",
						type: "page",
						href: "/api-docs",
					},
				},
			});

			expect(result.success).toBe(true);
			// User's custom title should be preserved
			const apiRef = result.meta?.["api-reference"];
			expect(apiRef).toBeDefined();
			expect((apiRef as { title: string }).title).toBe("My Custom API Title");
		});

		test("removes API page entries when not in base", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'api-reference': {
    title: 'Old API',
    type: 'page',
    href: '/old-api-docs'
  }
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				baseNavMeta: {
					index: "Home",
					// No api-reference in base
				},
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["api-reference"]).toBeUndefined();
			expect(result.report.removed).toContain("api-reference");
		});

		test("preserves external link entries without type field", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'contact': {
    title: 'Contact Us',
    href: 'mailto:hi@example.com'
  },
  'about': 'About'
}`,
				newArticleSlugs: ["index", "about"],
				articleTitles: new Map([
					["index", "Home"],
					["about", "About"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.contact).toEqual({
				title: "Contact Us",
				href: "mailto:hi@example.com",
			});
			expect(result.report.preserved).toContain("contact");
		});

		test("preserves external link with just href (no title)", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'github': {
    href: 'https://github.com/example'
  }
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.github).toEqual({
				href: "https://github.com/example",
			});
			expect(result.report.preserved).toContain("github");
		});

		test("handles virtual groups - preserves items that exist", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'docs': {
    title: 'Documentation',
    type: 'page',
    items: {
      'introduction': '🚀 Getting Started',
      'getting-started': 'Getting Started'
    }
  }
}`,
				newArticleSlugs: ["index", "introduction", "getting-started"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
					["getting-started", "Getting Started"],
				]),
			});

			expect(result.success).toBe(true);
			const docsEntry = result.meta?.docs as VirtualGroupMeta;
			expect(docsEntry).toBeDefined();
			expect(docsEntry.items.introduction).toBe("🚀 Getting Started"); // Preserved
			expect(docsEntry.items["getting-started"]).toBe("Getting Started");
		});

		test("handles virtual groups - removes orphaned items", () => {
			const result = merger.merge({
				existingContent: `export default {
  'docs': {
    title: 'Docs',
    type: 'page',
    items: {
      'introduction': 'Introduction',
      'deleted-article': 'Deleted Article'
    }
  }
}`,
				newArticleSlugs: ["introduction"],
				articleTitles: new Map([["introduction", "Introduction"]]),
			});

			expect(result.success).toBe(true);
			const docsEntry = result.meta?.docs as VirtualGroupMeta;
			expect(docsEntry.items.introduction).toBe("Introduction");
			expect(docsEntry.items["deleted-article"]).toBeUndefined();
			expect(result.report.removed).toContain("docs/deleted-article");
		});

		test("removes empty virtual groups", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'docs': {
    title: 'Docs',
    type: 'page',
    items: {
      'deleted-article': 'Deleted Article'
    }
  }
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.docs).toBeUndefined();
			expect(result.report.removed).toContain("docs/deleted-article");
			expect(result.report.removed).toContain("docs (empty group)");
		});

		test("ensures index is always first", () => {
			const result = merger.merge({
				existingContent: `export default {
  'about': 'About',
  'index': 'Home'
}`,
				newArticleSlugs: ["about", "index"],
				articleTitles: new Map([
					["about", "About"],
					["index", "Home"],
				]),
			});

			expect(result.success).toBe(true);
			const keys = Object.keys(result.meta ?? {});
			expect(keys[0]).toBe("index");
		});

		test("handles deletedSlugs parameter", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'introduction': 'Introduction',
  'to-delete': 'To Delete'
}`,
				newArticleSlugs: ["index", "introduction", "to-delete"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
					["to-delete", "To Delete"],
				]),
				deletedSlugs: ["to-delete"],
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["to-delete"]).toBeUndefined();
		});

		test("handles complex real-world structure", () => {
			const content = `export default {
  'index': { display: 'hidden' },
  'setup-with-php': 'Setup with PHP',
  'setup-with-docker': 'Setup with Docker',
  'using': {
    type: 'separator',
    title: 'Using LinkAce'
  },
  'the-dashboard': 'The Dashboard',
  'links': 'Links',
  'guides': {
    type: 'separator',
    title: 'Guides'
  },
  'third-party-tools': 'Third Party Tools',
  'reference': {
    type: 'separator',
    title: 'Reference'
  },
  'v2-changelog': 'v2 Changelog',
  'linkace-docs': {
    title: 'Docs',
    type: 'page',
    href: '/'
  },
  'api-reference': {
    title: 'API Reference',
    type: 'page',
    href: '/api-docs/linkace-openapi'
  }
}`;
			const result = merger.merge({
				existingContent: content,
				newArticleSlugs: [
					"setup-with-php",
					"setup-with-docker",
					"the-dashboard",
					"links",
					"third-party-tools",
					"v2-changelog",
				],
				articleTitles: new Map([
					["setup-with-php", "Setup with PHP"],
					["setup-with-docker", "Setup with Docker"],
					["the-dashboard", "The Dashboard"],
					["links", "Links"],
					["third-party-tools", "Third Party Tools"],
					["v2-changelog", "v2 Changelog"],
				]),
				baseNavMeta: {
					"api-reference": {
						title: "API Reference",
						type: "page",
						href: "/api-docs/linkace-openapi",
					},
					"linkace-docs": {
						title: "Docs",
						type: "page",
						href: "/",
					},
				},
			});

			expect(result.success).toBe(true);

			// Check separators are preserved
			expect(result.meta?.using).toEqual({ type: "separator", title: "Using LinkAce" });
			expect(result.meta?.guides).toEqual({ type: "separator", title: "Guides" });
			expect(result.meta?.reference).toEqual({ type: "separator", title: "Reference" });

			// Check API pages are preserved
			expect(result.meta?.["api-reference"]).toBeDefined();
			expect(result.meta?.["linkace-docs"]).toBeDefined();

			// Check articles are preserved
			expect(result.meta?.["setup-with-php"]).toBe("Setup with PHP");
		});
	});

	// ===== Edge cases =====

	describe("edge cases", () => {
		const merger = new MetaMerger();

		test("handles empty _meta.ts", () => {
			const result = merger.merge({
				existingContent: "export default {}",
				newArticleSlugs: ["index", "introduction"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.meta).toEqual({
				index: "Home",
				introduction: "Introduction",
			});
		});

		test("handles only separators (no articles)", () => {
			const result = merger.merge({
				existingContent: `export default {
  '---': { type: 'separator' },
  '--docs': { type: 'separator', title: 'Docs' }
}`,
				newArticleSlugs: [],
				articleTitles: new Map(),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["---"]).toEqual({ type: "separator" });
			expect(result.meta?.["--docs"]).toEqual({ type: "separator", title: "Docs" });
		});

		test("handles unicode characters in titles", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': '首页',
  'introduction': '🚀 介绍',
  'guide': 'ガイド'
}`,
				newArticleSlugs: ["index", "introduction", "guide"],
				articleTitles: new Map([
					["index", "Home"],
					["introduction", "Introduction"],
					["guide", "Guide"],
				]),
			});

			expect(result.success).toBe(true);
			// User's unicode titles should be preserved
			expect(result.meta?.index).toBe("首页");
			expect(result.meta?.introduction).toBe("🚀 介绍");
			expect(result.meta?.guide).toBe("ガイド");
		});

		test("handles hidden entries", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': { display: 'hidden' },
  'introduction': 'Introduction'
}`,
				newArticleSlugs: ["introduction"],
				articleTitles: new Map([["introduction", "Introduction"]]),
			});

			expect(result.success).toBe(true);
			// Hidden entry should be preserved as-is
			expect(result.meta?.index).toEqual({ display: "hidden" });
		});

		test("handles menu type virtual groups", () => {
			const result = merger.merge({
				existingContent: `export default {
  'menu': {
    title: 'Menu',
    type: 'menu',
    items: {
      'item1': 'Item 1',
      'item2': 'Item 2'
    }
  }
}`,
				newArticleSlugs: ["item1"],
				articleTitles: new Map([["item1", "Item 1"]]),
			});

			expect(result.success).toBe(true);
			const menuEntry = result.meta?.menu as VirtualGroupMeta;
			expect(menuEntry.type).toBe("menu");
			expect(menuEntry.items).toEqual({ item1: "Item 1" });
		});
	});

	// ===== folder preservation tests =====

	describe("folder preservation", () => {
		const merger = new MetaMerger();

		test("preserves folder entries when knownFolders is provided", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'guides': 'User Guides',
  'tutorials': 'Tutorial Section'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				knownFolders: ["guides", "tutorials"],
			});

			expect(result.success).toBe(true);
			expect(result.meta?.guides).toBe("User Guides");
			expect(result.meta?.tutorials).toBe("Tutorial Section");
			expect(result.report.preserved).toContain("guides (folder)");
			expect(result.report.preserved).toContain("tutorials (folder)");
		});

		test("removes folder entries when not in knownFolders", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'old-folder': 'Old Folder'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				knownFolders: [], // No known folders
			});

			expect(result.success).toBe(true);
			expect(result.meta?.["old-folder"]).toBeUndefined();
			expect(result.report.removed).toContain("old-folder");
		});

		test("extracts immediate folder name from nested path", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'advanced': 'Advanced Topics'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				knownFolders: ["guides/advanced"], // Nested path
			});

			expect(result.success).toBe(true);
			// "advanced" should be preserved because it's the last segment of "guides/advanced"
			expect(result.meta?.advanced).toBe("Advanced Topics");
			expect(result.report.preserved).toContain("advanced (folder)");
		});

		test("distinguishes between article slugs and folder names", () => {
			// Same name exists as both article and folder - article takes precedence
			const result = merger.merge({
				existingContent: `export default {
  'docs': 'Documentation',
  'guides': 'User Guides'
}`,
				newArticleSlugs: ["docs"], // "docs" is an article
				articleTitles: new Map([["docs", "Documentation"]]),
				knownFolders: ["guides"], // "guides" is a folder
			});

			expect(result.success).toBe(true);
			expect(result.meta?.docs).toBe("Documentation");
			expect(result.meta?.guides).toBe("User Guides");
			expect(result.report.preserved).toContain("docs"); // As article
			expect(result.report.preserved).toContain("guides (folder)"); // As folder
		});

		test("mergeFromParsed accepts knownFolders", () => {
			const existingMeta = {
				index: "Home",
				guides: "User Guides",
			};

			const result = merger.mergeFromParsed({
				existingMeta,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				knownFolders: ["guides"],
			});

			expect(result.success).toBe(true);
			expect(result.meta?.guides).toBe("User Guides");
			expect(result.report.preserved).toContain("guides (folder)");
		});

		test("preserves complex entry with type:page when matching file exists", () => {
			// These tests use entries that don't strictly match ExistingNavMetaEntry types
			// but are valid in Nextra's _meta.ts - use type assertion via unknown
			const existingMeta = {
				api: { title: "API", type: "page" as const },
			} as unknown as ExistingNavMeta;

			const result = merger.mergeFromParsed({
				existingMeta,
				newArticleSlugs: ["api"],
				articleTitles: new Map([["api", "API Documentation"]]),
			});

			expect(result.success).toBe(true);
			// Complex entry should be preserved, not overwritten with simple string
			expect(result.meta?.api).toEqual({ title: "API", type: "page" });
			expect(result.report.preserved).toContain("api");
		});

		test("removes complex entry when no matching file exists", () => {
			// These tests use entries that don't strictly match ExistingNavMetaEntry types
			// but are valid in Nextra's _meta.ts - use type assertion via unknown
			const existingMeta = {
				orphan: { title: "Orphan", type: "page" as const },
			} as unknown as ExistingNavMeta;

			const result = merger.mergeFromParsed({
				existingMeta,
				newArticleSlugs: [], // No matching file
				articleTitles: new Map(),
			});

			expect(result.success).toBe(true);
			// Orphaned complex entry should be removed
			expect(result.meta?.orphan).toBeUndefined();
			expect(result.report.removed).toContain("orphan");
		});

		test("preserves deeply nested objects like theme: {layout: 'full'}", () => {
			// These tests use entries that don't strictly match ExistingNavMetaEntry types
			// but are valid in Nextra's _meta.ts - use type assertion via unknown
			const existingMeta = {
				tag: { theme: { layout: "full" } },
			} as unknown as ExistingNavMeta;

			const result = merger.mergeFromParsed({
				existingMeta,
				newArticleSlugs: ["tag"],
				articleTitles: new Map([["tag", "Tag"]]),
			});

			expect(result.success).toBe(true);
			expect(result.meta?.tag).toEqual({ theme: { layout: "full" } });
			expect(result.report.preserved).toContain("tag");
		});

		test("handles empty knownFolders array", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'orphan': 'Orphan Entry'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				knownFolders: [],
			});

			expect(result.success).toBe(true);
			expect(result.meta?.orphan).toBeUndefined();
		});

		test("handles undefined knownFolders (backward compatibility)", () => {
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'orphan': 'Orphan Entry'
}`,
				newArticleSlugs: ["index"],
				articleTitles: new Map([["index", "Home"]]),
				// No knownFolders specified
			});

			expect(result.success).toBe(true);
			expect(result.meta?.orphan).toBeUndefined();
			expect(result.report.removed).toContain("orphan");
		});

		test("folder entry not removed when matching article is deleted", () => {
			// Edge case: folder name matches a deleted article slug
			const result = merger.merge({
				existingContent: `export default {
  'index': 'Home',
  'guides': 'User Guides'
}`,
				newArticleSlugs: ["index", "guides"],
				articleTitles: new Map([
					["index", "Home"],
					["guides", "Guides Article"],
				]),
				deletedSlugs: ["guides"], // Article "guides" is deleted
				knownFolders: ["guides"], // But folder "guides" exists
			});

			expect(result.success).toBe(true);
			// Should be preserved as folder even though article is deleted
			expect(result.meta?.guides).toBe("User Guides");
			expect(result.report.preserved).toContain("guides (folder)");
		});
	});

	// ===== serializeNavMeta tests =====

	describe("serializeNavMeta", () => {
		const merger = new MetaMerger();

		test("serializes simple string entries", () => {
			const meta = {
				index: "Home",
				introduction: "Introduction",
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("export default {");
			expect(result).toContain("index: 'Home'");
			expect(result).toContain("introduction: 'Introduction'");
			expect(result).toContain("};");
		});

		test("quotes keys with hyphens", () => {
			const meta = {
				"getting-started": "Getting Started",
				"api-reference": "API Reference",
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("'getting-started': 'Getting Started'");
			expect(result).toContain("'api-reference': 'API Reference'");
		});

		test("serializes separators", () => {
			const meta = {
				"---": { type: "separator" as const },
				"--docs": { type: "separator" as const, title: "Docs" },
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("'---': { type: 'separator' }");
			expect(result).toContain("'--docs': { type: 'separator', title: 'Docs' }");
		});

		test("serializes API pages", () => {
			const meta = {
				"api-reference": {
					title: "API Reference",
					type: "page" as const,
					href: "/api-docs",
				},
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("'api-reference': { title: 'API Reference', type: 'page', href: '/api-docs' }");
		});

		test("serializes virtual groups", () => {
			const meta = {
				docs: {
					title: "Documentation",
					type: "page" as const,
					items: {
						intro: "Introduction",
						"getting-started": "Getting Started",
					},
				},
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain(
				"docs: { title: 'Documentation', type: 'page', items: { intro: 'Introduction', 'getting-started': 'Getting Started' } }",
			);
		});

		test("escapes single quotes in strings", () => {
			const meta = {
				intro: "What's New",
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("intro: 'What\\'s New'");
		});

		test("escapes backslashes in strings", () => {
			const meta = {
				path: "C:\\Users\\docs",
			};
			const result = merger.serializeNavMeta(meta);

			expect(result).toContain("path: 'C:\\\\Users\\\\docs'");
		});

		test("produces valid TypeScript that can be parsed back", () => {
			const meta = {
				index: "Home",
				"getting-started": "Getting Started",
				separator: { type: "separator" as const, title: "Docs" },
			};
			const serialized = merger.serializeNavMeta(meta);

			// Verify the output is valid by parsing it
			const syntaxResult = merger.validateSyntax(serialized);
			expect(syntaxResult.valid).toBe(true);

			// And can be parsed back
			const parsed = merger.parse(serialized);
			expect(parsed.index).toBe("Home");
			expect(parsed["getting-started"]).toBe("Getting Started");
		});
	});

	// ===== mergeAllMetaFiles tests =====

	describe("mergeAllMetaFiles", () => {
		const merger = new MetaMerger();

		test("merges multiple folders successfully", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: "export default { index: 'Home' }",
					slugs: ["index", "about"],
				},
				{
					folderPath: "guides",
					metaContent: "export default { intro: 'Introduction' }",
					slugs: ["intro", "advanced"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["index", "Home"],
					["about", "About Us"],
					["intro", "Introduction"],
					["advanced", "Advanced Guide"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.succeeded).toContain("");
			expect(result.succeeded).toContain("guides");
			expect(result.failed).toEqual([]);
			expect(result.results).toHaveLength(2);

			// Check root folder result
			const rootResult = result.results.find(r => r.folderPath === "");
			expect(rootResult?.result.success).toBe(true);
			expect(rootResult?.metaContent).toContain("about");

			// Check guides folder result
			const guidesResult = result.results.find(r => r.folderPath === "guides");
			expect(guidesResult?.result.success).toBe(true);
			expect(guidesResult?.metaContent).toContain("advanced");
		});

		test("handles folder with no existing meta", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "new-folder",
					metaContent: "",
					slugs: ["doc1", "doc2"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["doc1", "Document 1"],
					["doc2", "Document 2"],
				]),
			});

			expect(result.success).toBe(true);
			expect(result.succeeded).toContain("new-folder");

			const folderResult = result.results[0];
			expect(folderResult?.result.success).toBe(true);
			expect(folderResult?.result.report.added).toContain("doc1");
			expect(folderResult?.result.report.added).toContain("doc2");
			expect(folderResult?.metaContent).toContain("doc1: 'Document 1'");
		});

		test("skips empty folders with no meta", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "empty",
					metaContent: "",
					slugs: [],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map(),
			});

			expect(result.success).toBe(true);
			expect(result.succeeded).toContain("empty");

			const folderResult = result.results[0];
			expect(folderResult?.result.skipRegeneration).toBe(true);
			expect(folderResult?.metaContent).toBeUndefined();
		});

		test("reports failed folders with syntax errors", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: "export default { index: 'Home' }",
					slugs: ["index"],
				},
				{
					folderPath: "broken",
					metaContent: "export default { 'invalid", // syntax error
					slugs: ["doc"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["index", "Home"],
					["doc", "Document"],
				]),
			});

			expect(result.success).toBe(false);
			expect(result.succeeded).toContain("");
			expect(result.failed).toContain("broken");
		});

		test("handles deleted slugs across folders", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: "export default { index: 'Home', deleted: 'Deleted' }",
					slugs: ["index", "deleted"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["index", "Home"],
					["deleted", "Deleted"],
				]),
				deletedSlugs: ["deleted"],
			});

			expect(result.success).toBe(true);
			const folderResult = result.results[0];
			expect(folderResult?.metaContent).not.toContain("deleted");
		});

		test("preserves user customizations in each folder", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: "export default { index: '🏠 Home Page' }",
					slugs: ["index"],
				},
				{
					folderPath: "guides",
					metaContent: "export default { intro: '🚀 Getting Started' }",
					slugs: ["intro"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["index", "Home"],
					["intro", "Introduction"],
				]),
			});

			expect(result.success).toBe(true);

			const rootResult = result.results.find(r => r.folderPath === "");
			expect(rootResult?.metaContent).toContain("'🏠 Home Page'");

			const guidesResult = result.results.find(r => r.folderPath === "guides");
			expect(guidesResult?.metaContent).toContain("'🚀 Getting Started'");
		});

		test("generates metaContent for all successful merges", () => {
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: "export default { index: 'Home' }",
					slugs: ["index", "new-page"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([
					["index", "Home"],
					["new-page", "New Page"],
				]),
			});

			expect(result.success).toBe(true);
			const folderResult = result.results[0];
			expect(folderResult?.metaContent).toBeDefined();

			// Verify the generated content is valid TypeScript
			const syntaxResult = merger.validateSyntax(folderResult?.metaContent ?? "");
			expect(syntaxResult.valid).toBe(true);
		});

		test("removes menu items with href when they don't match article slugs", () => {
			// Virtual groups filter their items against article slugs.
			// Items with href (MenuItemWithHref) are removed because they don't match any article.
			// This is expected behavior - use top-level external links for external hrefs.
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: `export default {
  'index': 'Home',
  'links': {
    title: 'External Links',
    type: 'menu',
    items: {
      'github': { title: 'GitHub', href: 'https://github.com/example' },
      'docs': { title: 'Documentation', href: 'https://docs.example.com' }
    }
  }
}`,
					slugs: ["index"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(true);
			const folderResult = result.results[0];
			expect(folderResult?.metaContent).toBeDefined();

			// The 'links' menu entry should be REMOVED because all its items were filtered out
			// (items don't match article slugs)
			expect(folderResult?.metaContent).not.toContain("links");
			expect(folderResult?.metaContent).not.toContain("github");
			expect(folderResult?.metaContent).not.toContain("External Links");

			// Verify the generated content is valid TypeScript
			const syntaxResult = merger.validateSyntax(folderResult?.metaContent ?? "");
			expect(syntaxResult.valid).toBe(true);
		});

		test("preserves top-level external links", () => {
			// External links at the top level (not inside virtual groups) are preserved
			const folders: Array<FolderMetaInfo> = [
				{
					folderPath: "",
					metaContent: `export default {
  'index': 'Home',
  'github': { title: 'GitHub', href: 'https://github.com/example' }
}`,
					slugs: ["index"],
				},
			];

			const result = merger.mergeAllMetaFiles({
				folders,
				articleTitles: new Map([["index", "Home"]]),
			});

			expect(result.success).toBe(true);
			const folderResult = result.results[0];
			expect(folderResult?.metaContent).toBeDefined();

			// Top-level external links are preserved
			expect(folderResult?.metaContent).toContain("github");
			expect(folderResult?.metaContent).toContain("GitHub");
			expect(folderResult?.metaContent).toContain("https://github.com/example");

			// Verify the generated content is valid TypeScript
			const syntaxResult = merger.validateSyntax(folderResult?.metaContent ?? "");
			expect(syntaxResult.valid).toBe(true);
		});
	});
});
