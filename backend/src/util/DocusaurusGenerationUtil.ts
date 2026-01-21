import type { FileTree } from "../github/DocsiteGitHub";
import type { Doc } from "../model/Doc";
import type { DocGeneratorOptions } from "./DocGeneratorFactory";
import { type DocContentMetadata, extractApiInfo, type OpenApiParsedSpec } from "jolli-common";

/**
 * Validates if a URL is well-formed and safe for use in markdown links.
 * Rejects vscode:// URLs with Windows paths and other invalid formats.
 */
function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		// Reject vscode:// URLs with Windows paths (invalid format)
		if (parsed.protocol === "vscode:" && url.includes("\\")) {
			return false;
		}
		// Only allow http, https, and ftp protocols
		return ["http:", "https:", "ftp:"].includes(parsed.protocol);
	} catch {
		return false;
	}
}

/**
 * Generates a complete Docusaurus project from a collection of Doc articles.
 * Returns a FileTree array suitable for uploading to GitHub.
 */
export function generateDocusaurusFromArticles(
	articles: Array<Doc>,
	siteName: string,
	displayName: string,
	options?: DocGeneratorOptions,
): Array<FileTree> {
	const files: Array<FileTree> = [];
	const regenerationMode = options?.regenerationMode ?? false;

	// Generate intro page
	files.push({
		path: "docs/intro.md",
		content: generateIntroPage(articles, displayName),
	});

	// Generate article pages (extension based on content type)
	for (const article of articles) {
		const metadata = article.contentMetadata as DocContentMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		const slug = slugify(title);

		// Check if this is an OpenAPI spec
		const openApiSpec = parseOpenApiSpec(article.content, article.contentType);

		if (openApiSpec) {
			// For OpenAPI specs, generate:
			// 1. The raw JSON spec in static folder
			// 2. An overview page with endpoints

			// Store the OpenAPI spec in static folder
			files.push({
				path: "static/openapi.json",
				content: article.content,
			});

			// Generate API overview page with endpoints table
			files.push({
				path: `docs/${slug}.md`,
				content: generateApiOverviewPage(openApiSpec, title),
			});
		} else if (isStructuredDataType(article.contentType)) {
			// Non-OpenAPI JSON/YAML - just save as raw file
			// Type assertion is safe because isStructuredDataType guarantees the type
			const extension = getFileExtension(article.contentType as "application/json" | "application/yaml");
			files.push({
				path: `docs/${slug}${extension}`,
				content: article.content,
			});
		} else {
			// Regular markdown content
			files.push({
				path: `docs/${slug}.md`,
				content: generateArticlePage(article),
			});
		}
	}

	// Only generate config files on initial creation (not during regeneration)
	// During regeneration, these custom config files are preserved from the repository
	if (!regenerationMode) {
		// Generate sidebar for navigation
		files.push({
			path: "sidebars.js",
			content: generateSidebar(articles),
		});
		// Generate Docusaurus config
		files.push({
			path: "docusaurus.config.js",
			content: generateDocusaurusConfig(siteName, displayName),
		});

		// Generate package.json
		files.push({
			path: "package.json",
			content: generatePackageJson(siteName, options?.allowedDomain),
		});

		// Generate custom CSS
		files.push({
			path: "src/css/custom.css",
			content: generateCustomCss(),
		});

		// Generate .gitkeep for static/img directory
		files.push({
			path: "static/img/.gitkeep",
			content: generateGitkeep(),
		});

		// If allowedDomain is provided, generate authentication middleware
		if (options?.allowedDomain) {
			files.push({
				path: "src/theme/Root.js",
				content: generateAuthRoot(options.allowedDomain),
			});
		}
	}

	return files;
}

/**
 * Generates the intro/landing page for the documentation site.
 */
function generateIntroPage(articles: Array<Doc>, displayName: string): string {
	const articleCount = articles.length;

	return `---
sidebar_position: 1
slug: /
---

# Welcome to ${displayName}

This documentation site contains ${articleCount} article${articleCount === 1 ? "" : "s"}.

## About

This site was automatically generated from your documentation articles using Jolli.

## Contents

Browse the sidebar to explore the available documentation.

---

*Last generated: ${new Date().toISOString()}*

<!-- Build ID: ${Date.now()} - Forces cache invalidation on rebuild -->
`;
}

/**
 * Converts a Doc article to a Docusaurus markdown page.
 */
