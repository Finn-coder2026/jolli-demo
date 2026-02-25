import type { SpaceSettingsView } from "../../../contexts/NavigationContext";
import { SpaceSettingsSidebar } from "./SpaceSettingsSidebar";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock NavigationContext
const mockNavigate = vi.fn();
let mockSpaceSettingsView: SpaceSettingsView = "general";

vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		spaceSettingsView: mockSpaceSettingsView,
	}),
}));

describe("SpaceSettingsSidebar", () => {
	const mockSpace: Space = {
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
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockSpaceSettingsView = "general";
	});

	it("should render the sidebar with back button", () => {
		render(<SpaceSettingsSidebar space={mockSpace} />);

		expect(screen.getByTestId("space-settings-sidebar")).toBeDefined();
		expect(screen.getByTestId("back-to-space-button")).toBeDefined();
	});

	it("should display space name in back button", () => {
		render(<SpaceSettingsSidebar space={mockSpace} />);

		// The back button should contain the space name
		const backButton = screen.getByTestId("back-to-space-button");
		expect(backButton.textContent).toContain("Test Space");
	});

	it("should navigate to articles when back button is clicked", () => {
		render(<SpaceSettingsSidebar space={mockSpace} />);

		fireEvent.click(screen.getByTestId("back-to-space-button"));

		expect(mockNavigate).toHaveBeenCalledWith("/articles");
	});

	it("should render General navigation item", () => {
		render(<SpaceSettingsSidebar space={mockSpace} />);

		expect(screen.getByTestId("nav-general")).toBeDefined();
	});

	it("should navigate to general settings when nav item is clicked", () => {
		render(<SpaceSettingsSidebar space={mockSpace} />);

		fireEvent.click(screen.getByTestId("nav-general"));

		expect(mockNavigate).toHaveBeenCalledWith("/spaces/1/settings/general");
	});

	it("should highlight active nav item", () => {
		mockSpaceSettingsView = "general";

		render(<SpaceSettingsSidebar space={mockSpace} />);

		const navItem = screen.getByTestId("nav-general");
		// Active nav item should have sidebar-accent background
		expect(navItem.className).toContain("bg-sidebar-accent");
	});

	it("should show inactive styling for non-active items", () => {
		mockSpaceSettingsView = "none";

		render(<SpaceSettingsSidebar space={mockSpace} />);

		const navItem = screen.getByTestId("nav-general");
		// Inactive nav item should have sidebar foreground text
		expect(navItem.className).toContain("text-sidebar-foreground");
	});
});
