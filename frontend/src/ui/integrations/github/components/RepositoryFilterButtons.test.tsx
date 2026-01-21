import { RepositoryFilterButtons } from "./RepositoryFilterButtons";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RepositoryFilterButtons", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render with All Repos selected", () => {
		const onShowAll = vi.fn();
		const onShowEnabledOnly = vi.fn();

		render(
			<RepositoryFilterButtons
				showAllRepos={true}
				enabledCount={5}
				onShowAll={onShowAll}
				onShowEnabledOnly={onShowEnabledOnly}
			/>,
		);

		expect(screen.getByText("All Repos")).toBeDefined();
		expect(screen.getByText("Enabled (5)")).toBeDefined();
	});

	it("should render with Enabled selected", () => {
		const onShowAll = vi.fn();
		const onShowEnabledOnly = vi.fn();

		render(
			<RepositoryFilterButtons
				showAllRepos={false}
				enabledCount={3}
				onShowAll={onShowAll}
				onShowEnabledOnly={onShowEnabledOnly}
			/>,
		);

		expect(screen.getByText("All Repos")).toBeDefined();
		expect(screen.getByText("Enabled (3)")).toBeDefined();
	});

	it("should call onShowAll when All Repos button is clicked", () => {
		const onShowAll = vi.fn();
		const onShowEnabledOnly = vi.fn();

		render(
			<RepositoryFilterButtons
				showAllRepos={false}
				enabledCount={5}
				onShowAll={onShowAll}
				onShowEnabledOnly={onShowEnabledOnly}
			/>,
		);

		const allReposButton = screen.getByText("All Repos");
		fireEvent.click(allReposButton);

		expect(onShowAll).toHaveBeenCalledTimes(1);
	});

	it("should call onShowEnabledOnly when Enabled button is clicked", () => {
		const onShowAll = vi.fn();
		const onShowEnabledOnly = vi.fn();

		render(
			<RepositoryFilterButtons
				showAllRepos={true}
				enabledCount={5}
				onShowAll={onShowAll}
				onShowEnabledOnly={onShowEnabledOnly}
			/>,
		);

		const enabledOnlyButton = screen.getByText("Enabled (5)");
		fireEvent.click(enabledOnlyButton);

		expect(onShowEnabledOnly).toHaveBeenCalledTimes(1);
	});

	it("should display correct enabled count", () => {
		const onShowAll = vi.fn();
		const onShowEnabledOnly = vi.fn();

		render(
			<RepositoryFilterButtons
				showAllRepos={true}
				enabledCount={12}
				onShowAll={onShowAll}
				onShowEnabledOnly={onShowEnabledOnly}
			/>,
		);

		expect(screen.getByText("Enabled (12)")).toBeDefined();
	});
});
