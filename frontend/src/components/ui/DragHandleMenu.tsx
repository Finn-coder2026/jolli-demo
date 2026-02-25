import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { useEditor } from "@tiptap/react";
import { Bold, CodeSquare, GripVertical, Heading1, Heading2, Italic, List, ListOrdered, Trash2 } from "lucide-react";
import * as React from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Props for the DragHandleMenu component
 */
export interface DragHandleMenuProps {
	/** The Tiptap editor instance (must be non-null) */
	editor: NonNullable<ReturnType<typeof useEditor>>;
}

/**
 * DragHandleMenu - Block-level drag handle with formatting menu.
 *
 * Rendered lazily to keep the yjs/collaboration transitive dependencies
 * out of the main tiptap chunk. The `@tiptap/extension-drag-handle-react`
 * package pulls in ~300 KB of yjs-related code that is deferred until
 * this component first renders.
 */
export function DragHandleMenu({ editor }: DragHandleMenuProps): React.ReactElement {
	const i18n = useIntlayer("tiptap-edit");
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer types need to be regenerated after adding dragHandle keys
	const dragHandleI18n = (i18n as any).dragHandle as {
		heading1: { value: string };
		heading2: { value: string };
		bold: { value: string };
		italic: { value: string };
		bulletList: { value: string };
		orderedList: { value: string };
		codeBlock: { value: string };
		deleteBlock: { value: string };
	};

	const [menuOpen, setMenuOpen] = React.useState(false);
	const [visible, setVisible] = React.useState(false);
	const [currentNodeType, setCurrentNodeType] = React.useState<string | null>(null);
	const menuRef = React.useRef<HTMLDivElement>(null);

	// Close menu when clicking outside
	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setMenuOpen(false);
			}
		}

		if (menuOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [menuOpen]);

	return (
		<DragHandle
			editor={editor}
			onNodeChange={({ node }) => {
				if (!node) {
					setMenuOpen(false);
					setVisible(false);
					setCurrentNodeType(null);
					return;
				}
				const nodeType = node.type.name;
				setCurrentNodeType(nodeType);
				const alwaysShowTypes = ["table", "codeBlock", "image"];
				const hasContent = alwaysShowTypes.includes(nodeType) || node.textContent.trim().length > 0;
				setVisible(hasContent);
				if (!hasContent) {
					setMenuOpen(false);
				}
			}}
		>
			<div className="drag-handle-container" ref={menuRef}>
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
						<GripVertical className="h-4 w-4" />
					</button>
				)}
				{visible && menuOpen && (
					<div className="drag-handle-menu" data-testid="drag-handle-menu">
						{currentNodeType === "codeBlock" ? (
							<button
								type="button"
								onClick={() => {
									editor.chain().focus().deleteNode("codeBlock").run();
									setMenuOpen(false);
								}}
								className="drag-handle-menu-item"
							>
								<Trash2 className="h-4 w-4" />
								<span>{dragHandleI18n.deleteBlock.value}</span>
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleHeading({ level: 1 }).run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<Heading1 className="h-4 w-4" />
									<span>{dragHandleI18n.heading1.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleHeading({ level: 2 }).run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<Heading2 className="h-4 w-4" />
									<span>{dragHandleI18n.heading2.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleBold().run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<Bold className="h-4 w-4" />
									<span>{dragHandleI18n.bold.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleItalic().run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<Italic className="h-4 w-4" />
									<span>{dragHandleI18n.italic.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleBulletList().run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<List className="h-4 w-4" />
									<span>{dragHandleI18n.bulletList.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleOrderedList().run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<ListOrdered className="h-4 w-4" />
									<span>{dragHandleI18n.orderedList.value}</span>
								</button>
								<button
									type="button"
									onClick={() => {
										editor.chain().focus().toggleCodeBlock().run();
										setMenuOpen(false);
									}}
									className="drag-handle-menu-item"
								>
									<CodeSquare className="h-4 w-4" />
									<span>{dragHandleI18n.codeBlock.value}</span>
								</button>
							</>
						)}
					</div>
				)}
			</div>
		</DragHandle>
	);
}
