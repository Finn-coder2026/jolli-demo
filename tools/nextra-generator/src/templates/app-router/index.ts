import type { ApiPageMeta, RedirectMapping, TemplateFile, ThemeConfig } from "../../types.js";
import { isApiPageEntry, isSeparator, isVirtualGroup } from "../../utils/migration.js";
import {
	escapeHtml,
	escapeJsString,
	sanitizeSiteName,
	sanitizeUrl,
	validateNumberRange,
} from "../../utils/sanitize.js";
import type { MenuItemWithHref, MenuNavMeta } from "jolli-common";

// Re-export from jolli-common for consumers
export type { MenuItemWithHref, MenuNavMeta };

/** Discord SVG icon for chat link (App Router) */
const DISCORD_ICON_SVG = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"/></svg>`;

/** Slack SVG icon for chat link (App Router) */
const SLACK_ICON_SVG = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M3.362 10.11c0 .926-.756 1.681-1.681 1.681S0 11.036 0 10.111C0 9.186.756 8.43 1.68 8.43h1.682zm.846 0c0-.924.756-1.68 1.681-1.68s1.681.756 1.681 1.68v4.21c0 .924-.756 1.68-1.68 1.68a1.685 1.685 0 0 1-1.682-1.68zM5.89 3.362c-.926 0-1.682-.756-1.682-1.681S4.964 0 5.89 0s1.68.756 1.68 1.68v1.682zm0 .846c.924 0 1.68.756 1.68 1.681S6.814 7.57 5.89 7.57H1.68C.757 7.57 0 6.814 0 5.89c0-.926.756-1.682 1.68-1.682zm6.749 1.682c0-.926.755-1.682 1.68-1.682S16 4.964 16 5.889s-.756 1.681-1.68 1.681h-1.681zm-.848 0c0 .924-.755 1.68-1.68 1.68a1.685 1.685 0 0 1-1.681-1.68V1.68C8.43.757 9.186 0 10.11 0c.926 0 1.681.756 1.681 1.68zm-1.681 6.748c.926 0 1.682.756 1.682 1.681S11.036 16 10.11 16s-1.681-.756-1.681-1.68v-1.682h1.68zm0-.847c-.924 0-1.68-.755-1.68-1.68s.756-1.681 1.68-1.681h4.21c.924 0 1.68.756 1.68 1.68 0 .926-.756 1.681-1.68 1.681z"/></svg>`;

/**
 * Generate package.json for App Router
 * Includes pagefind for search functionality.
 * Note: The build script chains pagefind directly to ensure it runs on all platforms
 * (Vercel runs `next build` directly which skips npm postbuild hooks).
 */
export function generatePackageJson(name = "nextra-docs"): TemplateFile {
	return {
		path: "package.json",
		content: JSON.stringify(
			{
				name,
				version: "1.0.0",
				private: true,
				scripts: {
					dev: "next dev",
					build: "next build && pagefind --site .next/server/app --output-path public/_pagefind",
					start: "next start",
				},
				dependencies: {
					next: "^15.0.0",
					nextra: "^4.0.0-app-router.12",
					"nextra-theme-docs": "^4.0.0-app-router.12",
					react: "^19.0.0",
					"react-dom": "^19.0.0",
				},
				devDependencies: {
					"@types/node": "^20.0.0",
					"@types/react": "^19.0.0",
					pagefind: "^1.3.0",
					typescript: "^5.0.0",
				},
			},
			null,
			2,
		),
	};
}

/**
 * Generate next.config.mjs for App Router
 * @param redirects Optional array of redirect mappings for sanitized slugs
 */
export function generateNextConfig(redirects?: Array<RedirectMapping>): TemplateFile {
	// Generate redirects async function if redirects are provided
	let redirectsConfig = "";
	if (redirects && redirects.length > 0) {
		const redirectsArray = redirects
			.map(r => `    { source: '${r.source}', destination: '${r.destination}', permanent: ${r.permanent} }`)
			.join(",\n");
		redirectsConfig = `
  async redirects() {
    return [
${redirectsArray}
    ]
  },`;
	}

	return {
		path: "next.config.mjs",
		content: `import nextra from 'nextra'

const withNextra = nextra({
  // Theme is configured in layout for App Router
})

export default withNextra({
  reactStrictMode: true,${redirectsConfig}
})
`,
	};
}

