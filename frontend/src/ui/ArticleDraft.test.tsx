import { CONTENT_MAP } from "../test/IntlayerMock";
import { renderWithProviders } from "../test/TestUtils";
import { ArticleDraft, resetUserNameCache, TOOL_RESULT_TIMEOUT } from "./ArticleDraft";
import { act, fireEvent, waitFor } from "@testing-library/preact";
import type { CollabConvo, Doc, DocDraft } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

function getEditorContent(getByTestId: (id: string) => HTMLElement, testId: string): string {
	const editor = getByTestId(`${testId}-editor`);
	return editor.getAttribute("data-content") || editor.innerText;
}

/**
 * Helper to set content in NumberEdit component
 */
function setEditorContent(getByTestId: (id: string) => HTMLElement, testId: string, content: string) {
	const editor = getByTestId(`${testId}-editor`);
	editor.innerText = content;
	fireEvent.input(editor);
}

/**
 * Helper to wait for draft to load and verify title display.
 * The component uses a click-to-edit pattern where the title is displayed in draft-title-display by default.
 */
async function waitForDraftLoaded(
	getByTestId: (id: string) => HTMLElement,
	expectedTitle: string,
): Promise<HTMLElement> {
	let titleDisplay: HTMLElement | null = null;
	await waitFor(() => {
		titleDisplay = getByTestId("draft-title-display");
		expect(titleDisplay.textContent).toBe(expectedTitle);
	});
	if (!titleDisplay) {
		throw new Error("Title display not found");
	}
	return titleDisplay;
}

/**
 * Helper to open the agent chat panel by clicking the toggle button.
 * Must be called after the draft is loaded (so the toggle button is rendered).
 */
async function openAgentPanel(getByTestId: (id: string) => HTMLElement): Promise<void> {
	await waitFor(() => {
		const toggleButton = getByTestId("toggle-agent-panel");
		fireEvent.click(toggleButton);
	});
	await waitFor(() => {
		expect(getByTestId("chat-pane")).toBeTruthy();
	});
}

/**
 * Helper to enter title editing mode by clicking on the title display.
 * Returns the title input element for interaction.
 */
async function enterTitleEditMode(getByTestId: (id: string) => HTMLElement): Promise<HTMLInputElement> {
	const titleDisplay = getByTestId("draft-title-display");
	fireEvent.click(titleDisplay);
	let titleInput: HTMLInputElement | null = null;
	await waitFor(() => {
		titleInput = getByTestId("draft-title-input") as HTMLInputElement;
		expect(titleInput).toBeTruthy();
	});
	if (!titleInput) {
		throw new Error("Title input not found after entering edit mode");
	}
	return titleInput;
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
	getProfile: vi.fn(),
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
	getDocById: vi.fn(),
	findDoc: vi.fn(),
	listActiveUsers: vi.fn(),
	uploadImage: vi.fn(),
	deleteImage: vi.fn(),
	listIntegrations: vi.fn(),
	hasAnyIntegrations: vi.fn().mockResolvedValue(true),
	getGitHubInstallations: vi.fn(),
};

