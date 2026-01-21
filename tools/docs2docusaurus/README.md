# docs2docusaurus

A CLI tool that generates Docusaurus configuration from existing documentation folders.

## Overview

`docs2docusaurus` scans your existing documentation folder structure and automatically generates all the necessary Docusaurus configuration files including:

- `sidebars.js` - Navigation structure based on your docs folder hierarchy
- `docusaurus.config.js` - Site configuration
- `package.json` - Dependencies and scripts
- `src/css/custom.css` - Custom styling
- Static assets placeholders

## Installation

```bash
npm install -g docs2docusaurus
```

Or run directly with npx:

```bash
npx docs2docusaurus --docs ./my-docs --output ./my-site
```

## Usage

```bash
docs2docusaurus [options]
```

### Options

- `-d, --docs <path>` - Path to the docs folder (default: `./docs`)
- `-o, --output <path>` - Output directory for Docusaurus config (default: `.`)
- `-t, --title <title>` - Site title (default: `API Documentation`)
- `-u, --url <url>` - Site URL (default: `https://example.com`)
- `-b, --base-url <path>` - Base URL path (default: `/`)
- `--org <name>` - Organization name (default: `your-org`)
- `--project <name>` - Project name (default: `your-project`)
- `--openapi` - Generate OpenAPI spec from docs metadata (experimental)

### Example

```bash
# Generate Docusaurus config for existing docs
docs2docusaurus \
  --docs ./api-docs/docs \
  --output ./api-docs \
  --title "My API Documentation" \
  --url "https://docs.mycompany.com" \
  --org "mycompany" \
  --project "api-docs"
```

## Expected Docs Structure

The tool expects a docs folder with markdown files organized in a hierarchical structure:

```
docs/
├── intro.md           # Optional introduction page
├── getting-started.md # Top-level doc
├── api/              # Category folder
│   ├── overview.md   # Category overview (optional)
│   └── endpoints/    # Nested category
│       ├── users.md
│       └── posts.md
└── guides/          # Another category
    └── authentication.md
```

### Naming Conventions

- Files named `intro.md` or `index.md` at the root are treated as the homepage
- Files named `overview.md` or `index.md` in subdirectories are shown first in that category
- Directory names are automatically humanized (e.g., `user-api` becomes "User API")
- Hidden files and directories (starting with `.`) are ignored

## Generated Structure

After running the tool, you'll have:

```
output-dir/
├── docusaurus.config.js  # Main configuration
├── sidebars.js          # Sidebar navigation
├── package.json         # Dependencies
├── src/
│   └── css/
│       └── custom.css   # Custom styles
└── static/
    └── img/
        ├── logo.svg     # Placeholder logo
        └── .gitkeep     # Git placeholder
```

## Workflow Example

1. **Generate docs from code** (using another tool):
   ```bash
   code2docs --input ./src --output ./api-docs/docs
   ```

2. **Generate Docusaurus config**:
   ```bash
   docs2docusaurus --docs ./api-docs/docs --output ./api-docs
   ```

3. **Install and run Docusaurus**:
   ```bash
   cd api-docs
   npm install
   npm start
   ```

## Features

- **Automatic sidebar generation** - Creates navigation from your folder structure
- **Smart categorization** - Converts folders into collapsible categories
- **Flexible configuration** - Customize site title, URL, and other settings
- **Zero config** - Works out of the box with sensible defaults
- **Docusaurus 3.0 ready** - Generates config compatible with latest Docusaurus

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- --docs ./test-docs

# Build
npm run build

# Run tests
npm test
```

## License

MIT