/**
 * Generate a minimal favicon.ico (1x1 transparent ICO)
 * This prevents 404 errors from the catch-all route
 */
export function generateFavicon(): TemplateFile {
	// Minimal valid ICO file (1x1 transparent pixel)
	// Base64 encoded to avoid binary issues
	return {
		path: "app/favicon.ico",
		content: "", // Will be handled specially - creates empty file as placeholder
	};
}

/**
 * Generate app/icon.tsx for dynamic favicon
 */
export function generateIconComponent(): TemplateFile {
	return {
		path: "app/icon.tsx",
		content: `import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: '#000',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          borderRadius: '50%',
        }}
      >
        D
      </div>
    ),
    { ...size }
  )
}
`,
	};
}

/**
 * Generate app/favicon.ico/route.ts to redirect /favicon.ico to /icon
 * This prevents Nextra's catch-all route from trying to handle favicon.ico as an MDX page
 */
export function generateFaviconRoute(): TemplateFile {
	return {
		path: "app/favicon.ico/route.ts",
		content: `import { redirect } from 'next/navigation'

export function GET() {
  redirect('/icon')
}
`,
	};
}

/**
 * Generate tsconfig.json for App Router
 */
export function generateTsConfig(): TemplateFile {
	return {
		path: "tsconfig.json",
		content: JSON.stringify(
			{
				compilerOptions: {
					target: "ES2017",
					lib: ["dom", "dom.iterable", "esnext"],
					allowJs: true,
					skipLibCheck: true,
					strict: true,
					noEmit: true,
					esModuleInterop: true,
					module: "esnext",
					moduleResolution: "bundler",
					resolveJsonModule: true,
					isolatedModules: true,
					jsx: "preserve",
					incremental: true,
					plugins: [{ name: "next" }],
					paths: { "@/*": ["./*"] },
				},
				include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
				exclude: ["node_modules"],
			},
			null,
			2,
		),
	};
}

/**
 * Build footer text with mandatory "Generated by Jolli" branding for App Router
 */
function buildAppRouterFooterText(config: ThemeConfig): string {
	if (config.footer) {
		return `${escapeHtml(config.footer)} · Generated by Jolli`;
	}
	return `${escapeHtml(config.logo)} · Generated by Jolli`;
}

/**
 * Build logo JSX for App Router
 * If logoUrl is provided, shows only the image (assumes logo includes brand text)
 * Otherwise shows text only
 */
function buildAppRouterLogoJsx(config: ThemeConfig): string {
	const escapedLogo = escapeHtml(config.logo);
	if (config.logoUrl) {
		const sanitizedUrl = sanitizeUrl(config.logoUrl);
		return `<img src="${sanitizedUrl}" alt="${escapedLogo}" style={{ height: 24 }} />`;
	}
	return `<span style={{ fontWeight: 700 }}>${escapedLogo}</span>`;
}

/**
 * Build chat link and icon props for App Router Navbar
 */
function buildAppRouterChatProps(config: ThemeConfig): string {
	if (!config.chatLink) {
		return "";
	}
	const sanitizedLink = sanitizeUrl(config.chatLink);
	const iconSvg = config.chatIcon === "slack" ? SLACK_ICON_SVG : DISCORD_ICON_SVG;
	return `
    chatLink="${sanitizedLink}"
    chatIcon={${iconSvg}}`;
}

/**
 * Generate app/layout.tsx for App Router
 * @param config Theme configuration
 * @param siteName Site name for default project link
 */
