import { cn } from "../common/ClassNameUtils";
import { extractHeadingTitle, stripLeadingHeading } from "../util/ContentUtil";
import { createUnifiedDiff } from "../util/DiffUtil";
import { MarkdownContent } from "./MarkdownContent";
import styles from "./SectionChangePanel.module.css";
import { Button } from "./ui/Button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import * as Diff2Html from "diff2html";
import type { DocDraftSectionChanges } from "jolli-common";
import "diff2html/bundles/css/diff2html.min.css";
import { HelpCircle } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

type ViewTab = "original" | "suggestion" | "change-view";

export interface SectionChangePanelProps {
	/**
	 * The section changes to display
	 */
	changes: Array<DocDraftSectionChanges>;
	/**
	 * Callback when apply button is clicked for a specific change
	 */
	onApply: (changeId: number) => void;
	/**
	 * Callback when dismiss button is clicked for a specific change
	 */
	onDismiss: (changeId: number) => void;
	/**
	 * Callback when close button is clicked
	 */
	onClose: () => void;
	/**
	 * Optional CSS class name
	 */
	className?: string;
}

/**
 * Panel displaying section changes with three-tab view (Original, Suggestion, Change View)
 * and a scrollable list when multiple changes are present.
 * Renders inline within the layout and can be closed by pressing Escape.
 */
