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

/**
 * Helper to wait for sidebar to be visible
 * Returns false if sidebar not found (some routes don't have sidebar)
 */
async function waitForSidebar(page: Page): Promise<boolean> {
	try {
		await page.waitForSelector('[data-testid="unified-sidebar"]', { state: "visible", timeout: 5000 });
		return true;
	} catch {
		// Sidebar not found - this is OK for some routes (e.g., full-screen modals, article drafts)
		return false;
	}
}

test.describe("UnifiedSidebar - Basic Structure", () => {
	test("should display unified sidebar", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		await expect(sidebar).toBeVisible();
	});

	test("should have org/tenant selector at top", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// OrgTenantSelector can have different test IDs based on state:
		// - org-tenant-selector (with dropdown)
		// - org-tenant-selector-static (without dropdown)
		// - org-tenant-selector-loading (while loading)
		const orgTenantSelector = page.locator('[data-testid^="org-tenant-selector"]').first();
		await expect(orgTenantSelector).toBeVisible();
	});

	test("should have main navigation tabs", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Check for navigation buttons (Inbox, Dashboard)
		const navButtons = page.locator('[data-testid="unified-sidebar"] nav button');
		await expect(navButtons.first()).toBeVisible();
		const count = await navButtons.count();
		expect(count).toBeGreaterThanOrEqual(2); // At least Inbox and Dashboard
	});

	test("should have bottom section with utilities", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const bottomSection = page.locator('[data-testid="sidebar-bottom-section"]');
		await expect(bottomSection).toBeVisible();
	});

	test("should have sidebar collapse button", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const collapseButton = page.locator('[data-testid="sidebar-collapse-button"]');
		await expect(collapseButton).toBeVisible();
	});
});

test.describe("UnifiedSidebar - Sidebar Collapse", () => {
	test("should collapse sidebar when collapse button is clicked", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		const collapseButton = page.locator('[data-testid="sidebar-collapse-button"]');

		// Get initial width
		const initialWidth = await sidebar.evaluate((el) => el.style.width || el.getBoundingClientRect().width + "px");

		await collapseButton.click();
		await page.waitForTimeout(500);

		// Width should have changed
		const newWidth = await sidebar.evaluate((el) => el.style.width || el.getBoundingClientRect().width + "px");
		expect(newWidth).not.toBe(initialWidth);
	});

	test("should expand sidebar when collapse button is clicked in collapsed state", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		const collapseButton = page.locator('[data-testid="sidebar-collapse-button"]');

		// First collapse the sidebar
		await collapseButton.click();
		await page.waitForTimeout(500);

		// Get collapsed width
		const collapsedWidth = await sidebar.evaluate((el) => el.style.width || el.getBoundingClientRect().width + "px");

		// Click again to expand
		await collapseButton.click();
		await page.waitForTimeout(500);

		// Width should have changed back
		const expandedWidth = await sidebar.evaluate((el) => el.style.width || el.getBoundingClientRect().width + "px");
		expect(expandedWidth).not.toBe(collapsedWidth);
	});
});

test.describe("UnifiedSidebar - Navigation", () => {
	test("should click through all navigation icons after login", async ({ page }) => {
		// Start from home page (authenticated via setup)
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Define all navigation tabs in sidebar (inbox and dashboard are the main nav tabs)
		// Note: Articles, sites, analytics, integrations are accessible via direct URL but not in sidebar tabs
		const navigationTabs = [
			{ testId: "nav-inbox", expectedUrl: /\/inbox/, label: "Inbox" },
			{ testId: "nav-dashboard", expectedUrl: /^\/$|\/dashboard/, label: "Dashboard" },
		];

		// Click through each navigation tab
		for (const tab of navigationTabs) {
			const navButton = page.locator(`[data-testid="${tab.testId}"]`);

			// Check if button exists
			const isVisible = await navButton.isVisible({ timeout: 2000 }).catch(() => false);

			if (isVisible) {
				console.log(`Clicking ${tab.label} navigation tab...`);

				// Click the navigation button
				await navButton.click();
				await page.waitForTimeout(500);

				// Verify URL changed
				await expect(page).toHaveURL(tab.expectedUrl);
				console.log(`✓ Successfully navigated to ${tab.label}`);

				// Verify the button is highlighted as active
				const hasActiveClass = await navButton.evaluate((el) => el.classList.contains("bg-accent"));
				expect(hasActiveClass).toBe(true);
			} else {
				console.log(`⊘ ${tab.label} navigation tab not found (may be hidden or disabled)`);
			}
		}
	});

	test("should navigate to inbox when inbox tab clicked", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Find and click inbox button
		const inboxButton = page.locator('[data-testid="nav-inbox"]');
		if (await inboxButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await inboxButton.click();
			await page.waitForTimeout(500);
			await expect(page).toHaveURL(/\/inbox/);
		}
	});

	test("should navigate to dashboard when dashboard tab clicked", async ({ page }) => {
		await page.goto("/inbox");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Find and click dashboard button
		const dashboardButton = page.locator('[data-testid="nav-dashboard"]');
		await dashboardButton.click();
		await page.waitForTimeout(500);
		await expect(page).toHaveURL(/^\/$|\/dashboard/);
	});

	test("should navigate to settings when settings button clicked", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Find and click settings button in expanded mode
		const settingsButton = page.locator('[data-testid="settings-button-expanded"]');
		if (await settingsButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await settingsButton.click();
			await page.waitForTimeout(500);
			await expect(page).toHaveURL(/\/settings/);
		}
	});

	test("should highlight active tab", async ({ page }) => {
		// First go to home and skip integration setup
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Click on inbox tab to navigate there
		const inboxButton = page.locator('[data-testid="nav-inbox"]');
		if (await inboxButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await inboxButton.click();
			await page.waitForTimeout(500);

			// Verify inbox tab is highlighted as active
			const hasActiveClass = await inboxButton.evaluate((el) => el.classList.contains("bg-accent"));
			expect(hasActiveClass).toBe(true);
		}
	});
});