export function generateLayout(config: ThemeConfig, siteName?: string): TemplateFile {
	const footerText = buildAppRouterFooterText(config);
	const logoJsx = buildAppRouterLogoJsx(config);
	const chatProps = buildAppRouterChatProps(config);
	const primaryHue = validateNumberRange(config.primaryHue, 0, 360, 212);
	const defaultTheme = config.defaultTheme ?? "system";
	const faviconLink = config.favicon ? `<link rel="icon" href="${sanitizeUrl(config.favicon)}" />` : "";
	const escapedLogo = escapeJsString(config.logo);
	const escapedTocTitle = escapeJsString(config.tocTitle ?? "On This Page");

	// Build project link with sanitization
	let projectLinkProp = "";
	if (config.projectLink) {
		projectLinkProp = `projectLink="${sanitizeUrl(config.projectLink)}"`;
	} else if (siteName) {
		const safeSiteName = sanitizeSiteName(siteName);
		projectLinkProp = `projectLink="https://github.com/Jolli-sample-repos/${safeSiteName}"`;
	}

	return {
		path: "app/layout.tsx",
		content: `import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: '${escapedLogo}',
    template: '%s – Docs'
  },
  description: 'Documentation site'
}

const navbar = (
  <Navbar
    logo={${logoJsx}}
    ${projectLinkProp}${chatProps}
  />
)

const footer = <Footer>${footerText}</Footer>

// Filter out auth routes from navigation (used for JWT auth callback)
function filterAuthFromPageMap(pageMap: Awaited<ReturnType<typeof getPageMap>>) {
  return pageMap.filter(item => !('name' in item && item.name === 'auth'))
}

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pageMap = filterAuthFromPageMap(await getPageMap())

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <style>{\`:root { --nextra-primary-hue: ${primaryHue}deg; }\`}</style>
        ${faviconLink}
      </Head>
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={pageMap}
          editLink={null}
          feedback={{ content: null }}
          toc={{ title: '${escapedTocTitle}' }}
          darkMode={true}
          nextThemes={{ defaultTheme: '${defaultTheme}' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
`,
	};
}

/**
 * Generate app/[...mdxPath]/page.tsx for App Router
 * Uses required catch-all (not optional) so app/page.tsx can handle root route.
 * Includes force-static to ensure proper static generation with Next.js 15+
 */
export function generateCatchAllPage(): TemplateFile {
	// Use required catch-all [...mdxPath] instead of optional [[...mdxPath]]
	// This allows app/page.tsx to handle the root route for JOLLI-191 redirect
	return {
		path: "app/[...mdxPath]/page.tsx",
		content: `import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents } from '../../mdx-components'

// Force static generation to avoid hydration issues with Next.js 15+
export const dynamic = 'force-static'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: {
  params: Promise<{ mdxPath: string[] }>
}) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

export default async function Page(props: {
  params: Promise<{ mdxPath: string[] }>
}) {
  const params = await props.params
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath)
  const Wrapper = useMDXComponents().wrapper

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent />
    </Wrapper>
  )
}
`,
	};
}

/**
 * Generate mdx-components.tsx for App Router
 */
export function generateMdxComponents(): TemplateFile {
	return {
		path: "mdx-components.tsx",
		content: `import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'

const docsComponents = getDocsMDXComponents()

export function useMDXComponents(components?: Record<string, React.ComponentType>) {
  return {
    ...docsComponents,
    ...components
  }
}
`,
	};
}

/**
 * Virtual group meta entry - contains nested article items
 */
export interface VirtualGroupNavMeta {
	title: string;
	type: "page" | "menu";
	items: Record<string, string>;
}

/**
 * Separator meta entry
 */
export interface SeparatorNavMeta {
	type: "separator";
	title?: string;
}

/**
 * Hidden nav meta entry - hides an item from navigation (JOLLI-191)
 */
export interface HiddenNavMeta {
	display: "hidden";
}

/**
 * Navigation meta entry - can be a simple string title, API page, virtual group, menu with href items, separator, or hidden
 */
export type NavMetaEntry = string | ApiPageMeta | VirtualGroupNavMeta | MenuNavMeta | SeparatorNavMeta | HiddenNavMeta;

/**
 * Navigation meta structure for _meta.ts generation
 */
export type NavMeta = Record<string, NavMetaEntry>;

/**
 * Serializes a nested items object for _meta.ts output
 */
