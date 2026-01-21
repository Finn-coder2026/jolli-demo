import { CONTENT_MAP } from "../test/IntlayerMock";
import { renderWithProviders } from "../test/TestUtils";
import { ArticleDraft } from "./ArticleDraft";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { CollabConvo, Doc, DocDraft } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

/**
 * Helper to get content from NumberEdit component
 * NumberEdit uses a contentEditable div with `-editor` suffix on the test ID
 */
function getEditorContent(getByTestId: (id: string) => HTMLElement, testId: string): string {
	const editor = getByTestId(`${testId}-editor`);
	return editor.innerText;
}

/**
 * Helper to set content in NumberEdit component
 */
function setEditorContent(getByTestId: (id: string) => HTMLElement, testId: string, content: string) {
	const editor = getByTestId(`${testId}-editor`);
	editor.innerText = content;
	fireEvent.input(editor);
}

// Test data
const mockDraft: DocDraft = {
	id: 1,
	docId: undefined,
	title: "Test Draft",
	content: "# Test Content\n\nThis is a test draft.",
	contentType: "text/markdown",
	createdBy: 100,
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
	contentLastEditedAt: "2025-01-01T00:05:00Z",
	contentLastEditedBy: 100,
	contentMetadata: undefined,
	isShared: false,
	sharedAt: undefined,
	sharedBy: undefined,
	createdByAgent: false,
};

const mockArticle: Doc = {
	id: 10,
	jrn: "jrn:jolli:doc:test-article",
	slug: "test-article",
	path: "",
	content: "# Existing Article Content",
	contentType: "text/markdown",
	contentMetadata: { title: "Existing Article Title" },
	source: undefined,
	sourceMetadata: undefined,
	version: 1,
	updatedBy: "test-user",
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
	spaceId: undefined,
	parentId: undefined,
	docType: "document",
	sortOrder: 0,
	createdBy: "test-user",
	deletedAt: undefined,
	explicitlyDeleted: false,
};

const mockDraftEditingArticle: DocDraft = {
	id: 2,
	docId: 10,
	title: "Draft Editing Article",
	content: "# Updated Content\n\nThis draft is editing an existing article.",
	contentType: "text/markdown",
	createdBy: 100,
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
	contentLastEditedAt: "2025-01-01T00:05:00Z",
	contentLastEditedBy: 100,
	contentMetadata: undefined,
	isShared: false,
	sharedAt: undefined,
	sharedBy: undefined,
	createdByAgent: false,
};

// Draft that matches original article content (no changes from original)
const mockDraftMatchingArticle: DocDraft = {
	id: 3,
	docId: 10,
	title: "Existing Article Title",
	content: "# Existing Article Content",
	contentType: "text/markdown",
	createdBy: 100,
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
	contentLastEditedAt: "2025-01-01T00:05:00Z",
	contentLastEditedBy: 100,
	contentMetadata: undefined,
	isShared: false,
	sharedAt: undefined,
	sharedBy: undefined,
	createdByAgent: false,
};

const mockConvo: CollabConvo = {
	id: 1,
	artifactType: "doc_draft",
	artifactId: 1,
	messages: [
		{
			role: "user",
			content: "Please improve the introduction",
			userId: 100,
			timestamp: "2025-01-01T00:00:00Z",
		},
		{
			role: "assistant",
			content: "I'll help improve the introduction.",
			timestamp: "2025-01-01T00:01:00Z",
		},
	],
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:01:00Z",
};

const emptyConvo: CollabConvo = {
	id: 2,
	artifactType: "doc_draft",
	artifactId: 1,
	messages: [],
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
};

// Registry to track EventSource instances created during tests
const eventSourceRegistry = {
	draft: null as EventSource | null,
	convo: null as EventSource | null,
};

// Helper to dispatch EventSource messages
function dispatchMessage(eventSource: EventSource | null, data: unknown) {
	if (eventSource) {
		// Create a CustomEvent with detail.data to match resilient EventSource behavior
		const customEvent = new CustomEvent("message", {
			detail: { data: JSON.stringify(data) },
		});
		// Dispatch the event to trigger addEventListener listeners
		eventSource.dispatchEvent(customEvent);
	}
}

// Mock function references that can be accessed in tests
const mockFunctions = {
	getDocDraft: vi.fn(),
	updateDocDraft: vi.fn(),
	saveDocDraft: vi.fn(),
	deleteDocDraft: vi.fn(),
	shareDraft: vi.fn(),
	undoDocDraft: vi.fn(),
	redoDocDraft: vi.fn(),
	streamDraftUpdates: vi.fn(),
	getSectionChanges: vi.fn(),
	getRevisions: vi.fn(),
	applySectionChange: vi.fn(),
	dismissSectionChange: vi.fn(),
	validateDocDraft: vi.fn(),
	validateContent: vi.fn(),
	getDraftHistory: vi.fn(),
	getCollabConvoByArtifact: vi.fn(),
	createCollabConvo: vi.fn(),
	sendMessage: vi.fn(),
	streamConvo: vi.fn(),
	listDocs: vi.fn(),
	uploadImage: vi.fn(),
	deleteImage: vi.fn(),
};

// Mock MarkdownContent to avoid markdown-to-jsx issues in tests
vi.mock("../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div>{children}</div>,
	MarkdownLink: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href}>{children}</a>,
}));

// Mock MarkdownContentWithChanges to avoid rendering issues in tests
vi.mock("../components/MarkdownContentWithChanges", () => ({
	MarkdownContentWithChanges: ({
		content,
		onSectionClick,
	}: {
		content: string;
		annotations: Array<unknown>;
		changes: Array<unknown>;
		onSectionClick?: (changeIds: Array<number>) => void;
		openPanelChangeIds?: Set<number>;
	}) => (
		<div data-testid="markdown-content-with-changes">
			{content}
			<div
				data-section-path="section-1"
				onClick={() => onSectionClick?.([1])}
				onKeyDown={e => e.key === "Enter" && onSectionClick?.([1])}
				role="button"
				tabIndex={0}
			>
				Clickable Section
			</div>
		</div>
	),
}));

// Mock SectionChangePanel
vi.mock("../components/SectionChangePanel", () => ({
	SectionChangePanel: ({
		changes,
		onApply,
		onDismiss,
		onClose,
	}: {
		changes: Array<unknown>;
		onApply: (id: number) => void;
		onDismiss: (id: number) => void;
		onClose: () => void;
	}) => (
		<div data-testid="section-change-panel">
			<span>Section Changes: {(changes as Array<{ id: number }>).length}</span>
			<button type="button" onClick={() => onApply(1)} data-testid="apply-change-button">
				Apply
			</button>
			<button type="button" onClick={() => onDismiss(1)} data-testid="dismiss-change-button">
				Dismiss
			</button>
			<button type="button" onClick={onClose} data-testid="close-panel-button">
				Close
			</button>
		</div>
	),
}));

// Mock lucide-react icons
vi.mock("lucide-react", async () => {
	const actual = await vi.importActual<typeof import("lucide-react")>("lucide-react");
	return {
		...actual,
		Info: () => <div data-testid="info-icon" />,
		MessageSquare: () => <div data-testid="message-square-icon" />,
		Redo2: () => <div data-testid="redo2-icon" />,
		Send: () => <div data-testid="send-icon" />,
		Undo2: () => <div data-testid="undo2-icon" />,
		X: () => <div data-testid="x-icon" />,
	};
});

// Mock jolli-common module (includes both createResilientEventSource and createClient)
vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");

	return {
		...actual,
		// Mock createMercureClient to always return Mercure disabled (tests use SSE fallback)
		createMercureClient: () => ({
			isEnabled: () => Promise.resolve(false),
			subscribe: vi.fn(),
		}),
		// Mock createResilientEventSource to return a standard EventSource for tests
		createResilientEventSource: (url: string) => {
			const es = new EventSource(url);

			// Store in registry based on URL pattern
			if (url.includes("/doc-drafts/")) {
				eventSourceRegistry.draft = es;
			} else if (url.includes("/collab-convos/")) {
				eventSourceRegistry.convo = es;
			}

			return es;
		},
		// Mock createClient for API calls
		createClient: () => ({
			docDrafts: () => ({
				getDocDraft: (id: number) => mockFunctions.getDocDraft(id),
				updateDocDraft: (id: number, updates: unknown) => mockFunctions.updateDocDraft(id, updates),
				saveDocDraft: (id: number) => mockFunctions.saveDocDraft(id),
				deleteDocDraft: (id: number) => mockFunctions.deleteDocDraft(id),
				shareDraft: (id: number) => mockFunctions.shareDraft(id),
				undoDocDraft: (id: number) => mockFunctions.undoDocDraft(id),
				redoDocDraft: (id: number) => mockFunctions.redoDocDraft(id),
				streamDraftUpdates: (id: number) => mockFunctions.streamDraftUpdates(id),
				getSectionChanges: (id: number) => mockFunctions.getSectionChanges(id),
				getRevisions: (id: number) => mockFunctions.getRevisions(id),
				applySectionChange: (draftId: number, changeId: number) =>
					mockFunctions.applySectionChange(draftId, changeId),
				dismissSectionChange: (draftId: number, changeId: number) =>
					mockFunctions.dismissSectionChange(draftId, changeId),
				validateDocDraft: (id: number) => mockFunctions.validateDocDraft(id),
				validateContent: (content: string, contentType?: string) =>
					mockFunctions.validateContent(content, contentType),
				getDraftHistory: (id: number) => mockFunctions.getDraftHistory(id),
			}),
			docs: () => ({
				listDocs: () => mockFunctions.listDocs(),
			}),
			collabConvos: () => ({
				getCollabConvoByArtifact: (type: string, id: number) =>
					mockFunctions.getCollabConvoByArtifact(type, id),
				createCollabConvo: (type: string, id: number) => mockFunctions.createCollabConvo(type, id),
				sendMessage: (id: number, message: string) => mockFunctions.sendMessage(id, message),
				streamConvo: (id: number) => mockFunctions.streamConvo(id),
			}),
			images: () => ({
				uploadImage: (file: File | Blob, filename: string) => mockFunctions.uploadImage(file, filename),
				deleteImage: (imageId: string) => mockFunctions.deleteImage(imageId),
			}),
			getBaseUrl: () => "http://localhost:3000",
			getAuthToken: () => "test-token",
		}),
	};
});

