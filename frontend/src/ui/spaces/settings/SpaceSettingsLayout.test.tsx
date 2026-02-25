import type { SpaceContextType } from "../../../contexts/SpaceContext";
import { SpaceSettingsLayout } from "./SpaceSettingsLayout";
import { render, screen } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Space } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock NavigationContext
const mockNavigate = vi.fn();
let mockSpaceSettingsSpaceId: number | undefined = 1;

vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		spaceSettingsSpaceId: mockSpaceSettingsSpaceId,
		spaceSettingsView: "general",
	}),
}));

// Mock SpaceContext
const mockSpaces: Array<Space> = [
	{
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: "Test description",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
	{
		id: 2,
		name: "Another Space",
		slug: "another-space",
		jrn: "space:another",
		description: "",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
];

const mockSpaceContext: SpaceContextType = {
	currentSpace: mockSpaces[0],
	personalSpace: undefined,
	spaces: mockSpaces,
	favoriteSpaces: [],
	isLoading: false,
	error: undefined,
	switchSpace: vi.fn(),
	switchToPersonalSpace: vi.fn(),
	createSpace: vi.fn(),
	updateSpace: vi.fn(),
	deleteSpace: vi.fn(),
	migrateSpaceContent: vi.fn(),
	refreshSpaces: vi.fn(),
	toggleSpaceFavorite: vi.fn(),
	isFavorite: vi.fn(),
};

vi.mock("../../../contexts/SpaceContext", () => ({
	useSpace: () => mockSpaceContext,
}));

// Mock SpaceSettingsSidebar
vi.mock("./SpaceSettingsSidebar", () => ({
	SpaceSettingsSidebar: ({ space }: { space: Space }) => (
		<div data-testid="space-settings-sidebar">{space.name} Sidebar</div>
	),
}));

describe("SpaceSettingsLayout", () => {
	it("should render sidebar and content area when space is found", () => {
		mockSpaceSettingsSpaceId = 1;

		render(
			<SpaceSettingsLayout>
				<div data-testid="child-content">Child Content</div>
			</SpaceSettingsLayout>,
		);

		expect(screen.getByTestId("space-settings-sidebar")).toBeDefined();
		expect(screen.getByTestId("space-settings-content")).toBeDefined();
		expect(screen.getByTestId("child-content")).toBeDefined();
	});

	it("should render error state when space is not found", () => {
		mockSpaceSettingsSpaceId = 999; // Non-existent space ID

		render(
			<SpaceSettingsLayout>
				<div>Child Content</div>
			</SpaceSettingsLayout>,
		);

		expect(screen.getByText("Space not found")).toBeDefined();
		expect(screen.queryByTestId("space-settings-sidebar")).toBeNull();
	});

	it("should pass correct space to sidebar", () => {
		mockSpaceSettingsSpaceId = 1;

		render(
			<SpaceSettingsLayout>
				<div>Content</div>
			</SpaceSettingsLayout>,
		);

		expect(screen.getByText("Test Space Sidebar")).toBeDefined();
	});

	it("should render children in content area", () => {
		mockSpaceSettingsSpaceId = 1;

		render(
			<SpaceSettingsLayout>
				<div data-testid="test-child">Test Child</div>
			</SpaceSettingsLayout>,
		);

		const contentArea = screen.getByTestId("space-settings-content");
		expect(contentArea.querySelector('[data-testid="test-child"]')).toBeDefined();
	});
});
