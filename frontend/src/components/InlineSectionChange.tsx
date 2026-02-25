import { cn } from "../common/ClassNameUtils";
import { extractHeadingTitle, stripLeadingHeading } from "../util/ContentUtil";
import type { DiffViewMode } from "./GitHubStyleDiff";
import { GitHubStyleDiff } from "./GitHubStyleDiff";
import styles from "./InlineSectionChange.module.css";
import { MarkdownContent } from "./MarkdownContent";
import { Button } from "./ui/Button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import type { DocDraftSectionChanges } from "jolli-common";
import { Columns2, HelpCircle, Rows3 } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

type ViewTab = "original" | "suggestion" | "change-view";

export interface InlineSectionChangeProps {
	/**
	 * The section change to display
	 */
	change: DocDraftSectionChanges;
	/**
	 * The section title to display (null for preamble sections)
	 */
	sectionTitle?: string | null;
	/**
	 * Callback when apply button is clicked
	 */
	onApply: (changeId: number) => void;
	/**
	 * Callback when dismiss button is clicked
	 */
	onDismiss: (changeId: number) => void;
	/**
	 * Optional CSS class name
	 */
	className?: string;
	/**
	 * Test ID prefix for testing
	 */
	testIdPrefix?: string;
}

/**
 * Inline section change component that displays a suggestion inline within the article content.
 * Shows a view toggle bar with Original, Suggestion, and Change View tabs,
 * along with Accept and Dismiss action buttons.
 */
export function InlineSectionChange({
	change,
	sectionTitle,
	onApply,
	onDismiss,
	className,
	testIdPrefix = "inline-change",
}: InlineSectionChangeProps): ReactElement {
	const content = useIntlayer("section-change-panel");
	const [activeTab, setActiveTab] = useState<ViewTab>("suggestion");
	const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("line-by-line");

	const isInsertOperation = change.changeType === "insert-before" || change.changeType === "insert-after";
	const isDeleteOperation = change.changeType === "delete";
	// For insert operations, original content should be empty since this is a new section
	// (change.content may contain the anchor section's content used for positioning)
	const originalContent = isInsertOperation ? "" : change.content || "";
	const proposedValue = change.proposed[0]?.value;
	const proposedContent = typeof proposedValue === "string" ? proposedValue : "";
	const description = change.proposed[0]?.description || "";
	const displayTitle = isInsertOperation ? extractHeadingTitle(proposedContent) || sectionTitle : sectionTitle;
	// For insert operations, strip the heading from suggestion content since it is already shown in the section header
	const suggestionContent = isInsertOperation ? stripLeadingHeading(proposedContent) : proposedContent;
	function renderContent(): ReactElement {
		switch (activeTab) {
			case "original":
				if (isInsertOperation) {
					return (
						<p className={styles.emptyMessage} data-testid={`${testIdPrefix}-empty-message`}>
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
						<p className={styles.emptyMessage} data-testid={`${testIdPrefix}-empty-message`}>
							{content.sectionWillBeDeleted}
						</p>
					);
				}
				return (
					<div className={styles.markdownContent}>
						<MarkdownContent>{suggestionContent || ""}</MarkdownContent>
						{description && (
							<p className={styles.description} data-testid={`${testIdPrefix}-description`}>
								{description}
							</p>
						)}
					</div>
				);

			case "change-view":
				return (
					<GitHubStyleDiff
						oldContent={originalContent}
						newContent={proposedContent}
						className={styles.diffContent}
						testId={`${testIdPrefix}-diff`}
						viewMode={diffViewMode}
					/>
				);
		}
	}

	return (
		<TooltipProvider>
			<div className={cn(styles.inlineChange, className)} data-testid={`${testIdPrefix}-${change.id}`}>
				{/* View Tabs Bar */}
				<div className={styles.viewTabsBar}>
					<div className={styles.viewTabsLeft}>
						<div className={styles.viewTabs}>
							<button
								type="button"
								className={cn(styles.viewTab, activeTab === "original" && styles.viewTabActive)}
								onClick={() => setActiveTab("original")}
								data-testid={`${testIdPrefix}-tab-original`}
							>
								{content.original}
							</button>
							<span className={styles.tabSeparator}>|</span>
							<button
								type="button"
								className={cn(styles.viewTab, activeTab === "suggestion" && styles.viewTabActive)}
								onClick={() => setActiveTab("suggestion")}
								data-testid={`${testIdPrefix}-tab-suggestion`}
							>
								{content.suggestion}
							</button>
							<span className={styles.tabSeparator}>|</span>
							<button
								type="button"
								className={cn(styles.viewTab, activeTab === "change-view" && styles.viewTabActive)}
								onClick={() => setActiveTab("change-view")}
								data-testid={`${testIdPrefix}-tab-change-view`}
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
									data-testid={`${testIdPrefix}-help-button`}
								>
									<HelpCircle className="h-4 w-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className={styles.helpTooltip}>
								{content.helpTooltip}
							</TooltipContent>
						</Tooltip>
						{activeTab === "change-view" && (
							<div className={styles.diffModeToggle} data-testid={`${testIdPrefix}-diff-mode-toggle`}>
								<button
									type="button"
									className={cn(
										styles.diffModeButton,
										diffViewMode === "line-by-line" && styles.diffModeButtonActive,
									)}
									onClick={() => setDiffViewMode("line-by-line")}
									data-testid={`${testIdPrefix}-diff-mode-unified`}
								>
									<Rows3 className="h-3.5 w-3.5" />
									<span>{content.lineByLine}</span>
								</button>
								<button
									type="button"
									className={cn(
										styles.diffModeButton,
										diffViewMode === "side-by-side" && styles.diffModeButtonActive,
									)}
									onClick={() => setDiffViewMode("side-by-side")}
									data-testid={`${testIdPrefix}-diff-mode-split`}
								>
									<Columns2 className="h-3.5 w-3.5" />
									<span>{content.sideBySide}</span>
								</button>
							</div>
						)}
					</div>

					<div className={styles.actionButtons}>
						<Button
							onClick={() => onApply(change.id)}
							size="sm"
							className="bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
							data-testid={`${testIdPrefix}-apply-button`}
						>
							{content.accept}
						</Button>
						<Button
							onClick={() => onDismiss(change.id)}
							size="sm"
							className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
							data-testid={`${testIdPrefix}-dismiss-button`}
						>
							{content.dismiss}
						</Button>
					</div>
				</div>

				{/* Content Display */}
				<div className={styles.contentDisplay}>
					{displayTitle && (
						<div className={styles.sectionHeader}>
							<h3 className={styles.sectionTitle} data-testid={`${testIdPrefix}-section-title`}>
								{displayTitle}
							</h3>
						</div>
					)}
					{renderContent()}
				</div>
			</div>
		</TooltipProvider>
	);
}