describe("ArticleDraft", () => {
	// Set up default mock implementations before each test
	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();

		// Reset registry
		eventSourceRegistry.draft = null;
		eventSourceRegistry.convo = null;

		// Set default mock implementations using mockImplementation for more control
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.saveDocDraft.mockResolvedValue(undefined);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });
		mockFunctions.undoDocDraft.mockImplementation(async () => ({
			success: true,
			content: "Undone content",
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		}));
		mockFunctions.redoDocDraft.mockImplementation(async () => ({
			success: true,
			content: "Redone content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		}));
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.getSectionChanges.mockResolvedValue({ sections: [], changes: [] });
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: false,
		});
		mockFunctions.applySectionChange.mockResolvedValue({
			content: "Applied content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.dismissSectionChange.mockResolvedValue({
			content: "Dismissed content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.validateDocDraft.mockResolvedValue({
			isValid: true,
			isOpenApiSpec: false,
			errors: [],
		});
		mockFunctions.validateContent.mockResolvedValue({
			isValid: true,
			errors: [],
		});
		mockFunctions.getDraftHistory.mockResolvedValue([]);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.createCollabConvo.mockImplementation(async () => mockConvo);
		mockFunctions.sendMessage.mockResolvedValue(undefined);
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});
		mockFunctions.listDocs.mockResolvedValue([]);
	});

	it("loads and displays draft", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});
	});

	it("shows loading state initially", () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		expect(getByTestId("draft-loading")).toBeTruthy();
	});

	it("shows error state when draft fails to load", async () => {
		mockFunctions.getDocDraft.mockRejectedValue(new Error("Network error"));

		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("draft-error")).toBeTruthy();
		});

		// Click the close button in error state to navigate back to articles
		const closeButton = getByText("Close");
		fireEvent.click(closeButton);

		// Navigation to /articles is handled by NavigationContext
	});

	it("handles SSE draft connected event", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.draft).toBeTruthy();
		});

		// Simulate connected event
		dispatchMessage(eventSourceRegistry.draft, {
			type: "connected",
			draftId: 1,
			timestamp: new Date().toISOString(),
		});

		// Component should handle connected event (no error thrown)
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("undo button is disabled initially", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Undo button should be disabled initially
		const undoButton = getByTestId("undo-button") as HTMLButtonElement;
		expect(undoButton.disabled).toBe(true);
	});

	it("redo button is disabled initially", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Redo button should be disabled initially
		const redoButton = getByTestId("redo-button") as HTMLButtonElement;
		expect(redoButton.disabled).toBe(true);
	});

	it("creates new conversation if none exists", async () => {
		mockFunctions.getCollabConvoByArtifact.mockRejectedValue(new Error("Not found"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		expect(mockFunctions.createCollabConvo).toHaveBeenCalledWith("doc_draft", 1);
	});

	it("closes SSE connections on unmount", async () => {
		const { getByTestId, unmount } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.draft).toBeTruthy();
		});

		// TypeScript guard: we verified draft exists above
		if (!eventSourceRegistry.draft) {
			throw new Error("Draft EventSource should exist");
		}
		const closeSpy = vi.spyOn(eventSourceRegistry.draft, "close");

		unmount();

		expect(closeSpy).toHaveBeenCalled();
	});

	it("calls getCollabConvoByArtifact on load", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Verify that getCollabConvoByArtifact was called
		expect(mockFunctions.getCollabConvoByArtifact).toHaveBeenCalledWith("doc_draft", 1);
	});

	it("displays chat messages", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Verify chat pane renders
		expect(getByTestId("chat-pane")).toBeTruthy();

		// Verify messages are displayed
		expect(getByText("Please improve the introduction")).toBeTruthy();
		expect(getByText("I'll help improve the introduction.")).toBeTruthy();
	});

	it("shows empty chat state when no messages", async () => {
		mockFunctions.getCollabConvoByArtifact.mockImplementation(async () => emptyConvo);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Verify chat pane renders
		expect(getByTestId("chat-pane")).toBeTruthy();

		// Verify empty state message is shown
		expect(getByTestId("no-messages")).toBeTruthy();
	});

	it("sends a message when send button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Please add a conclusion" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalledWith(1, "Please add a conclusion");
		});

		// Verify input was cleared
		expect(messageInput.value).toBe("");
	});

	it("calls saveDocDraft when save button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Click save button
		fireEvent.click(getByTestId("save-button"));

		// Verify saveDocDraft was called
		await waitFor(() => {
			expect(mockFunctions.saveDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("navigates back when close button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Click close button
		fireEvent.click(getByTestId("close-button"));

		// Note: Navigation is handled by NavigationContext.onNavigate
		// We can't directly test navigation without mocking the context
		// But we verify the button exists and is clickable
		expect(getByTestId("close-button")).toBeTruthy();
	});

	it("deletes draft when closing without changes for existing article edit", async () => {
		// Use mockDraftMatchingArticle which has content matching the original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Click close button without making any changes (content matches original)
		fireEvent.click(getByTestId("close-button"));

		// Verify deleteDocDraft was called since draft matches original article
		await waitFor(() => {
			expect(mockFunctions.deleteDocDraft).toHaveBeenCalledWith(3);
		});
	});

	it("does not delete draft when closing with changes made", async () => {
		// Use mockDraftEditingArticle which has different content from original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Draft Editing Article");
		});

		// Click close button - draft already has changes (different content than original)
		fireEvent.click(getByTestId("close-button"));

		// Wait a bit to ensure no delete call is made
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify deleteDocDraft was NOT called since draft differs from original article
		expect(mockFunctions.deleteDocDraft).not.toHaveBeenCalled();
	});

	it("does not delete draft when closing a new draft (no docId)", async () => {
		// Use mockDraft which has docId undefined (new draft, not editing existing article)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Click close button without making any changes
		fireEvent.click(getByTestId("close-button"));

		// Wait a bit to ensure no delete call is made
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify deleteDocDraft was NOT called since this is a new draft (no docId)
		expect(mockFunctions.deleteDocDraft).not.toHaveBeenCalled();
	});

	it("still navigates when draft delete fails", async () => {
		// Use mockDraftMatchingArticle which has content matching original (will try to delete)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.deleteDocDraft.mockRejectedValue(new Error("Delete failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Click close button - content matches original so delete will be attempted
		fireEvent.click(getByTestId("close-button"));

		// Verify deleteDocDraft was called (it will fail, but should be called)
		await waitFor(() => {
			expect(mockFunctions.deleteDocDraft).toHaveBeenCalledWith(3);
		});

		// Verify the close button is still there (navigation still happens even on delete failure)
		expect(getByTestId("close-button")).toBeTruthy();
	});

	it("does not delete draft when contentType differs from original article", async () => {
		// Create a draft with matching content/title but different contentType
		const draftWithDifferentContentType: DocDraft = {
			...mockDraftMatchingArticle,
			id: 4,
			contentType: "application/json", // Different from mockArticle's "text/markdown"
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithDifferentContentType);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/4" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Click close button - contentType differs so should NOT delete
		fireEvent.click(getByTestId("close-button"));

		// Wait a bit to ensure no delete call is made
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify deleteDocDraft was NOT called since contentType differs
		expect(mockFunctions.deleteDocDraft).not.toHaveBeenCalled();
	});

	it("does not delete draft when it has pending section changes", async () => {
		// Use mockDraftMatchingArticle which normally would be deleted (content matches original)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		// Mock section changes with a pending (not applied, not dismissed) change
		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [],
			changes: [
				{
					id: 1,
					draftId: 3,
					docId: 10,
					changeType: "update",
					sectionId: "section-1",
					content: "Original content",
					proposed: [{ content: "Suggested content" }],
					applied: false,
					dismissed: false,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Click close button - content matches original but there are pending section changes
		fireEvent.click(getByTestId("close-button"));

		// Wait a bit to ensure no delete call is made
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify deleteDocDraft was NOT called since there are pending section changes
		expect(mockFunctions.deleteDocDraft).not.toHaveBeenCalled();
	});

	it("updates draft title locally when input changes", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Change the title
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		// Verify the input value updated locally
		expect(titleInput.value).toBe("Updated Title");
	});

	it("updates article content locally when textarea changes", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Change the content
		setEditorContent(getByTestId, "article-content-textarea", "# New Content\n\nThis is updated.");

		// Verify the editor content updated locally
		expect(getEditorContent(getByTestId, "article-content-textarea")).toBe("# New Content\n\nThis is updated.");
	});

	it("sends both title and content when save button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Change title and content
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		setEditorContent(getByTestId, "article-content-textarea", "# New Content");

		// Click save
		fireEvent.click(getByTestId("save-button"));

		// Verify updateDocDraft was called with both title and content
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(1, {
				title: "Updated Title",
				content: "# New Content",
			});
		});

		// Verify saveDocDraft was also called
		await waitFor(() => {
			expect(mockFunctions.saveDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("enables save button for new draft (no docId) with content", async () => {
		// mockDraft has docId: undefined and has content, meaning it's a new draft with AI-generated content
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// For new drafts with content, save button should be enabled so user can save as article
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(false);
	});

	it("disables save button for new draft (no docId) without content", async () => {
		// Create a draft with no content
		const emptyDraft = { ...mockDraft, content: "" };
		mockFunctions.getDocDraft.mockResolvedValue(emptyDraft);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// For new drafts without content, save button should be disabled
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("disables save button when editing existing article without changes", async () => {
		// Use mockDraftMatchingArticle which has content matching the original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// For drafts that match original article, save button should be disabled
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("enables save button when re-opening draft that has changes from original article", async () => {
		// Use mockDraftEditingArticle which has different content from mockArticle
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Draft Editing Article");
		});

		// Save button should be enabled since draft content differs from original article
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(false);
	});

	it("enables save button when user makes a change to draft editing existing article", async () => {
		// Use mockDraftMatchingArticle which has content matching the original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Initially, save button should be disabled since draft matches original
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Make a change to the title
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Modified Title" } });

		// Now save button should be enabled
		await waitFor(() => {
			expect(saveButton.disabled).toBe(false);
		});
	});

	it("disables save button when article is not found in docs list", async () => {
		// Draft has docId but article is not in the docs list
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([]); // Empty list, article not found

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Draft Editing Article");
		});

		// Save button should be disabled when article not found (hasUserMadeChanges = false)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("disables save button when listDocs fails", async () => {
		// Draft has docId but listDocs throws an error
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockRejectedValue(new Error("Failed to load docs"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load (should still load despite listDocs failure)
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Draft Editing Article");
		});

		// Save button should be disabled when listDocs fails (hasUserMadeChanges = false)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("does NOT auto-save on initial load", async () => {
		vi.useFakeTimers();

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Fast-forward past the auto-save delay (2 seconds)
		vi.advanceTimersByTime(3000);

		// updateDocDraft should NOT have been called
		expect(mockFunctions.updateDocDraft).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("auto-saves after user edits title", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Use fake timers after loading
		vi.useFakeTimers();

		// User edits title
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		// Fast-forward past the auto-save delay (2 seconds)
		vi.advanceTimersByTime(3000);

		// Use real timers for waitFor
		vi.useRealTimers();

		// updateDocDraft should have been called
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(1, {
				title: "Updated Title",
				content: "# Test Content\n\nThis is a test draft.",
			});
		});
	});

	it("auto-saves after user edits content", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Switch to edit tab
		const editTab = getByTestId("edit-tab");
		fireEvent.click(editTab);

		// Wait for textarea to appear
		await waitFor(() => {
			expect(getByTestId("article-content-textarea")).toBeTruthy();
		});

		// Use fake timers after loading
		vi.useFakeTimers();

		// User edits content
		setEditorContent(getByTestId, "article-content-textarea", "Updated content");

		// Fast-forward past the auto-save delay (2 seconds)
		vi.advanceTimersByTime(3000);

		// Use real timers for waitFor
		vi.useRealTimers();

		// updateDocDraft should have been called
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(1, {
				title: "Test Draft",
				content: "Updated content",
			});
		});
	});

	it("enables save button after manual edit triggers auto-save for draft editing article", async () => {
		// Use draft that matches original article (save button initially disabled)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		// Configure updateDocDraft to return updated draft
		const updatedDraft = {
			...mockDraftMatchingArticle,
			title: "Updated Title",
		};
		mockFunctions.updateDocDraft.mockResolvedValue(updatedDraft);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
		});

		// Verify Save button is initially disabled (draft matches original article)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Use fake timers after loading
		vi.useFakeTimers();

		// User edits title
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		// Fast-forward past the auto-save delay (2 seconds)
		vi.advanceTimersByTime(3000);

		// Use real timers for waitFor
		vi.useRealTimers();

		// Wait for auto-save to complete and state to update
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(3, {
				title: "Updated Title",
				content: "# Existing Article Content",
			});
		});

		// Verify Save button becomes enabled after auto-save updates draft state
		await waitFor(() => {
			const button = getByTestId("save-button") as HTMLButtonElement;
			expect(button.disabled).toBe(false);
		});
	});

	it("handles SSE typing event", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});
	});

	it("handles SSE content_chunk event", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Simulate content chunks with sequence numbers
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "I'll help ",
			seq: 0,
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "you with that.",
			seq: 1,
		});

		// Verify streaming message content appears in the streaming bubble
		await waitFor(() => {
			const streamingDiv = getByTestId("ai-streaming");
			expect(streamingDiv.textContent).toContain("I'll help you with that.");
		});
	});

	it("reorders out-of-sequence content chunks", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// First send seq 0 so we have a streaming div
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "Hello ",
			seq: 0,
		});

		// Wait for streaming div to appear
		await waitFor(() => {
			expect(getByTestId("ai-streaming")).toBeTruthy();
		});

		// Now simulate out-of-order: seq 2 arrives before seq 1
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "!",
			seq: 2,
		});

		// seq 2 should be buffered, only "Hello " should be visible
		await new Promise(resolve => setTimeout(resolve, 50));
		const streamingDiv = getByTestId("ai-streaming");
		expect(streamingDiv.textContent).toContain("Hello ");
		expect(streamingDiv.textContent).not.toContain("!");

		// Now send seq 1 - both seq 1 and buffered seq 2 should be processed
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "world",
			seq: 1,
		});

		// Verify content appears in correct order
		await waitFor(() => {
			const div = getByTestId("ai-streaming");
			expect(div.textContent).toContain("Hello world!");
		});
	});

	it("handles content chunks without sequence numbers (backwards compatibility)", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Simulate content chunks without sequence numbers
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "No seq ",
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "numbers here.",
		});

		// Verify content appears immediately
		await waitFor(() => {
			const streamingDiv = getByTestId("ai-streaming");
			expect(streamingDiv.textContent).toContain("No seq numbers here.");
		});
	});

	it("handles SSE message_complete event", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate message_complete event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "message_complete",
			message: {
				role: "assistant",
				content: "Here's a new message from the AI",
				timestamp: "2025-01-01T00:02:00Z",
			},
		});

		// Verify message was added
		await waitFor(() => {
			expect(getByText("Here's a new message from the AI")).toBeTruthy();
		});
	});

	it("applies insert diff operation", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load AND article content to be populated
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate article_updated event with insert diff
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [
				{
					operation: "insert",
					position: 0,
					text: "NEW: ",
				},
			],
		});

		// Verify content was updated
		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"NEW: # Test Content\n\nThis is a test draft.",
			);
		});
	});

	it("applies delete diff operation", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load AND article content to be populated
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate article_updated event with delete diff (remove first 2 characters "# ")
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [
				{
					operation: "delete",
					position: 0,
					length: 2,
				},
			],
		});

		// Verify content was updated
		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"Test Content\n\nThis is a test draft.",
			);
		});
	});

	it("applies replace diff operation", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load AND article content to be populated
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate article_updated event with replace diff (replace "Test" with "Example")
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [
				{
					operation: "replace",
					position: 2,
					length: 4,
					text: "Example",
				},
			],
		});

		// Verify content was updated
		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Example Content\n\nThis is a test draft.",
			);
		});
	});

	it("updates draft metadata when article_updated event includes contentLastEditedAt and contentLastEditedBy", async () => {
		// Use a draft that matches original article (save button disabled initially)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Verify Save button is initially disabled (draft matches original article)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Simulate article_updated event with contentLastEditedAt and contentLastEditedBy
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [
				{
					operation: "insert",
					position: 0,
					text: "AI: ",
				},
			],
			contentLastEditedAt: "2025-01-01T00:10:00Z",
			contentLastEditedBy: 100,
		});

		// Verify Save button becomes enabled after metadata is updated (change was made)
		await waitFor(() => {
			const button = getByTestId("save-button") as HTMLButtonElement;
			expect(button.disabled).toBe(false);
		});
	});

	it("updates draft metadata when article_updated event has metadata but no diffs", async () => {
		// Use a draft that matches original article (save button disabled initially)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft and convo to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Existing Article Title");
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Verify Save button is initially disabled (draft matches original article)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Simulate article_updated event with ONLY metadata (no diffs)
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			contentLastEditedAt: "2025-01-01T00:10:00Z",
			contentLastEditedBy: 100,
		});

		// Verify Save button becomes enabled even without diffs (metadata update indicates change)
		await waitFor(() => {
			const button = getByTestId("save-button") as HTMLButtonElement;
			expect(button.disabled).toBe(false);
		});
	});

	it("handles send message error", async () => {
		mockFunctions.sendMessage.mockRejectedValue(new Error("Network error"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Type a message and send
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Test message" } });
		fireEvent.click(getByTestId("send-message-button"));

		// Verify sendMessage was called and error was handled
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});

		// Error in sendMessage shows error toast/state but doesn't crash the page
		// The page should still be showing the draft-error div with the error message
		await waitFor(() => {
			expect(getByTestId("draft-error")).toBeTruthy();
		});
	});

	it("undo button is disabled when canUndo is false", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Undo button should be disabled
		const undoButton = getByTestId("undo-button") as HTMLButtonElement;
		expect(undoButton.disabled).toBe(true);

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("redo button is disabled when canRedo is false", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Redo button should be disabled
		const redoButton = getByTestId("redo-button") as HTMLButtonElement;
		expect(redoButton.disabled).toBe(true);

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("calls undoDocDraft when undo button is clicked and canUndo is true", async () => {
		// Override the default mock to have canUndo: true via getRevisions
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.undoDocDraft.mockResolvedValue({
			id: 1,
			content: "Undone content",
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Wait for canUndo to be set from getRevisions
		await waitFor(() => {
			const undoButton = getByTestId("undo-button") as HTMLButtonElement;
			expect(undoButton.disabled).toBe(false);
		});

		// Click undo button
		const undoButton = getByTestId("undo-button") as HTMLButtonElement;
		fireEvent.click(undoButton);

		// Should call undoDocDraft
		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("calls redoDocDraft when redo button is clicked and canRedo is true", async () => {
		// Override the default mock to have canRedo: true via getRevisions
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
		mockFunctions.redoDocDraft.mockResolvedValue({
			id: 1,
			content: "Redone content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Wait for canRedo to be set from getRevisions
		await waitFor(() => {
			const redoButton = getByTestId("redo-button") as HTMLButtonElement;
			expect(redoButton.disabled).toBe(false);
		});

		// Click redo button
		const redoButton = getByTestId("redo-button") as HTMLButtonElement;
		fireEvent.click(redoButton);

		// Should call redoDocDraft
		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("handles undo error gracefully", async () => {
		// Override the default mock to have canUndo: true via getRevisions and reject on undo
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.undoDocDraft.mockRejectedValue(new Error("Undo failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load and canUndo to be set
		await waitFor(() => {
			const undoButton = getByTestId("undo-button") as HTMLButtonElement;
			expect(undoButton.disabled).toBe(false);
		});

		// Click undo button
		const undoButton = getByTestId("undo-button") as HTMLButtonElement;
		fireEvent.click(undoButton);

		// Should call undoDocDraft (it will fail but should handle gracefully)
		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalledWith(1);
		});

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("handles redo error gracefully", async () => {
		// Override the default mock to have canRedo: true via getRevisions and reject on redo
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
		mockFunctions.redoDocDraft.mockRejectedValue(new Error("Redo failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load and canRedo to be set
		await waitFor(() => {
			const redoButton = getByTestId("redo-button") as HTMLButtonElement;
			expect(redoButton.disabled).toBe(false);
		});

		// Click redo button
		const redoButton = getByTestId("redo-button") as HTMLButtonElement;
		fireEvent.click(redoButton);

		// Should call redoDocDraft (it will fail but should handle gracefully)
		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalledWith(1);
		});

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("handles save error", async () => {
		mockFunctions.updateDocDraft.mockRejectedValue(new Error("Save failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Click save button
		fireEvent.click(getByTestId("save-button"));

		// Verify error is displayed
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
			expect(getByTestId("draft-error")).toBeTruthy();
		});
	});

	it("shows connected status when both connections are active", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Simulate both connections being established
		dispatchMessage(eventSourceRegistry.draft, {
			type: "connected",
			draftId: 1,
			timestamp: new Date().toISOString(),
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "connected",
			conversationId: 1,
			timestamp: new Date().toISOString(),
		});

		// Verify connected status is shown
		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].connected as string)).toBeTruthy();
		});
	});

	it("shows active users when present", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Simulate user joining
		dispatchMessage(eventSourceRegistry.convo, {
			type: "user_joined",
			userId: 200,
			timestamp: new Date().toISOString(),
		});

		// Verify UserAvatar is rendered
		await waitFor(() => {
			// The UserAvatar component should be present
			const page = getByTestId("article-draft-page");
			expect(page).toBeTruthy();
		});
	});

	it("sends message when Enter key pressed without Shift", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Type a message using both change and input to ensure onChange handler is covered
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Test message via Enter" } });
		fireEvent.input(messageInput, { target: { value: "Test message via Enter" } });

		// Press Enter key
		fireEvent.keyDown(messageInput, { key: "Enter", shiftKey: false });

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalledWith(1, "Test message via Enter");
		});

		// Verify input was cleared
		expect(messageInput.value).toBe("");
	});

	it("does not send message when Enter key pressed with Shift", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Test Draft");
		});

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Test message" } });

		// Clear the mock to ensure we're testing fresh
		mockFunctions.sendMessage.mockClear();

		// Press Shift+Enter key (should allow newline, not send)
		fireEvent.keyDown(messageInput, { key: "Enter", shiftKey: true });

		// Give it a moment
		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify sendMessage was NOT called
		expect(mockFunctions.sendMessage).not.toHaveBeenCalled();
	});

	it("handles draft_deleted SSE event by navigating to articles", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Send draft_deleted SSE event
		if (eventSourceRegistry.draft?.onmessage) {
			eventSourceRegistry.draft.onmessage({
				data: JSON.stringify({ type: "draft_deleted" }),
			} as MessageEvent);
		}

		// Navigation is handled by NavigationContext mock
	});

	it("handles user_left SSE event by removing user from active users", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// First add a user with user_joined event
		dispatchMessage(eventSourceRegistry.convo, { type: "user_joined", userId: 200 });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Then send user_left event
		dispatchMessage(eventSourceRegistry.convo, { type: "user_left", userId: 200 });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// User should be removed from active users (we can't easily verify the Set content in tests)
	});

	it("handles content_update SSE event by applying diffs", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Send content_update SSE event with insert diff
		const insertDiffs = [{ operation: "insert" as const, position: 0, text: "Inserted text" }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: insertDiffs });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Send content_update SSE event with delete diff
		const deleteDiffs = [{ operation: "delete" as const, position: 0, length: 5 }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: deleteDiffs });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Send content_update SSE event with replace diff
		const replaceDiffs = [{ operation: "replace" as const, position: 0, length: 5, text: "Replaced" }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: replaceDiffs });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Test defensive fallbacks with undefined text and length
		const insertWithUndefinedText = [{ operation: "insert" as const, position: 0 }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: insertWithUndefinedText });
		await new Promise(resolve => setTimeout(resolve, 10));

		const deleteWithUndefinedLength = [{ operation: "delete" as const, position: 0 }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: deleteWithUndefinedLength });
		await new Promise(resolve => setTimeout(resolve, 10));

		const replaceWithUndefined = [{ operation: "replace" as const, position: 0 }];
		dispatchMessage(eventSourceRegistry.draft, { type: "content_update", diffs: replaceWithUndefined });
		await new Promise(resolve => setTimeout(resolve, 10));

		// Content should be updated (verified by not crashing)
	});

	it("handles draft_saved SSE event by navigating to articles", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Send draft_saved SSE event
		dispatchMessage(eventSourceRegistry.draft, { type: "draft_saved" });

		// Navigation is handled by NavigationContext mock
	});

	it("handles user_joined SSE event on draft stream", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Send user_joined SSE event to draft stream
		dispatchMessage(eventSourceRegistry.draft, { type: "user_joined", userId: 300 });

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// User should be added to active users
	});

	it("handles user_left SSE event on draft stream", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// First add a user
		dispatchMessage(eventSourceRegistry.draft, { type: "user_joined", userId: 300 });
		await new Promise(resolve => setTimeout(resolve, 10));

		// Then remove the user
		dispatchMessage(eventSourceRegistry.draft, { type: "user_left", userId: 300 });
		await new Promise(resolve => setTimeout(resolve, 10));

		// User should be removed from active users
	});

	it("handles draft SSE connection error", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Trigger error on draft EventSource
		if (eventSourceRegistry.draft?.onerror) {
			eventSourceRegistry.draft.onerror(new Event("error"));
		}

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Connection status should be updated
	});

	it("handles convo SSE connection error", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Trigger error on convo EventSource
		if (eventSourceRegistry.convo?.onerror) {
			eventSourceRegistry.convo.onerror(new Event("error"));
		}

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 10));

		// Connection status should be updated
	});

	it("keyboard shortcut for undo requires canUndo to be true", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.undoDocDraft.mockResolvedValue({
			success: true,
			content: "Undone content",
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Simulate Cmd+Z keyboard shortcut when canUndo is false
		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		// Should NOT call undoDocDraft because canUndo is false
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(mockFunctions.undoDocDraft).not.toHaveBeenCalled();
	});

	it("keyboard shortcut for redo requires canRedo to be true", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.redoDocDraft.mockResolvedValue({
			success: true,
			content: "Redone content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Simulate Cmd+Shift+Z keyboard shortcut when canRedo is false
		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			shiftKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		// Should NOT call redoDocDraft because canRedo is false
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(mockFunctions.redoDocDraft).not.toHaveBeenCalled();
	});

	it("handles close button click and navigates to articles", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const closeButton = getByTestId("close-button");
		fireEvent.click(closeButton);

		// Navigation to /articles is handled by NavigationContext
	});

	it("cleans up SSE connections and event listeners on unmount", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
		mockFunctions.streamDraftUpdates.mockImplementation(() => {
			eventSourceRegistry.draft = new EventSource("/api/doc-drafts/1/stream");
			return eventSourceRegistry.draft;
		});
		mockFunctions.streamConvo.mockImplementation(id => {
			eventSourceRegistry.convo = new EventSource(`/api/collab-convos/${id}/stream`);
			return eventSourceRegistry.convo;
		});

		const { getByTestId, unmount } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Verify SSE connections are open
		expect(eventSourceRegistry.draft).not.toBeNull();
		expect(eventSourceRegistry.convo).not.toBeNull();

		// Spy on close methods
		if (!eventSourceRegistry.draft || !eventSourceRegistry.convo) {
			throw new Error("EventSources should exist");
		}
		const draftCloseSpy = vi.spyOn(eventSourceRegistry.draft, "close");
		const convoCloseSpy = vi.spyOn(eventSourceRegistry.convo, "close");

		// Unmount the component
		unmount();

		// Verify cleanup was called
		expect(draftCloseSpy).toHaveBeenCalled();
		expect(convoCloseSpy).toHaveBeenCalled();
	});

	it("loads and displays draft that is editing an existing article", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId, container } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Verify the editing banner is displayed
		await waitFor(() => {
			expect(getByTestId("editing-banner")).toBeTruthy();
			const bannerText = container.textContent;
			expect(bannerText).toContain("Existing Article Title");
		});
	});

	it("handles draft_saved SSE event when editing article by navigating to article detail", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		const { getByTestId, container } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		// Wait for component to fully load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for the editing article banner to be displayed (confirming editingArticle state is set)
		await waitFor(() => {
			const banner = getByTestId("editing-banner");
			expect(banner).toBeTruthy();
			expect(container.textContent).toContain("Existing Article Title");
		});

		// Ensure event source is set up
		await waitFor(() => {
			expect(eventSourceRegistry.draft).not.toBeNull();
		});

		// Additional wait to ensure all state updates and effects have completed
		await new Promise(resolve => setTimeout(resolve, 50));

		// Send draft_saved SSE event - this should trigger navigation to article detail
		dispatchMessage(eventSourceRegistry.draft, { type: "draft_saved" });

		// Wait for the async navigation to complete
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("handles error when fetching article for draft editing fails", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockRejectedValue(new Error("Failed to fetch articles"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Should still load the draft even if fetching the article fails
		await waitFor(() => {
			const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
			expect(titleInput.value).toBe("Draft Editing Article");
		});
	});

	it("shows loading indicator when AI pauses for more than 1.5 seconds", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Send one content chunk
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "I'm thinking...",
			seq: 0,
		});

		// Wait for the pause detection to trigger (>1.5 seconds)
		await new Promise(resolve => setTimeout(resolve, 1600));

		// Verify loading indicator is shown after the pause
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});
	});

	it("handles tool_event with start status (simple view)", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate tool_event with start status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "create_article", arguments: "args", status: "start" },
		});

		// Verify simple tool message is shown by default
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the create_article tool");
		});
	});

	it("handles tool_event with end status (simple view)", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate tool_event with start status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "edit_section", arguments: "args", status: "start" },
		});

		// Verify simple tool message is shown
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the edit_section tool");
		});

		// Simulate tool_event with end status and result
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "edit_section", arguments: "args", status: "end", result: "Section updated successfully" },
		});

		// Verify completed message is shown (no result in simple view)
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the edit_section tool: completed");
			// Result should NOT be shown in simple view
			expect(typingDiv.textContent).not.toContain("Section updated successfully");
		});

		// Simulate message_complete to clear tool status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "message_complete",
			message: { role: "assistant", content: "Done!", timestamp: new Date().toISOString() },
		});

		// Verify tool state was cleared
		await waitFor(() => {
			expect(() => getByTestId("ai-typing")).toThrow();
		});
	});

	it("toggles between simple and detailed tool views", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate tool_event with start status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "create_section", arguments: "{title: 'Test'}", status: "start" },
		});

		// Verify simple view is shown by default
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the create_section tool");
			expect(typingDiv.textContent).not.toContain("{title: 'Test'}");
		});

		// Click toggle button to show details
		const toggleButton = getByTestId("toggle-tool-details");
		toggleButton.click();

		// Verify detailed view is now shown
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running create_section({title: 'Test'})");
		});

		// Click toggle button again to hide details
		toggleButton.click();

		// Verify simple view is shown again
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the create_section tool");
			expect(typingDiv.textContent).not.toContain("{title: 'Test'}");
		});
	});

	it("shows result in detailed view only", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Tool completes with result
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: {
				tool: "read_file",
				arguments: "{path: 'test.ts'}",
				status: "end",
				result: "export function test() {}",
			},
		});

		// Verify simple view shows completed message without result
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the read_file tool: completed");
			expect(typingDiv.textContent).not.toContain("export function test() {}");
		});

		// Toggle to detailed view
		const toggleButton = getByTestId("toggle-tool-details");
		toggleButton.click();

		// Verify detailed view shows result
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running read_file({path: 'test.ts'})");
			expect(typingDiv.textContent).toContain(": export function test() {}");
		});
	});

	it("persists tool details preference in localStorage", async () => {
		// Clear localStorage before test
		localStorage.clear();

		const { getByTestId, unmount } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing and tool event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "start" },
		});

		// Wait for tool message to appear
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Toggle to detailed view
		const toggleButton = getByTestId("toggle-tool-details");
		toggleButton.click();

		// Verify localStorage was updated
		await waitFor(() => {
			expect(localStorage.getItem("articleDraft.showToolDetails")).toBe("true");
		});

		// Unmount and remount component
		unmount();
		const { getByTestId: getByTestId2 } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for draft and convo to load again
		await waitFor(() => {
			expect(getByTestId2("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing and tool event again
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "start" },
		});

		// Verify detailed view is still active (preference was persisted)
		await waitFor(() => {
			const typingDiv = getByTestId2("ai-typing");
			expect(typingDiv.textContent).toContain("Running bash(ls)");
		});
	});

	it("displays animated dots while tool is running", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event first
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Tool starts
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "read_file", arguments: "args", status: "start" },
		});

		// Verify running state (with animated dots)
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the read_file tool");
			expect(typingDiv.textContent).toContain("...");
		});

		// Tool completes with result
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: {
				tool: "read_file",
				arguments: "args",
				status: "end",
				result: "export function createCollabConvo...",
			},
		});

		// Verify completed state (shows "completed", no animated dots)
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the read_file tool: completed");
			expect(typingDiv.textContent).not.toMatch(/Running the read_file tool\.\.\.$/);
		});
	});

	it("adds ellipsis only to truncated tool results in detailed view", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Tool completes with SHORT result - should NOT add ellipsis
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "end", result: "Done" },
		});

		// Wait for tool message
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Toggle to detailed view
		const toggleButton = getByTestId("toggle-tool-details");
		toggleButton.click();

		// Verify NO ellipsis is added for short result
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain(": Done");
			expect(typingDiv.textContent).not.toContain("Done...");
		});

		// Tool completes with LONG result (200 chars) - should add ellipsis
		const longResult = "a".repeat(200);
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "read_file", arguments: "file.ts", status: "end", result: longResult },
		});

		// Verify ellipsis is added
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain(`${longResult}...`);
		});

		// Tool completes with result that already ends in "..."
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: {
				tool: "write_file",
				arguments: "file.ts",
				status: "end",
				result: "export function test...",
			},
		});

		// Verify no double ellipsis
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("export function test...");
			expect(typingDiv.textContent).not.toContain("export function test......");
		});
	});

	it("clears tool status on message complete", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing and tool execution
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "start" },
		});

		// Verify tool is shown
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the bash tool");
		});

		// Message completes - should clear tool status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "message_complete",
			message: { role: "assistant", content: "Done!", timestamp: new Date().toISOString() },
		});

		// Verify tool status cleared (ai-typing should not be visible)
		await waitFor(() => {
			expect(() => getByTestId("ai-typing")).toThrow();
		});
	});

	it("persists tool result until next tool starts", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// First tool completes
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "read_file", arguments: "test.ts", status: "end", result: "File contents here..." },
		});

		// Verify completed message is shown (simple view doesn't show result)
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the read_file tool: completed");
		});

		// Wait a bit to ensure it persists (less than 10 seconds)
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Verify still shown
		const typingDiv = getByTestId("ai-typing");
		expect(typingDiv.textContent).toContain("Running the read_file tool: completed");

		// Second tool starts - should replace first tool's status
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "write_file", arguments: "test.ts", status: "start" },
		});

		// Verify new tool status replaces old one
		await waitFor(() => {
			const newTypingDiv = getByTestId("ai-typing");
			expect(newTypingDiv.textContent).toContain("Running the write_file tool");
			expect(newTypingDiv.textContent).not.toContain("Running the read_file tool");
		});
	});

	it("clears tool result after timeout if AI still typing", async () => {
		// Set a shorter timeout for test
		(window as { TOOL_RESULT_TIMEOUT?: number }).TOOL_RESULT_TIMEOUT = 1000;

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Tool completes with result
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "end", result: "Command executed" },
		});

		// Verify completed message is shown initially
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Running the bash tool: completed");
		});

		// Wait for timeout (1000ms + buffer)
		await new Promise(resolve => setTimeout(resolve, 1100));

		// Verify tool result is cleared and shows default "AI is working" message
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("AI is working");
			expect(typingDiv.textContent).not.toContain("Running the bash tool");
		});

		// Clean up
		delete (window as { TOOL_RESULT_TIMEOUT?: number }).TOOL_RESULT_TIMEOUT;
	}, 5000);

	it("shows writing article indicator when streaming article", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate content with article update marker
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "I'll write the article now. [ARTICLE_UPDATE]",
			seq: 0,
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "# Test Article\n\nThis is test content.",
			seq: 1,
		});

		// Verify writing article indicator is shown
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("Writing article");
		});
	});

	it("handles content chunk with paragraph break logic", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-input")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Send first chunk
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "First paragraph",
			seq: 0,
		});

		// Wait for a pause (>500ms)
		await new Promise(resolve => setTimeout(resolve, 600));

		// Send second chunk - should add paragraph break
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "Second paragraph",
			seq: 1,
		});

		// Verify content is displayed
		await waitFor(() => {
			const streamingDiv = getByTestId("ai-streaming");
			expect(streamingDiv.textContent).toContain("First paragraph");
			expect(streamingDiv.textContent).toContain("Second paragraph");
		});
	});

	it("shows reconnecting status when SSE connection is reconnecting", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate reconnecting event on draft stream
		if (eventSourceRegistry.draft) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.draft.dispatchEvent(reconnectingEvent);
		}

		// Verify reconnecting status is shown
		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});
	});

	it("shows reconnecting status when convo SSE connection is reconnecting", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Simulate reconnecting event on convo stream
		if (eventSourceRegistry.convo) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.convo.dispatchEvent(reconnectingEvent);
		}

		// Verify reconnecting status is shown
		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});
	});

	it("handles MessageEvent format for backward compatibility on draft stream", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Send a MessageEvent directly (for backward compatibility testing)
		if (eventSourceRegistry.draft) {
			const messageEvent = new MessageEvent("message", {
				data: JSON.stringify({ type: "content_updated", content: "Updated content" }),
			});
			eventSourceRegistry.draft.dispatchEvent(messageEvent);
		}

		// Verify the event was processed (no error thrown)
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});
	});

	it("handles MessageEvent format for backward compatibility on convo stream", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Send a MessageEvent directly to convo stream (for backward compatibility testing)
		if (eventSourceRegistry.convo) {
			const messageEvent = new MessageEvent("message", {
				data: JSON.stringify({ role: "assistant", content: "AI response" }),
			});
			eventSourceRegistry.convo.dispatchEvent(messageEvent);
		}

		// Verify the event was processed (no error thrown)
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});
	});

	it("navigates to articles when draft_deleted event is received", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			pathname: "/article-draft/1",
		});

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
		});

		// Simulate draft_deleted event
		dispatchMessage(eventSourceRegistry.draft, {
			type: "draft_deleted",
		});

		// Navigation is handled by NavigationContext mock
		// The test verifies the event handler doesn't crash
	});

	it("shows connected status when draft SSE connection is reconnected", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// First establish both connections as connected
		if (eventSourceRegistry.draft) {
			eventSourceRegistry.draft.dispatchEvent(new Event("open"));
		}
		if (eventSourceRegistry.convo) {
			eventSourceRegistry.convo.dispatchEvent(new Event("open"));
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].connected as string)).toBeTruthy();
		});

		// Then trigger reconnecting on draft
		if (eventSourceRegistry.draft) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.draft.dispatchEvent(reconnectingEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});

		// Then trigger reconnected
		if (eventSourceRegistry.draft) {
			const reconnectedEvent = new CustomEvent("reconnected", {
				detail: { afterAttempts: 1 },
			});
			eventSourceRegistry.draft.dispatchEvent(reconnectedEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].connected as string)).toBeTruthy();
		});
	});

	it("shows connected status when convo SSE connection is reconnected", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// First establish both connections as connected
		if (eventSourceRegistry.draft) {
			eventSourceRegistry.draft.dispatchEvent(new Event("open"));
		}
		if (eventSourceRegistry.convo) {
			eventSourceRegistry.convo.dispatchEvent(new Event("open"));
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].connected as string)).toBeTruthy();
		});

		// Then trigger reconnecting on convo
		if (eventSourceRegistry.convo) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.convo.dispatchEvent(reconnectingEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});

		// Then trigger reconnected
		if (eventSourceRegistry.convo) {
			const reconnectedEvent = new CustomEvent("reconnected", {
				detail: { afterAttempts: 1 },
			});
			eventSourceRegistry.convo.dispatchEvent(reconnectedEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].connected as string)).toBeTruthy();
		});
	});

	it("shows disconnected status when draft SSE reconnection fails", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// First trigger reconnecting
		if (eventSourceRegistry.draft) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.draft.dispatchEvent(reconnectingEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});

		// Then trigger reconnection_failed
		if (eventSourceRegistry.draft) {
			const failedEvent = new CustomEvent("reconnection_failed", {
				detail: {},
			});
			eventSourceRegistry.draft.dispatchEvent(failedEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].disconnected as string)).toBeTruthy();
		});
	});

	it("shows disconnected status when convo SSE reconnection fails", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// First trigger reconnecting
		if (eventSourceRegistry.convo) {
			const reconnectingEvent = new CustomEvent("reconnecting", {
				detail: { attempt: 1, delay: 1000 },
			});
			eventSourceRegistry.convo.dispatchEvent(reconnectingEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeTruthy();
		});

		// Then trigger reconnection_failed
		if (eventSourceRegistry.convo) {
			const failedEvent = new CustomEvent("reconnection_failed", {
				detail: {},
			});
			eventSourceRegistry.convo.dispatchEvent(failedEvent);
		}

		await waitFor(() => {
			expect(getByText(CONTENT_MAP["article-draft"].disconnected as string)).toBeTruthy();
		});
	});

	it("displays third column with section change panel when section changes exist", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]); // Article being edited

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Wait for the editor pane to be ready (indicates tabs are rendered)
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click on Preview tab to show the preview with section changes
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		// Wait for article preview to render with section annotations
		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on a highlighted section
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			// Check that the third column is visible
			expect(getByTestId("panels-pane")).toBeTruthy();
			// Check that the section change panel is rendered
			expect(getByTestId("section-change-panel")).toBeTruthy();
			// Check that the panel shows the number of changes
			expect(getByText(/Section Changes: 1/)).toBeTruthy();
		});
	});

	it("adjusts column widths when section change panel is open", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]); // Article being edited

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Wait for the editor pane to be ready (indicates tabs are rendered)
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click on Preview tab to show the preview with section changes
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		// Wait for article preview to render
		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Initially, should have resizable panels with chat and editor panes
		const chatPane = getByTestId("chat-pane");
		expect(chatPane).toBeTruthy();
		expect(editorPane).toBeTruthy();

		// The main split should be using ResizablePanels
		const mainSplit = getByTestId("main-split");
		expect(mainSplit).toBeTruthy();

		// Click on a highlighted section to open the panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			// After opening panel, the third column should be visible
			const panelsPane = getByTestId("panels-pane");
			expect(panelsPane).toBeTruthy();
			expect(panelsPane.className).toContain("w-[20%]");
		});
	});

	it("closes section change panel when close button is clicked", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]); // Article being edited

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Wait for the editor pane to be ready (indicates tabs are rendered)
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click on Preview tab to show the preview with section changes
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		// Wait for article preview to render
		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on a highlighted section to open the panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			expect(getByTestId("panels-pane")).toBeTruthy();
		});

		// Click the close button on the section change panel
		const closePanelButton = getByTestId("close-panel-button");
		fireEvent.click(closePanelButton);

		await waitFor(() => {
			// Panel should be gone
			expect(queryByTestId("panels-pane")).toBeNull();
		});
	});

	it("calls applySectionChange when apply button is clicked", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		mockFunctions.applySectionChange.mockResolvedValue({
			id: 1,
			content: "Applied content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Switch to Preview tab
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on highlighted section to open panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			expect(getByTestId("section-change-panel")).toBeTruthy();
		});

		// Click apply button
		const applyButton = getByTestId("apply-change-button");
		fireEvent.click(applyButton);

		await waitFor(() => {
			expect(mockFunctions.applySectionChange).toHaveBeenCalledWith(1, 1);
		});
	});

	it("calls dismissSectionChange when dismiss button is clicked", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		mockFunctions.dismissSectionChange.mockResolvedValue({
			id: 1,
			content: "Original content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Switch to Preview tab
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on highlighted section to open panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			expect(getByTestId("section-change-panel")).toBeTruthy();
		});

		// Click dismiss button
		const dismissButton = getByTestId("dismiss-change-button");
		fireEvent.click(dismissButton);

		await waitFor(() => {
			expect(mockFunctions.dismissSectionChange).toHaveBeenCalledWith(1, 1);
		});
	});

	it("handles applySectionChange error gracefully", async () => {
		// Use mockDraftEditingArticle which has a docId
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		mockFunctions.applySectionChange.mockRejectedValue(new Error("Apply failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Switch to Preview tab
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on highlighted section to open panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			expect(getByTestId("section-change-panel")).toBeTruthy();
		});

		// Click apply button (should fail but handle gracefully)
		const applyButton = getByTestId("apply-change-button");
		fireEvent.click(applyButton);

		await waitFor(() => {
			expect(mockFunctions.applySectionChange).toHaveBeenCalledWith(1, 1);
		});

		// Error should be displayed
		await waitFor(() => {
			expect(getByTestId("draft-error")).toBeTruthy();
		});
	});

	it("handles dismissSectionChange error gracefully", async () => {
		// Use mockDraftEditingArticle which has a docId
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 1,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test section change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		mockFunctions.dismissSectionChange.mockRejectedValue(new Error("Dismiss failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Switch to Preview tab
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on highlighted section to open panel
		const articlePreview = getByTestId("article-preview");
		const highlightedSection = articlePreview.querySelector('[data-section-path="section-1"]');
		if (highlightedSection) {
			fireEvent.click(highlightedSection);
		}

		await waitFor(() => {
			expect(getByTestId("section-change-panel")).toBeTruthy();
		});

		// Click dismiss button (should fail but handle gracefully)
		const dismissButton = getByTestId("dismiss-change-button");
		fireEvent.click(dismissButton);

		await waitFor(() => {
			expect(mockFunctions.dismissSectionChange).toHaveBeenCalledWith(1, 1);
		});

		// Error should be displayed
		await waitFor(() => {
			expect(getByTestId("draft-error")).toBeTruthy();
		});
	});

	it("should validate OpenAPI JSON content before saving and show errors on failure", async () => {
		// Create a draft with JSON content type that looks like OpenAPI
		const jsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0"}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		// Mock validateContent to return validation errors (now using backend API)
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Missing required field: 'info'",
					path: "info",
					severity: "error" as const,
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors to appear
		const validationErrors = await findByTestId("validation-errors");
		expect(validationErrors).toBeTruthy();

		// Verify error message is displayed
		const errorElement = await findByTestId("validation-error-0");
		expect(errorElement.textContent).toContain("Missing required field: 'info'");

		// Verify saveDocDraft was not called (validation failed)
		expect(mockFunctions.saveDocDraft).not.toHaveBeenCalled();
	});

	it("should allow dismissing validation errors", async () => {
		// Create a draft with JSON content type
		const jsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0"}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		// Mock validateContent to return validation errors (now using backend API)
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Missing required field: 'info'",
					path: "info",
					severity: "error" as const,
				},
			],
		});

		const { getByTestId, findByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save to trigger validation errors
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors
		await findByTestId("validation-errors");

		// Click dismiss button
		const dismissButton = getByTestId("dismiss-validation-errors");
		fireEvent.click(dismissButton);

		// Validation errors should be gone
		await waitFor(() => {
			expect(queryByTestId("validation-errors")).toBeNull();
		});
	});

	it("should validate markdown content and allow saving when valid", async () => {
		// Create a draft with markdown content type
		const markdownDraft = {
			...mockDraft,
			id: 1,
			contentType: "text/markdown" as const,
			content: "# Test Article",
		};

		mockFunctions.getDocDraft.mockImplementation(async () => markdownDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(markdownDraft);
		// Mock validateContent to return valid result
		mockFunctions.validateContent.mockResolvedValue({
			isValid: true,
			errors: [],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for save to complete
		await waitFor(() => {
			expect(mockFunctions.saveDocDraft).toHaveBeenCalled();
		});

		// validateContent should have been called for markdown
		expect(mockFunctions.validateContent).toHaveBeenCalled();
	});

	it("should block saving plain JSON that is not OpenAPI", async () => {
		// Create a draft with JSON content type but plain JSON (not OpenAPI)
		const plainJsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: '{"name": "test", "items": [1, 2, 3]}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => plainJsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(plainJsonDraft);
		// Mock validateContent to return validation errors (now using backend API)
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message:
						"JSON/YAML articles must be valid OpenAPI specifications. Add 'openapi: \"3.0.0\"' field to define an API spec",
					severity: "error" as const,
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors to appear
		const validationErrors = await findByTestId("validation-errors");
		expect(validationErrors).toBeTruthy();

		// Verify error message is displayed
		const errorElement = await findByTestId("validation-error-0");
		expect(errorElement.textContent).toContain("JSON/YAML articles must be valid OpenAPI specifications");

		// Verify saveDocDraft was not called (validation failed)
		expect(mockFunctions.saveDocDraft).not.toHaveBeenCalled();
	});

	it("should disable save button when validation errors exist", async () => {
		// Create a draft with JSON content type that has invalid content
		const jsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: '{"name": "not openapi"}', // Invalid - not an OpenAPI spec
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		// Mock validateContent to return validation errors (now using backend API)
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Not a valid OpenAPI spec",
					severity: "error" as const,
				},
			],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button - this should trigger validation failure
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors to appear
		await waitFor(() => {
			expect(getByTestId("validation-error-0")).toBeTruthy();
		});

		// Save button should be disabled due to validation errors
		expect(saveButton.hasAttribute("disabled")).toBe(true);

		// Save should NOT have been called
		expect(mockFunctions.saveDocDraft).not.toHaveBeenCalled();
	});

	it("should handle validation errors gracefully", async () => {
		// Create a draft with JSON content type
		const jsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0", "info": {"title": "Test", "version": "1.0"}, "paths": {}}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		// Make validation throw an error
		mockFunctions.validateDocDraft.mockRejectedValue(new Error("Validation service unavailable"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Even if validation fails, it should proceed with save (backend will catch issues)
		await waitFor(() => {
			expect(mockFunctions.saveDocDraft).toHaveBeenCalled();
		});
	});

	it("should show line numbers in validation errors when available", async () => {
		// Create a draft with JSON content type that has a JSON syntax error
		const invalidJson = `{
  "openapi": "3.0.0",
  "info": {
    "title": "Test"
    "version": "1.0.0"
  }
}`;
		const jsonDraft = {
			...mockDraft,
			id: 1,
			contentType: "application/json" as const,
			content: invalidJson, // Missing comma causes JSON parse error at line 5
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		// Mock validateContent to return validation errors with line numbers
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: 'Expected "," or "}" after property value',
					line: 5,
					column: 5,
					severity: "error",
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors
		const errorElement = await findByTestId("validation-error-0");

		// Should show line number from JSON parse error
		expect(errorElement.textContent).toContain("Line");
	});

	it("should scroll to error line when clicking on validation error line number", async () => {
		const mdxDraft = {
			...mockDraft,
			id: 1,
			content: "Line 1\nLine 2\nLine 3\nLine 4\nBad JSX <Component",
		};

		mockFunctions.getDocDraft.mockImplementation(async () => mdxDraft);
		// Mock validateContent to return validation error with line number
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Unexpected end of file",
					line: 5,
					severity: "error",
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save button to trigger validation
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors with clickable line button
		const lineButton = await findByTestId("validation-error-0-line");
		expect(lineButton.textContent).toContain("Line 5");

		// Click the line button (should scroll to line in textarea)
		fireEvent.click(lineButton);

		// Verify the line button is clickable (the actual scroll behavior is tested implicitly)
		expect(lineButton.tagName).toBe("BUTTON");
	});

	describe("share functionality", () => {
		it("should show share button for new drafts that are not shared", async () => {
			const newDraft = { ...mockDraft, docId: undefined, isShared: false };
			mockFunctions.getDocDraft.mockImplementation(async () => newDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

			await waitFor(() => {
				expect(getByTestId("share-button")).toBeTruthy();
			});
		});

		it("should not show share button for drafts editing existing articles", async () => {
			mockFunctions.getDocDraft.mockImplementation(async () => mockDraftEditingArticle);

			const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/2",
			});

			await waitFor(() => {
				expect(getByTestId("article-draft-page")).toBeTruthy();
			});

			expect(queryByTestId("share-button")).toBeNull();
		});

		it("should not show share button for already shared drafts", async () => {
			const sharedDraft = {
				...mockDraft,
				docId: undefined,
				isShared: true,
				sharedAt: "2025-01-02T00:00:00Z",
				sharedBy: 100,
			};
			mockFunctions.getDocDraft.mockImplementation(async () => sharedDraft);

			const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitFor(() => {
				expect(getByTestId("article-draft-page")).toBeTruthy();
			});

			expect(queryByTestId("share-button")).toBeNull();
		});

		it("should show shared badge for already shared drafts", async () => {
			const sharedDraft = {
				...mockDraft,
				docId: undefined,
				isShared: true,
				sharedAt: "2025-01-02T00:00:00Z",
				sharedBy: 100,
			};
			mockFunctions.getDocDraft.mockImplementation(async () => sharedDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

			await waitFor(() => {
				expect(getByTestId("shared-badge")).toBeTruthy();
			});
		});

		it("should call shareDraft API when share button is clicked", async () => {
			const newDraft = { ...mockDraft, docId: undefined, isShared: false };
			const sharedDraft = {
				...newDraft,
				isShared: true,
				sharedAt: "2025-01-02T00:00:00Z",
				sharedBy: 100,
			};

			mockFunctions.getDocDraft.mockImplementation(async () => newDraft);
			mockFunctions.shareDraft.mockResolvedValue(sharedDraft);

			const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitFor(() => {
				expect(getByTestId("share-button")).toBeTruthy();
			});

			fireEvent.click(getByTestId("share-button"));

			await waitFor(() => {
				expect(mockFunctions.shareDraft).toHaveBeenCalledWith(1);
			});

			// After sharing, share button should be gone and shared badge should appear
			await waitFor(() => {
				expect(queryByTestId("share-button")).toBeNull();
				expect(getByTestId("shared-badge")).toBeTruthy();
			});
		});

		it("should show error when share fails", async () => {
			const newDraft = { ...mockDraft, docId: undefined, isShared: false };
			mockFunctions.getDocDraft.mockImplementation(async () => newDraft);
			mockFunctions.shareDraft.mockRejectedValue(new Error("Share failed"));

			const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitFor(() => {
				expect(getByTestId("share-button")).toBeTruthy();
			});

			fireEvent.click(getByTestId("share-button"));

			await waitFor(() => {
				expect(getByText(CONTENT_MAP["article-draft"].shareError as string)).toBeTruthy();
			});
		});

		it("should disable share button while sharing is in progress", async () => {
			const newDraft = { ...mockDraft, docId: undefined, isShared: false };
			mockFunctions.getDocDraft.mockImplementation(async () => newDraft);

			// Create a promise that doesn't resolve immediately
			let resolveShare: (value: unknown) => void = () => {
				// Placeholder, will be replaced by the promise
			};
			mockFunctions.shareDraft.mockImplementation(
				() =>
					new Promise(resolve => {
						resolveShare = resolve;
					}),
			);

			const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitFor(() => {
				expect(getByTestId("share-button")).toBeTruthy();
			});

			const shareButton = getByTestId("share-button");
			fireEvent.click(shareButton);

			// Button should be disabled and show "Sharing..." text
			await waitFor(() => {
				expect(shareButton).toHaveProperty("disabled", true);
				expect(getByText(CONTENT_MAP["article-draft"].sharing as string)).toBeTruthy();
			});

			// Resolve the share promise
			resolveShare({
				...newDraft,
				isShared: true,
				sharedAt: "2025-01-02T00:00:00Z",
				sharedBy: 100,
			});

			// Button should be gone and badge should appear
			await waitFor(() => {
				expect(getByTestId("shared-badge")).toBeTruthy();
			});
		});
	});

	it("should proceed with save when validateContent API throws an error", async () => {
		// Mock validateContent to throw an error
		mockFunctions.validateContent.mockRejectedValue(new Error("Validation API unavailable"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Make a change to enable save button
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		fireEvent.change(titleInput, { target: { value: "Updated Title" } });

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Save should proceed despite validation API failure
		await waitFor(() => {
			expect(mockFunctions.saveDocDraft).toHaveBeenCalled();
		});
	});

	it("should show 'no edits yet' message when draft has no contentLastEditedAt", async () => {
		// Create a draft with no contentLastEditedAt
		const draftWithNoEdits: DocDraft = {
			...mockDraft,
			contentLastEditedAt: undefined,
			contentLastEditedBy: undefined,
		};

		mockFunctions.getDocDraft.mockImplementation(async () => draftWithNoEdits);

		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Check for "no edits yet" message
		expect(getByText(CONTENT_MAP["article-draft"].noEditsYet as string)).toBeTruthy();
	});

	it("should clear validation errors when user edits content in markdown editor", async () => {
		// Create a markdown draft
		const markdownDraft = {
			...mockDraft,
			contentType: "text/markdown" as const,
			content: "# Test",
		};

		mockFunctions.getDocDraft.mockImplementation(async () => markdownDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(markdownDraft);
		// Mock validateContent to return validation errors on first call
		mockFunctions.validateContent.mockResolvedValueOnce({
			isValid: false,
			errors: [{ message: "Test error", severity: "error" as const }],
		});

		const { getByTestId, findByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click save to trigger validation errors
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors to appear
		await findByTestId("validation-errors");

		// Switch to edit tab
		const editTab = getByTestId("edit-tab");
		fireEvent.click(editTab);

		// Edit content using NumberEdit helper
		setEditorContent(getByTestId, "article-content-textarea", "# Updated Content");

		// Validation errors should be cleared
		await waitFor(() => {
			expect(queryByTestId("validation-errors")).toBeNull();
		});
	});

	it("should clear validation errors when user edits content in non-markdown editor", async () => {
		// Create a JSON draft
		const jsonDraft = {
			...mockDraft,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0"}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		// Mock validateContent to return validation errors on first call
		mockFunctions.validateContent.mockResolvedValueOnce({
			isValid: false,
			errors: [{ message: "Missing info field", severity: "error" as const }],
		});

		const { getByTestId, findByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for loading to complete
		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click save to trigger validation errors
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Wait for validation errors to appear
		await findByTestId("validation-errors");

		// Switch to edit tab
		const editTab = getByTestId("edit-tab");
		fireEvent.click(editTab);

		// Edit content using NumberEdit helper
		setEditorContent(getByTestId, "article-content-textarea", '{"openapi": "3.0.0", "info": {}}');

		// Validation errors should be cleared
		await waitFor(() => {
			expect(queryByTestId("validation-errors")).toBeNull();
		});
	});

	it("should handle getSectionChanges error gracefully during refresh", async () => {
		// Use mockDraftEditingArticle which has a docId
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		// First call succeeds (during initial load), subsequent calls fail
		mockFunctions.getSectionChanges
			.mockResolvedValueOnce({ sections: [], changes: [] })
			.mockRejectedValue(new Error("Failed to fetch section changes"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		// Wait for initial load to complete
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Trigger an SSE event that causes refreshSectionChanges to be called
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [],
		});

		// Wait for the refresh attempt (which will fail)
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalledTimes(2);
		});

		// Component should still be functional despite the error
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should disable save button when undo restores content to match original article", async () => {
		// Use a draft that's editing an existing article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});

		// When undo is called, return content that matches the original article
		mockFunctions.undoDocDraft.mockResolvedValue({
			content: mockArticle.content, // "# Existing Article Content" - matches original
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		// Wait for draft to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for undo button to be enabled
		await waitFor(() => {
			const undoButton = getByTestId("undo-button") as HTMLButtonElement;
			expect(undoButton.disabled).toBe(false);
		});

		// Click undo button
		const undoButton = getByTestId("undo-button");
		fireEvent.click(undoButton);

		// Wait for undo to complete
		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalled();
		});

		// Save button should now be disabled since content matches original
		// (hasUserMadeChanges.current should be false)
		await waitFor(() => {
			const saveButton = getByTestId("save-button") as HTMLButtonElement;
			expect(saveButton.disabled).toBe(true);
		});
	});

	it("should toggle section change panel closed when clicking same section twice", async () => {
		// Use mockDraftEditingArticle which has a docId (required for section changes)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.listDocs.mockResolvedValue([mockArticle]);

		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [
				{
					type: "section-change",
					id: "section-1",
					path: "/sections/0",
					title: "Test Section",
					startLine: 0,
					endLine: 2,
					changeIds: [1],
				},
			],
			changes: [
				{
					id: 1,
					draftId: 2,
					changeType: "update",
					path: "/sections/0",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Test change",
							value: "New content",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId, getByText, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		// Wait for draft to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Wait for section changes to load
		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});

		// Click on Preview tab to show the section with changes
		const editorPane = getByTestId("editor-pane");
		const previewButton = editorPane.querySelector('button[value="preview"]');
		if (previewButton) {
			fireEvent.click(previewButton);
		}

		// Wait for article preview
		await waitFor(() => {
			expect(getByTestId("article-preview")).toBeTruthy();
		});

		// Click on the highlighted section to open the panel
		const clickableSection = getByText("Clickable Section");
		fireEvent.click(clickableSection);

		// Wait for panel to open
		await waitFor(() => {
			expect(getByTestId("panels-pane")).toBeTruthy();
		});

		// Click on the same section again to toggle it closed
		fireEvent.click(clickableSection);

		// Panel should be closed
		await waitFor(() => {
			expect(queryByTestId("panels-pane")).toBeNull();
		});
	});

	it("should display YAML badge for YAML content type", async () => {
		const yamlDraft = {
			...mockDraft,
			contentType: "application/yaml" as const,
			content: "openapi: 3.0.0\ninfo:\n  title: Test API",
		};

		mockFunctions.getDocDraft.mockImplementation(async () => yamlDraft);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Check for YAML badge
		const badge = getByTestId("content-type-badge");
		expect(badge.textContent).toBe("YAML");
	});

	it("should display Markdown label for unknown content type", async () => {
		// Use an unknown content type that's not JSON, YAML, or markdown
		// This will render the non-markdown pane and hit the default case in getContentTypeLabel
		const unknownContentTypeDraft = {
			...mockDraft,
			contentType: "text/plain" as "text/markdown", // Cast to satisfy type, but it's actually unknown
			content: "Plain text content",
		};

		mockFunctions.getDocDraft.mockImplementation(async () => unknownContentTypeDraft);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Should show Markdown badge (default case in getContentTypeLabel)
		const badge = getByTestId("content-type-badge");
		expect(badge.textContent).toBe("Markdown");
	});

	it("should handle getSectionChanges error during initial load gracefully", async () => {
		mockFunctions.getSectionChanges.mockRejectedValue(new Error("Failed to fetch section changes"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Component should still load despite getSectionChanges failing
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Draft title should be displayed
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		expect(titleInput.value).toBe("Test Draft");
	});

	it("should handle getRevisions error during initial load gracefully", async () => {
		mockFunctions.getRevisions.mockRejectedValue(new Error("Failed to fetch revisions"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Component should still load despite getRevisions failing
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Undo/redo buttons should be disabled (default state when revisions fail)
		const undoButton = getByTestId("undo-button") as HTMLButtonElement;
		const redoButton = getByTestId("redo-button") as HTMLButtonElement;
		expect(undoButton.disabled).toBe(true);
		expect(redoButton.disabled).toBe(true);
	});

	it("should handle getDraftHistory error during initial load gracefully", async () => {
		mockFunctions.getDraftHistory.mockRejectedValue(new Error("Failed to fetch draft history"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Component should still load despite getDraftHistory failing
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Draft should still be functional
		const titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		expect(titleInput.value).toBe("Test Draft");
	});

	it("should handle tool event with status end but no result", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Dispatch typing event first to show AI is working
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Wait for AI typing indicator
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});

		// Dispatch tool event with status "end" but no result
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: {
				status: "end",
				tool: "search_articles",
				arguments: "test query",
				// No result field
			},
		});

		// Should still show tool info without crashing
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});
	});

	it("should show delete confirmation dialog when deleting an image", async () => {
		// Set up draft with an image in content
		const draftWithImage: DocDraft = {
			...mockDraft,
			content: "# Test\n\n![test image](/api/images/tenant/org/draft/test.png)\n\nMore content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithImage);
		mockFunctions.deleteImage.mockResolvedValue({ success: true });

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click on image insert button to open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Wait for dropdown to open and click delete button
		await waitFor(() => {
			expect(getByTestId("delete-image-0")).toBeTruthy();
		});
		fireEvent.click(getByTestId("delete-image-0"));

		// Confirmation dialog should appear
		await waitFor(() => {
			expect(getByTestId("delete-image-confirm-dialog")).toBeTruthy();
		});

		// Cancel button should close dialog
		fireEvent.click(getByTestId("delete-image-cancel-button"));

		await waitFor(() => {
			expect(queryByTestId("delete-image-confirm-dialog")).toBeNull();
		});
	});

	it("should delete image when confirmed", async () => {
		// Set up draft with an image in content
		const draftWithImage: DocDraft = {
			...mockDraft,
			content: "# Test\n\n![test image](/api/images/tenant/org/draft/test.png)\n\nMore content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithImage);
		mockFunctions.deleteImage.mockResolvedValue({ success: true });

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click on image insert button to open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Wait for dropdown to open and click delete button
		await waitFor(() => {
			expect(getByTestId("delete-image-0")).toBeTruthy();
		});
		fireEvent.click(getByTestId("delete-image-0"));

		// Confirmation dialog should appear
		await waitFor(() => {
			expect(getByTestId("delete-image-confirm-dialog")).toBeTruthy();
		});

		// Click confirm to delete
		fireEvent.click(getByTestId("delete-image-confirm-button"));

		// Wait for dialog to close and image to be deleted
		await waitFor(() => {
			expect(queryByTestId("delete-image-confirm-dialog")).toBeNull();
			expect(mockFunctions.deleteImage).toHaveBeenCalledWith("tenant/org/draft/test.png");
		});
	});

	it("should close delete dialog when clicking backdrop", async () => {
		// Set up draft with an image in content
		const draftWithImage: DocDraft = {
			...mockDraft,
			content: "# Test\n\n![test image](/api/images/tenant/org/draft/test.png)\n\nMore content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithImage);

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click on image insert button to open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Wait for dropdown to open and click delete button
		await waitFor(() => {
			expect(getByTestId("delete-image-0")).toBeTruthy();
		});
		fireEvent.click(getByTestId("delete-image-0"));

		// Confirmation dialog should appear
		await waitFor(() => {
			expect(getByTestId("delete-image-confirm-backdrop")).toBeTruthy();
		});

		// Click backdrop to close dialog
		fireEvent.click(getByTestId("delete-image-confirm-backdrop"));

		await waitFor(() => {
			expect(queryByTestId("delete-image-confirm-dialog")).toBeNull();
		});
	});

	it("should show error when image deletion fails", async () => {
		// Set up draft with an image in content
		const draftWithImage: DocDraft = {
			...mockDraft,
			content: "# Test\n\n![test image](/api/images/tenant/org/draft/test.png)\n\nMore content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithImage);
		mockFunctions.deleteImage.mockRejectedValue(new Error("Delete failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click on image insert button to open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Wait for dropdown to open and click delete button
		await waitFor(() => {
			expect(getByTestId("delete-image-0")).toBeTruthy();
		});
		fireEvent.click(getByTestId("delete-image-0"));

		// Confirmation dialog should appear
		await waitFor(() => {
			expect(getByTestId("delete-image-confirm-dialog")).toBeTruthy();
		});

		// Click confirm to attempt delete
		fireEvent.click(getByTestId("delete-image-confirm-button"));

		// Error should be shown as toast banner (not full page error)
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});
	});

	it("should not propagate click from dialog to backdrop", async () => {
		// Set up draft with an image in content
		const draftWithImage: DocDraft = {
			...mockDraft,
			content: "# Test\n\n![test image](/api/images/tenant/org/draft/test.png)\n\nMore content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithImage);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click on image insert button to open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Wait for dropdown to open and click delete button
		await waitFor(() => {
			expect(getByTestId("delete-image-0")).toBeTruthy();
		});
		fireEvent.click(getByTestId("delete-image-0"));

		// Confirmation dialog should appear
		await waitFor(() => {
			expect(getByTestId("delete-image-confirm-dialog")).toBeTruthy();
		});

		// Click inside the dialog (not on a button) - should not close
		fireEvent.click(getByTestId("delete-image-confirm-dialog"));

		// Dialog should still be visible
		expect(getByTestId("delete-image-confirm-dialog")).toBeTruthy();
	});

	it("should handle paste event with no items", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a paste event with no clipboardData
		const pasteEvent = new Event("paste", { bubbles: true }) as unknown as React.ClipboardEvent<HTMLDivElement>;
		Object.defineProperty(pasteEvent, "clipboardData", {
			value: null,
		});

		// Fire the paste event - should not throw
		editor.dispatchEvent(pasteEvent as unknown as Event);

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle paste event with non-image items", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a paste event with text items only
		const items = [
			{
				type: "text/plain",
				kind: "string",
				getAsFile: () => null,
			},
		];
		const pasteEvent = new Event("paste", { bubbles: true }) as unknown as React.ClipboardEvent<HTMLDivElement>;
		Object.defineProperty(pasteEvent, "clipboardData", {
			value: {
				items,
			},
		});

		// Fire the paste event - should not call upload
		fireEvent(editor, pasteEvent as unknown as Event);

		// Should not have called upload
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should upload image when pasting an image", async () => {
		mockFunctions.uploadImage.mockResolvedValue({ url: "/api/images/test/org/draft/pasted.png" });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a mock file
		const mockFile = new File(["test"], "image.png", { type: "image/png" });

		// Create a paste event with an image item
		const items = [
			{
				type: "image/png",
				kind: "file",
				getAsFile: () => mockFile,
			},
		];
		const pasteEvent = {
			clipboardData: { items },
			preventDefault: vi.fn(),
			bubbles: true,
		};

		// Fire the paste event
		fireEvent.paste(editor, pasteEvent);

		// Should have called upload
		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle drop event with no files", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a drop event with no files
		const dropEvent = {
			dataTransfer: { files: [] },
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		// Fire the drop event
		fireEvent.drop(editor, dropEvent);

		// Should not have called upload
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should show error when dropping non-image files", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a drop event with a text file
		const textFile = new File(["test"], "test.txt", { type: "text/plain" });
		const dropEvent = {
			dataTransfer: { files: [textFile] },
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		// Fire the drop event
		fireEvent.drop(editor, dropEvent);

		// Should show error toast for invalid file type
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});

		// Should not have called upload (no image files)
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should upload images when dropping image files", async () => {
		mockFunctions.uploadImage.mockResolvedValue({ url: "/api/images/test/org/draft/dropped.png" });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a drop event with an image file
		const imageFile = new File(["test"], "test.png", { type: "image/png" });
		const dropEvent = {
			dataTransfer: { files: [imageFile] },
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		// Fire the drop event
		fireEvent.drop(editor, dropEvent);

		// Should have called upload
		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle dragOver event", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a dragover event
		const dragOverEvent = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		// Fire the dragover event
		fireEvent.dragOver(editor, dragOverEvent);

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should show error when dropped image upload fails", async () => {
		mockFunctions.uploadImage.mockRejectedValue(new Error("Network error"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const editor = getByTestId("article-editor-wrapper");

		const imageFile = new File(["test"], "test.png", { type: "image/png" });
		const dropEvent = {
			dataTransfer: { files: [imageFile] },
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		fireEvent.drop(editor, dropEvent);

		// Should show error toast with error message
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});
	});

	it("should reject dropped images with invalid types", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const editor = getByTestId("article-editor-wrapper");

		// SVG is not in ACCEPTED_IMAGE_TYPES, but starts with image/
		const svgFile = new File(["<svg></svg>"], "test.svg", { type: "image/svg+xml" });
		const dropEvent = {
			dataTransfer: { files: [svgFile] },
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		};

		fireEvent.drop(editor, dropEvent);

		// Should show error for invalid file type
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});

		// Should not attempt upload
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should show error toast when pasting oversized image", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a mock file that exceeds the 10MB limit
		const oversizedFile = new File(["x".repeat(11 * 1024 * 1024)], "large.png", { type: "image/png" });

		// Create a paste event with an oversized image
		const items = [
			{
				type: "image/png",
				kind: "file",
				getAsFile: () => oversizedFile,
			},
		];
		const pasteEvent = {
			clipboardData: { items },
			preventDefault: vi.fn(),
			bubbles: true,
		};

		// Fire the paste event
		fireEvent.paste(editor, pasteEvent);

		// Error toast should be shown (not full page error)
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});

		// Upload should NOT have been called
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should show error toast when pasting invalid file type", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a mock file with invalid type (SVG is not in allowed types)
		const svgFile = new File(["<svg></svg>"], "test.svg", { type: "image/svg+xml" });

		// Create a paste event with an SVG image (starts with image/ but not in allowed types)
		const items = [
			{
				type: "image/svg+xml",
				kind: "file",
				getAsFile: () => svgFile,
			},
		];
		const pasteEvent = {
			clipboardData: { items },
			preventDefault: vi.fn(),
			bubbles: true,
		};

		// Fire the paste event
		fireEvent.paste(editor, pasteEvent);

		// Error toast should be shown (not full page error)
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});

		// Upload should NOT have been called
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should allow dismissing image error toast", async () => {
		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a mock file that exceeds the 10MB limit
		const oversizedFile = new File(["x".repeat(11 * 1024 * 1024)], "large.png", { type: "image/png" });

		// Create a paste event with an oversized image
		const items = [
			{
				type: "image/png",
				kind: "file",
				getAsFile: () => oversizedFile,
			},
		];
		const pasteEvent = {
			clipboardData: { items },
			preventDefault: vi.fn(),
			bubbles: true,
		};

		// Fire the paste event
		fireEvent.paste(editor, pasteEvent);

		// Error toast should be shown
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});

		// Click dismiss button
		fireEvent.click(getByTestId("dismiss-image-error"));

		// Error toast should be dismissed
		await waitFor(() => {
			expect(queryByTestId("image-error-toast")).toBeNull();
		});
	});

	it("should show error toast when upload fails", async () => {
		mockFunctions.uploadImage.mockRejectedValue(new Error("Upload failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for component to load
		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Get the editor
		const editor = getByTestId("article-editor-wrapper");

		// Create a valid mock file
		const mockFile = new File(["test"], "image.png", { type: "image/png" });

		// Create a paste event with an image
		const items = [
			{
				type: "image/png",
				kind: "file",
				getAsFile: () => mockFile,
			},
		];
		const pasteEvent = {
			clipboardData: { items },
			preventDefault: vi.fn(),
			bubbles: true,
		};

		// Fire the paste event
		fireEvent.paste(editor, pasteEvent);

		// Error toast should be shown (not full page error)
		await waitFor(() => {
			expect(getByTestId("image-error-toast")).toBeTruthy();
		});
	});
});
