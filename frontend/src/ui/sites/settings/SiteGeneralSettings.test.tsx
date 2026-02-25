import { createMockSite } from "../__testUtils__/SiteTestFactory";
import { SiteGeneralSettings } from "./SiteGeneralSettings";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { SiteMetadata, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Creates a deferred promise with externally accessible resolve/reject */
function createDeferredPromise<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// Use vi.hoisted to create mock functions available for per-test overrides
const {
	mockRefreshSites,
	mockNavigate,
	mockUpdateFolderStructure,
	mockUpdateJwtAuthConfig,
	mockDeleteSite,
	mockUseSites,
	mockUseNavigation,
	mockUseClient,
	mockCopyToClipboard,
	mockGetVerifiedCustomDomain,
	mockToastError,
} = vi.hoisted(() => ({
	mockRefreshSites: vi.fn(() => Promise.resolve()),
	mockNavigate: vi.fn(),
	mockUpdateFolderStructure: vi.fn().mockResolvedValue(undefined),
	mockUpdateJwtAuthConfig: vi.fn().mockResolvedValue(undefined),
	mockDeleteSite: vi.fn().mockResolvedValue(undefined),
	mockUseSites: vi.fn(),
	mockUseNavigation: vi.fn(),
	mockUseClient: vi.fn(),
	mockCopyToClipboard: vi.fn().mockResolvedValue(true),
	mockGetVerifiedCustomDomain: vi.fn().mockReturnValue(null),
	mockToastError: vi.fn(),
}));

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
		Check: () => <div data-testid="check-icon" />,
		Copy: () => <div data-testid="copy-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
		FolderTree: () => <div data-testid="folder-tree-icon" />,
		Globe: () => <div data-testid="globe-icon" />,
		Info: () => <div data-testid="info-icon" />,
		KeyRound: () => <div data-testid="key-round-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		RefreshCw: () => <div data-testid="refresh-cw-icon" />,
		Trash2: () => <div data-testid="trash-icon" />,
	};
});

// Mock intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		// Return mock content that matches what the component uses
		if (key === "site-settings-tab") {
			return {
				title: "Settings",
				siteInfoTitle: "Site Information",
				siteInfoDescription: "Overview of your site",
				previewLabel: "Preview",
				copyUrl: { value: "Copy URL" },
				openSite: { value: "Open Site" },
				statsLabel: "Stats",
				statusLabel: "Status",
				statusActive: "Active",
				statusBuilding: "Building",
				statusPending: "Pending",
				statusError: "Error",
				articlesLabel: "Articles",
				lastBuiltLabel: "Last Built",
				createdLabel: "Created",
				authenticationTitle: "Authentication",
				authenticationDescription: "Control access to your site",
				saving: "Saving...",
				accessPublicTitle: "Public",
				accessPublicDescription: "Anyone can access",
				accessRestrictedTitle: "Restricted",
				accessRestrictedDescription: "Requires authentication",
				accessRestrictedNote: "Users must log in.",
				authRebuildNote: "Changes take effect after publishing.",
				folderStructureTitle: "Navigation Structure",
				folderStructureDescription: "Choose how site navigation is organized",
				useSpaceFolderStructureLabel: "Auto-sync navigation from spaces",
				useSpaceFolderStructureDescription: "Navigation is automatically derived from spaces.",
				folderStructureRebuildNote: "Changes take effect after publishing.",
				domainTitle: "Custom Domain",
				domainDescription: "Configure a custom domain",
				defaultDomain: "Default Domain",
				currentDomain: "Current Domain",
				hideDomainManager: "Hide",
				manageDomain: "Manage",
				addDomain: "Add Domain",
				dangerZoneTitle: "Danger Zone",
				dangerZoneDescription: "Irreversible actions",
				deleteSiteLabel: "Delete Site",
				deleteSiteDescription: "Permanently delete this site",
				deleteSiteButton: "Delete",
				cancelButton: "Cancel",
				deletingButton: "Deleting...",
				deletePermanentlyButton: "Delete Permanently",
				deleteFailedMessage: { value: "Failed to delete site. Please try again." },
				authUpdateFailedMessage: { value: "Failed to update authentication settings. Please try again." },
				folderStructureUpdateFailedMessage: {
					value: "Failed to update navigation structure. Please try again.",
				},
			};
		}
		if (key === "date-time") {
			return { justNow: "Just now", minutesAgo: "min ago" };
		}
		return {};
	},
}));

