import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Load e2e environment variables (relative to e2e directory)
config({ path: ".env.e2e" });

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		["list"],
		["html", { outputFolder: "./playwright-report", open: "never" }],
	],
	outputDir: "./test-results",

	use: {
		baseURL: process.env.E2E_BASE_URL || "https://main.jolli-local.me",
		trace: "on-first-retry",
		ignoreHTTPSErrors: true, // For local self-signed SSL certs
	},

	projects: [
		// Setup project for authentication
		{
			name: "setup",
			testMatch: /.*\.setup\.ts/,
			testDir: "./auth",
		},

		// Main tests depend on setup
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: ".auth/user.json",
			},
			dependencies: ["setup"],
		},
	],
});
