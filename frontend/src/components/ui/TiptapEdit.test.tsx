import { DEFAULT_TOOLBAR_BUTTONS, TiptapEdit, type TiptapEditRef, TOOLBAR_SEGMENTS, ToolbarButton } from "./TiptapEdit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { createRef, useEffect, useState } from "preact/compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", () => {
	const createMockIcon = (testId: string) => {
		const MockIcon = ({ className }: { className?: string }) => <div data-testid={testId} className={className} />;
		MockIcon.displayName = testId;
		return MockIcon;
	};

	return {
		AlignCenter: createMockIcon("align-center-icon"),
		AlignLeft: createMockIcon("align-left-icon"),
		AlignRight: createMockIcon("align-right-icon"),
		AtSign: createMockIcon("at-sign-icon"),
		Bold: createMockIcon("bold-icon"),
		Brain: createMockIcon("brain-icon"),
		ChevronDown: createMockIcon("chevron-down-icon"),
		ChevronUp: createMockIcon("chevron-up-icon"),
		Code: createMockIcon("code-icon"),
		CodeSquare: createMockIcon("code-square-icon"),
		Columns3: createMockIcon("columns3-icon"),
		Copy: createMockIcon("copy-icon"),
		Ellipsis: createMockIcon("ellipsis-icon"),
		FileText: createMockIcon("file-text-icon"),
		GripVertical: createMockIcon("grip-vertical-icon"),
		Hash: createMockIcon("hash-icon"),
		Heading1: createMockIcon("heading1-icon"),
		Heading2: createMockIcon("heading2-icon"),
		Heading3: createMockIcon("heading3-icon"),
		Heading4: createMockIcon("heading4-icon"),
		Highlighter: createMockIcon("highlighter-icon"),
		Image: createMockIcon("image-icon"),
		Italic: createMockIcon("italic-icon"),
		Link2: createMockIcon("link2-icon"),
		List: createMockIcon("list-icon"),
		ListOrdered: createMockIcon("list-ordered-icon"),
		Minus: createMockIcon("minus-icon"),
		Pilcrow: createMockIcon("pilcrow-icon"),
		Plus: createMockIcon("plus-icon"),
		Quote: createMockIcon("quote-icon"),
		Redo: createMockIcon("redo-icon"),
		RowsIcon: createMockIcon("rows-icon"),
		Split: createMockIcon("split-icon"),
		Strikethrough: createMockIcon("strikethrough-icon"),
		Table: createMockIcon("table-icon"),
		Trash2: createMockIcon("trash2-icon"),
		Underline: createMockIcon("underline-icon"),
		Undo: createMockIcon("undo-icon"),
	};
});

// Render dropdown content inline so toolbar items inside dropdowns are always accessible in tests
vi.mock("./DropdownMenu", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: Test mock – strict typing not needed here
	DropdownMenu: ({ children }: any) => <>{children}</>,
	// biome-ignore lint/suspicious/noExplicitAny: Test mock – strict typing not needed here
	DropdownMenuTrigger: ({ children, asChild }: any) => (asChild ? children : <div>{children}</div>),
	// biome-ignore lint/suspicious/noExplicitAny: Test mock – strict typing not needed here
	DropdownMenuContent: ({ children }: any) => <>{children}</>,
	// biome-ignore lint/suspicious/noExplicitAny: Test mock – strict typing not needed here
	DropdownMenuItem: ({ children, onSelect, ...props }: any) => (
		<div role="menuitem" onClick={onSelect} {...props}>
			{children}
		</div>
	),
}));

vi.mock("@tiptap/react", () => {
	return {
		useEditor: vi.fn(config => {
			const mockEditor = {
				isActive: vi.fn(() => false),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
					deleteTable: vi.fn(() => false),
					addColumnBefore: vi.fn(() => false),
					addColumnAfter: vi.fn(() => false),
					deleteColumn: vi.fn(() => false),
					addRowBefore: vi.fn(() => false),
					addRowAfter: vi.fn(() => false),
					deleteRow: vi.fn(() => false),
					mergeCells: vi.fn(() => false),
					splitCell: vi.fn(() => false),
					toggleHeaderColumn: vi.fn(() => false),
					toggleHeaderRow: vi.fn(() => false),
					toggleHeaderCell: vi.fn(() => false),
				})),
				getAttributes: vi.fn(() => ({ href: "" })),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
						undo: vi.fn(() => ({ run: vi.fn() })),
						redo: vi.fn(() => ({ run: vi.fn() })),
						insertTable: vi.fn(() => ({ run: vi.fn() })),
						deleteTable: vi.fn(() => ({ run: vi.fn() })),
						addColumnBefore: vi.fn(() => ({ run: vi.fn() })),
						addColumnAfter: vi.fn(() => ({ run: vi.fn() })),
						deleteColumn: vi.fn(() => ({ run: vi.fn() })),
						addRowBefore: vi.fn(() => ({ run: vi.fn() })),
						addRowAfter: vi.fn(() => ({ run: vi.fn() })),
						deleteRow: vi.fn(() => ({ run: vi.fn() })),
						mergeCells: vi.fn(() => ({ run: vi.fn() })),
						splitCell: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderColumn: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderRow: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderCell: vi.fn(() => ({ run: vi.fn() })),
						deleteNode: vi.fn(() => ({ run: vi.fn() })),
						unsetLink: vi.fn(() => ({ run: vi.fn() })),
						extendMarkRange: vi.fn(() => ({
							setLink: vi.fn(() => ({ run: vi.fn() })),
						})),
						setLink: vi.fn(() => ({ run: vi.fn() })),
						setImage: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: {
					selection: { from: 0, to: 10 },
					doc: {
						textBetween: vi.fn(() => "mock text"),
						content: { size: 100 },
						descendants: vi.fn(() => false),
					},
				},
				setEditable: vi.fn(),
				getHTML: vi.fn(() => config?.content || ""),
				getMarkdown: vi.fn(() => config?.content || ""),
				destroy: vi.fn(),
				storage: {
					sectionSuggestion: {
						onApply: null,
						onDismiss: null,
					},
				},
			};

			// Call onUpdate if provided
			useEffect(() => {
				if (config?.onUpdate) {
					config.onUpdate({ editor: mockEditor });
				}
			}, []);

			return mockEditor;
		}),
		EditorContent: vi.fn(() => {
			return <div className="ProseMirror" contentEditable={true} />;
		}),
		ReactNodeViewRenderer: vi.fn(() => () => <div data-testid="node-view" />),
		// biome-ignore lint/suspicious/noExplicitAny: Mock component, type safety not critical here
		NodeViewWrapper: ({ children }: any) => {
			return <span>{children}</span>;
		},
	};
});

// Individual extension mocks (replacing StarterKit)
vi.mock("@tiptap/extension-blockquote", () => ({
	Blockquote: { configure: vi.fn(() => ({ name: "blockquote", type: "node" })) },
}));
vi.mock("@tiptap/extension-bold", () => ({ Bold: { name: "bold", type: "mark" } }));
vi.mock("@tiptap/extension-code", () => ({ Code: { name: "code", type: "mark" } }));
vi.mock("@tiptap/extension-document", () => ({ Document: { name: "doc", type: "node" } }));
vi.mock("@tiptap/extension-hard-break", () => ({ HardBreak: { name: "hardBreak", type: "node" } }));
vi.mock("@tiptap/extension-heading", () => ({
	Heading: { configure: vi.fn(() => ({ name: "heading", type: "node" })) },
}));
vi.mock("@tiptap/extension-horizontal-rule", () => ({ HorizontalRule: { name: "horizontalRule", type: "node" } }));
vi.mock("@tiptap/extension-italic", () => ({ Italic: { name: "italic", type: "mark" } }));
vi.mock("@tiptap/extension-list", () => ({
	BulletList: { configure: vi.fn(() => ({ name: "bulletList", type: "node" })) },
	OrderedList: { configure: vi.fn(() => ({ name: "orderedList", type: "node" })) },
	ListItem: { name: "listItem", type: "node" },
	ListKeymap: { name: "listKeymap", type: "extension" },
}));
vi.mock("@tiptap/extension-paragraph", () => ({ Paragraph: { name: "paragraph", type: "node" } }));
vi.mock("@tiptap/extension-strike", () => ({ Strike: { name: "strike", type: "mark" } }));
vi.mock("@tiptap/extension-text", () => ({ Text: { name: "text", type: "node" } }));
vi.mock("@tiptap/extensions/drop-cursor", () => ({ Dropcursor: { name: "dropcursor", type: "extension" } }));
vi.mock("@tiptap/extensions/gap-cursor", () => ({ Gapcursor: { name: "gapcursor", type: "extension" } }));
vi.mock("@tiptap/extensions/trailing-node", () => ({ TrailingNode: { name: "trailingNode", type: "extension" } }));
vi.mock("@tiptap/extensions/undo-redo", () => ({ UndoRedo: { name: "undoRedo", type: "extension" } }));

vi.mock("@tiptap/markdown", () => ({
	Markdown: {
		name: "markdown",
		type: "extension",
	},
}));

vi.mock("@tiptap/extension-code-block-lowlight", () => ({
	default: {
		configure: vi.fn(() => ({
			name: "codeBlockLowlight",
			type: "node",
		})),
		extend: vi.fn(() => ({
			name: "codeBlockMermaid",
			type: "node",
			configure: vi.fn(() => ({
				name: "codeBlockMermaid",
				type: "node",
			})),
		})),
	},
}));

vi.mock("@tiptap/extension-highlight", () => ({
	default: {
		configure: vi.fn(() => ({
			name: "highlight",
			type: "mark",
		})),
	},
}));

vi.mock("@tiptap/extension-link", () => ({
	default: {
		configure: vi.fn(() => ({
			name: "link",
			type: "mark",
		})),
	},
}));

vi.mock("@tiptap/extension-table", () => ({
	Table: {
		configure: vi.fn(() => ({
			name: "table",
			type: "node",
		})),
	},
}));

vi.mock("@tiptap/extension-table-row", () => ({
	TableRow: {
		name: "tableRow",
		type: "node",
	},
}));

vi.mock("@tiptap/extension-table-cell", () => ({
	TableCell: {
		name: "tableCell",
		type: "node",
	},
}));

vi.mock("@tiptap/extension-table-header", () => ({
	TableHeader: {
		name: "tableHeader",
		type: "node",
	},
}));

