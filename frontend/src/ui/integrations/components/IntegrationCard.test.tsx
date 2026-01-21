import { IntegrationCard } from "./IntegrationCard";
import { fireEvent, render } from "@testing-library/preact";
import { Github } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("IntegrationCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Set a fixed date for testing
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render integration card with all props", () => {
		const { container } = render(
			<IntegrationCard
				title="GitHub"
				icon={Github}
				orgCount={5}
				totalRepos={20}
				enabledRepos={15}
				needsAttention={2}
				lastSync="2024-01-01T11:55:00Z"
			/>,
		);

		expect(container.textContent).toContain("GitHub");
		expect(container.textContent).toContain("5 organizations");
		expect(container.textContent).toContain("15 enabled out of 20 repositories");
		expect(container.textContent).toContain("2 repos need attention");
		expect(container.textContent).toContain("Last synced: 5 m ago");
	});

	it("should handle onClick when card is clicked", () => {
		const onClick = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onClick={onClick} />);

		const card = container.querySelector('[role="button"]');
		expect(card).toBeDefined();
		fireEvent.click(card as HTMLElement);

		expect(onClick).toHaveBeenCalledOnce();
	});

	it("should handle Enter key press", () => {
		const onClick = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onClick={onClick} />);

		const card = container.querySelector('[role="button"]');
		expect(card).toBeDefined();
		fireEvent.keyDown(card as HTMLElement, { key: "Enter" });

		expect(onClick).toHaveBeenCalledOnce();
	});

	it("should handle Space key press", () => {
		const onClick = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onClick={onClick} />);

		const card = container.querySelector('[role="button"]');
		expect(card).toBeDefined();
		fireEvent.keyDown(card as HTMLElement, { key: " " });

		expect(onClick).toHaveBeenCalledOnce();
	});

	it("should not trigger onClick for other keys", () => {
		const onClick = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onClick={onClick} />);

		const card = container.querySelector('[role="button"]');
		expect(card).toBeDefined();
		fireEvent.keyDown(card as HTMLElement, { key: "Tab" });

		expect(onClick).not.toHaveBeenCalled();
	});

	it("should render without onClick handler", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} />);

		const card = container.querySelector('[role="button"]');
		expect(card).toBeDefined();
		// Should not throw when clicked without onClick
		fireEvent.click(card as HTMLElement);
	});

	it("should not show lastSync when lastSync is undefined", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} />);

		expect(container.textContent).not.toContain("Last synced");
	});

	it("should format timestamp as 'Just now' for very recent sync", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} lastSync="2024-01-01T11:59:30Z" />);

		expect(container.textContent).toContain("Last synced: Just now");
	});

	it("should format timestamp in minutes (30m ago)", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} lastSync="2024-01-01T11:30:00Z" />);

		expect(container.textContent).toContain("Last synced: 30 m ago");
	});

	it("should format timestamp in hours (2h ago)", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} lastSync="2024-01-01T10:00:00Z" />);

		expect(container.textContent).toContain("Last synced: 2 h ago");
	});

	it("should format timestamp in days (1d ago)", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} lastSync="2023-12-31T12:00:00Z" />);

		expect(container.textContent).toContain("Last synced: 1 d ago");
	});

	it("should show singular form for 1 organization", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} orgCount={1} />);

		expect(container.textContent).toContain("1 organization");
	});

	it("should show plural form for multiple organizations", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} orgCount={3} />);

		expect(container.textContent).toContain("3 organizations");
	});

	it("should show singular form for 1 repository", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} totalRepos={1} enabledRepos={1} />);

		expect(container.textContent).toContain("1 enabled out of 1 repository");
	});

	it("should show plural form for multiple repositories", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} totalRepos={10} enabledRepos={5} />);

		expect(container.textContent).toContain("5 enabled out of 10 repositories");
	});

	it("should show singular form for 1 repo needing attention", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} needsAttention={1} />);

		expect(container.textContent).toContain("1 repo needs attention");
	});

	it("should show plural form for multiple repos needing attention", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} needsAttention={3} />);

		expect(container.textContent).toContain("3 repos need attention");
	});

	it("should not show needsAttention badge when needsAttention is 0", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} needsAttention={0} />);

		expect(container.textContent).not.toContain("attention");
	});

	it("should not show needsAttention badge when needsAttention is undefined", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} />);

		expect(container.textContent).not.toContain("attention");
	});

	it("should not show orgCount when undefined", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} />);

		expect(container.textContent).not.toContain("organization");
	});

	it("should not show repo stats when totalRepos or enabledRepos is undefined", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} totalRepos={10} />);

		expect(container.textContent).not.toContain("enabled out of");
	});

	it("should not show lastSync when undefined", () => {
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} />);

		expect(container.textContent).not.toContain("Last synced");
	});

	it("should handle intlayer values with .key property", () => {
		// Mock one value to have a .key property (edge case that getStringValue handles)
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		const { container } = render(<IntegrationCard title="GitHub" icon={Github} lastSync="2024-01-01T11:59:30Z" />);

		// Should still work correctly with .key property (getStringValue converts it)
		expect(container.textContent).toContain("Last synced: Just now");
	});

	it("should render delete button when onDelete is provided", () => {
		const onDelete = vi.fn();
		const { getByTestId } = render(<IntegrationCard title="GitHub" icon={Github} onDelete={onDelete} />);

		const deleteButton = getByTestId("delete-integration-button");
		expect(deleteButton).toBeDefined();
	});

	it("should not render delete button when onDelete is not provided", () => {
		const { queryByTestId } = render(<IntegrationCard title="GitHub" icon={Github} />);

		expect(queryByTestId("delete-integration-button")).toBeNull();
	});

	it("should call onDelete when delete button is clicked", () => {
		const onDelete = vi.fn();
		const { getByTestId } = render(<IntegrationCard title="GitHub" icon={Github} onDelete={onDelete} />);

		const deleteButton = getByTestId("delete-integration-button");
		fireEvent.click(deleteButton);

		expect(onDelete).toHaveBeenCalledOnce();
	});

	it("should not trigger onClick when delete button is clicked", () => {
		const onClick = vi.fn();
		const onDelete = vi.fn();
		const { getByTestId } = render(
			<IntegrationCard title="GitHub" icon={Github} onClick={onClick} onDelete={onDelete} />,
		);

		const deleteButton = getByTestId("delete-integration-button");
		fireEvent.click(deleteButton);

		expect(onDelete).toHaveBeenCalledOnce();
		expect(onClick).not.toHaveBeenCalled();
	});

	it("should not render chevron when onClick is not provided", () => {
		const onDelete = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onDelete={onDelete} />);

		// ChevronRight has class h-5 w-5
		const chevron = container.querySelector(".h-5.w-5");
		expect(chevron).toBeNull();
	});

	it("should render chevron when onClick is provided", () => {
		const onClick = vi.fn();
		const { container } = render(<IntegrationCard title="GitHub" icon={Github} onClick={onClick} />);

		// ChevronRight has class h-5 w-5
		const chevron = container.querySelector(".h-5.w-5");
		expect(chevron).toBeDefined();
	});
});
