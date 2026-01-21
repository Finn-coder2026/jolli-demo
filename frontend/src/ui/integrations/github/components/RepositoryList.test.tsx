import { ClientProvider } from "../../../../contexts/ClientContext";
import { RepositoryList } from "./RepositoryList";
import { render, screen } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
	github: vi.fn(() => ({
		enableRepo: vi.fn(),
		disableRepo: vi.fn(),
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

function TestWrapper({ children }: { children: ReactNode }) {
	return <ClientProvider>{children}</ClientProvider>;
}

describe("RepositoryList", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render a list of repositories", () => {
		const repos = [
			{
				fullName: "owner/repo1",
				defaultBranch: "main",
				enabled: true,
				status: "active" as const,
			},
			{
				fullName: "owner/repo2",
				defaultBranch: "develop",
				enabled: false,
				status: "available" as const,
			},
		];

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<RepositoryList
					repositories={repos}
					onToggleSuccess={onToggleSuccess}
					onToggleError={onToggleError}
					fadingOutRepos={new Set()}
				/>
			</TestWrapper>,
		);

		expect(screen.getByText("repo1")).toBeDefined();
		expect(screen.getByText("repo2")).toBeDefined();
	});

	it("should render empty when no repositories provided", () => {
		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		const { container } = render(
			<TestWrapper>
				<RepositoryList
					repositories={[]}
					onToggleSuccess={onToggleSuccess}
					onToggleError={onToggleError}
					fadingOutRepos={new Set()}
				/>
			</TestWrapper>,
		);

		// Should render an empty div with space-y-3 class
		const listContainer = container.querySelector(".space-y-3");
		expect(listContainer).toBeDefined();
		expect(listContainer?.children.length).toBe(0);
	});

	it("should render multiple repositories", () => {
		const repos = [
			{
				fullName: "owner/repo1",
				defaultBranch: "main",
				enabled: true,
				status: "active" as const,
			},
			{
				fullName: "owner/repo2",
				defaultBranch: "develop",
				enabled: false,
				status: "available" as const,
			},
			{
				fullName: "owner/repo3",
				defaultBranch: "staging",
				enabled: true,
				status: "active" as const,
			},
		];

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<RepositoryList
					repositories={repos}
					onToggleSuccess={onToggleSuccess}
					onToggleError={onToggleError}
					fadingOutRepos={new Set()}
				/>
			</TestWrapper>,
		);

		expect(screen.getByText("repo1")).toBeDefined();
		expect(screen.getByText("repo2")).toBeDefined();
		expect(screen.getByText("repo3")).toBeDefined();
	});
});
