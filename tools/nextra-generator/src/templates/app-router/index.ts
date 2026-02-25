import type { ApiPageMeta, ExternalLinkMeta, TemplateFile, ThemeConfig } from "../../types.js";
import { isApiPageEntry, isExternalLink, isSeparator, isVirtualGroup } from "../../utils/migration.js";
import { escapeHtml, escapeJsString, sanitizeUrl, validateNumberRange } from "../../utils/sanitize.js";
import { FONT_CONFIG, type MenuItemWithHref, type MenuNavMeta } from "jolli-common";

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
					nextra: "^4.6.1",
					"nextra-theme-docs": "^4.6.1",
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
 * Code theme mapping to shiki themes
 */
const CODE_THEME_MAP: Record<string, { light: string; dark: string }> = {
	github: { light: "github-light", dark: "github-dark" },
	dracula: { light: "dracula-soft", dark: "dracula" },
	"one-dark": { light: "one-light", dark: "one-dark-pro" },
	nord: { light: "nord", dark: "nord" },
};

export function generateNextConfig(codeTheme?: string): TemplateFile {
	// Get code theme configuration
	const themes = CODE_THEME_MAP[codeTheme || "github"];
	const codeThemeConfig = `
    rehypePrettyCodeOptions: {
      theme: {
        light: '${themes.light}',
        dark: '${themes.dark}'
      }
    }`;

	return {
		path: "next.config.mjs",
		content: `import nextra from 'nextra'

const withNextra = nextra({
  // Format detection based on file extension:
  // - .md files use lenient parsing (curly braces as text, HTML-like content allowed)
  // - .mdx files use strict MDX parsing (requires valid JSX syntax)
  mdxOptions: {
    format: 'detect',${codeThemeConfig}
  }
})

export default withNextra({
  reactStrictMode: true,
})
`,
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
 * Generate app/globals.css with polished styling for Nextra sites.
 * Includes:
 * - Header link positioning (before search bar via CSS order)
 * - Full-width footer with proper container overrides
 * - Primary color hover effects throughout
 * - Overflow handling for many header links
 */
/**
 * Font family CSS mapping - derived from centralized FONT_CONFIG in jolli-common.
 */
const FONT_FAMILY_MAP: Record<string, string> = {
	inter: FONT_CONFIG.inter.cssFamily,
	"space-grotesk": FONT_CONFIG["space-grotesk"].cssFamily,
	"ibm-plex": FONT_CONFIG["ibm-plex"].cssFamily,
	"source-sans": FONT_CONFIG["source-sans"].cssFamily,
};

/**
 * Border radius CSS mapping
 */
const BORDER_RADIUS_MAP: Record<string, string> = {
	sharp: "2px",
	subtle: "4px",
	rounded: "8px",
	pill: "12px",
};

/**
 * Spacing density CSS mapping
 */
const SPACING_MAP: Record<string, { base: string; section: string; paragraph: string }> = {
	compact: { base: "0.75rem", section: "1.5rem", paragraph: "0.875rem" },
	comfortable: { base: "1rem", section: "2rem", paragraph: "1rem" },
	airy: { base: "1.5rem", section: "3rem", paragraph: "1.25rem" },
};

/**
 * Page width CSS mapping (overall page container max-width)
 */
const PAGE_WIDTH_MAP: Record<string, string> = {
	compact: "90rem",
	standard: "100rem",
	wide: "100%",
};

/**
 * Content width CSS mapping (article text area max-width)
 */
const CONTENT_WIDTH_MAP: Record<string, string> = {
	compact: "45rem",
	standard: "55rem",
	wide: "70rem",
};

/**
 * Panel width CSS mapping (sidebar and TOC share the same sizes)
 */
const PANEL_WIDTH_MAP: Record<string, string> = {
	compact: "14rem",
	standard: "16rem",
	wide: "20rem",
};

/**
 * Code theme background colors (must match shiki themes)
 * These provide fallback colors in case rehype-pretty-code doesn't apply them
 */
const CODE_BG_MAP: Record<string, { light: string; dark: string }> = {
	github: { light: "#f6f8fa", dark: "#24292e" },
	dracula: { light: "#282a36", dark: "#282a36" },
	"one-dark": { light: "#fafafa", dark: "#282c34" },
	nord: { light: "#eceff4", dark: "#2e3440" },
};

export function generateGlobalStyles(config: ThemeConfig): TemplateFile {
	const primaryHue = validateNumberRange(config.primaryHue, 0, 360, 212);
	const fontFamily = FONT_FAMILY_MAP[config.fontFamily || "inter"];
	const borderRadius = BORDER_RADIUS_MAP[config.borderRadius || "subtle"];
	const spacing = SPACING_MAP[config.spacingDensity || "comfortable"];
	const codeTheme = config.codeTheme || "github";
	const codeBg = CODE_BG_MAP[codeTheme] || CODE_BG_MAP.github;
	const pageWidthKey = config.pageWidth || "wide";
	const pageWidth = PAGE_WIDTH_MAP[pageWidthKey] || PAGE_WIDTH_MAP.wide;
	const contentWidth = CONTENT_WIDTH_MAP[config.contentWidth || "standard"] || CONTENT_WIDTH_MAP.standard;
	const sidebarWidth = PANEL_WIDTH_MAP[config.sidebarWidth || "standard"] || PANEL_WIDTH_MAP.standard;
	const tocWidth = PANEL_WIDTH_MAP[config.tocWidth || "standard"] || PANEL_WIDTH_MAP.standard;
	const footerAlign = config.headerAlignment === "left" ? "flex-start" : "flex-end";

	return {
		path: "app/globals.css",
		content: `/* Jolli Site Branding - Global Styles */

/* ===== CSS Variables ===== */
:root {
  /* Color */
  --jolli-primary-hue: ${primaryHue};
  --jolli-primary: hsl(var(--jolli-primary-hue), 100%, 45%);
  --jolli-primary-light: hsl(var(--jolli-primary-hue), 100%, 55%);
  --jolli-primary-bg: hsl(var(--jolli-primary-hue), 100%, 97%);

  /* Typography */
  --jolli-font-family: ${fontFamily};

  /* Border Radius */
  --jolli-radius-sm: ${borderRadius};
  --jolli-radius-md: calc(${borderRadius} * 1.5);
  --jolli-radius-lg: calc(${borderRadius} * 2);

  /* Spacing */
  --jolli-spacing-base: ${spacing.base};
  --jolli-spacing-section: ${spacing.section};
  --jolli-spacing-paragraph: ${spacing.paragraph};

  /* Layout Widths - !important overrides Nextra Head component's inline style */
  --nextra-content-width: ${pageWidth} !important;
  --jolli-content-max-width: ${contentWidth};
  --jolli-sidebar-width: ${sidebarWidth};
  --jolli-toc-width: ${tocWidth};
}

.dark {
  --jolli-primary: hsl(var(--jolli-primary-hue), 100%, 60%);
  --jolli-primary-light: hsl(var(--jolli-primary-hue), 100%, 70%);
  --jolli-primary-bg: hsl(var(--jolli-primary-hue), 30%, 15%);
}

/* ===== Typography ===== */

body,
.nextra-content,
article {
  font-family: var(--jolli-font-family);
}

/* ===== Spacing ===== */

article p {
  margin-bottom: var(--jolli-spacing-paragraph);
}

article h1,
article h2,
article h3,
article h4,
article h5,
article h6 {
  margin-top: var(--jolli-spacing-section);
  margin-bottom: var(--jolli-spacing-base);
}

article ul,
article ol {
  margin-bottom: var(--jolli-spacing-paragraph);
}

/* ===== Header / Navbar ===== */

/* Style Nextra navbar links and menu buttons uniformly */
nav a[href]:not([class*="logo"]),
nav button:not([aria-label="Search"]):not([aria-label="Toggle theme"]) {
  color: var(--shiki-token-text, #374151) !important;
  text-decoration: none !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
  white-space: nowrap;
  padding: 0.25rem 0.5rem !important;
  border-radius: 0.25rem;
  transition: color 0.15s ease, background-color 0.15s ease !important;
  background: transparent !important;
  border: none !important;
}

/* Hover effect for navbar items */
nav a[href]:not([class*="logo"]):hover,
nav button:not([aria-label="Search"]):not([aria-label="Toggle theme"]):hover {
  color: var(--jolli-primary, hsl(212, 100%, 45%)) !important;
  background-color: var(--jolli-primary-bg, hsl(212, 100%, 97%)) !important;
}

/* Dark mode navbar items */
.dark nav a[href]:not([class*="logo"]),
.dark nav button:not([aria-label="Search"]):not([aria-label="Toggle theme"]) {
  color: #d1d5db !important;
}

.dark nav a[href]:not([class*="logo"]):hover,
.dark nav button:not([aria-label="Search"]):not([aria-label="Toggle theme"]):hover {
  color: var(--jolli-primary, hsl(212, 100%, 60%)) !important;
  background-color: var(--jolli-primary-bg, hsl(212, 30%, 15%)) !important;
}

/* Hide external link arrow icon in navbar (JOLLI-382) */
/* Links still open in new window, just without the visual indicator */
nav a[href] svg[class*="external"],
nav a[href] svg[data-testid="external-link"],
nav a[target="_blank"] svg,
nav a[href^="http"] svg:last-child,
nav a[href^="https"] svg:last-child {
  display: none !important;
}

/* ===== Footer ===== */

/* Footer alignment matches header nav alignment */
footer {
  justify-content: ${footerAlign} !important;
}

footer a {
  transition: color 0.15s ease, opacity 0.15s ease;
}

footer a:hover {
  color: var(--jolli-primary) !important;
  opacity: 1 !important;
}

/* ===== Sidebar Navigation ===== */

/* Sidebar link hover effects */
aside a:hover,
nav.nextra-sidebar-container a:hover,
[class*="sidebar"] a:hover {
  color: var(--jolli-primary) !important;
}

/* Active sidebar item */
aside a[data-active="true"],
nav.nextra-sidebar-container a[data-active="true"],
[class*="sidebar"] a[data-active="true"] {
  color: var(--jolli-primary) !important;
  background-color: var(--jolli-primary-bg) !important;
}

/* ===== Content Links ===== */

article a:not([class]) {
  color: var(--jolli-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s ease;
}

article a:not([class]):hover {
  color: var(--jolli-primary-light);
}

/* ===== TOC (Table of Contents) ===== */

.nextra-toc a:hover,
[class*="toc"] a:hover {
  color: var(--jolli-primary) !important;
}

.nextra-toc a[data-active="true"],
[class*="toc"] a[data-active="true"] {
  color: var(--jolli-primary) !important;
}

/* ===== Layout Width Overrides ===== */

/* Content area max-width for readability */
/* margin-left: auto splits free space so article+TOC group together */
.nextra-sidebar ~ article {
  max-width: var(--jolli-content-max-width) !important;
  margin-left: auto !important;
}

/* Sidebar width override */
.nextra-sidebar {
  width: var(--jolli-sidebar-width) !important;
  min-width: var(--jolli-sidebar-width) !important;
}

/* TOC width override — margin-right: auto pushes remaining space to the right */
.nextra-toc {
  width: var(--jolli-toc-width) !important;
  min-width: var(--jolli-toc-width) !important;
  margin-right: auto !important;
}

/* Hide TOC scrollbars while preserving scroll functionality */
.nextra-toc nav,
.nextra-toc > nav {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.nextra-toc nav::-webkit-scrollbar,
.nextra-toc > nav::-webkit-scrollbar {
  display: none;
}

/* Responsive: revert sidebar width on mobile */
@media (max-width: 768px) {
  .nextra-sidebar {
    width: auto !important;
    min-width: auto !important;
  }
}

/* Responsive: revert TOC width below xl breakpoint */
@media (max-width: 1280px) {
  .nextra-toc {
    width: auto !important;
    min-width: auto !important;
  }
}
${
	pageWidthKey === "wide"
		? `
/* Full-width: add subtle side padding on wide screens */
@media (min-width: 1280px) {
  :root {
    --nextra-content-width: calc(100% - 3rem) !important;
  }
}
`
		: ""
}
/* ===== Search ===== */

.nextra-search-results li:hover {
  background-color: var(--jolli-primary-bg) !important;
}

/* ===== Buttons & Interactive Elements ===== */

button[aria-label="Toggle theme"]:hover,
button.nextra-button:hover {
  color: var(--jolli-primary) !important;
}

/* ===== Code Blocks ===== */

/* Code block background colors (fallback if shiki doesn't apply) */
:root {
  --jolli-code-bg: ${codeBg.light};
}
.dark {
  --jolli-code-bg: ${codeBg.dark};
}

/* Inline code */
code:not([class*="language-"]):not(pre code) {
  background-color: var(--jolli-primary-bg);
  border-radius: 0.25rem;
  padding: 0.125rem 0.375rem;
}

/* Code block containers */
pre {
  background-color: var(--jolli-code-bg) !important;
  border-radius: var(--jolli-radius-md) !important;
  margin: var(--jolli-spacing-base) 0 !important;
}

/* Ensure code inside pre fills the container properly */
pre > code {
  display: block !important;
  padding: 1rem !important;
  background: transparent !important;
  border-radius: inherit !important;
}

/* Fix potential spacing issues with shiki/rehype-pretty-code */
[data-rehype-pretty-code-figure] {
  margin: var(--jolli-spacing-base) 0;
}

[data-rehype-pretty-code-figure] pre {
  margin: 0 !important;
  border-radius: var(--jolli-radius-md) !important;
  overflow-x: auto;
  background-color: var(--jolli-code-bg) !important;
}

/* Code block title/filename styling */
[data-rehype-pretty-code-title] {
  border-radius: var(--jolli-radius-md) var(--jolli-radius-md) 0 0;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: var(--jolli-primary-bg);
}

[data-rehype-pretty-code-title] + pre {
  border-radius: 0 0 var(--jolli-radius-md) var(--jolli-radius-md) !important;
  margin-top: 0 !important;
}

/* ===== Responsive Adjustments ===== */

@media (max-width: 768px) {
  footer > div,
  footer > *,
  .nextra-footer > div,
  .nextra-footer > * {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}

/* ===== Print Styles ===== */

@media print {
  footer {
    display: none !important;
  }
}
`,
	};
}

/**
 * Build footer text with mandatory "Powered by Jolli" branding for App Router
 * Uses footerConfig if available, falls back to legacy footer string
 *
 * For simple footers, returns plain text.
 * For structured footers with columns, returns a React fragment with proper styling.
 */
function buildAppRouterFooterText(config: ThemeConfig): string {
	// If footerConfig is provided, build structured footer
	if (config.footerConfig) {
		return buildStructuredFooter(config, config.headerAlignment || "right");
	}
	// Legacy: simple text footer
	if (config.footer) {
		return `${escapeHtml(config.footer)} · Powered by Jolli`;
	}
	return `${escapeHtml(config.logo)} · Powered by Jolli`;
}

/**
 * Build social icons JSX for footer
 */
function buildSocialIconsJsx(socialLinks: import("jolli-common").SocialLinks, align = "flex-end"): string {
	const icons: Array<string> = [];

	if (socialLinks.github) {
		icons.push(`<a key="github" href="${sanitizeUrl(socialLinks.github)}" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', opacity: 0.6 }} aria-label="GitHub">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        </a>`);
	}

	if (socialLinks.twitter) {
		icons.push(`<a key="twitter" href="${sanitizeUrl(socialLinks.twitter)}" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', opacity: 0.6 }} aria-label="Twitter">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>`);
	}

	if (socialLinks.discord) {
		icons.push(`<a key="discord" href="${sanitizeUrl(socialLinks.discord)}" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', opacity: 0.6 }} aria-label="Discord">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019z"/></svg>
        </a>`);
	}

	if (socialLinks.linkedin) {
		icons.push(`<a key="linkedin" href="${sanitizeUrl(socialLinks.linkedin)}" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', opacity: 0.6 }} aria-label="LinkedIn">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        </a>`);
	}

	if (socialLinks.youtube) {
		icons.push(`<a key="youtube" href="${sanitizeUrl(socialLinks.youtube)}" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', opacity: 0.6 }} aria-label="YouTube">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>`);
	}

	if (icons.length === 0) {
		return "";
	}

	return `<div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', justifyContent: '${align}' }}>
          ${icons.join("\n          ")}
        </div>`;
}

/**
 * Build structured footer with copyright, columns, social icons, and "Powered by Jolli"
 * Uses flexbox for proper responsive layout.
 * Structure: columns row(s) on top, then social icons, then divider, then copyright + powered by on bottom.
 */
function buildStructuredFooter(config: ThemeConfig, alignment: string): string {
	const footerConfig = config.footerConfig;
	if (!footerConfig) {
		return "Powered by Jolli";
	}

	const align = alignment === "left" ? "flex-start" : "flex-end";
	const textAlign = alignment === "left" ? "left" : "right";
	const socialIconsJsx = footerConfig.socialLinks ? buildSocialIconsJsx(footerConfig.socialLinks, align) : "";

	// For structured footers, we need to return JSX
	// Layout: columns on top in a flex row, social icons, copyright/powered by below
	if (footerConfig.columns && footerConfig.columns.length > 0) {
		const isRight = alignment === "right";
		const columnCount = footerConfig.columns.length;
		const columnsJsx = footerConfig.columns
			.map((col, i) => {
				const linksJsx = col.links
					.map(
						link =>
							`<a href="${sanitizeUrl(link.url)}" target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '0.5rem', color: 'inherit', opacity: 0.7, textDecoration: 'none' }}>${escapeHtml(link.label)}</a>`,
					)
					.join("\n              ");
				// Skip minWidth on last column when right-aligned so it sits flush against the right edge
				const skipMinWidth = isRight && i === columnCount - 1;
				const minWidth = skipMinWidth ? "" : "minWidth: '180px', ";
				return `<div key="${escapeHtml(col.title)}" style={{ ${minWidth}marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>${escapeHtml(col.title)}</div>
            ${linksJsx}
          </div>`;
			})
			.join("\n          ");

		const copyrightText = footerConfig.copyright
			? `© ${escapeHtml(footerConfig.copyright)} · Powered by Jolli`
			: "Powered by Jolli";

		// Stack vertically: columns flex container on top, social icons, then border, then copyright
		return `<div style={{ width: '100%' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: '${align}', marginBottom: '1.5rem' }}>
          ${columnsJsx}
        </div>
        ${socialIconsJsx}
        <div style={{ borderTop: '1px solid var(--nextra-border, #e5e7eb)', paddingTop: '1rem', opacity: 0.6, fontSize: '0.875rem', textAlign: '${textAlign}' }}>${copyrightText}</div>
      </div>`;
	}

	// No columns but maybe social links
	if (socialIconsJsx || footerConfig.copyright) {
		const copyrightText = footerConfig.copyright
			? `© ${escapeHtml(footerConfig.copyright)} · Powered by Jolli`
			: "Powered by Jolli";

		if (socialIconsJsx) {
			return `<div style={{ width: '100%' }}>
        ${socialIconsJsx}
        <div style={{ borderTop: '1px solid var(--nextra-border, #e5e7eb)', paddingTop: '1rem', opacity: 0.6, fontSize: '0.875rem', textAlign: '${textAlign}' }}>${copyrightText}</div>
      </div>`;
		}

		return copyrightText;
	}

	return "Powered by Jolli";
}

/**
 * Build logo JSX for App Router
 * If logoUrl is provided, shows only the image (assumes logo includes brand text)
 * Otherwise shows text only
 */
function buildAppRouterLogoJsx(config: ThemeConfig): string {
	const escapedLogo = escapeHtml(config.logo);
	const logoUrl = config.logoUrl;
	// Default: if logoUrl is set and no explicit display mode, show both text and image
	const displayMode = config.logoDisplay || (logoUrl ? "both" : "text");

	const textJsx = `<span style={{ fontWeight: 700, fontSize: '1.125rem' }}>${escapedLogo}</span>`;
	const imageJsx = logoUrl
		? `<img src="${sanitizeUrl(logoUrl)}" alt="${escapedLogo}" style={{ height: '28px', maxHeight: '28px', width: 'auto', objectFit: 'contain' }} />`
		: textJsx;

	if (displayMode === "both" && logoUrl) {
		return `<>${imageJsx}${textJsx}</>`;
	}
	if (displayMode === "image" && logoUrl) {
		return imageJsx;
	}
	return textJsx;
}

/**
 * Build chat link and icon props for App Router Navbar
 * @deprecated Use headerLinks instead
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
 * Google Fonts link mapping - derived from centralized FONT_CONFIG in jolli-common.
 */
const GOOGLE_FONTS_MAP: Record<string, string> = {
	inter: FONT_CONFIG.inter.url,
	"space-grotesk": FONT_CONFIG["space-grotesk"].url,
	"ibm-plex": FONT_CONFIG["ibm-plex"].url,
	"source-sans": FONT_CONFIG["source-sans"].url,
};

export function generateLayout(config: ThemeConfig, _siteName?: string): TemplateFile {
	const footerText = buildAppRouterFooterText(config);
	const logoJsx = buildAppRouterLogoJsx(config);
	const chatProps = buildAppRouterChatProps(config);
	const primaryHue = validateNumberRange(config.primaryHue, 0, 360, 212);
	const defaultTheme = config.defaultTheme ?? "system";
	const faviconLink = config.favicon ? `<link rel="icon" href="${sanitizeUrl(config.favicon)}" />` : "";
	const escapedLogo = escapeJsString(config.logo);
	const escapedTocTitle = escapeJsString(config.tocTitle ?? "On This Page");
	const hideToc = config.hideToc ?? false;
	const sidebarCollapseLevel = validateNumberRange(config.sidebarDefaultCollapseLevel, 1, 6, 2);
	const fontFamily = config.fontFamily || "inter";
	const googleFontUrl = GOOGLE_FONTS_MAP[fontFamily];
	const fontLink = googleFontUrl ? `<link rel="stylesheet" href="${googleFontUrl}" />` : "";

	// Build project link - only show if explicitly configured (no default GitHub link)
	// The backing repo link was removed from the UI in the branding update
	let projectLinkProp = "";
	if (config.projectLink) {
		projectLinkProp = `projectLink="${sanitizeUrl(config.projectLink)}"`;
	}
	// NOTE: We no longer auto-generate a GitHub link - users must explicitly set projectLink

	// JOLLI-382: Header links are now in _meta.ts for native Nextra navbar rendering
	// They appear in the navbar based on their order in _meta.ts

	// TOC config - hide if hideToc is true
	const tocConfig = hideToc ? "toc={{ extraContent: null }}" : `toc={{ title: '${escapedTocTitle}' }}`;

	// Sidebar config
	const sidebarConfig = `sidebar={{ defaultMenuCollapseLevel: ${sidebarCollapseLevel} }}`;

	// Build Head color prop for primary color customization
	const headColorProp = `color={{ hue: ${primaryHue}, saturation: 100 }}`;

	// Build Navbar JSX - header alignment controls where nav links appear
	const navAlign = config.headerAlignment || "right";
	const navbarJsx = `<Navbar
    logo={${logoJsx}}
    align="${navAlign}"
    ${projectLinkProp}${chatProps}
  />`;

	return {
		path: "app/layout.tsx",
		content: `import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata = {
  title: {
    default: '${escapedLogo}',
    template: '%s – Docs'
  },
  description: 'Documentation site'
}

const navbar = (
  ${navbarJsx}
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
      <Head ${headColorProp}>
        ${fontLink}
        ${faviconLink}
      </Head>
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={pageMap}
          editLink={null}
          feedback={{ content: null }}
          ${tocConfig}
          ${sidebarConfig}
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
 * Navigation meta entry - can be a simple string title, API page, external link, virtual group, menu with href items, separator, or hidden
 */
export type NavMetaEntry =
	| string
	| ApiPageMeta
	| ExternalLinkMeta
	| VirtualGroupNavMeta
	| MenuNavMeta
	| SeparatorNavMeta
	| HiddenNavMeta;

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
		.map(([k, v]) => `${spaces}'${escapeJsString(k)}': '${escapeJsString(v)}'`)
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
		.map(
			([k, v]) =>
				`${spaces}'${escapeJsString(k)}': { title: '${escapeJsString(v.title)}', href: '${escapeJsString(v.href)}' }`,
		)
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
		const lines: Array<string> = [
			`${spaces}title: '${escapeJsString(entry.title)}'`,
			`${spaces}type: 'menu'`,
			`${spaces}items: ${serializeMenuItemsWithHref(entry.items, indent + 1)}`,
		];
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isVirtualGroup(entry)) {
		const lines: Array<string> = [
			`${spaces}title: '${escapeJsString(entry.title)}'`,
			`${spaces}type: '${entry.type}'`,
			`${spaces}items: ${serializeItems(entry.items, indent + 1)}`,
		];
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isSeparator(entry)) {
		const lines: Array<string> = [`${spaces}type: 'separator'`];
		if (entry.title) {
			lines.push(`${spaces}title: '${escapeJsString(entry.title)}'`);
		}
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isApiPageEntry(entry)) {
		// Note: newWindow is NOT supported by Nextra 4's strict schema
		const lines: Array<string> = [
			`${spaces}title: '${escapeJsString(entry.title)}'`,
			`${spaces}type: '${entry.type}'`,
		];
		if (entry.href) {
			lines.push(`${spaces}href: '${escapeJsString(entry.href)}'`);
		}
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	if (isExternalLink(entry)) {
		// Note: newWindow is NOT supported by Nextra 4's strict schema
		const lines: Array<string> = [];
		if (entry.title) {
			lines.push(`${spaces}title: '${escapeJsString(entry.title)}'`);
		}
		lines.push(`${spaces}href: '${escapeJsString(entry.href)}'`);
		return `{\n${lines.join(",\n")}\n${"  ".repeat(indent - 1)}}`;
	}

	// Fallback for other object entries
	const objectEntries = Object.entries(entry)
		.map(([k, v]) => {
			if (typeof v === "string") {
				return `${spaces}${k}: '${escapeJsString(v)}'`;
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
				return `  '${escapeJsString(key)}': '${escapeJsString(value)}'`;
			}
			return `  '${escapeJsString(key)}': ${serializeNavMetaEntry(value, 2)}`;
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
 */
export function getBaseTemplates(config: ThemeConfig, minimalContent = false, siteName?: string): Array<TemplateFile> {
	const templates: Array<TemplateFile> = [
		generatePackageJson(),
		generateNextConfig(config.codeTheme),
		generateTsConfig(),
		generateLayout(config, siteName),
		generateGlobalStyles(config), // Custom branding styles
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