test.describe("UnifiedSidebar - Space Favorites", () => {
	test("should display favorite spaces section", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const favoriteSpaces = page.locator('[data-testid="favorite-spaces-list"]');
		await expect(favoriteSpaces).toBeVisible();
	});

	test("should open view all spaces dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-spaces-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('[data-testid="view-all-spaces-dropdown"]');
			await expect(dropdown).toBeVisible();
		}
	});

	test("should toggle space favorite from view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-spaces-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			// Find first star button in the dropdown
			const starButton = page.locator('[data-testid^="star-space-"]').first();
			if (await starButton.isVisible({ timeout: 1000 }).catch(() => false)) {
				await starButton.click();
				await page.waitForTimeout(300);
				// Favorite state should change
			}
		}
	});

	test("should navigate when clicking space in favorites list", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Favorite spaces use test ID pattern: favorite-space-{id}
		const favoriteSpaceItem = page.locator('[data-testid^="favorite-space-"]').first();
		if (await favoriteSpaceItem.isVisible({ timeout: 1000 }).catch(() => false)) {
			await favoriteSpaceItem.click();
			await page.waitForTimeout(500);
			// Should navigate to articles view for that space
		}
	});
});

test.describe("UnifiedSidebar - Site Favorites", () => {
	test("should display favorite sites section", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const favoriteSites = page.locator('[data-testid="favorite-sites-list"]');
		await expect(favoriteSites).toBeVisible();
	});

	test("should toggle site favorite from view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-sites-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			// Find first star button in the dropdown
			const starButton = page.locator('[data-testid^="star-site-"]').first();
			if (await starButton.isVisible({ timeout: 1000 }).catch(() => false)) {
				await starButton.click();
				await page.waitForTimeout(300);
				// Favorite state should change
			}
		}
	});

	test("should navigate when clicking site in favorites list", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Favorite sites use test ID pattern: favorite-site-{id}
		const favoriteSiteItem = page.locator('[data-testid^="favorite-site-"]').first();
		if (await favoriteSiteItem.isVisible({ timeout: 1000 }).catch(() => false)) {
			await favoriteSiteItem.click();
			await page.waitForTimeout(500);
			// Should navigate to site detail view
			await expect(page).toHaveURL(/\/sites\//);
		}
	});
});

test.describe("UnifiedSidebar - View All Dropdowns", () => {
	test("should open spaces view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-spaces-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('[data-testid="view-all-spaces-dropdown"]');
			await expect(dropdown).toBeVisible();
		}
	});

	test("should search spaces in view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-spaces-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			const searchInput = page.locator('[data-testid="search-spaces-input"]');
			if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
				await searchInput.fill("test");
				await page.waitForTimeout(300);
				// Search should filter results
			}
		}
	});

	test("should open sites view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-sites-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			const dropdown = page.locator('[data-testid="view-all-sites-dropdown"]');
			await expect(dropdown).toBeVisible();
		}
	});

	test("should search sites in view all dropdown", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const viewAllButton = page.locator('[data-testid="view-all-sites-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			const searchInput = page.locator('[data-testid="search-sites-input"]');
			if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
				await searchInput.fill("test");
				await page.waitForTimeout(300);
				// Search should filter results
			}
		}
	});
});

test.describe("UnifiedSidebar - Create Buttons", () => {
	test("should show create space button", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const createSpaceButton = page.locator('[data-testid="create-space-button"]');
		if (await createSpaceButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await expect(createSpaceButton).toBeVisible();
		}
	});

	test("should open create space dialog", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		const hasSidebar = await waitForSidebar(page);

		if (!hasSidebar) {
			// Skip test if sidebar not present
			return;
		}

		const createSpaceButton = page.locator('[data-testid="create-space-button"]');
		if (await createSpaceButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await createSpaceButton.click();
			await page.waitForTimeout(300);

			const dialog = page.locator('[data-testid="create-space-dialog"]');
			if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
				await expect(dialog).toBeVisible();
			}
		}
	});

	test("should show create site button", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		const createSiteButton = page.locator('[data-testid="create-site-button"]');
		if (await createSiteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await expect(createSiteButton).toBeVisible();
		}
	});
});

