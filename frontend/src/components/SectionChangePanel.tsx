import { cn } from "../common/ClassNameUtils";
import styles from "./SectionChangePanel.module.css";
import { Button } from "./ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/Tabs";
import type { DocDraftSectionChanges } from "jolli-common";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

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
 * Panel displaying section changes with apply and close actions.
 * Shows tabs when multiple changes are present.
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
	const [activeTab, setActiveTab] = useState(changes[0]?.id.toString() || "0");

	// Handle Escape key to close
	useEffect(() => {
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

	// Get change type label for display
	function getChangeTypeLabel(changeType: string): string {
		switch (changeType) {
			case "update":
				return "Update";
			case "delete":
				return "Delete";
			case "insert-after":
				return "Insert After";
			case "insert-before":
				return "Insert Before";
			default:
				return "Change";
		}
	}

	return (
		<div ref={panelRef} className={cn(styles.panel, className)} data-testid="section-change-panel">
			<div className={styles.header}>
				<div className={styles.iconContainer}>
					{/* AI/ChatGPT icon - using a simple robot emoji for now */}
					<span className={styles.icon} aria-label="AI Agent">
						🤖
					</span>
					<span className={styles.title}>Agent Suggestion</span>
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

			<div className={styles.content}>
				{changes.length === 1 ? (
					// Single change - no tabs needed
					<>
						<p className={styles.description}>
							{changes[0].proposed[0]?.description || "No description available"}
						</p>
						<div className={styles.footer}>
							<Button onClick={() => onApply(changes[0].id)} size="sm" data-testid="apply-button">
								Apply
							</Button>
							<Button
								onClick={() => onDismiss(changes[0].id)}
								size="sm"
								variant="outline"
								data-testid="dismiss-button"
							>
								Dismiss
							</Button>
						</div>
					</>
				) : (
					// Multiple changes - use tabs
					<Tabs value={activeTab} onValueChange={setActiveTab}>
						<TabsList className={styles.tabsList}>
							{changes.map((change, index) => (
								<TabsTrigger
									key={change.id}
									value={change.id.toString()}
									data-testid={`change-tab-${index}`}
								>
									{getChangeTypeLabel(change.changeType)} {index + 1}
								</TabsTrigger>
							))}
						</TabsList>

						{changes.map(change => (
							<TabsContent key={change.id} value={change.id.toString()}>
								<p className={styles.description}>
									{change.proposed[0]?.description || "No description available"}
								</p>
								<div className={styles.footer}>
									<Button onClick={() => onApply(change.id)} size="sm" data-testid="apply-button">
										Apply
									</Button>
									<Button
										onClick={() => onDismiss(change.id)}
										size="sm"
										variant="outline"
										data-testid="dismiss-button"
									>
										Dismiss
									</Button>
								</div>
							</TabsContent>
						))}
					</Tabs>
				)}
			</div>
		</div>
	);
}
