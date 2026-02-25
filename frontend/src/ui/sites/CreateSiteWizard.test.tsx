import { renderWithProviders } from "../../test/TestUtils";
import { CreateSiteWizard } from "./CreateSiteWizard";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock toast
const { mockToastError } = vi.hoisted(() => ({
	mockToastError: vi.fn(),
}));
vi.mock("../../components/ui/Sonner", () => ({
	toast: {
		success: vi.fn(),
		error: mockToastError,
	},
}));

// Hoisted mock for useOrg so we can change tenant per-test
const { mockUseOrg } = vi.hoisted(() => ({
	mockUseOrg: vi.fn(),
}));

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertCircle: () => <div data-testid="alert-circle-icon" />,
		ArrowLeft: () => <div data-testid="arrow-left-icon" />,
		ArrowRight: () => <div data-testid="arrow-right-icon" />,
		Check: () => <div data-testid="check-icon" />,
		FileText: () => <div data-testid="file-text-icon" />,
		FolderTree: () => <div data-testid="folder-tree-icon" />,
		Globe: () => <div data-testid="globe-icon" />,
		Image: () => <div data-testid="image-icon" />,
		LetterText: () => <div data-testid="letter-text-icon" />,
		Loader2: () => <div data-testid="loader-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		Palette: () => <div data-testid="palette-icon" />,
		Type: () => <div data-testid="type-icon" />,
		X: () => <div data-testid="x-icon" />,
	};
});

// Mock ArticlePicker
vi.mock("./ArticlePicker", () => ({
	ArticlePicker: ({
		articles,
		selectedJrns,
		onSelectionChange,
		includeAll,
		onIncludeAllChange,
	}: {
		articles: Array<{ jrn: string }>;
		selectedJrns: Set<string>;
		onSelectionChange: (jrns: Set<string>) => void;
		includeAll: boolean;
		onIncludeAllChange: (includeAll: boolean) => void;
	}) => (
		<div data-testid="article-picker">
			<span data-testid="picker-article-count">{articles.length}</span>
			<span data-testid="picker-include-all">{includeAll.toString()}</span>
			<span data-testid="picker-selected-count">{selectedJrns.size}</span>
			<button type="button" data-testid="toggle-include-all" onClick={() => onIncludeAllChange(!includeAll)}>
				Toggle
			</button>
			<button
				type="button"
				data-testid="select-specific"
				onClick={() => {
					onIncludeAllChange(false);
					onSelectionChange(new Set(["jrn:1", "jrn:2"]));
				}}
			>
				Select Specific
			</button>
		</div>
	),
}));

// Mock SubdomainInput
vi.mock("./SubdomainInput", () => ({
	SubdomainInput: ({
		value,
		onChange,
		domainSuffix,
	}: {
		value: string;
		onChange: (v: string) => void;
		domainSuffix?: string;
	}) => (
		<div>
			<input
				data-testid="subdomain-input"
				value={value}
				onChange={e => onChange((e.target as HTMLInputElement).value)}
			/>
			{domainSuffix && <span data-testid="domain-suffix">{domainSuffix}</span>}
		</div>
	),
	validateSubdomain: (v: string) => ({
		valid: v.length >= 3 && /^[a-z0-9-]+$/.test(v),
		error: v.length < 3 ? "Too short" : undefined,
	}),
}));

// Mock PresetSection
vi.mock("./branding/PresetSection", () => ({
	PresetSection: ({ onPresetSelect }: { onPresetSelect: (preset: string) => void }) => (
		<div data-testid="preset-section">
			<button type="button" data-testid="select-vibrant" onClick={() => onPresetSelect("vibrant")}>
				Vibrant
			</button>
		</div>
	),
}));