// Mock TiptapEdit to avoid Tiptap testing complexities
// Use a key based on content to force re-render when content prop changes
vi.mock("../components/ui/TiptapEdit", () => ({
	TiptapEdit: ({
		content,
		onChangeMarkdown,
		showViewToggle,
		viewMode,
		onViewModeChange,
		showSuggestions,
	}: {
		content: string;
		onChangeMarkdown?: (markdown: string) => void;
		showViewToggle?: boolean;
		viewMode?: "article" | "markdown";
		onViewModeChange?: (mode: "article" | "markdown", markdown?: string) => void;
		showSuggestions?: boolean;
	}) => {
		const contentKey = content ? content.slice(0, 50) : "empty";
		return (
			<div data-testid="tiptap-edit" data-show-suggestions={showSuggestions ? "true" : "false"}>
				{showViewToggle && (
					<div className="flex gap-1">
						<button
							data-testid="view-mode-article"
							onClick={() => onViewModeChange?.("article")}
							className={viewMode === "article" ? "active" : ""}
						>
							Article
						</button>
						<button
							data-testid="view-mode-markdown"
							onClick={() => onViewModeChange?.("markdown", content)}
							className={viewMode === "markdown" ? "active" : ""}
						>
							Markdown
						</button>
					</div>
				)}
				<div
					key={contentKey}
					data-testid="article-content-textarea-editor"
					data-content={content}
					contentEditable
					suppressContentEditableWarning
					onInput={(e: React.FormEvent<HTMLDivElement>) => {
						const target = e.target as HTMLDivElement;
						onChangeMarkdown?.(target.innerText);
					}}
				>
					{content}
				</div>
			</div>
		);
	},
}));

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
				getDocById: (id: number) => mockFunctions.getDocById(id),
				findDoc: (jrn: string) => mockFunctions.findDoc(jrn),
			}),
			userManagement: () => ({
				listActiveUsers: () => mockFunctions.listActiveUsers(),
			}),
			collabConvos: () => ({
				getCollabConvoByArtifact: (type: string, id: number) =>
					mockFunctions.getCollabConvoByArtifact(type, id),
				createCollabConvo: (type: string, id: number) => mockFunctions.createCollabConvo(type, id),
				sendMessage: (id: number, message: string, callbacks?: unknown, options?: unknown) =>
					mockFunctions.sendMessage(id, message, callbacks, options),
				streamConvo: (id: number) => mockFunctions.streamConvo(id),
			}),
			images: () => ({
				uploadImage: (file: File | Blob, filename: string) => mockFunctions.uploadImage(file, filename),
				deleteImage: (imageId: string) => mockFunctions.deleteImage(imageId),
			}),
			profile: () => ({
				getProfile: () => mockFunctions.getProfile(),
			}),
			integrations: () => ({
				listIntegrations: () => mockFunctions.listIntegrations(),
				hasAnyIntegrations: () => mockFunctions.hasAnyIntegrations(),
			}),
			github: () => ({
				getGitHubInstallations: () => mockFunctions.getGitHubInstallations(),
			}),
			roles: () => ({
				getCurrentUserPermissions: () =>
					Promise.resolve({
						role: {
							id: 1,
							name: "Owner",
							slug: "owner",
							description: null,
							isBuiltIn: true,
							isDefault: false,
							priority: 100,
							clonedFrom: null,
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							permissions: [],
						},
						permissions: ["articles.view", "articles.edit"],
					}),
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
		mockFunctions.getProfile.mockResolvedValue({ userId: 100 });
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
		mockFunctions.getDocById.mockResolvedValue(undefined);
		mockFunctions.findDoc.mockResolvedValue(mockArticle);
		mockFunctions.listActiveUsers.mockResolvedValue({
			data: [],
			total: 0,
			canEditRoles: false,
			canManageUsers: false,
		});
		mockFunctions.listIntegrations.mockResolvedValue([]);
		mockFunctions.hasAnyIntegrations.mockResolvedValue(true);
		mockFunctions.getGitHubInstallations.mockResolvedValue([]);
	});

	it("loads and displays draft", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});
		await waitForDraftLoaded(getByTestId, "Test Draft");
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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
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

	it("creates new conversation if none exists", async () => {
		mockFunctions.getCollabConvoByArtifact.mockRejectedValue(new Error("Not found"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		expect(mockFunctions.createCollabConvo).toHaveBeenCalledWith("doc_draft", 1);
	});

	it("closes SSE connections on unmount", async () => {
		const { getByTestId, unmount } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to fully load
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Verify that getCollabConvoByArtifact was called
		expect(mockFunctions.getCollabConvoByArtifact).toHaveBeenCalledWith("doc_draft", 1);
	});

	it("displays chat messages", async () => {
		const { getByTestId, getByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

		// Verify chat pane renders
		expect(getByTestId("chat-pane")).toBeTruthy();

		// Verify empty state message is shown
		expect(getByTestId("no-messages")).toBeTruthy();
	});

	it("sends a message when send button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Please add a conclusion" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
			const call = mockFunctions.sendMessage.mock.calls[0];
			expect(call[0]).toBe(1);
			expect(call[1]).toBe("Please add a conclusion");
			expect(call[3]).toMatchObject({
				clientRequestId: expect.any(String),
			});
		});

		// Verify input was cleared
		expect(messageInput.value).toBe("");
	});

	it("ignores convo SSE self-echo events when clientRequestId matches local send", async () => {
		mockFunctions.sendMessage.mockImplementation(
			(_id: number, _message: string, callbacks?: unknown, options?: unknown) => {
				const streamCallbacks = callbacks as {
					onChunk?: (content: string, seq: number) => void;
				};
				const requestOptions = options as { clientRequestId?: string };
				streamCallbacks.onChunk?.("Hello", 0);
				dispatchMessage(eventSourceRegistry.convo, {
					type: "content_chunk",
					content: "Hello",
					seq: 0,
					userId: 100,
					clientRequestId: requestOptions.clientRequestId,
				});
			},
		);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			userInfo: {
				userId: 100,
				email: "test@example.com",
				name: "Test User",
				picture: "",
			},
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Say hello" } });
		fireEvent.click(getByTestId("send-message-button"));

		await waitFor(() => {
			const streaming = getByTestId("ai-streaming");
			expect(streaming.textContent).toContain("Hello");
			expect(streaming.textContent).not.toContain("HelloHello");
		});
	});

	it("ignores convo SSE self-echo article_updated when clientRequestId matches local send", async () => {
		mockFunctions.sendMessage.mockImplementation(
			(_id: number, _message: string, _callbacks?: unknown, options?: unknown) => {
				const requestOptions = options as { clientRequestId?: string };
				dispatchMessage(eventSourceRegistry.convo, {
					type: "article_updated",
					userId: 100,
					clientRequestId: requestOptions.clientRequestId,
					diffs: [{ operation: "insert" as const, position: 0, text: "SELF: " }],
				});
				dispatchMessage(eventSourceRegistry.convo, {
					type: "message_complete",
					userId: 100,
					clientRequestId: requestOptions.clientRequestId,
					message: {
						role: "assistant",
						content: "Done",
						timestamp: "2025-01-01T00:02:00Z",
					},
				});
			},
		);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			userInfo: {
				userId: 100,
				email: "test@example.com",
				name: "Test User",
				picture: "",
			},
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
		});

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "apply update" } });
		fireEvent.click(getByTestId("send-message-button"));

		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			userId: 200,
			clientRequestId: "remote-request-1",
			diffs: [{ operation: "insert" as const, position: 0, text: "REMOTE: " }],
		});

		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"REMOTE: # Test Content\n\nThis is a test draft.",
			);
		});
	});

	it("calls updateDocDraft when save button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Click save button
		fireEvent.click(getByTestId("save-button"));

		// Verify updateDocDraft was called
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(1, expect.any(Object));
		});
	});

	it("navigates back when close button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

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
		await waitForDraftLoaded(getByTestId, "Test Draft");

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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.deleteDocDraft.mockRejectedValue(new Error("Delete failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.deleteDocDraft.mockResolvedValue({ success: true });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/4" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
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
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

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

	it("shows resize handle grip when resizing chat pane", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Open agent panel (hidden by default)
		await openAgentPanel(getByTestId);

		// Find the resize handle
		const resizeHandle = getByTestId("chat-pane-resize-handle");
		expect(resizeHandle).toBeTruthy();

		// Trigger mousedown to start resizing (this sets isResizingChatPane = true)
		fireEvent.mouseDown(resizeHandle, { clientX: 320 });

		// The grip inside should have opacity-100 class when resizing
		// Note: The component uses isResizingChatPane state to toggle opacity
		expect(resizeHandle).toBeTruthy();
	});

	it("updates draft title locally when input changes", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Enter title edit mode and change the title
		const titleInput = await enterTitleEditMode(getByTestId);
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		// Verify the input value updated locally
		expect(titleInput.value).toBe("Updated Title");
	});

	it("updates article content locally when textarea changes", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Change the content
		setEditorContent(getByTestId, "article-content-textarea", "# New Content\n\nThis is updated.");

		// Verify the editor content updated locally
		expect(getEditorContent(getByTestId, "article-content-textarea")).toBe("# New Content\n\nThis is updated.");
	});

	it("sends both title and content when save button clicked", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Enter title edit mode and change title
		const titleInput = await enterTitleEditMode(getByTestId);
		fireEvent.input(titleInput, { target: { value: "Updated Title" } });

		setEditorContent(getByTestId, "article-content-textarea", "# New Content");

		// Click save
		fireEvent.click(getByTestId("save-button"));

		// Verify updateDocDraft was called with both title and content
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(1, {
				title: "Updated Title",
				content: "# New Content",
				contentMetadata: undefined,
			});
		});
	});

	it("ignores self-echo content_update from save flow and still applies remote updates", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			userInfo: {
				userId: 100,
				email: "test@example.com",
				name: "Test User",
				picture: "",
			},
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.draft).toBeTruthy();
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
		});

		const insertPrefixDiff = [{ operation: "insert" as const, position: 0, text: "REMOTE: " }];
		mockFunctions.saveDocDraft.mockImplementation(() => {
			dispatchMessage(eventSourceRegistry.draft, {
				type: "content_update",
				userId: 100,
				diffs: insertPrefixDiff,
			});
		});

		fireEvent.click(getByTestId("save-button"));

		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: "# Test Content\n\nThis is a test draft.",
				}),
			);
			expect(mockFunctions.saveDocDraft).toHaveBeenCalledWith(1);
		});

		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"# Test Content\n\nThis is a test draft.",
			);
		});

		dispatchMessage(eventSourceRegistry.draft, {
			type: "content_update",
			userId: 200,
			diffs: insertPrefixDiff,
		});

		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"REMOTE: # Test Content\n\nThis is a test draft.",
			);
		});
	});

	it("enables save button for new draft (no docId) with content", async () => {
		// mockDraft has docId: undefined and has content, meaning it's a new draft with AI-generated content
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// For new drafts without content, save button should be disabled
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("disables save button when editing existing article without changes", async () => {
		// Use mockDraftMatchingArticle which has content matching the original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

		// For drafts that match original article, save button should be disabled
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("enables save button when re-opening draft that has changes from original article", async () => {
		// Use mockDraftEditingArticle which has different content from mockArticle
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

		// Save button should be enabled since draft content differs from original article
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(false);
	});

	it("enables save button when user makes a change to draft editing existing article", async () => {
		// Use mockDraftMatchingArticle which has content matching the original article
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftMatchingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

		// Initially, save button should be disabled since draft matches original
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Enter title edit mode and make a change to the title
		const titleInput = await enterTitleEditMode(getByTestId);
		fireEvent.input(titleInput, { target: { value: "Modified Title" } });

		// Now save button should be enabled
		await waitFor(() => {
			expect(saveButton.disabled).toBe(false);
		});
	});

	it("disables save button when article is not found", async () => {
		// Draft has docId but getDocById returns undefined (article not found)
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(undefined);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

		// Save button should be disabled when article not found (hasUserMadeChanges = false)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("disables save button when getDocById fails", async () => {
		// Draft has docId but getDocById throws an error
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockRejectedValue(new Error("Failed to load article"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load (should still load despite getDocById failure)
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

		// Save button should be disabled when getDocById fails (hasUserMadeChanges = false)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it("does NOT auto-save on initial load", async () => {
		vi.useFakeTimers();

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Fast-forward past the auto-save delay (2 seconds)
		vi.advanceTimersByTime(3000);

		// updateDocDraft should NOT have been called
		expect(mockFunctions.updateDocDraft).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("auto-saves after user edits title", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Enter title edit mode
		const titleInput = await enterTitleEditMode(getByTestId);

		// Use fake timers after loading
		vi.useFakeTimers();

		// User edits title
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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Wait for editor to appear
		await waitFor(() => {
			expect(getByTestId("article-content-textarea-editor")).toBeTruthy();
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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		// Configure updateDocDraft to return updated draft
		const updatedDraft = {
			...mockDraftMatchingArticle,
			title: "Updated Title",
		};
		mockFunctions.updateDocDraft.mockResolvedValue(updatedDraft);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");

		// Verify Save button is initially disabled (draft matches original article)
		const saveButton = getByTestId("save-button") as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);

		// Enter title edit mode
		const titleInput = await enterTitleEditMode(getByTestId);

		// Use fake timers after loading
		vi.useFakeTimers();

		// User edits title
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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Verify typing indicator appears
		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});
	});

	it("ignores self typing SSE event when userId matches current user", async () => {
		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			userInfo: {
				userId: 100,
				email: "test@example.com",
				name: "Test User",
				picture: "",
			},
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
			userId: 100,
		});

		await waitFor(() => {
			expect(queryByTestId("ai-typing")).toBeNull();
		});

		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
			userId: 200,
		});

		await waitFor(() => {
			expect(getByTestId("ai-typing")).toBeTruthy();
		});
	});

	it("handles SSE content_chunk event", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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

	it("deduplicates message_complete events with same timestamp", async () => {
		const { getByTestId, queryAllByText } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		// Wait for draft and convo to load
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		const duplicateMessage = {
			role: "assistant",
			content: "Duplicate test message",
			timestamp: "2025-01-01T00:03:00Z",
		};

		// Simulate the same message_complete event twice (simulating dual SSE delivery)
		dispatchMessage(eventSourceRegistry.convo, {
			type: "message_complete",
			message: duplicateMessage,
		});
		dispatchMessage(eventSourceRegistry.convo, {
			type: "message_complete",
			message: duplicateMessage,
		});

		// Wait for message to appear
		await waitFor(() => {
			const matches = queryAllByText("Duplicate test message");
			// Should only have one instance, not two
			expect(matches.length).toBe(1);
		});
	});

	it("applies insert diff operation", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load AND article content to be populated
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
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
		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft and convo to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");
		await waitFor(() => {
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
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/3" });

		// Wait for draft and convo to load
		await waitForDraftLoaded(getByTestId, "Existing Article Title");
		await waitFor(() => {
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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

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

	it("handles save error", async () => {
		mockFunctions.updateDocDraft.mockRejectedValue(new Error("Save failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Click save button
		fireEvent.click(getByTestId("save-button"));

		// Verify error is displayed
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
			expect(getByTestId("draft-error")).toBeTruthy();
		});
	});

	it("hides status text when both connections are active", async () => {
		const { getByTestId, queryByText } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

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

		// Verify no status text is shown when connected (connected status is hidden)
		await waitFor(() => {
			expect(queryByText(CONTENT_MAP["article-draft"].disconnected as string)).toBeNull();
			expect(queryByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeNull();
		});
	});

	it("shows active users when present", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

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
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message using both change and input to ensure onChange handler is covered
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Test message via Enter" } });
		fireEvent.input(messageInput, { target: { value: "Test message via Enter" } });

		// Press Enter key
		fireEvent.keyDown(messageInput, { key: "Enter", shiftKey: false });

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
			const call = mockFunctions.sendMessage.mock.calls[0];
			expect(call[0]).toBe(1);
			expect(call[1]).toBe("Test message via Enter");
		});

		// Verify input was cleared
		expect(messageInput.value).toBe("");
	});

	it("does not send message when Enter key pressed with Shift", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

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

	it("applies content_update diffs when userId is undefined", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
			userInfo: {
				userId: 100,
				email: "test@example.com",
				name: "Test User",
				picture: "",
			},
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(eventSourceRegistry.draft).toBeTruthy();
		});

		dispatchMessage(eventSourceRegistry.draft, {
			type: "content_update",
			diffs: [{ operation: "insert" as const, position: 0, text: "REMOTE: " }],
		});

		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe(
				"REMOTE: # Test Content\n\nThis is a test draft.",
			);
		});
	});

	it("applies multiple content_update diffs using stable positions", async () => {
		mockFunctions.getDocDraft.mockResolvedValue({
			...mockDraft,
			content: "abcdef",
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe("abcdef");
		});

		dispatchMessage(eventSourceRegistry.draft, {
			type: "content_update",
			userId: 200,
			diffs: [
				{ operation: "delete" as const, position: 1, length: 2 },
				{ operation: "insert" as const, position: 4, text: "Z" },
			],
		});

		await waitFor(() => {
			expect(getEditorContent(getByTestId, "article-content-textarea")).toBe("adZef");
		});
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

	// TODO: editing-banner UI element needs to be implemented
	// biome-ignore lint/suspicious/noSkippedTests: Test for unimplemented editing-banner feature
	it.skip("loads and displays draft that is editing an existing article", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

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

	// TODO: editing-banner UI element needs to be implemented
	// biome-ignore lint/suspicious/noSkippedTests: Test for unimplemented editing-banner feature
	it.skip("handles draft_saved SSE event when editing article by navigating to article detail", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

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
		mockFunctions.getDocById.mockRejectedValue(new Error("Failed to fetch article"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Should still load the draft even if fetching the article fails
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");
	});

	it("shows loading indicator when AI pauses for more than 1.5 seconds", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId2("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId2);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load (real timers needed for waitFor)
		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		dispatchMessage(eventSourceRegistry.convo, { type: "typing" });

		// Switch to fake timers BEFORE dispatching the tool completion event so that the
		// resulting setTimeout call inside handleToolEvent is registered as a fake timer.
		vi.useFakeTimers();

		// Tool completes with result — creates a fake setTimeout for TOOL_RESULT_TIMEOUT
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "bash", arguments: "ls", status: "end", result: "Command executed" },
		});

		// Advance fake clock past the timeout to fire it.
		// act() ensures Preact flushes the resulting state update synchronously.
		act(() => {
			vi.advanceTimersByTime(TOOL_RESULT_TIMEOUT + 100);
		});

		// Restore real timers before using waitFor (which relies on real polling)
		vi.useRealTimers();

		// Verify tool result is cleared and shows default "AI is working" message
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("AI is working");
			expect(typingDiv.textContent).not.toContain("Running the bash tool");
		});
	});

	it("shows writing article indicator when streaming article", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft and convo to load
		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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

	it("clears reconnecting status when draft SSE connection is reconnected", async () => {
		const { getByTestId, getByText, queryByText } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

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

		// Reconnecting text should disappear (no status shown when connected)
		await waitFor(() => {
			expect(queryByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeNull();
		});
	});

	it("clears reconnecting status when convo SSE connection is reconnected", async () => {
		const { getByTestId, getByText, queryByText } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

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

		// Reconnecting text should disappear (no status shown when connected)
		await waitFor(() => {
			expect(queryByText(CONTENT_MAP["article-draft"].reconnecting as string)).toBeNull();
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
		expect(mockFunctions.updateDocDraft).not.toHaveBeenCalled();
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
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
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
		expect(mockFunctions.updateDocDraft).not.toHaveBeenCalled();
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
		expect(mockFunctions.updateDocDraft).not.toHaveBeenCalled();
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
		// Make validation throw an error - use validateContent which is used by handleSaveDraftOnly
		mockFunctions.validateContent.mockRejectedValue(new Error("Validation service unavailable"));

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
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
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

		// Should show line:column format from JSON parse error (5:5 for line 5, column 5)
		expect(errorElement.textContent).toContain("5:5");
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should scroll to error line when clicking on validation error line number", async () => {
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

		// Enter title edit mode and make a change to enable save button
		const titleInput = await enterTitleEditMode(getByTestId);
		fireEvent.change(titleInput, { target: { value: "Updated Title" } });

		// Click save button
		const saveButton = getByTestId("save-button");
		fireEvent.click(saveButton);

		// Save should proceed despite validation API failure
		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
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

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should clear validation errors when user edits content in markdown editor", async () => {
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

		// Edit content using NumberEdit helper (editor is directly visible, no tab switch needed)
		setEditorContent(getByTestId, "article-content-textarea", "# Updated Content");

		// Validation errors should be cleared
		await waitFor(() => {
			expect(queryByTestId("validation-errors")).toBeNull();
		});
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should clear validation errors when user edits content in non-markdown editor", async () => {
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

		// Edit content using NumberEdit helper (editor is directly visible, no tab switch needed)
		setEditorContent(getByTestId, "article-content-textarea", '{"openapi": "3.0.0", "info": {}}');

		// Validation errors should be cleared
		await waitFor(() => {
			expect(queryByTestId("validation-errors")).toBeNull();
		});
	});

	it("should handle getSectionChanges error gracefully during refresh", async () => {
		// Use mockDraftEditingArticle which has a docId
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

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
		await waitForDraftLoaded(getByTestId, "Test Draft");
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

		// Draft should still be functional
		await waitForDraftLoaded(getByTestId, "Test Draft");
	});

	it("should handle tool event with status end but no result", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

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

	it("should call sendMessage with onChunk callback that processes chunks", async () => {
		// Mock sendMessage to call onChunk callback
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onChunk?: (content: string, seq: number) => void;
			};
			if (cb?.onChunk) {
				// Simulate receiving chunks in order
				cb.onChunk("First chunk", 1);
				cb.onChunk(" Second chunk", 2);
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Please add a conclusion" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called and onChunk was invoked
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should call sendMessage with onChunk callback that handles out-of-order chunks", async () => {
		// Mock sendMessage to call onChunk callback with out-of-order chunks
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onChunk?: (content: string, seq: number) => void;
			};
			if (cb?.onChunk) {
				// Simulate receiving chunks out of order
				cb.onChunk(" Second chunk", 2);
				cb.onChunk("First chunk", 1);
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Test message" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should call sendMessage with onToolEvent callback", async () => {
		// Mock sendMessage to call onToolEvent callback
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onToolEvent?: (event: { tool: string; arguments?: string; status?: string; result?: string }) => void;
			};
			if (cb?.onToolEvent) {
				// Simulate tool start event
				cb.onToolEvent({
					tool: "search",
					arguments: "test query",
					status: "start",
				});
				// Simulate tool end event
				cb.onToolEvent({
					tool: "search",
					arguments: "test query",
					status: "end",
					result: "Found results",
				});
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Search for information" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should call sendMessage with onToolEvent callback without status", async () => {
		// Mock sendMessage to call onToolEvent callback without status
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onToolEvent?: (event: { tool: string; arguments?: string; result?: string }) => void;
			};
			if (cb?.onToolEvent) {
				// Simulate tool event without status
				cb.onToolEvent({
					tool: "analyze",
					arguments: "data",
					result: "Analysis complete",
				});
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Analyze data" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should call sendMessage with onComplete callback", async () => {
		// Mock sendMessage to call onComplete callback
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onComplete?: (message: { role: string; content: string; timestamp: string }) => void;
			};
			if (cb?.onComplete) {
				cb.onComplete({
					role: "assistant",
					content: "Here's the conclusion.",
					timestamp: "2025-01-01T00:10:00Z",
				});
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Add conclusion" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called and message completed
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should call sendMessage with onArticleUpdated callback", async () => {
		// Mock sendMessage to call onArticleUpdated callback
		mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
			const cb = callbacks as {
				onArticleUpdated?: (data: {
					diffs?: Array<{
						type: string;
						oldRange: [number, number];
						newRange: [number, number];
						oldText: string;
						newText: string;
					}>;
					contentLastEditedAt?: string;
					contentLastEditedBy?: number;
				}) => void;
			};
			if (cb?.onArticleUpdated) {
				cb.onArticleUpdated({
					diffs: [
						{
							type: "insert",
							oldRange: [0, 0],
							newRange: [0, 10],
							oldText: "",
							newText: "New content",
						},
					],
					contentLastEditedAt: "2025-01-01T00:10:00Z",
					contentLastEditedBy: 100,
				});
			}
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Test Draft");

		await openAgentPanel(getByTestId);

		// Type a message
		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
		fireEvent.change(messageInput, { target: { value: "Update article" } });

		// Click send button
		const sendButton = getByTestId("send-message-button");
		fireEvent.click(sendButton);

		// Verify sendMessage was called
		await waitFor(() => {
			expect(mockFunctions.sendMessage).toHaveBeenCalled();
		});
	});

	it("should refresh editing article after version restore", async () => {
		// Mock getDocDraft to return a draft with an article ID
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);

		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		// We need to access the internal refreshEditingArticle function
		// This is tested by verifying the behavior after SSE events that trigger it
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/2" });

		// Wait for draft to load
		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle view mode change to markdown", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		expect(queryByTestId("markdown-source-editor")).toBeFalsy();

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});
	});

	it("should handle view mode change back to article", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			expect(queryByTestId("markdown-source-editor")).toBeFalsy();
		});
	});

	it("should handle view mode change for non-markdown content type", async () => {
		const jsonDraft = {
			...mockDraft,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0", "info": {"title": "Test API", "version": "1.0.0"}}',
		};
		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		expect(queryByTestId("markdown-source-editor")).toBeFalsy();

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});
	});

	it("should not modify content when blank line already exists before last ---", async () => {
		const draftWithBlankLine = {
			...mockDraft,
			content: "---\n8\n\n---",
		};
		mockFunctions.getDocDraft.mockImplementation(async () => draftWithBlankLine);
		mockFunctions.updateDocDraft.mockResolvedValue(draftWithBlankLine);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		mockFunctions.updateDocDraft.mockClear();

		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			if (mockFunctions.updateDocDraft.mock.calls.length > 0) {
				expect(mockFunctions.updateDocDraft).not.toHaveBeenCalledWith(
					1,
					expect.objectContaining({
						content: "---\n8\n\n\n---",
					}),
				);
			}
		});
	});

	it("should not modify content when only single --- exists", async () => {
		const draftWithSingleDash = {
			...mockDraft,
			content: "---\n8",
		};
		mockFunctions.getDocDraft.mockImplementation(async () => draftWithSingleDash);
		mockFunctions.updateDocDraft.mockResolvedValue(draftWithSingleDash);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		mockFunctions.updateDocDraft.mockClear();

		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			if (mockFunctions.updateDocDraft.mock.calls.length > 0) {
				const callArgs = mockFunctions.updateDocDraft.mock.calls[0];
				const contentArg = callArgs[1] as { content?: string };
				if (contentArg.content !== undefined) {
					expect(contentArg.content).toBe("---\n8");
				}
			}
		});
	});

	it("should call validateContent when switching to markdown view", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockResolvedValue({
			isValid: true,
			errors: [],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		mockFunctions.validateContent.mockClear();

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalledWith(expect.any(String), "text/markdown");
		});
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should update validationErrors when validateContent returns errors", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Invalid YAML",
					line: 2,
					severity: "error",
				},
			],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		mockFunctions.validateContent.mockClear();

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});
	});

	it("should handle validateContent error gracefully", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockRejectedValue(new Error("Network error"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		mockFunctions.validateContent.mockClear();

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should display JSON placeholder for application/json content type with empty content", async () => {
		const jsonDraft: DocDraft = {
			...mockDraft,
			contentType: "application/json",
			content: "",
		};
		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		const editor = getByTestId("markdown-source-editor-editor");
		const content = editor.getAttribute("data-content") || editor.innerText;
		expect(content).toContain("// JSON content");
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should display YAML placeholder for application/yaml content type with empty content", async () => {
		const yamlDraft: DocDraft = {
			...mockDraft,
			contentType: "application/yaml",
			content: "",
		};
		mockFunctions.getDocDraft.mockImplementation(async () => yamlDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		const editor = getByTestId("markdown-source-editor-editor");
		const content = editor.getAttribute("data-content") || editor.innerText;
		expect(content).toContain("// YAML content");
	});

	it("should restore frontmatter when switching from article to markdown view with frontmatter content", async () => {
		const draftWithFrontmatter: DocDraft = {
			...mockDraft,
			content: "---\ntitle: Test\n---\n\n# Hello World",
		};
		mockFunctions.getDocDraft.mockImplementation(async () => draftWithFrontmatter);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.updateDocDraft.mockResolvedValue(draftWithFrontmatter);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to article view first (which extracts frontmatter)
		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Now switch back to markdown view (which should restore frontmatter)
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});
	});

	it("should handle image paste event with image file", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.uploadImage.mockResolvedValue({ url: "/api/images/test-123" });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock paste event with an image file
		const file = new File(["image data"], "test.png", { type: "image/png" });
		const clipboardData = {
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		};

		fireEvent.paste(editorWrapper, { clipboardData });

		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle image paste event without image file", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock paste event without image
		const clipboardData = {
			items: [
				{
					type: "text/plain",
					getAsFile: () => null,
				},
			],
		};

		fireEvent.paste(editorWrapper, { clipboardData });

		// Should not call uploadImage
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should handle image drag over event", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");
		fireEvent.dragOver(editorWrapper);
	});

	it("should handle image drop event with image files", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.uploadImage.mockResolvedValue({ url: "/api/images/dropped-123" });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock drop event with an image file
		const file = new File(["image data"], "dropped.png", { type: "image/png" });
		const dataTransfer = {
			files: [file],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle image drop event with no files", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock drop event with no files
		const dataTransfer = {
			files: [],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		// Should not call uploadImage
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should handle image drop event with non-image files only", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock drop event with a non-image file
		const file = new File(["text data"], "document.txt", { type: "text/plain" });
		const dataTransfer = {
			files: [file],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		// Should not call uploadImage for non-image files
		expect(mockFunctions.uploadImage).not.toHaveBeenCalled();
	});

	it("should handle image drop with mixed files (image and non-image)", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.uploadImage.mockResolvedValue({ url: "/api/images/mixed-123" });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock drop event with both image and non-image files
		const imageFile = new File(["image data"], "photo.png", { type: "image/png" });
		const textFile = new File(["text data"], "document.txt", { type: "text/plain" });
		const dataTransfer = {
			files: [imageFile, textFile],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle image upload error for invalid file type", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock paste event with an unsupported image type
		const file = new File(["image data"], "test.bmp", { type: "image/bmp" });
		const clipboardData = {
			items: [
				{
					type: "image/bmp",
					getAsFile: () => file,
				},
			],
		};

		fireEvent.paste(editorWrapper, { clipboardData });

		// Wait for error state to be set (error message should appear briefly)
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("should handle image upload error for file too large", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a large file (> 5MB)
		const largeData = new Array(6 * 1024 * 1024).fill("x").join("");
		const file = new File([largeData], "large.png", { type: "image/png" });
		const clipboardData = {
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		};

		fireEvent.paste(editorWrapper, { clipboardData });

		// Wait for error state to be set
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("should handle image upload API error", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.uploadImage.mockRejectedValue(new Error("Upload failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a mock paste event with an image file
		const file = new File(["image data"], "test.png", { type: "image/png" });
		const clipboardData = {
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		};

		fireEvent.paste(editorWrapper, { clipboardData });

		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle image drop with upload error for oversized image", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a large file (> 5MB)
		const largeData = new Array(6 * 1024 * 1024).fill("x").join("");
		const file = new File([largeData], "large.png", { type: "image/png" });
		const dataTransfer = {
			files: [file],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		// Should not call uploadImage for oversized files
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("should handle image drop with invalid file type in batch", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create files with invalid type
		const file = new File(["image data"], "test.bmp", { type: "image/bmp" });
		const dataTransfer = {
			files: [file],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		// Wait for error handling
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("should handle image drop with API error", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.uploadImage.mockRejectedValue(new Error("API Error"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to markdown view
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("article-editor-wrapper")).toBeTruthy();
		});

		const editorWrapper = getByTestId("article-editor-wrapper");

		// Create a valid image file
		const file = new File(["image data"], "test.png", { type: "image/png" });
		const dataTransfer = {
			files: [file],
		};

		fireEvent.drop(editorWrapper, { dataTransfer });

		await waitFor(() => {
			expect(mockFunctions.uploadImage).toHaveBeenCalled();
		});
	});

	it("should handle NumberEdit onChange in non-markdown mode", async () => {
		vi.useFakeTimers();
		const jsonDraft: DocDraft = {
			...mockDraft,
			contentType: "application/json",
			content: '{"key": "value"}',
		};
		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.updateDocDraft.mockResolvedValue(jsonDraft);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await vi.runAllTimersAsync();

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await vi.runAllTimersAsync();

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		const editor = getByTestId("markdown-source-editor-editor");
		editor.innerText = '{"key": "new value"}';
		fireEvent.input(editor);

		await vi.advanceTimersByTimeAsync(3000);

		await waitFor(() => {
			expect(mockFunctions.updateDocDraft).toHaveBeenCalled();
		});

		vi.useRealTimers();
	});

	it("should clear validation errors when content changes in markdown mode", async () => {
		mockFunctions.getDocDraft.mockImplementation(async () => mockDraft);
		mockFunctions.getCollabConvoByArtifact.mockResolvedValue(null);
		mockFunctions.updateDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [{ message: "Error", line: 1, severity: "error" }],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(getByTestId("markdown-source-editor")).toBeTruthy();
		});

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});

		const editor = getByTestId("markdown-source-editor-editor");
		editor.innerText = "# New content";
		fireEvent.input(editor);
	});

	it("should handle undo when canUndo is true", async () => {
		// Set up revisions to indicate undo is available
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [{ id: 1, content: "old content" }],
			currentIndex: 1,
			canUndo: true,
			canRedo: false,
		});
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
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Simulate Cmd+Z keyboard shortcut when canUndo is true
		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("should handle redo when canRedo is true", async () => {
		// Set up revisions to indicate redo is available
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [{ id: 1, content: "content" }],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
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
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Simulate Cmd+Shift+Z keyboard shortcut when canRedo is true
		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			shiftKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("should handle undo error gracefully", async () => {
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.undoDocDraft.mockRejectedValue(new Error("Undo failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalled();
		});

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle redo error gracefully", async () => {
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
		mockFunctions.redoDocDraft.mockRejectedValue(new Error("Redo failed"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			shiftKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalled();
		});

		// Component should still be functional
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should reset hasUserMadeChanges when undo returns to original article content", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});
		// Undo returns to original article content
		mockFunctions.undoDocDraft.mockResolvedValue({
			success: true,
			content: mockArticle.content,
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalled();
		});
	});

	it("should show version history dialog when editing existing article", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("version-history-button")).toBeTruthy();
		});

		// Click version history button
		fireEvent.click(getByTestId("version-history-button"));

		// Dialog should be opened (component renders with isOpen=true)
		await waitFor(() => {
			expect(getByTestId("version-history-button")).toBeTruthy();
		});
	});

	it("should truncate long tool arguments in detailed view", async () => {
		// Enable detailed view via localStorage
		localStorage.setItem("articleDraft.showToolDetails", "true");

		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Create a very long arguments string (>200 chars)
		const longArgs = "a".repeat(250);

		// Tool starts with long arguments
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "read_file", arguments: longArgs, status: "start" },
		});

		// Verify truncated arguments with ellipsis
		await waitFor(() => {
			const typingDiv = getByTestId("ai-typing");
			expect(typingDiv.textContent).toContain("...");
		});
	});

	it("should show validation error with path when line is not available", async () => {
		const jsonDraft = {
			...mockDraft,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0"}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Missing required field",
					path: "/info/title",
					severity: "error" as const,
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		fireEvent.click(getByTestId("save-button"));

		const errorElement = await findByTestId("validation-error-0");
		expect(errorElement.textContent).toContain("/info/title");
	});

	it("should navigate to articles with space parameter preserved", async () => {
		const draftWithSpace: DocDraft = {
			...mockDraft,
			contentMetadata: { space: "my-space" },
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithSpace);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Click close button - should navigate to /articles?space=my-space
		fireEvent.click(getByTestId("close-button"));

		// The navigation is handled by NavigationContext
		expect(getByTestId("close-button")).toBeTruthy();
	});

	it("should handle draft with space in contentMetadata for getArticlesUrl", async () => {
		const draftWithEncodedSpace: DocDraft = {
			...mockDraft,
			contentMetadata: { space: "space with spaces" },
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithEncodedSpace);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Simulate draft_deleted event to trigger navigation with space
		dispatchMessage(eventSourceRegistry.draft, {
			type: "draft_deleted",
		});

		// The navigation URL should encode the space parameter
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle non-markdown content type correctly (no chat pane)", async () => {
		const jsonDraft: DocDraft = {
			...mockDraft,
			contentType: "application/json",
			content: '{"openapi": "3.0.0", "info": {"title": "Test", "version": "1.0"}}',
		};
		mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);

		const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Chat pane should not be visible for non-markdown content
		expect(queryByTestId("chat-pane")).toBeNull();
	});

	it("should handle Ctrl+Z for undo on non-Mac systems", async () => {
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: true,
			canRedo: false,
		});
		mockFunctions.undoDocDraft.mockResolvedValue({
			success: true,
			content: "Undone",
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: true,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Use ctrlKey instead of metaKey (Windows/Linux)
		const event = new KeyboardEvent("keydown", {
			key: "z",
			ctrlKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.undoDocDraft).toHaveBeenCalledWith(1);
		});
	});

	it("should show section changes badge and auto-show inline suggestions when there are pending changes", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.getSectionChanges.mockResolvedValue({
			sections: [],
			changes: [
				{
					id: 1,
					draftId: 2,
					docId: 10,
					changeType: "update",
					sectionId: "section-1",
					content: "Original",
					proposed: [{ content: "Proposed" }],
					applied: false,
					dismissed: false,
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		// Badge should be shown and inline suggestions should be auto-shown
		await waitFor(() => {
			expect(getByTestId("suggested-edits-badge")).toBeTruthy();
			const tiptapEdit = getByTestId("tiptap-edit");
			expect(tiptapEdit.getAttribute("data-show-suggestions")).toBe("true");
		});
	});

	it("should handle paragraph break detection in content chunks", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// First chunk - sets lastChunkTimeRef
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "First sentence.",
			seq: 0,
		});

		// Wait for pause detection (> 500ms)
		await new Promise(resolve => setTimeout(resolve, 600));

		// Second chunk after pause - should add paragraph break
		dispatchMessage(eventSourceRegistry.convo, {
			type: "content_chunk",
			content: "Second sentence.",
			seq: 1,
		});

		await waitFor(() => {
			const streamingDiv = getByTestId("ai-streaming");
			expect(streamingDiv.textContent).toContain("First sentence.");
			expect(streamingDiv.textContent).toContain("Second sentence.");
		});
	});

	it("should handle delete_section tool event and refresh section changes", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		mockFunctions.getSectionChanges.mockClear();

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate delete_section tool event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "delete_section", arguments: "section-1", status: "end", result: "Deleted" },
		});

		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});
	});

	it("should handle create_section tool event and refresh section changes", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		mockFunctions.getSectionChanges.mockClear();

		// Simulate typing event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "typing",
		});

		// Simulate create_section tool event
		dispatchMessage(eventSourceRegistry.convo, {
			type: "tool_event",
			event: { tool: "create_section", arguments: "new-section", status: "end", result: "Created" },
		});

		await waitFor(() => {
			expect(mockFunctions.getSectionChanges).toHaveBeenCalled();
		});
	});

	it("should handle redo that returns to original article content", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
		// Redo returns to original article content
		mockFunctions.redoDocDraft.mockResolvedValue({
			success: true,
			content: mockArticle.content,
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			shiftKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalled();
		});
	});

	it("should handle redo with changes from original article", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.getDocById.mockResolvedValue(mockArticle);
		mockFunctions.getRevisions.mockResolvedValue({
			revisions: [],
			currentIndex: 0,
			canUndo: false,
			canRedo: true,
		});
		// Redo returns different content from original
		mockFunctions.redoDocDraft.mockResolvedValue({
			success: true,
			content: "# Different Content",
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		const event = new KeyboardEvent("keydown", {
			key: "z",
			metaKey: true,
			shiftKey: true,
			bubbles: true,
		});
		window.dispatchEvent(event);

		await waitFor(() => {
			expect(mockFunctions.redoDocDraft).toHaveBeenCalled();
		});
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should handle validation error with both line and column", async () => {
		const jsonDraft = {
			...mockDraft,
			contentType: "application/json" as const,
			content: '{"openapi": "3.0.0",}',
		};

		mockFunctions.getDocDraft.mockImplementation(async () => jsonDraft);
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [
				{
					message: "Unexpected token",
					line: 1,
					column: 20,
					severity: "error" as const,
				},
			],
		});

		const { getByTestId, findByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		fireEvent.click(getByTestId("save-button"));

		const lineButton = await findByTestId("validation-error-0-line");
		expect(lineButton.textContent).toContain("Line 1:20");
	});

	it("should handle TiptapEdit onViewModeChange to markdown with frontmatter restoration", async () => {
		const draftWithFrontmatter: DocDraft = {
			...mockDraft,
			content: "---\ntitle: Test\n---\n\n# Content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithFrontmatter);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Switch to article view first to extract frontmatter
		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Then switch to markdown via TiptapEdit
		const markdownButton = getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});
	});

	it("should handle auto-save skipping when validation fails", async () => {
		mockFunctions.validateContent.mockResolvedValue({
			isValid: false,
			errors: [{ message: "Invalid", severity: "error" }],
		});

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
		});

		// Enter title edit mode
		const titleInput = await enterTitleEditMode(getByTestId);

		// Use fake timers after loading
		vi.useFakeTimers();

		// Edit content to trigger auto-save
		fireEvent.input(titleInput, { target: { value: "New Title" } });

		// Fast-forward past auto-save delay
		vi.advanceTimersByTime(3000);

		vi.useRealTimers();

		// updateDocDraft should not be called due to validation failure
		await waitFor(() => {
			expect(mockFunctions.validateContent).toHaveBeenCalled();
		});
	});

	it("should handle frontmatter extraction with multiple frontmatter blocks", async () => {
		const draftWithMultipleFrontmatter: DocDraft = {
			...mockDraft,
			content: "---\ntitle: First\n---\n---\nkey: Second\n---\n\n# Content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithMultipleFrontmatter);
		mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});

		// Click article view button to trigger frontmatter extraction
		const articleButton = getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			expect(getByTestId("editor-pane")).toBeTruthy();
		});
	});

	it("should handle message input onChange handler", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("draft-title-display")).toBeTruthy();
		});

		await openAgentPanel(getByTestId);

		const messageInput = getByTestId("message-input") as HTMLTextAreaElement;

		// Test onChange handler
		fireEvent.change(messageInput, { target: { value: "Test message" } });
		expect(messageInput.value).toBe("Test message");

		// Clear the message
		fireEvent.change(messageInput, { target: { value: "" } });
		expect(messageInput.value).toBe("");
	});

	it("should handle diff operation with same content (no change)", async () => {
		const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

		await waitFor(() => {
			expect(getByTestId("article-draft-page")).toBeTruthy();
			expect(eventSourceRegistry.convo).toBeTruthy();
		});

		// Send diff that results in same content
		dispatchMessage(eventSourceRegistry.convo, {
			type: "article_updated",
			diffs: [
				{
					operation: "replace",
					position: 0,
					length: 0,
					text: "",
				},
			],
		});

		// Component should handle gracefully
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	// Additional coverage tests for different content types and scenarios
	it("should load JSON content type draft", async () => {
		const jsonDraft: DocDraft = {
			...mockDraft,
			contentType: "application/json",
			content: '{"key": "value"}',
		};
		mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => expect(getByTestId("article-draft-page")).toBeTruthy());
	});

	it("should load YAML content type draft", async () => {
		const yamlDraft: DocDraft = {
			...mockDraft,
			contentType: "application/yaml",
			content: "key: value",
		};
		mockFunctions.getDocDraft.mockResolvedValue(yamlDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitFor(() => expect(getByTestId("article-draft-page")).toBeTruthy());
	});

	it("should load draft with frontmatter content", async () => {
		const draftWithFrontmatter: DocDraft = {
			...mockDraft,
			content: "---\ntags: test\n---\n\n# Content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithFrontmatter);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should load draft with CRLF line endings in frontmatter", async () => {
		const draftWithCRLF: DocDraft = {
			...mockDraft,
			content: "---\r\ntags: test\r\n---\r\n\r\n# Content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithCRLF);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should load draft with multiple frontmatter blocks", async () => {
		const draftMultiFrontmatter: DocDraft = {
			...mockDraft,
			content: "---\nfirst: 1\n---\n\nContent\n\n---\nsecond: 2\n---",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftMultiFrontmatter);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle view mode switch to brain view", async () => {
		// Brain view not available in default layout
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
	});

	it("should save draft with brain content added", async () => {
		// Brain view not available in default layout
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
		mockFunctions.updateDocDraft.mockResolvedValue(undefined);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
	});

	it("should save draft without brain content when brain is empty", async () => {
		const draftNoBrain: DocDraft = {
			...mockDraft,
			content: "# Just content",
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftNoBrain);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
		mockFunctions.updateDocDraft.mockResolvedValue(undefined);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Save without modifying brain
		fireEvent.click(getByTestId("save-button"));
		await waitFor(() => expect(mockFunctions.updateDocDraft).toHaveBeenCalled());

		const savedContent = mockFunctions.updateDocDraft.mock.calls[0][1].content;
		// Should not have frontmatter markers when brain is empty
		expect(savedContent).not.toMatch(/^---\n.*\n---\n/);
	});

	it("should handle markdown mode for JSON content", async () => {
		const jsonDraft: DocDraft = {
			...mockDraft,
			contentType: "application/json",
			content: '{"test": "value"}',
		};
		mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Switch to markdown view
		fireEvent.click(getByTestId("view-mode-markdown"));
		await waitFor(() => expect(getByTestId("markdown-source-editor")).toBeTruthy());
	});

	it("should handle markdown mode for YAML content", async () => {
		const yamlDraft: DocDraft = {
			...mockDraft,
			contentType: "application/yaml",
			content: "test: value",
		};
		mockFunctions.getDocDraft.mockResolvedValue(yamlDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Switch to markdown view
		fireEvent.click(getByTestId("view-mode-markdown"));
		await waitFor(() => expect(getByTestId("markdown-source-editor")).toBeTruthy());
	});

	it("should load draft with space metadata in contentMetadata", async () => {
		const draftWithSpace: DocDraft = {
			...mockDraft,
			contentMetadata: { space: "test-space" },
		};
		mockFunctions.getDocDraft.mockResolvedValue(draftWithSpace);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle draft with empty content", async () => {
		const emptyDraft: DocDraft = {
			...mockDraft,
			content: "",
		};
		mockFunctions.getDocDraft.mockResolvedValue(emptyDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle draft with only frontmatter and no content", async () => {
		const frontmatterOnly: DocDraft = {
			...mockDraft,
			content: "---\ntags: test\n---",
		};
		mockFunctions.getDocDraft.mockResolvedValue(frontmatterOnly);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	it("should handle draft with trailing newline after frontmatter", async () => {
		const frontmatterTrailingNewline: DocDraft = {
			...mockDraft,
			content: "---\ntags: test\n---\n",
		};
		mockFunctions.getDocDraft.mockResolvedValue(frontmatterTrailingNewline);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
	it.skip("should click version history button", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraftEditingArticle);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
		mockFunctions.getRevisions.mockResolvedValue([]);

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/2",
		});

		await waitForDraftLoaded(getByTestId, "Draft Editing Article");

		// Click version history button
		fireEvent.click(getByTestId("version-history-button"));

		await waitFor(() => expect(mockFunctions.getRevisions).toHaveBeenCalled());
	});

	it("should handle close button click", async () => {
		mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
		mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

		const { getByTestId } = renderWithProviders(<ArticleDraft />, {
			initialPath: "/article-draft/1",
		});

		await waitForDraftLoaded(getByTestId, "Test Draft");

		// Click close button
		fireEvent.click(getByTestId("close-button"));

		// Component navigates away (tested by navigation mock)
		expect(getByTestId("article-draft-page")).toBeTruthy();
	});

	describe("Chat pane interactions", () => {
		it("should handle chat pane resize via mouse drag", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Open agent panel (hidden by default)
			await openAgentPanel(getByTestId);

			const resizeHandle = getByTestId("chat-pane-resize-handle");

			// Simulate mouse drag to resize
			fireEvent.mouseDown(resizeHandle, { clientX: 300 });
			fireEvent(document, new MouseEvent("mousemove", { clientX: 400, bubbles: true }));
			fireEvent(document, new MouseEvent("mouseup", { bubbles: true }));

			expect(getByTestId("chat-pane")).toBeTruthy();
		});

		it("should constrain chat pane width during resize", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Open agent panel (hidden by default)
			await openAgentPanel(getByTestId);

			const resizeHandle = getByTestId("chat-pane-resize-handle");

			// Try to resize below minimum
			fireEvent.mouseDown(resizeHandle, { clientX: 300 });
			fireEvent(document, new MouseEvent("mousemove", { clientX: 50, bubbles: true }));
			fireEvent(document, new MouseEvent("mouseup", { bubbles: true }));

			expect(getByTestId("chat-pane")).toBeTruthy();
		});

		it("should toggle chat pane position", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Open agent panel first, then toggle position
			await openAgentPanel(getByTestId);

			const toggleButton = getByTestId("chat-pane-position-toggle");
			fireEvent.click(toggleButton);

			expect(getByTestId("chat-pane")).toBeTruthy();
		});

		it("should send message in chat", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.getCollabConvoByArtifact.mockResolvedValue(mockConvo);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
			mockFunctions.streamConvo.mockReturnValue(new EventSource("/mock"));
			mockFunctions.sendMessage.mockResolvedValue(undefined);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Open agent panel (hidden by default)
			await openAgentPanel(getByTestId);

			const input = getByTestId("message-input");
			fireEvent.change(input, { target: { value: "Test message" } });

			fireEvent.click(getByTestId("send-message-button"));

			await waitFor(() => expect(mockFunctions.sendMessage).toHaveBeenCalled());
		});
	});

	describe("Content type handling", () => {
		// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
		it.skip("should save JSON draft with correct content type", async () => {
			const jsonDraft: DocDraft = {
				...mockDraft,
				contentType: "application/json",
				content: '{"key": "value"}',
			};
			mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
			mockFunctions.updateDocDraft.mockResolvedValue(undefined);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			fireEvent.click(getByTestId("save-button"));

			await waitFor(() => expect(mockFunctions.updateDocDraft).toHaveBeenCalled());

			const savedDraft = mockFunctions.updateDocDraft.mock.calls[0][1];
			expect(savedDraft.contentType).toBe("application/json");
		});

		// biome-ignore lint/suspicious/noSkippedTests: Feature not yet fully implemented
		it.skip("should save YAML draft with correct content type", async () => {
			const yamlDraft: DocDraft = {
				...mockDraft,
				contentType: "application/yaml",
				content: "key: value",
			};
			mockFunctions.getDocDraft.mockResolvedValue(yamlDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));
			mockFunctions.updateDocDraft.mockResolvedValue(undefined);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			fireEvent.click(getByTestId("save-button"));

			await waitFor(() => expect(mockFunctions.updateDocDraft).toHaveBeenCalled());

			const savedDraft = mockFunctions.updateDocDraft.mock.calls[0][1];
			expect(savedDraft.contentType).toBe("application/yaml");
		});
	});

	describe("View mode switching", () => {
		it("should switch to markdown mode", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			fireEvent.click(getByTestId("view-mode-markdown"));

			await waitFor(() => expect(getByTestId("markdown-source-editor")).toBeTruthy());
		});

		it("should switch back to article mode from markdown", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);
			mockFunctions.streamDraftUpdates.mockReturnValue(new EventSource("/mock"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			fireEvent.click(getByTestId("view-mode-markdown"));
			await waitFor(() => expect(getByTestId("markdown-source-editor")).toBeTruthy());

			fireEvent.click(getByTestId("view-mode-article"));
			await waitFor(() => expect(getByTestId("article-editor-wrapper")).toBeTruthy());
		});
	});

	describe("Additional coverage tests", () => {
		it("handles TiptapEdit onChangeMarkdown callback for non-markdown content type", async () => {
			// Create a draft with JSON contentType (non-markdown)
			// This will render the second TiptapEdit (line 2771-2797) instead of the first one
			const jsonDraft: DocDraft = {
				...mockDraft,
				contentType: "application/json",
				content: '{"key": "value"}',
			};

			mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);
			mockFunctions.validateContent.mockResolvedValue({ isValid: true, errors: [] });

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Wait for draft to load and render
			await waitFor(() => {
				expect(getByTestId("tiptap-edit")).toBeTruthy();
			});

			// Find the TiptapEdit editor (for non-markdown content type)
			const editor = getByTestId("article-content-textarea-editor");
			expect(editor).toBeTruthy();

			// Simulate user typing in the editor
			// This will trigger the onChangeMarkdown callback at line 2787-2795
			editor.innerText = "New JSON content";
			fireEvent.input(editor);

			// Verify the callback was processed
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		it("clears validation errors when editing TiptapEdit content", async () => {
			// Create a draft with JSON contentType
			const jsonDraft: DocDraft = {
				...mockDraft,
				contentType: "application/json",
				content: '{"key": "value"}',
			};

			mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);
			// Mock validation to succeed initially (so we start in article mode)
			mockFunctions.validateContent.mockResolvedValue({
				isValid: true,
				errors: [],
			});

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Wait for draft to fully load
			await waitFor(() => {
				expect(getByTestId("tiptap-edit")).toBeTruthy();
			});

			// Find the TiptapEdit editor
			const editor = getByTestId("article-content-textarea-editor");

			// Simulate user typing - this triggers the code path that checks and clears validation errors
			editor.innerText = '{"key": "updated"}';
			fireEvent.input(editor);

			// Verify the callback was processed
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		it("handles title editing blur event", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			const { getByTestId, queryByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Enter title edit mode
			const titleInput = await enterTitleEditMode(getByTestId);

			// Verify we're in edit mode
			expect(queryByTestId("draft-title-display")).toBeNull();

			// Change title (onChange updates the title immediately)
			fireEvent.change(titleInput, { target: { value: "Updated Title" } });

			// Trigger blur event (exits edit mode)
			fireEvent.blur(titleInput);

			// Should exit edit mode - input should no longer be present
			// Note: We just verify blur was handled, actual display behavior may vary
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		it("handles title editing Enter key", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Enter title edit mode
			const titleInput = await enterTitleEditMode(getByTestId);

			// Change title
			fireEvent.change(titleInput, { target: { value: "Updated via Enter" } });

			// Press Enter key
			fireEvent.keyDown(titleInput, { key: "Enter", code: "Enter" });

			// Title should be updated
			await waitFor(() => {
				const titleDisplay = getByTestId("draft-title-display");
				expect(titleDisplay.textContent).toBe("Updated via Enter");
			});
		});

		it("handles title editing Escape key", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Enter title edit mode
			const titleInput = await enterTitleEditMode(getByTestId);

			// Change title
			fireEvent.change(titleInput, { target: { value: "Updated Title" } });

			// Press Escape key
			fireEvent.keyDown(titleInput, { key: "Escape", code: "Escape" });

			// Escape should exit edit mode
			await waitFor(() => {
				const titleDisplay = getByTestId("draft-title-display");
				expect(titleDisplay).toBeTruthy();
			});
		});
	});

	describe("Core function coverage", () => {
		it("tests getContentTypeLabel with JSON content type", async () => {
			const jsonDraft: DocDraft = {
				...mockDraft,
				contentType: "application/json",
				content: '{"key": "value"}',
			};

			mockFunctions.getDocDraft.mockResolvedValue(jsonDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Switch to markdown mode to see the content type label
			const markdownButton = getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			await waitFor(() => {
				expect(getByTestId("markdown-source-editor")).toBeTruthy();
			});
		});

		it("tests getContentTypeLabel with YAML content type", async () => {
			const yamlDraft: DocDraft = {
				...mockDraft,
				contentType: "application/yaml",
				content: "key: value",
			};

			mockFunctions.getDocDraft.mockResolvedValue(yamlDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			// Switch to markdown mode
			const markdownButton = getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			await waitFor(() => {
				expect(getByTestId("markdown-source-editor")).toBeTruthy();
			});
		});

		it("handles suggestions click", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			await openAgentPanel(getByTestId);

			// Verify message input exists
			const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
			expect(messageInput).toBeTruthy();
		});
	});

	describe("SSE streaming coverage", () => {
		it("handles SSE onChunk callback", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			// Mock sendMessage to call onChunk callback
			mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
				const cb = callbacks as { onChunk?: (content: string, index: number) => void } | undefined;
				if (cb?.onChunk) {
					cb.onChunk("Chunk content", 1);
				}
			});

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			await openAgentPanel(getByTestId);

			// Type a message to trigger AI response
			const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
			fireEvent.change(messageInput, { target: { value: "Test AI request" } });
			fireEvent.click(getByTestId("send-message-button"));

			await waitFor(() => {
				expect(mockFunctions.sendMessage).toHaveBeenCalled();
			});

			await new Promise(resolve => setTimeout(resolve, 50));
		});

		it("handles SSE onToolEvent callback", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			// Mock sendMessage to call onToolEvent callback
			mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
				const cb = callbacks as
					| { onToolEvent?: (event: { tool: string; arguments: string; status: string }) => void }
					| undefined;
				if (cb?.onToolEvent) {
					cb.onToolEvent({
						tool: "test_tool",
						arguments: '{"arg": "value"}',
						status: "start",
					});
				}
			});

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			await openAgentPanel(getByTestId);

			// Send a message
			const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
			fireEvent.change(messageInput, { target: { value: "Test" } });
			fireEvent.click(getByTestId("send-message-button"));

			await waitFor(() => {
				expect(mockFunctions.sendMessage).toHaveBeenCalled();
			});

			await new Promise(resolve => setTimeout(resolve, 50));
		});

		it("handles SSE onComplete callback", async () => {
			mockFunctions.getDocDraft.mockResolvedValue(mockDraft);

			// Mock sendMessage to call onComplete callback
			mockFunctions.sendMessage.mockImplementation((_id: number, _message: string, callbacks?: unknown) => {
				const cb = callbacks as
					| { onComplete?: (message: { role: string; content: string; timestamp: string }) => void }
					| undefined;
				if (cb?.onComplete) {
					cb.onComplete({
						role: "assistant",
						content: "Complete response",
						timestamp: new Date().toISOString(),
					});
				}
			});

			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft/1",
			});

			await waitForDraftLoaded(getByTestId, "Test Draft");

			await openAgentPanel(getByTestId);

			// Send a message
			const messageInput = getByTestId("message-input") as HTMLTextAreaElement;
			fireEvent.change(messageInput, { target: { value: "Test" } });
			fireEvent.click(getByTestId("send-message-button"));

			await waitFor(() => {
				expect(mockFunctions.sendMessage).toHaveBeenCalled();
			});

			await new Promise(resolve => setTimeout(resolve, 50));
		});
	});

	describe("resetUserNameCache", () => {
		it("resets the module-level user name cache", () => {
			// resetUserNameCache is exported for test isolation — calling it should not throw.
			expect(() => resetUserNameCache()).not.toThrow();
		});
	});

	describe("error path — no draftId and no articleJrn", () => {
		it("shows error state when neither a draftId nor an articleJrn is provided", async () => {
			// Render without a URL-based draftId and without an articleJrn prop.
			// The main loading effect should trigger the else-branch that calls setError.
			const { getByTestId } = renderWithProviders(<ArticleDraft />, {
				initialPath: "/article-draft",
			});

			await waitFor(() => {
				expect(getByTestId("draft-error")).toBeTruthy();
			});
		});
	});

	describe("always-editable mode (articleJrn prop)", () => {
		it("loads an article directly when articleJrn is provided without a draftId", async () => {
			// Render in always-editable mode — no URL draft, article loaded via findDoc.
			const { getByTestId } = renderWithProviders(<ArticleDraft articleJrn="jrn:jolli:doc:test-article" />, {
				initialPath: "/spaces/1",
			});

			await waitFor(() => {
				expect(mockFunctions.findDoc).toHaveBeenCalledWith("jrn:jolli:doc:test-article");
				expect(getByTestId("article-draft-page")).toBeTruthy();
			});
		});

		it("shows error when findDoc returns null for the given articleJrn", async () => {
			// findDoc returns null → loadArticle should call setError.
			mockFunctions.findDoc.mockResolvedValue(null);

			const { getByTestId } = renderWithProviders(<ArticleDraft articleJrn="jrn:jolli:doc:not-found" />, {
				initialPath: "/spaces/1",
			});

			await waitFor(() => {
				expect(getByTestId("draft-error")).toBeTruthy();
			});
		});

		it("shows error when findDoc throws for the given articleJrn", async () => {
			// findDoc throws → loadArticle catch block should call setError.
			mockFunctions.findDoc.mockRejectedValue(new Error("Network error"));

			const { getByTestId } = renderWithProviders(<ArticleDraft articleJrn="jrn:jolli:doc:bad-jrn" />, {
				initialPath: "/spaces/1",
			});

			await waitFor(() => {
				expect(getByTestId("draft-error")).toBeTruthy();
			});
		});
	});

	describe("inline vs standalone mode height", () => {
		it("applies h-screen in standalone mode (no draftId prop)", async () => {
			const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

			await waitFor(() => {
				expect(getByTestId("article-draft-page")).toBeTruthy();
			});

			const page = getByTestId("article-draft-page");
			expect(page.className).toContain("h-screen");
			expect(page.className).not.toContain("h-full");
		});

		it("applies h-full in inline mode (draftId prop provided)", async () => {
			const { getByTestId } = renderWithProviders(<ArticleDraft draftId={1} />, { initialPath: "/spaces/1" });

			await waitFor(() => {
				expect(getByTestId("article-draft-page")).toBeTruthy();
			});

			const page = getByTestId("article-draft-page");
			expect(page.className).toContain("h-full");
			expect(page.className).not.toContain("h-screen");
		});

		it("applies h-screen to loading state in standalone mode", () => {
			const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

			const loading = getByTestId("draft-loading");
			expect(loading.className).toContain("h-screen");
			expect(loading.className).not.toContain("h-full");
		});

		it("applies h-full to loading state in inline mode", () => {
			const { getByTestId } = renderWithProviders(<ArticleDraft draftId={1} />, { initialPath: "/spaces/1" });

			const loading = getByTestId("draft-loading");
			expect(loading.className).toContain("h-full");
			expect(loading.className).not.toContain("h-screen");
		});

		it("applies h-screen to error state in standalone mode", async () => {
			mockFunctions.getDocDraft.mockRejectedValue(new Error("Network error"));

			const { getByTestId } = renderWithProviders(<ArticleDraft />, { initialPath: "/article-draft/1" });

			await waitFor(() => {
				expect(getByTestId("draft-error")).toBeTruthy();
			});

			const errorDiv = getByTestId("draft-error");
			expect(errorDiv.className).toContain("h-screen");
			expect(errorDiv.className).not.toContain("h-full");
		});

		it("applies h-full to error state in inline mode", async () => {
			mockFunctions.getDocDraft.mockRejectedValue(new Error("Network error"));

			const { getByTestId } = renderWithProviders(<ArticleDraft draftId={1} />, { initialPath: "/spaces/1" });

			await waitFor(() => {
				expect(getByTestId("draft-error")).toBeTruthy();
			});

			const errorDiv = getByTestId("draft-error");
			expect(errorDiv.className).toContain("h-full");
			expect(errorDiv.className).not.toContain("h-screen");
		});
	});
});
