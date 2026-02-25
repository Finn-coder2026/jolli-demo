---
jrn: MKKIR4UNYKAA96C4
---
# Jolli Developer Guide

Welcome to the Jolli development environment! This guide will help you get set up to work on Jolli locally.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [AWS Parameter Store Configuration (Optional)](#aws-parameter-store-configuration-optional)
- [PostgreSQL Database Setup](#postgresql-database-setup)
- [LLM Provider Setup](#llm-provider-setup)
- [E2B Sandbox Configuration](#e2b-sandbox-configuration)
- [OAuth Authentication Setup](#oauth-authentication-setup)
- [GitHub Webhook Setup with smee.io](#github-webhook-setup-with-smeeio)
- [GitHub App Setup](#github-app-setup)
- [Sites Feature](#sites-feature)
  - [GitHub Token Setup](#github-token-setup)
  - [Vercel Setup](#vercel-setup)
  - [Environment-Specific Deployments](#environment-specific-deployments)
  - [Custom Domains](#custom-domains)
- [Article Image Upload Setup](#article-image-upload-setup)
- [Asset Cleanup (Orphaned Image Detection)](#asset-cleanup-orphaned-image-detection)
- [Unified Sidebar Navigation](#unified-sidebar-navigation)
- [Running the Application](#running-the-application)
- [Multi-Tenant Local Development](#multi-tenant-local-development)
  - [Writing Multi-Tenant Safe Raw Queries](#writing-multi-tenant-safe-raw-queries)
- [Job Worker Service (Multi-Tenant)](#job-worker-service-multi-tenant)
- [Mercure Hub for Distributed SSE](#mercure-hub-for-distributed-sse)
- [Central User Authentication](#central-user-authentication)
- [Testing](#testing)
- [Common Issues](#common-issues)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** Latest Version or LTS Version
- **npm** Latest Version of LTS Version
- **AWS CLI V2** (for Parameter Store integration)
- **AWS Account** with appropriate permissions
- **GitHub Account** (for linking source repos)
- **PostgreSQL** We are running version 17.6 in AWS, so recomend this version to be consistent with that

## Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jolliai/jolli.git
   cd jolli
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment files:**

   Backend:
   ```bash
   cd backend
   cp .env.dev .env.local
   ```

Executing the command above should create a `backend/.env.local` file with overrides to the `.env` file for your local environment.
Here are some example values you might have in there if your name was "John Doe":
   ```env
   ORIGIN=http://localhost:8034
   AWS_REGION=us-west-2
   PSTORE_ENV=johndoe
   USE_DEVELOPER_TOOLS=true
   ```

## AWS Parameter Store Configuration (Optional)

Jolli uses AWS Systems Manager Parameter Store to manage configuration in deployed environments. You can optionally use it locally for testing.

### 1. Install AWS CLI

Install the AWS CLI if you haven't already:

Mac OS:
```bash
brew install awscli
```

Windows:
```bash
choco install awscli
```

Linux:
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 2. Configure AWS Credentials

**Option A: AWS CLI Configuration (Recommended)**

Configure your credentials:
```bash
aws configure
# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: us-west-2
# - Default output format: json
```

**Option B: Environment Variables**

Set AWS credentials as environment variables:
```bash
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_REGION=us-west-2
```

### 3. Set Up IAM Permissions

Ensure your AWS user/role has the following permission:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:us-west-2:*:parameter/jolli/backend/*"
    }
  ]
}
```

### 4. Create Parameters in AWS Parameter Store

You'll want to add parameters to the AWS Parameter Store for your local environment.
Parameters follow the naming convention: `/jolli/backend/{PSTORE_ENV}/{path}`

The prefix is removed, then the path is automatically converted to an environment variable name
by converting forward slashes into underscores and converting each path element to UPPER_CASE
For example:
- `/jolli/backend/dev/github/apps/info` → `github/apps/info` → `GITHUB_APPS_INFO`
- `/jolli/backend/dev/test/message` → `test/message` → `TEST_MESSAGE`

#### Create GitHub App and store App Info for your local environment
So that you can install github repos in your local jolli environment and **have webhooks delivered** properly,
you are going to need to have your own separate GitHub App defined
* the app specifies a webhook URL and since you are running your app on localhost we use a proxy (smee.io)
to map to your local machine.

**IMPORTANT**: you may not have access to create the GitHub App inside the jolliai org, so you may need to ask someone with this access to create the app for you.

If you do have access to create GitHub Apps under the jolliai org, you are going to want to:

* Add a smee.io URL (see [GitHub Webhook Setup with smee.io](#github-webhook-setup-with-smeeio))
* Make sure you have the `SMEE_API_URL` config set in your `.env.local` file.
* Start the app with the "Dev Tools" tab enabled
  * Uncomment the `USE_DEVELOPER_TOOLS` config in your `.env.local` file:
  ```
  USE_DEVELOPER_TOOLS=true
  ```
  * Use the "Create a GitHub App" form on the Dev Tools screen to create your github app
    * It will redirect you to GitHub to create the app
    * then it should take you back to the "Dev Tools" tab in your local environment and you should see a JSON string in a textarea with info for the github app it just created.
  * Paste the JSON it generates into the appropriate AWS Parameter Store Parameter for your local environment.
    * Either do this through the AWS Console, or run the following aws client command (assumes the user you are
        signed into the aws client as has the permissions to set parameter store parameters):
        ```bash
        aws ssm put-parameter \
          --name "/jolli/backend/dev/github/apps/info" \
          --value '{"app_d":123456,"slug":"your-app","client_id":"Iv23...","client_secret":"...","webhook_secret":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...","name":"Your App","html_url":"https://github.com/apps/your-app"}' \
          --type "SecureString" \
          --region us-west-2
        ```
  * After you have created the GitHub App, you are going to want to make the App Public so it can be installed on other orgs besides the jolliai org:
    * Navigate to jolliai org settings > developer settings > [Github Apps](https://github.com/organizations/jolliai/settings/apps)
    * Open the App you created
    * Click on the "Advanced" tab (on the left)
    * Click on the "Make Public" button.

### 5. Enable Parameter Store in Local Development

Edit `backend/.env.local` and set the `PSTORE_ENV` variable (replace `johndoe` with a unique string for you):
```env
## Always set this to a unique string representing your local environment in the parameter store (ex. johndoe)
PSTORE_ENV=johndoe
```

### 6. Verify Parameter Store Integration

Start the backend and check the logs:
```bash
cd backend
npm run start
```

You should see logging like this (plus more below it):
```
dougs@Dougs-MacBook-Pro backend % npm run start

> jolli-backend@0.0.1 start
> vite


  VITE v7.1.12  ready in 115 ms

  ➜  Local:   http://localhost:7034/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
[2025-11-06 03:34:44] DEBUG: Database - Database module loaded {"module":"Database"}
[2025-11-06 03:34:44] INFO: Main - Jolli v0.0.1 starting up on Node v24.10.0 {"module":"Main"}
[2025-11-06 03:34:44] INFO: Main - Initializing configuration... {"module":"Main"}
[2025-11-06 03:34:44] INFO: Config - Loading from Parameter Store {"module":"Config","pathPrefix":"/jolli/backend/dougs/"}
```

## PostgreSQL Database Setup

Jolli uses PostgreSQL with pgvector extension as its primary database for storing all application data. The backend uses Sequelize ORM to interact with PostgreSQL and automatically creates the necessary tables on first run.

### 1. Create the Docker Compose File

Create a `docker-compose.yml` file in the project root:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    container_name: jolli-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: jolli
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 2. Configure Database Connection

Add the following to your `backend/.env.local`:

```env
# PostgreSQL configuration
SEQUELIZE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=jolli
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
```

### 3. Start the PostgreSQL Container

Make sure Docker Desktop is running, then start the container:

```bash
docker-compose up -d
```

## LLM Provider Setup

Jolli uses LLM providers for AI-powered features like chat, content generation, and article creation. You need to configure at least one provider.

### Supported Providers

| Provider | `LLM_PROVIDER` value | API Key Variable | Default Model |
|----------|---------------------|------------------|---------------|
| OpenAI | `openai` (default) | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` |

### Configuration

Add the following to your `backend/.env.local`:

**Option A: OpenAI (default)**
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**Option B: Anthropic**
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Optional: Override Default Model

You can optionally specify a different model:

```env
LLM_MODEL=gpt-4o
```

### Getting API Keys

- **OpenAI:** Get your API key from https://platform.openai.com/api-keys
- **Anthropic:** Get your API key from https://console.anthropic.com/settings/keys

## E2B Sandbox Configuration

Jolli uses [E2B](https://e2b.dev) cloud sandboxes for certain AI workflow features like automated article generation. The server requires `E2B_API_KEY` and `E2B_TEMPLATE_ID` environment variables to be set, even if you don't plan to use sandbox features.

### Configuration

Add the following to your `backend/.env.local`:

```env
# E2B Sandbox configuration (required for server to start)
E2B_API_KEY=placeholder
E2B_TEMPLATE_ID=placeholder
```

**Note:** With placeholder values, the server will start but sandbox-dependent features (like the JolliAgent automated article generation) will not function. If you need these features, obtain real credentials from https://e2b.dev.

At this point, the server should start, but you won't be able to log in because authentication is not yet configured. Continue to the next section to set up authentication.

## OAuth Authentication Setup

Jolli uses [better-auth](https://www.better-auth.com/) for user authentication with OAuth providers. You need to configure at least one provider (GitHub or Google) to log in.

### GitHub OAuth

1. Go to your GitHub account (or organization) Settings → Developer Settings → [OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name:** `Jolli Local Dev` (or any name)
   - **Homepage URL:** `http://localhost:8034`
   - **Authorization callback URL:** `http://localhost:8034/auth/callback/github`
4. Click "Register application"
5. Copy the **Client ID**
6. Click "Generate a new client secret" and copy the **Client Secret**

Add to your `backend/.env.local`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to APIs & Services → Credentials
4. Click "Create Credentials" → "OAuth client ID"
5. Select "Web application" as the application type
6. Fill in the details:
   - **Name:** `Jolli Local Dev` (or any name)
   - **Authorized JavaScript origins:** `http://localhost:8034`
   - **Authorized redirect URIs:** `http://localhost:8034/api/auth/callback/google`
7. Click "Create"
8. Copy the **Client ID** and **Client Secret**

Add to your `backend/.env.local`:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

**Note:** You only need to configure one OAuth provider to log in. Configure both if you want users to have a choice of login methods.

## GitHub Webhook Setup with smee.io

When developing locally, GitHub webhooks cannot reach `localhost` directly. We use [smee.io](https://smee.io) to forward webhooks to your local development server.

### What is smee.io?

smee.io is a webhook payload delivery service that allows you to receive webhooks on localhost. It acts as a proxy between GitHub and your local development environment.

### Setup Steps

1. **Get a smee.io URL:**

   Visit https://smee.io and click "Start a new channel". You'll get a unique URL like:
   ```
   https://smee.io/abc123def456
   ```

2. **Add smee.io URL to your environment:**

   Edit `backend/.env.local`:
   ```env
   SMEE_API_URL=https://smee.io/abc123def456
   ```

3. **Start the backend server:**

   The backend automatically starts a smee.io client when `SMEE_API_URL` is configured:
   ```bash
   cd backend
   npm run start
   ```

   You should see something like this amongst your log statements:
   ```
   [2025-11-06 03:34:45] INFO: Smee - Forwarding https://smee.io/AfvNCPT3F45VJiN to http://localhost:8034/api/webhooks/github {"module":"Smee"}
   ```

### How It Works

```
GitHub → smee.io → Local Backend
         (proxy)   (localhost:7034)
```

When `SMEE_API_URL` is set:
1. Backend starts a smee.io client that connects to your smee.io channel
2. Client listens for webhook events from smee.io
3. Events are forwarded to your local webhook endpoint
4. Your local code processes the webhook as if it came directly from GitHub

### Alternative: Manual smee-client

If you prefer to run the smee client separately:

```bash
# Install smee-client globally
npm install -g smee-client

# Start the client
smee --url https://smee.io/abc123def456 --target http://localhost:7034/api/webhooks/github
```

Then remove `SMEE_API_URL` from your `.env.local` file.

### Webhook Debugging

**View webhook deliveries:**
- Visit your smee.io URL in a browser
- You'll see a live feed of all webhook events
- Click on any event to see the full payload

**Check backend logs:**
```bash
cd backend
npm run dev
```

Look for webhook-related log entries showing the event type and processing status.

## GitHub App Setup

Jolli uses a GitHub App for repository integration features. You'll need to create a GitHub App and configure it in your environment.

### 1. Start the Backend Server

Make sure your backend server is running:

```bash
cd backend
npm run start
```

### 2. Open Dev Tools

1. Open the Jolli application in your browser (http://localhost:8034)
2. Log in using GitHub or Google OAuth
3. Click on **Dev Tools** at the bottom of the left sidebar menu

### 3. Create a GitHub App

1. In the Dev Tools page, use the "Create a GitHub App" form
2. Click the button to create the app - this will redirect you to GitHub
3. Follow the GitHub prompts to create the app
4. After creation, you'll be redirected back to the Dev Tools page
5. A JSON configuration will be displayed in a textarea

### 4. Configure the Environment Variable

Copy the JSON from the Dev Tools page and add it to your `backend/.env.local`:

```env
GITHUB_APPS_INFO={"app_id":123456,"slug":"your-app-name","client_id":"Iv23...","client_secret":"...","webhook_secret":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...","name":"Your App Name","html_url":"https://github.com/apps/your-app-name"}
```

### 5. Restart the Backend

Restart your backend server to pick up the new configuration:

```bash
# Stop the server (Ctrl+C) and restart
cd backend
npm run start
```

## Sites Feature

The Sites feature allows users to create and manage documentation sites (Docusaurus/Nextra) that are automatically deployed to GitHub and Vercel. This section covers all configuration needed for the Sites feature.

**Related `.env.dev` section:** `### SITES FEATURE ###`

### GitHub Token Setup

#### Local Development Setup (GitHub Personal Access Token)

For local development, you'll need a GitHub Personal Access Token (PAT) with appropriate permissions.

#### 1. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens > Tokens (classic)](https://github.com/settings/tokens/new)
2. Click "Generate new token (classic)"
3. Give it a descriptive name: `jolli-local-dev`
4. Set expiration (recommend 90 days for security)
5. Select the following scopes:
   - **`repo`** (Full control of private repositories) - Required to create and manage repositories. Note: The `repo` scope (not `public_repo`) is required because site repositories are created as **private** by default for security.
   - **`delete_repo`** (Delete repositories) - Required to delete site repositories
   - **`admin:org`** (Full control of orgs and teams) - Only needed if creating repos in an organization
6. Click "Generate token"
7. **IMPORTANT:** Copy the token immediately - you won't be able to see it again!

#### 2. Configure Environment Variables

Add the following to your `backend/.env.local`:

```env
# GitHub Personal Access Token for Sites feature
GITHUB_TOKEN=ghp_your_token_here

# Optional: GitHub Organization where sites will be created
# If not set, defaults to "Jolli-sample-repos"
# For local dev, you can use your personal GitHub username
GITHUB_ORG=your-github-username
```

**IMPORTANT:** The GitHub Personal Access Token must have adequate permissions within the organization or account specified by `GITHUB_ORG`. If using an organization, ensure:
- The token belongs to a user who is a member of the organization
- The user has permission to create repositories in that organization
- The token has the `admin:org` scope enabled (required for organization repository creation)

#### 3. Verify Setup

Start the backend and create a test site:

```bash
cd backend
npm run start
```

Then in the Jolli UI:
1. Navigate to the "Sites" tab
2. Click "Create New Site"
3. Fill in the form and submit
4. Check that a repository is created in your GitHub account/organization

#### Production/Demo Environment Setup

For deployed environments (dev.jolli.ai, demo.jolli.ai), the same `GITHUB_TOKEN` approach is used, but managed through AWS Parameter Store.

##### Setting up GitHub Token in AWS Parameter Store (For Administrators)

1. **Create a GitHub Personal Access Token:**
   - Follow the same steps as local development above
   - Use a dedicated service account (e.g., `jolli-bot`) for production
   - Set expiration to "No expiration" for production tokens (or use a rotation strategy)
   - Required scopes: `repo`, `delete_repo`, `admin:org`

2. **Store in AWS Parameter Store:**
   ```bash
   # Store the GitHub token
   aws ssm put-parameter \
     --name "/jolli/backend/prod/github/token" \
     --value "ghp_your_production_token_here" \
     --type "SecureString" \
     --region us-west-2

   # Store the GitHub organization (optional, defaults to "Jolli-sample-repos")
   aws ssm put-parameter \
     --name "/jolli/backend/prod/github/org" \
     --value "Jolli-sample-repos" \
     --type "String" \
     --region us-west-2
   ```

   The parameters are automatically loaded by the application and converted to environment variables:
   - `/jolli/backend/prod/github/token` → `GITHUB_TOKEN`
   - `/jolli/backend/prod/github/org` → `GITHUB_ORG`

3. **Verify in deployed environment:**
   - Check CloudWatch logs for "GitHub token configuration loaded"
   - Test creating a site through the UI
   - Verify repository is created in the specified GitHub organization

##### Future: GitHub App Authentication (Planned)

GitHub App authentication provides better security and higher rate limits. The infrastructure for this exists (`createOctokitForAppInstallation()` in `OctokitUtil.ts`) but is not yet integrated with the Sites feature.

This is currently only used for the GitHub Integration feature (installing repos). Future work will migrate the Sites feature to use GitHub App authentication for production environments.

#### Troubleshooting

**Issue: "GitHub token does not have permission to delete repositories"**
- **Solution:** Ensure your PAT has the `delete_repo` scope enabled
- Regenerate your token with the correct scopes if needed

**Issue: "Repository already exists"**
- **Solution:** The site name must be unique. Try a different name or delete the existing repository

**Issue: "Resource not accessible by integration" or "Not Found"**
- **Solution:** Verify your token has access to the organization
- If using an organization, ensure the PAT user is a member with appropriate permissions
- Check that your token has `repo` and `admin:org` scopes

**Issue: Rate limit exceeded**
- **Solution:** GitHub has rate limits (5000/hour for authenticated requests with PAT)
- Wait for the rate limit to reset (check response headers for reset time)
- For production, consider using a dedicated service account token
- Monitor rate limit usage in GitHub Settings > Developer Settings > Personal Access Tokens

### Vercel Setup

Jolli deploys documentation sites to Vercel. You'll need a Vercel access token to enable site deployments.

#### 1. Get a Vercel Access Token

1. Go to [Vercel Account Settings > Tokens](https://vercel.com/account/tokens)
2. Click "Create" to create a new token
3. Give it a descriptive name: `jolli-local-dev`
4. Select the scope (Full Account or specific team)
5. Set expiration as desired
6. Click "Create Token"
7. **IMPORTANT:** Copy the token immediately - you won't be able to see it again!

#### 2. Configure Environment Variable

Add the following to your `backend/.env.local`:

```env
VERCEL_TOKEN=your_vercel_token_here
```

With this configured, Jolli can deploy documentation sites to Vercel automatically.

### Environment-Specific Deployments

Jolli supports deploying sites to different environments (local, dev, preview, prod) with automatic isolation. This ensures non-production deployments don't interfere with production resources.

#### How It Works

The `SITE_ENV` configuration controls:
1. **GitHub repo naming** - Adds environment prefix (e.g., `local-acme-docs-42`)
2. **Domain naming** - Adds environment subdomain (e.g., `docs-acme.local.jolli.site`)
3. **GitHub organization** - Non-prod uses `GITHUB_ORG_NONPROD`, prod uses `GITHUB_ORG`

| Environment | SITE_ENV | GitHub Repo | Domain | GitHub Org |
|-------------|----------|-------------|--------|------------|
| Local | `local` | `local-{tenant}-{site}-{id}` | `{site}-{tenant}.local.jolli.site` | GITHUB_ORG_NONPROD |
| Dev | `dev` | `dev-{tenant}-{site}-{id}` | `{site}-{tenant}.dev.jolli.site` | GITHUB_ORG_NONPROD |
| Preview | `preview` | `preview-{tenant}-{site}-{id}` | `{site}-{tenant}.preview.jolli.site` | GITHUB_ORG_NONPROD |
| Prod | `prod` | `{tenant}-{site}-{id}` | `{site}-{tenant}.jolli.site` | GITHUB_ORG |

#### Configuration

Add to your `backend/.env.local`:

```env
# Site deployment environment (local, dev, preview, or prod)
SITE_ENV=local

# GitHub organization for non-prod site deployments (default: Jolli-Sample-Repos)
GITHUB_ORG_NONPROD=Jolli-Sample-Repos
```

For production deployments:

```env
# Production - no prefix, uses GITHUB_ORG
SITE_ENV=prod
```

#### Startup Validation

On startup, Jolli validates that the configured GitHub token has access to the appropriate organization. This prevents cryptic errors during site creation by failing fast with a clear error message if misconfigured.

#### Example

With `SITE_ENV=local` and tenant slug `acme`:
- Creating a site named "docs" with ID 42
- GitHub repo: `local-acme-docs-42` in `Jolli-Sample-Repos`
- Domain: `docs-acme.local.jolli.site`

With `SITE_ENV=prod` and tenant slug `acme`:
- Creating a site named "docs" with ID 42
- GitHub repo: `acme-docs-42` in `Jolli-Sites`
- Domain: `docs-acme.jolli.site`

#### DNS Requirements

For environment subdomains to work, DNS wildcard records must be configured for each environment:

| Environment | DNS Record |
|-------------|------------|
| Local | `*.local.jolli.site` → Vercel |
| Dev | `*.dev.jolli.site` → Vercel |
| Preview | `*.preview.jolli.site` → Vercel |
| Prod | `*.jolli.site` → Vercel |

These should be CNAME records pointing to `cname.vercel-dns.com` (or A records to Vercel's IP).

### Custom Domains

Jolli supports two types of custom domains for Nextra documentation sites:

1. **jolli.site subdomains** - Automatic subdomains like `mysite.jolli.site`
2. **Custom domains** - Your own domains like `docs.example.com`

#### jolli.site Subdomain Feature

This feature allows users to get a free `*.jolli.site` subdomain for their documentation site.

##### Prerequisites

- **Vercel account** with a team that owns the jolli.site domain (production only)
- For local development, you can use a test domain like `local.jolli.site`

##### Configuration

Add the following to your `backend/.env.local`:

```env
# Enable the jolli.site subdomain feature
JOLLI_SITE_ENABLED=true

# Base domain for subdomains
# Production: jolli.site
# Local development: local.jolli.site (or your test domain)
JOLLI_SITE_DOMAIN=local.jolli.site

# Optional: Vercel team ID (required for team accounts)
# Get this from: vercel.com/teams/{team-slug}/settings
# VERCEL_TEAM_ID=team_xxxxx
```

##### What to Expect

When enabled:
- Site creation UI shows option to request a `*.jolli.site` subdomain
- Subdomain is automatically provisioned on Vercel when site is created
- DNS is handled automatically by Vercel

#### Custom Domain Feature

Users can attach their own custom domains (e.g., `docs.example.com`) to their documentation sites.

##### Prerequisites

- **Vercel token** configured (see [Vercel Setup](#vercel-setup))
- The custom domain must be owned by the user
- DNS access to create CNAME or A records

##### How It Works

1. User adds a custom domain in the Site settings UI
2. Jolli adds the domain to the Vercel project
3. Vercel provides DNS configuration instructions:
   - **Subdomains** (e.g., `docs.example.com`): CNAME to `cname.vercel-dns.com`
   - **Apex domains** (e.g., `example.com`): A record to `76.76.21.21`
4. User configures DNS at their domain registrar
5. Jolli verifies the DNS configuration
6. Once verified, the site is accessible at the custom domain

##### DNS Configuration Examples

**For subdomains (recommended):**
```
Type: CNAME
Name: docs
Value: cname.vercel-dns.com
```

**For apex domains:**
```
Type: A
Name: @
Value: 76.76.21.21
```

##### What to Expect

- Domain status shows "pending" until DNS is configured
- Verification checks DNS records for correct configuration
- SSL certificates are automatically provisioned by Vercel
- Domains can be removed at any time from the Site settings

#### Domain Troubleshooting

**Issue: Domain verification stuck on "pending"**
- DNS propagation can take up to 48 hours (usually much faster)
- Use `dig` or `nslookup` to verify DNS is configured correctly
- Ensure no conflicting DNS records exist

**Issue: SSL certificate not issued**
- Vercel handles SSL automatically after DNS verification
- Check that the domain correctly points to Vercel
- Wait a few minutes for certificate provisioning

## Article Image Upload Setup

The Article editor supports uploading images (PNG, JPEG, GIF, WebP) which are stored in S3 and can be embedded in articles. Images are bundled into Nextra sites during site generation.

### Prerequisites

- **AWS Account** with S3 access
- **AWS CLI** configured with credentials that can access S3

### 1. Create the S3 Bucket

Images are stored in S3 buckets named `jolli-images-{env}` where `{env}` is your environment suffix.

**For local development:**
```bash
# Create the bucket (replace us-west-2 with your region if different)
aws s3 mb s3://jolli-images-local --region us-west-2

# Enable server-side encryption
aws s3api put-bucket-encryption --bucket jolli-images-local \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block public access (important for security)
aws s3api put-public-access-block --bucket jolli-images-local \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 2. Configure IAM Permissions

Your AWS user/role needs the following S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadObject",
        "s3:HeadBucket"
      ],
      "Resource": [
        "arn:aws:s3:::jolli-images-*",
        "arn:aws:s3:::jolli-images-*/*"
      ]
    }
  ]
}
```

### 3. Configure Environment Variables

Add the following to your `backend/.env.local`:

```env
# Image S3 environment suffix (bucket: jolli-images-local)
IMAGE_S3_ENV=local

# Optional: Override the S3 region (defaults to AWS_REGION)
# IMAGE_S3_REGION=us-west-2

# Optional: Signed URL expiry in seconds (default: 900 = 15 minutes)
# IMAGE_SIGNED_URL_EXPIRY_SECONDS=900

# Optional: Max file size in bytes (default: 10485760 = 10MB)
# IMAGE_MAX_SIZE_BYTES=10485760
```

### 4. What to Expect

Once configured:
- In the Article editor, you'll see an image upload button in the toolbar
- Supported formats: PNG, JPEG, GIF, WebP (max 10MB by default)
- Images are uploaded to S3 with server-side encryption
- Images are served via signed URLs (secure, time-limited access)
- When generating Nextra sites, images are automatically bundled into the site

### Production Setup

For deployed environments, store image configuration in AWS Parameter Store:

```bash
# Store the environment suffix
aws ssm put-parameter \
  --name "/jolli/backend/prod/image/s3/env" \
  --value "prod" \
  --type "String" \
  --region us-west-2
```

The parameter is automatically loaded and converted to `IMAGE_S3_ENV`.

## Asset Cleanup (Orphaned Image Detection)

Jolli includes scheduled jobs that automatically detect and clean up orphaned images - images that have been uploaded but are no longer referenced in any article or draft.

### How It Works

Two jobs run daily:

1. **Detect Orphaned Images** (3 AM): Scans all published articles and drafts for image references, then:
   - Marks unreferenced images as "orphaned"
   - Restores previously orphaned images that are now referenced again
   - Protects recently uploaded images (within the buffer period)

2. **Cleanup Orphaned Images** (4 AM): Permanently deletes images that have been orphaned beyond the grace period:
   - Deletes from S3 first
   - Then soft-deletes the database record

### Configuration

Add the following to your `backend/.env.local` to customize the cleanup behavior:

```env
# Number of days to protect recently uploaded images (default: 7)
# Images uploaded within this window won't be orphaned even if not yet referenced
ASSET_CLEANUP_RECENT_UPLOAD_BUFFER_DAYS=7

# Number of days before orphaned images are permanently deleted (default: 30)
# This grace period allows recovery if an image is accidentally removed
ASSET_CLEANUP_GRACE_PERIOD_DAYS=30
```

### Manual Triggering

For testing, you can manually trigger these jobs via the API:

```bash
# Detect orphaned images
curl -X POST http://localhost:7034/api/jobs/queue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "asset:detect-orphaned-images", "params": {}}'

# Cleanup orphaned images (delete old orphans)
curl -X POST http://localhost:7034/api/jobs/queue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "asset:cleanup-orphaned-images", "params": {}}'
```

**Tip:** For local testing, set both config values to `0` in your `.env.local` to disable the protection windows and immediately detect/cleanup orphans.

## Unified Sidebar Navigation

Jolli features a modern unified sidebar for navigation (introduced January 2026). The unified sidebar is feature-complete and available for use, though it's not yet enabled by default to allow for gradual rollout and testing.

### Features

- **Single Navigation Point**: All navigation consolidated in one collapsible sidebar
- **Org/Tenant Switching**: Quick switcher at the top of the sidebar
- **Favorite Spaces & Sites**: Pin your most-used spaces and sites for quick access
- **View All Dropdowns**: Search and browse all spaces/sites with expandable dropdowns
- **Responsive Design**: Adapts to desktop, tablet, and mobile viewports
- **Theme Switcher**: Built-in light/dark mode toggle
- **User Profile Menu**: Quick access to account settings and logout

### Navigation Tabs

The sidebar includes these main tabs:
- **Inbox** - Recent drafts and activity requiring attention
- **Dashboard** - Job statistics and system overview
- **Articles** - Browse and manage documentation articles
- **Sites** - Create and manage documentation sites (Nextra/Docusaurus)
- **Integrations** - Configure GitHub and other integrations
- **Settings** - Application and user preferences
- **Dev Tools** - Developer utilities (when enabled)

### User Preferences

The sidebar uses browser localStorage to remember:
- Collapsed/expanded state
- Favorite spaces and sites
- Spaces/Sites section expanded state

Preferences are scoped per tenant, so each tenant can have different favorites and settings.

### Enabling the Unified Sidebar

To try the new unified sidebar:

1. Open the browser DevTools console
2. Run: `localStorage.setItem('tenant:useUnifiedSidebar', 'true')`
3. Refresh the page

To switch back to legacy navigation:
```javascript
localStorage.setItem('tenant:useUnifiedSidebar', 'false')
```

**Note:** The unified sidebar will become the default in a future release after thorough testing. The legacy two-tier navigation will then be deprecated and eventually removed.

### Development

When working on sidebar components:
- Main component: `frontend/src/ui/unified-sidebar/UnifiedSidebar.tsx`
- Tests: `frontend/src/ui/unified-sidebar/UnifiedSidebar.test.tsx`
- E2E tests: `e2e/tests/UnifiedSidebar.spec.ts`
- Preferences: `frontend/src/services/preferences/PreferencesRegistry.ts`

To enable the unified sidebar by default (for future release):
- Change `defaultValue: false` to `defaultValue: true` in `PreferencesRegistry.ts`
- Ensure all existing tests pass with the new default
- Update test helpers to include SpaceProvider and SitesProvider by default

## Running the Application

You can run the app in your IDE (there are run files for VSCode and IntelliJ),
or you can run the following commands to run the app in "Production Mode":

**Start the backend:**
```bash
cd backend
npm run start
```

Backend will be available at: http://localhost:7034

**Start the frontend:**
```bash
cd frontend
npm run start
```

Frontend will be available at: http://localhost:8034

## Multi-Tenant Local Development

Jolli supports multi-tenant mode where different subdomains serve different tenants. This guide explains how to set up and test multi-tenancy locally using nginx as an HTTPS gateway.

### Prerequisites

- PostgreSQL running with:
  - Main database (e.g., `jolli`)
  - Registry database (e.g., `jolli_registry`) - stores tenant metadata
  - Tenant databases (e.g., `jolli_main`, `jolli_test`) - one per tenant
- nginx installed
- Node.js (for cross-platform gateway script)
- Tenant records created in the registry database (typically done via the manager app)

### Step 1: Install nginx

**macOS:**
```bash
brew install nginx
```

**Windows (using winget):**
```bash
winget install nginxinc.nginx
```

**Windows (using Chocolatey):**
```bash
choco install nginx
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update && sudo apt install nginx
```

### Step 2: Add Hosts File Entries

Add to your hosts file:
- **macOS/Linux:** `/etc/hosts`
- **Windows:** `C:\Windows\System32\drivers\etc\hosts` (edit as Administrator)

```
127.0.0.1 jolli-local.me
127.0.0.1 main.jolli-local.me
127.0.0.1 auth.jolli-local.me
127.0.0.1 admin.jolli-local.me
```

Add additional entries for each tenant subdomain you want to test.

### Step 3: Generate SSL Certificate

Navigate to the gateway/certs directory and generate a self-signed certificate:

**macOS/Linux:**
```bash
cd gateway/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout private.key.pem -out domain.cert.pem \
  -subj "/CN=jolli-local.me" \
  -addext "subjectAltName=DNS:jolli-local.me,DNS:*.jolli-local.me,IP:127.0.0.1"
```

**Windows (Git Bash):**
```bash
cd gateway/certs
MSYS_NO_PATHCONV=1 openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout private.key.pem -out domain.cert.pem \
  -subj "/CN=jolli-local.me" \
  -addext "subjectAltName=DNS:jolli-local.me,DNS:*.jolli-local.me,IP:127.0.0.1"
```

### Step 4: Configure Environment Variables

**Backend** (`backend/.env.local`):
```env
# Multi-tenant mode
MULTI_TENANT_ENABLED=true
MULTI_TENANT_REGISTRY_URL=postgres://postgres:yourpassword@localhost:5432/jolli_registry
BASE_DOMAIN=jolli-local.me

# cookie domain
COOKIE_DOMAIN=.jolli-local.dev

# better auth secret
#openssl rand -base64 32
BETTER_AUTH_SECRET=<32-byte-base64-key>

# Gateway mode (required for nginx gateway)
USE_GATEWAY=true
USE_MULTI_TENANT_AUTH=true
# USE_TENANT_SWITCHER=true  # Optional: shows tenant switcher in DevTools

# Encryption key (must match manager app's ENCRYPTION_KEY)
DB_PASSWORD_ENCRYPTION_KEY=<key-from-manager>

# Auth gateway for OAuth flows
AUTH_GATEWAY_ORIGIN=https://auth.jolli-local.me

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_CODE_ENCRYPTION_KEY=<32-byte-base64-key>

# Generate with: openssl rand -hex 32
AUTH_CODE_SIGNING_KEY=<64-char-hex-key>

# Default origin (fallback - actual origin derived from X-Forwarded-Host)
ORIGIN=https://jolli-local.me
```

### Step 5: Start All Services

**Terminal 1: Backend**
```bash
cd backend && npm run start
```

**Terminal 2: Frontend**
```bash
cd frontend && npm run start
```

**Terminal 3: Gateway**
```bash
cd gateway && npm run gateway:start
```

**Windows users:** Before starting the gateway:
1. Edit `gateway/nginx.conf` - comment out the Linux lines and uncomment the Windows lines for `error_log`, `pid`, and `access_log`
2. Use Git Bash to run the gateway script
3. You may need to run as Administrator for nginx to bind to port 443

**To stop the gateway:**
```bash
cd gateway && npm run gateway:stop
```

### Step 6: Configure Google OAuth (if needed)

Add to your Google Cloud Console OAuth client:
- **Authorized redirect URIs:** `https://auth.jolli-local.me/connect/google/callback`
- **Authorized JavaScript origins:** `https://main.jolli-local.me`, `https://auth.jolli-local.me`

### Step 7: Access the Application

| URL | Description |
|-----|-------------|
| `https://main.jolli-local.me` | Main tenant |
| `https://demo.jolli-local.me` | Demo tenant (if configured) |
| `https://auth.jolli-local.me` | Auth gateway for OAuth |
| `https://admin.jolli-local.me` | Manager app (port 3034) |

**Note:** Your browser will show an SSL warning for the self-signed certificate. Click "Advanced" → "Proceed" to continue.

### Troubleshooting

**502 Bad Gateway:**
- Ensure frontend (port 8034) and backend (port 7034) are running
- Check `gateway/logs/error.log` for details

**"password must be a string" error:**
- The `DB_PASSWORD_ENCRYPTION_KEY` is missing or incorrect
- Must match the `ENCRYPTION_KEY` used by the manager app to encrypt tenant passwords

**OAuth redirect_uri_mismatch:**
- Add the new domain to Google Cloud Console OAuth settings
- Ensure `AUTH_GATEWAY_ORIGIN` matches your gateway URL

**Tenant not found:**
- Ensure the tenant record exists in the registry database
- Check that the subdomain matches the tenant's `slug` field

**nginx won't start on Windows:**
- Run terminal as Administrator
- Make sure nginx is in your PATH, or use full path to nginx executable

### Writing Multi-Tenant Safe Raw Queries

When writing raw SQL queries in multi-tenant mode, it's important to understand how schema isolation works:

**ORM queries are automatically safe**: Sequelize uses `options.schema` to generate schema-qualified SQL:
```sql
-- Generated by Sequelize with options.schema = "org_engineering"
SELECT * FROM "org_engineering"."users" WHERE ...
```

**Raw queries need attention with pooled connections**: The `SET search_path` hook fires once when connecting, but with pooled connections (like Neon's transaction pooling), each transaction may get a different backend connection where `search_path` has been reset.

#### Best Practices for Raw Queries

1. **Prefer ORM methods over raw queries** when possible. Sequelize methods automatically handle schema qualification.

2. **For system catalog queries**, use schema-agnostic functions:
   ```typescript
   // SAFE - PostgreSQL functions work regardless of search_path
   await sequelize.query("SELECT current_schema()");
   await sequelize.query("SHOW search_path");
   await sequelize.query("SELECT * FROM information_schema.tables WHERE table_schema = current_schema()");
   ```

3. **For tenant data queries**, use schema-qualified table names:
   ```typescript
   // UNSAFE with pooled connections - relies on search_path
   await sequelize.query('SELECT * FROM users');

   // SAFE - explicit schema qualification
   const schema = sequelize.options.schema ?? 'public';
   await sequelize.query(`SELECT * FROM "${schema}"."users"`);
   ```

4. **For migration/sync queries** (like those in DAO `postSync` hooks), the queries typically run at startup with a dedicated connection, so they're generally safe. However, prefer schema-qualified names for consistency.

#### When Is This Important?

- **Local development (direct connections)**: The `SET search_path` hook works reliably
- **Neon pooled connections**: Raw queries without schema qualification may access wrong schema
- **Production with connection pooler**: Same concern as Neon pooled connections

For implementation details, see the documentation in `backend/src/tenant/TenantSequelizeFactory.ts`.

## Job Worker Service (Multi-Tenant)

In multi-tenant mode, background jobs are processed by a dedicated worker service running in AWS ECS Fargate. This section explains how the worker discovers and processes jobs across tenants.

### Architecture Overview

The worker service processes jobs for all active tenant-org pairs:

1. **WorkerPolling** periodically queries the registry database for active tenants and orgs
2. **MultiTenantJobSchedulerManager** creates a pg-boss scheduler for each tenant-org pair
3. Each scheduler connects to the tenant's database with the org's schema
4. Jobs are stored in pg-boss tables within each org's schema (isolated from other orgs)

```
                                  ┌─────────────────────────────┐
                                  │     Registry Database       │
                                  │  (jolli_registry)           │
                                  │  - tenants table            │
                                  │  - orgs table               │
                                  │  - tenant_db_configs table  │
                                  └─────────────┬───────────────┘
                                                │
                                    polls for   │
                                  active pairs  │
                                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           Worker Service (ECS Fargate)                     │
│                                                                            │
│  ┌───────────────────┐   ┌──────────────────────────────────────────────┐  │
│  │  WorkerPolling    │──▶│  MultiTenantJobSchedulerManager              │  │
│  │                   │   │                                              │  │
│  │  - Poll interval  │   │  Cache:                                      │  │
│  │  - Max schedulers │   │  ┌─────────────────────────────────────────┐ │  │
│  └───────────────────┘   │  │ tenant-1:org-1 → Scheduler (pg-boss)    │ │  │
│                          │  │ tenant-1:org-2 → Scheduler (pg-boss)    │ │  │
│                          │  │ tenant-2:org-1 → Scheduler (pg-boss)    │ │  │
│                          │  └─────────────────────────────────────────┘ │  │
│                          └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                                │
                    each scheduler connects to  │
                    tenant DB with org schema   │
                                                ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    Tenant Database                            │
        │                    (e.g., jolli_tenant1)                      │
        │                                                               │
        │  ┌────────────────────┐    ┌────────────────────┐             │
        │  │  org_default       │    │  org_engineering   │             │
        │  │  (public schema)   │    │                    │             │
        │  │                    │    │                    │             │
        │  │  pgboss.job        │    │  pgboss.job        │  ◀── pg-boss│
        │  │  pgboss.schedule   │    │  pgboss.schedule   │      tables │
        │  │  pgboss.archive    │    │  pgboss.archive    │             │
        │  │                    │    │                    │             │
        │  │  docs              │    │  docs              │  ◀── app    │
        │  │  integrations      │    │  integrations      │      tables │
        │  │  ...               │    │  ...               │             │
        │  └────────────────────┘    └────────────────────┘             │
        └───────────────────────────────────────────────────────────────┘
```

### How Tenant-Orgs Are Discovered

The worker uses **polling** to discover tenant-org pairs - there is no push notification from the manager app. The `WorkerPolling` component periodically queries the registry database:

1. Queries for tenants with `status = 'active'`
2. For each tenant, queries for orgs with `status = 'active'`
3. Creates schedulers for new tenant-org pairs (skips existing ones)
4. Respects `maxConcurrentSchedulers` limit to control memory usage

**When a new tenant or org is provisioned via the manager app:**
- The manager creates records in the registry database with `status = 'active'`
- On the next poll cycle, the worker discovers the new tenant-org pair
- A scheduler is created and started for the new pair
- Jobs can then be queued and processed for that tenant-org

**Discovery latency:** New tenant-orgs are picked up within the poll interval (default: 60 seconds). There's no immediate notification - the worker must wait for the next poll cycle.

### Job Storage

Each org has its own set of pg-boss tables:
- `{schema}.pgboss.job` - Job queue
- `{schema}.pgboss.schedule` - Scheduled jobs
- `{schema}.pgboss.archive` - Completed jobs

This ensures complete isolation between orgs - jobs in one org cannot affect another.

### How Jobs Get Queued

Jobs enter the queue through several paths:
1. **Scheduled jobs**: Cron schedules defined in job definitions (e.g., daily cleanup)
2. **API calls**: Frontend/API calls to `/api/jobs/queue` endpoint
3. **Event triggers**: GitHub webhooks via JRN adapter, integration sync events

### Job Handler Context

Job handlers run with the correct `TenantOrgContext` set, so:
- `getTenantContext()` returns the correct tenant and org
- Database access via `getDatabase()` is scoped to the org's schema
- All operations are tenant-aware without additional code

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_POLL_INTERVAL_MS` | Polling interval for new tenant-orgs | 60000 |
| `WORKER_MAX_SCHEDULERS` | Max concurrent schedulers | 100 |

### Worker Mode Behavior

The `workerMode` configuration controls whether a process runs job workers inline:

- **Single-tenant mode:** `workerMode: true` (default) - Jobs are processed inline by the main app
- **Multi-tenant mode:** `workerMode: false` (default) - Jobs are NOT processed by the main app; the separate worker service handles job processing

In multi-tenant local development:
- The **main app** starts with `workerMode: false` - it queues jobs but does NOT process them
- The **worker service** (`npm run worker:dev`) starts with `workerMode: true` - it processes jobs and publishes events to Mercure

**IntelliJ Users:** If using the IntelliJ run configurations:
- `jolli-backend` runs the main app (workerMode defaults to false in multi-tenant mode)
- `jolli-worker` runs the worker service and should have `WORKER_MODE=true` in its Environment variables

This separation ensures that real-time dashboard updates work correctly - the worker processes jobs and publishes events to Mercure, which the frontend subscribes to for live updates.

### Mercure Integration

When Mercure is enabled (`MERCURE_ENABLED=true`), the worker publishes job events to the Mercure hub:
- `job:started` - When a job begins execution
- `job:completed` - When a job finishes successfully
- `job:failed` - When a job fails
- `job:cancelled` - When a job is cancelled
- `job:stats-updated` - When job statistics are updated

Events are published to tenant-org scoped topics (e.g., `/tenants/acme/orgs/engineering/jobs/events`), ensuring subscribers only receive events for their tenant-org. This enables real-time job status updates in the frontend Dashboard.

### Running the Worker Locally

The worker is designed for AWS ECS but can be run locally for testing:

```bash
cd backend
npm run worker:dev
```

This uses `.env.local` configuration. Requires multi-tenant configuration to be set up (see Multi-Tenant Local Development).

## Mercure Hub for Distributed SSE

Jolli uses [Mercure](https://mercure.rocks) for distributed Server-Sent Events (SSE). This enables real-time updates across multiple backend instances, which is essential for horizontal scaling in production.

### What is Mercure?

Mercure is an open protocol for real-time communication. It acts as a hub that:
- Receives events published by the backend
- Distributes those events to subscribed frontend clients via SSE
- Handles connection management, reconnection, and message delivery

### When is Mercure Needed?

- **Local development (single instance):** Optional - the built-in SSE endpoints work without Mercure
- **Production (multiple instances):** Required - ensures all clients receive updates regardless of which backend instance they're connected to

### Local Development Setup

1. **Start the Mercure Hub with Docker:**

   Ensure Docker Desktop is running, then:
   ```bash
   docker-compose -f docker-compose.mercure.yml up -d
   ```

   The Mercure Hub will be available at: http://localhost:3001/.well-known/mercure

2. **Configure environment variables:**

   Copy the example configuration to your `.env.local`:
   ```bash
   # Add to backend/.env.local
   MERCURE_ENABLED=true
   MERCURE_HUB_BASE_URL=http://localhost:3001
   MERCURE_PUBLISHER_JWT_SECRET=jolli-mercure-publisher-secret-change-in-production
   MERCURE_SUBSCRIBER_JWT_SECRET=jolli-mercure-subscriber-secret-change-in-production
   ```

   See `.env.mercure.example` for a complete example.

3. **Verify Mercure is running:**
   ```bash
   # Check container status
   docker ps | grep mercure

   # Check hub health
   curl http://localhost:3001/.well-known/mercure?topic=health
   ```

4. **Stop Mercure when done:**
   ```bash
   docker-compose -f docker-compose.mercure.yml down
   ```

### How It Works

```
Frontend (EventSource) ←── Mercure Hub ←── Backend (publish)
                              ↑
                    JWT Authentication
```

1. Backend publishes events to Mercure Hub with a signed JWT (publisher token)
2. Frontend subscribes to topics via EventSource with a signed JWT (subscriber token)
3. Mercure Hub authenticates both and routes events to appropriate subscribers

### Topic Structure

Events are published to tenant-scoped topics:
- `/tenants/{slug}/jobs/events` - Job status updates (Dashboard)
- `/tenants/{slug}/drafts/{id}` - Draft collaboration events
- `/tenants/{slug}/convos/{id}` - Conversation events

### Hybrid Mode

The current implementation uses a **hybrid approach**:
- Existing SSE endpoints continue to work (backward compatible)
- Events are also published to Mercure when enabled
- Frontend can choose to use either mechanism

This ensures the application works with or without Mercure configured.

### Production Deployment

For production, you'll need to:
1. Deploy a Mercure Hub (e.g., as a Docker container or managed service)
2. Configure strong JWT secrets (minimum 256 bits)
3. Set appropriate CORS origins (not `*`)
4. Consider using a hosted service, such as the [Mercure.rocks Cloud](https://mercure.rocks/cloud)

### Troubleshooting

**Issue: Mercure container won't start**
- **Solution:** Ensure Docker Desktop is running and port 3001 is available

**Issue: "Mercure is not enabled" error**
- **Solution:** Check that all `MERCURE_*` environment variables are set correctly

**Issue: Events not reaching frontend**
- **Solution:**
  - Verify Mercure Hub is running: `curl http://localhost:3001/.well-known/mercure?topic=health`
  - Check browser DevTools Network tab for EventSource connection
  - Verify JWT secrets match between backend and `docker-compose.mercure.yml`

## Central User Authentication

Jolli uses a centralized authentication system where the Manager DB stores global user credentials and the Backend handles authentication requests. This enables single sign-on across all tenants.

### Architecture Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Frontend     │      │     Backend     │      │   Manager DB    │
│   (Any Tenant)  │─────▶│   (better-auth) │─────▶│  (global_users) │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                │                         │
                                ▼                         │
                         ┌─────────────────┐             │
                         │      Redis      │◀────────────┘
                         │   (Sessions)    │
                         └─────────────────┘
```

Key components:
- **Manager DB**: Stores `global_users`, `global_auths`, and `verifications` tables for centralized user management
- **Backend**: Uses `better-auth` library for authentication, connected to Manager DB
- **Redis**: Stores session data for scalability across multiple backend instances
- **SendGrid**: Sends password reset emails

### Backend Configuration

Add these environment variables to `backend/.env.local`:

```bash
# Manager DB Connection (Required)
# Backend connects to Manager DB for authentication
MULTI_TENANT_REGISTRY_URL=postgresql://user:pass@host:5432/manager_db

# Redis for Session Storage (Recommended for production)
# Without Redis, sessions are stored in memory (lost on restart)
REDIS_URL=redis://localhost:6379

# SendGrid for Password Reset Emails (Required for password reset feature)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@jolli.ai
SENDGRID_FROM_NAME=Jolli Support

# Bootstrap Secret (Required for Manager integration)
# Shared secret for HMAC-signed requests from Manager to Backend
# Must match BOOTSTRAP_SECRET in Manager config
# Generate secret with: openssl rand -hex 32
BOOTSTRAP_SECRET=your-secure-random-string-minimum-32-chars

# Bootstrap timestamp tolerance (Optional, default: 300000ms = 5 minutes)
#BOOTSTRAP_TIMESTAMP_TOLERANCE_MS=300000
```

### Manager Configuration

Add these environment variables to `manager/.env.local`:

```bash
# Backend Internal URL (Required for owner/tenant provisioning)
# URL where Manager can reach Backend's internal admin endpoints
BACKEND_INTERNAL_URL=http://localhost:8034

# Bootstrap Secret (Required, must match Backend's BOOTSTRAP_SECRET)
# Used to sign HMAC requests to Backend's /api/admin/bootstrap endpoint
BOOTSTRAP_SECRET=your-secure-random-string-minimum-32-chars
```

### How Bootstrap Works

When the Manager creates or provisions a tenant/org, it calls the Backend's bootstrap endpoint:

1. **Manager** creates HMAC-SHA256 signature using `BOOTSTRAP_SECRET`
2. **Manager** sends signed request to `BACKEND_INTERNAL_URL/api/admin/bootstrap`
3. **Backend** verifies HMAC signature and timestamp (within `BOOTSTRAP_TIMESTAMP_TOLERANCE_MS`)
4. **Backend** creates initial data in the tenant's database schema

### Redis Setup

For local development, you can run Redis using Docker:

```bash
docker run -d --name jolli-redis -p 6379:6379 redis:alpine
```

Or use Docker Compose:

```yaml
# docker-compose.redis.yml
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

```bash
docker-compose -f docker-compose.redis.yml up -d
```

### SendGrid Setup

1. Create a [SendGrid account](https://sendgrid.com/)
2. Generate an API key in Settings → API Keys
3. Verify your sender email address or domain
4. Add the API key and sender info to your environment variables

### Troubleshooting

**Session lost after backend restart:**
- Configure `REDIS_URL` to persist sessions across restarts
- Without Redis, sessions are stored in memory only

**Password reset emails not sending:**
- Verify `SENDGRID_API_KEY` is set correctly
- Check that `SENDGRID_FROM_EMAIL` is verified in SendGrid
- Check backend logs for SendGrid API errors

**Bootstrap failed: Could not connect to backend:**
- Verify `BACKEND_INTERNAL_URL` is correct and Backend is running
- Check that the URL is reachable from the Manager container/process

**Bootstrap failed: Invalid signature:**
- Ensure `BOOTSTRAP_SECRET` matches exactly between Manager and Backend
- Check for trailing whitespace in environment variables

**Bootstrap failed: Request timestamp too old:**
- Ensure system clocks are synchronized between Manager and Backend
- Increase `BOOTSTRAP_TIMESTAMP_TOLERANCE_MS` if needed (default: 5 minutes)

## Testing

### Backend Tests & Linting

```bash
cd backend

# Run all tests with coverage
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Run linting and auto-fix errors if pssible:
npm run lint:fix

# Run type checking
npm run type-check

# Run everything (clean, build, lint, test, package)
npm run all
```

### Frontend Tests and Linting

```bash
cd frontend

# Run all tests with coverage
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Run everything (clean, build, lint, test, package)
npm run all
```

### Test Coverage Requirements

`backend` maintains **100% test coverage**. All new code must include comprehensive tests.

Coverage is enforced in `vite.config.ts`:
```typescript
coverage: {
  thresholds: {
    "100": true
  }
}
```

`frontend` maintains **100% test coverage** except for branches. All new code must include comprehensive tests.
```typescript
coverage: {
  thresholds: {
    branches: 98,
    functions: 100,
    lines: 100,
    statements: 100,
  }
}
```
## Localization (i18n)

Jolli uses [Intlayer](https://intlayer.org) for internationalization, supporting English (default) and Spanish.

For comprehensive documentation on:
- Creating localized content files (`.content.ts`)
- Using translations in React components with `useIntlayer` hook
- Backend localization patterns (messageKey + context)
- Best practices and troubleshooting

See **[LOCALIZATION.md](./LOCALIZATION.md)**

## Common Issues

### AWS Parameter Store

**Issue: "AccessDeniedException"**
- **Solution:** Check your AWS credentials have SSM permissions
- Required permissions: `ssm:GetParametersByPath`, `ssm:GetParameter`
- Verify your IAM user/role has the correct policy attached

**Issue: "ParameterNotFound"**
- **Solution:**
  - Verify the parameter exists: `aws ssm get-parameter --name "/jolli/backend/dev/test/message"`
  - Check the region matches (us-west-2)
  - Verify the path prefix: `/jolli/backend/{PSTORE_ENV}/`

**Issue: Parameters not loading**
- **Solution:**
  - Check `PSTORE_ENV` is set in `.env`
  - Verify `AWS_REGION` is correct in `.env`
  - Check application logs for initialization errors
  - Ensure AWS credentials are configured correctly

### GitHub Webhooks

**Issue: Webhooks not reaching local server**
- **Solution:**
  - Verify `SMEE_API_URL` is set correctly in `.env`
  - Check the backend logs for "Using smee.io for webhook delivery"
  - Visit your smee.io URL in a browser to see webhook events
  - Ensure backend is running on port 7034

**Issue: "Webhook signature verification failed"**
- **Solution:**
  - Verify `GITHUB_APPS_INFO` contains the correct `webhookSecret`
  - Check that the secret in Parameter Store matches GitHub App settings
  - Reload configuration if you updated the secret

**Issue: smee.io client won't connect**
- **Solution:**
  - Check your internet connection
  - Verify the smee.io URL is valid (visit it in a browser)
  - Try restarting the backend server
  - Check for firewall/proxy issues

### General Development

**Issue: Port already in use**
- **Solution:**
  - Backend: Kill process on port 7034: `lsof -ti:7034 | xargs kill -9`
  - Frontend: Kill process on port 8034: `lsof -ti:8034 | xargs kill -9`

**Issue: Dependencies not installing**
- **Solution:**
  - Delete `node_modules` and `package-lock.json`
  - Run `npm install` again
  - Ensure you're using Node.js v20 or later

**Issue: TypeScript errors**
- **Solution:**
  - Run `npm run type-check` to see all errors
  - Ensure all dependencies are installed
  - Check that your IDE is using the workspace TypeScript version

## Additional Resources

- [AWS Systems Manager Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [smee.io Documentation](https://smee.io)
- [GitHub Apps Documentation](https://docs.github.com/en/developers/apps)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)

## Getting Help

If you encounter issues not covered in this guide:

1. Check the application logs for detailed error messages
2. Search existing GitHub issues
3. Ask a Team member

Happy coding! 🚀
