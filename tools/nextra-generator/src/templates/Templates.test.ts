import type { ThemeConfig } from "../types";
import * as appRouter from "./app-router";
import { describe, expect, it } from "vitest";

describe("App Router Templates", () => {
	const defaultTheme: ThemeConfig = {
		logo: "Test Logo",
		footer: "Test Footer",
	};

	describe("generatePackageJson", () => {
		it("should generate valid package.json", () => {
			const result = appRouter.generatePackageJson("my-docs");

			expect(result.path).toBe("package.json");
			const parsed = JSON.parse(result.content);
			expect(parsed.name).toBe("my-docs");
			expect(parsed.dependencies.next).toContain("15");
			expect(parsed.dependencies.nextra).toContain("4.");
			expect(parsed.dependencies.react).toContain("19");
		});

		it("should use default name if not provided", () => {
			const result = appRouter.generatePackageJson();

			const parsed = JSON.parse(result.content);
			expect(parsed.name).toBe("nextra-docs");
		});

		it("should include pagefind for search functionality in build script", () => {
			const result = appRouter.generatePackageJson("my-docs");

			const parsed = JSON.parse(result.content);
			expect(parsed.devDependencies.pagefind).toBeDefined();
			// Pagefind is chained in build script to ensure it runs on all platforms
			expect(parsed.scripts.build).toContain("pagefind");
			expect(parsed.scripts.build).toContain("public/_pagefind");
		});
	});

	describe("generateNextConfig", () => {
		it("should generate next.config.mjs", () => {
			const result = appRouter.generateNextConfig();

			expect(result.path).toBe("next.config.mjs");
			expect(result.content).toContain("import nextra from 'nextra'");
			expect(result.content).toContain("withNextra");
			expect(result.content).toContain("reactStrictMode: true");
		});

		it("should configure mdxOptions.format as detect for MD/MDX auto-detection", () => {
			const result = appRouter.generateNextConfig();

			// format: 'detect' enables lenient .md parsing and strict .mdx parsing
			expect(result.content).toContain("mdxOptions:");
			expect(result.content).toContain("format: 'detect'");
		});

		it("should generate config without redirects", () => {
			const result = appRouter.generateNextConfig();

			expect(result.content).not.toContain("async redirects()");
			expect(result.content).not.toContain("source:");
			expect(result.content).not.toContain("destination:");
		});

		it("should configure github code theme by default", () => {
			const result = appRouter.generateNextConfig("github");

			expect(result.content).toContain("rehypePrettyCodeOptions:");
			expect(result.content).toContain("theme:");
			expect(result.content).toContain("github-light");
			expect(result.content).toContain("github-dark");
		});

		it("should configure dracula code theme when specified", () => {
			const result = appRouter.generateNextConfig("dracula");

			expect(result.content).toContain("dracula-soft");
			expect(result.content).toContain("'dracula'");
		});

		it("should configure one-dark code theme when specified", () => {
			const result = appRouter.generateNextConfig("one-dark");

			expect(result.content).toContain("one-light");
			expect(result.content).toContain("one-dark-pro");
		});

		it("should configure nord code theme when specified", () => {
			const result = appRouter.generateNextConfig("nord");

			expect(result.content).toContain("'nord'");
		});
	});

	describe("generateTsConfig", () => {
		it("should generate valid tsconfig.json", () => {
			const result = appRouter.generateTsConfig();

			expect(result.path).toBe("tsconfig.json");
			const parsed = JSON.parse(result.content);
			expect(parsed.compilerOptions.strict).toBe(true);
			expect(parsed.compilerOptions.moduleResolution).toBe("bundler");
		});
	});

	describe("generateLayout", () => {
		it("should generate layout with theme config", () => {
			const result = appRouter.generateLayout(defaultTheme);

			expect(result.path).toBe("app/layout.tsx");
			expect(result.content).toContain("Test Logo");
			expect(result.content).toContain("Test Footer · Powered by Jolli");
			expect(result.content).toContain("nextra-theme-docs");
			expect(result.content).toContain("getPageMap");
		});

		it("should use default footer with logo if not provided", () => {
			const result = appRouter.generateLayout({ logo: "Logo" });

			expect(result.content).toContain("Logo · Powered by Jolli");
		});

		it("should include Discord chat link when chatLink is provided", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				chatLink: "https://discord.gg/example",
			});

			expect(result.content).toContain('chatLink="https://discord.gg/example"');
			expect(result.content).toContain("chatIcon={");
			// Check for Discord icon SVG (partial match)
			expect(result.content).toContain('viewBox="0 0 16 16"');
		});

		it("should include Slack chat icon when chatIcon is slack", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				chatLink: "https://slack.com/example",
				chatIcon: "slack",
			});

			expect(result.content).toContain('chatLink="https://slack.com/example"');
			// Slack icon has different path structure
			expect(result.content).toContain("M3.362 10.11");
		});

		it("should not include chat props when chatLink is not provided", () => {
			const result = appRouter.generateLayout({ logo: "Logo" });

			expect(result.content).not.toContain("chatLink=");
			expect(result.content).not.toContain("chatIcon=");
		});

		// JOLLI-382: Header links are now in _meta.ts for native Nextra navbar rendering
		// Layout should NOT include HeaderLinks component (header links are in _meta.ts)
		it("should NOT include HeaderLinks component (header links are in _meta.ts)", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				headerLinks: {
					items: [
						{ label: "GitHub", url: "https://github.com/example" },
						{ label: "Twitter", url: "https://twitter.com/example" },
					],
				},
			});

			// Layout should NOT contain HeaderLinks - they're in _meta.ts now
			expect(result.content).not.toContain("import { HeaderLinks }");
			expect(result.content).not.toContain("<HeaderLinks />");
		});

		it("should include structured footer with copyright and columns", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				footerConfig: {
					copyright: "2024 ACME Corp",
					columns: [
						{
							title: "Resources",
							links: [
								{ label: "Docs", url: "https://docs.acme.com" },
								{ label: "API", url: "https://api.acme.com" },
							],
						},
						{
							title: "Community",
							links: [{ label: "Discord", url: "https://discord.gg/acme" }],
						},
					],
				},
			});

			// Footer structure uses inline styles instead of classes
			expect(result.content).toContain("display: 'flex'");
			expect(result.content).toContain("flexWrap: 'wrap'");
			expect(result.content).toContain("Resources");
			expect(result.content).toContain("https://docs.acme.com");
			expect(result.content).toContain("borderTop:");
			expect(result.content).toContain("2024 ACME Corp");
			expect(result.content).toContain("Powered by Jolli");
		});

		it("should include footer with only copyright", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				footerConfig: {
					copyright: "2024 My Company",
				},
			});

			// Simple footer without columns just shows copyright text inline
			expect(result.content).toContain("2024 My Company");
			expect(result.content).toContain("Powered by Jolli");
			// No flex container for simple copyright-only footer
			expect(result.content).not.toContain("flexWrap: 'wrap'");
		});

		it("should include footer with social icons", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				footerConfig: {
					copyright: "2024 ACME",
					socialLinks: {
						github: "https://github.com/acme",
						twitter: "https://twitter.com/acme",
						discord: "https://discord.gg/acme",
					},
				},
			});

			// Social icons should be present
			expect(result.content).toContain("https://github.com/acme");
			expect(result.content).toContain("https://twitter.com/acme");
			expect(result.content).toContain("https://discord.gg/acme");
			// Social icons have aria-label for accessibility
			expect(result.content).toContain('aria-label="GitHub"');
			expect(result.content).toContain('aria-label="Twitter"');
			expect(result.content).toContain('aria-label="Discord"');
		});

		it("should include footer with social icons and columns", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				footerConfig: {
					copyright: "2024 ACME",
					columns: [
						{
							title: "Resources",
							links: [{ label: "Docs", url: "https://docs.acme.com" }],
						},
					],
					socialLinks: {
						linkedin: "https://linkedin.com/company/acme",
						youtube: "https://youtube.com/@acme",
					},
				},
			});

			// Both columns and social icons should be present
			expect(result.content).toContain("Resources");
			expect(result.content).toContain("https://docs.acme.com");
			expect(result.content).toContain("https://linkedin.com/company/acme");
			expect(result.content).toContain("https://youtube.com/@acme");
			expect(result.content).toContain('aria-label="LinkedIn"');
			expect(result.content).toContain('aria-label="YouTube"');
		});

		it("should not include social icons section when no social links", () => {
			const result = appRouter.generateLayout({
				logo: "Logo",
				footerConfig: {
					copyright: "2024 ACME",
				},
			});

			// No aria-label for social icons should be present
			expect(result.content).not.toContain('aria-label="GitHub"');
			expect(result.content).not.toContain('aria-label="Twitter"');
		});
	});

	describe("generateCatchAllPage", () => {
		it("should generate catch-all route page", () => {
			const result = appRouter.generateCatchAllPage();

			expect(result.path).toBe("app/[...mdxPath]/page.tsx");
			expect(result.content).toContain("generateStaticParamsFor");
			expect(result.content).toContain("importPage");
			expect(result.content).toContain("MDXContent");
		});

		it("should include force-static for Next.js 15+ compatibility", () => {
			const result = appRouter.generateCatchAllPage();

			expect(result.content).toContain("export const dynamic = 'force-static'");
		});
	});

	describe("generateMdxComponents", () => {
		it("should generate mdx-components.tsx", () => {
			const result = appRouter.generateMdxComponents();

			expect(result.path).toBe("mdx-components.tsx");
			expect(result.content).toContain("useMDXComponents");
			expect(result.content).toContain("getDocsMDXComponents");
		});
	});

	describe("generateIconComponent", () => {
		it("should generate dynamic icon component", () => {
			const result = appRouter.generateIconComponent();

			expect(result.path).toBe("app/icon.tsx");
			expect(result.content).toContain("ImageResponse");
			expect(result.content).toContain("contentType");
		});
	});

	describe("generateContentMeta", () => {
		it("should generate TypeScript meta file", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				guide: "Guide",
			});

			expect(result.path).toBe("content/_meta.ts");
			expect(result.content).toContain("export default");
			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'guide': 'Guide'");
		});

		it("should generate TypeScript meta file with API page entries", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				guide: "Guide",
				"api-petstore": {
					title: "Petstore API",
					type: "page",
					href: "/api-docs-petstore.html",
				},
			});

			expect(result.path).toBe("content/_meta.ts");
			expect(result.content).toContain("export default");
			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'guide': 'Guide'");
			// Check API page entry with object format
			expect(result.content).toContain("'api-petstore': {");
			expect(result.content).toContain("title: 'Petstore API'");
			expect(result.content).toContain("type: 'page'");
			expect(result.content).toContain("href: '/api-docs-petstore.html'");
		});

		it("should generate API page entry without newWindow (Nextra 4 strict schema)", () => {
			// Note: newWindow is NOT supported by Nextra 4's strict schema
			const result = appRouter.generateContentMeta({
				index: "Home",
				"api-external": {
					title: "External API",
					type: "page",
					href: "/api-external.html",
				},
			});

			expect(result.content).toContain("'api-external': {");
			expect(result.content).toContain("title: 'External API'");
			expect(result.content).toContain("type: 'page'");
			expect(result.content).toContain("href: '/api-external.html'");
			// newWindow should NOT be present - Nextra 4 doesn't support it
			expect(result.content).not.toContain("newWindow");
		});

		it("should generate external link entries (href without type)", () => {
			// External links have href but no type property
			const result = appRouter.generateContentMeta({
				index: "Home",
				github: {
					title: "GitHub",
					href: "https://github.com/example",
				},
			} as appRouter.NavMeta);

			expect(result.content).toContain("'github': {");
			expect(result.content).toContain("title: 'GitHub'");
			expect(result.content).toContain("href: 'https://github.com/example'");
			// External links should NOT have type
			expect(result.content).not.toContain("type: 'page'");
		});

		it("should generate external link without newWindow (Nextra 4 strict schema)", () => {
			// Note: newWindow is NOT supported by Nextra 4's strict schema
			const result = appRouter.generateContentMeta({
				index: "Home",
				docs: {
					title: "External Docs",
					href: "https://docs.example.com",
				},
			} as appRouter.NavMeta);

			expect(result.content).toContain("'docs': {");
			expect(result.content).toContain("title: 'External Docs'");
			expect(result.content).toContain("href: 'https://docs.example.com'");
			// newWindow should NOT be present - Nextra 4 doesn't support it
			expect(result.content).not.toContain("newWindow");
		});

		it("should generate external link without title", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				link: {
					href: "https://example.com",
				},
			} as appRouter.NavMeta);

			expect(result.content).toContain("'link': {");
			expect(result.content).toContain("href: 'https://example.com'");
			// No title should be output
			expect(result.content).not.toMatch(/'link':\s*\{[^}]*title:/);
		});

		it("should handle mixed string and object entries", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				"api-users": {
					title: "Users API",
					type: "page",
					href: "/api-docs-users.html",
				},
				about: "About Us",
			});

			// Verify string entries use simple format
			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'about': 'About Us'");
			// Verify object entry uses complex format
			expect(result.content).toContain("'api-users': {");
		});

		it("should serialize virtual groups with nested items", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				docs: {
					title: "Docs",
					type: "page",
					items: {
						introduction: "Introduction",
						"getting-started": "Getting Started",
					},
				},
			});

			expect(result.path).toBe("content/_meta.ts");
			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'docs': {");
			expect(result.content).toContain("title: 'Docs'");
			expect(result.content).toContain("type: 'page'");
			expect(result.content).toContain("items: {");
			expect(result.content).toContain("'introduction': 'Introduction'");
			expect(result.content).toContain("'getting-started': 'Getting Started'");
		});

		it("should serialize menu type virtual groups", () => {
			const result = appRouter.generateContentMeta({
				menu: {
					title: "Menu",
					type: "menu",
					items: {
						item1: "Item 1",
						item2: "Item 2",
					},
				},
			});

			expect(result.content).toContain("'menu': {");
			expect(result.content).toContain("title: 'Menu'");
			expect(result.content).toContain("type: 'menu'");
			expect(result.content).toContain("items: {");
		});

		it("should serialize separators", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				"---": { type: "separator" },
				about: "About",
			});

			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'---': {");
			expect(result.content).toContain("type: 'separator'");
			expect(result.content).toContain("'about': 'About'");
		});

		it("should serialize separators with titles", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				"-- docs": { type: "separator", title: "Docs" },
				introduction: "Introduction",
			});

			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'-- docs': {");
			expect(result.content).toContain("type: 'separator'");
			expect(result.content).toContain("title: 'Docs'");
			expect(result.content).toContain("'introduction': 'Introduction'");
		});

		it("should handle complex mixed structure", () => {
			const result = appRouter.generateContentMeta({
				index: "Home",
				docs: {
					title: "Docs",
					type: "page",
					items: {
						introduction: "Introduction",
					},
				},
				"---": { type: "separator" },
				"api-jolli": {
					title: "Jolli API",
					type: "page",
					href: "/api-docs-jolli.html",
				},
				"change-log": "Change Log",
			});

			// Verify all entry types are present
			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'docs': {");
			expect(result.content).toContain("items: {");
			expect(result.content).toContain("'introduction': 'Introduction'");
			expect(result.content).toContain("type: 'separator'");
			expect(result.content).toContain("href: '/api-docs-jolli.html'");
			expect(result.content).toContain("'change-log': 'Change Log'");
		});

		it("should serialize entries with nested theme objects", () => {
			// Nextra supports arbitrary theme config objects in _meta.ts
			// Use type assertion via unknown since our NavMetaEntry type doesn't cover all Nextra possibilities
			const result = appRouter.generateContentMeta({
				index: "Home",
				tag: { theme: { layout: "full" } },
			} as unknown as appRouter.NavMeta);

			expect(result.content).toContain("'index': 'Home'");
			expect(result.content).toContain("'tag': {");
			expect(result.content).toContain("theme: {");
			expect(result.content).toContain("layout: 'full'");
			expect(result.content).not.toContain("[object Object]");
		});

		it("should serialize deeply nested objects", () => {
			// Nextra supports arbitrary theme config objects in _meta.ts
			// Use type assertion via unknown since our NavMetaEntry type doesn't cover all Nextra possibilities
			const result = appRouter.generateContentMeta({
				page: {
					theme: {
						sidebar: false,
						layout: "full",
					},
				},
			} as unknown as appRouter.NavMeta);

			expect(result.content).toContain("'page': {");
			expect(result.content).toContain("theme: {");
			expect(result.content).toContain("sidebar: false");
			expect(result.content).toContain("layout: 'full'");
			expect(result.content).not.toContain("[object Object]");
		});
	});

	describe("generateIndexPage", () => {
		it("should generate index page with title", () => {
			const result = appRouter.generateIndexPage("My Docs");

			expect(result.path).toBe("content/index.mdx");
			expect(result.content).toContain("# My Docs");
			expect(result.content).toContain("Quick Links");
		});

		it("should use default title", () => {
			const result = appRouter.generateIndexPage();

			expect(result.content).toContain("# Welcome");
		});
	});

	describe("generateApiDocsHtml", () => {
		it("should generate API docs HTML", () => {
			const result = appRouter.generateApiDocsHtml();

			expect(result.path).toBe("public/api-docs.html");
			expect(result.content).toContain("@scalar/api-reference");
			expect(result.content).toContain("/openapi.json");
		});

		it("should use custom spec path", () => {
			const result = appRouter.generateApiDocsHtml("/custom/spec.json");

			expect(result.content).toContain("/custom/spec.json");
		});
	});

	describe("getBaseTemplates", () => {
		it("should return all base templates for full site", () => {
			const templates = appRouter.getBaseTemplates(defaultTheme, false);

			const paths = templates.map(t => t.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("next.config.mjs");
			expect(paths).toContain("tsconfig.json");
			expect(paths).toContain("app/layout.tsx");
			expect(paths).toContain("app/[...mdxPath]/page.tsx");
			expect(paths).toContain("mdx-components.tsx");
			expect(paths).toContain("content/_meta.ts");
			expect(paths).toContain("content/index.mdx");
			expect(paths).toContain("public/api-docs.html");
		});

		it("should return minimal templates when minimalContent is true", () => {
			const templates = appRouter.getBaseTemplates(defaultTheme, true);

			const paths = templates.map(t => t.path);
			expect(paths).toContain("package.json");
			// JOLLI-191: No content/index.mdx - app/page.tsx will redirect to first article
			expect(paths).not.toContain("content/index.mdx");
			expect(paths).toContain("content/_meta.ts");

			// Should NOT include sample pages
			expect(paths).not.toContain("public/api-docs.html");
		});

		it("should not include redirects in next config", () => {
			const templates = appRouter.getBaseTemplates(defaultTheme, false);

			const nextConfig = templates.find(t => t.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});
	});
});

