import { test as setup } from "@playwright/test";

const authFile = ".auth/user.json";

/**
 * Authentication setup for e2e tests.
 *
 * Uses a pre-generated JWT token (E2E_TEST_TOKEN) to authenticate
 * without going through Google OAuth. This is faster and more reliable
 * for automated testing.
 *
 * To generate the token, run: npx ts-node e2e/scripts/GenerateTestToken.ts
 */
setup("set auth token", async ({ page }) => {
	const testToken = process.env.E2E_TEST_TOKEN;

	if (!testToken) {
		throw new Error(
			"E2E_TEST_TOKEN environment variable not set. " +
				"Run 'npm run e2e:token --workspaces=false' to generate a token, " +
				"then add it to e2e/.env.e2e",
		);
	}

	// Navigate to site first to set cookie on correct domain
	await page.goto("/");

	// Set the authToken cookie directly (bypasses Google OAuth)
	await page.context().addCookies([
		{
			name: "authToken",
			value: testToken,
			domain: ".jolli-local.me",
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
		},
	]);

	// Verify authentication works by checking if we can access the app
	await page.goto("/dashboard");

	// Save authentication state for reuse in tests
	await page.context().storageState({ path: authFile });
});