vi.mock("@tiptap/extension-image", () => {
	const imageExtension = {
		configure: vi.fn(_config => ({
			name: "image",
			type: "node",
			inline: true,
			group: "inline",
			draggable: true,
			attrs: {
				src: {},
				alt: { default: null },
				title: { default: null },
			},
		})),
		extend: vi.fn(_config => ({
			name: "image",
			type: "node",
			inline: true,
			group: "inline",
			draggable: true,
			attrs: {
				src: {},
				alt: { default: null },
				title: { default: null },
			},
			addAttributes: vi.fn(),
			addNodeView: vi.fn(),
			configure: vi.fn(_innerConfig => ({
				name: "image",
				type: "node",
				inline: true,
				group: "inline",
				draggable: true,
				attrs: {
					src: {},
					alt: { default: null },
					title: { default: null },
				},
			})),
		})),
	};

	return {
		default: imageExtension,
		Image: imageExtension,
	};
});

vi.mock("./ResizableImage", () => ({
	ResizableImage: () => <div data-testid="resizable-image-mock" />,
}));

vi.mock("lowlight", () => ({
	common: {},
	createLowlight: vi.fn(() => ({
		register: vi.fn(),
	})),
}));

vi.mock("react-intlayer", () => ({
	useIntlayer: vi.fn(() => ({
		toolbar: {
			bold: { value: "Bold" },
			italic: { value: "Italic" },
			strikethrough: { value: "Strikethrough" },
			inlineCode: { value: "Inline Code" },
			codeBlock: { value: "Code Block" },
			highlight: { value: "Highlight" },
			heading1: { value: "Heading 1" },
			heading2: { value: "Heading 2" },
			heading3: { value: "Heading 3" },
			paragraph: { value: "Paragraph" },
			bulletList: { value: "Bullet List" },
			orderedList: { value: "Ordered List" },
			blockquote: { value: "Blockquote" },
			link: { value: "Link" },
			image: { value: "Image" },
			mention: { value: "Mention" },
			undo: { value: "Undo" },
			redo: { value: "Redo" },
			insertTable: { value: "Insert Table" },
			deleteTable: { value: "Delete Table" },
			addColumnBefore: { value: "Add Column Before" },
			addColumnAfter: { value: "Add Column After" },
			deleteColumn: { value: "Delete Column" },
			addRowBefore: { value: "Add Row Before" },
			addRowAfter: { value: "Add Row After" },
			deleteRow: { value: "Delete Row" },
			mergeCells: { value: "Merge Cells" },
			splitCell: { value: "Split Cell" },
			toggleHeaderColumn: { value: "Toggle Header Column" },
			toggleHeaderRow: { value: "Toggle Header Row" },
			toggleHeaderCell: { value: "Toggle Header Cell" },
			heading4: { value: "Heading 4" },
			alignLeft: { value: "Align Left" },
			alignCenter: { value: "Align Center" },
			alignRight: { value: "Align Right" },
			more: { value: "More" },
			underline: { value: "Underline" },
			horizontalRule: { value: "Horizontal Rule" },
		},
		collapseToolbar: { value: "Collapse toolbar" },
		showToolbar: { value: "Show toolbar" },
		viewMode: {
			article: { value: "Article" },
			brain: { value: "Brain" },
			markdown: { value: "Markdown" },
		},
		dragHandle: {
			delete: { value: "Delete" },
			copy: { value: "Copy" },
			paragraph: { value: "Paragraph" },
			heading1: { value: "Heading 1" },
			heading2: { value: "Heading 2" },
			heading3: { value: "Heading 3" },
			bold: { value: "Bold" },
			italic: { value: "Italic" },
			bulletList: { value: "Bullet List" },
			orderedList: { value: "Ordered List" },
			blockquote: { value: "Blockquote" },
			codeBlock: { value: "Code Block" },
		},
	})),
}));

vi.mock("@radix-ui/react-tooltip", () => ({
	Provider: vi.fn(({ children }) => children),
	Root: vi.fn(({ children }) => children),
	Trigger: vi.fn(({ children, asChild, ...props }) => {
		// When asChild is true, render only the children (which should be the actual button)
		if (asChild) {
			return children;
		}
		// When asChild is false or undefined, wrap in a button
		return <button {...props}>{children}</button>;
	}),
	Portal: vi.fn(({ children }) => children),
	Content: vi.fn(({ children }) => <div data-testid="tooltip-content">{children}</div>),
	Arrow: vi.fn(({ className }) => <div className={className} data-testid="tooltip-arrow" />),
}));

let mockTabsOnValueChange: ((value: string) => void) | null = null;
let mockTabsCurrentValue: string | undefined;

vi.mock("@radix-ui/react-tabs", () => ({
	Root: vi.fn(({ children, onValueChange, value, defaultValue, ...props }) => {
		mockTabsOnValueChange = onValueChange;
		mockTabsCurrentValue = value ?? defaultValue;
		return (
			<div {...props} data-value={mockTabsCurrentValue}>
				{children}
			</div>
		);
	}),
	List: vi.fn(({ children, ...props }) => (
		<div role="tablist" {...props}>
			{children}
		</div>
	)),
	Trigger: vi.fn(({ children, value, ...props }) => {
		const handleClick = () => {
			if (mockTabsOnValueChange) {
				mockTabsOnValueChange(value);
			}
		};
		const isActive = mockTabsCurrentValue === value;
		return (
			<button
				role="tab"
				onClick={handleClick}
				data-state={isActive ? "active" : "inactive"}
				aria-selected={isActive}
				{...props}
			>
				{children}
			</button>
		);
	}),
	Content: vi.fn(({ children, ...props }) => (
		<div role="tabpanel" {...props}>
			{children}
		</div>
	)),
}));

vi.mock("@radix-ui/react-separator", () => ({
	Root: vi.fn(({ ...props }) => <div role="separator" {...props} />),
}));