function serializeItems(items: Record<string, string>, indent: number): string {
	const spaces = "  ".repeat(indent);
	const itemEntries = Object.entries(items)
		.map(([k, v]) => `${spaces}'${k}': '${v}'`)
		.join(",\n");
	return `{\n${itemEntries}\n${"  ".repeat(indent - 1)}}`;
}

/**
 * Type guard to check if an entry is a hidden nav meta entry
 */
function isHiddenEntry(entry: Exclude<NavMetaEntry, string>): entry is HiddenNavMeta {
	return typeof entry === "object" && "display" in entry && entry.display === "hidden";
}

/**
 * Type guard to check if an entry is a menu nav meta entry with href items (JOLLI-192)
 */
function isMenuWithHrefItems(entry: Exclude<NavMetaEntry, string>): entry is MenuNavMeta {
	if (typeof entry !== "object" || !("type" in entry) || entry.type !== "menu" || !("items" in entry)) {
		return false;
	}
	// Check if items contain objects with href (MenuNavMeta) vs strings (VirtualGroupNavMeta)
	const items = (entry as MenuNavMeta).items;
	const firstValue = Object.values(items)[0];
	return typeof firstValue === "object" && "href" in firstValue;
}

/**
 * Serializes menu items with href for _meta.ts output (JOLLI-192)
 */
function serializeMenuItemsWithHref(items: Record<string, MenuItemWithHref>, indent: number): string {
	const spaces = "  ".repeat(indent);
	const itemEntries = Object.entries(items)
		.map(([k, v]) => `${spaces}'${k}': { title: '${v.title}', href: '${v.href}' }`)
		.join(",\n");
	return `{\n${itemEntries}\n${"  ".repeat(indent - 1)}}`;
}

/**
 * Serializes a complex nav meta entry (virtual group, menu with href items, API page, separator, or hidden)
 */
