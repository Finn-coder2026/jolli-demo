import { GitHubPageHeader } from "./GitHubPageHeader";
import { render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GitHubPageHeader", () => {
	const defaultProps = {
		containerName: "test-org",
		containerType: "org" as const,
		loading: false,
		onSync: vi.fn(),
	};

	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render organization header", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} />);
		expect(container.textContent).toContain("test-org Repositories");
		expect(container.textContent).toContain("Organization");
	});

	it("should render user header", () => {
		const { container } = render(
			<GitHubPageHeader {...defaultProps} containerType="user" containerName="test-user" />,
		);
		expect(container.textContent).toContain("test-user Repositories");
		expect(container.textContent).toContain("User");
	});

	it("should render description text", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} />);
		expect(container.textContent).toContain("Enable repositories for Jolli to interact with");
	});

	it("should not render installation link when installationId is missing", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} appSlug="test-app" />);
		const link = container.querySelector("a");
		expect(link).toBeNull();
	});

	it("should not render installation link when appSlug is missing", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} installationId={12345} />);
		const link = container.querySelector("a");
		expect(link).toBeNull();
	});

	it("should render installation link when both installationId and appSlug are provided", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} installationId={12345} appSlug="test-app" />);
		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.href).toBe("https://github.com/apps/test-app/installations/12345");
		expect(link?.target).toBe("_blank");
		expect(link?.rel).toBe("noopener noreferrer");
		expect(link?.textContent).toContain("Manage installation on GitHub");
	});

	it("should render sync button", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} />);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toContain("Sync");
	});

	it("should call onSync when sync button is clicked", () => {
		const onSync = vi.fn();
		const { container } = render(<GitHubPageHeader {...defaultProps} onSync={onSync} />);
		const button = container.querySelector("button");
		button?.click();
		expect(onSync).toHaveBeenCalledTimes(1);
	});

	it("should disable sync button when loading", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} loading={true} />);
		const button = container.querySelector("button");
		expect(button?.disabled).toBe(true);
	});

	it("should not disable sync button when not loading", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} loading={false} />);
		const button = container.querySelector("button");
		expect(button?.disabled).toBe(false);
	});

	it("should show spinning icon when loading", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} loading={true} />);
		const icon = container.querySelector(".animate-spin");
		expect(icon).toBeDefined();
	});

	it("should not show spinning icon when not loading", () => {
		const { container } = render(<GitHubPageHeader {...defaultProps} loading={false} />);
		const icon = container.querySelector(".animate-spin");
		expect(icon).toBeNull();
	});
});