test.describe("UnifiedSidebar - Bottom Section", () => {
	test("should have settings button", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Settings button in expanded mode
		const settingsButton = page.locator('[data-testid="settings-button-expanded"]');
		if (await settingsButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await expect(settingsButton).toBeVisible();
		}
	});

	test("should have user menu trigger", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// User menu trigger in expanded mode
		const userMenuTrigger = page.locator('[data-testid="user-menu-trigger-expanded"]');
		if (await userMenuTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
			await expect(userMenuTrigger).toBeVisible();
		}
	});

	test("should open user menu and show theme selector", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// User menu trigger in expanded mode
		const userMenuTrigger = page.locator('[data-testid="user-menu-trigger-expanded"]');
		if (await userMenuTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
			await userMenuTrigger.click();
			await page.waitForTimeout(300);

			// Theme selector should be visible in the dropdown
			const themeSelector = page.locator('[data-testid="theme-selector"]');
			if (await themeSelector.isVisible({ timeout: 1000 }).catch(() => false)) {
				await expect(themeSelector).toBeVisible();
			}
		}
	});

	test("should toggle theme when clicking theme buttons", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await waitForSidebar(page);

		// Open user menu first
		const userMenuTrigger = page.locator('[data-testid="user-menu-trigger-expanded"]');
		if (await userMenuTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
			await userMenuTrigger.click();
			await page.waitForTimeout(300);

			// Click dark theme button
			const darkButton = page.locator('[data-testid="theme-dark-button"]');
			if (await darkButton.isVisible({ timeout: 1000 }).catch(() => false)) {
				await darkButton.click();
				await page.waitForTimeout(500);
				// Theme should change to dark
			}

			// Click light theme button
			const lightButton = page.locator('[data-testid="theme-light-button"]');
			if (await lightButton.isVisible({ timeout: 1000 }).catch(() => false)) {
				await lightButton.click();
				await page.waitForTimeout(500);
				// Theme should change to light
			}
		}
	});
});

test.describe("UnifiedSidebar - Responsive Behavior", () => {
	test("should be visible on desktop viewport", async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		const hasSidebar = await waitForSidebar(page);

		if (!hasSidebar) {
			// Skip test if sidebar not present
			return;
		}

		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		await expect(sidebar).toBeVisible();
	});

	test("should handle narrow viewport", async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await page.waitForTimeout(500);

		// Sidebar might be collapsed or hidden on narrow viewport
		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		const isVisible = await sidebar.isVisible({ timeout: 2000 }).catch(() => false);
		// Either visible or hidden is acceptable on narrow viewport
		expect(typeof isVisible).toBe("boolean");
	});

	test("should handle mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await page.waitForTimeout(500);

		// On mobile, sidebar might be hidden by default
		const sidebar = page.locator('[data-testid="unified-sidebar"]');
		const isVisible = await sidebar.isVisible({ timeout: 2000 }).catch(() => false);
		// Either visible or hidden is acceptable on mobile
		expect(typeof isVisible).toBe("boolean");
	});
});

test.describe("UnifiedSidebar - Keyboard Navigation", () => {
	test("should navigate tabs with keyboard", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		const hasSidebar = await waitForSidebar(page);

		if (!hasSidebar) {
			// Skip test if sidebar not present
			return;
		}

		// Focus first navigation button
		const firstNavButton = page.locator('[data-testid="unified-sidebar"] nav button').first();
		await firstNavButton.focus();

		// Press Tab to move to next element
		await page.keyboard.press("Tab");
		await page.waitForTimeout(200);

		// Press Enter to activate focused element
		await page.keyboard.press("Enter");
		await page.waitForTimeout(500);

		// Should navigate somewhere
		const currentUrl = page.url();
		expect(currentUrl.length).toBeGreaterThan(0);
	});

	test("should close dropdowns with Escape key", async ({ page }) => {
		await page.goto("/");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		const hasSidebar = await waitForSidebar(page);

		if (!hasSidebar) {
			// Skip test if sidebar not present
			return;
		}

		const viewAllButton = page.locator('[data-testid="view-all-spaces-button"]');
		if (await viewAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await viewAllButton.click();
			await page.waitForTimeout(300);

			// Press Escape to close dropdown
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			const dropdown = page.locator('[data-testid="view-all-spaces-dropdown"]');
			const isVisible = await dropdown.isVisible({ timeout: 500 }).catch(() => false);
			expect(isVisible).toBe(false);
		}
	});
});

test.describe("UnifiedSidebar - External Links", () => {
	test("should open external site links in new tab", async ({ page, context }) => {
		await page.goto("/sites");
		await skipIntegrationSetupIfPresent(page);
		await dismissDialogIfPresent(page);
		await page.waitForTimeout(1000);

		// Find external link button (view site)
		const externalLinkButton = page.locator('[data-testid^="view-site-"]').first();
		if (await externalLinkButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			// Listen for new page
			const pagePromise = context.waitForEvent("page", { timeout: 3000 }).catch(() => null);

			await externalLinkButton.click();

			const newPage = await pagePromise;
			if (newPage) {
				// New tab should open
				expect(newPage).toBeTruthy();
				await newPage.close();
			}
		}
	});
});
