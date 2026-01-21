import { ClientProvider } from "../../../contexts/ClientContext";
import { GitHubRepositoryItem, getAccessErrorMessage } from "./GitHubRepositoryItem";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

describe("GitHubRepositoryItem", () => {
	it("should render repository name and branch", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem
					repo={repo}
					onToggleSuccess={vi.fn()}
					onToggleError={vi.fn()}
					isFadingOut={false}
				/>
			</TestWrapper>,
		);

		expect(screen.getByText("test-repo")).toBeDefined();
		expect(screen.getByText("Branch: main")).toBeDefined();
	});

	it("should apply fade-out class when isFadingOut is true", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		const { container } = render(
			<TestWrapper>
				<GitHubRepositoryItem
					repo={repo}
					onToggleSuccess={vi.fn()}
					onToggleError={vi.fn()}
					isFadingOut={true}
				/>
			</TestWrapper>,
		);

		const repoItem = container.querySelector(".opacity-0");
		expect(repoItem).toBeDefined();
	});

	it("should show Available badge for disabled repo", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Available")).toBeDefined();
	});

	it("should show Enabled badge for enabled repo", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "active" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Enabled")).toBeDefined();
	});

	it("should show Needs Attention badge for needs_repo_access status", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Needs Attention")).toBeDefined();
	});

	it("should show Error badge for error status", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "error" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Error")).toBeDefined();
	});

	it("should enable repo when clicking toggle", async () => {
		const enableRepo = vi.fn().mockResolvedValue({});
		mockClient.github.mockReturnValue({
			enableRepo,
			disableRepo: vi.fn(),
		});

		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={onToggleSuccess} onToggleError={onToggleError} />
			</TestWrapper>,
		);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(false);

		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(enableRepo).toHaveBeenCalledWith("owner", "test-repo", "main");
		});

		await waitFor(() => {
			expect(onToggleSuccess).toHaveBeenCalledWith(repo, true);
		});

		expect(onToggleError).not.toHaveBeenCalled();
	});

	it("should disable repo when clicking toggle", async () => {
		const disableRepo = vi.fn().mockResolvedValue({});
		mockClient.github.mockReturnValue({
			enableRepo: vi.fn(),
			disableRepo,
		});

		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "develop",
			enabled: true,
			status: "active" as const,
		};

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={onToggleSuccess} onToggleError={onToggleError} />
			</TestWrapper>,
		);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(true);

		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(disableRepo).toHaveBeenCalledWith("owner", "test-repo");
		});

		await waitFor(() => {
			expect(onToggleSuccess).toHaveBeenCalledWith(repo, false);
		});

		expect(onToggleError).not.toHaveBeenCalled();
	});

	it("should call onToggleError when toggle fails with Error object", async () => {
		const enableRepo = vi.fn().mockRejectedValue(new Error("Failed to enable"));
		mockClient.github.mockReturnValue({
			enableRepo,
			disableRepo: vi.fn(),
		});

		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={onToggleSuccess} onToggleError={onToggleError} />
			</TestWrapper>,
		);

		const checkbox = screen.getByRole("checkbox");
		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(onToggleError).toHaveBeenCalledWith("Failed to enable");
		});

		expect(onToggleSuccess).not.toHaveBeenCalled();
	});

	it("should call onToggleError when toggle fails with non-Error object", async () => {
		const enableRepo = vi.fn().mockRejectedValue("Unknown error");
		mockClient.github.mockReturnValue({
			enableRepo,
			disableRepo: vi.fn(),
		});

		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		const onToggleSuccess = vi.fn();
		const onToggleError = vi.fn();

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={onToggleSuccess} onToggleError={onToggleError} />
			</TestWrapper>,
		);

		const checkbox = screen.getByRole("checkbox");
		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(onToggleError).toHaveBeenCalledWith("Failed to toggle repository");
		});

		expect(onToggleSuccess).not.toHaveBeenCalled();
	});

	it("should show last access check date when provided", () => {
		const lastCheckDate = new Date("2024-01-15T10:00:00Z");

		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "active" as const,
			lastAccessCheck: lastCheckDate.toISOString(),
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText(/Last checked:/)).toBeDefined();
		expect(screen.getByText(new RegExp(lastCheckDate.toLocaleDateString()))).toBeDefined();
	});

	it("should show access error message when provided", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
			accessError: "repoNotAccessibleByApp" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Repository is not accessible by the GitHub App")).toBeDefined();
	});

	it("should show repoRemovedFromInstallation error message", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
			accessError: "repoRemovedFromInstallation" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Repository was removed from GitHub App installation")).toBeDefined();
	});

	it("should show appInstallationUninstalled error message", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
			accessError: "appInstallationUninstalled" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("GitHub App installation was uninstalled")).toBeDefined();
	});

	it("should show repoNotAccessibleViaInstallation error message", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
			accessError: "repoNotAccessibleViaInstallation" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Repository is not accessible via GitHub App installation")).toBeDefined();
	});

	it("should show unknown error key as-is for unrecognized error types", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
			// biome-ignore lint/suspicious/noExplicitAny: Testing default case with unknown error type
			accessError: "someUnknownError" as any,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("someUnknownError")).toBeDefined();
	});

	it("should show detailed instructions for needs_repo_access status", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Repository not accessible")).toBeDefined();
		expect(screen.getByText(/This repository is no longer included/)).toBeDefined();
		expect(screen.getByText(/Click "Manage installation on GitHub" above/)).toBeDefined();
	});

	it("should disable toggle when status is needs_repo_access", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "needs_repo_access" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.disabled).toBe(true);
	});

	it("should update optimistic state when repo.enabled prop changes", async () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: false,
			status: "available" as const,
		};

		const { rerender } = render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		const checkbox1 = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox1.checked).toBe(false);

		// Update prop
		const updatedRepo = { ...repo, enabled: true };
		rerender(
			<TestWrapper>
				<GitHubRepositoryItem repo={updatedRepo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		await waitFor(() => {
			const checkbox2 = screen.getByRole("checkbox") as HTMLInputElement;
			expect(checkbox2.checked).toBe(true);
		});
	});

	it("should show active status as 'Enabled' badge", () => {
		const repo = {
			fullName: "owner/test-repo",
			defaultBranch: "main",
			enabled: true,
			status: "active" as const,
		};

		render(
			<TestWrapper>
				<GitHubRepositoryItem repo={repo} onToggleSuccess={vi.fn()} onToggleError={vi.fn()} />
			</TestWrapper>,
		);

		expect(screen.getByText("Enabled")).toBeDefined();
	});
});
describe("getAccessErrorMessage", () => {
	it("should return empty string when accessError is undefined", () => {
		const mockContent = {
			accessErrors: {
				repoNotAccessibleByApp: { value: "Test message" },
			},
			// biome-ignore lint/suspicious/noExplicitAny: Mock object for unit test
		} as any;

		const result = getAccessErrorMessage(undefined, mockContent);

		expect(result).toBe("");
	});
});
