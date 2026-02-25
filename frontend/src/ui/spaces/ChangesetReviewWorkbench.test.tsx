import { toast } from "../../components/ui/Sonner";
import { ChangesetReviewWorkbench } from "./ChangesetReviewWorkbench";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetChangesetFiles = vi.fn();
const mockReviewChangesetFile = vi.fn();
const mockPublishChangeset = vi.fn();

vi.mock("../../contexts/ClientContext", () => ({
	useClient: () => ({
		syncChangesets: () => ({
			getChangesetFiles: mockGetChangesetFiles,
			reviewChangesetFile: mockReviewChangesetFile,
			publishChangeset: mockPublishChangeset,
		}),
	}),
}));

vi.mock("../../components/ui/Sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../components/GitHubStyleDiff", () => ({
	GitHubStyleDiff: ({
		oldContent,
		newContent,
		testId,
	}: {
		oldContent: string;
		newContent: string;
		testId?: string;
	}) => (
		<div data-testid={testId ?? "mock-diff"} data-old-content={oldContent} data-new-content={newContent}>
			mock diff
		</div>
	),
}));

const baseChangeset = {
	id: 501,
	seq: 1,
	message: "Bundle review",
	mergePrompt: null,
	pushedBy: null,
	clientChangesetId: "CID-501",
	status: "proposed",
	commitScopeKey: "space:1",
	targetBranch: "main",
	payloadHash: "hash-501",
	publishedAt: null,
	publishedBy: null,
	createdAt: "2024-01-01T00:00:00.000Z",
	summary: {
		totalFiles: 2,
		accepted: 0,
		rejected: 0,
		amended: 0,
		pending: 2,
		additions: 4,
		deletions: 2,
	},
} as const;

