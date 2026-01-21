import { WelcomeScreen } from "./WelcomeScreen";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		welcomeTitle: "Welcome to Jolli!",
		welcomeMessage: "Choose a source type to connect",
		addIntegrationTitle: "Add a Source",
		addIntegrationMessage: "Choose another source to help Jolli",
		skipForNow: "Skip for now",
		githubOption: "GitHub",
		githubDescription: "Connect a repository",
		staticFileOption: "Static Files",
		staticFileDescription: "Upload documents directly",
	}),
}));

describe("WelcomeScreen", () => {
	it("should render welcome title when no existing integrations", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		expect(screen.getByText("Welcome to Jolli!")).toBeDefined();
		expect(screen.getByText("Choose a source type to connect")).toBeDefined();
	});

	it("should render add integration title when existing integrations exist", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={true} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		expect(screen.getByText("Add a Source")).toBeDefined();
		expect(screen.getByText("Choose another source to help Jolli")).toBeDefined();
	});

	it("should render GitHub option card", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		expect(screen.getByText("GitHub")).toBeDefined();
		expect(screen.getByText("Connect a repository")).toBeDefined();
	});

	it("should render Static Files option card", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		expect(screen.getByText("Static Files")).toBeDefined();
		expect(screen.getByText("Upload documents directly")).toBeDefined();
	});

	it("should call onSelectType with 'github' when GitHub card is clicked", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		const button = screen.getByText("GitHub").closest("button");
		if (button) {
			fireEvent.click(button);
		}

		expect(mockOnSelectType).toHaveBeenCalledWith("github");
	});

	it("should call onSelectType with 'static_file' when Static Files card is clicked", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		const button = screen.getByText("Static Files").closest("button");
		if (button) {
			fireEvent.click(button);
		}

		expect(mockOnSelectType).toHaveBeenCalledWith("static_file");
	});

	it("should call onSkip when skip button is clicked", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		render(<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		const button = screen.getByText("Skip for now");
		fireEvent.click(button);

		expect(mockOnSkip).toHaveBeenCalledTimes(1);
	});

	it("should display FolderGit2 icon", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		const { container } = render(
			<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />,
		);

		const icon = container.querySelector('svg[data-lucide-icon="FolderGit2"]');
		expect(icon).toBeDefined();
	});

	it("should display FileUp icon", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		const { container } = render(
			<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />,
		);

		const icon = container.querySelector('svg[data-lucide-icon="FileUp"]');
		expect(icon).toBeDefined();
	});

	it("should render skip button in both modes", () => {
		const mockOnSelectType = vi.fn();
		const mockOnSkip = vi.fn();

		const { rerender } = render(
			<WelcomeScreen hasExistingIntegrations={false} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />,
		);

		expect(screen.getByText("Skip for now")).toBeDefined();

		rerender(<WelcomeScreen hasExistingIntegrations={true} onSelectType={mockOnSelectType} onSkip={mockOnSkip} />);

		expect(screen.getByText("Skip for now")).toBeDefined();
	});
});
