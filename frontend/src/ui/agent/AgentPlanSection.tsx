import { MarkdownContent } from "../../components/MarkdownContent";
import { AgentPlanBadge } from "./AgentPlanBadge";
import type { AgentPlanPhase } from "jolli-common";
import { ChevronDown, ChevronUp, ClipboardList, Maximize2 } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentPlanSectionProps {
	/** The current plan phase */
	readonly phase: AgentPlanPhase | undefined;
	/** The plan markdown content */
	readonly plan: string | undefined;
	/** Called when the user clicks the maximize button to open the plan dialog */
	readonly onOpenPlan: () => void;
}

/**
 * Sidebar section that shows an expandable plan accordion.
 * Returns null when no plan phase exists.
 */
export function AgentPlanSection({ phase, plan, onOpenPlan }: AgentPlanSectionProps): ReactElement | null {
	const content = useIntlayer("agent-page");
	const [expanded, setExpanded] = useState(false);
	const prevPhaseRef = useRef<AgentPlanPhase | undefined>(undefined);

	// Auto-expand when phase transitions from undefined to defined
	useEffect(() => {
		if (phase && !prevPhaseRef.current) {
			setExpanded(true);
		}
		prevPhaseRef.current = phase;
	}, [phase]);

	if (!phase) {
		return null;
	}

	const ChevronIcon = expanded ? ChevronDown : ChevronUp;

	return (
		<div className="shrink-0 border-t border-border" data-testid="plan-section">
			{/* Header */}
			<div className="flex items-center px-3 py-2">
				<button
					type="button"
					onClick={() => setExpanded(prev => !prev)}
					className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					data-testid="plan-toggle-button"
					aria-label={expanded ? content.collapsePlan.value : content.expandPlan.value}
				>
					<ClipboardList className="h-4 w-4 shrink-0" />
					<span className="flex-1 text-left">{content.agentPlan}</span>
					<AgentPlanBadge phase={phase} />
					<ChevronIcon className="h-4 w-4 shrink-0" />
				</button>
				{expanded && (
					<button
						type="button"
						onClick={onOpenPlan}
						className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
						data-testid="plan-maximize-button"
						aria-label={content.maximizePlan.value}
					>
						<Maximize2 className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			{/* Expandable plan content */}
			{expanded && (
				<div
					className="overflow-y-auto scrollbar-thin px-4 pb-3 max-h-[40vh] agent-plan-content-enter"
					data-testid="plan-inline-content"
				>
					{plan ? (
						<div className="prose prose-sm dark:prose-invert max-w-none">
							<MarkdownContent>{plan}</MarkdownContent>
						</div>
					) : (
						<p className="text-sm text-muted-foreground italic" data-testid="plan-inline-empty">
							{content.planEmpty}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