describe("generateApiDocsPage", () => {
	it("should generate optional catch-all route for API docs", () => {
		const result = appRouter.generateApiDocsPage(["petstore", "users"]);

		expect(result.path).toBe("app/api-docs/[[...slug]]/page.tsx");
		expect(result.content).toContain("import { redirect, notFound }");
		expect(result.content).toContain("VALID_SLUGS = ['petstore', 'users']");
	});

	it("should generate static params with array format for catch-all", () => {
		const result = appRouter.generateApiDocsPage(["petstore", "users"]);

		expect(result.content).toContain("{ slug: [] }"); // Root redirect case
		expect(result.content).toContain("{ slug: ['petstore'] }");
		expect(result.content).toContain("{ slug: ['users'] }");
	});

	it("should redirect to first spec when no slug provided", () => {
		const result = appRouter.generateApiDocsPage(["petstore", "users"]);

		expect(result.content).toContain("if (slugArray.length === 0)");
		expect(result.content).toContain("redirect('/api-docs/petstore')");
	});

	it("should return 404 for invalid slugs", () => {
		const result = appRouter.generateApiDocsPage(["petstore"]);

		expect(result.content).toContain("if (!VALID_SLUGS.includes(slug))");
		expect(result.content).toContain("notFound()");
	});
});

