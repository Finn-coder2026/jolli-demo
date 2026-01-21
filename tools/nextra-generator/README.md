# Nextra Generator

A portable TypeScript library and CLI for generating [Nextra](https://nextra.site/) documentation sites with support for both **Page Router (Nextra 3.x)** and **App Router (Nextra 4.x)**.

## Features

- **Dual Router Support** - Generate sites for Nextra 3.x (Page Router) or Nextra 4.x (App Router)
- **CLI Tool** - Quick site generation from the command line
- **Programmatic API** - Full TypeScript library for integration into build tools
- **Input File Processing** - Import existing markdown, MDX, and JSON files
- **OpenAPI Integration** - Automatic interactive API documentation from OpenAPI specs
- **Theme Customization** - Configure logo, footer, and navigation
- **Directory Scanning** - Recursively process entire documentation directories

## Installation

```bash
npm install nextra-generator
```

Or install globally for CLI usage:

```bash
npm install -g nextra-generator
```

### Alternative Ways to Run CLI (Without Global Install)

If you prefer not to install globally, you can run the CLI using these alternatives:

**Using npx** (if published to npm):
```bash
npx nextra-generator -o ./my-docs
```

**Direct Node execution** (from the nextra-generator directory):
```bash
npm run build
node dist/Cli.js -o ./my-docs
```

**Add to your project's package.json scripts**:
```json
{
  "scripts": {
    "generate-docs": "node ./node_modules/nextra-generator/dist/Cli.js"
  }
}
```
Then run:
```bash
npm run generate-docs -- -o ./my-docs
```

**Using npx with local path**:
```bash
npx ./path/to/nextra-generator -o ./my-docs
```

## Quick Start

### CLI Usage

Generate a basic documentation site:

```bash
nextra-generator -o ./my-docs
```

Generate with Page Router (Nextra 3.x - default):

```bash
nextra-generator -o ./my-docs -r page
```

Generate with App Router (Nextra 4.x):

```bash
nextra-generator -o ./my-docs -r app
```

Generate from existing markdown files:

```bash
nextra-generator -o ./my-docs -i ./docs
```

Generate with OpenAPI specification:

```bash
nextra-generator -o ./my-docs -a ./openapi.json
```

After generation:

```bash
cd my-docs
npm install
npm run dev
```

### Library Usage

```typescript
import { NextraGenerator } from 'nextra-generator';

// Create a new generator instance
const generator = new NextraGenerator({
  router: 'page',  // 'page' for Nextra 3.x, 'app' for Nextra 4.x
  outputDir: './my-docs',
  theme: {
    logo: 'My Documentation',
    footer: '© 2024 My Company',
  },
});

// Initialize the site with base templates
await generator.init();

// Add custom pages
await generator.addPage('guide', '# Guide\n\nGuide content...', 'Guide');

// Add files from a directory
await generator.addFromDirectory('./docs');
```

## CLI Reference

```
nextra-generator [options]

Options:
  --output, -o     Output directory (required)
  --router, -r     Router type: 'app' or 'page' (default: 'page')
  --logo, -l       Site logo text (default: 'My Documentation')
  --footer, -f     Footer text (default: 'Documentation Site')
  --input, -i      Input directory to scan for files (.md, .mdx, .json)
  --openapi, -a    Path to OpenAPI spec file (JSON format)
  --skip-defaults  Skip generating default sample pages
  --help, -h       Show help message
  --version, -v    Show version number
```

### Examples

```bash
# Basic Page Router site
nextra-generator -o ./docs

# App Router site with custom branding
nextra-generator -o ./docs -r app -l "API Docs" -f "© 2024 ACME Inc"

# Import existing documentation
nextra-generator -o ./docs -i ./existing-docs

# Include OpenAPI documentation
nextra-generator -o ./docs -a ./api/openapi.json

# Minimal site (no sample pages)
nextra-generator -o ./docs --skip-defaults

# Full example with all options
nextra-generator \
  -o ./my-docs \
  -r app \
  -l "My API Documentation" \
  -f "MIT License" \
  -i ./markdown-docs \
  -a ./api/spec.json
```

## Library API

### NextraGenerator Class

The main class for generating Nextra sites.

```typescript
import { NextraGenerator } from 'nextra-generator';

const generator = new NextraGenerator(config);
```

#### Constructor Options

```typescript
interface GeneratorConfig {
  // Router type: 'page' (Nextra 3.x) or 'app' (Nextra 4.x)
  router: 'app' | 'page';

  // Output directory for generated site
  outputDir: string;

  // Theme configuration
  theme?: {
    logo: string;
    footer?: string;
    projectLink?: string;
    docsRepositoryBase?: string;
  };

  // Initial pages to create
  pages?: Array<{
    path: string;
    title: string;
    content: string;
  }>;

  // OpenAPI specifications
  openApi?: Array<{
    specPath: string;
    outputPath?: string;
    title?: string;
  }>;

  // Input files to import
  inputFiles?: Array<{
    sourcePath: string;
    targetPath?: string;
    title?: string;
  }>;

  // Skip generating default sample pages
  skipDefaultPages?: boolean;
}
```

#### Methods

##### `init(): Promise<GeneratorResult>`

Initialize the site with base templates.

```typescript
const result = await generator.init();

if (result.success) {
  console.log(`Created ${result.filesCreated.length} files`);
}
```

##### `addPage(path, content, title?): Promise<void>`

Add a new page to the site.

```typescript
await generator.addPage(
  'guides/quickstart',
  '# Quick Start\n\nGet started in 5 minutes...',
  'Quick Start'
);
```

##### `addFile(sourcePath, targetPath?, title?): Promise<void>`

Add a single file by path.

```typescript
await generator.addFile('./docs/readme.md', 'introduction');
```

##### `addInputFiles(files): Promise<{added, errors}>`

Add multiple input files.

```typescript
const result = await generator.addInputFiles([
  { sourcePath: './docs/guide.mdx' },
  { sourcePath: './docs/api.md', targetPath: 'reference/api' },
]);
```

##### `addFromDirectory(dirPath): Promise<{added, errors}>`

Scan and add all supported files from a directory.

```typescript
const result = await generator.addFromDirectory('./docs');
console.log(`Added ${result.added.length} files`);
```

##### `addOpenApiSpec(specPath, outputPath?): Promise<void>`

Add an OpenAPI specification.

```typescript
await generator.addOpenApiSpec('./openapi.json', 'api-reference');
```

##### `updateTheme(theme): void`

Update theme configuration.

```typescript
generator.updateTheme({
  logo: 'Updated Logo',
  footer: 'New Footer',
});
```

### Standalone Functions

For more control, use the standalone generator functions:

```typescript
import { generateSite, generateAppRouterSite, generatePageRouterSite } from 'nextra-generator';

// Auto-select based on config
const result = await generateSite({
  router: 'page',
  outputDir: './docs',
  theme: { logo: 'My Docs' },
});

// Or use specific generators
const appResult = await generateAppRouterSite(config);
const pageResult = await generatePageRouterSite(config);
```

### Utility Functions

```typescript
import {
  // File utilities
  ensureDir,
  writeFile,
  readFile,
  exists,
  copyFile,

  // Input file processing
  getFileType,
  extractTitleFromContent,
  extractTitleFromFilename,
  processInputFiles,
  scanDirectory,
  buildNavigationMeta,

  // OpenAPI utilities
  loadOpenApiSpec,
  extractApiInfo,
} from 'nextra-generator';
```

## Generated Site Structure

### App Router (Nextra 4.x)

```
my-docs/
├── app/
│   ├── layout.tsx
│   ├── icon.tsx
│   └── [[...mdxPath]]/
│       └── page.tsx
├── content/
│   ├── _meta.ts
│   ├── index.mdx
│   └── ...
├── components/
│   └── ApiReference.tsx
├── public/
│   ├── api-docs.html
│   └── openapi.json
├── mdx-components.tsx
├── next.config.mjs
├── tsconfig.json
└── package.json
```

### Page Router (Nextra 3.x)

```
my-docs/
├── pages/
│   ├── _meta.js          # Navigation config (JS, not JSON)
│   ├── index.mdx
│   └── ...
├── components/
│   └── ApiReference.jsx
├── public/
│   ├── favicon.svg
│   ├── api-docs.html
│   └── openapi.json
├── theme.config.jsx
├── next.config.mjs
├── tsconfig.json
└── package.json
```

## Router Comparison

| Feature | Page Router (3.x) | App Router (4.x) |
|---------|------------------|------------------|
| Next.js Version | 14.x | 15.x |
| React Version | 18.x | 19.x |
| Content Folder | `pages/` | `content/` |
| Navigation Meta | `_meta.js` | `_meta.ts` |
| Theme Config | `theme.config.jsx` | `app/layout.tsx` |
| Stability | Stable | Experimental |

### Key Nextra 3.x Changes (from 2.x)

- **ESM-only**: Nextra 3.x is built as an ESM-only package
- **`_meta.js` instead of `_meta.json`**: Navigation files use JavaScript with `export default` syntax
- **Node.js 18+**: Minimum supported Node.js version
- **Improved syntax highlighting**: Uses shikiji instead of shiki

## Supported File Types

- **`.mdx`** - MDX files (Markdown + JSX)
- **`.md`** - Standard Markdown files
- **`.json`** - JSON files (displayed as code blocks, or OpenAPI specs for interactive docs)

## OpenAPI Support

The generator can process OpenAPI 3.x and Swagger 2.x specifications:

```bash
nextra-generator -o ./docs -a ./openapi.json
```

This creates:
- An overview page with endpoint listing
- An interactive API documentation page using [Scalar](https://github.com/scalar/scalar)

## Examples

The `examples/` directory contains sample files you can use to test the generator:

```bash
# Generate site from example files
nextra-generator -o ./test-docs -i ./examples/docs -a ./examples/openapi.json
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Full build pipeline
npm run all
```

## License

MIT
