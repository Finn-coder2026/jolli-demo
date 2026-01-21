import { RepositoryEmptyState } from "./RepositoryEmptyState";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RepositoryEmptyState", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should show 'No repositories found' when totalRepoCount is 0", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={0} showAllRepos={true} onShowAll={onShowAll} />);

		expect(screen.getByText("No repositories found")).toBeDefined();
		expect(screen.getByText("This installation doesn't have access to any repositories.")).toBeDefined();
	});

	it("should show 'No enabled repositories' when totalRepoCount > 0 but filtered", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={5} showAllRepos={false} onShowAll={onShowAll} />);

		expect(screen.getByText("No enabled repositories")).toBeDefined();
		expect(screen.getByText("Enable repositories to start generating documentation.")).toBeDefined();
	});

	it("should show View All Repositories button when filtered and repos exist", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={5} showAllRepos={false} onShowAll={onShowAll} />);

		expect(screen.getByText("View All Repositories")).toBeDefined();
	});

	it("should not show View All Repositories button when showing all repos", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={5} showAllRepos={true} onShowAll={onShowAll} />);

		expect(screen.queryByText("View All Repositories")).toBeNull();
	});

	it("should not show View All Repositories button when no repos exist", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={0} showAllRepos={false} onShowAll={onShowAll} />);

		expect(screen.queryByText("View All Repositories")).toBeNull();
	});

	it("should call onShowAll when View All Repositories button is clicked", () => {
		const onShowAll = vi.fn();
		render(<RepositoryEmptyState totalRepoCount={5} showAllRepos={false} onShowAll={onShowAll} />);

		const viewAllButton = screen.getByText("View All Repositories");
		fireEvent.click(viewAllButton);

		expect(onShowAll).toHaveBeenCalledTimes(1);
	});
});