describe("ChangesetReviewWorkbench", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReviewChangesetFile.mockResolvedValue({});
		mockPublishChangeset.mockResolvedValue({ hasConflicts: false });
	});

	it("renders an affected-file-only tree", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 1,
				commitId: 501,
				fileId: "f1",
				docJrn: "sync:f1",
				serverPath: "docs/getting-started.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-1",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/getting-started.md",
				currentStatus: "ok",
				latestReview: null,
			},
			{
				id: 2,
				commitId: 501,
				fileId: "f2",
				docJrn: "sync:f2",
				serverPath: "guides/setup/install.md",
				baseContent: "",
				baseVersion: 0,
				incomingContent: "# install",
				incomingContentHash: "hash-2",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: null,
				currentVersion: null,
				currentServerPath: null,
				currentStatus: "missing",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} spaceSlug="default" />);

		await waitFor(() => {
			expect(screen.getByTestId("affected-file-node-1")).toBeDefined();
			expect(screen.getByTestId("affected-file-node-2")).toBeDefined();
		});
		expect(screen.getByText("docs")).toBeDefined();
		expect(screen.getByText("guides")).toBeDefined();
		expect(screen.queryByText("unrelated.md")).toBeNull();
	});

	it("defaults visual diff direction to current -> incoming", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 3,
				commitId: 501,
				fileId: "f3",
				docJrn: "sync:f3",
				serverPath: "docs/direction.md",
				baseContent: "# base direction",
				baseVersion: 1,
				incomingContent: "# incoming direction",
				incomingContentHash: "hash-3",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current direction",
				currentVersion: 2,
				currentServerPath: "docs/direction.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-main-diff")).toBeDefined();
		});

		const mainDiff = screen.getByTestId("changeset-main-diff");
		expect(mainDiff.getAttribute("data-old-content")).toBe("# current direction");
		expect(mainDiff.getAttribute("data-new-content")).toBe("# incoming direction");
	});

	it("wires current/base/incoming values into 3-way compare views", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 4,
				commitId: 501,
				fileId: "f4",
				docJrn: "sync:f4",
				serverPath: "docs/three-way.md",
				baseContent: ["title: doc", "value: base"].join("\n"),
				baseVersion: 8,
				incomingContent: ["title: doc", "value: incoming"].join("\n"),
				incomingContentHash: "hash-4",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: ["title: doc", "value: current"].join("\n"),
				currentVersion: 10,
				currentServerPath: "docs/three-way.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("Current")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Current"));
		expect(screen.getByTestId("changeset-current-content").textContent).toContain("value: current");

		fireEvent.click(screen.getByText("Base"));
		expect(screen.getByTestId("changeset-base-content").textContent).toContain("value: base");

		fireEvent.click(screen.getByText("Incoming"));
		expect(screen.getByTestId("changeset-incoming-content").textContent).toContain("value: incoming");

		fireEvent.click(screen.getByText("3-way Preview"));
		const mergedPreview = screen.getByTestId("changeset-three-way-preview").textContent ?? "";
		expect(mergedPreview).toContain("<<<<<<< CURRENT");
		expect(mergedPreview).toContain("value: current");
		expect(mergedPreview).toContain("value: incoming");
	});

	it("calls onChangesetMutated after review actions", async () => {
		const onChangesetMutated = vi.fn();
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 5,
				commitId: 501,
				fileId: "f5",
				docJrn: "sync:f5",
				serverPath: "docs/review.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-5",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/review.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} onChangesetMutated={onChangesetMutated} />);

		await waitFor(() => {
			expect(screen.getByTestId("review-accept-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("review-accept-button"));
		await waitFor(() => {
			expect(mockReviewChangesetFile).toHaveBeenCalled();
		});
		expect(onChangesetMutated).toHaveBeenCalledTimes(1);
	});

	it("calls onChangesetMutated after publish actions", async () => {
		const onChangesetMutated = vi.fn();
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 6,
				commitId: 501,
				fileId: "f6",
				docJrn: "sync:f6",
				serverPath: "docs/publish.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-6",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/publish.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} onChangesetMutated={onChangesetMutated} />);

		await waitFor(() => {
			expect(screen.getByTestId("publish-changeset-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("publish-changeset-button"));
		await waitFor(() => {
			expect(mockPublishChangeset).toHaveBeenCalled();
		});
		expect(onChangesetMutated).toHaveBeenCalledTimes(1);
	});

	it("renders onCloseReview button when provided", async () => {
		const onCloseReview = vi.fn();
		mockGetChangesetFiles.mockResolvedValue([]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} onCloseReview={onCloseReview} />);

		await waitFor(() => {
			expect(screen.getByTestId("close-review-workbench-button")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("close-review-workbench-button"));
		expect(onCloseReview).toHaveBeenCalledTimes(1);
	});

	it("shows load error when getChangesetFiles rejects", async () => {
		mockGetChangesetFiles.mockRejectedValue(new Error("network error"));

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("Failed to load bundle files")).toBeDefined();
		});
	});

	it("shows empty state when no files in bundle", async () => {
		mockGetChangesetFiles.mockResolvedValue([]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("No file changes in this bundle.")).toBeDefined();
		});
		expect(screen.getByText("No affected files")).toBeDefined();
	});

	it("shows no-file-selected prompt when selectedFile is cleared", async () => {
		mockGetChangesetFiles.mockResolvedValue([]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("Select a changed file to review.")).toBeDefined();
		});
	});

	it("renders review badges for accepted, rejected, and amended files", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 10,
				commitId: 501,
				fileId: "fa",
				docJrn: "sync:fa",
				serverPath: "docs/accepted.md",
				baseContent: "",
				baseVersion: 0,
				incomingContent: "# accepted",
				incomingContentHash: "hash-a",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 1,
				currentServerPath: "docs/accepted.md",
				currentStatus: "ok",
				latestReview: { decision: "accept" },
			},
			{
				id: 11,
				commitId: 501,
				fileId: "fb",
				docJrn: "sync:fb",
				serverPath: "docs/rejected.md",
				baseContent: "",
				baseVersion: 0,
				incomingContent: "# rejected",
				incomingContentHash: "hash-b",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 1,
				currentServerPath: "docs/rejected.md",
				currentStatus: "ok",
				latestReview: { decision: "reject" },
			},
			{
				id: 12,
				commitId: 501,
				fileId: "fc",
				docJrn: "sync:fc",
				serverPath: "docs/amended.md",
				baseContent: "",
				baseVersion: 0,
				incomingContent: "# amended",
				incomingContentHash: "hash-c",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 1,
				currentServerPath: "docs/amended.md",
				currentStatus: "moved",
				latestReview: { decision: "amend" },
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("accepted")).toBeDefined();
		});
		expect(screen.getByText("rejected")).toBeDefined();
		expect(screen.getByText("amended")).toBeDefined();
		// "moved" status label from getCurrentStatusLabel
		expect(screen.getByText("moved")).toBeDefined();
	});

	it("toggles file expansion to collapse and re-expand", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 20,
				commitId: 501,
				fileId: "f20",
				docJrn: "sync:f20",
				serverPath: "docs/toggle.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-20",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/toggle.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-toggle-diff-20")).toBeDefined();
		});
		// Initially expanded — left diff should be visible
		expect(screen.getByTestId("changeset-left-diff-20")).toBeDefined();

		// Collapse
		fireEvent.click(screen.getByTestId("changeset-toggle-diff-20"));
		await waitFor(() => {
			expect(screen.queryByTestId("changeset-left-diff-20")).toBeNull();
		});

		// Re-expand
		fireEvent.click(screen.getByTestId("changeset-toggle-diff-20"));
		await waitFor(() => {
			expect(screen.getByTestId("changeset-left-diff-20")).toBeDefined();
		});
	});

	it("shows toast error on publish with conflicts", async () => {
		mockPublishChangeset.mockResolvedValue({ hasConflicts: true });
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 30,
				commitId: 501,
				fileId: "f30",
				docJrn: "sync:f30",
				serverPath: "docs/conflict.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-30",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/conflict.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("publish-changeset-button")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("publish-changeset-button"));
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Publish completed with conflicts");
		});
	});

	it("shows toast error when publish fails", async () => {
		mockPublishChangeset.mockRejectedValue(new Error("server error"));
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 31,
				commitId: 501,
				fileId: "f31",
				docJrn: "sync:f31",
				serverPath: "docs/fail-publish.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-31",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/fail-publish.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("publish-changeset-button")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("publish-changeset-button"));
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Failed to publish changeset");
		});
	});

	it("shows toast error when review action fails", async () => {
		mockReviewChangesetFile.mockRejectedValue(new Error("review error"));
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 32,
				commitId: 501,
				fileId: "f32",
				docJrn: "sync:f32",
				serverPath: "docs/fail-review.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-32",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/fail-review.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("review-reject-button")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("review-reject-button"));
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Failed to record review decision");
		});
	});

	it("sends amend decision with amendedContent from 3-way merge", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 33,
				commitId: 501,
				fileId: "f33",
				docJrn: "sync:f33",
				serverPath: "docs/amend-review.md",
				baseContent: "line1\nline2\n",
				baseVersion: 1,
				incomingContent: "line1\nline2-incoming\n",
				incomingContentHash: "hash-33",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "line1\nline2\n",
				currentVersion: 2,
				currentServerPath: "docs/amend-review.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("review-amend-button")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("review-amend-button"));
		await waitFor(() => {
			expect(mockReviewChangesetFile).toHaveBeenCalledWith(
				501,
				33,
				expect.objectContaining({ decision: "amend", amendedContent: expect.any(String) }),
				undefined,
			);
		});
	});

	it("retains selectedFileId when files reload and file still exists", async () => {
		const files = [
			{
				id: 40,
				commitId: 501,
				fileId: "f40",
				docJrn: "sync:f40",
				serverPath: "docs/first.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-40",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/first.md",
				currentStatus: "ok",
				latestReview: null,
			},
			{
				id: 41,
				commitId: 501,
				fileId: "f41",
				docJrn: "sync:f41",
				serverPath: "docs/second.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-41",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/second.md",
				currentStatus: "ok",
				latestReview: null,
			},
		];
		mockGetChangesetFiles.mockResolvedValue(files);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-select-file-41")).toBeDefined();
		});

		// Select second file
		fireEvent.click(screen.getByTestId("changeset-select-file-41"));
		expect(screen.getByText("docs/second.md")).toBeDefined();
	});

	it("hides changeset message when it is null", async () => {
		mockGetChangesetFiles.mockResolvedValue([]);
		const noMessageChangeset = { ...baseChangeset, message: null };

		render(<ChangesetReviewWorkbench changeset={noMessageChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-review-workbench")).toBeDefined();
		});
		// "Bundle review" text should not appear
		expect(screen.queryByText("Bundle review")).toBeNull();
	});

	it("renders without spaceSlug (scopeOptions undefined)", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 50,
				commitId: 501,
				fileId: "f50",
				docJrn: "sync:f50",
				serverPath: "docs/no-scope.md",
				baseContent: "# base",
				baseVersion: 1,
				incomingContent: "# incoming",
				incomingContentHash: "hash-50",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current",
				currentVersion: 2,
				currentServerPath: "docs/no-scope.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-main-diff")).toBeDefined();
		});
		// scopeOptions should be undefined (no spaceSlug)
		expect(mockGetChangesetFiles).toHaveBeenCalledWith(501, undefined);
	});

	it("handles overlapping paths in affected file tree (same serverPath)", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 60,
				commitId: 501,
				fileId: "f60",
				docJrn: "sync:f60",
				serverPath: "docs/overlap.md",
				baseContent: "# base1",
				baseVersion: 1,
				incomingContent: "# incoming1",
				incomingContentHash: "hash-60",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current1",
				currentVersion: 1,
				currentServerPath: "docs/overlap.md",
				currentStatus: "ok",
				latestReview: null,
			},
			{
				id: 61,
				commitId: 501,
				fileId: "f61",
				docJrn: "sync:f61",
				serverPath: "docs/overlap.md",
				baseContent: "# base2",
				baseVersion: 2,
				incomingContent: "# incoming2",
				incomingContentHash: "hash-61",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# current2",
				currentVersion: 3,
				currentServerPath: "docs/overlap.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("affected-file-tree")).toBeDefined();
		});
		// Both files rendered in left pane even if tree node is shared
		expect(screen.getByTestId("changeset-file-card-60")).toBeDefined();
		expect(screen.getByTestId("changeset-file-card-61")).toBeDefined();
	});

	it("renders file with null incomingContent (delete op)", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 55,
				commitId: 501,
				fileId: "f55",
				docJrn: "sync:f55",
				serverPath: "docs/deleted.md",
				baseContent: "# was here",
				baseVersion: 3,
				incomingContent: null,
				incomingContentHash: null,
				opType: "delete",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: "# still here",
				currentVersion: 3,
				currentServerPath: "docs/deleted.md",
				currentStatus: "ok",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-main-diff")).toBeDefined();
		});
		// The diff should render with empty string for null incomingContent
		const mainDiff = screen.getByTestId("changeset-main-diff");
		expect(mainDiff.getAttribute("data-new-content")).toBe("");
	});

	it("renders file with null currentContent and currentVersion", async () => {
		mockGetChangesetFiles.mockResolvedValue([
			{
				id: 51,
				commitId: 501,
				fileId: "f51",
				docJrn: "sync:f51",
				serverPath: "docs/new-file.md",
				baseContent: "",
				baseVersion: 0,
				incomingContent: "# brand new",
				incomingContentHash: "hash-51",
				opType: "upsert",
				createdAt: "2024-01-01T00:00:00.000Z",
				currentContent: null,
				currentVersion: null,
				currentServerPath: null,
				currentStatus: "missing",
				latestReview: null,
			},
		]);

		render(<ChangesetReviewWorkbench changeset={baseChangeset} />);

		await waitFor(() => {
			expect(screen.getByText("Current v? • Base v0")).toBeDefined();
		});
		expect(screen.getByText("missing")).toBeDefined();
	});
});
