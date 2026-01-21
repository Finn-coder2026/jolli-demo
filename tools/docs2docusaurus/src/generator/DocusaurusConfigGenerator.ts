import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ConfigOptions {
	title: string;
	url: string;
	baseUrl: string;
	organizationName: string;
	projectName: string;
}

export class DocusaurusConfigGenerator {
	constructor(private options: ConfigOptions) {}

	/**
	 * Generate all Docusaurus configuration files
	 */
	generate(outputPath: string): void {
		// Generate docusaurus.config.js
		this.generateDocusaurusConfig(outputPath);

		// Generate package.json
		this.generatePackageJson(outputPath);

		// Generate CSS
		this.generateCSS(outputPath);

		// Generate static assets placeholders
		this.generateStaticAssets(outputPath);
	}

	/**
	 * Generate docusaurus.config.js
	 */
	private generateDocusaurusConfig(outputPath: string): void {
		const config = `// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '${this.options.title}',
  tagline: 'Auto-generated documentation',
  url: '${this.options.url}',
  baseUrl: '${this.options.baseUrl}',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  organizationName: '${this.options.organizationName}',
  projectName: '${this.options.projectName}',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: undefined, // Disable edit links for generated docs
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
        title: '${this.options.title}',
        logo: {
          alt: '${this.options.title} Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: '${this.options.url}',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Getting Started',
                to: '/',
              },
            ],
          },
        ],
        copyright: \`Copyright © \${new Date().getFullYear()} ${this.options.organizationName}. Built with Docusaurus.\`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.github,
        darkTheme: require('prism-react-renderer').themes.dracula,
        additionalLanguages: ['bash', 'diff', 'json', 'docker', 'yaml'],
      },
    }),
};

module.exports = config;
`;

		const configPath = join(outputPath, "docusaurus.config.js");
		writeFileSync(configPath, config);
	}

	/**
	 * Generate package.json
	 */
	private generatePackageJson(outputPath: string): void {
		const packageJson = {
			name: "documentation-site",
			version: "0.0.0",
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
				react: "^18.0.0",
				"react-dom": "^18.0.0",
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

		const packagePath = join(outputPath, "package.json");
		writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
	}

	/**
	 * Generate custom CSS
	 */
	private generateCSS(outputPath: string): void {
		const cssContent = `/**
 * Any CSS included here will be global. The classic template
 * bundles Infima by default. Infima is a CSS framework designed to
 * work well for content-centric websites.
 */

/* You can override the default Infima variables here. */
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

/* For readability concerns, you should choose a lighter palette in dark mode. */
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

/* Custom styles */
.hero {
  background: linear-gradient(135deg, var(--ifm-color-primary) 0%, var(--ifm-color-primary-dark) 100%);
}

.markdown h1:first-child {
  font-size: 2.5rem;
}

.markdown > h2 {
  font-size: 1.8rem;
  margin-top: 2rem;
}

.markdown > h3 {
  font-size: 1.4rem;
  margin-top: 1.5rem;
}

code {
  border-radius: 3px;
  padding: 0.2rem 0.4rem;
}

.theme-doc-markdown {
  margin-top: 2rem !important;
}
`;

		// Create src/css directory
		const cssDir = join(outputPath, "src", "css");
		mkdirSync(cssDir, { recursive: true });

		const cssPath = join(cssDir, "custom.css");
		writeFileSync(cssPath, cssContent);
	}

	/**
	 * Generate static assets placeholders
	 */
	private generateStaticAssets(outputPath: string): void {
		// Create static/img directory
		const imgDir = join(outputPath, "static", "img");
		mkdirSync(imgDir, { recursive: true });

		// Create .gitkeep file
		const gitkeepContent = `# Static Assets

Place your static files here:
- logo.svg - Site logo
- favicon.ico - Browser favicon
- Other images and assets

These files will be copied to the build output and served from the root path.
`;

		writeFileSync(join(imgDir, ".gitkeep"), gitkeepContent);

		// Create a simple SVG logo placeholder
		const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <rect width="200" height="40" fill="#2e8555" rx="4"/>
  <text x="100" y="25" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
    ${this.options.title}
  </text>
</svg>`;

		writeFileSync(join(imgDir, "logo.svg"), logoSvg);
	}
}
