/**
 * Shared test utilities for branding component tests.
 * Uses a lightweight render approach to avoid OOM issues from full provider stack.
 *
 * Note: lucide-react is mocked globally in src/util/Vitest.tsx setup file.
 */
import { SiteBrandingTab } from "./SiteBrandingTab";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteMetadata, SiteWithUpdate } from "jolli-common";
import { vi } from "vitest";

// Mock the client - exported so tests can access and configure it
export const mockUpdateBranding = vi.fn();
vi.mock("../../../contexts/ClientContext", () => ({
	// Provide minimal ClientProvider that just renders children
	ClientProvider: ({ children }: { children: React.ReactNode }) => children,
	useClient: () => ({
		sites: () => ({
			updateBranding: mockUpdateBranding,
		}),
	}),
}));

/**
 * Default metadata for mock docsites
 */
export const defaultMetadata: SiteMetadata = {
	githubRepo: "owner/repo",
	githubUrl: "https://github.com/owner/repo",
	framework: "nextra",
	articleCount: 5,
};

/**
 * Create a mock docsite for testing
 */
export function createMockDocsite(
	overrides: Omit<Partial<SiteWithUpdate>, "metadata"> & { metadata?: Partial<SiteMetadata> } = {},
): SiteWithUpdate {
	const { metadata: metadataOverrides, ...rest } = overrides;
	return {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		status: "active",
		visibility: "external",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		needsUpdate: false,
		metadata: { ...defaultMetadata, ...metadataOverrides },
		...rest,
	} as SiteWithUpdate;
}

/**
 * Helper to expand a collapsible section by clicking its header.
 * Sections: 'style', 'identity' (logo), 'navigation', 'footer', 'layout'
 */
export function expandSection(sectionTestId: string): void {
	const section = screen.getByTestId(sectionTestId);
	const button = section.querySelector("button");
	if (button) {
		fireEvent.click(button);
	}
}

/**
 * Mock for onDocsiteUpdate callback
 */
export const mockOnDocsiteUpdate = vi.fn();

/**
 * Render the SiteBrandingTab component with minimal providers.
 * Uses direct render instead of full provider stack to avoid OOM issues.
 */
export function renderBrandingTab(
	docsite: SiteWithUpdate,
	props: Partial<React.ComponentProps<typeof SiteBrandingTab>> = {},
) {
	return render(<SiteBrandingTab docsite={docsite} onDocsiteUpdate={mockOnDocsiteUpdate} {...props} />);
}

/**
 * Setup function to be called in beforeEach - mocks document.fonts
 * Returns the original fonts value for cleanup
 */
export function setupBrandingTest(): FontFaceSet | undefined {
	vi.clearAllMocks();
	mockUpdateBranding.mockResolvedValue({ id: 1 });

	const originalFonts = document.fonts;

	let callCount = 0;
	Object.defineProperty(document, "fonts", {
		value: {
			load: vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve([]);
				}
				return Promise.reject(new Error("Font not found"));
			}),
			ready: Promise.resolve(),
		},
		writable: true,
		configurable: true,
	});

	return originalFonts;
}

/**
 * Cleanup function to be called in afterEach - restores document.fonts
 */
export function cleanupBrandingTest(originalFonts: FontFaceSet | undefined): void {
	if (originalFonts !== undefined) {
		Object.defineProperty(document, "fonts", {
			value: originalFonts,
			writable: true,
			configurable: true,
		});
	}
}