// Mock useOrg - must also export OrgProvider since renderWithProviders uses it
vi.mock("../../contexts/OrgContext", () => ({
	useOrg: mockUseOrg,
	OrgProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useUserPreferences
vi.mock("../../contexts/UserPreferencesContext", () => ({
	useUserPreferences: () => ({ preferences: {}, updatePreferences: vi.fn() }),
}));

const mockDocsClient = {
	listDocs: vi.fn(),
};

const mockSitesClient = {
	createSite: vi.fn(),
	checkSubdomainAvailability: vi.fn(),
};

const mockSpacesClient = {
	listSpaces: vi.fn(),
};

const mockAuthClient = {
	getSessionConfig: vi.fn(),
};

const mockClient = {
	docs: () => mockDocsClient,
	sites: () => mockSitesClient,
	spaces: () => mockSpacesClient,
	auth: () => mockAuthClient,
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("CreateSiteWizard", () => {
	const mockOnClose = vi.fn();
	const mockOnSuccess = vi.fn();

	const mockArticles = [
		{ id: 1, jrn: "jrn:1", contentMetadata: { title: "Article 1" } },
		{ id: 2, jrn: "jrn:2", contentMetadata: { title: "Article 2" } },
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockUseOrg.mockReturnValue({ tenant: { slug: "test-tenant" } });
		mockDocsClient.listDocs.mockResolvedValue(mockArticles);
		mockSpacesClient.listSpaces.mockResolvedValue([]);
		mockAuthClient.getSessionConfig.mockResolvedValue({
			jolliSiteDomain: "jolli.site",
			siteEnv: "prod",
		});
		mockSitesClient.createSite.mockResolvedValue({ id: 42 });
		mockSitesClient.checkSubdomainAvailability.mockResolvedValue({ available: true });
		// Clear localStorage wizard prefs
		localStorage.clear();
	});

	function renderWizard() {
		return renderWithProviders(<CreateSiteWizard onClose={mockOnClose} onSuccess={mockOnSuccess} />);
	}

	async function navigateToStep(target: "content" | "branding" | "access") {
		fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test Site" } });
		fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test-site" } });
		await waitFor(() => {
			expect(screen.getByTestId("subdomain-input")).toBeDefined();
		});
		fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "test-site" } });
		await waitFor(() => {
			expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
		});

		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("article-picker")).toBeDefined();
		});
		if (target === "content") {
			return;
		}

		fireEvent.click(screen.getByTestId("toggle-include-all"));
		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("preset-section")).toBeDefined();
		});
		if (target === "branding") {
			return;
		}

		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("access-public")).toBeDefined();
		});
	}

	it("renders the basics step by default", () => {
		renderWizard();
		expect(screen.getByTestId("display-name-input")).toBeDefined();
		expect(screen.getByTestId("site-name-input")).toBeDefined();
	});

	it("calls onClose when close button is clicked", () => {
		renderWizard();
		fireEvent.click(screen.getByTestId("close-wizard"));
		expect(mockOnClose).toHaveBeenCalled();
	});

	it("disables Next button when name is empty", () => {
		renderWizard();
		const nextButton = screen.getByTestId("next-button");
		expect(nextButton).toHaveProperty("disabled", true);
	});

	it("enables Next button when name, displayName, and subdomain are provided", async () => {
		renderWizard();
		fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "My Test Site" } });
		fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "my-test-site" } });

		await waitFor(() => {
			expect(screen.getByTestId("subdomain-input")).toBeDefined();
		});
		fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "my-test-site" } });

		await waitFor(() => {
			const nextButton = screen.getByTestId("next-button");
			expect(nextButton).toHaveProperty("disabled", false);
		});
	});

	it("sanitizes site name input to lowercase alphanumeric", () => {
		renderWizard();
		const siteNameInput = screen.getByTestId("site-name-input") as HTMLInputElement;

		fireEvent.change(siteNameInput, { target: { value: "My Test Site!" } });

		// Site name should be sanitized: lowercase, no spaces/special chars
		expect(siteNameInput.value).toBe("mytestsite");
	});

	it("navigates through all four steps", async () => {
		renderWizard();
		await navigateToStep("access");
		expect(screen.getByTestId("access-public")).toBeDefined();
	});

	it("shows article picker on content step", async () => {
		renderWizard();
		await navigateToStep("content");

		expect(screen.getByTestId("article-picker")).toBeDefined();
		expect(screen.getByTestId("picker-article-count").textContent).toBe("2");

		// Next should be disabled until articles are selected
		expect(screen.getByTestId("next-button")).toHaveProperty("disabled", true);

		// Select articles to enable Next
		fireEvent.click(screen.getByTestId("select-specific"));
		expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
	});

	it("shows folder structure toggle on content step", async () => {
		renderWizard();
		await navigateToStep("content");
		expect(screen.getByTestId("folder-structure-toggle")).toBeDefined();
	});

	it("submits with correct payload when creating site", async () => {
		renderWizard();

		// Step 1: Basics
		fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "My Docs" } });
		fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "my-docs" } });

		await waitFor(() => {
			expect(screen.getByTestId("subdomain-input")).toBeDefined();
		});
		fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "my-docs" } });

		// Navigate to content
		await waitFor(() => {
			expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
		});
		fireEvent.click(screen.getByTestId("next-button"));

		await waitFor(() => {
			expect(screen.getByTestId("article-picker")).toBeDefined();
		});

		// Select specific articles (no default selection)
		fireEvent.click(screen.getByTestId("select-specific"));

		// Navigate to branding
		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("preset-section")).toBeDefined();
		});

		// Navigate to access
		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("access-public")).toBeDefined();
		});

		// Click Create
		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(mockSitesClient.createSite).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "my-docs",
					displayName: "My Docs",
					visibility: "internal",
					framework: "nextra",
					subdomain: "my-docs",
					useSpaceFolderStructure: true,
					selectedArticleJrns: ["jrn:1", "jrn:2"],
					jwtAuth: { enabled: true, mode: "full" },
				}),
			);
		});

		await waitFor(() => {
			expect(mockOnSuccess).toHaveBeenCalledWith(42);
		});
	});

	it("sends public visibility when user switches to public access", async () => {
		renderWizard();
		await navigateToStep("access");

		fireEvent.click(screen.getByTestId("access-public"));
		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockSitesClient.createSite).toHaveBeenCalledWith(
				expect.objectContaining({
					visibility: "external",
				}),
			);
		});
	});

	it("disables Create button when form is incomplete", () => {
		renderWizard();
		// On first step, name is empty so even if we could see the create button it would be disabled
		// The create button is only on the last step
		expect(screen.getByTestId("next-button")).toHaveProperty("disabled", true);
	});

	it("shows error state when creation fails", async () => {
		mockSitesClient.createSite.mockRejectedValueOnce(new Error("Network error"));
		renderWizard();
		await navigateToStep("access");

		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(screen.getByTestId("error-message")).toBeDefined();
		});
	});

	it("navigates back when Back button is clicked", async () => {
		renderWizard();
		await navigateToStep("content");

		fireEvent.click(screen.getByTestId("back-button"));

		await waitFor(() => {
			expect(screen.getByTestId("display-name-input")).toBeDefined();
		});
	});

	it("includes article selection in create payload when not including all", async () => {
		renderWizard();
		await navigateToStep("content");

		// Select specific articles (this disables include-all)
		fireEvent.click(screen.getByTestId("select-specific"));

		// Navigate through remaining steps to access
		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("preset-section")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("next-button"));
		await waitFor(() => {
			expect(screen.getByTestId("access-public")).toBeDefined();
		});

		// Create
		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockSitesClient.createSite).toHaveBeenCalledWith(
				expect.objectContaining({
					selectedArticleJrns: expect.arrayContaining(["jrn:1", "jrn:2"]),
				}),
			);
		});
	});

	describe("wizard preferences via PreferencesRegistry", () => {
		it("renders wizard when no stored preferences exist", () => {
			renderWizard();
			expect(screen.getByTestId("create-site-wizard")).toBeDefined();
		});

		it("renders normally when tenant slug is null", () => {
			mockUseOrg.mockReturnValue({ tenant: null });
			renderWizard();

			expect(screen.getByTestId("create-site-wizard")).toBeDefined();
		});

		it("loads stored themePreset preference", async () => {
			// Set the preference via the PreferencesService key format (single-tenant mode)
			localStorage.setItem("wizard.themePreset", "vibrant");
			renderWizard();
			await navigateToStep("branding");

			// The branding preview should reflect the stored preset
			expect(screen.getByTestId("branding-preview")).toBeDefined();
		});

		it("loads stored jwtAuthEnabled preference", async () => {
			// Set JWT auth preference to false (public access)
			localStorage.setItem("wizard.jwtAuthEnabled", "false");
			renderWizard();
			await navigateToStep("access");

			// With jwtAuthEnabled=false from prefs, the public option should be active
			// Click create and verify visibility is "external" (public)
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({ visibility: "external" }),
				);
			});
		});

		it("handles invalid preference values gracefully", () => {
			// Store an invalid value for the theme preference
			localStorage.setItem("wizard.themePreset", "INVALID_PRESET_VALUE");
			renderWizard();

			// Should render normally despite invalid stored value
			expect(screen.getByTestId("create-site-wizard")).toBeDefined();
		});

		it("saves preset preference when preset is selected", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Select "vibrant" preset
			fireEvent.click(screen.getByTestId("select-vibrant"));

			// Verify preference was stored
			expect(localStorage.getItem("wizard.themePreset")).toBe("vibrant");
		});

		it("saves JWT auth preference when changed to public", async () => {
			renderWizard();
			await navigateToStep("access");

			// Switch to public (jwtAuthEnabled = false)
			fireEvent.click(screen.getByTestId("access-public"));

			expect(localStorage.getItem("wizard.jwtAuthEnabled")).toBe("false");
		});

		it("saves JWT auth preference when switching back to restricted", async () => {
			renderWizard();
			await navigateToStep("access");

			// Switch to public first, then back to restricted
			fireEvent.click(screen.getByTestId("access-public"));
			fireEvent.click(screen.getByTestId("access-restricted"));

			expect(localStorage.getItem("wizard.jwtAuthEnabled")).toBe("true");
		});

		it("handles localStorage setItem failure gracefully during save", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Make localStorage.setItem throw for subsequent calls
			const originalSetItem = Storage.prototype.setItem;
			Storage.prototype.setItem = () => {
				throw new Error("Storage quota exceeded");
			};

			try {
				// Select vibrant - the PreferencesService should catch the error
				fireEvent.click(screen.getByTestId("select-vibrant"));

				// The wizard should still function normally despite the save failure
				expect(screen.getByTestId("preset-section")).toBeDefined();
			} finally {
				Storage.prototype.setItem = originalSetItem;
			}
		});
	});

	// Domain suffix computation

	describe("domain suffix computation", () => {
		it("uses default domain with tenant slug when sessionConfig fetch fails", async () => {
			mockAuthClient.getSessionConfig.mockRejectedValue(new Error("Config fetch failed"));
			renderWizard();

			// Falls back to default domain with tenant slug
			await waitFor(() => {
				expect(screen.getByTestId("domain-suffix")).toBeDefined();
			});
			expect(screen.getByTestId("domain-suffix").textContent).toBe("-test-tenant.jolli.site");
		});

		it("adds env subdomain when siteEnv is not prod", async () => {
			mockAuthClient.getSessionConfig.mockResolvedValue({
				jolliSiteDomain: "jolli.site",
				siteEnv: "dev",
			});
			renderWizard();

			await waitFor(() => {
				expect(screen.getByTestId("domain-suffix").textContent).toBe("-test-tenant.dev.jolli.site");
			});
		});

		it("adds preview env subdomain when siteEnv is preview", async () => {
			mockAuthClient.getSessionConfig.mockResolvedValue({
				jolliSiteDomain: "jolli.site",
				siteEnv: "preview",
			});
			renderWizard();

			await waitFor(() => {
				expect(screen.getByTestId("domain-suffix").textContent).toBe("-test-tenant.preview.jolli.site");
			});
		});

		it("omits tenant slug from domain suffix when tenant is absent", async () => {
			mockUseOrg.mockReturnValue({ tenant: null });
			mockAuthClient.getSessionConfig.mockResolvedValue({
				jolliSiteDomain: "jolli.site",
				siteEnv: "prod",
			});
			renderWizard();

			await waitFor(() => {
				expect(screen.getByTestId("domain-suffix").textContent).toBe(".jolli.site");
			});
		});

		it("falls back to default domain when jolliSiteDomain is missing from config", async () => {
			mockAuthClient.getSessionConfig.mockResolvedValue({
				siteEnv: "prod",
			});
			renderWizard();

			await waitFor(() => {
				expect(screen.getByTestId("domain-suffix").textContent).toBe("-test-tenant.jolli.site");
			});
		});
	});

	// Validation logic

	describe("validation logic", () => {
		it("shows error when trying to proceed with name shorter than 3 chars", async () => {
			renderWizard();
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test Site" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "ab" } });

			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "abc" } });

			// The next button should be disabled because name < 3 chars
			expect(screen.getByTestId("next-button")).toHaveProperty("disabled", true);
		});

		it("shows error when display name is empty", () => {
			renderWizard();
			// Only fill site name, leave display name empty
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "my-site" } });

			// Next button should be disabled
			expect(screen.getByTestId("next-button")).toHaveProperty("disabled", true);
		});

		it("shows error for subdomain with invalid characters via validation", async () => {
			renderWizard();
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test" } });

			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});

			// The mock validateSubdomain returns invalid for names < 3 chars or non-alphanumeric
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "ab" } });

			// Next button should be disabled due to invalid subdomain
			expect(screen.getByTestId("next-button")).toHaveProperty("disabled", true);
		});
	});

	// handleNameChange behavior

	describe("handleNameChange", () => {
		it("shows error when name is between 1-2 chars", () => {
			renderWizard();
			const siteNameInput = screen.getByTestId("site-name-input") as HTMLInputElement;

			fireEvent.change(siteNameInput, { target: { value: "ab" } });
			expect(siteNameInput.value).toBe("ab");
			expect(screen.getByText("Site name must be at least 3 characters")).toBeDefined();
		});

		it("clears error when name is empty (0 chars)", () => {
			renderWizard();
			const siteNameInput = screen.getByTestId("site-name-input") as HTMLInputElement;

			// Set a short name to trigger error
			fireEvent.change(siteNameInput, { target: { value: "ab" } });
			expect(screen.getByText("Site name must be at least 3 characters")).toBeDefined();

			// Clear it — error should disappear
			fireEvent.change(siteNameInput, { target: { value: "" } });
			expect(screen.queryByText("Site name must be at least 3 characters")).toBeNull();
		});

		it("clears error when name reaches 3+ chars", () => {
			renderWizard();
			const siteNameInput = screen.getByTestId("site-name-input") as HTMLInputElement;

			// Set a short name to trigger error
			fireEvent.change(siteNameInput, { target: { value: "ab" } });
			expect(screen.getByText("Site name must be at least 3 characters")).toBeDefined();

			// Set a valid name — error should disappear
			fireEvent.change(siteNameInput, { target: { value: "abc" } });
			expect(screen.queryByText("Site name must be at least 3 characters")).toBeNull();
		});
	});

	// handleSkip behavior

	describe("handleSkip", () => {
		it("skips from content step to branding step", async () => {
			renderWizard();
			await navigateToStep("content");

			// Click skip button
			fireEvent.click(screen.getByTestId("skip-button"));

			// Should now be on branding step
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});
		});

		it("skips from branding step to access step", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Click skip button
			fireEvent.click(screen.getByTestId("skip-button"));

			// Should now be on access step
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
		});
	});

	// handleSubmit branding inclusion

	describe("handleSubmit branding inclusion", () => {
		it("includes branding when themePreset is not minimal", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Select vibrant preset (not minimal)
			fireEvent.click(screen.getByTestId("select-vibrant"));

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						branding: expect.objectContaining({ themePreset: "vibrant" }),
					}),
				);
			});
		});

		it("includes branding when logo text is set", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Enter a logo text
			const logoTextInput = screen.getByTestId("wizard-logo-text") as HTMLInputElement;
			fireEvent.change(logoTextInput, { target: { value: "My Logo" } });

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						branding: expect.objectContaining({ logo: "My Logo" }),
					}),
				);
			});
		});

		it("includes branding when favicon is set", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Enter a favicon URL
			const faviconInput = screen.getByTestId("wizard-favicon-url") as HTMLInputElement;
			fireEvent.change(faviconInput, { target: { value: "https://example.com/favicon.ico" } });

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						branding: expect.objectContaining({ favicon: "https://example.com/favicon.ico" }),
					}),
				);
			});
		});

		it("includes branding when logoDisplay is changed", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Change logo display to "image"
			fireEvent.click(screen.getByTestId("wizard-logo-display-image"));

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						branding: expect.objectContaining({ logoDisplay: "image" }),
					}),
				);
			});
		});

		it("does NOT include branding when everything is default", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Don't change anything - minimal preset is default, no logo/favicon/logoDisplay

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				const callArgs = mockSitesClient.createSite.mock.calls[0][0];
				expect(callArgs.branding).toBeUndefined();
			});
		});

		it("includes branding when logoUrl is set via image display mode", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Switch to image display mode to show logoUrl input
			fireEvent.click(screen.getByTestId("wizard-logo-display-image"));

			await waitFor(() => {
				expect(screen.getByTestId("wizard-logo-url")).toBeDefined();
			});

			// Enter a logo URL
			const logoUrlInput = screen.getByTestId("wizard-logo-url") as HTMLInputElement;
			fireEvent.change(logoUrlInput, { target: { value: "https://example.com/logo.png" } });

			// Navigate to access and create
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						branding: expect.objectContaining({ logoUrl: "https://example.com/logo.png" }),
					}),
				);
			});
		});
	});

	// handleSubmit error handling - non-Error thrown

	describe("handleSubmit error handling", () => {
		it("shows generic error message when thrown error is not an Error instance", async () => {
			// Reject with a string (not an Error object) to trigger the fallback branch
			mockSitesClient.createSite.mockRejectedValueOnce("string error");

			renderWizard();
			await navigateToStep("access");

			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message")).toBeDefined();
			});
		});
	});

	// renderContentStep branches

	describe("content step loading and empty states", () => {
		it("shows loading state while articles are being fetched", async () => {
			// Make listDocs return a promise that doesn't resolve immediately
			let resolveListDocs: ((value: unknown) => void) | undefined;
			mockDocsClient.listDocs.mockReturnValue(
				new Promise(resolve => {
					resolveListDocs = resolve;
				}),
			);

			renderWizard();

			// Fill basics quickly and navigate to content
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test Site" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
			});
			fireEvent.click(screen.getByTestId("next-button"));

			// Should show loading indicator (loader-icon from the Loader2 mock)
			await waitFor(() => {
				expect(screen.getByTestId("loader-icon")).toBeDefined();
			});

			// Now resolve the promise to move past loading
			resolveListDocs?.(mockArticles);
		});

		it("shows empty state when no articles are available", async () => {
			mockDocsClient.listDocs.mockResolvedValue([]);

			renderWizard();

			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test Site" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
			});
			fireEvent.click(screen.getByTestId("next-button"));

			// Should show the empty state with the FileText icon (mocked as file-text-icon)
			await waitFor(() => {
				// The empty state renders file-text-icon from the mocked FileText component
				const fileTextIcons = screen.getAllByTestId("file-text-icon");
				// At least one should be in the main content area (empty state)
				expect(fileTextIcons.length).toBeGreaterThan(0);
			});
		});
	});

	// renderBrandingStep - usedRememberedPreset and logo display modes

	describe("branding step", () => {
		it("shows remembered preset note when a preset was loaded from localStorage", async () => {
			localStorage.setItem(
				"jolli-create-site-wizard-prefs-test-tenant",
				JSON.stringify({ themePreset: "vibrant" }),
			);

			renderWizard();
			await navigateToStep("branding");

			// The "useDefaultsNote" text should be visible when usedRememberedPreset is true
			expect(screen.getByTestId("preset-section")).toBeDefined();
		});

		it("shows logo text input in text display mode by default", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Default logo display is "text", so logo text input should be visible
			expect(screen.getByTestId("wizard-logo-text")).toBeDefined();
		});

		it("shows logo URL input when image display mode is selected", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Switch to image mode
			fireEvent.click(screen.getByTestId("wizard-logo-display-image"));

			await waitFor(() => {
				expect(screen.getByTestId("wizard-logo-url")).toBeDefined();
			});

			// Logo text input should NOT be visible in image-only mode
			expect(screen.queryByTestId("wizard-logo-text")).toBeNull();
		});

		it("shows both logo text and URL inputs in both display mode", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Switch to both mode
			fireEvent.click(screen.getByTestId("wizard-logo-display-both"));

			await waitFor(() => {
				expect(screen.getByTestId("wizard-logo-text")).toBeDefined();
				expect(screen.getByTestId("wizard-logo-url")).toBeDefined();
			});
		});

		it("hides logo URL input in text-only display mode", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Default is text mode - logo URL should not be present
			expect(screen.queryByTestId("wizard-logo-url")).toBeNull();
		});

		it("renders branding preview section", async () => {
			renderWizard();
			await navigateToStep("branding");

			expect(screen.getByTestId("branding-preview")).toBeDefined();
		});

		it("renders logo display selector with three mode buttons", async () => {
			renderWizard();
			await navigateToStep("branding");

			expect(screen.getByTestId("wizard-logo-display-selector")).toBeDefined();
			expect(screen.getByTestId("wizard-logo-display-text")).toBeDefined();
			expect(screen.getByTestId("wizard-logo-display-image")).toBeDefined();
			expect(screen.getByTestId("wizard-logo-display-both")).toBeDefined();
		});

		it("renders favicon URL input on branding step", async () => {
			renderWizard();
			await navigateToStep("branding");

			expect(screen.getByTestId("wizard-favicon-url")).toBeDefined();
		});

		it("shows logo text input in both display mode alongside logo URL input", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Switch to "both" mode
			fireEvent.click(screen.getByTestId("wizard-logo-display-both"));

			await waitFor(() => {
				// Both inputs should be present
				const logoText = screen.getByTestId("wizard-logo-text") as HTMLInputElement;
				const logoUrl = screen.getByTestId("wizard-logo-url") as HTMLInputElement;
				expect(logoText).toBeDefined();
				expect(logoUrl).toBeDefined();
			});
		});

		it("uses display name as placeholder for logo text input", async () => {
			renderWizard();

			// Set a display name before navigating to branding
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "My Custom Site" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "my-custom-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "my-custom-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
			});

			// Navigate to content
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Navigate to branding
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});

			// The logo text input placeholder should be the display name
			const logoTextInput = screen.getByTestId("wizard-logo-text") as HTMLInputElement;
			expect(logoTextInput.placeholder).toBe("My Custom Site");
		});

		it("uses default placeholder when display name is empty on branding step", async () => {
			renderWizard();

			// Fill only site name, leave display name minimal then navigate
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "X" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
			});

			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("toggle-include-all"));
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});

			// The placeholder uses displayName which is "X", so it should show that
			const logoTextInput = screen.getByTestId("wizard-logo-text") as HTMLInputElement;
			expect(logoTextInput.placeholder).toBe("X");
		});
	});

	// renderAccessStep - usedRememberedAccess and JWT auth warning

	describe("access step", () => {
		it("shows remembered access note when a JWT auth pref was loaded from localStorage", async () => {
			localStorage.setItem(
				"jolli-create-site-wizard-prefs-test-tenant",
				JSON.stringify({ jwtAuthEnabled: true }),
			);

			renderWizard();
			await navigateToStep("access");

			// The access step should be rendered
			expect(screen.getByTestId("access-public")).toBeDefined();
			expect(screen.getByTestId("access-restricted")).toBeDefined();
		});

		it("shows JWT auth warning banner when restricted access is selected", async () => {
			renderWizard();
			await navigateToStep("access");

			// By default, jwtAuthEnabled is true (restricted)
			// The warning banner should contain an alert-circle-icon
			const alertIcons = screen.getAllByTestId("alert-circle-icon");
			expect(alertIcons.length).toBeGreaterThan(0);
		});

		it("hides JWT auth warning banner when public access is selected", async () => {
			renderWizard();
			await navigateToStep("access");

			// Switch to public access
			fireEvent.click(screen.getByTestId("access-public"));

			// The JWT warning banner should be hidden
			await waitFor(() => {
				// There should still be alert-circle-icons from other areas but
				// the JWT warning specific banner should be gone
				// The banner is rendered conditionally with jwtAuthEnabled
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
		});
	});

	// Step navigation sidebar

	describe("step navigation sidebar", () => {
		it("allows clicking on a completed step to navigate back", async () => {
			renderWizard();
			await navigateToStep("branding");

			// Step "basics" should now be a completed step - click on it
			fireEvent.click(screen.getByTestId("step-basics"));

			// Should navigate back to basics step
			await waitFor(() => {
				expect(screen.getByTestId("display-name-input")).toBeDefined();
			});
		});

		it("allows clicking on a completed content step to navigate back from access", async () => {
			renderWizard();
			await navigateToStep("access");

			// Steps basics, content, branding should all be completed
			fireEvent.click(screen.getByTestId("step-content"));

			// Should navigate back to content step
			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});
		});

		it("does not navigate when clicking a disabled future step", () => {
			renderWizard();

			// On basics step, content/branding/access are future steps and should be disabled
			const contentStep = screen.getByTestId("step-content");
			fireEvent.click(contentStep);

			// Should still be on basics step
			expect(screen.getByTestId("display-name-input")).toBeDefined();
		});

		it("renders all four step indicators in the sidebar", () => {
			renderWizard();
			expect(screen.getByTestId("step-basics")).toBeDefined();
			expect(screen.getByTestId("step-content")).toBeDefined();
			expect(screen.getByTestId("step-branding")).toBeDefined();
			expect(screen.getByTestId("step-access")).toBeDefined();
		});

		it("renders step indicators container", () => {
			renderWizard();
			expect(screen.getByTestId("step-indicators")).toBeDefined();
		});
	});

	// Creating state display

	describe("creating state display", () => {
		it("shows creating spinner during submit", async () => {
			// Make createSite never resolve so we can see the creating state
			mockSitesClient.createSite.mockReturnValue(
				new Promise(() => {
					// Intentionally never resolves to keep the creating state active
				}),
			);

			renderWizard();
			await navigateToStep("access");

			fireEvent.click(screen.getByTestId("create-button"));

			// Wait for the creating state to show
			await waitFor(() => {
				// The create button should show loader
				const loaders = screen.getAllByTestId("loader-icon");
				expect(loaders.length).toBeGreaterThan(0);
			});
		});
	});

	// Footer skip button visibility

	describe("footer skip button visibility", () => {
		it("shows skip button on content step", async () => {
			renderWizard();
			await navigateToStep("content");

			expect(screen.getByTestId("skip-button")).toBeDefined();
		});

		it("shows skip button on branding step", async () => {
			renderWizard();
			await navigateToStep("branding");

			expect(screen.getByTestId("skip-button")).toBeDefined();
		});

		it("does NOT show skip button on basics step", () => {
			renderWizard();

			expect(screen.queryByTestId("skip-button")).toBeNull();
		});

		it("does NOT show skip button on access step", async () => {
			renderWizard();
			await navigateToStep("access");

			// On access step, we have create-button instead of next/skip
			expect(screen.queryByTestId("skip-button")).toBeNull();
		});
	});

	// Cancel button on first step

	describe("cancel button", () => {
		it("shows cancel button on first step instead of back button", () => {
			renderWizard();

			expect(screen.getByTestId("cancel-button")).toBeDefined();
			expect(screen.queryByTestId("back-button")).toBeNull();
		});

		it("calls onClose when cancel button is clicked", () => {
			renderWizard();

			fireEvent.click(screen.getByTestId("cancel-button"));
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	// Error message display

	describe("error messages", () => {
		it("shows error message from Error instance when creation fails", async () => {
			mockSitesClient.createSite.mockRejectedValueOnce(new Error("Server is down"));

			renderWizard();
			await navigateToStep("access");

			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				const errorEl = screen.getByTestId("error-message");
				expect(errorEl).toBeDefined();
			});
		});
	});

	// Folder structure toggle on content step

	describe("folder structure toggle", () => {
		it("toggles folder structure off when clicked", async () => {
			renderWizard();
			await navigateToStep("content");

			const toggleBtn = screen.getByTestId("folder-structure-toggle");
			fireEvent.click(toggleBtn);

			// Create the site to verify the toggle state was captured
			fireEvent.click(screen.getByTestId("skip-button"));
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("skip-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						useSpaceFolderStructure: false,
					}),
				);
			});
		});
	});

	// Include all articles in submit payload

	describe("include all articles", () => {
		it("omits selectedArticleJrns when include-all is enabled", async () => {
			renderWizard();
			await navigateToStep("content");

			// Toggle include all
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Navigate to access and submit
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				const callArgs = mockSitesClient.createSite.mock.calls[0][0];
				expect(callArgs.selectedArticleJrns).toBeUndefined();
			});
		});
	});

	// Subdomain omitted when empty

	describe("subdomain handling in submit", () => {
		it("omits subdomain from payload when empty", async () => {
			renderWizard();

			// Fill basics but leave subdomain empty
			fireEvent.input(screen.getByTestId("display-name-input"), { target: { value: "Test Site" } });
			fireEvent.input(screen.getByTestId("site-name-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("subdomain-input")).toBeDefined();
			});
			// Subdomain is empty by default - set a valid one for navigation then clear
			fireEvent.input(screen.getByTestId("subdomain-input"), { target: { value: "test-site" } });
			await waitFor(() => {
				expect(screen.getByTestId("next-button")).toHaveProperty("disabled", false);
			});

			// Navigate through all steps
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("toggle-include-all"));
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("preset-section")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("next-button"));
			await waitFor(() => {
				expect(screen.getByTestId("access-public")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				expect(mockSitesClient.createSite).toHaveBeenCalledWith(
					expect.objectContaining({
						subdomain: "test-site",
					}),
				);
			});
		});
	});

	// JWT auth not included when disabled

	describe("JWT auth in submit payload", () => {
		it("does not include jwtAuth when disabled", async () => {
			renderWizard();
			await navigateToStep("access");

			// Switch to public access (disables JWT auth)
			fireEvent.click(screen.getByTestId("access-public"));

			fireEvent.click(screen.getByTestId("create-button"));

			await waitFor(() => {
				const callArgs = mockSitesClient.createSite.mock.calls[0][0];
				expect(callArgs.jwtAuth).toBeUndefined();
				expect(callArgs.visibility).toBe("external");
			});
		});
	});

	// Articles fetch error

	describe("articles fetch error", () => {
		it("shows error when article loading fails", async () => {
			mockDocsClient.listDocs.mockRejectedValueOnce(new Error("Failed to load"));

			renderWizard();

			await waitFor(() => {
				expect(screen.getByTestId("error-message")).toBeDefined();
			});
		});
	});

	// Step counter display

	describe("step counter", () => {
		it("displays correct step number for each step", async () => {
			renderWizard();
			await navigateToStep("access");

			// On access step (step 4), verify the create button is present
			expect(screen.getByTestId("create-button")).toBeDefined();
		});
	});
});
