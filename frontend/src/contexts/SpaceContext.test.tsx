import { ClientProvider } from "./ClientContext";
import { SpaceProvider, useCurrentSpace, useSpace } from "./SpaceContext";
import { render, waitFor } from "@testing-library/preact";
import type { Space } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockSpace(overrides: Partial<Space> = {}): Space {
	return {
		id: 1,
		name: "Default Space",
		slug: "default-space",
		jrn: "space:default-space",
		description: undefined,
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

const mockSpaces: Array<Space> = [
	createMockSpace({ id: 1, name: "Default Space", slug: "default-space" }),
	createMockSpace({ id: 2, name: "Second Space", slug: "second-space" }),
];

const mockPersonalSpace = createMockSpace({ id: 10, name: "Personal Space", slug: "personal-space", isPersonal: true });

const mockSpacesClient = {
	listSpaces: vi.fn().mockResolvedValue(mockSpaces),
	getDefaultSpace: vi.fn().mockResolvedValue(mockSpaces[0]),
	getSpace: vi.fn().mockResolvedValue(mockSpaces[0]),
	createSpace: vi.fn().mockResolvedValue(createMockSpace({ id: 3, name: "New Space", slug: "new-space" })),
	getPersonalSpace: vi.fn().mockResolvedValue(mockPersonalSpace),
};

const mockClient = {
	spaces: vi.fn(() => mockSpacesClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock usePreference hook
const mockSetPreference = vi.fn();
const mockSetFavoriteSpaces = vi.fn();
let mockPreferenceValue: number | null = null;
let mockFavoriteSpacesValue: Array<number> = [];

vi.mock("../hooks/usePreference", () => ({
	usePreference: () => {
		// Only used for currentSpaceId preference now
		return [mockPreferenceValue, mockSetPreference];
	},
}));

// Mock useUserPreferences hook
vi.mock("../hooks/useUserPreferences", () => ({
	useUserPreferences: () => ({
		favoriteSpaces: mockFavoriteSpacesValue,
		favoriteSites: [],
		toggleSpaceFavorite: mockSetFavoriteSpaces,
		toggleSiteFavorite: vi.fn(),
		isSpaceFavorite: (id: number) => mockFavoriteSpacesValue.includes(id),
		isSiteFavorite: () => false,
		isLoading: false,
	}),
}));

describe("SpaceContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPreferenceValue = null;
		mockFavoriteSpacesValue = [];
		mockSpacesClient.listSpaces.mockResolvedValue(mockSpaces);
		mockSpacesClient.getDefaultSpace.mockResolvedValue(mockSpaces[0]);
	});

	describe("SpaceProvider", () => {
		it("should load spaces on mount", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.spaces).toHaveLength(2);
				expect(context?.currentSpace?.name).toBe("Default Space");
			});
		});

		it("should handle loading state", () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			// Initially should be loading
			expect(context?.isLoading).toBe(true);
		});

		it("should use saved currentSpaceId from preference", async () => {
			mockPreferenceValue = 2;
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.currentSpace?.id).toBe(2);
				expect(context?.currentSpace?.name).toBe("Second Space");
			});
		});

		it("should fall back to default space if saved space not found", async () => {
			mockPreferenceValue = 999; // Non-existent space ID
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.currentSpace?.id).toBe(1);
				expect(mockSetPreference).toHaveBeenCalledWith(1);
			});
		});

		it("should handle errors when loading spaces", async () => {
			mockSpacesClient.listSpaces.mockRejectedValue(new Error("Network error"));

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Network error");
				expect(context?.isLoading).toBe(false);
			});
		});

		it("should handle non-Error exceptions", async () => {
			mockSpacesClient.listSpaces.mockRejectedValue("String error");

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Failed to load spaces");
				expect(context?.isLoading).toBe(false);
			});
		});
	});

	describe("useSpace", () => {
		it("should throw error when used outside provider", () => {
			function TestComponent(): ReactElement {
				useSpace();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useSpace must be used within a SpaceProvider");
		});

		it("should provide switchSpace function", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Switch to space 2
			await context?.switchSpace(2);

			await waitFor(() => {
				expect(context?.currentSpace?.id).toBe(2);
				expect(mockSetPreference).toHaveBeenCalledWith(2);
			});
		});

		it("should not switch if already on the same space", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.currentSpace?.id).toBe(1);
			});

			// Clear mocks to track new calls
			mockSetPreference.mockClear();

			// Try to switch to current space
			await context?.switchSpace(1);

			// Should not call setPreference
			expect(mockSetPreference).not.toHaveBeenCalled();
		});

		it("should fetch space if not in list when switching", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Mock getSpace for new space
			const newSpace = createMockSpace({ id: 99, name: "New Space", slug: "new-space" });
			mockSpacesClient.getSpace.mockResolvedValue(newSpace);
			mockSpacesClient.listSpaces.mockResolvedValue([...mockSpaces, newSpace]);

			// Switch to space not in list
			await context?.switchSpace(99);

			await waitFor(() => {
				expect(mockSpacesClient.getSpace).toHaveBeenCalledWith(99);
				expect(context?.currentSpace?.id).toBe(99);
			});
		});

		it("should handle error when switching to non-existent space", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Mock getSpace to fail
			mockSpacesClient.getSpace.mockRejectedValue(new Error("Space not found"));

			// Clear mocks to track new calls
			mockSetPreference.mockClear();

			// Switch to non-existent space
			await context?.switchSpace(999);

			// Should not update preference on error
			expect(mockSetPreference).not.toHaveBeenCalled();
		});

		it("should provide createSpace function", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			const newSpace = createMockSpace({ id: 3, name: "New Space", slug: "new-space" });
			mockSpacesClient.createSpace.mockResolvedValue(newSpace);
			mockSpacesClient.listSpaces.mockResolvedValue([...mockSpaces, newSpace]);

			// Create new space
			const result = await context?.createSpace({
				name: "New Space",
			});

			expect(result).toEqual(newSpace);
			expect(mockSpacesClient.createSpace).toHaveBeenCalled();

			await waitFor(() => {
				// Should switch to new space by default
				expect(context?.currentSpace?.id).toBe(3);
			});
		});

		it("should not switch when creating space with switchToNew=false", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			const newSpace = createMockSpace({ id: 3, name: "New Space", slug: "new-space" });
			mockSpacesClient.createSpace.mockResolvedValue(newSpace);
			mockSpacesClient.listSpaces.mockResolvedValue([...mockSpaces, newSpace]);

			mockSetPreference.mockClear();

			// Create new space without switching
			await context?.createSpace(
				{
					name: "New Space",
				},
				false,
			);

			// Should not switch to new space
			expect(context?.currentSpace?.id).toBe(1);
			expect(mockSetPreference).not.toHaveBeenCalled();
		});

		it("should provide refreshSpaces function", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(mockSpacesClient.listSpaces).toHaveBeenCalledTimes(1);

			await context?.refreshSpaces();

			expect(mockSpacesClient.listSpaces).toHaveBeenCalledTimes(2);
		});

		it("should fall back to default space if current space was deleted during refresh", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Switch to space 2
			await context?.switchSpace(2);

			await waitFor(() => {
				expect(context?.currentSpace?.id).toBe(2);
			});

			// Simulate space 2 being deleted
			mockSpacesClient.listSpaces.mockResolvedValue([mockSpaces[0]]); // Only space 1 remains

			await context?.refreshSpaces();

			await waitFor(() => {
				expect(context?.currentSpace?.id).toBe(1);
				expect(mockSetPreference).toHaveBeenCalledWith(1);
			});
		});

		it("should handle error in refreshSpaces", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Make listSpaces fail on refresh
			mockSpacesClient.listSpaces.mockRejectedValue(new Error("Network error"));

			// Should not throw, just log error
			await context?.refreshSpaces();

			// Current space should remain unchanged
			expect(context?.currentSpace?.id).toBe(1);
		});

		it("should create space if listSpaces returns empty", async () => {
			mockSpacesClient.listSpaces.mockResolvedValue([]);

			const newSpace = mockSpaces[0];
			mockSpacesClient.createSpace.mockResolvedValue(newSpace);

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.currentSpace).toEqual(newSpace);
			});

			expect(mockSpacesClient.createSpace).toHaveBeenCalledWith({
				name: "Default Space",
			});
		});

		it("should show error if space creation fails", async () => {
			mockSpacesClient.listSpaces.mockResolvedValue([]);
			mockSpacesClient.createSpace.mockRejectedValue(new Error("API error"));

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toContain("Failed to initialize workspace");
			});

			expect(context?.currentSpace).toBeUndefined();
		});

		it("should NOT call getDefaultSpace if spaces exist", async () => {
			function TestComponent(): ReactElement {
				useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(mockSpacesClient.listSpaces).toHaveBeenCalled();
			});

			// getDefaultSpace should NOT be called
			expect(mockSpacesClient.getDefaultSpace).not.toHaveBeenCalled();
			expect(mockSpacesClient.createSpace).not.toHaveBeenCalled();
		});

		it("should clear current space when all spaces are deleted (refreshSpaces)", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.currentSpace?.id).toBe(1);

			// Simulate all spaces deleted - refresh returns empty
			mockSpacesClient.listSpaces.mockResolvedValue([]);

			await context?.refreshSpaces();

			await waitFor(() => {
				expect(context?.currentSpace).toBeUndefined();
			});

			// getDefaultSpace should NOT be called
			expect(mockSpacesClient.getDefaultSpace).not.toHaveBeenCalled();
		});

		it("should provide favoriteSpaces array", async () => {
			mockFavoriteSpacesValue = [1, 2];
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.favoriteSpaces).toEqual([1, 2]);
		});

		it("should toggle space favorite - add to favorites", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Add space 1 to favorites
			context?.toggleSpaceFavorite(1);

			await waitFor(() => {
				expect(mockSetFavoriteSpaces).toHaveBeenCalledWith(1);
			});
		});

		it("should toggle space favorite - remove from favorites", async () => {
			mockFavoriteSpacesValue = [1, 2];
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Remove space 1 from favorites
			context?.toggleSpaceFavorite(1);

			await waitFor(() => {
				expect(mockSetFavoriteSpaces).toHaveBeenCalledWith(1);
			});
		});

		it("should check if space is favorite", async () => {
			mockFavoriteSpacesValue = [1, 2];
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.isFavorite(1)).toBe(true);
			expect(context?.isFavorite(2)).toBe(true);
			expect(context?.isFavorite(3)).toBe(false);
		});

		it("should derive personalSpace from spaces list", async () => {
			const spacesWithPersonal = [
				...mockSpaces,
				createMockSpace({ id: 10, name: "Personal Space", slug: "personal-space", isPersonal: true }),
			];
			mockSpacesClient.listSpaces.mockResolvedValue(spacesWithPersonal);

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.personalSpace).toBeDefined();
			expect(context?.personalSpace?.id).toBe(10);
			expect(context?.personalSpace?.isPersonal).toBe(true);
		});

		it("should return undefined personalSpace when none exists", async () => {
			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			expect(context?.personalSpace).toBeUndefined();
		});

		it("should switch to personal space from spaces list", async () => {
			const spacesWithPersonal = [
				...mockSpaces,
				createMockSpace({ id: 10, name: "Personal Space", slug: "personal-space", isPersonal: true }),
			];
			mockSpacesClient.listSpaces.mockResolvedValue(spacesWithPersonal);

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			await context?.switchToPersonalSpace();

			await waitFor(() => {
				expect(context?.currentSpace?.id).toBe(10);
				expect(context?.currentSpace?.isPersonal).toBe(true);
			});

			// Should not call getPersonalSpace API since it was in the list
			expect(mockSpacesClient.getPersonalSpace).not.toHaveBeenCalled();
		});

		it("should fetch personal space from API when not in list", async () => {
			const fetchedPersonal = createMockSpace({
				id: 10,
				name: "Personal Space",
				slug: "personal-space",
				isPersonal: true,
			});
			mockSpacesClient.getPersonalSpace.mockResolvedValue(fetchedPersonal);
			const refreshedSpaces = [...mockSpaces, fetchedPersonal];
			mockSpacesClient.listSpaces
				.mockResolvedValueOnce(mockSpaces) // Initial load
				.mockResolvedValueOnce(refreshedSpaces); // After fetching personal space

			let context: ReturnType<typeof useSpace> | undefined;

			function TestComponent(): ReactElement {
				context = useSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Personal space not in list, so it should call the API
			await context?.switchToPersonalSpace();

			await waitFor(() => {
				expect(mockSpacesClient.getPersonalSpace).toHaveBeenCalled();
				expect(context?.currentSpace?.id).toBe(10);
			});
		});
	});

	describe("useCurrentSpace", () => {
		it("should return current space", async () => {
			let currentSpace: Space | undefined;

			function TestComponent(): ReactElement {
				currentSpace = useCurrentSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(currentSpace?.name).toBe("Default Space");
			});
		});

		it("should return undefined while loading", () => {
			let currentSpace: Space | undefined;

			function TestComponent(): ReactElement {
				currentSpace = useCurrentSpace();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<SpaceProvider>
						<TestComponent />
					</SpaceProvider>
				</ClientProvider>,
			);

			expect(currentSpace).toBeUndefined();
		});

		it("should throw error when used outside provider", () => {
			function TestComponent(): ReactElement {
				useCurrentSpace();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useSpace must be used within a SpaceProvider");
		});
	});
});