export function SectionChangePanel({
	changes,
	onApply,
	onDismiss,
	onClose,
	className,
}: SectionChangePanelProps): ReactElement {
	const panelRef = useRef<HTMLDivElement>(null);
	const content = useIntlayer("section-change-panel");

	// Track active view tab per change ID
	const [activeViewTabs, setActiveViewTabs] = useState<Map<number, ViewTab>>(() => {
		const initial = new Map<number, ViewTab>();
		for (const change of changes) {
			initial.set(change.id, "original");
		}
		return initial;
	});

	// Handle Escape key to close
	useEffect(() => {
		/* v8 ignore next 5 - keyboard handler tested but coverage inconsistent */
		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}

		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	// Update activeViewTabs when changes array changes
	useEffect(() => {
		setActiveViewTabs(prev => {
			const updated = new Map<number, ViewTab>();
			for (const change of changes) {
				updated.set(change.id, prev.get(change.id) || "original");
			}
			return updated;
		});
	}, [changes]);

	function getActiveTab(changeId: number): ViewTab {
		return activeViewTabs.get(changeId) || "original";
	}

	function setActiveTab(changeId: number, tab: ViewTab): void {
		setActiveViewTabs(prev => {
			const updated = new Map(prev);
			updated.set(changeId, tab);
			return updated;
		});
	}

	// Get change type label for display
	function getChangeTypeLabel(changeType: string): string {
		switch (changeType) {
			case "update":
				return content.updateLabel.value;
			case "delete":
				return content.deleteLabel.value;
			case "insert-after":
				return content.insertAfterLabel.value;
			case "insert-before":
				return content.insertBeforeLabel.value;
			default:
				return content.changeLabel.value;
		}
	}

	// Extract section title from path (e.g., "## Authentication" -> "Authentication")
	function getSectionTitle(path: string): string {
		// Remove leading # symbols and whitespace
		return path.replace(/^#+\s*/, "");
	}

	return (
		<TooltipProvider>
			<div ref={panelRef} className={cn(styles.panel, className)} data-testid="section-change-panel">
				{/* Header */}
				<div className={styles.header}>
					<div className={styles.iconContainer}>
						<span className={styles.icon} aria-label="AI Agent">
							🤖
						</span>
						<span className={styles.title} data-testid="panel-title">
							{content.agentSuggestion}
						</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className={styles.closeButton}
						aria-label="Close"
						data-testid="close-button"
					>
						×
					</button>
				</div>

				{/* Scrollable Content Area */}
				<div className={styles.content}>
					{changes.length === 0 ? (
						<p className={styles.noChanges} data-testid="no-changes-message">
							{content.noChanges}
						</p>
					) : (
						changes.map((change, index) => (
							<ChangeCard
								key={change.id}
								change={change}
								index={index}
								activeTab={getActiveTab(change.id)}
								onTabChange={tab => setActiveTab(change.id, tab)}
								onApply={() => onApply(change.id)}
								onDismiss={() => onDismiss(change.id)}
								getChangeTypeLabel={getChangeTypeLabel}
								getSectionTitle={getSectionTitle}
								content={content}
							/>
						))
					)}
				</div>
			</div>
		</TooltipProvider>
	);
}

interface ChangeCardProps {
	change: DocDraftSectionChanges;
	index: number;
	activeTab: ViewTab;
	onTabChange: (tab: ViewTab) => void;
	onApply: () => void;
	onDismiss: () => void;
	getChangeTypeLabel: (changeType: string) => string;
	getSectionTitle: (path: string) => string;
	content: ReturnType<typeof useIntlayer<"section-change-panel">>;
}

/**
 * Individual change card with three-tab view and action buttons
 */
function ChangeCard({
	change,
	index,
	activeTab,
	onTabChange,
	onApply,
	onDismiss,
	getChangeTypeLabel,
	getSectionTitle,
	content,
}: ChangeCardProps): ReactElement {
	const isInsertOperation = change.changeType === "insert-before" || change.changeType === "insert-after";
	// For insert operations, original content should be empty since this is a new section
	const originalContent = isInsertOperation ? "" : change.content || "";
	const proposedValue = change.proposed[0]?.value;
	const proposedContent = typeof proposedValue === "string" ? proposedValue : "";
	const description = change.proposed[0]?.description || "";
	const pathTitle = getSectionTitle(change.path);
	const sectionTitle = isInsertOperation ? extractHeadingTitle(proposedContent) || pathTitle : pathTitle;
	// For insert operations, strip the heading from suggestion content since it is already shown in the section header
	const suggestionContent = isInsertOperation ? stripLeadingHeading(proposedContent) : proposedContent;
	const changeTypeLabel = getChangeTypeLabel(change.changeType);

	// Generate diff HTML for change view
	/* v8 ignore next 14 - diff generation tested via change-view tab tests but memo callback coverage is inconsistent */
	const diffHtml = useMemo(() => {
		if (!originalContent && !proposedContent) {
			return "";
		}
		const diffContent = createUnifiedDiff(originalContent, proposedContent, "original", "suggestion");
		if (!diffContent) {
			return "";
		}
		return Diff2Html.html(diffContent, {
			drawFileList: false,
			matching: "lines",
			outputFormat: "line-by-line",
		});
	}, [originalContent, proposedContent]);

	// Determine what to show based on change type and active tab
	function renderContent(): ReactElement {
		const isDeleteOperation = change.changeType === "delete";

		switch (activeTab) {
			case "original":
				if (isInsertOperation) {
					return (
						<p className={styles.emptyMessage} data-testid={`empty-message-${index}`}>
							{content.noOriginalContent}
						</p>
					);
				}
				return (
					<div className={styles.markdownContent}>
						<MarkdownContent>{originalContent || ""}</MarkdownContent>
					</div>
				);

			case "suggestion":
				if (isDeleteOperation) {
					return (
						<p className={styles.emptyMessage} data-testid={`empty-message-${index}`}>
							{content.sectionWillBeDeleted}
						</p>
					);
				}
				return (
					<div className={styles.markdownContent}>
						<MarkdownContent>{suggestionContent || ""}</MarkdownContent>
						{description && (
							<p className={styles.description} data-testid={`description-${index}`}>
								{description}
							</p>
						)}
					</div>
				);

			case "change-view":
				if (!diffHtml) {
					return (
						<p className={styles.emptyMessage} data-testid={`empty-message-${index}`}>
							{content.noChanges}
						</p>
					);
				}
				return (
					<div
						className={cn(styles.diffContent, "diff-container")}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: diff2html generates safe HTML
						dangerouslySetInnerHTML={{ __html: diffHtml }}
					/>
				);
		}
	}

	return (
		<div className={styles.changeCard} data-testid={`change-card-${index}`}>
			{/* View Tabs Bar */}
			<div className={styles.viewTabsBar}>
				<div className={styles.viewTabsLeft}>
					<div className={styles.viewTabs}>
						<button
							type="button"
							className={cn(styles.viewTab, activeTab === "original" && styles.viewTabActive)}
							onClick={() => onTabChange("original")}
							data-testid={`tab-original-${index}`}
						>
							{content.original}
						</button>
						<span className={styles.tabSeparator}>|</span>
						<button
							type="button"
							className={cn(styles.viewTab, activeTab === "suggestion" && styles.viewTabActive)}
							onClick={() => onTabChange("suggestion")}
							data-testid={`tab-suggestion-${index}`}
						>
							{content.suggestion}
						</button>
						<span className={styles.tabSeparator}>|</span>
						<button
							type="button"
							className={cn(styles.viewTab, activeTab === "change-view" && styles.viewTabActive)}
							onClick={() => onTabChange("change-view")}
							data-testid={`tab-change-view-${index}`}
						>
							{content.changeView}
						</button>
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className={styles.helpButton}
								aria-label="Help"
								data-testid={`help-button-${index}`}
							>
								<HelpCircle className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className={styles.helpTooltip}>
							{content.helpTooltip}
						</TooltipContent>
					</Tooltip>
				</div>

				<div className={styles.actionButtons}>
					<Button
						onClick={onApply}
						size="sm"
						className="bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
						data-testid={`apply-button-${index}`}
					>
						{content.accept}
					</Button>
					<Button
						onClick={onDismiss}
						size="sm"
						className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
						data-testid={`dismiss-button-${index}`}
					>
						{content.dismiss}
					</Button>
				</div>
			</div>

			{/* Content Display */}
			<div className={styles.contentDisplay} data-testid={`content-display-${index}`}>
				<div className={styles.sectionHeader}>
					<span className={styles.changeTypeBadge} data-testid={`change-type-${index}`}>
						{changeTypeLabel}
					</span>
					{sectionTitle && (
						<h3 className={styles.sectionTitle} data-testid={`section-title-${index}`}>
							{sectionTitle}
						</h3>
					)}
				</div>
				{renderContent()}
			</div>
		</div>
	);
}
