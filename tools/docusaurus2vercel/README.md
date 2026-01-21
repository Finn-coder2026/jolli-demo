# docusaurus2vercel

A CLI tool that deploys Docusaurus documentation to Vercel with a single command.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation from Monorepo](#installation-from-monorepo)
  - [Installation from npm](#installation-from-npm)
- [Usage](#usage)
  - [Command Syntax](#command-syntax)
  - [Command-Line Parameters](#command-line-parameters)
  - [Examples](#examples)
- [Getting a Vercel Token](#getting-a-vercel-token)
- [How It Works](#how-it-works)
  - [Architecture Overview](#architecture-overview)
  - [Code Flow](#code-flow)
  - [Component Details](#component-details)
- [Development Guide](#development-guide)
  - [Project Structure](#project-structure)
  - [Building from Source](#building-from-source)
  - [Making Changes](#making-changes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- 🚀 **Instant Deployment** - Deploy Docusaurus sites to Vercel with one command
- 🔐 **Secure API Integration** - Uses Vercel API with token authentication
- 🌐 **Custom Domains** - Support for custom domains and subdomains
- 📦 **Automatic Configuration** - Detects and configures Docusaurus projects automatically
- 🎯 **Zero Configuration** - Works out of the box with sensible defaults
- 📊 **Real-time Progress** - Live deployment status and build logs
- ⚡ **Fast CDN Deployment** - Leverages Vercel's global edge network

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- A Docusaurus project ready for deployment
- Vercel API token ([Get one here](https://vercel.com/account/tokens))

### Installation from Monorepo

If you're working with the source code from the monorepo:

#### Step 1: Clone the Repository

```bash
# Clone the jolli monorepo
git clone https://github.com/jolliai/jolli.git
cd jolli
```

#### Step 2: Navigate to the Tool Directory

```bash
cd tools/docusaurus2vercel
```

#### Step 3: Install Dependencies

```bash
npm install
```

#### Step 4: Build the Tool

```bash
npm run build
```

This compiles the TypeScript source code to JavaScript in the `dist/` folder.

#### Step 5: Run the Tool

You can now run the tool in two ways:

**Option A: Using npm run dev (for development)**
```bash
npm run dev -- /path/to/your/docs --token YOUR_VERCEL_TOKEN
```

**Option B: Link globally (for production use)**
```bash
npm link
# Now you can use it anywhere
docusaurus2vercel /path/to/your/docs --token YOUR_VERCEL_TOKEN
```

### Installation from npm

Once published to npm (future):

```bash
npm install -g docusaurus2vercel
```

---

## Usage

### Command Syntax

```bash
docusaurus2vercel <docs-path> [options]
```

### Command-Line Parameters

#### Required Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `<docs-path>` | Path to the Docusaurus documentation folder | `./my-docs` |

#### Optional Parameters

| Option | Short | Description | Default | Possible Values |
|--------|-------|-------------|---------|-----------------|
| `--token <token>` | `-t` | Vercel API token (or set `VERCEL_TOKEN` env var) | `VERCEL_TOKEN` env | Any valid Vercel token |
| `--subdomain <name>` | `-s` | Custom subdomain | - | Any valid subdomain |
| `--domain <domain>` | `-d` | Custom domain | `vercel.app` | Any valid domain |
| `--project-name <name>` | `-p` | Project name on Vercel | Folder name | Any valid project name |
| `--help` | `-h` | Display help information | - | - |
| `--version` | `-V` | Display version number | - | - |

### Examples

#### Example 1: Basic Deployment

Deploy a Docusaurus site using environment variable for token:

```bash
# Set Vercel token (one time)
export VERCEL_TOKEN=your_vercel_token_here

# Deploy
docusaurus2vercel ./my-docs
```

**Output:**
- Uploads project files to Vercel
- Builds Docusaurus site on Vercel
- Returns deployment URL (e.g., `https://my-docs-abc123.vercel.app`)

**What happens:**
1. Reads all files from `./my-docs` directory
2. Uploads files to Vercel via API
3. Triggers Vercel build process
4. Returns live URL when deployment completes

---

#### Example 2: Deployment with Inline Token

```bash
docusaurus2vercel ./api-documentation --token YOUR_VERCEL_TOKEN
```

**Output:**
- Deploys to Vercel using provided token
- Returns deployment URL

**Parameters explained:**
- `./api-documentation` - Docusaurus project directory
- `--token YOUR_VERCEL_TOKEN` - Vercel API token (alternative to env var)

---

#### Example 3: Custom Project Name

```bash
docusaurus2vercel ./docs -p my-api-docs
```

**Output:**
- Deploys with custom project name `my-api-docs`
- URL: `https://my-api-docs.vercel.app` (or `https://my-api-docs-xxx.vercel.app`)

**Parameters explained:**
- `./docs` - Documentation folder
- `-p my-api-docs` - Sets project name on Vercel

---

#### Example 4: Custom Subdomain and Domain

```bash
docusaurus2vercel ./docs \
  --token YOUR_TOKEN \
  --subdomain api-docs \
  --domain mycompany.com \
  --project-name company-api-docs
```

**Output:**
- Deploys to Vercel
- Primary URL: `https://company-api-docs-xxx.vercel.app`
- Custom domain (if configured): `https://api-docs.mycompany.com`

**Note:** Custom domains require DNS configuration in Vercel dashboard.

**Parameters explained:**
- `./docs` - Documentation folder
- `--token YOUR_TOKEN` - Vercel API token
- `--subdomain api-docs` - Subdomain prefix
- `--domain mycompany.com` - Base domain
- `--project-name company-api-docs` - Project identifier

---

#### Example 5: Real-World Workflow

Complete workflow from monorepo:

```bash
# 1. Navigate to the tool
cd ~/projects/jolli/tools/docusaurus2vercel

# 2. Set environment variable (one time)
export VERCEL_TOKEN=vercel_xxxxxxxxxxxxx

# 3. Deploy your docs
npm run dev -- ~/projects/my-api/docs -p my-api-documentation
```

**Explanation:**
- Runs tool in development mode (no build needed)
- Deploys docs from `~/projects/my-api/docs`
- Creates project named `my-api-documentation` on Vercel

---

## Getting a Vercel Token

### Step-by-Step Guide

1. **Visit Vercel Tokens Page**
   - Go to [https://vercel.com/account/tokens](https://vercel.com/account/tokens)
   - Log in to your Vercel account

2. **Create a New Token**
   - Click "Create Token" button
   - Give it a descriptive name (e.g., "docusaurus-deployment")
   - Select appropriate scope (usually "Full Account")

3. **Copy the Token**
   - Copy the generated token immediately (it won't be shown again)
   - Store it securely

4. **Use the Token**

   **Option A: Environment Variable (Recommended)**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   export VERCEL_TOKEN=your_token_here
   ```

   **Option B: Pass as Command-Line Argument**
   ```bash
   docusaurus2vercel ./docs --token your_token_here
   ```

### Security Best Practices

- ✅ Never commit tokens to git repositories
- ✅ Use environment variables for tokens
- ✅ Rotate tokens periodically
- ✅ Use token scopes (if available)
- ❌ Never share tokens publicly
- ❌ Don't hardcode tokens in scripts

---

## How It Works

### Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                   docusaurus2vercel                       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   File       │───▶│   Vercel     │───▶│  Deployed  │ │
│  │   Reader     │    │   API        │    │    Site    │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│         │                    │                    │      │
│         ▼                    ▼                    ▼      │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │  Scan Files  │    │   Upload &   │    │  Live URL  │ │
│  │   (docs/)    │    │    Build     │    │  (Vercel)  │ │
│  └──────────────┘    └──────────────┘    └────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Code Flow

Here's how the tool works from a new engineer's perspective:

#### Phase 1: Entry Point (index.tsx)

**File:** `src/index.tsx`

```typescript
// 1. User runs: docusaurus2vercel ./docs --token TOKEN

// 2. Commander.js parses command-line arguments
program
  .argument('<docs-path>', 'Path to documentation folder')
  .option('-t, --token <token>', 'Vercel API token')
  .option('-p, --project-name <name>', 'Project name')
  .action((docsPath, options) => {
    // 3. Render React component with Ink (terminal UI)
    render(<Docusaurus2Vercel docsPath={docsPath} options={options} />);
  });
```

**What happens:**
1. Command-line arguments are parsed by Commander.js
2. Options are validated and defaults are applied
3. React component is rendered in terminal using Ink library
4. Control passes to the Docusaurus2Vercel component

---

#### Phase 2: Initialization and Validation

**File:** `src/index.tsx` (Docusaurus2Vercel component)

```typescript
// 4. Component initializes
useEffect(() => {
  const runDeployment = async () => {
    // 5. Get Vercel token from options or environment
    const token = options.token || process.env.VERCEL_TOKEN;

    // 6. Validate token exists
    if (!token) {
      setError('Vercel token not found...');
      setStage('error');
      return;
    }

    // 7. Initialize Vercel deployer
    const deployer = new VercelDeployer(token);

    // 8. Set up event listeners for progress updates
    deployer.on('phase', (phase) => setStage(phase));
    deployer.on('deploy-log', (log) => setBuildLog(log));

    // 9. Start deployment
    const result = await deployer.deploy({
      buildPath: path.resolve(docsPath),
      projectName: options.projectName || path.basename(docsPath),
      subdomain: options.subdomain || '',
      domain: options.domain || 'vercel.app',
      token
    });
  };

  runDeployment();
}, [docsPath, options]);
```

**What happens:**
1. Token is retrieved from options or environment variable
2. Token validation occurs (exit early if missing)
3. VercelDeployer instance is created
4. Event listeners are attached for UI updates
5. Deployment process begins

---

#### Phase 3: File Collection and Upload

**File:** `src/core/deployment/vercel-deployer.ts`

**Component:** `VercelDeployer.deploy()`

```typescript
// 10. Main deployment method
async deploy(options: DeploymentOptions): Promise<DeploymentResult> {
  try {
    this.emit('phase', 'uploading');

    // 11. Deploy using Vercel API
    const { url, id } = await this.deployWithAPI(options);

    this.emit('phase', 'complete');

    return {
      url: url,
      deploymentId: id,
      status: 'ready'
    };
  } catch (error) {
    return {
      url: '',
      deploymentId: '',
      status: 'error',
      error: error.message
    };
  }
}
```

**Step-by-step:**
1. Emits 'uploading' phase to update UI
2. Calls `deployWithAPI()` to handle Vercel API interaction
3. Emits 'complete' phase when done
4. Returns deployment result with URL

---

#### Phase 4: Vercel API Integration

**File:** `src/core/deployment/vercel-deployer.ts`

**Component:** `VercelDeployer.deployWithAPI()`

```typescript
// 12. Deploy using Vercel API
private async deployWithAPI(options: DeploymentOptions) {
  this.emit('deploy-log', 'Reading project files...');

  // 13. Read all files from project directory
  const files = await this.getFilesRecursively(options.buildPath);
  // Excludes: node_modules, build, .git, .vercel, dist, .docusaurus

  this.emit('deploy-log', `Uploading ${files.length} files to Vercel...`);

  // 14. Create deployment via Vercel API
  const response = await axios.post(
    `${this.apiUrl}/v13/deployments`,
    {
      name: options.projectName,
      files: files.map(f => ({
        file: f.path,
        data: f.content.toString('utf-8')
      })),
      projectSettings: {
        framework: 'docusaurus-2',
        buildCommand: 'npm run build',
        installCommand: 'npm install',
        outputDirectory: 'build'
      },
      target: 'production'
    },
    {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // 15. Return deployment URL
  const deploymentUrl = `https://${response.data.url}`;
  const deploymentId = response.data.id;

  this.emit('deploy-log', `Deployed to: ${deploymentUrl}`);

  return { url: deploymentUrl, id: deploymentId };
}
```

**What happens:**
1. **File Discovery** - Recursively scans the documentation directory
2. **File Filtering** - Excludes build artifacts and dependencies
3. **File Reading** - Reads content of all files as buffers
4. **API Request** - POSTs to Vercel's deployment API with:
   - Project configuration
   - All file contents
   - Build settings for Docusaurus
5. **Response Handling** - Extracts deployment URL and ID
6. **Event Emission** - Updates UI with progress logs

**File Collection Details:**
```typescript
private async getFilesRecursively(dir: string): Promise<File[]> {
  const files = [];
  const excludeDirs = ['node_modules', 'build', '.git', '.vercel', 'dist', '.docusaurus'];

  // Recursively scan directory
  for (const entry of await fs.readdir(dir)) {
    if (excludeDirs.includes(entry.name)) continue;

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      files.push(...await this.getFilesRecursively(fullPath));
    } else {
      // Read file content
      const content = await fs.readFile(fullPath);
      files.push({
        path: relativePath,
        content: content
      });
    }
  }

  return files;
}
```

---

### Component Details

#### 1. Vercel Deployer (`src/core/deployment/vercel-deployer.ts`)

**Purpose:** Handle Vercel API interactions and deployment orchestration

**Key Methods:**

- `deploy(options)` - Main entry point for deployment
  - Orchestrates the entire deployment process
  - Handles error scenarios
  - Returns deployment result

- `deployWithAPI(options)` - Vercel API integration
  - Reads project files
  - Uploads to Vercel API
  - Configures Docusaurus build settings
  - Returns deployment URL

- `getFilesRecursively(dir)` - File collection
  - Scans directory tree
  - Excludes build artifacts
  - Returns file list with contents

- `checkDeploymentStatus(deploymentId)` - Status checking
  - Polls Vercel API for deployment status
  - Returns current state (READY, BUILDING, ERROR, etc.)

**Events Emitted:**
- `phase` - Deployment phase changes (uploading, deploying, complete)
- `deploy-log` - Log messages for UI display
- `deploy-start` - Deployment initiated
- `deploy-complete` - Deployment finished successfully
- `error` - Error occurred during deployment

**Dependencies:**
- `axios` - HTTP client for Vercel API
- `events` - EventEmitter for progress updates
- `fs/promises` - Async file system operations

---

#### 2. UI Component (index.tsx)

**Purpose:** Terminal-based user interface using React and Ink

**States:**
- `init` - Initialization
- `uploading` - Uploading files to Vercel
- `deploying` - Vercel is building and deploying
- `complete` - Deployment successful
- `error` - Deployment failed

**Visual Feedback:**
- Spinner animations during active phases
- Build log display (last 3 lines)
- Deployment URL on success
- Error messages with troubleshooting tips

**React Hooks Used:**
- `useState` - Manage deployment state, logs, errors
- `useEffect` - Trigger deployment on mount

---

## Development Guide

### Project Structure

```
src/
├── core/                      # Core business logic
│   └── deployment/
│       └── vercel-deployer.ts # Vercel API integration
├── components/                # UI components for terminal
│   └── SimpleProgressBar.tsx  # Progress bar component
├── types/                     # TypeScript type definitions
│   ├── deployment.ts          # Deployment-related types
│   └── index.ts               # Type exports
└── index.tsx                  # CLI entry point
```

### Building from Source

```bash
# 1. Navigate to the project
cd tools/docusaurus2vercel

# 2. Install dependencies
npm install

# 3. Build TypeScript to JavaScript
npm run build

# 4. Test the build
node dist/index.js --help
```

### Making Changes

#### Modifying Deployment Configuration

1. **Edit:** `src/core/deployment/vercel-deployer.ts`
2. **Find:** `deployWithAPI()` method
3. **Modify:** `projectSettings` object
4. **Example:** Change build command:
   ```typescript
   projectSettings: {
     framework: 'docusaurus-2',
     buildCommand: 'npm run custom-build', // Changed
     installCommand: 'npm install',
     outputDirectory: 'build'
   }
   ```
5. **Rebuild:** `npm run build`

#### Adding Custom Domain Logic

1. **Edit:** `src/core/deployment/vercel-deployer.ts`
2. **Add method:** `addDomain(deploymentId, customDomain)`
3. **Call after deployment:** In `deploy()` method
4. **Rebuild:** `npm run build`

#### Customizing UI Messages

1. **Edit:** `src/index.tsx`
2. **Modify:** Text components in the render method
3. **Rebuild:** `npm run build`

---

## Troubleshooting

### Problem: "Vercel token not found"

**Cause:** No token provided via command-line or environment variable

**Solutions:**
1. Set environment variable:
   ```bash
   export VERCEL_TOKEN=your_token_here
   ```

2. Pass token directly:
   ```bash
   docusaurus2vercel ./docs --token your_token_here
   ```

3. Verify token is valid:
   - Visit [Vercel Tokens](https://vercel.com/account/tokens)
   - Check token hasn't expired

---

### Problem: "Deployment failed"

**Cause:** Various issues during deployment

**Solutions:**

**Check build logs:**
- Look at error messages in output
- Common issues:
  - Missing `package.json` in docs folder
  - Invalid Docusaurus configuration
  - Missing dependencies

**Verify Docusaurus project:**
```bash
cd /path/to/docs
npm install
npm run build  # Should succeed locally
```

**Check file permissions:**
```bash
ls -la /path/to/docs
# Ensure files are readable
```

---

### Problem: Build errors during compilation

**Cause:** TypeScript compilation issues

**Solution:**
```bash
# Clean and reinstall
cd tools/docusaurus2vercel
rm -rf dist node_modules package-lock.json
npm install
npm run build
```

---

### Problem: Custom domain not working

**Cause:** DNS not configured in Vercel

**Solution:**
1. The tool only attempts to set custom domain via API
2. You must configure DNS in Vercel dashboard:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Select your project
   - Go to Settings → Domains
   - Add and verify your custom domain

**Note:** Custom domains require:
- Domain ownership verification
- DNS configuration (CNAME or A records)
- May take time to propagate

---

## License

MIT

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to test
5. Submit a pull request

For major changes, please open an issue first to discuss the proposed changes.

---

## Related Tools

- **[code2docusaurus](../code2docusaurus/README.md)** - Generate Docusaurus documentation from code
- **Complete workflow:** Use `code2docusaurus` to generate docs, then `docusaurus2vercel` to deploy them

## Support

- **Issues:** [GitHub Issues](https://github.com/jolliai/jolli/issues)
- **Documentation:** [Quick Start Guide](../QUICK_START.md)
- **Migration Guide:** [Migration Summary](../MIGRATION_SUMMARY.md)
