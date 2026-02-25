import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Separator } from "../../components/ui/Separator";
import { isAllowedLinkUrl } from "../../util/UrlUtil";
import type { Editor } from "@tiptap/react";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Heading4,
	Italic,
	Link2,
	Pilcrow,
	Quote,
	Strikethrough,
	Underline,
} from "lucide-react";
import { type ReactElement, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";
import { cn } from "@/common/ClassNameUtils";

/** Delay before hiding the floating toolbar after selection clears (ms). */
const HIDE_DELAY_MS = 150;

interface FloatingToolbarProps {
	/** The TipTap editor instance */
	editor: Editor | null;
	/** Positioned container element used to compute toolbar offset. */
	containerRef?: RefObject<HTMLElement | null>;
}

/** Describes a single formatting action button in the floating toolbar. */
interface ActionConfig {
	icon: typeof Bold;
	label: string;
	command: () => void;
	isActive: boolean;
}

/** Renders a single formatting action button in the floating toolbar. */
function renderActionButton(action: ActionConfig): ReactElement {
	const Icon = action.icon;
	return (
		<button
			key={action.label}
			type="button"
			title={action.label}
			aria-label={action.label}
			// Use onMouseDown to prevent selection loss on click
			onMouseDown={e => {
				e.preventDefault();
				action.command();
			}}
			className={cn(
				"inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
				action.isActive
					? "bg-primary text-primary-foreground"
					: "text-foreground/80 hover:bg-accent hover:text-foreground",
			)}
		>
			<Icon className="h-3.5 w-3.5" />
		</button>
	);
}

/**
 * Floating toolbar that appears above text selection in the TipTap editor.
 * Provides quick formatting actions without needing the main toolbar.
 */
export function FloatingToolbar({ editor, containerRef }: FloatingToolbarProps): ReactElement | null {
	const i18n = useIntlayer("floating-toolbar");
	const [visible, setVisible] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const hideTimeoutRef = useRef<number | null>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!editor) {
			return;
		}
		// Capture as a stable reference for the effect's cleanup closure.
		const activeEditor = editor;

		function handleSelectionUpdate() {
			const { state } = activeEditor;
			const { from, to, empty } = state.selection;

			if (empty || from === to) {
				// Delay hiding to allow moving to the toolbar
				if (!hideTimeoutRef.current) {
					hideTimeoutRef.current = window.setTimeout(() => {
						setVisible(false);
						hideTimeoutRef.current = null;
					}, HIDE_DELAY_MS);
				}
				return;
			}

			// Cancel any pending hide
			if (hideTimeoutRef.current) {
				window.clearTimeout(hideTimeoutRef.current);
				hideTimeoutRef.current = null;
			}

			// Get the DOM range for the selection
			const { view } = activeEditor;
			const start = view.coordsAtPos(from);
			const end = view.coordsAtPos(to);

			// Position relative to the provided container ref, or fall back to the nearest
			// positioned ancestor of the editor DOM. This avoids coupling to a CSS class name.
			const positionedParent =
				containerRef?.current ??
				view.dom.parentElement?.closest("[style*='position']") ??
				view.dom.parentElement;
			if (!positionedParent) {
				return;
			}
			const parentRect = positionedParent.getBoundingClientRect();

			const left = (start.left + end.right) / 2 - parentRect.left;
			const top = start.top - parentRect.top - 10;

			setPosition({ top, left });
			setVisible(true);
		}

		activeEditor.on("selectionUpdate", handleSelectionUpdate);
		return () => {
			activeEditor.off("selectionUpdate", handleSelectionUpdate);
			if (hideTimeoutRef.current) {
				window.clearTimeout(hideTimeoutRef.current);
			}
		};
	}, [editor, containerRef]);

	// Heading options for the heading dropdown — only changes when i18n locale changes.
	const headingOptions = useMemo(
		() => [
			{ icon: Heading1, label: i18n.heading1.value, level: 1 as const },
			{ icon: Heading2, label: i18n.heading2.value, level: 2 as const },
			{ icon: Heading3, label: i18n.heading3.value, level: 3 as const },
			{ icon: Heading4, label: i18n.heading4.value, level: 4 as const },
			{ icon: Pilcrow, label: i18n.paragraph.value, level: null },
		],
		[i18n],
	);

	if (!visible || !editor) {
		return null;
	}

	// After the guard above, TypeScript narrows editor to Editor (non-null).
	// Re-assign to propagate the narrowed type into hoisted function declarations below.
	const activeEditor = editor;

	const formattingActions: Array<ActionConfig> = [
		{
			icon: Bold,
			label: i18n.bold.value,
			command: () => editor.chain().focus().toggleBold().run(),
			isActive: editor.isActive("bold"),
		},
		{
			icon: Italic,
			label: i18n.italic.value,
			command: () => editor.chain().focus().toggleItalic().run(),
			isActive: editor.isActive("italic"),
		},
		{
			icon: Underline,
			label: i18n.underline.value,
			command: () => editor.chain().focus().toggleUnderline().run(),
			isActive: editor.isActive("underline"),
		},
		{
			icon: Strikethrough,
			label: i18n.strikethrough.value,
			command: () => editor.chain().focus().toggleStrike().run(),
			isActive: editor.isActive("strike"),
		},
	];

	const codeLinkActions: Array<ActionConfig> = [
		{
			icon: Code,
			label: i18n.code.value,
			command: () => editor.chain().focus().toggleCode().run(),
			isActive: editor.isActive("code"),
		},
		{
			icon: Link2,
			label: i18n.link.value,
			command: () => {
				if (editor.isActive("link")) {
					editor.chain().focus().unsetLink().run();
					return;
				}
				// Pre-populate with the existing href when editing a link
				const existing = editor.getAttributes("link").href as string | undefined;
				const url = window.prompt(i18n.enterUrl.value, existing ?? "");
				if (url && isAllowedLinkUrl(url)) {
					editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
				}
			},
			isActive: editor.isActive("link"),
		},
	];

	const blockActions: Array<ActionConfig> = [
		{
			icon: Quote,
			label: i18n.blockquote.value,
			command: () => editor.chain().focus().toggleBlockquote().run(),
			isActive: editor.isActive("blockquote"),
		},
	];

	/** Returns the icon for the currently active heading level. */
	function getActiveHeadingIcon(): typeof Heading1 {
		if (activeEditor.isActive("heading", { level: 1 })) {
			return Heading1;
		}
		if (activeEditor.isActive("heading", { level: 2 })) {
			return Heading2;
		}
		if (activeEditor.isActive("heading", { level: 3 })) {
			return Heading3;
		}
		if (activeEditor.isActive("heading", { level: 4 })) {
			return Heading4;
		}
		return Pilcrow;
	}

	function renderHeadingDropdown(): ReactElement {
		const HeadingIcon = getActiveHeadingIcon();
		const isHeadingActive = activeEditor.isActive("heading");

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						title={i18n.heading.value}
						aria-label={i18n.heading.value}
						onMouseDown={e => e.preventDefault()}
						className={cn(
							"inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
							isHeadingActive
								? "bg-primary text-primary-foreground"
								: "text-foreground/80 hover:bg-accent hover:text-foreground",
						)}
					>
						<HeadingIcon className="h-3.5 w-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center">
					{headingOptions.map(opt => {
						const ItemIcon = opt.icon;
						const isActive =
							opt.level !== null
								? activeEditor.isActive("heading", { level: opt.level })
								: !activeEditor.isActive("heading");
						return (
							<DropdownMenuItem
								key={opt.label}
								onSelect={() => {
									if (opt.level !== null) {
										activeEditor.chain().focus().toggleHeading({ level: opt.level }).run();
									} else {
										activeEditor.chain().focus().setParagraph().run();
									}
								}}
								className={isActive ? "bg-accent font-medium" : ""}
							>
								<ItemIcon className="h-4 w-4 mr-2" />
								{opt.label}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div
			ref={toolbarRef}
			className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
			style={{ top: position.top, left: position.left }}
			// Prevent toolbar interaction from stealing focus
			onMouseDown={e => e.preventDefault()}
			data-testid="floating-toolbar"
		>
			<div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-0.5 shadow-lg">
				{renderHeadingDropdown()}
				<Separator orientation="vertical" className="h-5 mx-0.5" />
				{formattingActions.map(renderActionButton)}
				<Separator orientation="vertical" className="h-5 mx-0.5" />
				{codeLinkActions.map(renderActionButton)}
				<Separator orientation="vertical" className="h-5 mx-0.5" />
				{blockActions.map(renderActionButton)}
			</div>
		</div>
	);
}