function generateArticlePage(article: Doc): string {
	const metadata = article.contentMetadata as DocContentMetadata | undefined;
	const title = metadata?.title || "Untitled Article";
	const sourceName = metadata?.sourceName || "";
	const sourceUrl = metadata?.sourceUrl || "";

	// Build frontmatter
	const frontmatter: Array<string> = ["---", `title: "${escapeYaml(title)}"`];

	if (sourceName) {
		frontmatter.push(`description: "From ${escapeYaml(sourceName)}"`);
	}

	frontmatter.push("---");
	frontmatter.push("");
	frontmatter.push(`<!-- Build timestamp: ${Date.now()} - Forces cache invalidation -->`);
	frontmatter.push("");

	// Add metadata if available
	const metadataSection: Array<string> = [];
	if (sourceUrl && isValidUrl(sourceUrl)) {
		metadataSection.push(`**Source:** [${sourceName || "View Source"}](${sourceUrl})`);
	} else if (sourceName) {
		// If URL is invalid, just show source name without link
		metadataSection.push(`**Source:** ${sourceName}`);
	}
	if (article.updatedAt) {
		const date = new Date(article.updatedAt).toLocaleDateString();
		metadataSection.push(`**Last Updated:** ${date}`);
	}
	if (metadataSection.length > 0) {
		metadataSection.push("");
		metadataSection.push("---");
		metadataSection.push("");
	}

	// Combine frontmatter, metadata, and content
	return [...frontmatter, ...metadataSection, article.content].join("\n");
}

/**
 * Generates the Docusaurus configuration file.
 */
function generateDocusaurusConfig(siteName: string, displayName: string): string {
	return `// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '${escapeJs(displayName)}',
  tagline: 'Documentation generated by Jolli',
  url: 'https://${siteName}.vercel.app',
  baseUrl: '/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  organizationName: 'Jolli-sample-repos',
  projectName: '${escapeJs(siteName)}',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      '@docusaurus/preset-classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: '${escapeJs(displayName)}',
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Documentation',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: \`Copyright © \${new Date().getFullYear()} ${escapeJs(displayName)}. Generated with Jolli.\`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.github,
        darkTheme: require('prism-react-renderer').themes.dracula,
      },
    }),
};

module.exports = config;
`;
}

/**
 * Generates the sidebar configuration.
 */
