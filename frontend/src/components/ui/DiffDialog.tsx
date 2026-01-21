import { cn } from "../../common/ClassNameUtils";
import { Button } from "./Button";
import * as Diff2Html from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";
import { FileText, X } from "lucide-react";
import { type ReactElement, useMemo } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Size presets for the dialog (width x height as viewport percentage)
 */
export type DiffDialogSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeMap: Record<DiffDialogSize, { width: string; height: string }> = {
	sm: { width: "w-[50vw]", height: "h-[50vh]" },
	md: { width: "w-[60vw]", height: "h-[60vh]" },
	lg: { width: "w-[70vw]", height: "h-[70vh]" },
	xl: { width: "w-[80vw]", height: "h-[80vh]" },
	full: { width: "w-[90vw]", height: "h-[90vh]" },
};

export interface DiffDialogProps {
	/**
	 * Whether the dialog is open
	 */
	isOpen: boolean;
	/**
	 * Title displayed in the top bar (e.g., "file_v1.txt vs file_v2.txt")
	 */
	title: string;
	/**
	 * The unified diff string to display
	 */
	diffContent: string;
	/**
	 * Size preset for the dialog
	 */
	size?: DiffDialogSize;
	/**
	 * Called when the confirm button is clicked
	 */
	onConfirm?: () => void;
	/**
	 * Called when the dialog is closed (cancel or X button)
	 */
	onClose: () => void;
	/**
	 * Whether to show the confirm button (default: true)
	 */
	showConfirm?: boolean;
	/**
	 * Output format for diff2html
	 */
	outputFormat?: "side-by-side" | "line-by-line";
}

export function DiffDialog({
	isOpen,
	title,
	diffContent,
	size = "lg",
	onConfirm,
	onClose,
	showConfirm = true,
	outputFormat = "side-by-side",
}: DiffDialogProps): ReactElement | null {
	const content = useIntlayer("diff-dialog");

	const diffHtml = useMemo(() => {
		if (!diffContent) {
			return "";
		}
		return Diff2Html.html(diffContent, {
			drawFileList: false,
			matching: "lines",
			outputFormat,
		});
	}, [diffContent, outputFormat]);

	if (!isOpen) {
		return null;
	}

	const { width, height } = sizeMap[size];

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
			onClick={e => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
			data-testid="diff-dialog"
		>
			<div className={cn("bg-card rounded-lg border shadow-lg flex flex-col", width, height)}>
				{/* Top Bar */}
				<div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-muted/30">
					<div className="flex items-center gap-2 text-sm font-medium truncate">
						<FileText className="h-4 w-4 text-muted-foreground shrink-0" />
						<span className="truncate" data-testid="diff-dialog-title">
							{title}
						</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						onClick={onClose}
						data-testid="diff-dialog-close"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Diff Content Area */}
				<div className="flex-1 overflow-auto p-4" data-testid="diff-dialog-content">
					{diffContent ? (
						<div
							className="diff-container text-sm [&_.d2h-file-header]:hidden [&_.d2h-file-name-wrapper]:invisible"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: diff2html generates safe HTML
							dangerouslySetInnerHTML={{ __html: diffHtml }}
						/>
					) : (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							{content.noDiff}
						</div>
					)}
				</div>

				{/* Bottom Button Area */}
				<div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0 bg-muted/30">
					<Button variant="outline" size="sm" onClick={onClose} data-testid="diff-dialog-cancel">
						{content.cancel}
					</Button>
					{showConfirm && (
						<Button size="sm" onClick={onConfirm} data-testid="diff-dialog-confirm">
							{content.confirm}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
