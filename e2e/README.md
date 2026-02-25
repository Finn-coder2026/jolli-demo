# E2E Testing with Playwright

This directory contains end-to-end tests for the Jolli application using [Playwright](https://playwright.dev/).

## Prerequisites

1. **Local development environment running**:
   - Backend on port 7034 (`cd backend && npm run start`)
   - Frontend on port 8034 (`cd frontend && npm run start`)
   - Gateway (nginx) routing `https://main.jolli-local.me`

2. **A valid user account** in your local database (login once via Google to create one)

3. **Chromium browser** installed for Playwright:
   ```bash
   npx playwright install chromium
   ```

## Quick Start

### 1. Generate Your Test Token

The e2e tests use a JWT token to authenticate without going through Google OAuth. You need to generate a token for your user account.

**Step 1**: Create your `.env.e2e` file from the example:

```bash
cp e2e/.env.e2e.example e2e/.env.e2e
```

**Step 2**: Find your user ID by querying the database:

```sql
SELECT id, email, name FROM users;
```

**Step 3**: Update `e2e/.env.e2e` with your user info:

```bash
E2E_USER_ID=1
E2E_ORG_ID=your org ID from database
E2E_TENANT_ID=your tenant ID from database
E2E_USER_EMAIL=your-email@example.com
E2E_USER_NAME=Your Name
```

**Step 4**: Generate the token:

```bash
npm run e2e:token --workspaces=false
```

> **Note**: The `--workspaces=false` flag is required because this is a monorepo.

**Step 5**: Copy the generated token to your `.env.e2e` file:

The script will output a token like `E2E_TEST_TOKEN=eyJ...`. Copy this entire line and paste it into your `e2e/.env.e2e` file, replacing the placeholder value.

### 2. Run the Tests

> **Note**: All e2e scripts require the `--workspaces=false` flag because this is a monorepo.

```bash
# Run all e2e tests
npm run e2e --workspaces=false

# Run with Playwright UI (recommended for debugging)
npm run e2e:ui --workspaces=false

# Run with visible browser
npm run e2e:headed --workspaces=false

# Run in debug mode
npm run e2e:debug --workspaces=false

# View the HTML test report after tests complete
npm run e2e:report --workspaces=false
```

## How Authentication Works

Instead of going through Google OAuth (which is slow and can trigger bot detection), we generate a JWT token directly:

1. The backend validates JWT tokens using `TOKEN_SECRET` from `backend/.env`
2. We generate a token with the same secret and payload structure
3. The token is set as the `authToken` cookie before tests run
4. The backend accepts it as a valid authentication

**Token payload structure**:
```typescript
{
  name: string,
  email: string,
  picture: string | undefined,
  userId: number  // Must be a valid user ID in the database
}
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run e2e` | Run all e2e tests in headless mode |
| `npm run e2e:ui` | Open Playwright UI for interactive testing |
| `npm run e2e:headed` | Run tests with visible browser |
| `npm run e2e:setup` | Run only the authentication setup |
| `npm run e2e:debug` | Run tests in debug mode |
| `npm run e2e:token` | Generate a new test token |
| `npm run e2e:report` | View the HTML test report |

> **Note**: All scripts require `--workspaces=false` flag (e.g., `npm run e2e --workspaces=false`)

## Directory Structure

```
e2e/
├── .auth/                    # Stored authentication state (gitignored)
│   └── user.json
├── .env.e2e                  # Environment variables (gitignored)
├── .env.e2e.example          # Example environment file
├── auth/
│   └── Auth.setup.ts         # Authentication setup (runs before tests)
├── scripts/
│   └── GenerateTestToken.ts  # Token generation script
├── tests/
│   └── Dashboard.spec.ts     # Test files
├── playwright.config.ts      # Playwright configuration
└── README.md                 # This file
```

## Writing Tests

Tests are located in `e2e/tests/`. Here's a basic example:

```typescript
import { expect, test } from "@playwright/test";

test.describe("My Feature", () => {
  test("should do something", async ({ page }) => {
    await page.goto("/");

    // Your test assertions
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

## Troubleshooting

### "E2E_TEST_TOKEN environment variable not set"

Create the `.env.e2e` file with your token:
```bash
npm run e2e:token --workspaces=false
# Copy the output to e2e/.env.e2e
```

### "ERR_MODULE_NOT_FOUND" when running token script

Use the npm script with the workspaces flag:
```bash
npm run e2e:token --workspaces=false
```

### Tests fail with authentication errors

1. Ensure your `userId` in `GenerateTestToken.ts` matches an existing user
2. Ensure `TOKEN_SECRET` matches your `backend/.env` (default: `dev`)
3. Regenerate your token: `npm run e2e:token --workspaces=false`

### SSL certificate errors

The Playwright config has `ignoreHTTPSErrors: true` for local self-signed certs. If you still see errors, ensure your gateway is running with valid certificates.

### Tests timeout waiting for page

Ensure all services are running:
- Backend: `cd backend && npm run start`
- Frontend: `cd frontend && npm run start`
- Gateway: `npm run gateway:start`

## CI/CD

For CI environments, set the `E2E_TEST_TOKEN` as a secret environment variable. The token is valid for 1 year, so you don't need to regenerate it frequently.

```yaml
# Example GitHub Actions
env:
  E2E_TEST_TOKEN: ${{ secrets.E2E_TEST_TOKEN }}
```