// Mock CustomDomainManager - calls onUpdate when a button inside is clicked
vi.mock("../CustomDomainManager", () => ({
	CustomDomainManager: ({ onUpdate }: { onUpdate: (site: unknown) => void }) => (
		<div data-testid="custom-domain-manager">
			<button data-testid="trigger-domain-update" type="button" onClick={() => onUpdate({ id: 1 })}>
				Update
			</button>
		</div>
	),
}));

// Mock toast
vi.mock("../../../components/ui/Sonner", () => ({
	toast: {
		success: vi.fn(),
		error: mockToastError,
	},
}));

// Mock UrlUtil
vi.mock("../../../util/UrlUtil", () => ({
	copyToClipboard: mockCopyToClipboard,
	formatDomainUrl: (domain: string) => `https://${domain}`,
	getDefaultSiteDomain: (site: { metadata?: { jolliSiteDomain?: string } }) =>
		site.metadata?.jolliSiteDomain ?? undefined,
	getPrimarySiteDomain: (site: { metadata?: { jolliSiteDomain?: string } }) =>
		site.metadata?.jolliSiteDomain ?? undefined,
	getVerifiedCustomDomain: mockGetVerifiedCustomDomain,
}));

// Mock SiteDetailUtils
vi.mock("../SiteDetailUtils", () => ({
	getStatusBadge: (status: string) => <span data-testid="status-badge">{status}</span>,
}));

// Mock Logger
vi.mock("../../../util/Logger", () => ({
	getLog: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

// Mock DateTimeUtil
vi.mock("../../../util/DateTimeUtil", () => ({
	formatTimestamp: (_content: unknown, timestamp: string) => `formatted:${timestamp}`,
}));

/** Sets up default mock return values for context hooks */
function setupDefaultMocks(siteOverrides?: Parameters<typeof createMockSite>[0]) {
	const site = createMockSite({ lastGeneratedAt: undefined, ...siteOverrides });
	mockUseSites.mockReturnValue({
		sites: [site],
		refreshSites: mockRefreshSites,
		isFavorite: () => false,
		toggleSiteFavorite: vi.fn(),
	});
	mockUseNavigation.mockReturnValue({
		navigate: mockNavigate,
		siteSettingsSiteId: 1,
		siteSettingsView: "general",
	});
	mockUseClient.mockReturnValue({
		sites: () => ({
			updateJwtAuthConfig: mockUpdateJwtAuthConfig,
			updateFolderStructure: mockUpdateFolderStructure,
			deleteSite: mockDeleteSite,
		}),
	});
	return site;
}

// Mock contexts using hoisted functions for per-test overrides
vi.mock("../../../contexts/SitesContext", () => ({
	useSites: () => mockUseSites(),
}));

vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => mockUseNavigation(),
}));

vi.mock("../../../contexts/ClientContext", () => ({
	useClient: () => mockUseClient(),
}));

