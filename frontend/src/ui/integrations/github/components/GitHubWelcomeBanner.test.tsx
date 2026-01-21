import { GitHubWelcomeBanner } from "./GitHubWelcomeBanner";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GitHubWelcomeBanner", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render with singular repository message", () => {
		const onDismiss = vi.fn();
		render(<GitHubWelcomeBanner repoCount={1} onDismiss={onDismiss} />);

		expect(screen.getByText("GitHub App Installed Successfully!")).toBeDefined();
		expect(screen.getByText(/enable the repository below/)).toBeDefined();
	});

	it("should render with plural repositories message", () => {
		const onDismiss = vi.fn();
		render(<GitHubWelcomeBanner repoCount={5} onDismiss={onDismiss} />);

		expect(screen.getByText("GitHub App Installed Successfully!")).toBeDefined();
		expect(screen.getByText(/enable one or more repositories below/)).toBeDefined();
	});

	it("should call onDismiss when Dismiss button is clicked", () => {
		const onDismiss = vi.fn();
		render(<GitHubWelcomeBanner repoCount={1} onDismiss={onDismiss} />);

		const dismissButton = screen.getByText("Dismiss");
		fireEvent.click(dismissButton);

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});
});
