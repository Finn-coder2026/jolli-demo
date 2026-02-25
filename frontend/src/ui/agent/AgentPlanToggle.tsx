import { cn } from "../../common/ClassNameUtils";
import { AgentPlanBadge } from "./AgentPlanBadge";
import type { AgentHubMode, AgentPlanPhase } from "jolli-common";
import { ListChecks } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentPlanToggleProps {
	/** Current conversation mode */
	readonly mode: AgentHubMode;
	/** Current plan phase, if any */
	readonly planPhase: AgentPlanPhase | undefined;
	/** Called when the user toggles the mode */
	readonly onSetMode: (mode: AgentHubMode) => void;
	/** Called when the user clicks the plan phase badge */
	readonly onOpenPlan: () => void;
}

/**
 * Plan on/off toggle button that sits in the input toolbar.
 * When on (plan mode), the button is highlighted in yellow.
 * When off (exec mode), the button appears muted.
 * A clickable plan phase badge appears next to the button when a plan phase is active.
 */
export function AgentPlanToggle({ mode, planPhase, onSetMode, onOpenPlan }: AgentPlanToggleProps): ReactElement {
	const content = useIntlayer("agent-page");
	const isPlan = mode === "plan";

	function handleClick() {
		onSetMode(isPlan ? "exec" : "plan");
	}

	return (
		<div className="flex items-center gap-2" data-testid="agent-plan-toggle">
			<button
				type="button"
				onClick={handleClick}
				aria-pressed={isPlan}
				className={cn(
					"inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
					isPlan
						? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
						: "text-muted-foreground hover:bg-muted",
				)}
				data-testid="plan-mode-toggle"
			>
				<ListChecks className="h-3.5 w-3.5" />
				{content.modePlan}
			</button>

			{planPhase && (
				<button
					type="button"
					onClick={onOpenPlan}
					className="transition-opacity hover:opacity-80"
					data-testid="mode-plan-badge-button"
					aria-label={content.viewPlan.value}
				>
					<AgentPlanBadge phase={planPhase} />
				</button>
			)}
		</div>
	);
}
