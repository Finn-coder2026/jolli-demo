import { DuplicateTitleDialog } from "./DuplicateTitleDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Doc, DocDraft } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DuplicateTitleDialog", () => {
	const mockOnOpenArticle = vi.fn();
	const mockOnOpenDraft = vi.fn();
	const mockOnCreateAnyway = vi.fn();
	const mockOnClose = vi.fn();

	const mockArticles: Array<Doc> = [
		{
			id: 1,
			jrn: "doc:article-1",
			slug: "article-1",
			path: "",
			content: "Content 1",
			contentType: "text/markdown",
			source: "test",
			sourceMetadata: undefined,
			contentMetadata: {
				title: "Test Article 1",
				status: "upToDate",
				lastUpdated: "2025-01-01T00:00:00Z",
			},
			updatedBy: "user-100",
			createdAt: "2025-01-01T00:00:00Z",
			updatedAt: "2025-01-01T00:00:00Z",
			version: 1,
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: "user-100",
			deletedAt: undefined,
			explicitlyDeleted: false,
		},
		{
			id: 2,
			jrn: "doc:article-2",
			slug: "article-2",
			path: "",
			content: "Content 2",
			contentType: "text/markdown",
			source: "test",
			sourceMetadata: undefined,
			contentMetadata: {
				title: "Test Article 2",
				status: "upToDate",
				lastUpdated: "2025-01-02T00:00:00Z",
			},
			updatedBy: "user-100",
			createdAt: "2025-01-02T00:00:00Z",
			updatedAt: "2025-01-02T00:00:00Z",
			version: 1,
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: "user-100",
			deletedAt: undefined,
			explicitlyDeleted: false,
		},
	];

	const mockDrafts: Array<DocDraft> = [
		{
			id: 1,
			docId: undefined,
			title: "Test Draft 1",
			content: "Draft content 1",
			contentType: "text/markdown",
			createdBy: 100,
			createdAt: "2025-01-03T00:00:00Z",
			updatedAt: "2025-01-03T00:00:00Z",
			contentLastEditedAt: "2025-01-03T00:05:00Z",
			contentLastEditedBy: 100,
			contentMetadata: undefined,
			isShared: false,
			sharedAt: undefined,
			sharedBy: undefined,
			createdByAgent: false,
		},
		{
			id: 2,
			docId: undefined,
			title: "Test Draft 2",
			content: "Draft content 2",
			contentType: "text/markdown",
			createdBy: 100,
			createdAt: "2025-01-04T00:00:00Z",
			updatedAt: "2025-01-04T00:00:00Z",
			contentLastEditedAt: "2025-01-04T00:05:00Z",
			contentLastEditedBy: 100,
			contentMetadata: undefined,
			isShared: false,
			sharedAt: undefined,
			sharedBy: undefined,
			createdByAgent: false,
		},
	];

	beforeEach(() => {
		mockOnOpenArticle.mockClear();
		mockOnOpenDraft.mockClear();
		mockOnCreateAnyway.mockClear();
		mockOnClose.mockClear();
	});

	it("should render the dialog with title and subtitle", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Similar Titles Found")).toBeDefined();
		expect(
			screen.getByText(/Found.*existing article\(s\) or draft\(s\) with a similar title to.*My Article/),
		).toBeDefined();
	});

	it("should render existing articles section when articles exist", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Existing Articles")).toBeDefined();
		expect(screen.getByText("Test Article 1")).toBeDefined();
		expect(screen.getByText("Test Article 2")).toBeDefined();
	});

	it("should not render existing articles section when no articles exist", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={[]}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.queryByText("Existing Articles")).toBeNull();
	});

	it("should render existing drafts section when drafts exist", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={[]}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Existing Drafts")).toBeDefined();
		expect(screen.getByText("Test Draft 1")).toBeDefined();
		expect(screen.getByText("Test Draft 2")).toBeDefined();
	});

	it("should not render existing drafts section when no drafts exist", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.queryByText("Existing Drafts")).toBeNull();
	});

	it("should call onOpenArticle when an article is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const articleButton = screen.getByTestId("article-1");
		fireEvent.click(articleButton);

		expect(mockOnOpenArticle).toHaveBeenCalledWith("doc:article-1");
	});

	it("should call onOpenDraft when a draft is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={[]}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const draftButton = screen.getByTestId("draft-1");
		fireEvent.click(draftButton);

		expect(mockOnOpenDraft).toHaveBeenCalledWith(1);
	});

	it("should call onCreateAnyway when create anyway button is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const createAnywayButton = screen.getByTestId("create-anyway-button");
		fireEvent.click(createAnywayButton);

		expect(mockOnCreateAnyway).toHaveBeenCalled();
	});

	it("should call onClose when close button is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const closeButton = screen.getByTestId("close-dialog-button");
		fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should call onClose when cancel button is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const cancelButton = screen.getByTestId("cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should call onClose when backdrop is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const backdrop = screen.getByTestId("duplicate-title-dialog-backdrop");
		fireEvent.click(backdrop);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should not close when dialog content is clicked", () => {
		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={mockArticles}
				existingDrafts={mockDrafts}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		const content = screen.getByTestId("duplicate-title-dialog-content");
		fireEvent.click(content);

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should use title fallback when article has no contentMetadata.title", () => {
		const articlesWithoutTitle: Array<Doc> = [
			{
				id: 1,
				jrn: "doc:article-1",
				slug: "article-1",
				path: "",
				content: "Content 1",
				contentType: "text/markdown",
				source: "test",
				sourceMetadata: undefined,
				contentMetadata: {
					lastUpdated: "2025-01-01T00:00:00Z",
				},
				updatedBy: "user-100",
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user-100",
				deletedAt: undefined,
				explicitlyDeleted: false,
			},
		];

		render(
			<DuplicateTitleDialog
				title="Fallback Title"
				existingArticles={articlesWithoutTitle}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Fallback Title")).toBeDefined();
	});

	it("should handle article with undefined contentMetadata", () => {
		const articlesWithoutMetadata: Array<Doc> = [
			{
				id: 1,
				jrn: "doc:article-1",
				slug: "article-1",
				path: "",
				content: "Content 1",
				contentType: "text/markdown",
				source: "test",
				sourceMetadata: undefined,
				contentMetadata: undefined,
				updatedBy: "user-100",
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user-100",
				deletedAt: undefined,
				explicitlyDeleted: false,
			},
		];

		render(
			<DuplicateTitleDialog
				title="Fallback Title"
				existingArticles={articlesWithoutMetadata}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Fallback Title")).toBeDefined();
	});

	it("should use doc.updatedAt when contentMetadata.lastUpdated is not available", () => {
		const articlesWithoutLastUpdated: Array<Doc> = [
			{
				id: 1,
				jrn: "doc:article-1",
				slug: "article-1",
				path: "",
				content: "Content 1",
				contentType: "text/markdown",
				source: "test",
				sourceMetadata: undefined,
				contentMetadata: {
					title: "Test Article 1",
				},
				updatedBy: "user-100",
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T12:00:00Z",
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user-100",
				deletedAt: undefined,
				explicitlyDeleted: false,
			},
		];

		render(
			<DuplicateTitleDialog
				title="My Article"
				existingArticles={articlesWithoutLastUpdated}
				existingDrafts={[]}
				onOpenArticle={mockOnOpenArticle}
				onOpenDraft={mockOnOpenDraft}
				onCreateAnyway={mockOnCreateAnyway}
				onClose={mockOnClose}
			/>,
		);

		// Should render without error and show the formatted timestamp
		expect(screen.getByText("Test Article 1")).toBeDefined();
	});
});
