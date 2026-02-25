import { expect, test, type Page } from "@playwright/test";

/**
 * Helper to dismiss any dialog/modal that might appear on page load
 */
async function dismissDialogIfPresent(page: Page): Promise<void> {
	// Wait a moment for any dialogs to appear
	await page.waitForTimeout(500);

	// Try to close dialog by clicking outside or pressing Escape
	const dialogCloseButton = page.locator(
		'[data-testid="dialog-close"], [aria-label="Close"], button:has-text("Close"), button:has-text("Got it"), button:has-text("Dismiss")',
	);

	if (await dialogCloseButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
		await dialogCloseButton.first().click();
		await page.waitForTimeout(300);
	}

	// Also try pressing Escape to close any modal
	await page.keyboard.press("Escape");
	await page.waitForTimeout(200);
}

/**
 * Helper to skip the integration setup wizard if it appears
 * This happens when the user has no integrations set up
 */
async function skipIntegrationSetupIfPresent(page: Page): Promise<void> {
	// Wait for page to load
	await page.waitForTimeout(1000);

	// Check for "Skip for now" button (integration setup wizard)
	const skipButton = page.locator('button:has-text("Skip for now")');
	if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
		console.log("Integration setup detected, clicking 'Skip for now'...");
		await skipButton.click();
		await page.waitForTimeout(1000);
	}
}

test.describe("Dashboard", () => {
	test("should display dashboard after authentication", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);

		// Dashboard should be visible (user is authenticated via setup)
		// Wait for page to load and check for any visible content
		await expect(page.locator("body")).toBeVisible();

		// Check that we're on the dashboard (not redirected to login)
		await expect(page).not.toHaveURL(/\/login/);
	});

	test("should display job stats card", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);

		// JobsStatsCard should be visible
		// This card typically shows job statistics
		const statsCard = page.locator(".grid .bg-card, .grid .rounded-lg").first();
		await expect(statsCard).toBeVisible();
	});

	test("should navigate to active jobs", async ({ page }) => {
		await page.goto("/jobs/active");
		await skipIntegrationSetupIfPresent(page);

		// Should show active jobs view
		await expect(page).toHaveURL(/\/jobs\/active/);
	});

	test("should navigate to job history", async ({ page }) => {
		await page.goto("/jobs/history");
		await skipIntegrationSetupIfPresent(page);

		// Should show job history view
		await expect(page).toHaveURL(/\/jobs\/history/);
	});
});

test.describe("Navigation", () => {
	test("should have main navigation tabs", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);

		// Check for unified sidebar - the main navigation component
		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		await expect(sidebar).toBeVisible({ timeout: 5000 });
	});

	test("should navigate to Articles tab", async ({ page }) => {
		await page.goto("/articles");
		await skipIntegrationSetupIfPresent(page);

		// Should show articles view
		await expect(page).toHaveURL(/\/articles/);
	});
});