describe("generateGlobalStyles", () => {
	it("should generate globals.css with primary hue CSS variable", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", primaryHue: 180 });

		expect(result.path).toBe("app/globals.css");
		expect(result.content).toContain("--jolli-primary-hue: 180");
	});

	it("should use default primary hue (212) when not provided", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("--jolli-primary-hue: 212");
	});

	it("should generate font family CSS variable for inter (default)", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("--jolli-font-family:");
		expect(result.content).toContain("Inter");
	});

	it("should generate font family CSS variable for space-grotesk", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", fontFamily: "space-grotesk" });

		expect(result.content).toContain("--jolli-font-family:");
		expect(result.content).toContain("Space Grotesk");
	});

	it("should generate font family CSS variable for ibm-plex", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", fontFamily: "ibm-plex" });

		expect(result.content).toContain("--jolli-font-family:");
		expect(result.content).toContain("IBM Plex Sans");
	});

	it("should generate font family CSS variable for source-sans", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", fontFamily: "source-sans" });

		expect(result.content).toContain("--jolli-font-family:");
		expect(result.content).toContain("Source Sans 3");
	});

	it("should generate border radius CSS variables for subtle (default)", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("--jolli-radius-sm: 4px");
	});

	it("should generate border radius CSS variables for sharp", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", borderRadius: "sharp" });

		expect(result.content).toContain("--jolli-radius-sm: 2px");
	});

	it("should generate border radius CSS variables for rounded", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", borderRadius: "rounded" });

		expect(result.content).toContain("--jolli-radius-sm: 8px");
	});

	it("should generate border radius CSS variables for pill", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", borderRadius: "pill" });

		expect(result.content).toContain("--jolli-radius-sm: 12px");
	});

	it("should generate spacing CSS variables for comfortable (default)", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("--jolli-spacing-base: 1rem");
		expect(result.content).toContain("--jolli-spacing-section: 2rem");
	});

	it("should generate spacing CSS variables for compact", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", spacingDensity: "compact" });

		expect(result.content).toContain("--jolli-spacing-base: 0.75rem");
		expect(result.content).toContain("--jolli-spacing-section: 1.5rem");
	});

	it("should generate spacing CSS variables for airy", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", spacingDensity: "airy" });

		expect(result.content).toContain("--jolli-spacing-base: 1.5rem");
		expect(result.content).toContain("--jolli-spacing-section: 3rem");
	});

	it("should generate layout width CSS variables with defaults", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("--nextra-content-width: 100%");
		expect(result.content).toContain("--jolli-content-max-width: 55rem");
		expect(result.content).toContain("--jolli-sidebar-width: 16rem");
		expect(result.content).toContain("--jolli-toc-width: 16rem");
	});

	it("should generate layout width CSS variables for custom values", () => {
		const result = appRouter.generateGlobalStyles({
			logo: "Test",
			pageWidth: "compact",
			contentWidth: "compact",
			sidebarWidth: "wide",
			tocWidth: "compact",
		});

		expect(result.content).toContain("--nextra-content-width: 90rem");
		expect(result.content).toContain("--jolli-content-max-width: 45rem");
		expect(result.content).toContain("--jolli-sidebar-width: 20rem");
		expect(result.content).toContain("--jolli-toc-width: 14rem");
	});

	it("should include layout width override CSS rules", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		// Content width targets <article> sibling of sidebar (Nextra's content wrapper)
		expect(result.content).toContain(".nextra-sidebar ~ article");
		expect(result.content).toContain("max-width: var(--jolli-content-max-width)");
		expect(result.content).toContain(".nextra-sidebar");
		expect(result.content).toContain("width: var(--jolli-sidebar-width)");
		expect(result.content).toContain(".nextra-toc");
		expect(result.content).toContain("width: var(--jolli-toc-width)");
	});

	it("should include TOC scrollbar hiding CSS", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("scrollbar-width: none");
		expect(result.content).toContain("-ms-overflow-style: none");
		expect(result.content).toContain("::-webkit-scrollbar");
	});

	it("should include wide-mode side padding media query when pageWidth is wide", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", pageWidth: "wide" });

		expect(result.content).toContain("calc(100% - 3rem)");
		expect(result.content).toContain("@media (min-width: 1280px)");
	});

	it("should include wide-mode side padding media query by default", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("calc(100% - 3rem)");
	});

	it("should not include wide-mode side padding when pageWidth is compact", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", pageWidth: "compact" });

		expect(result.content).not.toContain("calc(100% - 3rem)");
	});

	it("should not include wide-mode side padding when pageWidth is standard", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", pageWidth: "standard" });

		expect(result.content).not.toContain("calc(100% - 3rem)");
	});

	it("should generate standard page width CSS value", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", pageWidth: "standard" });

		expect(result.content).toContain("--nextra-content-width: 100rem");
	});

	it("should use right-aligned footer by default", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test" });

		expect(result.content).toContain("justify-content: flex-end");
	});

	it("should use left-aligned footer when headerAlignment is left", () => {
		const result = appRouter.generateGlobalStyles({ logo: "Test", headerAlignment: "left" });

		expect(result.content).toContain("justify-content: flex-start");
	});
});