function serializeNavMetaEntry(entry: Exclude<NavMetaEntry, string>, indent: number): string {
	const spaces = "  ".repeat(indent);

	// Check for hidden entry first (JOLLI-191)
	if (isHiddenEntry(entry)) {
		return `{ display: 'hidden' }`;
	}

	// Check for menu with href items (JOLLI-192) - must be before isVirtualGroup since both have 'items'
	if (isMenuWithHrefItems(entry)) {
		// Menu with href items: { title: '...', type: 'menu', items: { key: { title: '...', href: '...' } } }
		const lines: Array<string> = [
			`${spaces}title: '${entry.title}'`,
			`${spaces}type: 'menu'`,
			`${spaces}items: ${serializeMenuItemsWithHref(entry.items, indent + 1)}`,
		];
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isVirtualGroup(entry)) {
		// Virtual group: { title: '...', type: 'page', items: { ... } }
		const lines: Array<string> = [
			`${spaces}title: '${entry.title}'`,
			`${spaces}type: '${entry.type}'`,
			`${spaces}items: ${serializeItems(entry.items, indent + 1)}`,
		];
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isSeparator(entry)) {
		// Separator: { type: 'separator', title?: '...' }
		const lines: Array<string> = [`${spaces}type: 'separator'`];
		if (entry.title) {
			lines.push(`${spaces}title: '${entry.title}'`);
		}
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isApiPageEntry(entry)) {
		// API page: { title: '...', type: 'page', href: '...' }
		const lines: Array<string> = [`${spaces}title: '${entry.title}'`, `${spaces}type: '${entry.type}'`];
		if (entry.href) {
			lines.push(`${spaces}href: '${entry.href}'`);
		}
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	// Fallback for other object entries - recursively serialize nested objects
	const objectEntries = Object.entries(entry)
		.map(([k, v]) => {
			if (typeof v === "string") {
				return `${spaces}${k}: '${v}'`;
			}
			if (typeof v === "object" && v !== null) {
				return `${spaces}${k}: ${serializeNavMetaEntry(v as Exclude<NavMetaEntry, string>, indent + 1)}`;
			}
			return `${spaces}${k}: ${v}`;
		})
		.join(",\n");
	return `{\n${objectEntries}\n${"  ".repeat(indent - 1)}}`;
}

/**
 * Generate content/_meta.ts for App Router navigation
 * Supports simple string entries, API pages, virtual groups, and separators
 */
export function generateContentMeta(meta: NavMeta): TemplateFile {
	const entries = Object.entries(meta)
		.map(([key, value]) => {
			if (typeof value === "string") {
				// Simple string entry: 'key': 'Title'
				return `  '${key}': '${value}'`;
			}
			// Complex object entry - serialize with proper formatting
			return `  '${key}': ${serializeNavMetaEntry(value, 2)}`;
		})
		.join(",\n");

	return {
		path: "content/_meta.ts",
		content: `export default {
${entries}
}
`,
	};
}

/**
 * Generate content/index.mdx for App Router
 */
export function generateIndexPage(title = "Welcome"): TemplateFile {
	return {
		path: "content/index.mdx",
		content: `# ${title}

Welcome to the documentation site.

## Quick Links

- [Getting Started](/getting-started) - Learn how to get up and running
- [API Reference](/api-reference) - API documentation
`,
	};
}

/**
 * Generate app/page.tsx that redirects to the first article.
 * This is used instead of a generated Home page so users can choose their own landing page.
 * @param firstArticleSlug The slug of the first article to redirect to
 */
export function generateRootRedirectPage(firstArticleSlug: string): TemplateFile {
	const safeSlug = escapeJsString(firstArticleSlug);
	return {
		path: "app/page.tsx",
		content: `import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/${safeSlug}')
}
`,
	};
}

/**
 * Generate app/page.tsx that shows a "no articles" message when site has no articles.
 */
export function generateNoArticlesPage(): TemplateFile {
	return {
		path: "app/page.tsx",
		content: `export default function Home() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>No Articles Yet</h1>
      <p>This documentation site doesn&apos;t have any articles yet.</p>
    </div>
  )
}
`,
	};
}

/**
 * Generate files for API documentation within Nextra layout.
 * Returns two files:
 * - app/api-docs/[[...slug]]/page.tsx (server component with generateStaticParams)
 * - components/ApiReference.tsx (client component with theme logic)
 *
 * Uses optional catch-all [[...slug]] so that:
 * - /api-docs/ (no slug) redirects to first spec
 * - /api-docs/valid-slug renders the API docs
 * - /api-docs/invalid-slug returns 404
 *
 * This split is required because Next.js 15 doesn't allow 'use client' and
 * generateStaticParams in the same file.
 *
 * @param slugs Array of OpenAPI spec slugs to generate static params for
 */
export function generateApiDocsPage(slugs: Array<string>): TemplateFile {
	const staticParams = slugs.map(slug => `    { slug: ['${escapeJsString(slug)}'] }`).join(",\n");
	const validSlugs = slugs.map(slug => `'${escapeJsString(slug)}'`).join(", ");
	const firstSlug = slugs.length > 0 ? escapeJsString(slugs[0]) : "";

	return {
		path: "app/api-docs/[[...slug]]/page.tsx",
		content: `import { redirect, notFound } from 'next/navigation'
import ApiReference from '../../../components/ApiReference'

const VALID_SLUGS = [${validSlugs}]

export function generateStaticParams() {
  return [
    { slug: [] },
${staticParams}
  ]
}

export default async function ApiDocsPage(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const slugArray = params.slug || []

  // No slug provided - redirect to first API doc
  if (slugArray.length === 0) {
    redirect('/api-docs/${firstSlug}')
  }

  const slug = slugArray[0]

  // Invalid slug - return 404
  if (!VALID_SLUGS.includes(slug)) {
    notFound()
  }

  return <ApiReference slug={slug} />
}
`,
	};
}

/**
 * Generate components/ApiReference.tsx - client component for API docs iframe.
 * Handles theme synchronization with next-themes.
 */
export function generateApiReferenceComponent(): TemplateFile {
	return {
		path: "components/ApiReference.tsx",
		content: `'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface ApiReferenceProps {
  slug: string
}

export default function ApiReference({ slug }: ApiReferenceProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render iframe until we know the actual theme
  if (!mounted) {
    return (
      <div style={{ width: '100%', height: 'calc(100vh - 64px)', minHeight: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span>Loading API Reference...</span>
      </div>
    )
  }

  const theme = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', minHeight: '600px' }}>
      <iframe
        key={theme}
        src={\`/api-docs-\${slug}.html?theme=\${theme}\`}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="API Reference"
      />
    </div>
  )
}
`,
	};
}

/**
 * Generate API docs HTML for OpenAPI with modern layout
 * Uses Scalar's modern layout for a clean, responsive API reference
 * Hides branding elements (Powered by Scalar, Share, Generate SDKs) via CSS
 * Supports theme parameter from URL query string (?theme=dark|light)
 */
export function generateApiDocsHtml(specPath = "/openapi.json"): TemplateFile {
	const customCss = `
    /* Hide Powered by Scalar */
    .powered-by-scalar, [class*="powered"], a[href*="scalar.com"]:not([href*="proxy"]) { display: none !important; }
    /* Hide Share button */
    button[aria-label="Share"], [class*="share-button"], [class*="ShareButton"] { display: none !important; }
    /* Hide Generate SDKs link */
    a[href*="sdk"], [class*="generate-sdk"], [class*="GenerateSdk"] { display: none !important; }
    /* Hide footer branding */
    .scalar-api-reference footer a, .footer-branding { display: none !important; }
  `;

	// Base configuration without theme (theme is added dynamically via JavaScript)
	const baseConfig = {
		layout: "modern",
		showSidebar: true,
		defaultOpenAllTags: true,
		hideClientButton: true,
		hideDownloadButton: true,
		customCss,
	};

	// Create light and dark configs
	const lightConfig = { ...baseConfig, darkMode: false };
	const darkConfig = { ...baseConfig, darkMode: true };

	return {
		path: "public/api-docs.html",
		content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Reference</title>
  <style>
    /* Full viewport */
    html, body { margin: 0; padding: 0; height: 100%; }
  </style>
</head>
<body>
  <script>
    // Read theme from URL query parameter and write script with config inline
    // This must happen before Scalar loads so the config is available
    (function() {
      var urlParams = new URLSearchParams(window.location.search);
      var isDark = urlParams.get('theme') === 'dark';
      var config = isDark ? ${JSON.stringify(darkConfig)} : ${JSON.stringify(lightConfig)};

      document.write('<script id="api-reference" data-url="${specPath}" data-proxy-url="https://proxy.scalar.com" data-configuration=\\'' + JSON.stringify(config) + '\\'><\\/script>');
    })();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
`,
	};
}

/**
 * Get all base template files for App Router
 * @param config Theme configuration
 * @param minimalContent If true, only generate minimal index page without default pages
 * @param siteName Site name for default project link
 * @param redirects Optional array of redirect mappings for sanitized slugs
 */
export function getBaseTemplates(
	config: ThemeConfig,
	minimalContent = false,
	siteName?: string,
	redirects?: Array<RedirectMapping>,
): Array<TemplateFile> {
	const templates: Array<TemplateFile> = [
		generatePackageJson(),
		generateNextConfig(redirects),
		generateTsConfig(),
		generateLayout(config, siteName),
		generateCatchAllPage(),
		generateMdxComponents(),
		generateIconComponent(), // Generates /icon route for favicon
		generateFaviconRoute(), // Redirects /favicon.ico to /icon
	];

	if (minimalContent) {
		// JOLLI-191: Don't generate content/index.mdx - app/page.tsx will redirect to first article
		// Only generate empty _meta.ts that will be overwritten by actual content
		templates.push(generateContentMeta({}));
	} else {
		// Generate full default structure with sample pages
		templates.push(
			generateContentMeta({
				index: "Introduction",
				"getting-started": "Getting Started",
				"api-reference": "API Reference",
			}),
		);
		templates.push(generateIndexPage());
		templates.push(generateApiDocsHtml());
	}

	return templates;
}
