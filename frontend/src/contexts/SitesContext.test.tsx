import { ClientProvider } from "./ClientContext";
import { SitesProvider, useCurrentSite, useSites } from "./SitesContext";
import { render, waitFor } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockSite(overrides: Partial<SiteWithUpdate> = {}): SiteWithUpdate {
	return {
		id: 1,
		name: "default-site",
		displayName: "Default Site",
		userId: 1,
		visibility: "internal",
		status: "active",
		metadata: undefined,
		lastGeneratedAt: undefined,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		needsUpdate: false,
		...overrides,
	};
}

const mockSites: Array<SiteWithUpdate> = [
	createMockSite({ id: 1, name: "default-site", displayName: "Default Site" }),
	createMockSite({ id: 2, name: "second-site", displayName: "Second Site" }),
];

const mockSitesClient = {
	listSites: vi.fn().mockResolvedValue(mockSites),
};

const mockClient = {
	sites: vi.fn(() => mockSitesClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock useUserPreferences hook
const mockSetFavoriteSites = vi.fn();
let mockFavoriteSitesValue: Array<number> = [];

vi.mock("../hooks/useUserPreferences", () => ({
	useUserPreferences: () => ({
		favoriteSpaces: [],
		favoriteSites: mockFavoriteSitesValue,
		toggleSpaceFavorite: vi.fn(),
		toggleSiteFavorite: mockSetFavoriteSites,
		isSpaceFavorite: () => false,
		isSiteFavorite: (id: number) => mockFavoriteSitesValue.includes(id),
		isLoading: false,
	}),
}));

describe("SitesContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFavoriteSitesValue = [];
		mockSitesClient.listSites.mockResolvedValue(mockSites);
	});

	describe("SitesProvider", () => {
		it("should load sites on mount", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.sites).toHaveLength(2);
				expect(context?.currentSite).toBeUndefined();
			});
		});

		it("should handle loading state", () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			// Initially should be loading
			expect(context?.isLoading).toBe(true);
		});

		it("should handle errors when loading sites", async () => {
			mockSitesClient.listSites.mockRejectedValue(new Error("Network error"));

			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Network error");
				expect(context?.isLoading).toBe(false);
			});
		});

		it("should handle non-Error exceptions", async () => {
			mockSitesClient.listSites.mockRejectedValue("String error");

			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Failed to load sites");
				expect(context?.isLoading).toBe(false);
			});
		});
	});

	describe("useSites", () => {
		it("should throw error when used outside provider", () => {
			function TestComponent(): ReactElement {
				useSites();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useSites must be used within a SitesProvider");
		});

		it("should provide setCurrentSite function", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Set current site to site 2
			context?.setCurrentSite(2);

			await waitFor(() => {
				expect(context?.currentSite?.id).toBe(2);
			});
		});

		it("should clear current site when setCurrentSite called with undefined", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Set current site
			context?.setCurrentSite(1);

			await waitFor(() => {
				expect(context?.currentSite?.id).toBe(1);
			});

			// Clear current site
			context?.setCurrentSite(undefined);

			await waitFor(() => {
				expect(context?.currentSite).toBeUndefined();
			});
		});

		it("should handle setting non-existent site", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Try to set non-existent site
			context?.setCurrentSite(999);

			// Should remain undefined
			expect(context?.currentSite).toBeUndefined();
		});

		it("should provide refreshSites function", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(mockSitesClient.listSites).toHaveBeenCalledTimes(1);

			await context?.refreshSites();

			expect(mockSitesClient.listSites).toHaveBeenCalledTimes(2);
		});

		it("should update current site when refreshing", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Set current site
			context?.setCurrentSite(1);

			await waitFor(() => {
				expect(context?.currentSite?.id).toBe(1);
			});

			// Mock updated site data
			const updatedSite = createMockSite({
				id: 1,
				name: "default-site",
				displayName: "Updated Site",
			});
			mockSitesClient.listSites.mockResolvedValue([updatedSite, mockSites[1]]);

			await context?.refreshSites();

			await waitFor(() => {
				expect(context?.currentSite?.displayName).toBe("Updated Site");
			});
		});

		it("should handle error in refreshSites", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Make listSites fail on refresh
			mockSitesClient.listSites.mockRejectedValue(new Error("Network error"));

			// Should not throw, just log error
			await context?.refreshSites();

			// Sites should remain unchanged
			expect(context?.sites).toHaveLength(2);
		});

		it("should provide favoriteSites array", async () => {
			mockFavoriteSitesValue = [1, 2];
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.favoriteSites).toEqual([1, 2]);
		});

		it("should toggle site favorite - add to favorites", async () => {
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Add site 1 to favorites
			context?.toggleSiteFavorite(1);

			await waitFor(() => {
				expect(mockSetFavoriteSites).toHaveBeenCalledWith(1);
			});
		});

		it("should toggle site favorite - remove from favorites", async () => {
			mockFavoriteSitesValue = [1, 2];
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Remove site 1 from favorites
			context?.toggleSiteFavorite(1);

			await waitFor(() => {
				expect(mockSetFavoriteSites).toHaveBeenCalledWith(1);
			});
		});

		it("should check if site is favorite", async () => {
			mockFavoriteSitesValue = [1, 2];
			let context: ReturnType<typeof useSites> | undefined;

			function TestComponent(): ReactElement {
				context = useSites();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.isFavorite(1)).toBe(true);
			expect(context?.isFavorite(2)).toBe(true);
			expect(context?.isFavorite(3)).toBe(false);
		});
	});

	describe("useCurrentSite", () => {
		it("should return current site", async () => {
			let context: ReturnType<typeof useSites> | undefined;
			let currentSite: ReturnType<typeof useCurrentSite>;

			function TestComponent(): ReactElement {
				context = useSites();
				currentSite = useCurrentSite();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Set current site
			context?.setCurrentSite(1);

			await waitFor(() => {
				expect(currentSite?.id).toBe(1);
			});
		});

		it("should return undefined when no site selected", async () => {
			let currentSite: ReturnType<typeof useCurrentSite>;

			function TestComponent(): ReactElement {
				currentSite = useCurrentSite();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SitesProvider>
						<TestComponent />
					</SitesProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(currentSite).toBeUndefined();
			});
		});

		it("should throw error when used outside provider", () => {
			function TestComponent(): ReactElement {
				useCurrentSite();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useSites must be used within a SitesProvider");
		});
	});
});