describe("generateLayout header alignment", () => {
	it("should use right alignment by default", () => {
		const result = appRouter.generateLayout({ logo: "Test" });

		expect(result.content).toContain('align="right"');
	});

	it("should respect headerAlignment setting", () => {
		const result = appRouter.generateLayout({ logo: "Test", headerAlignment: "left" });

		expect(result.content).toContain('align="left"');
	});
});

describe("footer alignment with structured footer", () => {
	it("should right-align footer columns by default", () => {
		const result = appRouter.generateLayout({
			logo: "Test",
			footerConfig: {
				copyright: "2024 Test",
				columns: [{ title: "Links", links: [{ label: "Docs", url: "https://docs.example.com" }] }],
			},
		});

		expect(result.content).toContain("justifyContent: 'flex-end'");
		expect(result.content).toContain("textAlign: 'right'");
	});

	it("should left-align footer columns when headerAlignment is left", () => {
		const result = appRouter.generateLayout({
			logo: "Test",
			headerAlignment: "left",
			footerConfig: {
				copyright: "2024 Test",
				columns: [{ title: "Links", links: [{ label: "Docs", url: "https://docs.example.com" }] }],
			},
		});

		expect(result.content).toContain("justifyContent: 'flex-start'");
		expect(result.content).toContain("textAlign: 'left'");
	});

	it("should left-align social icons when headerAlignment is left", () => {
		const result = appRouter.generateLayout({
			logo: "Test",
			headerAlignment: "left",
			footerConfig: {
				copyright: "2024 Test",
				socialLinks: { github: "https://github.com/test" },
			},
		});

		expect(result.content).toContain("justifyContent: 'flex-start'");
	});

	it("should right-align social icons by default", () => {
		const result = appRouter.generateLayout({
			logo: "Test",
			footerConfig: {
				copyright: "2024 Test",
				socialLinks: { github: "https://github.com/test" },
			},
		});

		expect(result.content).toContain("justifyContent: 'flex-end'");
	});
});