function generateSidebar(articles: Array<Doc>): string {
	const items: Array<string> = ['"intro"'];

	// Add all articles to sidebar
	for (const article of articles) {
		const metadata = article.contentMetadata as DocContentMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		const slug = slugify(title);
		items.push(`"${slug}"`);
	}

	const sidebar = {
		docs: items.map(item => item.replace(/"/g, "")),
	};

	return `/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = ${JSON.stringify(sidebar, null, 2)};

module.exports = sidebars;
`;
}

/**
 * Generates the package.json file.
 */
function generatePackageJson(siteName: string, allowedDomain?: string): string {
	const packageJson: Record<string, unknown> = {
		name: siteName,
		version: "1.0.0",
		private: true,
		scripts: {
			docusaurus: "docusaurus",
			start: "docusaurus start",
			build: "docusaurus build",
			swizzle: "docusaurus swizzle",
			deploy: "docusaurus deploy",
			clear: "docusaurus clear",
			serve: "docusaurus serve",
			"write-translations": "docusaurus write-translations",
			"write-heading-ids": "docusaurus write-heading-ids",
		},
		dependencies: {
			"@docusaurus/core": "^3.0.0",
			"@docusaurus/preset-classic": "^3.0.0",
			"@mdx-js/react": "^3.0.0",
			clsx: "^2.0.0",
			"prism-react-renderer": "^2.1.0",
			react: "^18.2.0",
			"react-dom": "^18.2.0",
		},
		devDependencies: {
			"@docusaurus/module-type-aliases": "^3.0.0",
			"@docusaurus/types": "^3.0.0",
		},
		browserslist: {
			production: [">0.5%", "not dead", "not op_mini all"],
			development: ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"],
		},
		engines: {
			node: ">=18.0",
		},
	};

	// Add authentication dependencies if needed
	if (allowedDomain) {
		(packageJson.dependencies as Record<string, string>)["@auth0/auth0-react"] = "^2.2.0";
	}

	return JSON.stringify(packageJson, null, 2);
}

/**
 * Generates the custom CSS file.
 */
function generateCustomCss(): string {
	return `/**
 * Custom CSS for Documentation Site
 * Generated by Jolli
 */

:root {
  --ifm-color-primary: #2e8555;
  --ifm-color-primary-dark: #29784c;
  --ifm-color-primary-darker: #277148;
  --ifm-color-primary-darkest: #205d3b;
  --ifm-color-primary-light: #33925d;
  --ifm-color-primary-lighter: #359962;
  --ifm-color-primary-lightest: #3cad6e;
  --ifm-code-font-size: 95%;
  --docusaurus-highlighted-code-line-bg: rgba(0, 0, 0, 0.1);
}

[data-theme='dark'] {
  --ifm-color-primary: #25c2a0;
  --ifm-color-primary-dark: #21af90;
  --ifm-color-primary-darker: #1fa588;
  --ifm-color-primary-darkest: #1a8870;
  --ifm-color-primary-light: #29d5b0;
  --ifm-color-primary-lighter: #32d8b4;
  --ifm-color-primary-lightest: #4fddbf;
  --docusaurus-highlighted-code-line-bg: rgba(0, 0, 0, 0.3);
}
`;
}

/**
 * Generates a .gitkeep file for the static/img directory.
 */
function generateGitkeep(): string {
	return `# Static Assets

Place your static files (images, PDFs, etc.) in this directory.
They will be copied to the root of the build output.
`;
}

/**
 * Converts a title to a URL-safe slug.
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "") // Remove special characters
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/--+/g, "-") // Replace multiple hyphens with single hyphen
		.replace(/^-+|-+$/g, ""); // Trim hyphens from start and end
}

/**
 * Gets the file extension for a structured data content type.
 * Only called when isStructuredDataType returns true, so contentType
 * is guaranteed to be "application/json" or "application/yaml".
 */
function getFileExtension(contentType: "application/json" | "application/yaml"): string {
	return contentType === "application/json" ? ".json" : ".yaml";
}

/**
 * Checks if content is an OpenAPI specification.
 * Returns the parsed spec if it is, or null if not.
 */
function parseOpenApiSpec(content: string, contentType: string | undefined): OpenApiParsedSpec | null {
	if (contentType !== "application/json") {
		// Only JSON is supported for OpenAPI parsing currently
		return null;
	}

	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		if ("openapi" in parsed || "swagger" in parsed) {
			return parsed as OpenApiParsedSpec;
		}
	} catch {
		// Not valid JSON or not an OpenAPI spec
	}
	return null;
}

/**
 * Generates an API overview markdown page from an OpenAPI spec for Docusaurus.
 */
function generateApiOverviewPage(spec: OpenApiParsedSpec, title: string): string {
	const info = extractApiInfo(spec);

	const endpointTable = info.endpoints
		.map(
			(e: { method: string; path: string; summary?: string }) =>
				`| ${e.method} | \`${e.path}\` | ${e.summary || "-"} |`,
		)
		.join("\n");

	return `---
title: "${escapeYaml(title)}"
---

# ${info.title}

${info.description || "API documentation."}

**Version:** ${info.version}

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
${endpointTable}

## Interactive Documentation

To explore and test the API endpoints, you can use tools like [Swagger UI](https://swagger.io/tools/swagger-ui/) or [Scalar](https://scalar.com/) with the OpenAPI specification file.

---

<!-- Build timestamp: ${Date.now()} - Forces cache invalidation -->
`;
}

/**
 * Checks if the content type is a structured data format (JSON/YAML).
 */
function isStructuredDataType(contentType: string | undefined): boolean {
	return contentType === "application/json" || contentType === "application/yaml";
}

/**
 * Escapes special characters for YAML frontmatter.
 */
function escapeYaml(text: string): string {
	return text.replace(/"/g, '\\"').replace(/\n/g, " ");
}

/**
 * Escapes special characters for JavaScript strings.
 */
function escapeJs(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Generates the authentication Root component for Docusaurus.
 * This component wraps the entire application and provides domain-based authentication.
 */
function generateAuthRoot(allowedDomain: string): string {
	return `import React, { useState, useEffect } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

// Auth0 configuration - these would typically come from environment variables
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'dev-example.us.auth0.com';
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || 'your-client-id';
const ALLOWED_DOMAIN = '${allowedDomain}';

function AuthGate({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect, user, error } = useAuth0();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      // Check if user's email domain matches the allowed domain
      const email = user.email || '';
      const userDomain = email.split('@')[1];

      if (userDomain === ALLOWED_DOMAIN) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    }
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Loading authentication...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Authentication error: {error.message}</div>
        <button onClick={() => loginWithRedirect()}>Try Again</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Authentication Required</h2>
        <p>This documentation site is restricted to @${allowedDomain} users.</p>
        <button
          onClick={() => loginWithRedirect()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Sign In
        </button>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Access Denied</h2>
        <p>This documentation site is only accessible to users with @${allowedDomain} email addresses.</p>
        <p>Your email: {user?.email}</p>
      </div>
    );
  }

  return children;
}

export default function Root({ children }) {
  // Skip authentication in SSR/build time
  if (!ExecutionEnvironment.canUseDOM) {
    return children;
  }

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
      }}
    >
      <AuthGate>{children}</AuthGate>
    </Auth0Provider>
  );
}
`;
}