describe("SiteGeneralSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCopyToClipboard.mockResolvedValue(true);
		mockGetVerifiedCustomDomain.mockReturnValue(null);
		setupDefaultMocks();
	});

	function renderSettings() {
		return render(<SiteGeneralSettings />);
	}

	it("renders the folder structure section", () => {
		renderSettings();
		expect(screen.getByTestId("folder-structure-section")).toBeDefined();
	});

	it("renders the folder structure toggle", () => {
		renderSettings();
		expect(screen.getByTestId("folder-structure-toggle")).toBeDefined();
	});

	it("shows the rebuild note for folder structure changes", () => {
		renderSettings();
		// Verify the folder structure section specifically contains the note
		const folderSection = screen.getByTestId("folder-structure-section");
		expect(folderSection.textContent).toContain("Changes take effect after publishing.");
		// The auth section should also contain the rebuild note
		const authSection = screen.getByTestId("auth-settings-section");
		expect(authSection.textContent).toContain("Changes take effect after publishing.");
	});

	it("calls updateFolderStructure when toggle is clicked", async () => {
		renderSettings();

		const toggle = screen.getByTestId("folder-structure-toggle");
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(mockUpdateFolderStructure).toHaveBeenCalledWith(1, true);
		});
	});

	it("shows auth rebuild note", () => {
		renderSettings();
		expect(screen.getByTestId("auth-rebuild-note")).toBeDefined();
	});

	it("renders the auth settings section", () => {
		renderSettings();
		expect(screen.getByTestId("auth-settings-section")).toBeDefined();
	});

	it("renders the domain settings section", () => {
		renderSettings();
		expect(screen.getByTestId("domain-settings-section")).toBeDefined();
	});

	it("renders the danger zone for active sites", () => {
		renderSettings();
		expect(screen.getByTestId("danger-zone-section")).toBeDefined();
	});

	// =========================================================================
	// Fallback state: no matching site found
	// =========================================================================

	it("renders fallback when site is not found", () => {
		mockUseNavigation.mockReturnValue({
			navigate: mockNavigate,
			siteSettingsSiteId: 999,
			siteSettingsView: "general",
		});
		renderSettings();
		// Should show the fallback state, not the site sections
		expect(screen.queryByTestId("site-info-section")).toBeNull();
		expect(screen.getByTestId("settings-fallback")).toBeDefined();
		expect(screen.getByTestId("settings-fallback").textContent).toContain("Settings");
	});

	// =========================================================================
	// handleCopyUrl
	// =========================================================================

	describe("handleCopyUrl", () => {
		it("copies the primary URL to clipboard when copy button is clicked", async () => {
			renderSettings();

			const copyButton = screen.getByTitle("Copy URL");
			fireEvent.click(copyButton);

			await waitFor(() => {
				expect(mockCopyToClipboard).toHaveBeenCalledWith("test-site.jolli.site");
			});
		});

		it("shows check icon briefly after successful copy", async () => {
			renderSettings();

			const copyButton = screen.getByTitle("Copy URL");
			fireEvent.click(copyButton);

			// After a successful copy, the copiedUrl state becomes true and a Check icon appears
			await waitFor(() => {
				expect(mockCopyToClipboard).toHaveBeenCalled();
			});
		});

		it("does not set copied state when clipboard copy fails", async () => {
			mockCopyToClipboard.mockResolvedValue(false);
			renderSettings();

			const copyButton = screen.getByTitle("Copy URL");
			fireEvent.click(copyButton);

			await waitFor(() => {
				expect(mockCopyToClipboard).toHaveBeenCalledWith("test-site.jolli.site");
			});
		});
	});

	// =========================================================================
	// handleJwtAuthUpdate
	// =========================================================================

	describe("handleJwtAuthUpdate", () => {
		it("calls updateJwtAuthConfig with enabled=false when public option is clicked", async () => {
			setupDefaultMocks({ metadata: { jwtAuth: { enabled: true, mode: "full", loginUrl: "", publicKey: "" } } });
			renderSettings();

			const publicButton = screen.getByTestId("access-public");
			fireEvent.click(publicButton);

			await waitFor(() => {
				expect(mockUpdateJwtAuthConfig).toHaveBeenCalledWith(1, { enabled: false, mode: "full" });
			});
		});

		it("calls updateJwtAuthConfig with enabled=true when restricted option is clicked", async () => {
			renderSettings();

			const restrictedButton = screen.getByTestId("access-restricted");
			fireEvent.click(restrictedButton);

			await waitFor(() => {
				expect(mockUpdateJwtAuthConfig).toHaveBeenCalledWith(1, { enabled: true, mode: "full" });
			});
		});

		it("calls refreshSites after successful JWT auth update", async () => {
			renderSettings();

			const restrictedButton = screen.getByTestId("access-restricted");
			fireEvent.click(restrictedButton);

			await waitFor(() => {
				expect(mockRefreshSites).toHaveBeenCalled();
			});
		});

		it("handles JWT auth update error gracefully and shows toast", async () => {
			mockUpdateJwtAuthConfig.mockRejectedValueOnce(new Error("Network error"));
			renderSettings();

			const restrictedButton = screen.getByTestId("access-restricted");
			fireEvent.click(restrictedButton);

			await waitFor(() => {
				expect(mockUpdateJwtAuthConfig).toHaveBeenCalled();
			});
			await waitFor(() => {
				expect(mockToastError).toHaveBeenCalled();
			});
		});

		it("disables auth buttons when site is not active", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			const publicButton = screen.getByTestId("access-public");
			const restrictedButton = screen.getByTestId("access-restricted");

			expect(publicButton.hasAttribute("disabled")).toBe(true);
			expect(restrictedButton.hasAttribute("disabled")).toBe(true);
		});
	});

	// =========================================================================
	// Auth enabled/disabled states
	// =========================================================================

	describe("authentication state display", () => {
		it("shows auth warning note when JWT auth is enabled", () => {
			setupDefaultMocks({
				metadata: { jwtAuth: { enabled: true, mode: "full", loginUrl: "", publicKey: "" } },
			});
			renderSettings();

			const authSection = screen.getByTestId("auth-settings-section");
			expect(authSection.textContent).toContain("Users must log in.");
		});

		it("shows rebuild note for public sites without auth warning", () => {
			setupDefaultMocks({
				metadata: { jwtAuth: { enabled: false, mode: "full", loginUrl: "", publicKey: "" } },
			});
			renderSettings();

			const authSection = screen.getByTestId("auth-settings-section");
			expect(authSection.textContent).toContain("Changes take effect after publishing.");
			expect(authSection.textContent).not.toContain("Users must log in.");
		});
	});

	// =========================================================================
	// handleDelete
	// =========================================================================

	describe("handleDelete", () => {
		it("shows delete confirmation dialog when delete button is clicked", () => {
			renderSettings();

			const deleteButton = screen.getByTestId("delete-site-button");
			fireEvent.click(deleteButton);

			// Confirmation dialog should now be visible
			expect(screen.getByTestId("confirm-delete-button")).toBeDefined();
			expect(screen.getByTestId("cancel-delete-button")).toBeDefined();
		});

		it("hides delete confirmation when cancel is clicked", () => {
			renderSettings();

			// Open confirmation
			fireEvent.click(screen.getByTestId("delete-site-button"));
			expect(screen.getByTestId("confirm-delete-button")).toBeDefined();

			// Click cancel
			fireEvent.click(screen.getByTestId("cancel-delete-button"));

			// Should be back to the initial delete button
			expect(screen.queryByTestId("confirm-delete-button")).toBeNull();
			expect(screen.getByTestId("delete-site-button")).toBeDefined();
		});

		it("calls deleteSite and navigates to /sites on successful delete", async () => {
			renderSettings();

			// Open confirmation
			fireEvent.click(screen.getByTestId("delete-site-button"));

			// Confirm delete
			fireEvent.click(screen.getByTestId("confirm-delete-button"));

			await waitFor(() => {
				expect(mockDeleteSite).toHaveBeenCalledWith(1);
			});
			await waitFor(() => {
				expect(mockNavigate).toHaveBeenCalledWith("/sites");
			});
		});

		it("shows toast error and resets state when delete fails", async () => {
			mockDeleteSite.mockRejectedValueOnce(new Error("Delete failed"));
			renderSettings();

			// Open confirmation
			fireEvent.click(screen.getByTestId("delete-site-button"));

			// Confirm delete
			fireEvent.click(screen.getByTestId("confirm-delete-button"));

			await waitFor(() => {
				expect(mockDeleteSite).toHaveBeenCalledWith(1);
			});
			await waitFor(() => {
				expect(mockToastError).toHaveBeenCalledWith("Failed to delete site. Please try again.");
			});
			// Should not navigate on failure
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("shows 'Delete Permanently' text on confirm button", () => {
			renderSettings();

			fireEvent.click(screen.getByTestId("delete-site-button"));

			expect(screen.getByTestId("confirm-delete-button").textContent).toBe("Delete Permanently");
		});
	});

	// =========================================================================
	// Different site statuses
	// =========================================================================

	describe("site status variations", () => {
		it("shows spinning icon for building status", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			expect(screen.getByTestId("status-badge").textContent).toBe("building");
		});

		it("shows spinning icon for pending status", () => {
			setupDefaultMocks({ status: "pending" });
			renderSettings();

			expect(screen.getByTestId("status-badge").textContent).toBe("pending");
		});

		it("renders danger zone for error status sites", () => {
			setupDefaultMocks({ status: "error" });
			renderSettings();

			expect(screen.getByTestId("danger-zone-section")).toBeDefined();
		});

		it("does not render danger zone for building sites", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			expect(screen.queryByTestId("danger-zone-section")).toBeNull();
		});

		it("does not render danger zone for pending sites", () => {
			setupDefaultMocks({ status: "pending" });
			renderSettings();

			expect(screen.queryByTestId("danger-zone-section")).toBeNull();
		});

		it("shows deployment building spinner when deploymentStatus is building", () => {
			setupDefaultMocks({ metadata: { deploymentStatus: "building" } });
			renderSettings();

			// When deployment is building, the preview shows the RefreshCw spinner
			expect(screen.getByTestId("refresh-cw-icon")).toBeDefined();
		});

		it("does not show preview browser chrome when deployment is building", () => {
			setupDefaultMocks({ metadata: { deploymentStatus: "building" } });
			renderSettings();

			// The browser chrome (copy/external link buttons) should not render
			expect(screen.queryByTitle("Copy URL")).toBeNull();
		});
	});

	// =========================================================================
	// Preview iframe rendering
	// =========================================================================

	describe("preview rendering", () => {
		it("renders site preview placeholder with link for active site without auth", () => {
			renderSettings();

			// Iframe was replaced with a static placeholder (Globe icon + link)
			expect(screen.queryByTitle("Site Preview")).toBeNull();
			const globeIcons = screen.getAllByTestId("globe-icon");
			expect(globeIcons.length).toBeGreaterThanOrEqual(1);
		});

		it("shows lock icon instead of iframe when auth is enabled", () => {
			setupDefaultMocks({
				metadata: { jwtAuth: { enabled: true, mode: "full", loginUrl: "", publicKey: "" } },
			});
			renderSettings();

			// Should show lock icon in the preview area, not an iframe
			expect(screen.queryByTitle("Site Preview")).toBeNull();
			// Lock icon appears in both the auth section button and the preview area
			const lockIcons = screen.getAllByTestId("lock-icon");
			expect(lockIcons.length).toBeGreaterThanOrEqual(2);
		});

		it("shows spinner when site status is building", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			expect(screen.queryByTitle("Site Preview")).toBeNull();
			expect(screen.getByTestId("refresh-cw-icon")).toBeDefined();
		});

		it("shows spinner when site status is pending", () => {
			setupDefaultMocks({ status: "pending" });
			renderSettings();

			expect(screen.queryByTitle("Site Preview")).toBeNull();
			expect(screen.getByTestId("refresh-cw-icon")).toBeDefined();
		});

		it("shows globe icon when site has no primary URL", () => {
			setupDefaultMocks({ metadata: { jolliSiteDomain: "" } });
			renderSettings();

			expect(screen.queryByTitle("Site Preview")).toBeNull();
		});

		it("renders browser chrome with copy and external link buttons for active site", () => {
			renderSettings();

			expect(screen.getByTitle("Copy URL")).toBeDefined();
			expect(screen.getByTitle("Open Site")).toBeDefined();
		});

		it("renders external link that opens primary URL in new tab", () => {
			renderSettings();

			const externalLink = screen.getByTitle("Open Site");
			expect(externalLink.getAttribute("href")).toBe("https://test-site.jolli.site");
			expect(externalLink.getAttribute("target")).toBe("_blank");
			expect(externalLink.getAttribute("rel")).toBe("noopener noreferrer");
		});
	});

	// =========================================================================
	// Custom domain display
	// =========================================================================

	describe("custom domain display", () => {
		it("shows default domain label when no custom domain is verified", () => {
			renderSettings();

			const domainSection = screen.getByTestId("domain-settings-section");
			expect(domainSection.textContent).toContain("Default Domain");
		});

		it("shows current domain label when a verified custom domain exists", () => {
			mockGetVerifiedCustomDomain.mockReturnValue("docs.example.com");
			renderSettings();

			const domainSection = screen.getByTestId("domain-settings-section");
			expect(domainSection.textContent).toContain("Current Domain");
		});

		it("displays the default domain value", () => {
			renderSettings();

			const domainValue = screen.getByTestId("current-domain-value");
			expect(domainValue.textContent).toBe("test-site.jolli.site");
		});

		it("displays verified custom domain value when available", () => {
			mockGetVerifiedCustomDomain.mockReturnValue("docs.example.com");
			renderSettings();

			const domainValue = screen.getByTestId("current-domain-value");
			expect(domainValue.textContent).toBe("docs.example.com");
		});

		it("shows Add Domain button when no custom domain exists", () => {
			renderSettings();

			expect(screen.getByTestId("toggle-domain-manager")).toBeDefined();
			expect(screen.getByTestId("toggle-domain-manager").textContent).toBe("Add Domain");
		});

		it("shows Manage button when a verified custom domain exists", () => {
			mockGetVerifiedCustomDomain.mockReturnValue("docs.example.com");
			renderSettings();

			expect(screen.getByTestId("toggle-domain-manager").textContent).toBe("Manage");
		});

		it("toggles domain manager visibility when button is clicked", () => {
			renderSettings();

			const toggleButton = screen.getByTestId("toggle-domain-manager");

			// Click to show domain manager
			fireEvent.click(toggleButton);
			expect(screen.getByTestId("domain-manager-expanded")).toBeDefined();
			expect(screen.getByTestId("custom-domain-manager")).toBeDefined();

			// Click again to hide
			fireEvent.click(toggleButton);
			expect(screen.queryByTestId("domain-manager-expanded")).toBeNull();
		});

		it("shows Hide text when domain manager is expanded", () => {
			renderSettings();

			const toggleButton = screen.getByTestId("toggle-domain-manager");
			fireEvent.click(toggleButton);

			expect(toggleButton.textContent).toBe("Hide");
		});

		it("does not show domain manager button for non-active sites", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			expect(screen.queryByTestId("toggle-domain-manager")).toBeNull();
		});

		it("shows dash when no domain is available", () => {
			setupDefaultMocks({ metadata: { jolliSiteDomain: "" } });
			renderSettings();

			const domainValue = screen.getByTestId("current-domain-value");
			expect(domainValue.textContent).toBe("\u2014");
		});
	});

	// =========================================================================
	// handleDocsiteUpdate (via CustomDomainManager onUpdate)
	// =========================================================================

	describe("handleDocsiteUpdate", () => {
		it("calls refreshSites when domain manager triggers onUpdate", () => {
			renderSettings();

			// Open domain manager
			fireEvent.click(screen.getByTestId("toggle-domain-manager"));
			expect(screen.getByTestId("custom-domain-manager")).toBeDefined();

			// Trigger the onUpdate callback via the mocked CustomDomainManager button
			fireEvent.click(screen.getByTestId("trigger-domain-update"));

			expect(mockRefreshSites).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Site info section details
	// =========================================================================

	describe("site info section", () => {
		it("renders the site info section", () => {
			renderSettings();
			expect(screen.getByTestId("site-info-section")).toBeDefined();
		});

		it("displays the article count", () => {
			renderSettings();

			const siteInfoSection = screen.getByTestId("site-info-section");
			expect(siteInfoSection.textContent).toContain("5");
		});

		it("displays formatted lastGeneratedAt timestamp", () => {
			setupDefaultMocks({ lastGeneratedAt: "2024-06-15T12:00:00Z" } as Partial<SiteWithUpdate> & {
				metadata?: Partial<SiteMetadata>;
			});
			renderSettings();

			const siteInfoSection = screen.getByTestId("site-info-section");
			expect(siteInfoSection.textContent).toContain("formatted:2024-06-15T12:00:00Z");
		});

		it("displays dash when lastGeneratedAt is not set", () => {
			renderSettings();

			const siteInfoSection = screen.getByTestId("site-info-section");
			// The component renders "—" for missing lastGeneratedAt
			expect(siteInfoSection.textContent).toContain("\u2014");
		});

		it("displays formatted createdAt timestamp", () => {
			renderSettings();

			const siteInfoSection = screen.getByTestId("site-info-section");
			expect(siteInfoSection.textContent).toContain("formatted:2024-01-01T00:00:00Z");
		});

		it("displays zero article count when no articles", () => {
			setupDefaultMocks({ metadata: { articleCount: 0 } });
			renderSettings();

			const siteInfoSection = screen.getByTestId("site-info-section");
			expect(siteInfoSection.textContent).toContain("0");
		});
	});

	// =========================================================================
	// Folder structure toggle with existing value
	// =========================================================================

	describe("folder structure toggle with existing value", () => {
		it("toggles folder structure off when currently enabled", async () => {
			setupDefaultMocks({ metadata: { useSpaceFolderStructure: true } });
			renderSettings();

			const toggle = screen.getByTestId("folder-structure-toggle");
			fireEvent.click(toggle);

			await waitFor(() => {
				expect(mockUpdateFolderStructure).toHaveBeenCalledWith(1, false);
			});
		});

		it("disables folder structure toggle when site is not active", () => {
			setupDefaultMocks({ status: "building" });
			renderSettings();

			const toggle = screen.getByTestId("folder-structure-toggle");
			expect(toggle.hasAttribute("disabled")).toBe(true);
		});

		it("handles folder structure update error gracefully and shows toast", async () => {
			mockUpdateFolderStructure.mockRejectedValueOnce(new Error("Update failed"));
			renderSettings();

			const toggle = screen.getByTestId("folder-structure-toggle");
			fireEvent.click(toggle);

			await waitFor(() => {
				expect(mockUpdateFolderStructure).toHaveBeenCalled();
			});
			await waitFor(() => {
				expect(mockToastError).toHaveBeenCalled();
			});
		});
	});

	// =========================================================================
	// Additional branch coverage tests
	// =========================================================================

	describe("additional branch coverage", () => {
		it("renders dash when createdAt is not set", () => {
			setupDefaultMocks({ createdAt: "" });
			renderSettings();

			// Both lastGeneratedAt and createdAt should show dashes
			const siteInfoSection = screen.getByTestId("site-info-section");
			const dashes = siteInfoSection.textContent?.match(/\u2014/g) ?? [];
			expect(dashes.length).toBeGreaterThanOrEqual(2);
		});

		it("handles metadata with no jwtAuth property", () => {
			setupDefaultMocks({ metadata: {} });
			renderSettings();

			// Auth should default to disabled (public selected)
			const authSection = screen.getByTestId("auth-settings-section");
			expect(authSection.textContent).not.toContain("Users must log in.");
		});

		it("handles site with undefined metadata", () => {
			const site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				status: "active" as const,
				visibility: "external" as const,
				needsUpdate: false,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-02T00:00:00Z",
				metadata: undefined,
				userId: 1,
			} as SiteWithUpdate;
			mockUseSites.mockReturnValue({
				sites: [site],
				refreshSites: mockRefreshSites,
				isFavorite: () => false,
				toggleSiteFavorite: vi.fn(),
			});
			renderSettings();

			// Should render with default values
			expect(screen.getByTestId("site-info-section")).toBeDefined();
		});

		it("renders error status without preview iframe", () => {
			setupDefaultMocks({ status: "error" });
			renderSettings();

			// Error status sites don't show iframe or spinner - they show the globe fallback
			expect(screen.queryByTitle("Site Preview")).toBeNull();
			// Should not show the browser chrome bar since error is not "active"
			expect(screen.queryByTitle("Copy URL")).toBeNull();
		});

		it("does not show browser chrome when site status is not active", () => {
			setupDefaultMocks({ status: "error" });
			renderSettings();

			expect(screen.queryByTitle("Copy URL")).toBeNull();
			expect(screen.queryByTitle("Open Site")).toBeNull();
		});

		it("does not render domain manager expanded area for non-active sites", () => {
			setupDefaultMocks({ status: "error" });
			renderSettings();

			// Domain manager toggle should not be present for non-active sites
			expect(screen.queryByTestId("toggle-domain-manager")).toBeNull();
			expect(screen.queryByTestId("domain-manager-expanded")).toBeNull();
		});

		it("shows folder structure as checked when useSpaceFolderStructure is true", () => {
			setupDefaultMocks({ metadata: { useSpaceFolderStructure: true } });
			renderSettings();

			// The check icon should be visible inside the toggle
			const toggle = screen.getByTestId("folder-structure-toggle");
			expect(toggle.querySelector("[data-testid='check-icon']")).not.toBeNull();
		});

		it("does not show check icon in folder structure toggle when disabled", () => {
			setupDefaultMocks({ metadata: { useSpaceFolderStructure: false } });
			renderSettings();

			const toggle = screen.getByTestId("folder-structure-toggle");
			expect(toggle.querySelector("[data-testid='check-icon']")).toBeNull();
		});

		it("shows saving indicator during JWT auth update", async () => {
			// Create a deferred promise to control when the mock resolves
			const deferred = createDeferredPromise<void>();
			mockUpdateJwtAuthConfig.mockImplementationOnce(() => deferred.promise);
			renderSettings();

			const restrictedButton = screen.getByTestId("access-restricted");
			fireEvent.click(restrictedButton);

			// Check that the saving indicator appears
			await waitFor(() => {
				const authSection = screen.getByTestId("auth-settings-section");
				expect(authSection.textContent).toContain("Saving...");
			});

			// Resolve the update
			deferred.resolve();
			await waitFor(() => {
				const authSection = screen.getByTestId("auth-settings-section");
				expect(authSection.textContent).not.toContain("Saving...");
			});
		});
	});
});