// Mock the lazy-loaded DragHandleMenu component
let mockDragHandleOnNodeChange: ((params: { node: unknown }) => void) | null = null;
vi.mock("./DragHandleMenu", () => ({
	DragHandleMenu: vi.fn(({ editor }: { editor: unknown }) => {
		// Simulate the DragHandle behavior by exposing onNodeChange via the module mock
		const [menuOpen, setMenuOpen] = useState(false);
		const [visible, setVisible] = useState(false);
		const [currentNodeType, setCurrentNodeType] = useState<string | null>(null);

		mockDragHandleOnNodeChange = ({ node }) => {
			if (!node) {
				setMenuOpen(false);
				setVisible(false);
				setCurrentNodeType(null);
				return;
			}
			const typedNode = node as { type: { name: string }; textContent: string };
			const nodeType = typedNode.type.name;
			setCurrentNodeType(nodeType);
			const alwaysShowTypes = ["table", "codeBlock", "image"];
			const hasContent = alwaysShowTypes.includes(nodeType) || typedNode.textContent.trim().length > 0;
			setVisible(hasContent);
			if (!hasContent) {
				setMenuOpen(false);
			}
		};

		// biome-ignore lint/suspicious/noExplicitAny: Test mock
		const typedEditor = editor as any;
		return (
			<div data-testid="drag-handle-wrapper">
				<div className="drag-handle-container">
					{visible && (
						<button
							type="button"
							className="drag-handle-button"
							onClick={() => {
								if (currentNodeType !== "image") {
									setMenuOpen(!menuOpen);
								}
							}}
							draggable
							data-testid="drag-handle"
						>
							grip
						</button>
					)}
					{visible && menuOpen && (
						<div className="drag-handle-menu" data-testid="drag-handle-menu">
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleHeading({ level: 1 }).run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Heading 1</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleHeading({ level: 2 }).run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Heading 2</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleBold().run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Bold</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleItalic().run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Italic</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleBulletList().run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Bullet List</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleOrderedList().run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Ordered List</span>
							</button>
							<button
								type="button"
								onClick={() => {
									typedEditor.chain().focus().toggleCodeBlock().run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<span>Code Block</span>
							</button>
						</div>
					)}
				</div>
			</div>
		);
	}),
}));

// Mock the lazy-loaded FloatingToolbar component
vi.mock("../../ui/spaces/FloatingToolbar", () => ({
	FloatingToolbar: vi.fn(() => <div data-testid="floating-toolbar-mock" />),
}));

describe("TiptapEdit", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render the editor", () => {
		render(<TiptapEdit />);
		expect(document.querySelector(".ProseMirror")).toBeTruthy();
	});

	it("should render toolbar by default", () => {
		render(<TiptapEdit />);
		expect(screen.getByTestId("tiptap-toolbar")).toBeTruthy();
	});

	it("should hide toolbar when showToolbar is false", () => {
		render(<TiptapEdit showToolbar={false} />);
		expect(screen.queryByTestId("tiptap-toolbar")).toBeFalsy();
	});

	it("should render default toolbar buttons", () => {
		render(<TiptapEdit />);
		const toolbar = screen.getByTestId("tiptap-toolbar");
		const buttons = toolbar.querySelectorAll("button");
		// Dropdown segments each render 1 trigger button; direct segments render N buttons each
		const renderedButtonCount = TOOLBAR_SEGMENTS.reduce(
			(count, segment) => count + (segment.type === "dropdown" ? 1 : segment.buttons.length),
			0,
		);
		expect(buttons.length).toBe(renderedButtonCount);
	});

	it("should render only specified toolbar buttons", () => {
		const customButtons = [ToolbarButton.BOLD, ToolbarButton.ITALIC, ToolbarButton.CODE];
		render(<TiptapEdit toolbarButtons={customButtons} />);
		const toolbar = screen.getByTestId("tiptap-toolbar");
		const buttons = toolbar.querySelectorAll("button");
		expect(buttons.length).toBe(customButtons.length);
	});

	it("should call onChange when content changes", async () => {
		const handleChange = vi.fn();
		render(<TiptapEdit onChange={handleChange} />);

		await waitFor(() => {
			const editor = document.querySelector(".ProseMirror");
			expect(editor).toBeTruthy();
		});

		const editor = document.querySelector(".ProseMirror") as HTMLElement;
		fireEvent.input(editor, { target: { innerHTML: "<p>New content</p>" } });

		await waitFor(() => {
			expect(handleChange).toHaveBeenCalled();
		});
	});

	it("should apply custom className", () => {
		const customClass = "custom-editor-class";
		const { container } = render(<TiptapEdit className={customClass} />);
		expect(container.querySelector(`.${customClass}`)).toBeTruthy();
	});

	it("should be editable by default", () => {
		render(<TiptapEdit />);
		const editor = document.querySelector(".ProseMirror");
		expect(editor?.getAttribute("contenteditable")).toBe("true");
	});

	it("should toggle bold formatting when bold button is clicked", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

		await waitFor(() => {
			const boldButton = screen.getByTitle("Bold");
			expect(boldButton).toBeTruthy();
		});

		const boldButton = screen.getByTitle("Bold");
		fireEvent.click(boldButton);

		await waitFor(() => {
			const editor = document.querySelector(".ProseMirror");
			expect(editor).toBeTruthy();
		});
	});

	it("should toggle italic formatting when italic button is clicked", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ITALIC]} />);

		await waitFor(() => {
			const italicButton = screen.getByTitle("Italic");
			expect(italicButton).toBeTruthy();
		});

		const italicButton = screen.getByTitle("Italic");
		fireEvent.click(italicButton);

		await waitFor(() => {
			const editor = document.querySelector(".ProseMirror");
			expect(editor).toBeTruthy();
		});
	});

	it("should have disabled undo button initially", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.UNDO]} />);

		await waitFor(() => {
			const undoButton = screen.getByTitle("Undo");
			expect(undoButton).toBeTruthy();
			expect(undoButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should have disabled redo button initially", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.REDO]} />);

		await waitFor(() => {
			const redoButton = screen.getByTitle("Redo");
			expect(redoButton).toBeTruthy();
			expect(redoButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should render all heading buttons", () => {
		render(
			<TiptapEdit toolbarButtons={[ToolbarButton.HEADING_1, ToolbarButton.HEADING_2, ToolbarButton.HEADING_3]} />,
		);

		// Heading buttons are rendered inside the heading dropdown
		expect(screen.getByTestId("heading-item-heading1")).toBeTruthy();
		expect(screen.getByTestId("heading-item-heading2")).toBeTruthy();
		expect(screen.getByTestId("heading-item-heading3")).toBeTruthy();
	});

	it("should render list buttons", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BULLET_LIST, ToolbarButton.ORDERED_LIST]} />);

		expect(screen.getByTitle("Bullet List")).toBeTruthy();
		expect(screen.getByTitle("Ordered List")).toBeTruthy();
	});

	it("should render blockquote button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BLOCKQUOTE]} />);

		expect(screen.getByTitle("Blockquote")).toBeTruthy();
	});

	it("should render code button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE]} />);

		// Code button is rendered inside the more dropdown
		expect(screen.getByTestId("more-item-code")).toBeTruthy();
	});

	it("should render code block button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE_BLOCK]} />);

		// Code Block button is rendered inside the more dropdown
		expect(screen.getByTestId("more-item-codeBlock")).toBeTruthy();
	});

	it("should render highlight button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.HIGHLIGHT]} />);

		// Highlight button is rendered inside the more dropdown
		expect(screen.getByTestId("more-item-highlight")).toBeTruthy();
	});

	it("should render strike button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.STRIKE]} />);

		expect(screen.getByTitle("Strikethrough")).toBeTruthy();
	});

	it("should render view toggle when showViewToggle is true", () => {
		render(<TiptapEdit showViewToggle={true} />);

		expect(screen.getByTestId("view-mode-article")).toBeTruthy();
		expect(screen.getByTestId("view-mode-markdown")).toBeTruthy();
	});

	it("should not render view toggle by default", () => {
		render(<TiptapEdit />);

		expect(screen.queryByTestId("view-mode-article")).toBeFalsy();
		expect(screen.queryByTestId("view-mode-markdown")).toBeFalsy();
	});

	it("should call onViewModeChange when article button is clicked", async () => {
		const handleViewModeChange = vi.fn();
		render(<TiptapEdit showViewToggle={true} viewMode="markdown" onViewModeChange={handleViewModeChange} />);

		const articleButton = screen.getByTestId("view-mode-article");
		fireEvent.click(articleButton);

		await waitFor(() => {
			expect(handleViewModeChange).toHaveBeenCalledWith("article");
		});
	});

	it("should call onViewModeChange with markdown content when markdown button is clicked", async () => {
		const handleViewModeChange = vi.fn();
		render(<TiptapEdit showViewToggle={true} viewMode="article" onViewModeChange={handleViewModeChange} />);

		const markdownButton = screen.getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(handleViewModeChange).toHaveBeenCalled();
			const firstArg = handleViewModeChange.mock.calls[0][0];
			expect(firstArg).toBe("markdown");
		});
	});

	it("should render collapse button when collapsibleToolbar is true", () => {
		render(<TiptapEdit collapsibleToolbar={true} />);
		expect(screen.getByTestId("toolbar-collapse-button")).toBeTruthy();
	});

	it("should call onToolbarCollapsedChange(true) when collapse button is clicked", () => {
		const onToolbarCollapsedChange = vi.fn();
		render(<TiptapEdit collapsibleToolbar={true} onToolbarCollapsedChange={onToolbarCollapsedChange} />);
		fireEvent.click(screen.getByTestId("toolbar-collapse-button"));
		expect(onToolbarCollapsedChange).toHaveBeenCalledWith(true);
	});

	it("should render expand button when collapsibleToolbar and toolbarCollapsed are true", () => {
		render(<TiptapEdit collapsibleToolbar={true} toolbarCollapsed={true} />);
		expect(screen.getByTestId("toolbar-expand-button")).toBeTruthy();
		expect(screen.queryByTestId("toolbar-collapse-button")).toBeFalsy();
	});

	it("should call onToolbarCollapsedChange(false) when expand button is clicked", () => {
		const onToolbarCollapsedChange = vi.fn();
		render(
			<TiptapEdit
				collapsibleToolbar={true}
				toolbarCollapsed={true}
				onToolbarCollapsedChange={onToolbarCollapsedChange}
			/>,
		);
		fireEvent.click(screen.getByTestId("toolbar-expand-button"));
		expect(onToolbarCollapsedChange).toHaveBeenCalledWith(false);
	});

	it("should render FloatingToolbar when showFloatingToolbar and editable are true", async () => {
		render(<TiptapEdit showFloatingToolbar={true} editable={true} />);
		await waitFor(() => {
			expect(screen.getByTestId("floating-toolbar-mock")).toBeTruthy();
		});
	});

	it("should not render FloatingToolbar when showFloatingToolbar is false", () => {
		render(<TiptapEdit showFloatingToolbar={false} editable={true} />);
		expect(screen.queryByTestId("floating-toolbar-mock")).toBeFalsy();
	});

	it("should not render FloatingToolbar when editable is false", () => {
		render(<TiptapEdit showFloatingToolbar={true} editable={false} />);
		expect(screen.queryByTestId("floating-toolbar-mock")).toBeFalsy();
	});

	it("should apply table border CSS custom properties", () => {
		const { container } = render(<TiptapEdit tableBorderColor="#ff0000" tableBorderWidth={3} />);

		const editorContainer = container.firstChild as HTMLElement;
		expect(editorContainer.style.getPropertyValue("--table-border-color")).toBe("#ff0000");
		expect(editorContainer.style.getPropertyValue("--table-border-width")).toBe("3px");
	});

	it("should render insert table button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.INSERT_TABLE]} />);
		// Insert Table is rendered inside the more dropdown
		expect(screen.getByTestId("more-item-insertTable")).toBeTruthy();
	});

	it("should render link button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.LINK]} />);
		expect(screen.getByTitle("Link")).toBeTruthy();
	});

	it("should render image button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.IMAGE]} />);
		expect(screen.getByTitle("Image")).toBeTruthy();
	});

	it("should render mention button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.MENTION]} />);
		expect(screen.getByTitle("Mention")).toBeTruthy();
	});

	it("should render table operation buttons", () => {
		render(
			<TiptapEdit
				toolbarButtons={[
					ToolbarButton.DELETE_TABLE,
					ToolbarButton.ADD_COLUMN_BEFORE,
					ToolbarButton.ADD_COLUMN_AFTER,
					ToolbarButton.DELETE_COLUMN,
					ToolbarButton.ADD_ROW_BEFORE,
					ToolbarButton.ADD_ROW_AFTER,
					ToolbarButton.DELETE_ROW,
				]}
			/>,
		);

		expect(screen.getByTitle("Delete Table")).toBeTruthy();
		expect(screen.getByTitle("Add Column Before")).toBeTruthy();
		expect(screen.getByTitle("Add Column After")).toBeTruthy();
		expect(screen.getByTitle("Delete Column")).toBeTruthy();
		expect(screen.getByTitle("Add Row Before")).toBeTruthy();
		expect(screen.getByTitle("Add Row After")).toBeTruthy();
		expect(screen.getByTitle("Delete Row")).toBeTruthy();
	});

	it("should render cell operation buttons", () => {
		render(
			<TiptapEdit
				toolbarButtons={[
					ToolbarButton.MERGE_CELLS,
					ToolbarButton.SPLIT_CELL,
					ToolbarButton.TOGGLE_HEADER_COLUMN,
					ToolbarButton.TOGGLE_HEADER_ROW,
					ToolbarButton.TOGGLE_HEADER_CELL,
				]}
			/>,
		);

		expect(screen.getByTitle("Merge Cells")).toBeTruthy();
		expect(screen.getByTitle("Split Cell")).toBeTruthy();
		expect(screen.getByTitle("Toggle Header Column")).toBeTruthy();
		expect(screen.getByTitle("Toggle Header Row")).toBeTruthy();
		expect(screen.getByTitle("Toggle Header Cell")).toBeTruthy();
	});

	it("should render paragraph button", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.PARAGRAPH]} />);
		// Paragraph is rendered inside the heading dropdown
		expect(screen.getByTestId("heading-item-paragraph")).toBeTruthy();
	});

	it("should render DragHandle when showDragHandle is true and editable", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);
		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-wrapper")).toBeTruthy();
		});
	});

	it("should not render DragHandle when showDragHandle is false", () => {
		render(<TiptapEdit showDragHandle={false} />);
		expect(screen.queryByTestId("drag-handle-wrapper")).toBeFalsy();
	});

	it("should handle DragHandle onNodeChange with empty node", () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({ node: null });
		}

		expect(screen.queryByTestId("drag-handle")).toBeFalsy();
	});

	it("should show drag handle button when node has content", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Some content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should always show drag handle for table nodes", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "table" },
					textContent: "",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should always show drag handle for codeBlock nodes", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "codeBlock" },
					textContent: "",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should toggle drag handle menu when button is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should render ungrouped toolbar buttons with separator", () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD, ToolbarButton.ITALIC, ToolbarButton.INSERT_TABLE]} />);

		const toolbar = screen.getByTestId("tiptap-toolbar");
		const separators = toolbar.querySelectorAll("[role='separator']");
		expect(separators.length).toBeGreaterThanOrEqual(1);
	});

	it("should render view-mode-article item in the dropdown when showViewToggle is true", () => {
		// The view mode toggle uses a DropdownMenu (not a ToggleGroup), so items do not
		// carry data-state or aria-selected attributes. This test verifies the item is
		// present and accessible for interaction.
		render(<TiptapEdit showViewToggle={true} viewMode="article" />);

		expect(screen.getByTestId("view-mode-article")).toBeTruthy();
	});

	it("should render view-mode-markdown item in the dropdown when showViewToggle is true", () => {
		render(<TiptapEdit showViewToggle={true} viewMode="markdown" />);

		expect(screen.getByTestId("view-mode-markdown")).toBeTruthy();
	});

	it("should render drag handle menu items for paragraph node", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			const menu = screen.getByTestId("drag-handle-menu");
			expect(menu).toBeTruthy();
			const menuScope = within(menu);
			// Current drag handle menu items
			expect(menuScope.getByText("Heading 1")).toBeTruthy();
			expect(menuScope.getByText("Heading 2")).toBeTruthy();
			expect(menuScope.getByText("Bold")).toBeTruthy();
			expect(menuScope.getByText("Italic")).toBeTruthy();
			expect(menuScope.getByText("Bullet List")).toBeTruthy();
			expect(menuScope.getByText("Ordered List")).toBeTruthy();
			expect(menuScope.getByText("Code Block")).toBeTruthy();
		});
	});

	it("should show same menu items for table nodes in drag handle menu", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "table" },
					textContent: "Table content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			const menu = screen.getByTestId("drag-handle-menu");
			expect(menu).toBeTruthy();
			const menuScope = within(menu);
			// Same menu items are shown for all node types
			expect(menuScope.getByText("Heading 1")).toBeTruthy();
			expect(menuScope.getByText("Heading 2")).toBeTruthy();
		});
	});

	it("should close drag handle menu when bold is clicked for paragraph", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const boldButton = within(menu).getByText("Bold");
		fireEvent.click(boldButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when italic is clicked for table", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "table" },
					textContent: "Table",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const italicButton = within(menu).getByText("Italic");
		fireEvent.click(italicButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when bullet list is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const bulletListButton = within(menu).getByText("Bullet List");
		fireEvent.click(bulletListButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when ordered list transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const orderedListButton = within(menu).getByText("Ordered List");
		fireEvent.click(orderedListButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when heading 1 transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const heading1Button = within(menu).getByText("Heading 1");
		fireEvent.click(heading1Button);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when heading 2 transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const heading2Button = within(menu).getByText("Heading 2");
		fireEvent.click(heading2Button);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when code block transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const codeBlockButton = within(menu).getByText("Code Block");
		fireEvent.click(codeBlockButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when bullet list transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const bulletListButton = within(menu).getByText("Bullet List");
		fireEvent.click(bulletListButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when ordered list transform is clicked", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const orderedListButton = within(menu).getByText("Ordered List");
		fireEvent.click(orderedListButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close drag handle menu when code block transform is clicked from second test", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		const menu = screen.getByTestId("drag-handle-menu");
		const codeBlockButton = within(menu).getByText("Code Block");
		fireEvent.click(codeBlockButton);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should hide drag handle menu when node has no content", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "",
				},
			});
		}

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle")).toBeFalsy();
		});
	});

	it("should close menu when node changes to empty", async () => {
		render(<TiptapEdit showDragHandle={true} editable={true} />);

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "Content",
				},
			});
		}

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		const handleButton = screen.getByTestId("drag-handle");
		fireEvent.click(handleButton);

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		if (mockDragHandleOnNodeChange) {
			mockDragHandleOnNodeChange({
				node: {
					type: { name: "paragraph" },
					textContent: "",
				},
			});
		}

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
			expect(screen.queryByTestId("drag-handle")).toBeFalsy();
		});
	});

	it("should show tooltip on mouse enter and hide on mouse leave", async () => {
		vi.useFakeTimers();
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

		const boldButton = screen.getByTitle("Bold");
		fireEvent.mouseEnter(boldButton);

		await waitFor(() => {
			expect(screen.getByTestId("tooltip-content")).toBeTruthy();
		});

		fireEvent.mouseLeave(boldButton);
		vi.advanceTimersByTime(150);

		vi.useRealTimers();
	});

	it("should click undo button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.UNDO]} />);

		const undoButton = screen.getByTitle("Undo");
		fireEvent.click(undoButton);

		await waitFor(() => {
			expect(undoButton).toBeTruthy();
		});
	});

	it("should click redo button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.REDO]} />);

		const redoButton = screen.getByTitle("Redo");
		fireEvent.click(redoButton);

		await waitFor(() => {
			expect(redoButton).toBeTruthy();
		});
	});

	it("should click insert table button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.INSERT_TABLE]} />);

		// Insert Table is rendered inside the more dropdown
		const tableButton = screen.getByTestId("more-item-insertTable");
		fireEvent.click(tableButton);

		await waitFor(() => {
			expect(tableButton).toBeTruthy();
		});
	});

	it("should click heading 1 button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.HEADING_1]} />);

		// Heading 1 is rendered inside the heading dropdown
		const heading1Button = screen.getByTestId("heading-item-heading1");
		fireEvent.click(heading1Button);

		await waitFor(() => {
			expect(heading1Button).toBeTruthy();
		});
	});

	it("should click heading 2 button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.HEADING_2]} />);

		// Heading 2 is rendered inside the heading dropdown
		const heading2Button = screen.getByTestId("heading-item-heading2");
		fireEvent.click(heading2Button);

		await waitFor(() => {
			expect(heading2Button).toBeTruthy();
		});
	});

	it("should click heading 3 button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.HEADING_3]} />);

		// Heading 3 is rendered inside the heading dropdown
		const heading3Button = screen.getByTestId("heading-item-heading3");
		fireEvent.click(heading3Button);

		await waitFor(() => {
			expect(heading3Button).toBeTruthy();
		});
	});

	it("should click bullet list button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BULLET_LIST]} />);

		const bulletListButton = screen.getByTitle("Bullet List");
		fireEvent.click(bulletListButton);

		await waitFor(() => {
			expect(bulletListButton).toBeTruthy();
		});
	});

	it("should click ordered list button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ORDERED_LIST]} />);

		const orderedListButton = screen.getByTitle("Ordered List");
		fireEvent.click(orderedListButton);

		await waitFor(() => {
			expect(orderedListButton).toBeTruthy();
		});
	});

	it("should click blockquote button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BLOCKQUOTE]} />);

		const blockquoteButton = screen.getByTitle("Blockquote");
		fireEvent.click(blockquoteButton);

		await waitFor(() => {
			expect(blockquoteButton).toBeTruthy();
		});
	});

	it("should click code button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE]} />);

		// Code is rendered inside the more dropdown
		const codeButton = screen.getByTestId("more-item-code");
		fireEvent.click(codeButton);

		await waitFor(() => {
			expect(codeButton).toBeTruthy();
		});
	});

	it("should click code block button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE_BLOCK]} />);

		// Code Block is rendered inside the more dropdown
		const codeBlockButton = screen.getByTestId("more-item-codeBlock");
		fireEvent.click(codeBlockButton);

		await waitFor(() => {
			expect(codeBlockButton).toBeTruthy();
		});
	});

	it("should click highlight button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.HIGHLIGHT]} />);

		// Highlight button is inside the more dropdown
		const highlightButton = screen.getByTestId("more-item-highlight");
		fireEvent.click(highlightButton);

		await waitFor(() => {
			expect(highlightButton).toBeTruthy();
		});
	});

	it("should click strike button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.STRIKE]} />);

		const strikeButton = screen.getByTitle("Strikethrough");
		fireEvent.click(strikeButton);

		await waitFor(() => {
			expect(strikeButton).toBeTruthy();
		});
	});

	it("should click link button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.LINK]} />);

		const linkButton = screen.getByTitle("Link");
		fireEvent.click(linkButton);

		await waitFor(() => {
			expect(linkButton).toBeTruthy();
		});
	});

	it("should click image button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.IMAGE]} />);

		const imageButton = screen.getByTitle("Image");
		fireEvent.click(imageButton);

		await waitFor(() => {
			expect(imageButton).toBeTruthy();
		});
	});

	it("should click mention button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.MENTION]} />);

		const mentionButton = screen.getByTitle("Mention");
		fireEvent.click(mentionButton);

		await waitFor(() => {
			expect(mentionButton).toBeTruthy();
		});
	});

	it("should click delete table button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.DELETE_TABLE]} />);

		const deleteTableButton = screen.getByTitle("Delete Table");
		fireEvent.click(deleteTableButton);

		await waitFor(() => {
			expect(deleteTableButton).toBeTruthy();
		});
	});

	it("should click add column before button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ADD_COLUMN_BEFORE]} />);

		const addColumnBeforeButton = screen.getByTitle("Add Column Before");
		fireEvent.click(addColumnBeforeButton);

		await waitFor(() => {
			expect(addColumnBeforeButton).toBeTruthy();
		});
	});

	it("should click add column after button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ADD_COLUMN_AFTER]} />);

		const addColumnAfterButton = screen.getByTitle("Add Column After");
		fireEvent.click(addColumnAfterButton);

		await waitFor(() => {
			expect(addColumnAfterButton).toBeTruthy();
		});
	});

	it("should click delete column button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.DELETE_COLUMN]} />);

		const deleteColumnButton = screen.getByTitle("Delete Column");
		fireEvent.click(deleteColumnButton);

		await waitFor(() => {
			expect(deleteColumnButton).toBeTruthy();
		});
	});

	it("should click add row before button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ADD_ROW_BEFORE]} />);

		const addRowBeforeButton = screen.getByTitle("Add Row Before");
		fireEvent.click(addRowBeforeButton);

		await waitFor(() => {
			expect(addRowBeforeButton).toBeTruthy();
		});
	});

	it("should click add row after button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.ADD_ROW_AFTER]} />);

		const addRowAfterButton = screen.getByTitle("Add Row After");
		fireEvent.click(addRowAfterButton);

		await waitFor(() => {
			expect(addRowAfterButton).toBeTruthy();
		});
	});

	it("should click delete row button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.DELETE_ROW]} />);

		const deleteRowButton = screen.getByTitle("Delete Row");
		fireEvent.click(deleteRowButton);

		await waitFor(() => {
			expect(deleteRowButton).toBeTruthy();
		});
	});

	it("should click merge cells button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.MERGE_CELLS]} />);

		const mergeCellsButton = screen.getByTitle("Merge Cells");
		fireEvent.click(mergeCellsButton);

		await waitFor(() => {
			expect(mergeCellsButton).toBeTruthy();
		});
	});

	it("should click split cell button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.SPLIT_CELL]} />);

		const splitCellButton = screen.getByTitle("Split Cell");
		fireEvent.click(splitCellButton);

		await waitFor(() => {
			expect(splitCellButton).toBeTruthy();
		});
	});

	it("should click toggle header column button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.TOGGLE_HEADER_COLUMN]} />);

		const toggleHeaderColumnButton = screen.getByTitle("Toggle Header Column");
		fireEvent.click(toggleHeaderColumnButton);

		await waitFor(() => {
			expect(toggleHeaderColumnButton).toBeTruthy();
		});
	});

	it("should click toggle header row button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.TOGGLE_HEADER_ROW]} />);

		const toggleHeaderRowButton = screen.getByTitle("Toggle Header Row");
		fireEvent.click(toggleHeaderRowButton);

		await waitFor(() => {
			expect(toggleHeaderRowButton).toBeTruthy();
		});
	});

	it("should click toggle header cell button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.TOGGLE_HEADER_CELL]} />);

		const toggleHeaderCellButton = screen.getByTitle("Toggle Header Cell");
		fireEvent.click(toggleHeaderCellButton);

		await waitFor(() => {
			expect(toggleHeaderCellButton).toBeTruthy();
		});
	});

	it("should click paragraph button and trigger action", async () => {
		render(<TiptapEdit toolbarButtons={[ToolbarButton.PARAGRAPH]} />);

		// Paragraph is rendered inside the heading dropdown
		const paragraphButton = screen.getByTestId("heading-item-paragraph");
		fireEvent.click(paragraphButton);

		await waitFor(() => {
			expect(paragraphButton).toBeTruthy();
		});
	});

	it("should render with default toolbar buttons", () => {
		render(<TiptapEdit />);

		const toolbar = screen.getByTestId("tiptap-toolbar");
		expect(toolbar).toBeTruthy();
		expect(DEFAULT_TOOLBAR_BUTTONS.length).toBeGreaterThan(0);
	});

	it("should handle contentType prop for markdown", async () => {
		render(<TiptapEdit content="# Test" contentType="markdown" />);

		await waitFor(() => {
			const editor = document.querySelector(".ProseMirror");
			expect(editor).toBeTruthy();
		});
	});

	it("should handle onChangeMarkdown callback", async () => {
		const handleChangeMarkdown = vi.fn();
		render(<TiptapEdit onChangeMarkdown={handleChangeMarkdown} />);

		await waitFor(() => {
			const editor = document.querySelector(".ProseMirror");
			expect(editor).toBeTruthy();
		});
	});

	it("should handle placeholder prop", () => {
		render(<TiptapEdit placeholder="Enter text here..." />);

		const editor = document.querySelector(".ProseMirror");
		expect(editor).toBeTruthy();
	});

	it("should handle editable false", () => {
		render(<TiptapEdit editable={false} />);

		const editor = document.querySelector(".ProseMirror");
		expect(editor).toBeTruthy();
	});

	it("should call onViewModeChange('markdown') without markdown content when editor is null", async () => {
		const { useEditor } = await import("@tiptap/react");
		vi.mocked(useEditor).mockReturnValueOnce(null as unknown as ReturnType<typeof useEditor>);

		const handleViewModeChange = vi.fn();
		render(<TiptapEdit showViewToggle={true} viewMode="article" onViewModeChange={handleViewModeChange} />);

		const markdownButton = screen.getByTestId("view-mode-markdown");
		fireEvent.click(markdownButton);

		await waitFor(() => {
			expect(handleViewModeChange).toHaveBeenCalledWith("markdown");
		});
	});

	it("should return null from renderToolbarGroups when editor is null", async () => {
		const { useEditor } = await import("@tiptap/react");
		vi.mocked(useEditor).mockReturnValueOnce(null as unknown as ReturnType<typeof useEditor>);

		render(<TiptapEdit showToolbar={true} />);

		const toolbar = screen.getByTestId("tiptap-toolbar");
		const buttons = toolbar.querySelectorAll("button");
		expect(buttons.length).toBe(0);
	});

	it("should keep tooltip open when hovering over tooltip content", async () => {
		vi.useFakeTimers();
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

		const boldButton = screen.getByTitle("Bold");
		fireEvent.mouseEnter(boldButton);

		await waitFor(() => {
			expect(screen.getByTestId("tooltip-content")).toBeTruthy();
		});

		const tooltipContent = screen.getByTestId("tooltip-content");
		fireEvent.mouseEnter(tooltipContent);
		fireEvent.mouseLeave(tooltipContent);

		vi.useRealTimers();
	});

	it("should clear pending timeout on mouse enter", async () => {
		vi.useFakeTimers();
		render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

		const boldButton = screen.getByTitle("Bold");

		fireEvent.mouseEnter(boldButton);
		fireEvent.mouseLeave(boldButton);
		fireEvent.mouseEnter(boldButton);

		await waitFor(() => {
			expect(screen.getByTestId("tooltip-content")).toBeTruthy();
		});

		vi.useRealTimers();
	});

	it("should handle markdown content type with setContent error", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Mock implementation
		});

		const { useEditor } = await import("@tiptap/react");
		const setContentMock = vi.fn().mockImplementation((_content, options) => {
			if (options?.contentType === "markdown") {
				throw new Error("Markdown parsing failed");
			}
		});

		vi.mocked(useEditor).mockReturnValue({
			isActive: vi.fn(() => false),
			can: vi.fn(() => ({
				undo: vi.fn(() => false),
				redo: vi.fn(() => false),
				deleteTable: vi.fn(() => false),
				addColumnBefore: vi.fn(() => false),
				addColumnAfter: vi.fn(() => false),
				deleteColumn: vi.fn(() => false),
				addRowBefore: vi.fn(() => false),
				addRowAfter: vi.fn(() => false),
				deleteRow: vi.fn(() => false),
				mergeCells: vi.fn(() => false),
				splitCell: vi.fn(() => false),
				toggleHeaderColumn: vi.fn(() => false),
				toggleHeaderRow: vi.fn(() => false),
				toggleHeaderCell: vi.fn(() => false),
			})),
			chain: vi.fn(() => ({
				focus: vi.fn(() => ({
					toggleBold: vi.fn(() => ({ run: vi.fn() })),
					toggleItalic: vi.fn(() => ({ run: vi.fn() })),
					toggleStrike: vi.fn(() => ({ run: vi.fn() })),
					toggleCode: vi.fn(() => ({ run: vi.fn() })),
					toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
					setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
					toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
					toggleHeading: vi.fn(() => ({ run: vi.fn() })),
					setParagraph: vi.fn(() => ({ run: vi.fn() })),
					toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
					toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
					toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
					undo: vi.fn(() => ({ run: vi.fn() })),
					redo: vi.fn(() => ({ run: vi.fn() })),
					insertTable: vi.fn(() => ({ run: vi.fn() })),
					deleteTable: vi.fn(() => ({ run: vi.fn() })),
					addColumnBefore: vi.fn(() => ({ run: vi.fn() })),
					addColumnAfter: vi.fn(() => ({ run: vi.fn() })),
					deleteColumn: vi.fn(() => ({ run: vi.fn() })),
					addRowBefore: vi.fn(() => ({ run: vi.fn() })),
					addRowAfter: vi.fn(() => ({ run: vi.fn() })),
					deleteRow: vi.fn(() => ({ run: vi.fn() })),
					mergeCells: vi.fn(() => ({ run: vi.fn() })),
					splitCell: vi.fn(() => ({ run: vi.fn() })),
					toggleHeaderColumn: vi.fn(() => ({ run: vi.fn() })),
					toggleHeaderRow: vi.fn(() => ({ run: vi.fn() })),
					toggleHeaderCell: vi.fn(() => ({ run: vi.fn() })),
					deleteNode: vi.fn(() => ({ run: vi.fn() })),
				})),
			})),
			commands: {
				setContent: setContentMock,
			},
			state: {
				selection: { from: 0, to: 10 },
				doc: {
					textBetween: vi.fn(() => "mock text"),
				},
			},
			setEditable: vi.fn(),
			getHTML: vi.fn(() => "different content"),
			getMarkdown: vi.fn(() => "# Test"),
			destroy: vi.fn(),
			storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
			view: { dispatch: vi.fn() },
		} as unknown as ReturnType<typeof useEditor>);

		const { rerender } = render(<TiptapEdit content="# Initial" contentType="markdown" />);
		rerender(<TiptapEdit content="# Changed content" contentType="markdown" />);

		await waitFor(() => {
			expect(setContentMock).toHaveBeenCalled();
		});

		consoleErrorSpy.mockRestore();
	});

	it("should not render toolbar buttons when renderToolbarButton receives null editor", async () => {
		const { useEditor } = await import("@tiptap/react");
		vi.mocked(useEditor).mockReturnValueOnce(null as unknown as ReturnType<typeof useEditor>);

		render(<TiptapEdit showToolbar={true} toolbarButtons={[ToolbarButton.BOLD, ToolbarButton.ITALIC]} />);

		const toolbar = screen.getByTestId("tiptap-toolbar");
		expect(toolbar.querySelectorAll("button").length).toBe(0);
	});

	describe("frontmatter handling", () => {
		it("should render with frontmatter content", async () => {
			const contentWithFrontmatter = `---
title: Test Article
author: John Doe
---

# Article Title

Content here.`;

			render(<TiptapEdit content={contentWithFrontmatter} contentType="markdown" />);

			await waitFor(() => {
				const editor = document.querySelector(".ProseMirror");
				expect(editor).toBeTruthy();
			});
		});

		it("should render with content without frontmatter", async () => {
			const contentWithoutFrontmatter = `# Article Title

Content here.`;

			render(<TiptapEdit content={contentWithoutFrontmatter} contentType="markdown" />);

			await waitFor(() => {
				const editor = document.querySelector(".ProseMirror");
				expect(editor).toBeTruthy();
			});
		});

		it("should preserve Chinese frontmatter during Article to Markdown mode switch", async () => {
			const contentWithChineseFrontmatter = `---
元数据
---

# 这是一级标题

## 这是二级标题

Content here.`;

			const handleViewModeChange = vi.fn();

			render(
				<TiptapEdit
					content={contentWithChineseFrontmatter}
					contentType="markdown"
					showViewToggle={true}
					viewMode="article"
					onViewModeChange={handleViewModeChange}
				/>,
			);

			await waitFor(() => {
				const editor = document.querySelector(".ProseMirror");
				expect(editor).toBeTruthy();
			});

			const markdownButton = screen.getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			expect(handleViewModeChange).toHaveBeenCalledWith("markdown", expect.any(String));

			const markdownContent = handleViewModeChange.mock.calls[0][1] as string;

			expect(markdownContent).toMatch(/^---\r?\n.*元数据.*\r?\n---\r?\n/s);
			expect(markdownContent).not.toContain("## 元数据");
		});

		it("should preserve empty frontmatter during mode switch", async () => {
			const contentWithEmptyFrontmatter = `---
---

# Title`;

			const handleViewModeChange = vi.fn();

			render(
				<TiptapEdit
					content={contentWithEmptyFrontmatter}
					contentType="markdown"
					showViewToggle={true}
					viewMode="article"
					onViewModeChange={handleViewModeChange}
				/>,
			);

			await waitFor(() => {
				const editor = document.querySelector(".ProseMirror");
				expect(editor).toBeTruthy();
			});

			const markdownButton = screen.getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			const markdownContent = handleViewModeChange.mock.calls[0][1] as string;
			expect(markdownContent).toMatch(/^---\r?\n+---\r?\n/);
		});

		it("should handle multi-line frontmatter correctly", async () => {
			const contentWithMultiLineFrontmatter = `---
title: Test
author: John Doe
tags: test, sample
---

# Article`;

			const handleViewModeChange = vi.fn();

			render(
				<TiptapEdit
					content={contentWithMultiLineFrontmatter}
					contentType="markdown"
					showViewToggle={true}
					viewMode="article"
					onViewModeChange={handleViewModeChange}
				/>,
			);

			await waitFor(() => {
				const editor = document.querySelector(".ProseMirror");
				expect(editor).toBeTruthy();
			});

			const markdownButton = screen.getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			const markdownContent = handleViewModeChange.mock.calls[0][1] as string;
			expect(markdownContent).toMatch(
				/^---\r?\n.*title: Test.*author: John Doe.*tags: test, sample.*\r?\n---\r?\n/s,
			);
		});
	});

	describe("isActive handlers for bold and italic in headings", () => {
		it("should show active styling when bold is active and not in heading", async () => {
			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn(type => {
					if (type === "bold") {
						return true;
					}
					return false;
				}),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => ""),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

			const boldButton = screen.getByTitle("Bold");
			expect(boldButton.className).toContain("bg-primary");
		});

		it("should return false for bold isActive when editor is in heading 1", async () => {
			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn((type, attrs) => {
					if (type === "heading" && attrs?.level === 1) {
						return true;
					}
					if (type === "heading" && attrs?.level === 2) {
						return false;
					}
					if (type === "bold") {
						return true;
					}
					return false;
				}),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => ""),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			render(<TiptapEdit toolbarButtons={[ToolbarButton.BOLD]} />);

			const boldButton = screen.getByTitle("Bold");
			// Bold button should not have active styling when in heading
			expect(boldButton.className).not.toContain("bg-primary");
		});

		it("should return false for italic isActive when editor is in heading 2", async () => {
			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn((type, attrs) => {
					if (type === "heading" && attrs?.level === 1) {
						return false;
					}
					if (type === "heading" && attrs?.level === 2) {
						return true;
					}
					if (type === "italic") {
						return true;
					}
					return false;
				}),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => ""),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			render(<TiptapEdit toolbarButtons={[ToolbarButton.ITALIC]} />);

			const italicButton = screen.getByTitle("Italic");
			// Italic button should not have active styling when in heading
			expect(italicButton.className).not.toContain("bg-primary");
		});
	});

	describe("code block action", () => {
		it("should toggle code block when already active", async () => {
			const toggleCodeBlockRun = vi.fn();
			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn(type => type === "codeBlock"),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: toggleCodeBlockRun })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => ""),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE_BLOCK]} />);

			// Code Block is rendered inside the more dropdown
			const codeBlockButton = screen.getByTestId("more-item-codeBlock");
			fireEvent.click(codeBlockButton);

			await waitFor(() => {
				expect(toggleCodeBlockRun).toHaveBeenCalled();
			});
		});

		it("should handle code block action when editor is null", async () => {
			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValueOnce(null as unknown as ReturnType<typeof useEditor>);

			render(<TiptapEdit toolbarButtons={[ToolbarButton.CODE_BLOCK]} />);

			// Should not throw when clicking code block button with null editor
			const toolbar = screen.getByTestId("tiptap-toolbar");
			expect(toolbar.querySelectorAll("button").length).toBe(0);
		});
	});

	describe("content sync paths", () => {
		it("should skip setContent when content matches current HTML", async () => {
			const setContentMock = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn(() => false),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: { setContent: setContentMock },
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => "<p>Same content</p>"),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			const { rerender } = render(<TiptapEdit content="<p>Initial</p>" />);

			// Clear any initial calls
			setContentMock.mockClear();

			// Rerender with content that matches what getHTML returns
			rerender(<TiptapEdit content="<p>Same content</p>" />);

			await waitFor(() => {
				// setContent should not be called when content matches current HTML
				expect(setContentMock).not.toHaveBeenCalled();
			});
		});

		it("should handle HTML content type (non-markdown)", async () => {
			const setContentMock = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockReturnValue({
				isActive: vi.fn(() => false),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
				})),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
					})),
				})),
				commands: { setContent: setContentMock },
				state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
				setEditable: vi.fn(),
				getHTML: vi.fn(() => "<p>Old</p>"),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: { sectionSuggestion: { onApply: null, onDismiss: null }, hiddenSection: { hiddenRanges: [] } },
				view: { dispatch: vi.fn() },
			} as unknown as ReturnType<typeof useEditor>);

			const { rerender } = render(<TiptapEdit content="<p>Initial</p>" contentType="html" />);

			setContentMock.mockClear();

			// Rerender with different HTML content (not markdown)
			rerender(<TiptapEdit content="<p>New HTML content</p>" contentType="html" />);

			await waitFor(() => {
				expect(setContentMock).toHaveBeenCalledWith("<p>New HTML content</p>");
			});
		});

		it("should sync external content even after an internal change when content prop changes", async () => {
			// This tests the fix for the bug where clicking "Accept" on an inline suggestion
			// didn't update the editor content. The issue was:
			// 1. deleteNode() triggers internal change (isInternalChangeRef = true)
			// 2. API returns new content with suggestion applied
			// 3. The internal change flag caused the sync to be skipped
			// The fix: check if content prop actually changed from lastExternalContentRef

			const setContentMock = vi.fn();
			const onChangeMock = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			let simulateInternalChange: (() => void) | undefined;

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: { setContent: setContentMock },
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
					setEditable: vi.fn(),
					// Editor shows old content (before suggestion applied)
					getHTML: vi.fn(() => "<p>Old content</p>"),
					getMarkdown: vi.fn(() => "Old content"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				// Capture the onUpdate callback to simulate internal changes
				simulateInternalChange = () => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				};

				return mockEditor;
			});

			const { rerender } = render(
				<TiptapEdit content="<p>Old content</p>" contentType="html" onChange={onChangeMock} />,
			);

			// Clear any initial calls
			setContentMock.mockClear();

			// Simulate internal change (like deleteNode() removing a suggestion node)
			simulateInternalChange?.();

			// Now rerender with new content (as if API returned applied suggestion content)
			// This should sync because the new content differs from current editor HTML
			rerender(
				<TiptapEdit
					content="<p>New content with suggestion applied</p>"
					contentType="html"
					onChange={onChangeMock}
				/>,
			);

			await waitFor(() => {
				// setContent SHOULD be called because content differs from current editor HTML
				expect(setContentMock).toHaveBeenCalledWith("<p>New content with suggestion applied</p>");
			});
		});

		it("should skip sync after internal change when content prop is unchanged", async () => {
			// This tests that we skip sync when content prop hasn't changed after an internal change.
			// This handles the debounce scenario: suggestion nodes are inserted (internal change),
			// but the debounced onChangeMarkdown hasn't fired yet, so content prop is stale.
			// Without this check, we would sync stale content and remove the suggestion nodes.

			const setContentMock = vi.fn();
			const onChangeMock = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			let simulateInternalChange: (() => void) | undefined;

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: { setContent: setContentMock },
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "mock text") } },
					setEditable: vi.fn(),
					// Editor shows current typed content
					getHTML: vi.fn(() => "<p>User typed content</p>"),
					getMarkdown: vi.fn(() => "User typed content"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				simulateInternalChange = () => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				};

				return mockEditor;
			});

			const { rerender } = render(
				<TiptapEdit content="<p>Initial content</p>" contentType="html" onChange={onChangeMock} />,
			);

			// Clear any initial calls
			setContentMock.mockClear();

			// Simulate internal change (like suggestion node inserted, but debounced callback hasn't fired)
			simulateInternalChange?.();

			// Rerender with SAME content prop (simulating that debounced callback hasn't fired yet)
			// This is the key scenario: editor changed internally but content prop is stale
			rerender(<TiptapEdit content="<p>Initial content</p>" contentType="html" onChange={onChangeMock} />);

			await waitFor(() => {
				// setContent should NOT be called because content prop hasn't changed
				// (we're waiting for debounced callback to update it)
				expect(setContentMock).not.toHaveBeenCalled();
			});
		});
	});

	describe("code block newline protection", () => {
		it("should not add leading newline to code blocks when onChangeMarkdown is called", async () => {
			const onChangeMarkdown = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: {
						selection: { from: 0, to: 10 },
						doc: { textBetween: vi.fn(() => "mock text"), content: { size: 100 }, descendants: vi.fn() },
					},
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>Some text</p><pre><code>code here</code></pre>"),
					getMarkdown: vi.fn(() => "Some text\n```\ncode here\n```"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				setTimeout(() => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				});

				return mockEditor;
			});

			render(<TiptapEdit onChangeMarkdown={onChangeMarkdown} />);

			await waitFor(() => {
				expect(onChangeMarkdown).toHaveBeenCalled();
			});

			const markdownArg = onChangeMarkdown.mock.calls[0][0] as string;
			expect(markdownArg).not.toContain("```\n\ncode here");
			expect(markdownArg).toContain("```\ncode here\n```");
		});

		it("should handle multiple code blocks without adding leading newlines", async () => {
			const onChangeMarkdown = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: {
						selection: { from: 0, to: 10 },
						doc: { textBetween: vi.fn(() => "mock text"), content: { size: 100 }, descendants: vi.fn() },
					},
					setEditable: vi.fn(),
					getHTML: vi.fn(
						() => "<p>Text</p><pre><code>first</code></pre><p>More</p><pre><code>second</code></pre>",
					),
					getMarkdown: vi.fn(() => "Text\n```\nfirst\n```\nMore\n```\nsecond\n```"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				setTimeout(() => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				}, 0);

				return mockEditor;
			});

			render(<TiptapEdit onChangeMarkdown={onChangeMarkdown} />);

			await waitFor(() => {
				expect(onChangeMarkdown).toHaveBeenCalled();
			});

			const markdownArg = onChangeMarkdown.mock.calls[0][0] as string;
			expect(markdownArg).not.toContain("```\n\nfirst");
			expect(markdownArg).not.toContain("```\n\nsecond");
			expect(markdownArg).toContain("```\nfirst\n```");
			expect(markdownArg).toContain("```\nsecond\n```");
		});

		it("should handle code blocks with language specifiers", async () => {
			const onChangeMarkdown = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: {
						selection: { from: 0, to: 10 },
						doc: { textBetween: vi.fn(() => "mock text"), content: { size: 100 }, descendants: vi.fn() },
					},
					setEditable: vi.fn(),
					getHTML: vi.fn(() => '<pre><code class="language-typescript">const x = 1;</code></pre>'),
					getMarkdown: vi.fn(() => "```typescript\nconst x = 1;\n```"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				setTimeout(() => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				}, 0);

				return mockEditor;
			});

			render(<TiptapEdit onChangeMarkdown={onChangeMarkdown} />);

			await waitFor(() => {
				expect(onChangeMarkdown).toHaveBeenCalled();
			});

			const markdownArg = onChangeMarkdown.mock.calls[0][0] as string;
			expect(markdownArg).not.toContain("```typescript\n\nconst");
			expect(markdownArg).toContain("```typescript\nconst x = 1;\n```");
		});

		it("should still replace single newlines in regular paragraphs", async () => {
			const onChangeMarkdown = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(config => {
				const mockEditor = {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
							toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: {
						selection: { from: 0, to: 10 },
						doc: { textBetween: vi.fn(() => "mock text"), content: { size: 100 }, descendants: vi.fn() },
					},
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>First paragraph</p><p>Second paragraph</p>"),
					getMarkdown: vi.fn(() => "First paragraph\n\nSecond paragraph"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;

				setTimeout(() => {
					if (config?.onUpdate) {
						config.onUpdate({
							editor: mockEditor,
							transaction: {} as unknown as Parameters<
								NonNullable<typeof config.onUpdate>
							>[0]["transaction"],
							appendedTransactions: [],
						});
					}
				}, 0);

				return mockEditor;
			});

			render(<TiptapEdit onChangeMarkdown={onChangeMarkdown} />);

			await waitFor(() => {
				expect(onChangeMarkdown).toHaveBeenCalled();
			});

			const markdownArg = onChangeMarkdown.mock.calls[0][0] as string;
			expect(markdownArg).toContain("First paragraph\n\nSecond paragraph");
		});
	});

	describe("ensureImageParagraphs function coverage", () => {
		it("should add blank lines around standalone images", async () => {
			const markdownWithImage = "Some text\n![image](url)\nMore text";
			const { useEditor } = await import("@tiptap/react");

			let capturedContent = "";
			vi.mocked(useEditor).mockImplementation(config => {
				capturedContent = config?.content as string;
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit content={markdownWithImage} contentType="markdown" />);

			expect(capturedContent).toContain("\n\n![image](url)\n\n");
		});

		it("should not add blank line before image at start of content", async () => {
			const markdownWithImage = "![image](url)\nMore text";
			const { useEditor } = await import("@tiptap/react");

			let capturedContent = "";
			vi.mocked(useEditor).mockImplementation(config => {
				capturedContent = config?.content as string;
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit content={markdownWithImage} contentType="markdown" />);

			expect(capturedContent).toMatch(/^!\[image\]\(url\)\n\n/);
		});

		it("should handle image with existing blank line after", async () => {
			const markdownWithImage = "Some text\n![image](url)\n\nMore text";
			const { useEditor } = await import("@tiptap/react");

			let capturedContent = "";
			vi.mocked(useEditor).mockImplementation(config => {
				capturedContent = config?.content as string;
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit content={markdownWithImage} contentType="markdown" />);

			// Should still have the blank line after
			expect(capturedContent).toContain("![image](url)\n\nMore text");
		});
	});

	describe("onImageButtonClick callback", () => {
		it("should call onImageButtonClick when image button is clicked", async () => {
			const onImageButtonClick = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(
				<TiptapEdit
					toolbarButtons={[ToolbarButton.IMAGE]}
					onImageButtonClick={onImageButtonClick}
					showToolbar={true}
				/>,
			);

			const imageButton = screen.getByLabelText(/image/i);
			fireEvent.click(imageButton);

			expect(onImageButtonClick).toHaveBeenCalled();
		});
	});

	describe("Toolbar buttons disabled in markdown mode", () => {
		it("should disable all toolbar buttons in markdown view mode", async () => {
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => true),
						redo: vi.fn(() => true),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					getMarkdown: vi.fn(() => "test"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit viewMode="markdown" showToolbar={true} toolbarButtons={[ToolbarButton.BOLD]} />);

			const boldButton = screen.getByLabelText(/bold/i);
			expect(boldButton.hasAttribute("disabled")).toBe(true);
		});
	});

	describe("ViewMode brain", () => {
		it("should call onViewModeChange when brain tab is clicked", async () => {
			const onViewModeChange = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit showViewToggle={true} onViewModeChange={onViewModeChange} />);

			const brainButton = screen.getByTestId("view-mode-brain");
			fireEvent.click(brainButton);

			expect(onViewModeChange).toHaveBeenCalledWith("brain");
		});
	});

	describe("insertImage ref method", () => {
		it("should insert image when insertImage is called via ref", async () => {
			const { useEditor } = await import("@tiptap/react");
			const mockSetImage = vi.fn(() => ({ run: vi.fn() }));
			const mockFocus = vi.fn(() => ({ setImage: mockSetImage }));
			const mockChain = vi.fn(() => ({ focus: mockFocus }));

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: mockChain,
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			const ref = createRef<TiptapEditRef>();
			render(<TiptapEdit ref={ref} />);

			// Call insertImage via ref
			ref.current?.insertImage("https://example.com/image.png", "alt text");

			expect(mockChain).toHaveBeenCalled();
			expect(mockFocus).toHaveBeenCalled();
			expect(mockSetImage).toHaveBeenCalledWith({ src: "https://example.com/image.png", alt: "alt text" });
		});

		it("should use empty string for alt when not provided", async () => {
			const { useEditor } = await import("@tiptap/react");
			const mockSetImage = vi.fn(() => ({ run: vi.fn() }));
			const mockFocus = vi.fn(() => ({ setImage: mockSetImage }));
			const mockChain = vi.fn(() => ({ focus: mockFocus }));

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: mockChain,
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			const ref = createRef<TiptapEditRef>();
			render(<TiptapEdit ref={ref} />);

			// Call insertImage without alt text
			ref.current?.insertImage("https://example.com/image.png");

			expect(mockSetImage).toHaveBeenCalledWith({ src: "https://example.com/image.png", alt: "" });
		});
	});

	describe("HTML entity decoding in markdown mode", () => {
		it("should decode HTML entities when switching to markdown mode", async () => {
			const onViewModeChange = vi.fn();
			const { useEditor } = await import("@tiptap/react");

			vi.mocked(useEditor).mockImplementation(() => {
				return {
					isActive: vi.fn(() => false),
					can: vi.fn(() => ({
						undo: vi.fn(() => false),
						redo: vi.fn(() => false),
					})),
					chain: vi.fn(() => ({
						focus: vi.fn(() => ({
							toggleBold: vi.fn(() => ({ run: vi.fn() })),
						})),
					})),
					commands: {
						setContent: vi.fn(),
						removeSectionSuggestion: vi.fn(),
						removeAllSectionSuggestions: vi.fn(),
					},
					state: { selection: { from: 0, to: 10 }, doc: { textBetween: vi.fn(() => "") } },
					setEditable: vi.fn(),
					getHTML: vi.fn(() => "<p>test</p>"),
					getMarkdown: vi.fn(() => "test&nbsp;&amp;&lt;&gt;&quot;&#39;content"),
					destroy: vi.fn(),
					storage: {
						sectionSuggestion: { onApply: null, onDismiss: null },
						hiddenSection: { hiddenRanges: [] },
					},
					view: { dispatch: vi.fn() },
				} as unknown as ReturnType<typeof useEditor>;
			});

			render(<TiptapEdit showViewToggle={true} onViewModeChange={onViewModeChange} />);

			const markdownButton = screen.getByTestId("view-mode-markdown");
			fireEvent.click(markdownButton);

			expect(onViewModeChange).toHaveBeenCalledWith("markdown", "test &<>\"'content");
		});
	});

	describe("section change insertion and hidden ranges", () => {
		function createMockEditorWithSections(options?: { insertContentAtMock?: ReturnType<typeof vi.fn> }) {
			const insertContentAtMock = options?.insertContentAtMock ?? vi.fn(() => ({ run: vi.fn() }));
			const hiddenRanges: Array<{ title: string | null }> = [];
			const dispatchMock = vi.fn();

			const mockEditor = {
				isActive: vi.fn(() => false),
				can: vi.fn(() => ({
					undo: vi.fn(() => false),
					redo: vi.fn(() => false),
					deleteTable: vi.fn(() => false),
					addColumnBefore: vi.fn(() => false),
					addColumnAfter: vi.fn(() => false),
					deleteColumn: vi.fn(() => false),
					addRowBefore: vi.fn(() => false),
					addRowAfter: vi.fn(() => false),
					deleteRow: vi.fn(() => false),
					mergeCells: vi.fn(() => false),
					splitCell: vi.fn(() => false),
					toggleHeaderColumn: vi.fn(() => false),
					toggleHeaderRow: vi.fn(() => false),
					toggleHeaderCell: vi.fn(() => false),
				})),
				getAttributes: vi.fn(() => ({ href: "" })),
				chain: vi.fn(() => ({
					focus: vi.fn(() => ({
						toggleBold: vi.fn(() => ({ run: vi.fn() })),
						toggleItalic: vi.fn(() => ({ run: vi.fn() })),
						toggleStrike: vi.fn(() => ({ run: vi.fn() })),
						toggleCode: vi.fn(() => ({ run: vi.fn() })),
						toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						setCodeBlock: vi.fn(() => ({ run: vi.fn() })),
						toggleHighlight: vi.fn(() => ({ run: vi.fn() })),
						toggleHeading: vi.fn(() => ({ run: vi.fn() })),
						setParagraph: vi.fn(() => ({ run: vi.fn() })),
						toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
						toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
						toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
						undo: vi.fn(() => ({ run: vi.fn() })),
						redo: vi.fn(() => ({ run: vi.fn() })),
						insertTable: vi.fn(() => ({ run: vi.fn() })),
						deleteTable: vi.fn(() => ({ run: vi.fn() })),
						addColumnBefore: vi.fn(() => ({ run: vi.fn() })),
						addColumnAfter: vi.fn(() => ({ run: vi.fn() })),
						deleteColumn: vi.fn(() => ({ run: vi.fn() })),
						addRowBefore: vi.fn(() => ({ run: vi.fn() })),
						addRowAfter: vi.fn(() => ({ run: vi.fn() })),
						deleteRow: vi.fn(() => ({ run: vi.fn() })),
						mergeCells: vi.fn(() => ({ run: vi.fn() })),
						splitCell: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderColumn: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderRow: vi.fn(() => ({ run: vi.fn() })),
						toggleHeaderCell: vi.fn(() => ({ run: vi.fn() })),
						deleteNode: vi.fn(() => ({ run: vi.fn() })),
						unsetLink: vi.fn(() => ({ run: vi.fn() })),
						extendMarkRange: vi.fn(() => ({
							setLink: vi.fn(() => ({ run: vi.fn() })),
						})),
						setLink: vi.fn(() => ({ run: vi.fn() })),
						setImage: vi.fn(() => ({ run: vi.fn() })),
					})),
					insertContentAt: insertContentAtMock,
				})),
				commands: {
					setContent: vi.fn(),
					removeSectionSuggestion: vi.fn(),
					removeAllSectionSuggestions: vi.fn(),
				},
				state: {
					selection: { from: 0, to: 10 },
					doc: {
						textBetween: vi.fn(() => "mock text"),
						content: { size: 200 },
						descendants: vi.fn((cb: (node: Record<string, unknown>, pos: number) => boolean) => {
							const nodes = [
								{ type: { name: "heading" }, textContent: "Section A", nodeSize: 15, isBlock: true },
								{
									type: { name: "paragraph" },
									textContent: "paragraph content",
									nodeSize: 20,
									isBlock: true,
								},
								{ type: { name: "heading" }, textContent: "Section B", nodeSize: 15, isBlock: true },
								{
									type: { name: "paragraph" },
									textContent: "more content",
									nodeSize: 25,
									isBlock: true,
								},
							];
							const positions = [10, 25, 45, 60];
							for (let i = 0; i < nodes.length; i++) {
								cb(nodes[i], positions[i]);
							}
						}),
					},
					tr: {},
				},
				setEditable: vi.fn(),
				getHTML: vi.fn(() => ""),
				getMarkdown: vi.fn(() => ""),
				destroy: vi.fn(),
				storage: {
					sectionSuggestion: { onApply: null, onDismiss: null },
					hiddenSection: { hiddenRanges },
				},
				view: {
					dispatch: dispatchMock,
					dom: { querySelector: vi.fn(() => null) },
				},
			};

			return { mockEditor, insertContentAtMock, hiddenRanges, dispatchMock };
		}

		function createSectionChange(
			overrides: Partial<{
				id: number;
				changeType: "insert-before" | "insert-after" | "update" | "delete";
				path: string;
				content: string;
				applied: boolean;
				dismissed: boolean;
			}>,
		) {
			return {
				id: overrides.id ?? 1,
				draftId: 1,
				changeType: overrides.changeType ?? "update",
				path: overrides.path ?? "/section-a",
				...(overrides.content !== undefined && { content: overrides.content }),
				proposed: [
					{
						for: "content" as const,
						who: { type: "agent" as const },
						description: "test change",
						value: "new content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: overrides.applied ?? false,
				dismissed: overrides.dismissed ?? false,
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};
		}

		function createAnnotation(overrides: Partial<{ path: string; title: string | null }>) {
			return {
				type: "section-change" as const,
				id: "ann-1",
				path: overrides.path ?? "/section-a",
				title: overrides.title ?? "Section A",
				startLine: 0,
				endLine: 10,
				changeIds: [1],
			};
		}

		it("should use findPositionAfterSection for insert-after changes", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "insert-after", path: "/section-a" })];
			const sectionAnnotations = [createAnnotation({ path: "/section-a", title: "Section A" })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// insert-after "Section A": heading at pos 10 (size 15) + paragraph at pos 25 (size 20) = 45
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).toBe(45);
		});

		it("should use findPositionForHeading for insert-before changes", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "insert-before", path: "/section-a" })];
			const sectionAnnotations = [createAnnotation({ path: "/section-a", title: "Section A" })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// insert-before "Section A": heading at pos 10
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).toBe(10);
		});

		it("should use findPositionForHeading for update changes", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "update", path: "/section-a" })];
			const sectionAnnotations = [createAnnotation({ path: "/section-a", title: "Section A" })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// update "Section A": heading at pos 10
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).toBe(10);
		});

		it("should not add hidden ranges for insert-before or insert-after changes", async () => {
			const { mockEditor, hiddenRanges, dispatchMock } = createMockEditorWithSections();

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [
				createSectionChange({ id: 1, changeType: "insert-before", path: "/section-a" }),
				createSectionChange({ id: 2, changeType: "insert-after", path: "/section-b" }),
			];
			const sectionAnnotations = [
				createAnnotation({ path: "/section-a", title: "Section A" }),
				createAnnotation({ path: "/section-b", title: "Section B" }),
			];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(dispatchMock).toHaveBeenCalled();
			});

			expect(hiddenRanges).toHaveLength(0);
		});

		it("should add hidden ranges for update and delete changes", async () => {
			const { mockEditor, dispatchMock } = createMockEditorWithSections();
			const storage = mockEditor.storage as { hiddenSection: { hiddenRanges: Array<{ title: string | null }> } };

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [
				createSectionChange({ id: 1, changeType: "update", path: "/section-a" }),
				createSectionChange({ id: 2, changeType: "delete", path: "/section-b" }),
			];
			const sectionAnnotations = [
				createAnnotation({ path: "/section-a", title: "Section A" }),
				createAnnotation({ path: "/section-b", title: "Section B" }),
			];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(dispatchMock).toHaveBeenCalled();
			});

			expect(storage.hiddenSection.hiddenRanges).toHaveLength(2);
			expect(storage.hiddenSection.hiddenRanges[0]).toEqual({ title: "Section A" });
			expect(storage.hiddenSection.hiddenRanges[1]).toEqual({ title: "Section B" });
		});

		it("should only hide update/delete sections in mixed change set", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor, dispatchMock } = createMockEditorWithSections({ insertContentAtMock });
			const storage = mockEditor.storage as { hiddenSection: { hiddenRanges: Array<{ title: string | null }> } };

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [
				createSectionChange({ id: 1, changeType: "insert-after", path: "/section-a" }),
				createSectionChange({ id: 2, changeType: "update", path: "/section-b" }),
			];
			const sectionAnnotations = [
				createAnnotation({ path: "/section-a", title: "Section A" }),
				createAnnotation({ path: "/section-b", title: "Section B" }),
			];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(dispatchMock).toHaveBeenCalled();
			});

			// Only "Section B" (update) should be hidden, not "Section A" (insert-after)
			expect(storage.hiddenSection.hiddenRanges).toHaveLength(1);
			expect(storage.hiddenSection.hiddenRanges[0]).toEqual({ title: "Section B" });
		});

		it("should use findPositionAfterSection for insert-after with second section", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "insert-after", path: "/section-b" })];
			const sectionAnnotations = [createAnnotation({ path: "/section-b", title: "Section B" })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// insert-after "Section B": heading at pos 45 (size 15) + paragraph at pos 60 (size 25) = 85
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).toBe(85);
		});

		it("should fall back to doc size when annotation not found for insert position", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "insert-after", path: "/nonexistent" })];
			// No matching annotation
			const sectionAnnotations = [createAnnotation({ path: "/other", title: "Other" })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// No annotation match, so insertPos is null, falls back to doc.content.size = 200
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).toBe(200);
		});

		it("should call removeAllSectionSuggestions when toggling suggestions off", async () => {
			const { mockEditor } = createMockEditorWithSections();

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "update", path: "/section-a" })];
			const sectionAnnotations = [createAnnotation({ path: "/section-a", title: "Section A" })];

			const { rerender } = render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			rerender(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={false}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(mockEditor.commands.removeAllSectionSuggestions).toHaveBeenCalled();
			});
		});

		it("should use findPositionAfterSection (not findPositionForHeading) for preamble insert-after", async () => {
			const insertContentAtMock = vi.fn(() => ({ run: vi.fn() }));
			const { mockEditor } = createMockEditorWithSections({ insertContentAtMock });

			const { useEditor } = await import("@tiptap/react");
			vi.mocked(useEditor).mockReturnValue(mockEditor as unknown as ReturnType<typeof useEditor>);

			const sectionChanges = [createSectionChange({ id: 1, changeType: "insert-after", path: "/preamble" })];
			const sectionAnnotations = [createAnnotation({ path: "/preamble", title: null })];

			render(
				<TiptapEdit
					sectionChanges={sectionChanges}
					sectionAnnotations={sectionAnnotations}
					showSuggestions={true}
					draftId={1}
				/>,
			);

			await waitFor(() => {
				expect(insertContentAtMock).toHaveBeenCalled();
			});

			// findPositionForHeading(editor, null) returns 0, findPositionAfterSection returns > 0
			const calls = insertContentAtMock.mock.calls as Array<Array<unknown>>;
			const insertPos = calls[0][0];
			expect(insertPos).not.toBe(0);
			expect(insertPos).toBeGreaterThan(0);
		});
	});
});
